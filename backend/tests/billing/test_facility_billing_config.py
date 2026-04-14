"""
Tests for FacilityBillingConfig model, serializer, views, and admin.

Covers:
- Model creation and computed properties
- SHA accreditation / contract lifecycle
- Fee schedule overrides
- API CRUD endpoints
- SHA contract tracking endpoint
- Facility-scoped daily collection report
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.test import override_settings
from rest_framework import status

from hmis.apps.billing.models import FacilityBillingConfig, Invoice
from hmis.apps.core.models import County, Facility, Organization, SubCounty

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def org(db):
    """Organization for testing."""
    return Organization.objects.create(
        name="Test Health Group",
        slug="test-health-group",
        contact_email="admin@test.co.ke",
    )


@pytest.fixture
def county(db):
    return County.objects.create(code=100, name="Kisumu")


@pytest.fixture
def sub_county(db, county):
    return SubCounty.objects.create(county=county, name="Kisumu Central")


@pytest.fixture
def facility(db, org, county, sub_county):
    """Primary facility."""
    return Facility.objects.create(
        organization=org,
        mfl_code="FC-001",
        name="Test Clinic - Main",
        level="4",
        ownership="PRIVATE",
        county=county,
        sub_county=sub_county,
        sha_contracted=True,
    )


@pytest.fixture
def second_facility(db, org, county, sub_county):
    """Second facility in same org."""
    return Facility.objects.create(
        organization=org,
        mfl_code="FC-002",
        name="Test Clinic - Branch",
        level="2",
        ownership="PRIVATE",
        county=county,
        sub_county=sub_county,
    )


@pytest.fixture
def billing_config(db, facility):
    """FacilityBillingConfig for the primary facility."""
    return FacilityBillingConfig.objects.create(
        facility=facility,
        default_payment_type=Invoice.PaymentType.INSURANCE,
        default_due_days=14,
        sha_accreditation_status=FacilityBillingConfig.SHAAccreditationStatus.ACCREDITED,
        sha_accreditation_date=date(2025, 1, 1),
        sha_accreditation_expiry=date.today() + timedelta(days=180),
        sha_contract_number="SHA-CTR-2025-001",
        sha_contract_start=date(2025, 1, 1),
        sha_contract_end=date.today() + timedelta(days=365),
        sha_service_level="Comprehensive",
        sha_max_claim_amount=Decimal("500000.00"),
        mpesa_paybill="174379",
        bank_name="KCB Bank",
        bank_account_number="1234567890",
    )


@pytest.fixture
def second_config(db, second_facility):
    """Config for second facility, not SHA accredited."""
    return FacilityBillingConfig.objects.create(
        facility=second_facility,
        default_payment_type=Invoice.PaymentType.CASH,
        sha_accreditation_status=FacilityBillingConfig.SHAAccreditationStatus.NOT_APPLIED,
    )


# ============================================================================
# Model Tests
# ============================================================================


class TestFacilityBillingConfigModel:
    """Tests for FacilityBillingConfig model."""

    def test_create_config(self, billing_config, facility):
        """Should create config linked to facility."""
        assert billing_config.facility == facility
        assert billing_config.default_payment_type == "insurance"
        assert billing_config.default_due_days == 14

    def test_str_representation(self, billing_config):
        """Should include facility name in str."""
        assert "Test Clinic - Main" in str(billing_config)

    def test_one_to_one_constraint(self, billing_config, facility):
        """Should not allow two configs for the same facility."""
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            FacilityBillingConfig.objects.create(facility=facility)

    def test_is_sha_accredited_true(self, billing_config):
        """Should return True when accredited and not expired."""
        assert billing_config.is_sha_accredited is True

    def test_is_sha_accredited_false_when_expired(self, billing_config):
        """Should return False when accreditation has expired."""
        billing_config.sha_accreditation_expiry = date.today() - timedelta(days=1)
        billing_config.save()
        assert billing_config.is_sha_accredited is False

    def test_is_sha_accredited_false_when_not_accredited(self, second_config):
        """Should return False when status is not 'accredited'."""
        assert second_config.is_sha_accredited is False

    def test_is_sha_contract_active(self, billing_config):
        """Should return True for active contract."""
        assert billing_config.is_sha_contract_active is True

    def test_is_sha_contract_active_false_when_expired(self, billing_config):
        """Should return False when contract has ended."""
        billing_config.sha_contract_end = date.today() - timedelta(days=1)
        billing_config.save()
        assert billing_config.is_sha_contract_active is False

    def test_is_sha_contract_active_false_when_no_start(self, second_config):
        """Should return False when no contract start date."""
        assert second_config.is_sha_contract_active is False

    def test_sha_accreditation_days_remaining(self, billing_config):
        """Should return positive days until expiry."""
        days = billing_config.sha_accreditation_days_remaining
        assert days is not None
        assert days > 0

    def test_sha_contract_days_remaining(self, billing_config):
        """Should return positive days until contract end."""
        days = billing_config.sha_contract_days_remaining
        assert days is not None
        assert days > 0

    def test_days_remaining_none_when_no_expiry(self, second_config):
        """Should return None when no expiry date set."""
        assert second_config.sha_accreditation_days_remaining is None
        assert second_config.sha_contract_days_remaining is None

    def test_get_service_price_override(self, billing_config):
        """Should return overridden price for a service code."""
        billing_config.fee_schedule_override = {"CBC": "600.00"}
        billing_config.save()
        assert billing_config.get_service_price("CBC") == Decimal("600.00")

    def test_get_service_price_no_override(self, billing_config):
        """Should return None when no override exists."""
        assert billing_config.get_service_price("NONEXISTENT") is None

    def test_default_values(self, facility):
        """Should have sensible defaults when created with minimal fields."""
        config = FacilityBillingConfig.objects.create(facility=facility)
        assert config.default_payment_type == "cash"
        assert config.default_due_days == 30
        assert config.auto_finalize_on_checkout is False
        assert config.tax_rate == Decimal("0.00")
        assert config.sha_accreditation_status == "not_applied"
        assert config.fee_schedule_override == {}


# ============================================================================
# API Tests
# ============================================================================


class TestFacilityBillingConfigAPI:
    """Tests for FacilityBillingConfig API endpoints."""

    def test_list_configs(self, authenticated_client, billing_config, second_config):
        """Should list all facility billing configs."""
        response = authenticated_client.get("/api/billing/facility-configs/")
        assert response.status_code == status.HTTP_200_OK
        # May be paginated or direct list
        results = response.data.get("results", response.data)
        assert len(results) >= 2

    def test_retrieve_config(self, authenticated_client, billing_config):
        """Should return config with computed fields."""
        response = authenticated_client.get(
            f"/api/billing/facility-configs/{billing_config.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["facility_name"] == "Test Clinic - Main"
        assert data["facility_mfl_code"] == "FC-001"
        assert data["is_sha_accredited"] is True
        assert data["is_sha_contract_active"] is True
        assert data["sha_accreditation_days_remaining"] is not None
        assert data["sha_contract_days_remaining"] is not None

    def test_create_config(self, authenticated_client, second_facility):
        """Should create a new billing config."""
        response = authenticated_client.post(
            "/api/billing/facility-configs/",
            {
                "facility": second_facility.id,
                "default_payment_type": "mpesa",
                "default_due_days": 7,
                "sha_accreditation_status": "pending",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert FacilityBillingConfig.objects.filter(facility=second_facility).exists()

    def test_update_config(self, authenticated_client, billing_config):
        """Should update config fields."""
        response = authenticated_client.patch(
            f"/api/billing/facility-configs/{billing_config.id}/",
            {"default_due_days": 60, "auto_finalize_on_checkout": True},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        billing_config.refresh_from_db()
        assert billing_config.default_due_days == 60
        assert billing_config.auto_finalize_on_checkout is True

    def test_unauthenticated_rejected(self, api_client, billing_config):
        """Should reject unauthenticated access."""
        response = api_client.get("/api/billing/facility-configs/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# SHA Contract Tracking Tests
# ============================================================================


class TestSHAContractTracking:
    """Tests for SHA contract tracking endpoint."""

    def test_sha_contracts_endpoint(self, authenticated_client, billing_config):
        """Should return SHA-related facility configs."""
        response = authenticated_client.get(
            "/api/billing/facility-configs/sha-contracts/"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert len(data) >= 1
        assert data[0]["facility_name"] == "Test Clinic - Main"
        assert data[0]["sha_accreditation_status"] == "accredited"
        assert data[0]["is_sha_accredited"] is True
        assert data[0]["sha_contract_number"] == "SHA-CTR-2025-001"

    def test_sha_contracts_excludes_not_applied(
        self, authenticated_client, billing_config, second_config
    ):
        """Should exclude facilities that haven't applied for SHA."""
        response = authenticated_client.get(
            "/api/billing/facility-configs/sha-contracts/"
        )
        assert response.status_code == status.HTTP_200_OK
        facility_names = [item["facility_name"] for item in response.data]
        assert "Test Clinic - Main" in facility_names
        assert "Test Clinic - Branch" not in facility_names

    def test_sha_contracts_filter_by_status(
        self, authenticated_client, billing_config
    ):
        """Should filter by accreditation status."""
        response = authenticated_client.get(
            "/api/billing/facility-configs/sha-contracts/?status=accredited"
        )
        assert response.status_code == status.HTTP_200_OK
        for item in response.data:
            assert item["sha_accreditation_status"] == "accredited"


# ============================================================================
# Facility-Scoped Report Tests
# ============================================================================


class TestFacilityScopedReports:
    """Tests for facility-scoped daily collection report."""

    def test_daily_collection_per_facility(
        self, authenticated_client, billing_config
    ):
        """Should return daily collection with facility context."""
        today = date.today().isoformat()
        response = authenticated_client.get(
            f"/api/billing/facility-configs/{billing_config.id}/daily-collection/?date={today}"
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert data["facility_name"] == "Test Clinic - Main"
        assert data["facility_mfl_code"] == "FC-001"
        assert "total_collections" in data
        assert "by_payment_method" in data

    def test_daily_collection_requires_date(
        self, authenticated_client, billing_config
    ):
        """Should return 400 when date parameter is missing."""
        response = authenticated_client.get(
            f"/api/billing/facility-configs/{billing_config.id}/daily-collection/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_daily_collection_invalid_date(
        self, authenticated_client, billing_config
    ):
        """Should return 400 for invalid date format."""
        response = authenticated_client.get(
            f"/api/billing/facility-configs/{billing_config.id}/daily-collection/?date=not-a-date"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

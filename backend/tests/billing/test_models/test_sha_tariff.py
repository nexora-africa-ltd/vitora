"""
Tests for SHATariff model.

Following TDD principles, these tests are written BEFORE the implementation.
They define the expected behavior of the SHATariff model for SHA (Social Health Authority)
claims integration as specified in Sprint 2.1-2.2 deliverables.

Test Coverage (18 tests):
- Test tariff creation with valid data
- Test tariff code uniqueness constraint
- Test SHA amount must be positive
- Test category choices validation
- Test facility level choices validation
- Test effective/expiry date validation
- Test max quantity minimum of 1
- Test is_valid_on_date() with active tariff
- Test is_valid_on_date() with future effective date
- Test is_valid_on_date() with expired tariff
- Test is_valid_on_date() with inactive tariff
- Test get_active_tariffs() returns only valid tariffs
- Test get_active_tariffs() with category filter
- Test get_active_tariffs() with facility level filter
- Test find_tariff_for_service() with direct mapping
- Test find_tariff_for_service() with SHA code fallback
- Test find_tariff_for_service() returns None when no match
- Test ICD-10 codes JSON field storage
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError


@pytest.mark.django_db
class TestSHATariffModel:
    """Tests for SHATariff model following Sprint 2.1-2.2 deliverables spec."""

    # =========================================================================
    # Test 1: Tariff creation with valid data
    # =========================================================================
    def test_create_tariff_with_valid_data(self):
        """Should create SHA tariff with valid data."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-CONS-001",
            name="General Consultation",
            description="Outpatient general consultation",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        assert tariff.id is not None
        assert tariff.code == "SHA-CONS-001"
        assert tariff.name == "General Consultation"
        assert tariff.sha_amount == Decimal("500.00")
        assert tariff.currency == "KES"  # Default
        assert tariff.is_active is True
        assert tariff.requires_preauthorization is False  # Default
        assert tariff.max_quantity_per_claim == 1  # Default
        assert tariff.waiting_period_days == 0  # Default

    # =========================================================================
    # Test 2: Tariff code uniqueness constraint
    # =========================================================================
    def test_tariff_code_uniqueness_constraint(self):
        """Should reject duplicate tariff codes."""
        from hmis.apps.billing.models import SHATariff

        # Create first tariff
        SHATariff.objects.create(
            code="SHA-LAB-001",
            name="Complete Blood Count",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("800.00"),
            effective_date=date.today(),
        )

        # Try to create tariff with same code
        with pytest.raises((IntegrityError, ValidationError)):
            SHATariff.objects.create(
                code="SHA-LAB-001",  # Duplicate code
                name="Different Test",
                category=SHATariff.TariffCategory.LABORATORY,
                facility_level=SHATariff.TariffLevel.LEVEL_4,
                sha_amount=Decimal("1000.00"),
                effective_date=date.today(),
            )

    # =========================================================================
    # Test 3: SHA amount must be positive
    # =========================================================================
    def test_sha_amount_must_be_positive(self):
        """Should reject zero or negative SHA amounts."""
        from hmis.apps.billing.models import SHATariff

        with pytest.raises(ValidationError) as exc_info:
            SHATariff.objects.create(
                code="SHA-CONS-002",
                name="Free Consultation",
                category=SHATariff.TariffCategory.CONSULTATION,
                facility_level=SHATariff.TariffLevel.LEVEL_2,
                sha_amount=Decimal("0.00"),  # Invalid - must be positive
                effective_date=date.today(),
            )

        assert "sha_amount" in str(exc_info.value)

    def test_sha_amount_negative_rejected(self):
        """Should reject negative SHA amounts."""
        from hmis.apps.billing.models import SHATariff

        with pytest.raises(ValidationError) as exc_info:
            SHATariff.objects.create(
                code="SHA-CONS-003",
                name="Negative Consultation",
                category=SHATariff.TariffCategory.CONSULTATION,
                facility_level=SHATariff.TariffLevel.LEVEL_2,
                sha_amount=Decimal("-100.00"),  # Invalid - negative
                effective_date=date.today(),
            )

        assert "sha_amount" in str(exc_info.value)

    # =========================================================================
    # Test 4: Category choices validation
    # =========================================================================
    def test_category_choices_validation(self):
        """Should accept valid category choices."""
        from hmis.apps.billing.models import SHATariff

        valid_categories = [
            SHATariff.TariffCategory.CONSULTATION,
            SHATariff.TariffCategory.LABORATORY,
            SHATariff.TariffCategory.RADIOLOGY,
            SHATariff.TariffCategory.PHARMACY,
            SHATariff.TariffCategory.PROCEDURE,
            SHATariff.TariffCategory.SURGERY,
            SHATariff.TariffCategory.INPATIENT,
            SHATariff.TariffCategory.MATERNITY,
            SHATariff.TariffCategory.DENTAL,
            SHATariff.TariffCategory.OPTICAL,
            SHATariff.TariffCategory.PHYSIOTHERAPY,
            SHATariff.TariffCategory.DIALYSIS,
            SHATariff.TariffCategory.ONCOLOGY,
            SHATariff.TariffCategory.OTHER,
        ]

        for i, category in enumerate(valid_categories):
            tariff = SHATariff.objects.create(
                code=f"SHA-CAT-{i:03d}",
                name=f"Test {category}",
                category=category,
                facility_level=SHATariff.TariffLevel.LEVEL_3,
                sha_amount=Decimal("100.00"),
                effective_date=date.today(),
            )
            assert tariff.category == category

    # =========================================================================
    # Test 5: Facility level choices validation
    # =========================================================================
    def test_facility_level_choices_validation(self):
        """Should accept valid facility level choices."""
        from hmis.apps.billing.models import SHATariff

        valid_levels = [
            SHATariff.TariffLevel.LEVEL_1,
            SHATariff.TariffLevel.LEVEL_2,
            SHATariff.TariffLevel.LEVEL_3,
            SHATariff.TariffLevel.LEVEL_4,
            SHATariff.TariffLevel.LEVEL_5,
            SHATariff.TariffLevel.LEVEL_6,
        ]

        for i, level in enumerate(valid_levels):
            tariff = SHATariff.objects.create(
                code=f"SHA-LVL-{i:03d}",
                name=f"Test Level {level}",
                category=SHATariff.TariffCategory.CONSULTATION,
                facility_level=level,
                sha_amount=Decimal("100.00"),
                effective_date=date.today(),
            )
            assert tariff.facility_level == level

    # =========================================================================
    # Test 6: Effective/expiry date validation
    # =========================================================================
    def test_expiry_date_must_be_after_effective_date(self):
        """Should reject expiry date before effective date."""
        from hmis.apps.billing.models import SHATariff

        with pytest.raises(ValidationError) as exc_info:
            SHATariff.objects.create(
                code="SHA-DATE-001",
                name="Invalid Date Range",
                category=SHATariff.TariffCategory.CONSULTATION,
                facility_level=SHATariff.TariffLevel.LEVEL_3,
                sha_amount=Decimal("500.00"),
                effective_date=date.today(),
                expiry_date=date.today() - timedelta(days=30),  # Before effective
            )

        assert "expiry_date" in str(exc_info.value)

    def test_valid_date_range_accepted(self):
        """Should accept valid effective/expiry date range."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-DATE-002",
            name="Valid Date Range",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            expiry_date=date.today() + timedelta(days=365),  # After effective
        )

        assert tariff.effective_date < tariff.expiry_date

    # =========================================================================
    # Test 7: Max quantity minimum of 1
    # =========================================================================
    def test_max_quantity_must_be_at_least_one(self):
        """Should reject max_quantity_per_claim less than 1."""
        from hmis.apps.billing.models import SHATariff

        with pytest.raises(ValidationError) as exc_info:
            SHATariff.objects.create(
                code="SHA-QTY-001",
                name="Zero Quantity",
                category=SHATariff.TariffCategory.PHARMACY,
                facility_level=SHATariff.TariffLevel.LEVEL_3,
                sha_amount=Decimal("100.00"),
                effective_date=date.today(),
                max_quantity_per_claim=0,  # Invalid - must be >= 1
            )

        assert "max_quantity_per_claim" in str(exc_info.value)

    def test_max_quantity_negative_rejected(self):
        """Should reject negative max_quantity_per_claim."""
        from hmis.apps.billing.models import SHATariff

        with pytest.raises(ValidationError) as exc_info:
            SHATariff.objects.create(
                code="SHA-QTY-002",
                name="Negative Quantity",
                category=SHATariff.TariffCategory.PHARMACY,
                facility_level=SHATariff.TariffLevel.LEVEL_3,
                sha_amount=Decimal("100.00"),
                effective_date=date.today(),
                max_quantity_per_claim=-5,  # Invalid - negative
            )

        assert "max_quantity_per_claim" in str(exc_info.value)


@pytest.mark.django_db
class TestSHATariffIsValidOnDate:
    """Tests for SHATariff.is_valid_on_date() method."""

    # =========================================================================
    # Test 8: is_valid_on_date() with active tariff
    # =========================================================================
    def test_is_valid_on_date_with_active_tariff(self):
        """Should return True for active tariff within date range."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-VALID-001",
            name="Active Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            expiry_date=date.today() + timedelta(days=30),
            is_active=True,
        )

        assert tariff.is_valid_on_date() is True
        assert tariff.is_valid_on_date(date.today()) is True

    def test_is_valid_on_date_with_no_expiry(self):
        """Should return True for tariff with no expiry date."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-VALID-002",
            name="No Expiry Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            expiry_date=None,  # No expiry
            is_active=True,
        )

        assert tariff.is_valid_on_date() is True

    # =========================================================================
    # Test 9: is_valid_on_date() with future effective date
    # =========================================================================
    def test_is_valid_on_date_with_future_effective_date(self):
        """Should return False for tariff not yet effective."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-FUTURE-001",
            name="Future Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() + timedelta(days=30),  # Future
            is_active=True,
        )

        assert tariff.is_valid_on_date() is False
        assert tariff.is_valid_on_date(date.today()) is False

    def test_is_valid_on_date_on_effective_date(self):
        """Should return True on the exact effective date."""
        from hmis.apps.billing.models import SHATariff

        effective = date.today()
        tariff = SHATariff.objects.create(
            code="SHA-EXACT-001",
            name="Effective Today",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=effective,
            is_active=True,
        )

        assert tariff.is_valid_on_date(effective) is True

    # =========================================================================
    # Test 10: is_valid_on_date() with expired tariff
    # =========================================================================
    def test_is_valid_on_date_with_expired_tariff(self):
        """Should return False for expired tariff."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-EXPIRED-001",
            name="Expired Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=60),
            expiry_date=date.today() - timedelta(days=1),  # Expired yesterday
            is_active=True,
        )

        assert tariff.is_valid_on_date() is False
        assert tariff.is_valid_on_date(date.today()) is False

    def test_is_valid_on_date_on_expiry_date(self):
        """Should return True on the exact expiry date (inclusive)."""
        from hmis.apps.billing.models import SHATariff

        expiry = date.today()
        tariff = SHATariff.objects.create(
            code="SHA-EXPIRY-001",
            name="Expires Today",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            expiry_date=expiry,
            is_active=True,
        )

        # Expiry date is inclusive - valid on the last day
        assert tariff.is_valid_on_date(expiry) is True

    # =========================================================================
    # Test 11: is_valid_on_date() with inactive tariff
    # =========================================================================
    def test_is_valid_on_date_with_inactive_tariff(self):
        """Should return False for inactive tariff regardless of dates."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-INACTIVE-001",
            name="Inactive Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            expiry_date=date.today() + timedelta(days=30),
            is_active=False,  # Inactive
        )

        assert tariff.is_valid_on_date() is False


@pytest.mark.django_db
class TestSHATariffGetActiveTariffs:
    """Tests for SHATariff.get_active_tariffs() class method."""

    # =========================================================================
    # Test 12: get_active_tariffs() returns only valid tariffs
    # =========================================================================
    def test_get_active_tariffs_returns_only_valid(self):
        """Should return only currently valid tariffs."""
        from hmis.apps.billing.models import SHATariff

        # Create active valid tariff
        valid_tariff = SHATariff.objects.create(
            code="SHA-ACTIVE-001",
            name="Valid Active",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        # Create inactive tariff
        SHATariff.objects.create(
            code="SHA-INACTIVE-002",
            name="Inactive",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=False,
        )

        # Create expired tariff
        SHATariff.objects.create(
            code="SHA-EXPIRED-002",
            name="Expired",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=60),
            expiry_date=date.today() - timedelta(days=1),
            is_active=True,
        )

        # Create future tariff
        SHATariff.objects.create(
            code="SHA-FUTURE-002",
            name="Future",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() + timedelta(days=30),
            is_active=True,
        )

        active_tariffs = SHATariff.get_active_tariffs()

        # Only the valid active tariff should be returned
        assert valid_tariff in active_tariffs
        assert active_tariffs.count() == 1

    # =========================================================================
    # Test 13: get_active_tariffs() with category filter
    # =========================================================================
    def test_get_active_tariffs_with_category_filter(self):
        """Should filter tariffs by category."""
        from hmis.apps.billing.models import SHATariff

        # Create consultation tariff
        consultation = SHATariff.objects.create(
            code="SHA-CONS-100",
            name="Consultation",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        # Create laboratory tariff
        laboratory = SHATariff.objects.create(
            code="SHA-LAB-100",
            name="Laboratory",
            category=SHATariff.TariffCategory.LABORATORY,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("800.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        # Filter by consultation category
        consultation_tariffs = SHATariff.get_active_tariffs(
            category=SHATariff.TariffCategory.CONSULTATION
        )
        assert consultation in consultation_tariffs
        assert laboratory not in consultation_tariffs

        # Filter by laboratory category
        lab_tariffs = SHATariff.get_active_tariffs(category=SHATariff.TariffCategory.LABORATORY)
        assert laboratory in lab_tariffs
        assert consultation not in lab_tariffs

    # =========================================================================
    # Test 14: get_active_tariffs() with facility level filter
    # =========================================================================
    def test_get_active_tariffs_with_facility_level_filter(self):
        """Should filter tariffs by facility level."""
        from hmis.apps.billing.models import SHATariff

        # Create Level 3 tariff
        level_3 = SHATariff.objects.create(
            code="SHA-L3-001",
            name="Level 3 Service",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        # Create Level 4 tariff
        level_4 = SHATariff.objects.create(
            code="SHA-L4-001",
            name="Level 4 Service",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_4,
            sha_amount=Decimal("700.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
        )

        # Filter by Level 3
        l3_tariffs = SHATariff.get_active_tariffs(facility_level=SHATariff.TariffLevel.LEVEL_3)
        assert level_3 in l3_tariffs
        assert level_4 not in l3_tariffs

        # Filter by Level 4
        l4_tariffs = SHATariff.get_active_tariffs(facility_level=SHATariff.TariffLevel.LEVEL_4)
        assert level_4 in l4_tariffs
        assert level_3 not in l4_tariffs


@pytest.mark.django_db
class TestSHATariffFindTariffForService:
    """Tests for SHATariff.find_tariff_for_service() class method."""

    @pytest.fixture
    def service_category(self, test_user):
        """Create a service category for testing."""
        from hmis.apps.billing.models import ServiceCategory

        return ServiceCategory.objects.create(
            name="Test Category",
            description="Test category for tariff tests",
            code="TEST-CAT",
            is_active=True,
        )

    @pytest.fixture
    def test_service(self, test_user, service_category):
        """Create a test service for tariff mapping."""
        from hmis.apps.billing.models import Service

        return Service.objects.create(
            code="SVC-001",
            name="Test Service",
            description="Test service for tariff mapping",
            category=service_category,
            unit_price=Decimal("500.00"),
            sha_code="SHA-MAPPED-001",  # SHA code for fallback
            is_active=True,
            created_by=test_user,
        )

    # =========================================================================
    # Test 15: find_tariff_for_service() with direct mapping
    # =========================================================================
    def test_find_tariff_for_service_with_direct_mapping(self, test_service):
        """Should find tariff when directly mapped to service."""
        from hmis.apps.billing.models import SHATariff

        # Create tariff with direct service mapping
        tariff = SHATariff.objects.create(
            code="SHA-DIRECT-001",
            name="Directly Mapped Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            internal_service=test_service,  # Direct mapping
        )

        found = SHATariff.find_tariff_for_service(test_service, SHATariff.TariffLevel.LEVEL_3)

        assert found == tariff

    # =========================================================================
    # Test 16: find_tariff_for_service() with SHA code fallback
    # =========================================================================
    def test_find_tariff_for_service_with_sha_code_fallback(self, test_service):
        """Should find tariff by matching SHA code when no direct mapping."""
        from hmis.apps.billing.models import SHATariff

        # Create tariff with matching SHA code (no direct mapping)
        tariff = SHATariff.objects.create(
            code="SHA-MAPPED-001",  # Matches service.sha_code
            name="SHA Code Mapped Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            internal_service=None,  # No direct mapping
        )

        found = SHATariff.find_tariff_for_service(test_service, SHATariff.TariffLevel.LEVEL_3)

        assert found == tariff

    # =========================================================================
    # Test 17: find_tariff_for_service() returns None when no match
    # =========================================================================
    def test_find_tariff_for_service_returns_none_when_no_match(self, test_service):
        """Should return None when no matching tariff exists."""
        from hmis.apps.billing.models import SHATariff

        # Create tariff with different SHA code and no direct mapping
        SHATariff.objects.create(
            code="SHA-OTHER-001",
            name="Other Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            internal_service=None,
        )

        found = SHATariff.find_tariff_for_service(test_service, SHATariff.TariffLevel.LEVEL_3)

        assert found is None

    def test_find_tariff_for_service_respects_facility_level(self, test_service):
        """Should only find tariffs matching the facility level."""
        from hmis.apps.billing.models import SHATariff

        # Create tariff with direct mapping but different level
        SHATariff.objects.create(
            code="SHA-LEVEL-001",
            name="Level 4 Only",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_4,  # Different level
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            internal_service=test_service,
        )

        # Search for Level 3 - should not find Level 4 tariff
        found = SHATariff.find_tariff_for_service(test_service, SHATariff.TariffLevel.LEVEL_3)

        assert found is None


@pytest.mark.django_db
class TestSHATariffICD10Codes:
    """Tests for SHATariff ICD-10 codes JSON field."""

    # =========================================================================
    # Test 18: ICD-10 codes JSON field storage
    # =========================================================================
    def test_icd10_codes_json_field_stores_list(self):
        """Should store and retrieve ICD-10 codes as JSON list."""
        from hmis.apps.billing.models import SHATariff

        icd_codes = ["A09", "A09.0", "A09.9", "K52.9"]

        tariff = SHATariff.objects.create(
            code="SHA-ICD-001",
            name="Gastroenteritis Treatment",
            category=SHATariff.TariffCategory.PROCEDURE,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("2000.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            applicable_icd10_codes=icd_codes,
        )

        # Refresh from database
        tariff.refresh_from_db()

        assert tariff.applicable_icd10_codes == icd_codes
        assert "A09" in tariff.applicable_icd10_codes
        assert len(tariff.applicable_icd10_codes) == 4

    def test_icd10_codes_defaults_to_empty_list(self):
        """Should default to empty list when not specified."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-ICD-002",
            name="No ICD Codes",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today() - timedelta(days=30),
            is_active=True,
            # applicable_icd10_codes not specified
        )

        assert tariff.applicable_icd10_codes == []


@pytest.mark.django_db
class TestSHATariffModelMeta:
    """Tests for SHATariff model Meta options."""

    def test_sha_tariff_str_representation(self):
        """Should return formatted string representation."""
        from hmis.apps.billing.models import SHATariff

        tariff = SHATariff.objects.create(
            code="SHA-STR-001",
            name="Test Tariff",
            category=SHATariff.TariffCategory.CONSULTATION,
            facility_level=SHATariff.TariffLevel.LEVEL_3,
            sha_amount=Decimal("500.00"),
            effective_date=date.today(),
        )

        expected = "SHA-STR-001 - Test Tariff (KES 500.00)"
        assert str(tariff) == expected

    def test_sha_tariff_verbose_name(self):
        """Should have correct verbose name."""
        from hmis.apps.billing.models import SHATariff

        assert SHATariff._meta.verbose_name == "SHA Tariff"
        assert SHATariff._meta.verbose_name_plural == "SHA Tariffs"

    def test_sha_tariff_ordering(self):
        """Should order by category then code."""
        from hmis.apps.billing.models import SHATariff

        assert SHATariff._meta.ordering == ["category", "code"]

    def test_sha_tariff_indexes_defined(self):
        """Should have database indexes defined."""
        from hmis.apps.billing.models import SHATariff

        index_fields = [idx.fields for idx in SHATariff._meta.indexes]

        # Check expected indexes exist
        assert ["code"] in index_fields
        assert ["category", "is_active"] in index_fields
        assert ["facility_level"] in index_fields

"""
Tests for SHA Remittance Module (Phase 1.4).

Covers:
- SHARemittance model creation and properties
- SHARemittanceLine reconciliation
- SHARemittanceService.fetch_remittances (mocked DHA)
- SHARemittanceService.fetch_claims_paid (mocked DHA + auto-reconcile)
- SHARemittanceViewSet endpoints
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import (
    SHAClaim,
    SHAMember,
    SHARemittance,
    SHARemittanceLine,
    SHATariff,
)
from tests.conftest import ensure_staff_profile

User = get_user_model()


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username="remituser", email="remit@test.com", password="testpass123"
    )


@pytest.fixture
def authenticated_client(test_user, sample_organization, sample_facility):
    client = APIClient()
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    client.force_authenticate(user=test_user)
    return client


@pytest.fixture
def sample_remittance(db, sample_facility, sample_organization):
    return SHARemittance.objects.create(
        bank_reference="SHA-PAY-20260501-001",
        payment_date=date.today(),
        total_amount=Decimal("150000.00"),
        claims_count=3,
        status=SHARemittance.RemittanceStatus.RECEIVED,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def sample_sha_member(db, sample_patient, test_user):
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-REMIT-9999",
        national_id="88888888",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=365),
        coverage_end_date=date.today() + timedelta(days=365),
        created_by=test_user,
    )


@pytest.fixture
def sample_claim(db, sample_sha_member, sample_encounter, test_user):
    return SHAClaim.objects.create(
        patient=sample_sha_member.patient,
        sha_member=sample_sha_member,
        encounter=sample_encounter,
        claim_type=SHAClaim.ClaimType.OUTPATIENT,
        status=SHAClaim.ClaimStatus.SUBMITTED,
        service_date=date.today(),
        primary_diagnosis_code="J06.9",
        primary_diagnosis_description="URTI",
        claimed_amount=Decimal("5000.00"),
        facility_code="TEST-001",
        facility_level="L3",
        created_by=test_user,
        dha_external_id="DHA-CLM-001",
    )


# =============================================================================
# Model Tests
# =============================================================================


@pytest.mark.django_db
class TestSHARemittanceModel:
    """Tests for SHARemittance model."""

    def test_create_remittance(self, sample_remittance):
        """Should create a remittance record."""
        assert sample_remittance.bank_reference == "SHA-PAY-20260501-001"
        assert sample_remittance.total_amount == Decimal("150000.00")
        assert sample_remittance.status == "received"

    def test_reconciled_amount_empty(self, sample_remittance):
        """No lines → 0 reconciled."""
        assert sample_remittance.reconciled_amount == Decimal("0.00")

    def test_unreconciled_amount(self, sample_remittance):
        """All unreconciled initially."""
        assert sample_remittance.unreconciled_amount == Decimal("150000.00")

    def test_reconciled_amount_with_lines(self, sample_remittance, sample_claim):
        """Lines linked to claims contribute to reconciled amount."""
        SHARemittanceLine.objects.create(
            remittance=sample_remittance,
            dha_claim_id="DHA-CLM-001",
            paid_amount=Decimal("5000.00"),
            claim=sample_claim,
            is_reconciled=True,
        )
        assert sample_remittance.reconciled_amount == Decimal("5000.00")
        assert sample_remittance.unreconciled_amount == Decimal("145000.00")


@pytest.mark.django_db
class TestSHARemittanceLineModel:
    """Tests for SHARemittanceLine model."""

    def test_create_line(self, sample_remittance):
        """Should create a remittance line."""
        line = SHARemittanceLine.objects.create(
            remittance=sample_remittance,
            dha_claim_id="DHA-CLM-999",
            paid_amount=Decimal("3000.00"),
        )
        assert line.is_reconciled is False
        assert line.claim is None


# =============================================================================
# Service Tests (Mocked DHA)
# =============================================================================


@pytest.mark.django_db
class TestSHARemittanceService:
    """Tests for SHARemittanceService with mocked DHA responses."""

    def test_fetch_remittances_creates_records(self, sample_facility, sample_organization):
        """fetch_remittances should create SHARemittance records from DHA response."""
        from hmis.apps.billing.services.sha_remittance import SHARemittanceService

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = [
            {
                "bank_reference": "SHA-BANK-001",
                "payment_date": "2026-05-01",
                "amount": "50000.00",
                "claims_count": 5,
            },
            {
                "bank_reference": "SHA-BANK-002",
                "payment_date": "2026-04-28",
                "amount": "75000.00",
                "claims_count": 8,
            },
        ]

        service = SHARemittanceService()
        with patch("requests.get", return_value=mock_response):
            results = service.fetch_remittances("TEST-001", facility=sample_facility)

        assert len(results) == 2
        assert SHARemittance.objects.filter(bank_reference="SHA-BANK-001").exists()
        assert SHARemittance.objects.filter(bank_reference="SHA-BANK-002").exists()

    def test_fetch_claims_paid_auto_reconciles(
        self, sample_remittance, sample_claim, sample_facility
    ):
        """fetch_claims_paid should auto-reconcile lines to matching local claims."""
        from hmis.apps.billing.services.sha_remittance import SHARemittanceService

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = [
            {
                "claim_id": "DHA-CLM-001",  # Matches sample_claim.dha_external_id
                "paid_amount": "5000.00",
                "status": "PAID",
            },
            {
                "claim_id": "DHA-CLM-UNKNOWN",  # No local match
                "paid_amount": "3000.00",
                "status": "PAID",
            },
        ]

        service = SHARemittanceService()
        with patch("requests.get", return_value=mock_response):
            lines = service.fetch_claims_paid(sample_remittance, "TEST-001")

        assert len(lines) == 2

        # First line should be reconciled
        reconciled = SHARemittanceLine.objects.get(dha_claim_id="DHA-CLM-001")
        assert reconciled.is_reconciled is True
        assert reconciled.claim == sample_claim

        # Claim should be marked PAID
        sample_claim.refresh_from_db()
        assert sample_claim.status == SHAClaim.ClaimStatus.PAID
        assert sample_claim.paid_amount == Decimal("5000.00")

        # Second line should NOT be reconciled
        unreconciled = SHARemittanceLine.objects.get(dha_claim_id="DHA-CLM-UNKNOWN")
        assert unreconciled.is_reconciled is False
        assert unreconciled.claim is None

        # Remittance status should be PARTIAL
        sample_remittance.refresh_from_db()
        assert sample_remittance.status == SHARemittance.RemittanceStatus.PARTIAL


# =============================================================================
# API Tests
# =============================================================================


@pytest.mark.django_db
class TestSHARemittanceAPI:
    """Tests for SHA remittance API endpoints."""

    def test_list_remittances(self, authenticated_client, sample_remittance):
        """GET /api/sha/remittances/ should list remittances."""
        response = authenticated_client.get("/api/sha/remittances/")
        assert response.status_code == status.HTTP_200_OK
        # DRF router returns paginated or list
        data = response.data
        results = data.get("results", data) if isinstance(data, dict) else data
        assert len(results) >= 1

    def test_remittance_detail(self, authenticated_client, sample_remittance):
        """GET /api/sha/remittances/{id}/ should return detail."""
        response = authenticated_client.get(f"/api/sha/remittances/{sample_remittance.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["bank_reference"] == "SHA-PAY-20260501-001"

    def test_remittance_claims(self, authenticated_client, sample_remittance, sample_claim):
        """GET /api/sha/remittances/{id}/claims/ should list claim lines."""
        SHARemittanceLine.objects.create(
            remittance=sample_remittance,
            dha_claim_id="DHA-CLM-001",
            paid_amount=Decimal("5000.00"),
            claim=sample_claim,
            is_reconciled=True,
        )
        response = authenticated_client.get(f"/api/sha/remittances/{sample_remittance.id}/claims/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1
        assert response.data["results"][0]["is_reconciled"] is True

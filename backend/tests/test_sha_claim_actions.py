"""Tests for SHA claim resubmit, cancel, and bundle actions."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest  # type: ignore
from rest_framework import status


@pytest.fixture
def sha_claim(
    db,
    sample_patient,
    sample_encounter,
    sample_facility,
    sample_organization,
    test_user,
):
    """Create a sample SHA claim for testing."""
    from hmis.apps.billing.models import SHAClaim, SHAMember, SHATariff

    # Make test user superuser so SHAPermission passes
    test_user.is_superuser = True
    test_user.save(update_fields=["is_superuser"])

    member = SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-TEST-001",
        national_id="12345678",
        membership_type="principal",
        status="active",
        coverage_start_date=date.today(),
        created_by=test_user,
    )

    return SHAClaim.objects.create(
        patient=sample_patient,
        sha_member=member,
        encounter=sample_encounter,
        claim_type="outpatient",
        status=SHAClaim.ClaimStatus.DRAFT,
        service_date=date.today(),
        primary_diagnosis_code="A00",
        primary_diagnosis_description="Cholera",
        claimed_amount=Decimal("5000.00"),
        facility_code=sample_facility.mfl_code,
        facility_level=SHATariff.TariffLevel.LEVEL_3,
        organization=sample_organization,
        facility=sample_facility,
        created_by=test_user,
    )


class TestClaimResubmit:
    """Tests for POST /api/billing/claims/{id}/resubmit/."""

    def test_resubmit_rejected_claim(self, authenticated_client, sha_claim):
        """Should resubmit a rejected claim successfully."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.REJECTED
        sha_claim.save(update_fields=["status"])

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService.submit_claim"
        ) as mock_submit:
            mock_submit.return_value = {"status": "submitted"}
            response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/resubmit/")

        assert response.status_code == status.HTTP_200_OK
        assert "status" in response.data
        assert "claim_number" in response.data

    def test_resubmit_queried_claim(self, authenticated_client, sha_claim):
        """Should resubmit a claim with query status."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.QUERY
        sha_claim.save(update_fields=["status"])

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService.submit_claim"
        ) as mock_submit:
            mock_submit.return_value = {"status": "submitted"}
            response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/resubmit/")

        assert response.status_code == status.HTTP_200_OK

    def test_resubmit_draft_claim_fails(self, authenticated_client, sha_claim):
        """Should reject resubmission of draft claims."""
        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/resubmit/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data

    def test_resubmit_approved_claim_fails(self, authenticated_client, sha_claim):
        """Should reject resubmission of approved claims."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.APPROVED
        sha_claim.save(update_fields=["status"])

        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/resubmit/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_resubmit_returns_queued_response(self, authenticated_client, sha_claim):
        """Should return queue info when submission is queued."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.REJECTED
        sha_claim.save(update_fields=["status"])

        with patch(
            "hmis.apps.billing.services.sha_claims.SHAClaimsService.submit_claim"
        ) as mock_submit:
            mock_submit.return_value = {
                "status": "queued",
                "message": "Claim queued for submission",
                "queue_entry_id": 42,
            }
            response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/resubmit/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "queued"
        assert response.data["queue_entry_id"] == 42


class TestClaimCancel:
    """Tests for POST /api/billing/claims/{id}/cancel/."""

    def test_cancel_draft_claim(self, authenticated_client, sha_claim):
        """Should cancel a draft claim."""
        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/cancel/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "cancelled"
        assert "message" in response.data

        sha_claim.refresh_from_db()
        assert sha_claim.status == "cancelled"

    def test_cancel_validated_claim(self, authenticated_client, sha_claim):
        """Should cancel a validated claim."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.VALIDATED
        sha_claim.save(update_fields=["status"])

        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/cancel/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "cancelled"

    def test_cancel_submitted_claim_fails(self, authenticated_client, sha_claim):
        """Should reject cancellation of submitted claims."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.SUBMITTED
        sha_claim.save(update_fields=["status"])

        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/cancel/")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "error" in response.data
        assert "ILM close" in response.data["error"]

    def test_cancel_approved_claim_fails(self, authenticated_client, sha_claim):
        """Should reject cancellation of approved claims."""
        from hmis.apps.billing.models import SHAClaim

        sha_claim.status = SHAClaim.ClaimStatus.APPROVED
        sha_claim.save(update_fields=["status"])

        response = authenticated_client.post(f"/api/billing/claims/{sha_claim.id}/cancel/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestClaimBundle:
    """Tests for GET /api/billing/claims/{id}/bundle/."""

    def test_get_bundle_returns_full_claim(self, authenticated_client, sha_claim):
        """Should return claim with nested items and attachments."""
        response = authenticated_client.get(f"/api/billing/claims/{sha_claim.id}/bundle/")

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sha_claim.id
        assert response.data["claim_number"] == sha_claim.claim_number
        assert "items" in response.data
        assert "attachments" in response.data
        assert "claim_interventions" in response.data

    def test_bundle_unauthenticated_fails(self, api_client, sha_claim):
        """Should reject unauthenticated requests."""
        response = api_client.get(f"/api/billing/claims/{sha_claim.id}/bundle/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

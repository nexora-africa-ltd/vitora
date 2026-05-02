"""
Tests for DHA HIE Biometric Consent & Beneficiary Contacts.

Covers:
- BiometricAuthorizeView (POST /api/sha/consent/authorize/)
- BiometricAuthorizeStatusView (GET /api/sha/consent/authorize/{guid}/status/)
- BiometricCancelView (POST /api/sha/consent/authorize/{guid}/cancel/)
- BeneficiaryContactsView (GET /api/sha/consent/contacts/)
- StartVisitView auth_guid support
- SHAConsentService.authorize_biometric
- SHAConsentService.cancel_authorization
- SHAConsentService.get_beneficiary_contacts
- ConsentToken biometric fields (auth_guid, iframe_url, iframe_expires_at, retry_count)
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.billing.models import ConsentToken, SHAMember

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sha_member(db, sample_patient, test_user):
    """Create an SHA member for biometric tests."""
    return SHAMember.objects.create(
        patient=sample_patient,
        sha_number="SHA-9876543210",
        national_id="31234567",
        membership_type=SHAMember.MembershipType.PRINCIPAL,
        status=SHAMember.MembershipStatus.ACTIVE,
        coverage_start_date=date.today() - timedelta(days=180),
        coverage_end_date=date.today() + timedelta(days=180),
        created_by=test_user,
    )


@pytest.fixture
def biometric_consent(db, sample_patient, sha_member, test_user, sample_facility):
    """Create a pending biometric consent token."""
    return ConsentToken.objects.create(
        patient=sample_patient,
        sha_member=sha_member,
        facility=sample_facility,
        consent_method=ConsentToken.ConsentMethod.BIOMETRIC,
        status=ConsentToken.ConsentStatus.PENDING,
        otp_reference="bio-guid-123",
        auth_guid="bio-guid-123",
        iframe_url="https://dha.go.ke/biometrics/iframe/bio-guid-123",
        iframe_expires_at=timezone.now() + timedelta(minutes=10),
        identification_number="12345678",
        created_by=test_user,
    )


# ---------------------------------------------------------------------------
# ConsentToken biometric fields
# ---------------------------------------------------------------------------


class TestConsentTokenBiometricFields:
    """Tests for ConsentToken biometric-specific fields."""

    def test_create_with_biometric_fields(self, biometric_consent):
        """Should persist auth_guid, iframe_url, iframe_expires_at."""
        assert biometric_consent.auth_guid == "bio-guid-123"
        assert "iframe" in biometric_consent.iframe_url
        assert biometric_consent.iframe_expires_at is not None
        assert biometric_consent.retry_count == 0
        assert biometric_consent.consent_method == ConsentToken.ConsentMethod.BIOMETRIC

    def test_retry_count_increments(self, biometric_consent):
        """Should track retry attempts."""
        biometric_consent.retry_count = 2
        biometric_consent.save(update_fields=["retry_count"])
        biometric_consent.refresh_from_db()
        assert biometric_consent.retry_count == 2


# ---------------------------------------------------------------------------
# BiometricAuthorizeView
# ---------------------------------------------------------------------------


class TestBiometricAuthorizeView:
    """Tests for POST /api/sha/consent/authorize/"""

    URL = "/api/sha/consent/authorize/"

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_authorize_success(
        self, mock_request, authenticated_client, sha_member, sample_facility
    ):
        """Should return auth_guid and iframe_url on success."""
        mock_request.return_value = {
            "auth_guid": "new-bio-guid-456",
            "iframe_url": "https://dha.go.ke/biometrics/iframe/new-bio-guid-456",
        }
        response = authenticated_client.post(
            self.URL,
            {
                "sha_member_id": sha_member.id,
                "workstation_id": "WS-12345",
                "agent_national_id": "98765432",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["auth_guid"] == "new-bio-guid-456"
        assert "iframe_url" in response.data
        assert response.data["status"] == "PENDING"
        assert "consent_id" in response.data
        assert "iframe_expires_at" in response.data

    def test_authorize_requires_sha_member_id(self, authenticated_client):
        """Should reject if sha_member_id missing."""
        response = authenticated_client.post(
            self.URL,
            {"workstation_id": "WS-12345", "agent_national_id": "98765432"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "sha_member_id" in response.data["error"]

    def test_authorize_requires_workstation_id(self, authenticated_client, sha_member):
        """Should reject if workstation_id missing."""
        response = authenticated_client.post(
            self.URL,
            {"sha_member_id": sha_member.id, "agent_national_id": "98765432"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "workstation_id" in response.data["error"]

    def test_authorize_requires_agent_national_id(self, authenticated_client, sha_member):
        """Should reject if agent_national_id missing."""
        response = authenticated_client.post(
            self.URL,
            {"sha_member_id": sha_member.id, "workstation_id": "WS-12345"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "agent_national_id" in response.data["error"]


# ---------------------------------------------------------------------------
# BiometricAuthorizeStatusView
# ---------------------------------------------------------------------------


class TestBiometricAuthorizeStatusView:
    """Tests for GET /api/sha/consent/authorize/{guid}/status/"""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_status_pending(self, mock_request, authenticated_client, biometric_consent):
        """Should return PENDING when fingerprint not yet captured."""
        mock_request.return_value = {"status": "PENDING"}
        url = f"/api/sha/consent/authorize/{biometric_consent.auth_guid}/status/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "PENDING"

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_status_authorized(self, mock_request, authenticated_client, biometric_consent):
        """Should mark consent VALIDATED when DHA returns AUTHORIZED."""
        mock_request.return_value = {
            "status": "AUTHORIZED",
            "consent_token": "biometric-consent-token-xyz",
        }
        url = f"/api/sha/consent/authorize/{biometric_consent.auth_guid}/status/"
        response = authenticated_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "AUTHORIZED"

        # ConsentToken should now be VALIDATED
        biometric_consent.refresh_from_db()
        assert biometric_consent.status == ConsentToken.ConsentStatus.VALIDATED
        assert biometric_consent.consent_token == "biometric-consent-token-xyz"


# ---------------------------------------------------------------------------
# BiometricCancelView
# ---------------------------------------------------------------------------


class TestBiometricCancelView:
    """Tests for POST /api/sha/consent/authorize/{guid}/cancel/"""

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_cancel_success(self, mock_request, authenticated_client, biometric_consent):
        """Should mark consent as FAILED and return CANCELLED status."""
        mock_request.return_value = {"status": "CANCELLED"}
        url = f"/api/sha/consent/authorize/{biometric_consent.auth_guid}/cancel/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

        biometric_consent.refresh_from_db()
        assert biometric_consent.status == ConsentToken.ConsentStatus.FAILED

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_cancel_already_failed_is_idempotent(
        self, mock_request, authenticated_client, biometric_consent
    ):
        """Should handle cancelling an already-failed consent gracefully."""
        biometric_consent.mark_failed()
        mock_request.return_value = {}
        url = f"/api/sha/consent/authorize/{biometric_consent.auth_guid}/cancel/"
        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"


# ---------------------------------------------------------------------------
# BeneficiaryContactsView
# ---------------------------------------------------------------------------


class TestBeneficiaryContactsView:
    """Tests for GET /api/sha/consent/contacts/"""

    URL = "/api/sha/consent/contacts/"

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_returns_masked_contacts(self, mock_request, authenticated_client):
        """Should return list of masked contacts from DHA."""
        mock_request.return_value = [
            {"id": "contact-1", "value": "+254714***898", "type": "phone"},
            {"id": "contact-2", "value": "+254722***123", "type": "phone"},
        ]
        response = authenticated_client.get(f"{self.URL}?beneficiary_cr_id=CR9876543210")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["contacts"]) == 2
        assert response.data["contacts"][0]["id"] == "contact-1"

    def test_requires_beneficiary_cr_id(self, authenticated_client):
        """Should reject if beneficiary_cr_id not provided."""
        response = authenticated_client.get(self.URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "beneficiary_cr_id" in response.data["error"]


# ---------------------------------------------------------------------------
# StartVisitView auth_guid support
# ---------------------------------------------------------------------------


class TestStartVisitBiometricAuth:
    """Tests for POST /api/sha/consent/start-visit/ with auth_guid."""

    URL = "/api/sha/consent/start-visit/"

    @patch("hmis.apps.billing.services.sha_consent.SHAConsentService._make_request")
    def test_start_visit_with_auth_guid(
        self, mock_request, authenticated_client, biometric_consent
    ):
        """Should accept auth_guid instead of otp_code."""
        mock_request.return_value = {
            "consent_token": "visit-token-from-biometric",
            "expires_in": 3600,
        }
        response = authenticated_client.post(
            self.URL,
            {
                "consent_id": biometric_consent.id,
                "auth_guid": biometric_consent.auth_guid,
                "intervention_codes": ["SHA-02-001"],
                "service_type": "outpatient",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "VALIDATED"
        assert response.data["message"] == "Visit started successfully"

    def test_start_visit_rejects_both_otp_and_auth_guid(
        self, authenticated_client, biometric_consent
    ):
        """Should reject if both otp_code and auth_guid provided."""
        response = authenticated_client.post(
            self.URL,
            {
                "consent_id": biometric_consent.id,
                "otp_code": "123456",
                "auth_guid": "some-guid",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert (
            "either" in response.data["error"].lower()
            or "not both" in response.data["error"].lower()
        )

    def test_start_visit_rejects_neither_otp_nor_auth_guid(
        self, authenticated_client, biometric_consent
    ):
        """Should reject if neither otp_code nor auth_guid provided."""
        response = authenticated_client.post(
            self.URL,
            {"consent_id": biometric_consent.id},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

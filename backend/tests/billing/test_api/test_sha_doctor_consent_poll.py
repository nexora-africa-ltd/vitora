"""
Tests for DHA HIE Doctor Consent Poll (Phase 2.1).

Validates the IlmDoctorConsentPollView endpoint that:
- Fetches latest preauth state from DHA
- Updates local SHAPreauth.doctor_consent_state
- Returns serialized preauth record

Test Coverage:
- Poll endpoint requires preauth_id parameter
- Returns 404 for invalid preauth_id
- Re-fetches from DHA and updates state
- Handles DHA error gracefully
- Detects terminal states (APPROVED, REJECTED)
"""

from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from hmis.apps.billing.models import SHAPreauth
from tests.conftest import ensure_staff_profile

User = get_user_model()

POLL_URL = "/api/sha/ilm/preauth/doctor-consent/poll/"


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def test_user(db):
    return User.objects.create_user(
        username="drconsentuser", email="drconsent@test.com", password="testpass123"
    )


@pytest.fixture
def authenticated_client(test_user, sample_organization, sample_facility):
    client = APIClient()
    ensure_staff_profile(test_user, sample_organization, sample_facility)
    client.force_authenticate(user=test_user)
    return client


@pytest.fixture
def sample_preauth(db, sample_patient, sample_facility, sample_organization):
    """Create an SHAPreauth with doctor_consent_state=REQUESTED."""
    return SHAPreauth.objects.create(
        patient=sample_patient,
        facility=sample_facility,
        organization=sample_organization,
        consent_token="test-consent-token-123",
        intervention_code="SHA-TEST-001",
        status="submitted",
        doctor_consent_state="REQUESTED",
    )


# =============================================================================
# Tests
# =============================================================================


class TestDoctorConsentPoll:
    """Tests for GET /api/sha/ilm/preauth/doctor-consent/poll/"""

    def test_requires_preauth_id(self, authenticated_client):
        """Should return 400 if preauth_id is missing."""
        response = authenticated_client.get(POLL_URL)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "preauth_id" in response.data["error"]

    def test_returns_404_for_invalid_preauth(self, authenticated_client):
        """Should return 404 for non-existent preauth_id."""
        response = authenticated_client.get(POLL_URL, {"preauth_id": 99999})
        assert response.status_code == status.HTTP_404_NOT_FOUND

    @patch("hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService")
    def test_polls_dha_and_updates_state_approved(
        self, MockService, authenticated_client, sample_preauth
    ):
        """Should update doctor_consent_state when DHA returns APPROVED."""
        mock_instance = MockService.return_value
        mock_result = MagicMock()
        mock_result.payload = {
            "doctor_consent_state": "APPROVED",
            "status": "approved",
        }
        mock_result.status_code = 200
        mock_instance.fetch_preauth.return_value = mock_result

        response = authenticated_client.get(POLL_URL, {"preauth_id": sample_preauth.id})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["doctor_consent_state"] == "APPROVED"
        assert response.data["status"] == "approved"

        # Verify DB was updated
        sample_preauth.refresh_from_db()
        assert sample_preauth.doctor_consent_state == "APPROVED"
        assert sample_preauth.status == "approved"

    @patch("hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService")
    def test_polls_dha_and_updates_state_rejected(
        self, MockService, authenticated_client, sample_preauth
    ):
        """Should update doctor_consent_state when DHA returns REJECTED."""
        mock_instance = MockService.return_value
        mock_result = MagicMock()
        mock_result.payload = {
            "doctor_consent_state": "REJECTED",
        }
        mock_result.status_code = 200
        mock_instance.fetch_preauth.return_value = mock_result

        response = authenticated_client.get(POLL_URL, {"preauth_id": sample_preauth.id})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["doctor_consent_state"] == "REJECTED"

        sample_preauth.refresh_from_db()
        assert sample_preauth.doctor_consent_state == "REJECTED"

    @patch("hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService")
    def test_no_update_when_state_unchanged(
        self, MockService, authenticated_client, sample_preauth
    ):
        """Should not update if DHA returns same state."""
        mock_instance = MockService.return_value
        mock_result = MagicMock()
        mock_result.payload = {
            "doctor_consent_state": "REQUESTED",  # same as current
        }
        mock_result.status_code = 200
        mock_instance.fetch_preauth.return_value = mock_result

        response = authenticated_client.get(POLL_URL, {"preauth_id": sample_preauth.id})

        assert response.status_code == status.HTTP_200_OK
        assert response.data["doctor_consent_state"] == "REQUESTED"

    @patch("hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService")
    def test_handles_dha_error(self, MockService, authenticated_client, sample_preauth):
        """Should return 502 when DHA is unreachable."""
        from hmis.apps.billing.services.dha_errors import DHAServerError

        mock_instance = MockService.return_value
        mock_instance.fetch_preauth.side_effect = DHAServerError("DHA is down")

        response = authenticated_client.get(POLL_URL, {"preauth_id": sample_preauth.id})

        assert response.status_code == status.HTTP_502_BAD_GATEWAY
        assert "DHAServerError" in response.data["error"]

    @patch("hmis.apps.billing.sha_ilm_preauth_views.IlmPreauthService")
    def test_returns_serialized_preauth(self, MockService, authenticated_client, sample_preauth):
        """Should return full serialized preauth record."""
        mock_instance = MockService.return_value
        mock_result = MagicMock()
        mock_result.payload = {}
        mock_result.status_code = 200
        mock_instance.fetch_preauth.return_value = mock_result

        response = authenticated_client.get(POLL_URL, {"preauth_id": sample_preauth.id})

        assert response.status_code == status.HTTP_200_OK
        # Verify all expected fields are present
        assert "id" in response.data
        assert "consent_token" in response.data
        assert "intervention_code" in response.data
        assert "doctor_consent_state" in response.data
        assert "status" in response.data
        assert response.data["id"] == sample_preauth.id

    def test_requires_authentication(self, sample_preauth):
        """Should reject unauthenticated requests."""
        client = APIClient()
        response = client.get(POLL_URL, {"preauth_id": sample_preauth.id})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

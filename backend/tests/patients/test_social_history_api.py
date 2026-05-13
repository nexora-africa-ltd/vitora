"""
Tests for the Social History Observation API.

Covers CRUD operations, tenant scoping, and validation.
"""

import pytest  # type: ignore
from rest_framework import status

from hmis.apps.encounters.models import SocialHistoryObservation

pytestmark = pytest.mark.django_db


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def social_history_data():
    """Valid social history observation payload."""
    return {
        "observation_type": "ALCOHOL_USE",
        "status": "NEVER",
        "value_text": "No alcohol use",
        "effective_date": "2026-04-25",
    }


@pytest.fixture
def sample_social_history(sample_patient, sample_facility, test_user):
    """Create a sample social history observation."""
    return SocialHistoryObservation.objects.create(
        patient=sample_patient,
        observation_type="TOBACCO_USE",
        status="FORMER",
        value_text="Quit smoking 2023",
        effective_date="2026-01-15",
        recorded_by=test_user,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# List Tests
# =============================================================================


class TestSocialHistoryList:
    """Tests for GET /api/patients/{id}/social-history/."""

    def test_list_returns_observations_for_patient(
        self, authenticated_client, sample_patient, sample_social_history
    ):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/social-history/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["observation_type"] == "TOBACCO_USE"
        assert results[0]["status"] == "FORMER"
        assert results[0]["observation_type_display"] == "Tobacco use"
        assert results[0]["status_display"] == "Former use"

    def test_list_empty_for_patient_with_no_history(self, authenticated_client, sample_patient):
        response = authenticated_client.get(f"/api/patients/{sample_patient.id}/social-history/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 0

    def test_list_requires_authentication(self, api_client, sample_patient):
        response = api_client.get(f"/api/patients/{sample_patient.id}/social-history/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_filters_by_observation_type(
        self,
        authenticated_client,
        sample_patient,
        sample_social_history,
        sample_facility,
        test_user,
    ):
        # Create a second observation with different type
        SocialHistoryObservation.objects.create(
            patient=sample_patient,
            observation_type="ALCOHOL_USE",
            status="NEVER",
            value_text="No alcohol",
            effective_date="2026-04-25",
            recorded_by=test_user,
            facility=sample_facility,
            organization=sample_facility.organization,
        )

        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/social-history/?observation_type=TOBACCO_USE"
        )
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) == 1
        assert results[0]["observation_type"] == "TOBACCO_USE"


# =============================================================================
# Create Tests
# =============================================================================


class TestSocialHistoryCreate:
    """Tests for POST /api/patients/{id}/social-history/."""

    def test_create_social_history_observation(
        self, authenticated_client, sample_patient, social_history_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            social_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["observation_type"] == "ALCOHOL_USE"
        assert response.data["status"] == "NEVER"
        assert response.data["value_text"] == "No alcohol use"
        assert response.data["patient"] == sample_patient.id

    def test_create_assigns_recorded_by(
        self, authenticated_client, sample_patient, social_history_data, test_user
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            social_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        obs = SocialHistoryObservation.objects.get(pk=response.data["id"])
        assert obs.recorded_by == test_user

    def test_create_generates_fhir_id(
        self, authenticated_client, sample_patient, social_history_data
    ):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            social_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        obs = SocialHistoryObservation.objects.get(pk=response.data["id"])
        assert obs.fhir_id >= SocialHistoryObservation.FHIR_ID_FLOOR

    def test_create_requires_authentication(self, api_client, sample_patient, social_history_data):
        response = api_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            social_history_data,
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_with_invalid_observation_type(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            {
                "observation_type": "INVALID",
                "status": "NEVER",
                "value_text": "test",
                "effective_date": "2026-04-25",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_with_invalid_status(self, authenticated_client, sample_patient):
        response = authenticated_client.post(
            f"/api/patients/{sample_patient.id}/social-history/",
            {
                "observation_type": "ALCOHOL_USE",
                "status": "INVALID",
                "value_text": "test",
                "effective_date": "2026-04-25",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_all_observation_types(self, authenticated_client, sample_patient):
        """Verify all four observation types can be created."""
        for obs_type in ["ALCOHOL_USE", "TOBACCO_USE", "OCCUPATION", "LIFESTYLE"]:
            response = authenticated_client.post(
                f"/api/patients/{sample_patient.id}/social-history/",
                {
                    "observation_type": obs_type,
                    "status": "CURRENT",
                    "value_text": f"Test {obs_type}",
                    "effective_date": "2026-04-25",
                },
                format="json",
            )
            assert response.status_code == status.HTTP_201_CREATED, (
                f"Failed for {obs_type}: {response.data}"
            )


# =============================================================================
# Update Tests
# =============================================================================


class TestSocialHistoryUpdate:
    """Tests for PATCH /api/patients/{id}/social-history/{id}/."""

    def test_update_status(self, authenticated_client, sample_patient, sample_social_history):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/social-history/{sample_social_history.id}/",
            {"status": "NEVER", "value_text": "Never smoked actually"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_social_history.refresh_from_db()
        assert sample_social_history.status == "NEVER"
        assert sample_social_history.value_text == "Never smoked actually"

    def test_update_value_text(self, authenticated_client, sample_patient, sample_social_history):
        response = authenticated_client.patch(
            f"/api/patients/{sample_patient.id}/social-history/{sample_social_history.id}/",
            {"value_text": "Quit in 2022, was 10/day"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_social_history.refresh_from_db()
        assert sample_social_history.value_text == "Quit in 2022, was 10/day"


# =============================================================================
# Delete Tests
# =============================================================================


class TestSocialHistoryDelete:
    """Tests for DELETE /api/patients/{id}/social-history/{id}/."""

    def test_delete_observation(self, authenticated_client, sample_patient, sample_social_history):
        response = authenticated_client.delete(
            f"/api/patients/{sample_patient.id}/social-history/{sample_social_history.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not SocialHistoryObservation.objects.filter(pk=sample_social_history.id).exists()

    def test_delete_requires_authentication(
        self, api_client, sample_patient, sample_social_history
    ):
        response = api_client.delete(
            f"/api/patients/{sample_patient.id}/social-history/{sample_social_history.id}/"
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Retrieve Tests
# =============================================================================


class TestSocialHistoryRetrieve:
    """Tests for GET /api/patients/{id}/social-history/{id}/."""

    def test_retrieve_returns_full_detail(
        self, authenticated_client, sample_patient, sample_social_history
    ):
        response = authenticated_client.get(
            f"/api/patients/{sample_patient.id}/social-history/{sample_social_history.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_social_history.id
        assert response.data["observation_type"] == "TOBACCO_USE"
        assert response.data["status"] == "FORMER"
        assert response.data["value_text"] == "Quit smoking 2023"
        assert "patient_name" in response.data
        assert "observation_type_display" in response.data
        assert "status_display" in response.data
        assert "recorded_by_username" in response.data

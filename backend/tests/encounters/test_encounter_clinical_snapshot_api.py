"""Tests for clinician-facing encounter clinical snapshot endpoint.

TDD: This test drives the implementation of:
GET /api/encounters/{id}/clinical_snapshot/

The endpoint reuses the existing check-in clinical snapshot generator to avoid
duplicating business logic.
"""

import pytest  # type: ignore
from rest_framework import status

pytestmark = pytest.mark.django_db


class TestEncounterClinicalSnapshotAPI:
    """Tests for encounter clinical snapshot action."""

    def test_requires_authentication(self, api_client, sample_encounter):
        """Unauthenticated requests should be rejected."""
        response = api_client.get(f"/api/encounters/{sample_encounter.id}/clinical-snapshot/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_returns_clinical_snapshot_for_encounter(
        self, authenticated_client, sample_patient_with_allergies
    ):
        """Should return snapshot generated from patient's clinical history."""
        from hmis.apps.encounters.models import Encounter

        patient = sample_patient_with_allergies
        encounter = (
            Encounter.objects.filter(patient=patient)
            .order_by("-encounter_date", "-created_at")
            .first()
        )
        assert encounter is not None

        response = authenticated_client.get(f"/api/encounters/{encounter.id}/clinical-snapshot/")

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Shape
        assert set(data.keys()) == {
            "allergies",
            "active_conditions",
            "current_medications",
            "last_visit_date",
            "last_visit_clinic",
            "pending_results",
            "alerts",
        }

        # Content (allergy parsing + severe allergy alert)
        assert any("Penicillin" in allergy for allergy in data["allergies"])
        assert any("SEVERE ALLERGY" in alert for alert in data["alerts"])

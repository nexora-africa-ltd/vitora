"""
Tests for Patient clinical summary fields (allergy_summary, chronic_conditions_summary).

These read-only computed fields aggregate data from the structured Allergy model
and the latest Encounter's medical history to provide a quick clinical overview
on the Patient API response — useful for discharge forms, patient headers, and AI context.

TDD: Tests written BEFORE implementation.
"""

import pytest  # type: ignore
from rest_framework import status
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture
def auth_client(db, sample_organization, sample_facility, sample_department, sample_role):
    """Provide authenticated API client with multitenancy context."""
    from datetime import date

    from django.contrib.auth import get_user_model

    from hmis.apps.core.models import StaffProfile

    User = get_user_model()
    user = User.objects.create_user(
        username="clinicalsummaryuser",
        password="testpass123",
        email="clinical@test.com",
    )
    StaffProfile.objects.get_or_create(
        user=user,
        defaults={
            "employee_id": "CS-0001",
            "organization": sample_organization,
            "primary_facility": sample_facility,
            "primary_department": sample_department,
            "primary_role": sample_role,
            "date_joined": date.today(),
        },
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


class TestPatientAllergySummary:
    """Tests for the allergy_summary computed field on PatientSerializer."""

    def test_patient_with_no_allergies_returns_empty_list(self, auth_client, sample_patient):
        """Should return an empty list when patient has no allergies."""
        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["allergy_summary"] == []

    def test_patient_with_active_allergies_returns_substances(
        self,
        auth_client,
        sample_patient,
        sample_organization,
    ):
        """Should return list of active allergy substances."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            reaction_type="rash",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )
        Allergy.objects.create(
            patient=sample_patient,
            substance="Peanuts",
            substance_type="food",
            reaction_type="anaphylaxis",
            severity="severe",
            status="active",
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        assert response.status_code == status.HTTP_200_OK
        summary = response.data["allergy_summary"]
        assert len(summary) == 2
        assert "Penicillin" in summary
        assert "Peanuts" in summary

    def test_inactive_allergies_are_excluded(
        self, auth_client, sample_patient, sample_organization
    ):
        """Should only include active allergies in summary."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Penicillin",
            substance_type="medication",
            reaction_type="rash",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )
        Allergy.objects.create(
            patient=sample_patient,
            substance="Aspirin",
            substance_type="medication",
            reaction_type="hives",
            severity="mild",
            status="resolved",
            organization=sample_organization,
        )

        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        summary = response.data["allergy_summary"]
        assert len(summary) == 1
        assert "Penicillin" in summary
        assert "Aspirin" not in summary

    def test_allergy_summary_appears_in_list_view(
        self,
        auth_client,
        sample_patient,
        sample_organization,
    ):
        """Should include allergy_summary in list endpoint too."""
        from hmis.apps.patients.models import Allergy

        Allergy.objects.create(
            patient=sample_patient,
            substance="Latex",
            substance_type="environmental",
            reaction_type="rash",
            severity="moderate",
            status="active",
            organization=sample_organization,
        )

        response = auth_client.get("/api/patients/")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        patient_data = next((p for p in results if p["id"] == sample_patient.id), None)
        assert patient_data is not None
        assert "Latex" in patient_data["allergy_summary"]


class TestPatientChronicConditionsSummary:
    """Tests for the chronic_conditions_summary computed field."""

    def test_patient_with_no_encounters_returns_empty_string(
        self, auth_client, sample_patient, sample_facility
    ):
        """Should return empty string when patient has no encounters."""
        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["chronic_conditions_summary"] == ""

    def test_patient_returns_latest_encounter_chronic_conditions(
        self, auth_client, sample_patient, sample_facility
    ):
        """Should return chronic conditions from the most recent encounter."""
        from hmis.apps.encounters.models import Encounter

        # Older encounter
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            chronic_conditions="Hypertension",
            facility=sample_facility,
        )
        # Newer encounter
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Follow-up",
            chronic_conditions="Hypertension, Type 2 Diabetes",
            facility=sample_facility,
        )

        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["chronic_conditions_summary"] == "Hypertension, Type 2 Diabetes"

    def test_empty_chronic_conditions_on_latest_encounter(
        self, auth_client, sample_patient, sample_facility
    ):
        """Should return empty string if latest encounter has no chronic conditions."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Checkup",
            chronic_conditions="Asthma",
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Minor issue",
            chronic_conditions="",
            facility=sample_facility,
        )

        response = auth_client.get(f"/api/patients/{sample_patient.id}/")
        # Latest encounter has empty — return that (point-in-time accuracy)
        assert response.data["chronic_conditions_summary"] == ""

    def test_allergy_summary_is_read_only(self, auth_client, sample_patient, sample_facility):
        """Should not allow setting allergy_summary via PATCH."""
        response = auth_client.patch(
            f"/api/patients/{sample_patient.id}/",
            {"allergy_summary": ["Fake allergy"]},
            format="json",
        )
        # Should succeed but ignore the field
        assert response.status_code == status.HTTP_200_OK
        assert response.data["allergy_summary"] == []

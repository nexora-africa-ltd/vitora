"""
Tests for Medical History section in Encounter model - Sprint 0.7

Following TDD principles: Write tests FIRST, then implement.
Item b) Medical History: Allergies, chronic conditions, medications, surgeries, etc.
"""

import pytest  # type: ignore


@pytest.mark.django_db
class TestMedicalHistoryFields:
    """Test suite for medical history fields in Encounter model."""

    def test_encounter_has_allergies_field(self):
        """Test that Encounter model has allergies field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "allergies")

    def test_encounter_has_chronic_conditions_field(self):
        """Test that Encounter model has chronic_conditions field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "chronic_conditions")

    def test_encounter_has_current_medications_field(self):
        """Test that Encounter model has current_medications field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "current_medications")

    def test_encounter_has_past_surgeries_field(self):
        """Test that Encounter model has past_surgeries field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "past_surgeries")

    def test_encounter_has_family_history_field(self):
        """Test that Encounter model has family_history field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "family_history")

    def test_encounter_has_social_history_field(self):
        """Test that Encounter model has social_history field."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "social_history")


@pytest.mark.django_db
class TestMedicalHistoryModel:
    """Test suite for medical history functionality."""

    def test_create_encounter_with_allergies(self, sample_patient, sample_facility):
        """Test creating encounter with allergies."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Routine checkup",
            allergies="Penicillin, Sulfa drugs",
            facility=sample_facility,
        )

        assert encounter.allergies == "Penicillin, Sulfa drugs"

    def test_create_encounter_with_chronic_conditions(self, sample_patient, sample_facility):
        """Test creating encounter with chronic conditions."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Follow-up visit",
            chronic_conditions="Type 2 Diabetes, Hypertension",
            facility=sample_facility,
        )

        assert encounter.chronic_conditions == "Type 2 Diabetes, Hypertension"

    def test_create_encounter_with_current_medications(self, sample_patient, sample_facility):
        """Test creating encounter with current medications."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Medication review",
            current_medications="Metformin 500mg BD, Lisinopril 10mg OD",
            facility=sample_facility,
        )

        assert "Metformin" in encounter.current_medications

    def test_create_encounter_with_past_surgeries(self, sample_patient, sample_facility):
        """Test creating encounter with past surgeries."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Pre-op assessment",
            past_surgeries="Appendectomy (2015), Cesarean section (2018)",
            facility=sample_facility,
        )

        assert "Appendectomy" in encounter.past_surgeries

    def test_create_encounter_with_family_history(self, sample_patient, sample_facility):
        """Test creating encounter with family history."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Screening",
            family_history="Father: Diabetes, Mother: Hypertension, Sibling: Asthma",
            facility=sample_facility,
        )

        assert "Diabetes" in encounter.family_history

    def test_create_encounter_with_social_history(self, sample_patient, sample_facility):
        """Test creating encounter with social history."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="General checkup",
            social_history="Non-smoker, Occasional alcohol, Sedentary lifestyle",
            facility=sample_facility,
        )

        assert "Non-smoker" in encounter.social_history

    def test_medical_history_fields_are_optional(self, sample_patient, sample_facility):
        """Test all medical history fields are optional."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Quick visit",
            # No medical history fields provided,
            facility=sample_facility,
        )

        assert encounter.allergies == ""
        assert encounter.chronic_conditions == ""
        assert encounter.current_medications == ""
        assert encounter.past_surgeries == ""
        assert encounter.family_history == ""
        assert encounter.social_history == ""

    def test_create_encounter_with_full_medical_history(self, sample_patient, sample_facility):
        """Test creating encounter with complete medical history."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Comprehensive assessment",
            allergies="Penicillin",
            chronic_conditions="Diabetes Type 2, Hypertension",
            current_medications="Metformin 500mg, Lisinopril 10mg",
            past_surgeries="Appendectomy 2010",
            family_history="Father: Heart disease",
            social_history="Non-smoker, exercises regularly",
            facility=sample_facility,
        )

        assert encounter.allergies == "Penicillin"
        assert encounter.chronic_conditions == "Diabetes Type 2, Hypertension"
        assert encounter.current_medications == "Metformin 500mg, Lisinopril 10mg"
        assert encounter.past_surgeries == "Appendectomy 2010"
        assert encounter.family_history == "Father: Heart disease"
        assert encounter.social_history == "Non-smoker, exercises regularly"


@pytest.mark.django_db
class TestMedicalHistoryAPI:
    """Test suite for medical history via API."""

    def test_create_encounter_with_medical_history_via_api(
        self, authenticated_client, sample_patient
    ):
        """Test creating encounter with medical history via API."""
        data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Routine visit",
            "allergies": "Aspirin, Ibuprofen",
            "chronic_conditions": "Asthma",
            "current_medications": "Salbutamol inhaler PRN",
        }

        response = authenticated_client.post("/api/encounters/", data, format="json")

        assert response.status_code == 201
        assert response.data["allergies"] == "Aspirin, Ibuprofen"
        assert response.data["chronic_conditions"] == "Asthma"
        assert response.data["current_medications"] == "Salbutamol inhaler PRN"

    def test_medical_history_in_encounter_response(self, authenticated_client, sample_patient, sample_facility):
        """Test medical history fields included in encounter response."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            allergies="NKDA",
            chronic_conditions="None",
            facility=sample_facility,
        )

        response = authenticated_client.get(f"/api/encounters/{encounter.id}/")

        assert response.status_code == 200
        assert "allergies" in response.data
        assert "chronic_conditions" in response.data
        assert "current_medications" in response.data
        assert "past_surgeries" in response.data
        assert "family_history" in response.data
        assert "social_history" in response.data

    def test_update_medical_history_via_api(self, authenticated_client, sample_patient, sample_facility):
        """Test updating medical history via API."""
        from hmis.apps.encounters.models import Encounter

        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Initial visit",
            allergies="None known",
            facility=sample_facility,
        )

        response = authenticated_client.patch(
            f"/api/encounters/{encounter.id}/",
            {
                "allergies": "Penicillin (discovered today)",
                "chronic_conditions": "Newly diagnosed: Type 2 Diabetes",
            },
            format="json",
        )

        assert response.status_code == 200
        assert "Penicillin" in response.data["allergies"]
        assert "Type 2 Diabetes" in response.data["chronic_conditions"]

    def test_medical_history_empty_strings_allowed(self, authenticated_client, sample_patient):
        """Test that empty strings are allowed for medical history fields."""
        data = {
            "patient": sample_patient.id,
            "encounter_type": "OPD",
            "chief_complaint": "Quick consult",
            "allergies": "",
            "chronic_conditions": "",
        }

        response = authenticated_client.post("/api/encounters/", data, format="json")

        assert response.status_code == 201
        assert response.data["allergies"] == ""

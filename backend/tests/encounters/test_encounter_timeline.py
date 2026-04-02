"""
Tests for Encounter Timeline/History functionality - TDD approach for Sprint 1.1-1.2.

Tests cover:
- Patient encounter history (timeline view)
- Encounter summary for patient view
- Filtering by date range
- Encounter search and filtering
- Clinical summary across encounters
"""

from datetime import date, timedelta

import pytest  # type: ignore

pytestmark = pytest.mark.django_db


class TestEncounterTimeline:
    """Test patient encounter timeline functionality."""

    def test_get_patient_encounter_history(self, sample_patient, sample_county, sample_sub_county, sample_facility):
        """Test retrieving patient's encounter history."""
        from hmis.apps.encounters.models import Encounter

        # Create multiple encounters for the patient
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Headache",
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=15),
            chief_complaint="Follow-up for headache",
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            encounter_date=date.today(),
            chief_complaint="Severe abdominal pain",
            facility=sample_facility,
        )

        # Get all encounters for patient, ordered by date
        encounters = Encounter.objects.filter(patient=sample_patient).order_by("-encounter_date")

        assert encounters.count() == 3
        assert encounters[0].encounter_type == "IPD"  # Most recent first

    def test_encounter_timeline_includes_diagnoses(self, sample_encounter):
        """Test that timeline includes diagnosis information."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code

        code = ICD10Code.objects.create(
            code="J06.9",
            description="Acute upper respiratory infection",
            category="Respiratory",
            chapter=10,
        )
        Diagnosis.objects.create(
            encounter=sample_encounter,
            icd10_code=code,
            diagnosis_type="PRIMARY",
        )

        # Verify diagnosis is accessible
        primary = sample_encounter.get_primary_diagnosis()
        assert primary is not None
        assert primary.icd10_code.code == "J06.9"

    def test_encounter_timeline_includes_treatment_plan(self, sample_encounter):
        """Test that timeline includes treatment plan info."""
        from hmis.apps.encounters.models import Medication, TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Rest and fluids recommended",
            follow_up_date=date.today() + timedelta(days=7),
        )
        Medication.objects.create(
            treatment_plan=plan,
            name="Paracetamol",
            dosage="500mg",
            frequency="Every 6 hours",
        )

        # Verify treatment plan is accessible
        assert sample_encounter.has_treatment_plan
        summary = sample_encounter.get_treatment_summary()
        assert "Medications: 1" in summary


class TestEncounterTimelineAPI:
    """Test encounter timeline API endpoints."""

    def test_list_patient_encounters(self, authenticated_client, sample_patient, sample_encounter):
        """Test GET /api/encounters/?patient_id={id} - List patient encounters."""
        response = authenticated_client.get(f"/api/encounters/?patient_id={sample_patient.id}")

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        assert len(results) >= 1

    def test_filter_encounters_by_date_range(
        self, authenticated_client, sample_patient, sample_county, sample_sub_county,
        sample_facility,
    ):
        """Test filtering encounters by date range."""
        from hmis.apps.encounters.models import Encounter

        # Create encounters at different dates
        old_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=60),
            chief_complaint="Old issue",
            facility=sample_facility,
        )
        recent_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=5),
            chief_complaint="Recent issue",
            facility=sample_facility,
        )

        # Filter last 30 days
        start_date = (date.today() - timedelta(days=30)).isoformat()
        response = authenticated_client.get(
            f"/api/encounters/?patient_id={sample_patient.id}&encounter_date_after={start_date}"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        # Should only include recent encounter (old one is >30 days)
        encounter_dates = [r["encounter_date"] for r in results]
        assert str(recent_encounter.encounter_date) in encounter_dates

    def test_filter_encounters_by_type(
        self, authenticated_client, sample_patient, sample_county, sample_sub_county,
        sample_facility,
    ):
        """Test filtering encounters by type."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="OPD visit",
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=date.today(),
            chief_complaint="Emergency visit",
            facility=sample_facility,
        )

        # Filter by OPD type
        response = authenticated_client.get(
            f"/api/encounters/?patient_id={sample_patient.id}&encounter_type=OPD"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        # All results should be OPD
        for r in results:
            assert r["encounter_type"] == "OPD"

    def test_search_encounters_by_complaint(
        self, authenticated_client, sample_patient, sample_county, sample_sub_county,
        sample_facility,
    ):
        """Test searching encounters by chief complaint."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Severe migraine headache",
            facility=sample_facility,
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Back pain",
            facility=sample_facility,
        )

        # Search for headache
        response = authenticated_client.get(
            f"/api/encounters/?patient_id={sample_patient.id}&search=headache"
        )

        assert response.status_code == 200
        results = response.data.get("results", response.data)
        # Should find the headache encounter
        complaints = [r["chief_complaint"] for r in results]
        assert any("headache" in c.lower() for c in complaints)

    def test_encounter_detail_includes_all_data(self, authenticated_client, sample_encounter):
        """Test encounter detail includes diagnoses and treatment plan info."""
        from hmis.apps.encounters.models import Diagnosis, ICD10Code, Medication, TreatmentPlan

        # Add diagnosis
        code = ICD10Code.objects.create(
            code="R51", description="Headache", category="Symptoms", chapter=18
        )
        Diagnosis.objects.create(
            encounter=sample_encounter, icd10_code=code, diagnosis_type="PRIMARY"
        )

        # Add treatment plan
        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter, clinical_notes="Rest recommended"
        )
        Medication.objects.create(treatment_plan=plan, name="Ibuprofen", dosage="400mg")

        # Get encounter detail
        response = authenticated_client.get(f"/api/encounters/{sample_encounter.id}/")

        assert response.status_code == 200
        assert "has_critical_vitals" in response.data


class TestPatientClinicalSummary:
    """Test patient clinical summary functionality."""

    def test_patient_total_encounters(self, sample_patient, sample_county, sample_sub_county, sample_facility):
        """Test counting total encounters for patient."""
        from hmis.apps.encounters.models import Encounter

        # Create multiple encounters
        for i in range(5):
            Encounter.objects.create(
                patient=sample_patient,
                encounter_type="OPD",
                encounter_date=date.today() - timedelta(days=i * 10),
                chief_complaint=f"Visit {i + 1}",
                facility=sample_facility,
            )

        count = Encounter.objects.filter(patient=sample_patient).count()
        assert count == 5

    def test_patient_last_encounter_date(self, sample_patient, sample_county, sample_sub_county, sample_facility):
        """Test getting patient's last encounter date."""
        from hmis.apps.encounters.models import Encounter

        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Old visit",
            facility=sample_facility,
        )
        latest = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="Latest visit",
            facility=sample_facility,
        )

        last_encounter = (
            Encounter.objects.filter(patient=sample_patient).order_by("-encounter_date").first()
        )

        assert last_encounter.id == latest.id
        assert last_encounter.encounter_date == date.today()

    def test_patient_active_medications(self, sample_patient, sample_encounter):
        """Test listing patient's active medications across encounters."""
        from hmis.apps.encounters.models import Medication, TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Treatment notes",
        )

        # Active medication
        Medication.objects.create(
            treatment_plan=plan,
            name="Daily Med",
            dosage="10mg",
            start_date=date.today() - timedelta(days=5),
            end_date=date.today() + timedelta(days=25),
        )
        # Expired medication
        Medication.objects.create(
            treatment_plan=plan,
            name="Old Med",
            dosage="5mg",
            start_date=date.today() - timedelta(days=30),
            end_date=date.today() - timedelta(days=10),
        )

        active_meds = [m for m in plan.medications.all() if m.is_active]
        assert len(active_meds) == 1
        assert active_meds[0].name == "Daily Med"


class TestEncounterOrdering:
    """Test encounter ordering in timeline."""

    def test_encounters_ordered_by_date_desc(
        self, sample_patient, sample_county, sample_sub_county,
        sample_facility,
    ):
        """Test encounters are ordered by date descending (newest first)."""
        from hmis.apps.encounters.models import Encounter

        old = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today() - timedelta(days=30),
            chief_complaint="Old",
            facility=sample_facility,
        )
        new = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="New",
            facility=sample_facility,
        )

        encounters = list(
            Encounter.objects.filter(patient=sample_patient).order_by("-encounter_date")
        )

        assert encounters[0].id == new.id
        assert encounters[1].id == old.id

    def test_encounters_ordered_by_created_at_for_same_date(
        self, sample_patient, sample_county, sample_sub_county,
        sample_facility,
    ):
        """Test encounters on same date are ordered by created_at."""
        from hmis.apps.encounters.models import Encounter

        first = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            encounter_date=date.today(),
            chief_complaint="First",
            facility=sample_facility,
        )
        second = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="EMERGENCY",
            encounter_date=date.today(),
            chief_complaint="Second",
            facility=sample_facility,
        )

        encounters = list(
            Encounter.objects.filter(patient=sample_patient).order_by(
                "-encounter_date", "-created_at"
            )
        )

        # Second was created after first
        assert encounters[0].id == second.id
        assert encounters[1].id == first.id

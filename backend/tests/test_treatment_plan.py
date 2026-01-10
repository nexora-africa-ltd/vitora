"""
Tests for Treatment Plan functionality - TDD approach for Sprint 1.1-1.2.

Tests cover:
- TreatmentPlan model (linked to Encounter)
- Medication model (prescriptions)
- Clinical notes and follow-up instructions
- Treatment plan templates
- API endpoints for CRUD operations
"""

from datetime import date, timedelta

import pytest # type: ignore
from django.core.exceptions import ValidationError

pytestmark = pytest.mark.django_db


class TestTreatmentPlanModel:
    """Test TreatmentPlan model."""

    def test_create_treatment_plan(self, sample_encounter):
        """Test creating a basic treatment plan."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Patient presents with acute bronchitis.",
            follow_up_instructions="Return in 7 days if symptoms persist.",
            follow_up_date=date.today() + timedelta(days=7),
        )

        assert plan.id is not None
        assert plan.encounter == sample_encounter
        assert "bronchitis" in plan.clinical_notes
        assert plan.follow_up_date == date.today() + timedelta(days=7)

    def test_treatment_plan_string_representation(self, sample_encounter):
        """Test treatment plan __str__ method."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Treatment notes",
        )

        assert str(plan) == f"Treatment Plan for Encounter {sample_encounter.id}"

    def test_treatment_plan_one_per_encounter(self, sample_encounter):
        """Test that only one treatment plan is allowed per encounter."""
        from hmis.apps.encounters.models import TreatmentPlan

        TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="First plan",
        )

        # Attempting to create second plan should raise error
        plan2 = TreatmentPlan(
            encounter=sample_encounter,
            clinical_notes="Second plan",
        )
        with pytest.raises(ValidationError):
            plan2.full_clean()

    def test_treatment_plan_status_choices(self, sample_encounter):
        """Test treatment plan status field."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan notes",
            status="ACTIVE",
        )

        assert plan.status == "ACTIVE"

        plan.status = "COMPLETED"
        plan.save()
        plan.refresh_from_db()
        assert plan.status == "COMPLETED"

    def test_treatment_plan_has_follow_up(self, sample_encounter):
        """Test checking if treatment plan has follow-up scheduled."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan_with_followup = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan with follow-up",
            follow_up_date=date.today() + timedelta(days=7),
        )

        assert plan_with_followup.has_follow_up is True

    def test_treatment_plan_no_follow_up(self, sample_encounter):
        """Test checking treatment plan without follow-up."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan_without_followup = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan without follow-up",
            follow_up_date=None,
        )

        assert plan_without_followup.has_follow_up is False


class TestMedicationModel:
    """Test Medication (prescription) model."""

    @pytest.fixture
    def sample_treatment_plan(self, sample_encounter):
        """Create a sample treatment plan for medication tests."""
        from hmis.apps.encounters.models import TreatmentPlan

        return TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Test treatment plan",
        )

    def test_create_medication(self, sample_treatment_plan):
        """Test creating a medication prescription."""
        from hmis.apps.encounters.models import Medication

        medication = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Amoxicillin",
            dosage="500mg",
            frequency="Three times daily",
            duration="7 days",
            quantity=21,
            instructions="Take with food",
        )

        assert medication.id is not None
        assert medication.name == "Amoxicillin"
        assert medication.dosage == "500mg"
        assert medication.quantity == 21

    def test_medication_string_representation(self, sample_treatment_plan):
        """Test medication __str__ method."""
        from hmis.apps.encounters.models import Medication

        medication = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Paracetamol",
            dosage="500mg",
            frequency="Every 6 hours as needed",
        )

        assert str(medication) == "Paracetamol 500mg"

    def test_medication_route_choices(self, sample_treatment_plan):
        """Test medication route field."""
        from hmis.apps.encounters.models import Medication

        medication = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="IV Fluids",
            dosage="Normal Saline 1L",
            route="IV",
        )

        assert medication.route == "IV"

    def test_multiple_medications_per_plan(self, sample_treatment_plan):
        """Test treatment plan can have multiple medications."""
        from hmis.apps.encounters.models import Medication

        Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Amoxicillin",
            dosage="500mg",
            frequency="TDS",
        )
        Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Paracetamol",
            dosage="1g",
            frequency="PRN",
        )
        Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Ibuprofen",
            dosage="400mg",
            frequency="BD",
        )

        assert sample_treatment_plan.medications.count() == 3

    def test_medication_required_fields(self, sample_treatment_plan):
        """Test that name and dosage are required."""
        from hmis.apps.encounters.models import Medication

        # Missing name
        with pytest.raises(ValidationError):
            med = Medication(treatment_plan=sample_treatment_plan, dosage="500mg")
            med.full_clean()

    def test_medication_start_and_end_dates(self, sample_treatment_plan):
        """Test medication with start and end dates."""
        from hmis.apps.encounters.models import Medication

        start = date.today()
        end = start + timedelta(days=7)

        medication = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Prednisone",
            dosage="40mg daily tapering",
            start_date=start,
            end_date=end,
        )

        assert medication.start_date == start
        assert medication.end_date == end

    def test_medication_is_active(self, sample_treatment_plan):
        """Test medication active status based on dates."""
        from hmis.apps.encounters.models import Medication

        # Active medication (current)
        active_med = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Current Med",
            dosage="10mg",
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=5),
        )

        assert active_med.is_active is True

        # Expired medication
        expired_med = Medication.objects.create(
            treatment_plan=sample_treatment_plan,
            name="Old Med",
            dosage="5mg",
            start_date=date.today() - timedelta(days=10),
            end_date=date.today() - timedelta(days=3),
        )

        assert expired_med.is_active is False


@pytest.mark.integration
class TestTreatmentPlanAPI:
    """Test TreatmentPlan API endpoints."""

    def test_get_treatment_plan_for_encounter(self, authenticated_client, sample_encounter):
        """Test GET /api/encounters/{id}/treatment-plan/ - Get treatment plan."""
        from hmis.apps.encounters.models import TreatmentPlan

        TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Treatment notes here",
            follow_up_instructions="Come back in a week",
        )

        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/"
        )

        assert response.status_code == 200
        assert "clinical_notes" in response.data
        assert response.data["clinical_notes"] == "Treatment notes here"

    def test_create_treatment_plan(self, authenticated_client, sample_encounter):
        """Test POST /api/encounters/{id}/treatment-plan/ - Create treatment plan."""
        data = {
            "clinical_notes": "New treatment plan notes",
            "follow_up_instructions": "Schedule follow-up",
            "follow_up_date": (date.today() + timedelta(days=14)).isoformat(),
            "status": "ACTIVE",
        }

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/",
            data=data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["clinical_notes"] == "New treatment plan notes"

    def test_update_treatment_plan(self, authenticated_client, sample_encounter):
        """Test PUT /api/encounters/{id}/treatment-plan/ - Update treatment plan."""
        from hmis.apps.encounters.models import TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Original notes",
            status="ACTIVE",
        )

        data = {
            "clinical_notes": "Updated treatment notes",
            "status": "COMPLETED",
        }

        response = authenticated_client.patch(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/",
            data=data,
            format="json",
        )

        assert response.status_code == 200
        plan.refresh_from_db()
        assert plan.clinical_notes == "Updated treatment notes"
        assert plan.status == "COMPLETED"

    def test_add_medication_to_plan(self, authenticated_client, sample_encounter):
        """Test POST /api/encounters/{id}/treatment-plan/medications/ - Add medication."""
        from hmis.apps.encounters.models import TreatmentPlan

        TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan notes",
        )

        data = {
            "name": "Amoxicillin",
            "dosage": "500mg",
            "frequency": "Three times daily",
            "duration": "7 days",
            "quantity": 21,
            "instructions": "Take after meals",
        }

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/medications/",
            data=data,
            format="json",
        )

        assert response.status_code == 201
        assert response.data["name"] == "Amoxicillin"

    def test_list_medications_for_plan(self, authenticated_client, sample_encounter):
        """Test GET /api/encounters/{id}/treatment-plan/medications/ - List medications."""
        from hmis.apps.encounters.models import Medication, TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan notes",
        )

        Medication.objects.create(treatment_plan=plan, name="Med1", dosage="10mg")
        Medication.objects.create(treatment_plan=plan, name="Med2", dosage="20mg")

        response = authenticated_client.get(
            f"/api/encounters/{sample_encounter.id}/treatment-plan/medications/"
        )

        assert response.status_code == 200
        # Handle paginated response
        results = (
            response.data.get("results", response.data)
            if isinstance(response.data, dict)
            else response.data
        )
        assert len(results) == 2


class TestEncounterWithTreatmentPlan:
    """Test Encounter integration with TreatmentPlan."""

    def test_encounter_has_treatment_plan_property(self, sample_encounter):
        """Test encounter.has_treatment_plan property."""
        from hmis.apps.encounters.models import TreatmentPlan

        assert sample_encounter.has_treatment_plan is False

        TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Plan created",
        )

        # Refresh and check
        sample_encounter.refresh_from_db()
        assert sample_encounter.has_treatment_plan is True

    def test_encounter_get_treatment_summary(self, sample_encounter):
        """Test encounter.get_treatment_summary() method."""
        from hmis.apps.encounters.models import Medication, TreatmentPlan

        plan = TreatmentPlan.objects.create(
            encounter=sample_encounter,
            clinical_notes="Treatment for infection",
            follow_up_date=date.today() + timedelta(days=7),
        )

        Medication.objects.create(
            treatment_plan=plan,
            name="Amoxicillin",
            dosage="500mg",
            frequency="TDS",
        )

        summary = sample_encounter.get_treatment_summary()
        assert "Medications: 1" in summary
        assert "Follow-up:" in summary

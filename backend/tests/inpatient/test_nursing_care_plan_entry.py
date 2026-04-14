"""
Tests for NursingCarePlanEntry model and API.

Follows the ADPIE nursing process structure matching the Kenya physical
"Nursing Care Plan for 24 Hours" form:
- Assessment (cluster of cues)
- Nursing Diagnosis
- Goal and Outcome Criteria
- Nursing Plan of Action/Intervention
- Scientific Rationale
- Implementation
- Evaluation
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.inpatient.models import NursingCarePlanEntry, NursingKardex

# =============================================================================
# Model Tests
# =============================================================================


@pytest.mark.django_db
class TestNursingCarePlanEntryModel:
    """Tests for NursingCarePlanEntry model."""

    def test_create_care_plan_entry(self, sample_admission, test_user):
        """Should create a care plan entry with all ADPIE fields."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Patient presents with elevated temperature (38.5°C), chills, and diaphoresis",
            nursing_diagnosis="Risk for infection related to compromised immune system",
            goal_and_outcome_criteria="Temperature returns to normal range (36.5-37.5°C) within 24 hours",
            plan_of_action="Monitor temperature q4h, administer prescribed antipyretics, maintain hydration",
            scientific_rationale="Frequent monitoring allows early detection of worsening infection; antipyretics lower temperature through prostaglandin inhibition",
            implementation="",
            evaluation="",
        )

        assert entry.id is not None
        assert entry.kardex == kardex
        assert entry.recorded_by == test_user
        assert entry.status == "ACTIVE"
        assert "elevated temperature" in entry.assessment
        assert "Risk for infection" in entry.nursing_diagnosis
        assert "Temperature returns" in entry.goal_and_outcome_criteria

    def test_care_plan_entry_default_status_active(self, sample_admission, test_user):
        """Default status should be ACTIVE."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        assert entry.status == "ACTIVE"

    def test_care_plan_entry_status_choices(self, sample_admission, test_user):
        """Should accept valid status choices."""
        kardex = sample_admission.kardex

        for entry_status in ["ACTIVE", "RESOLVED", "ONGOING"]:
            entry = NursingCarePlanEntry.objects.create(
                kardex=kardex,
                recorded_at=timezone.now(),
                recorded_by=test_user,
                assessment="Assessment",
                nursing_diagnosis=f"Diagnosis for {entry_status}",
                goal_and_outcome_criteria="Goal",
                plan_of_action="Plan",
                scientific_rationale="Rationale",
                status=entry_status,
            )
            assert entry.status == entry_status

    def test_implementation_and_evaluation_optional(self, sample_admission, test_user):
        """Implementation and evaluation fields should be optional (blank=True)."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
            # implementation and evaluation intentionally omitted
        )

        assert entry.implementation == ""
        assert entry.evaluation == ""

    def test_update_implementation_and_evaluation(self, sample_admission, test_user):
        """Should be able to add implementation and evaluation after creation."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Patient reports pain 7/10 at incision site",
            nursing_diagnosis="Acute pain related to surgical intervention",
            goal_and_outcome_criteria="Patient reports pain reduced to 3/10 within 1 hour",
            plan_of_action="Administer prescribed analgesic (Paracetamol 1g PO)",
            scientific_rationale="Paracetamol inhibits COX enzymes, reducing pain mediators",
        )

        # Later: nurse adds implementation
        entry.implementation = "Administered Paracetamol 1g PO at 14:00hrs. Patient positioned comfortably."
        entry.save()

        entry.refresh_from_db()
        assert "Paracetamol 1g PO" in entry.implementation

        # Later: nurse evaluates
        entry.evaluation = "Pain reduced to 3/10 at 15:00hrs. Goal met. Continue monitoring."
        entry.status = "RESOLVED"
        entry.save()

        entry.refresh_from_db()
        assert "Goal met" in entry.evaluation
        assert entry.status == "RESOLVED"

    def test_multiple_entries_per_kardex(self, sample_admission, test_user):
        """A Kardex should support multiple care plan entries."""
        kardex = sample_admission.kardex

        entry1 = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Dry mucous membranes, poor skin turgor",
            nursing_diagnosis="Deficient fluid volume",
            goal_and_outcome_criteria="Adequate hydration restored within 8 hours",
            plan_of_action="Start IV fluids as prescribed, monitor I&O",
            scientific_rationale="IV fluid replacement corrects fluid deficit",
        )

        entry2 = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Limited mobility post-surgery, confined to bed",
            nursing_diagnosis="Impaired physical mobility",
            goal_and_outcome_criteria="Patient performs assisted ambulation within 24 hours",
            plan_of_action="Assist with ROM exercises, progressive ambulation",
            scientific_rationale="Early mobilization prevents complications (DVT, atelectasis)",
        )

        assert kardex.care_plan_entries.count() == 2
        assert entry1 in kardex.care_plan_entries.all()
        assert entry2 in kardex.care_plan_entries.all()

    def test_ordering_by_recorded_at_descending(self, sample_admission, test_user):
        """Entries should be ordered by recorded_at descending (newest first)."""
        kardex = sample_admission.kardex
        now = timezone.now()

        entry_old = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=now - timezone.timedelta(hours=2),
            recorded_by=test_user,
            assessment="Earlier assessment",
            nursing_diagnosis="Earlier diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        entry_new = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=now,
            recorded_by=test_user,
            assessment="Recent assessment",
            nursing_diagnosis="Recent diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        entries = list(kardex.care_plan_entries.all())
        assert entries[0] == entry_new
        assert entries[1] == entry_old

    def test_cascade_delete_with_kardex(self, sample_admission, test_user):
        """Deleting kardex should cascade delete care plan entries."""
        kardex = sample_admission.kardex

        NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        kardex_id = kardex.id
        assert NursingCarePlanEntry.objects.filter(kardex_id=kardex_id).count() == 1

        kardex.delete()
        assert NursingCarePlanEntry.objects.filter(kardex_id=kardex_id).count() == 0

    def test_str_representation(self, sample_admission, test_user):
        """String representation should include diagnosis and status."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Risk for infection",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        str_repr = str(entry)
        assert "Risk for infection" in str_repr
        assert "Active" in str_repr


# =============================================================================
# API Tests
# =============================================================================


@pytest.mark.django_db
class TestNursingCarePlanEntryAPI:
    """Tests for NursingCarePlanEntry API endpoints."""

    def test_care_plan_entries_in_kardex_response(self, authenticated_client, sample_admission):
        """Kardex detail should include care_plan_entries field."""
        kardex = sample_admission.kardex

        response = authenticated_client.get(f"/api/inpatient/kardex/{kardex.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "care_plan_entries" in response.data

    def test_add_care_plan_entry(self, authenticated_client, sample_admission):
        """Should add a care plan entry via POST to add-care-plan-entry action."""
        kardex = sample_admission.kardex

        data = {
            "recorded_at": timezone.now().isoformat(),
            "assessment": "Patient presents with elevated BP 160/100mmHg, headache, blurred vision",
            "nursing_diagnosis": "Risk for decreased cardiac output related to hypertension",
            "goal_and_outcome_criteria": "BP reduces to <140/90mmHg within 2 hours",
            "plan_of_action": "Administer antihypertensives as prescribed, elevate HOB 30°, reduce stimuli",
            "scientific_rationale": "Antihypertensives reduce peripheral vascular resistance; elevated HOB promotes venous return",
        }

        response = authenticated_client.post(
            f"/api/inpatient/kardex/{kardex.id}/add-care-plan-entry/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["assessment"] == data["assessment"]
        assert response.data["nursing_diagnosis"] == data["nursing_diagnosis"]
        assert response.data["goal_and_outcome_criteria"] == data["goal_and_outcome_criteria"]
        assert response.data["plan_of_action"] == data["plan_of_action"]
        assert response.data["scientific_rationale"] == data["scientific_rationale"]
        assert response.data["status"] == "ACTIVE"
        assert "recorded_by_username" in response.data

    def test_add_care_plan_entry_requires_auth(self, api_client, sample_admission):
        """Should reject unauthenticated requests."""
        kardex = sample_admission.kardex

        data = {
            "recorded_at": timezone.now().isoformat(),
            "assessment": "Assessment",
            "nursing_diagnosis": "Diagnosis",
            "goal_and_outcome_criteria": "Goal",
            "plan_of_action": "Plan",
            "scientific_rationale": "Rationale",
        }

        response = api_client.post(
            f"/api/inpatient/kardex/{kardex.id}/add-care-plan-entry/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_add_care_plan_entry_missing_required_fields(
        self, authenticated_client, sample_admission
    ):
        """Should reject entry missing required fields."""
        kardex = sample_admission.kardex

        # Missing nursing_diagnosis and other required fields
        data = {
            "recorded_at": timezone.now().isoformat(),
            "assessment": "Assessment only",
        }

        response = authenticated_client.post(
            f"/api/inpatient/kardex/{kardex.id}/add-care-plan-entry/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_care_plan_entry_implementation(
        self, authenticated_client, sample_admission, test_user
    ):
        """Should update implementation field on existing care plan entry."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        response = authenticated_client.patch(
            f"/api/inpatient/kardex/{kardex.id}/update-care-plan-entry/{entry.id}/",
            {"implementation": "Administered treatment as per plan at 14:00hrs"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert "Administered treatment" in response.data["implementation"]

    def test_update_care_plan_entry_evaluation_and_resolve(
        self, authenticated_client, sample_admission, test_user
    ):
        """Should update evaluation and status to RESOLVED."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Assessment",
            nursing_diagnosis="Diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        response = authenticated_client.patch(
            f"/api/inpatient/kardex/{kardex.id}/update-care-plan-entry/{entry.id}/",
            {
                "evaluation": "Goals met. Patient stable.",
                "status": "RESOLVED",
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["evaluation"] == "Goals met. Patient stable."
        assert response.data["status"] == "RESOLVED"

    def test_update_care_plan_entry_rejects_core_field_change(
        self, authenticated_client, sample_admission, test_user
    ):
        """Should not allow updating assessment, diagnosis, or other core fields."""
        kardex = sample_admission.kardex

        entry = NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="Original assessment",
            nursing_diagnosis="Original diagnosis",
            goal_and_outcome_criteria="Goal",
            plan_of_action="Plan",
            scientific_rationale="Rationale",
        )

        response = authenticated_client.patch(
            f"/api/inpatient/kardex/{kardex.id}/update-care-plan-entry/{entry.id}/",
            {"assessment": "Tampered assessment"},
            format="json",
        )

        # Should reject because 'assessment' is not in allowed_fields
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No valid fields" in response.data["error"]

    def test_update_nonexistent_care_plan_entry(
        self, authenticated_client, sample_admission
    ):
        """Should return 404 for nonexistent entry."""
        kardex = sample_admission.kardex

        response = authenticated_client.patch(
            f"/api/inpatient/kardex/{kardex.id}/update-care-plan-entry/99999/",
            {"implementation": "Something"},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_care_plan_entries_nested_in_kardex_detail(
        self, authenticated_client, sample_admission, test_user
    ):
        """Kardex detail should serialize care plan entries with all fields."""
        kardex = sample_admission.kardex

        NursingCarePlanEntry.objects.create(
            kardex=kardex,
            recorded_at=timezone.now(),
            recorded_by=test_user,
            assessment="High fever, chills",
            nursing_diagnosis="Hyperthermia",
            goal_and_outcome_criteria="Temp normalizes",
            plan_of_action="Tepid sponging, antipyretics",
            scientific_rationale="Evaporative cooling reduces body temperature",
            implementation="Tepid sponging done at 10:00hrs",
            evaluation="Temp reduced from 39.2 to 37.8",
            status="RESOLVED",
        )

        response = authenticated_client.get(f"/api/inpatient/kardex/{kardex.id}/")
        assert response.status_code == status.HTTP_200_OK

        entries = response.data["care_plan_entries"]
        assert len(entries) == 1

        entry = entries[0]
        assert entry["assessment"] == "High fever, chills"
        assert entry["nursing_diagnosis"] == "Hyperthermia"
        assert entry["goal_and_outcome_criteria"] == "Temp normalizes"
        assert entry["plan_of_action"] == "Tepid sponging, antipyretics"
        assert entry["scientific_rationale"] == "Evaporative cooling reduces body temperature"
        assert entry["implementation"] == "Tepid sponging done at 10:00hrs"
        assert entry["evaluation"] == "Temp reduced from 39.2 to 37.8"
        assert entry["status"] == "RESOLVED"
        assert entry["status_display"] == "Resolved"
        assert "recorded_by_username" in entry
        assert "recorded_at" in entry

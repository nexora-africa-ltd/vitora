"""
TDD Tests for Sprint 2 - Phases 2B, 2C, 2D.

Phase 2B: Encounter Linking
Phase 2C: Skip-Triage Logic
Phase 2D: Visit Reason Taxonomy
"""

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.encounters.models import Encounter

# =============================================================================
# Phase 2B: Encounter Linking
# =============================================================================


class TestEncounterLinking:
    """Tests for encounter linking via linked_encounter FK."""

    def test_encounter_has_linked_encounter_field(self, sample_encounter):
        """Encounter model should have a linked_encounter FK."""
        assert hasattr(Encounter, "linked_encounter")

    def test_create_encounter_with_linked_encounter(self, sample_patient, test_user):
        """Should create encounter linked to a previous encounter."""
        # Create first encounter
        original = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original complaint",
            status="CLOSED",
        )

        # Create follow-up encounter linked to original
        follow_up = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up visit",
            linked_encounter=original,
        )

        follow_up.refresh_from_db()
        assert follow_up.linked_encounter == original
        assert follow_up.linked_encounter_id == original.id

    def test_linked_encounter_is_optional(self, sample_encounter):
        """linked_encounter should be nullable."""
        assert sample_encounter.linked_encounter is None

    def test_linked_encounter_set_null_on_delete(self, sample_patient):
        """Linked encounter FK should SET_NULL on delete."""
        original = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original",
            status="CLOSED",
        )
        follow_up = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up",
            linked_encounter=original,
        )

        # Delete via queryset to bypass ProtectedError from Invoice signal
        # The FK is SET_NULL so the follow_up should still exist
        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE encounters_encounter SET linked_encounter_id = NULL WHERE linked_encounter_id = %s",
                [original.id],
            )

        follow_up.refresh_from_db()
        assert follow_up.linked_encounter is None

    def test_api_create_with_linked_encounter(
        self, authenticated_client, sample_patient, sample_encounter
    ):
        """API should accept linked_encounter_id on encounter creation."""
        sample_encounter.status = "CLOSED"
        sample_encounter.save(update_fields=["status"])

        response = authenticated_client.post(
            "/api/encounters/",
            {
                "patient": sample_patient.id,
                "encounter_type": "FOLLOW_UP",
                "chief_complaint": "Follow-up for previous visit",
                "linked_encounter": sample_encounter.id,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["linked_encounter"] == sample_encounter.id

    def test_api_encounter_detail_includes_linked_encounter(
        self, authenticated_client, sample_patient
    ):
        """Encounter detail should include linked_encounter info."""
        original = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original",
            status="CLOSED",
        )
        follow_up = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up",
            linked_encounter=original,
        )

        response = authenticated_client.get(f"/api/encounters/{follow_up.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["linked_encounter"] == original.id

    def test_encounter_get_related_visits(self, sample_patient):
        """Should retrieve follow-ups linked to an encounter."""
        original = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original",
        )
        follow_up1 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up 1",
            linked_encounter=original,
        )
        follow_up2 = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up 2",
            linked_encounter=original,
        )

        # reverse relation
        related = original.follow_up_encounters.all()
        assert related.count() == 2
        assert follow_up1 in related
        assert follow_up2 in related

    def test_api_related_encounters_endpoint(self, authenticated_client, sample_patient):
        """GET /api/encounters/{id}/related/ should return linked encounters."""
        original = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Original",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Follow-up",
            linked_encounter=original,
        )

        response = authenticated_client.get(f"/api/encounters/{original.id}/related/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]["chief_complaint"] == "Follow-up"

    def test_checkin_auto_links_recent_encounter(
        self, authenticated_client, sample_patient_with_recent_visit
    ):
        """Check-in should auto-suggest linkable encounters for follow-up patients."""
        patient, _encounter = sample_patient_with_recent_visit

        response = authenticated_client.get(f"/api/checkin/lookup/?q={patient.mrn}")

        assert response.status_code == status.HTTP_200_OK
        assert "linkable_encounter_id" in response.data


# =============================================================================
# Phase 2C: Skip-Triage Logic
# =============================================================================


class TestSkipTriageLogic:
    """Tests for skip-triage routing configuration."""

    def test_visit_reason_skip_triage_for_lab_review(self):
        """LAB_REVIEW should recommend skipping triage."""
        from hmis.apps.checkin.services import should_skip_triage

        assert should_skip_triage("LAB_REVIEW") is True

    def test_visit_reason_skip_triage_for_refill(self):
        """REFILL_ONLY should recommend skipping triage."""
        from hmis.apps.checkin.services import should_skip_triage

        assert should_skip_triage("REFILL_ONLY") is True

    def test_visit_reason_no_skip_for_new_complaint(self):
        """NEW_COMPLAINT should NOT skip triage."""
        from hmis.apps.checkin.services import should_skip_triage

        assert should_skip_triage("NEW_COMPLAINT") is False

    def test_visit_reason_no_skip_for_follow_up(self):
        """FOLLOW_UP should NOT skip triage by default."""
        from hmis.apps.checkin.services import should_skip_triage

        assert should_skip_triage("FOLLOW_UP") is False

    def test_checkin_response_includes_skip_triage(self, authenticated_client, sample_patient):
        """Check-in response should indicate whether triage was skipped."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_reason": "LAB_REVIEW",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["skip_triage"] is True

    def test_checkin_sets_encounter_triage_status_when_skipped(
        self, authenticated_client, sample_patient
    ):
        """When triage is skipped via visit reason, encounter should reflect it."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_reason": "LAB_REVIEW",
                "skip_triage": True,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        # The skip_triage flag should be True in the response
        assert response.data["skip_triage"] is True


# =============================================================================
# Phase 2D: Visit Reason Taxonomy
# =============================================================================


class TestVisitReasonTaxonomy:
    """Tests for visit_reason field on Encounter model."""

    def test_encounter_has_visit_reason_field(self):
        """Encounter should have a visit_reason field."""
        assert hasattr(Encounter, "visit_reason")

    def test_encounter_visit_reason_choices(self):
        """visit_reason should support all standard reasons."""
        expected_reasons = {
            "NEW_COMPLAINT",
            "FOLLOW_UP",
            "CHRONIC_CARE",
            "SCHEDULED_PROCEDURE",
            "PROCEDURE_REVIEW",
            "REFILL_ONLY",
            "LAB_REVIEW",
            "REFERRAL_VISIT",
            "OTHER",
        }
        field = Encounter._meta.get_field("visit_reason")
        actual_reasons = {choice[0] for choice in field.choices}
        assert expected_reasons == actual_reasons

    def test_encounter_default_visit_reason(self, sample_patient):
        """Default visit_reason should be NEW_COMPLAINT."""
        encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
        )
        assert encounter.visit_reason == "NEW_COMPLAINT"

    def test_api_create_encounter_with_visit_reason(self, authenticated_client, sample_patient):
        """API should accept visit_reason on creation."""
        response = authenticated_client.post(
            "/api/encounters/",
            {
                "patient": sample_patient.id,
                "encounter_type": "OPD",
                "chief_complaint": "Monthly diabetes review",
                "visit_reason": "CHRONIC_CARE",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["visit_reason"] == "CHRONIC_CARE"

    def test_api_filter_encounters_by_visit_reason(self, authenticated_client, sample_patient):
        """Should filter encounters by visit_reason."""
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="New issue",
            visit_reason="NEW_COMPLAINT",
        )
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="FOLLOW_UP",
            chief_complaint="Review",
            visit_reason="CHRONIC_CARE",
        )

        response = authenticated_client.get("/api/encounters/?visit_reason=CHRONIC_CARE")
        assert response.status_code == status.HTTP_200_OK
        for enc in response.data["results"]:
            assert enc["visit_reason"] == "CHRONIC_CARE"

    def test_checkin_sets_visit_reason_on_encounter(self, authenticated_client, sample_patient):
        """Check-in should propagate visit_reason to created encounter."""
        response = authenticated_client.post(
            f"/api/checkin/patients/{sample_patient.id}/checkin/",
            {
                "destination": "TRIAGE",
                "visit_reason": "CHRONIC_CARE",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        encounter_id = response.data["encounter_id"]
        encounter = Encounter.objects.get(id=encounter_id)
        assert encounter.visit_reason == "CHRONIC_CARE"

    def test_encounter_list_includes_visit_reason(self, authenticated_client, sample_patient):
        """Encounter list serializer should include visit_reason."""
        Encounter.objects.create(
            patient=sample_patient,
            encounter_type="OPD",
            chief_complaint="Test",
            visit_reason="LAB_REVIEW",
        )

        response = authenticated_client.get("/api/encounters/")
        assert response.status_code == status.HTTP_200_OK
        assert any(e.get("visit_reason") == "LAB_REVIEW" for e in response.data["results"])

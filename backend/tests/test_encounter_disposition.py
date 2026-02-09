"""
TDD Tests for Encounter Disposition Feature.

Sprint: Disposition Enhancement
Purpose: Ensure encounters have proper clinical documentation or explicit
         disposition before closing. Supports advice-only visits.

Tests written FIRST per TDD guidelines.
"""

import pytest
from django.core.exceptions import ValidationError
from rest_framework import status


@pytest.mark.django_db
class TestDispositionFieldExists:
    """Tests to verify disposition field exists on model."""

    def test_encounter_has_disposition_field(self, sample_encounter):
        """Should have disposition field on Encounter model."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "disposition")
        # Default should be empty string (not set yet)
        assert sample_encounter.disposition == ""

    def test_encounter_has_disposition_notes_field(self, sample_encounter):
        """Should have disposition_notes field on Encounter model."""
        from hmis.apps.encounters.models import Encounter

        assert hasattr(Encounter, "disposition_notes")
        assert sample_encounter.disposition_notes == ""

    def test_disposition_choices_include_advice_only(self):
        """Should have ADVICE_ONLY as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "ADVICE_ONLY" in choices
        assert choices["ADVICE_ONLY"] == "Advice Only"

    def test_disposition_choices_include_treated_discharged(self):
        """Should have TREATED_DISCHARGED as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "TREATED_DISCHARGED" in choices
        assert choices["TREATED_DISCHARGED"] == "Treated & Discharged"

    def test_disposition_choices_include_referred(self):
        """Should have REFERRED as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "REFERRED" in choices

    def test_disposition_choices_include_admitted(self):
        """Should have ADMITTED as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "ADMITTED" in choices

    def test_disposition_choices_include_follow_up_scheduled(self):
        """Should have FOLLOW_UP_SCHEDULED as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "FOLLOW_UP_SCHEDULED" in choices

    def test_disposition_choices_include_left_ama(self):
        """Should have LEFT_AMA as a valid disposition choice."""
        from hmis.apps.encounters.models import Encounter

        choices = dict(Encounter.DISPOSITION_CHOICES)
        assert "LEFT_AMA" in choices
        assert choices["LEFT_AMA"] == "Left Against Medical Advice"


@pytest.mark.django_db
class TestDispositionSerializer:
    """Tests for disposition fields in serializer."""

    def test_serializer_includes_disposition_field(self, authenticated_client, sample_encounter):
        """Serializer should include disposition field."""
        response = authenticated_client.get(f"/api/encounters/{sample_encounter.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert "disposition" in response.data
        assert "disposition_notes" in response.data

    def test_can_set_disposition_via_api(self, authenticated_client, sample_encounter):
        """Should be able to set disposition via PATCH."""
        # First move to IN_PROGRESS so it can be edited
        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save()

        response = authenticated_client.patch(
            f"/api/encounters/{sample_encounter.id}/",
            {"disposition": "ADVICE_ONLY", "disposition_notes": "Patient advised on diet changes"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["disposition"] == "ADVICE_ONLY"
        assert "diet changes" in response.data["disposition_notes"]


@pytest.mark.django_db
class TestCloseEncounterValidation:
    """Tests for encounter close validation requiring documentation."""

    def test_close_without_documentation_and_no_disposition_fails(
        self, authenticated_client, sample_encounter
    ):
        """
        Closing an encounter without treatment plan, diagnosis, prescription,
        or disposition should fail.
        """
        # Move to READY_TO_CLOSE
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "disposition" in str(response.data).lower() or "documentation" in str(response.data).lower()

    def test_close_with_disposition_advice_only_without_notes_fails(
        self, authenticated_client, sample_encounter
    ):
        """ADVICE_ONLY disposition requires disposition_notes."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.disposition = "ADVICE_ONLY"
        sample_encounter.disposition_notes = ""  # No notes
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "notes" in str(response.data).lower()

    def test_close_with_advice_only_and_notes_succeeds(
        self, authenticated_client, sample_encounter
    ):
        """ADVICE_ONLY with disposition_notes should allow closing."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.disposition = "ADVICE_ONLY"
        sample_encounter.disposition_notes = "Patient advised to rest and hydrate. No medication needed."
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        sample_encounter.refresh_from_db()
        assert sample_encounter.status == "CLOSED"

    def test_close_with_diagnosis_succeeds_without_treatment_plan(
        self, authenticated_client, sample_encounter, sample_diagnosis
    ):
        """Having a diagnosis is sufficient documentation to close."""
        # sample_diagnosis fixture creates a diagnosis for sample_encounter
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_close_with_treatment_plan_succeeds_without_diagnosis(
        self, authenticated_client, sample_encounter, sample_treatment_plan
    ):
        """Having a treatment plan is sufficient documentation to close."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_close_with_prescription_succeeds(
        self, authenticated_client, sample_encounter, sample_prescription
    ):
        """Having a prescription is sufficient documentation to close."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_close_with_treated_discharged_disposition_succeeds(
        self, authenticated_client, sample_encounter, sample_diagnosis
    ):
        """TREATED_DISCHARGED with a diagnosis should succeed."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.disposition = "TREATED_DISCHARGED"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_close_with_referred_disposition_succeeds_with_notes(
        self, authenticated_client, sample_encounter
    ):
        """REFERRED disposition with notes can close without additional documentation."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.disposition = "REFERRED"
        sample_encounter.disposition_notes = "Referred to cardiology for chest pain evaluation"
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_close_with_left_ama_disposition_requires_notes(
        self, authenticated_client, sample_encounter
    ):
        """LEFT_AMA should require notes documenting the situation."""
        sample_encounter.status = "READY_TO_CLOSE"
        sample_encounter.disposition = "LEFT_AMA"
        sample_encounter.disposition_notes = ""
        sample_encounter.save()

        response = authenticated_client.post(
            f"/api/encounters/{sample_encounter.id}/finalize/",
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDispositionAuditLogging:
    """Tests for audit logging of disposition changes."""

    def test_disposition_change_is_audited(self, authenticated_client, sample_encounter):
        """Changing disposition should create audit log entry."""
        from hmis.apps.core.models import AuditLog

        sample_encounter.status = "IN_PROGRESS"
        sample_encounter.save()

        initial_count = AuditLog.objects.filter(
            resource_type="Encounter",
            resource_id=sample_encounter.id,
        ).count()

        # Set disposition
        authenticated_client.patch(
            f"/api/encounters/{sample_encounter.id}/",
            {"disposition": "ADVICE_ONLY", "disposition_notes": "Test advice"},
            format="json",
        )

        new_count = AuditLog.objects.filter(
            resource_type="Encounter",
            resource_id=sample_encounter.id,
        ).count()

        assert new_count > initial_count


@pytest.mark.django_db
class TestDispositionListFilter:
    """Tests for filtering encounters by disposition."""

    def test_can_filter_encounters_by_disposition(self, authenticated_client, sample_encounter):
        """Should be able to filter encounter list by disposition."""
        sample_encounter.disposition = "ADVICE_ONLY"
        sample_encounter.save()

        response = authenticated_client.get("/api/encounters/?disposition=ADVICE_ONLY")
        assert response.status_code == status.HTTP_200_OK
        results = response.data.get("results", response.data)
        assert len(results) >= 1
        assert any(e["disposition"] == "ADVICE_ONLY" for e in results)

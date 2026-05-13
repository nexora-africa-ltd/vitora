"""
Tests for Sick Notes / Medical Certificates.

Tests:
- Model: creation, auto-numbering, leave_days property, status transitions
- API: CRUD, issue/revoke/cancel workflows, filtering, stats, permissions
- Serializer contracts: field set validation
- Events: domain event publication on lifecycle changes
"""

from datetime import date

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from rest_framework import status

from hmis.apps.sick_notes.models import SickNote
from hmis.apps.sick_notes.serializers import (
    SickNoteCreateSerializer,
    SickNoteListSerializer,
    SickNoteSerializer,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sick_note_data(sample_encounter, sample_patient):
    """Valid sick note creation payload."""
    return {
        "encounter": sample_encounter.id,
        "patient": sample_patient.id,
        "leave_start_date": "2026-05-10",
        "leave_end_date": "2026-05-14",
        "diagnosis_text": "Acute upper respiratory infection",
        "diagnosis_code": "J06.9",
        "employer_name": "Acme Corp",
        "employer_contact": "hr@acme.co.ke",
        "recommendations": "Rest at home. Avoid strenuous activity.",
        "notes": "Patient advised on hydration.",
    }


@pytest.fixture
def sample_sick_note(db, sample_encounter, sample_patient, test_user, sample_facility):
    """A persisted draft sick note."""
    return SickNote.objects.create(
        encounter=sample_encounter,
        patient=sample_patient,
        issued_by=test_user,
        leave_start_date=date(2026, 5, 10),
        leave_end_date=date(2026, 5, 14),
        diagnosis_text="Acute upper respiratory infection",
        diagnosis_code="J06.9",
        status=SickNote.Status.DRAFT,
        facility=sample_facility,
    )


@pytest.fixture
def issued_sick_note(sample_sick_note):
    """An issued sick note."""
    sample_sick_note.status = SickNote.Status.ISSUED
    sample_sick_note.save()
    return sample_sick_note


# =============================================================================
# Model Tests
# =============================================================================


class TestSickNoteModel:
    """Tests for SickNote model."""

    def test_auto_generates_note_number(self, sample_sick_note):
        """Note number is auto-generated in SN-YYYYMMDD-XXXX format."""
        assert sample_sick_note.note_number.startswith("SN-")
        parts = sample_sick_note.note_number.split("-")
        assert len(parts) == 3
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_leave_days_calculation(self, sample_sick_note):
        """leave_days returns inclusive count of days."""
        # May 10 to May 14 = 5 days
        assert sample_sick_note.leave_days == 5

    def test_leave_days_single_day(
        self, db, sample_encounter, sample_patient, test_user, sample_facility
    ):
        """Single-day leave returns 1."""
        note = SickNote.objects.create(
            encounter=sample_encounter,
            patient=sample_patient,
            issued_by=test_user,
            leave_start_date=date(2026, 5, 10),
            leave_end_date=date(2026, 5, 10),
            diagnosis_text="Headache",
            facility=sample_facility,
        )
        assert note.leave_days == 1

    def test_end_before_start_raises_validation(
        self, db, sample_encounter, sample_patient, test_user, sample_facility
    ):
        """End date before start date fails validation."""
        note = SickNote(
            encounter=sample_encounter,
            patient=sample_patient,
            issued_by=test_user,
            leave_start_date=date(2026, 5, 14),
            leave_end_date=date(2026, 5, 10),
            diagnosis_text="Test",
            facility=sample_facility,
        )
        with pytest.raises(ValidationError, match="End date"):
            note.clean()

    def test_draft_to_issued_transition(self, sample_sick_note, test_user):
        """DRAFT → ISSUED is valid."""
        sample_sick_note.issue(user=test_user)
        sample_sick_note.refresh_from_db()
        assert sample_sick_note.status == SickNote.Status.ISSUED
        assert sample_sick_note.issued_at is not None

    def test_draft_to_cancelled_transition(self, sample_sick_note, test_user):
        """DRAFT → CANCELLED is valid."""
        sample_sick_note.cancel(user=test_user)
        sample_sick_note.refresh_from_db()
        assert sample_sick_note.status == SickNote.Status.CANCELLED
        assert sample_sick_note.cancelled_at is not None

    def test_issued_to_revoked_transition(self, issued_sick_note, test_user):
        """ISSUED → REVOKED is valid."""
        issued_sick_note.revoke(user=test_user, reason="Patient recovered early")
        issued_sick_note.refresh_from_db()
        assert issued_sick_note.status == SickNote.Status.REVOKED
        assert issued_sick_note.revoked_at is not None
        assert issued_sick_note.revoke_reason == "Patient recovered early"

    def test_invalid_transition_raises(self, issued_sick_note, test_user):
        """ISSUED → CANCELLED is invalid."""
        with pytest.raises(ValidationError, match="Cannot transition"):
            issued_sick_note.cancel(user=test_user)

    def test_auto_populates_patient_from_encounter(
        self, db, sample_encounter, test_user, sample_facility
    ):
        """Patient is auto-set from encounter if not provided."""
        note = SickNote(
            encounter=sample_encounter,
            issued_by=test_user,
            leave_start_date=date(2026, 5, 10),
            leave_end_date=date(2026, 5, 14),
            diagnosis_text="Test",
            facility=sample_facility,
        )
        note.save()
        assert note.patient_id == sample_encounter.patient_id

    def test_str_representation(self, sample_sick_note):
        """__str__ includes note number and status."""
        s = str(sample_sick_note)
        assert sample_sick_note.note_number in s
        assert "DRAFT" in s


# =============================================================================
# API Tests
# =============================================================================


class TestSickNoteAPI:
    """Tests for SickNote REST API endpoints."""

    def test_create_sick_note(self, authenticated_client, sick_note_data):
        """POST /api/sick-notes/ creates a sick note."""
        response = authenticated_client.post("/api/sick-notes/", sick_note_data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["note_number"].startswith("SN-")
        assert response.data["status"] == "DRAFT"
        assert response.data["diagnosis_text"] == sick_note_data["diagnosis_text"]
        assert response.data["leave_days"] == 5

    def test_create_without_auth_fails(self, api_client, sick_note_data):
        """Unauthenticated requests are rejected."""
        response = api_client.post("/api/sick-notes/", sick_note_data)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_with_invalid_dates_fails(self, authenticated_client, sick_note_data):
        """End date before start date returns 400."""
        sick_note_data["leave_end_date"] = "2026-05-08"
        response = authenticated_client.post("/api/sick-notes/", sick_note_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "leave_end_date" in response.data

    def test_list_sick_notes(self, authenticated_client, sample_sick_note):
        """GET /api/sick-notes/ returns list."""
        response = authenticated_client.get("/api/sick-notes/")
        assert response.status_code == status.HTTP_200_OK

    def test_get_sick_note_detail(self, authenticated_client, sample_sick_note):
        """GET /api/sick-notes/{id}/ returns full detail."""
        response = authenticated_client.get(f"/api/sick-notes/{sample_sick_note.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["note_number"] == sample_sick_note.note_number
        assert response.data["leave_days"] == 5

    def test_issue_sick_note(self, authenticated_client, sample_sick_note):
        """POST /api/sick-notes/{id}/issue/ transitions DRAFT → ISSUED."""
        response = authenticated_client.post(f"/api/sick-notes/{sample_sick_note.id}/issue/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ISSUED"
        assert response.data["issued_at"] is not None

    def test_issue_non_draft_fails(self, authenticated_client, issued_sick_note):
        """Cannot issue an already-issued sick note."""
        response = authenticated_client.post(f"/api/sick-notes/{issued_sick_note.id}/issue/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_revoke_sick_note(self, authenticated_client, issued_sick_note):
        """POST /api/sick-notes/{id}/revoke/ transitions ISSUED → REVOKED."""
        response = authenticated_client.post(
            f"/api/sick-notes/{issued_sick_note.id}/revoke/",
            {"reason": "Patient returned to work early"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "REVOKED"
        assert response.data["revoke_reason"] == "Patient returned to work early"

    def test_revoke_without_reason_fails(self, authenticated_client, issued_sick_note):
        """Revoke requires a reason."""
        response = authenticated_client.post(f"/api/sick-notes/{issued_sick_note.id}/revoke/", {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cancel_draft_sick_note(self, authenticated_client, sample_sick_note):
        """POST /api/sick-notes/{id}/cancel/ transitions DRAFT → CANCELLED."""
        response = authenticated_client.post(f"/api/sick-notes/{sample_sick_note.id}/cancel/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"

    def test_cancel_issued_fails(self, authenticated_client, issued_sick_note):
        """Cannot cancel an issued sick note."""
        response = authenticated_client.post(f"/api/sick-notes/{issued_sick_note.id}/cancel/")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_for_encounter(self, authenticated_client, sample_sick_note):
        """GET /api/sick-notes/for_encounter/?encounter_id=X returns filtered results."""
        response = authenticated_client.get(
            f"/api/sick-notes/for_encounter/?encounter_id={sample_sick_note.encounter_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_for_patient(self, authenticated_client, sample_sick_note):
        """GET /api/sick-notes/for_patient/?patient_id=X returns filtered results."""
        response = authenticated_client.get(
            f"/api/sick-notes/for_patient/?patient_id={sample_sick_note.patient_id}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_stats(self, authenticated_client, sample_sick_note, issued_sick_note):
        """GET /api/sick-notes/stats/ returns counts."""
        response = authenticated_client.get("/api/sick-notes/stats/")
        assert response.status_code == status.HTTP_200_OK
        assert "total" in response.data
        assert "draft" in response.data
        assert "issued" in response.data

    def test_filter_by_status(self, authenticated_client, sample_sick_note):
        """?status=DRAFT filters correctly."""
        response = authenticated_client.get("/api/sick-notes/?status=DRAFT")
        assert response.status_code == status.HTTP_200_OK


# =============================================================================
# Serializer Contract Tests
# =============================================================================


class TestSickNoteContracts:
    """Serializer contract tests — ensure field sets match expectations."""

    CONTRACTS = [
        (
            SickNoteListSerializer,
            frozenset(
                {
                    "id",
                    "note_number",
                    "patient",
                    "patient_name",
                    "patient_mrn",
                    "encounter",
                    "status",
                    "status_display",
                    "diagnosis_text",
                    "leave_start_date",
                    "leave_end_date",
                    "leave_days",
                    "issued_by",
                    "issued_by_name",
                    "issued_at",
                    "created_at",
                }
            ),
        ),
        (
            SickNoteSerializer,
            frozenset(
                {
                    "id",
                    "note_number",
                    "patient",
                    "patient_name",
                    "patient_mrn",
                    "encounter",
                    "issued_by",
                    "issued_by_name",
                    "leave_start_date",
                    "leave_end_date",
                    "leave_days",
                    "diagnosis_text",
                    "diagnosis_code",
                    "employer_name",
                    "employer_contact",
                    "recommendations",
                    "notes",
                    "status",
                    "status_display",
                    "is_active",
                    "issued_at",
                    "revoked_at",
                    "revoked_by",
                    "revoked_by_name",
                    "revoke_reason",
                    "cancelled_at",
                    "cancelled_by",
                    "cancelled_by_name",
                    "created_at",
                    "updated_at",
                }
            ),
        ),
        (
            SickNoteCreateSerializer,
            frozenset(
                {
                    "encounter",
                    "patient",
                    "leave_start_date",
                    "leave_end_date",
                    "diagnosis_text",
                    "diagnosis_code",
                    "employer_name",
                    "employer_contact",
                    "recommendations",
                    "notes",
                }
            ),
        ),
    ]

    @pytest.mark.parametrize(
        "serializer_cls, expected_fields",
        CONTRACTS,
        ids=[c[0].__name__ for c in CONTRACTS],
    )
    def test_serializer_fields_match_contract(self, serializer_cls, expected_fields):
        """Serializer fields must match the contract exactly."""
        actual_fields = frozenset(serializer_cls().fields.keys())
        assert actual_fields == expected_fields, (
            f"{serializer_cls.__name__} field mismatch:\n"
            f"  Missing: {expected_fields - actual_fields}\n"
            f"  Extra:   {actual_fields - expected_fields}"
        )


# =============================================================================
# Domain Event Tests
# =============================================================================


class TestSickNoteEvents:
    """Tests for domain event publication on sick note lifecycle."""

    def test_creation_publishes_event(
        self, db, sample_encounter, sample_patient, test_user, sample_facility, mocker
    ):
        """Creating a sick note publishes CREATED event."""
        mock_publish = mocker.patch("hmis.apps.sick_notes.signals.publish_event")
        SickNote.objects.create(
            encounter=sample_encounter,
            patient=sample_patient,
            issued_by=test_user,
            leave_start_date=date(2026, 5, 10),
            leave_end_date=date(2026, 5, 14),
            diagnosis_text="Test",
            facility=sample_facility,
        )
        mock_publish.assert_called_once()
        call_args = mock_publish.call_args
        assert call_args[0][0] == "sick_notes.note.created"

    def test_issue_publishes_event(self, sample_sick_note, test_user, mocker):
        """Issuing a sick note publishes ISSUED event."""
        mock_publish = mocker.patch("hmis.apps.sick_notes.signals.publish_event")
        sample_sick_note.issue(user=test_user)
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == "sick_notes.note.issued"

    def test_revoke_publishes_event(self, issued_sick_note, test_user, mocker):
        """Revoking a sick note publishes REVOKED event."""
        mock_publish = mocker.patch("hmis.apps.sick_notes.signals.publish_event")
        issued_sick_note.revoke(user=test_user, reason="Test")
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == "sick_notes.note.revoked"

    def test_cancel_publishes_event(
        self, db, sample_encounter, sample_patient, test_user, sample_facility, mocker
    ):
        """Cancelling a sick note publishes CANCELLED event."""
        note = SickNote.objects.create(
            encounter=sample_encounter,
            patient=sample_patient,
            issued_by=test_user,
            leave_start_date=date(2026, 5, 10),
            leave_end_date=date(2026, 5, 14),
            diagnosis_text="Test",
            facility=sample_facility,
        )
        # Patch AFTER creation so only the cancel event is captured
        mock_publish = mocker.patch("hmis.apps.sick_notes.signals.publish_event")
        note.cancel(user=test_user)
        mock_publish.assert_called_once()
        assert mock_publish.call_args[0][0] == "sick_notes.note.cancelled"

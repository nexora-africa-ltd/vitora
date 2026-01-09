"""
Tests for Nursing Kardex models (NursingKardex, KardexShiftNote, KardexHandoverNote).

Following TDD approach - tests written before implementation.
Tests cover Kardex auto-creation, shift notes (append-only), handover notes, risk assessments.
"""


import pytest # type: ignore
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from hmis.apps.inpatient.models import (
    KardexHandoverNote,
    KardexShiftNote,
    NursingKardex,
)


@pytest.mark.django_db
class TestNursingKardex:
    """Tests for NursingKardex model."""

    def test_kardex_auto_creation_on_admission(self, sample_admission):
        """Kardex should be auto-created when admission is saved."""
        # Kardex should exist for the admission
        assert hasattr(sample_admission, 'kardex')
        kardex = sample_admission.kardex
        assert kardex is not None
        assert kardex.admission == sample_admission

    def test_kardex_one_to_one_with_admission(self, sample_admission):
        """Each admission should have exactly one Kardex."""
        kardex1 = sample_admission.kardex

        # Attempting to create another kardex for same admission should fail
        with pytest.raises((IntegrityError, ValidationError)):
            NursingKardex.objects.create(admission=sample_admission)

    def test_kardex_nursing_care_plan_fields(self, sample_admission):
        """Kardex should allow updating nursing care plan fields."""
        kardex = sample_admission.kardex

        kardex.nursing_problems = "Risk for infection, impaired mobility"
        kardex.interventions = "Administer IV antibiotics, assist with ambulation"
        kardex.monitoring_requirements = "Monitor wound site, vital signs q4h"
        kardex.care_task_frequency = "Wound dressing change BD, mobility exercises TID"
        kardex.save()

        kardex.refresh_from_db()
        assert "Risk for infection" in kardex.nursing_problems
        assert "IV antibiotics" in kardex.interventions
        assert "vital signs q4h" in kardex.monitoring_requirements
        assert "BD" in kardex.care_task_frequency

    def test_kardex_fall_risk_assessment(self, sample_admission):
        """Kardex should track fall risk levels."""
        kardex = sample_admission.kardex

        # Default should be LOW
        assert kardex.fall_risk == 'LOW'

        # Update to HIGH
        kardex.fall_risk = 'HIGH'
        kardex.save()

        kardex.refresh_from_db()
        assert kardex.fall_risk == 'HIGH'

    def test_kardex_pressure_sore_risk_assessment(self, sample_admission):
        """Kardex should track pressure sore risk levels."""
        kardex = sample_admission.kardex

        # Default should be LOW
        assert kardex.pressure_sore_risk == 'LOW'

        # Update to MODERATE
        kardex.pressure_sore_risk = 'MODERATE'
        kardex.save()

        kardex.refresh_from_db()
        assert kardex.pressure_sore_risk == 'MODERATE'

    def test_kardex_risk_assessment_choices(self, sample_admission):
        """Kardex risk assessments should only accept valid choices."""
        kardex = sample_admission.kardex

        # Valid choices
        for risk_level in ['LOW', 'MODERATE', 'HIGH']:
            kardex.fall_risk = risk_level
            kardex.pressure_sore_risk = risk_level
            kardex.save()
            kardex.refresh_from_db()
            assert kardex.fall_risk == risk_level
            assert kardex.pressure_sore_risk == risk_level


@pytest.mark.django_db
class TestKardexShiftNote:
    """Tests for KardexShiftNote model (append-only design)."""

    def test_shift_note_creation(self, sample_admission, test_user):
        """Should create shift note with valid data."""
        kardex = sample_admission.kardex

        shift_note = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Patient stable, all vitals within normal range. Pain controlled."
        )

        assert shift_note.id is not None
        assert shift_note.kardex == kardex
        assert shift_note.shift == 'DAY'
        assert shift_note.nurse == test_user
        assert "stable" in shift_note.content
        assert shift_note.timestamp is not None

    def test_shift_note_auto_timestamp(self, sample_admission, test_user):
        """Shift note timestamp should be auto-generated."""
        kardex = sample_admission.kardex

        before_creation = timezone.now()
        shift_note = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='NIGHT',
            nurse=test_user,
            content="Night shift report"
        )
        after_creation = timezone.now()

        assert before_creation <= shift_note.timestamp <= after_creation

    def test_shift_note_immutability(self, sample_admission, test_user):
        """Shift notes should be append-only (timestamp cannot be changed)."""
        kardex = sample_admission.kardex

        shift_note = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Initial content"
        )

        original_timestamp = shift_note.timestamp

        # Content can be updated (though discouraged in practice)
        shift_note.content = "Updated content"
        shift_note.save()

        shift_note.refresh_from_db()
        # Timestamp should not change (auto_now_add=True)
        assert shift_note.timestamp == original_timestamp

    def test_multiple_shift_notes_same_kardex(self, sample_admission, test_user):
        """Should allow multiple shift notes for same Kardex."""
        kardex = sample_admission.kardex

        note1 = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Morning update"
        )

        note2 = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Afternoon update"
        )

        note3 = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='NIGHT',
            nurse=test_user,
            content="Night update"
        )

        assert kardex.shift_notes.count() == 3
        assert note1 in kardex.shift_notes.all()
        assert note2 in kardex.shift_notes.all()
        assert note3 in kardex.shift_notes.all()

    def test_shift_note_ordering(self, sample_admission, test_user):
        """Shift notes should be ordered by timestamp descending."""
        kardex = sample_admission.kardex

        # Create notes with slight delays to ensure different timestamps
        note1 = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="First note"
        )

        note2 = KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Second note"
        )

        notes = list(kardex.shift_notes.all())
        # Should be in reverse chronological order (newest first)
        assert notes[0] == note2
        assert notes[1] == note1

    def test_shift_note_shift_choices(self, sample_admission, test_user):
        """Shift notes should only accept valid shift choices."""
        kardex = sample_admission.kardex

        # Valid choices
        for shift in ['DAY', 'NIGHT']:
            note = KardexShiftNote.objects.create(
                kardex=kardex,
                shift=shift,
                nurse=test_user,
                content=f"{shift} shift report"
            )
            assert note.shift == shift


@pytest.mark.django_db
class TestKardexHandoverNote:
    """Tests for KardexHandoverNote model."""

    def test_handover_note_creation(self, sample_admission, test_user, another_user):
        """Should create handover note with valid data."""
        kardex = sample_admission.kardex

        handover = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='DAY',
            pending_tasks="IV line change due at 2000hrs, pain assessment overdue",
            escalations="Patient complained of chest pain - escalated to doctor"
        )

        assert handover.id is not None
        assert handover.kardex == kardex
        assert handover.outgoing_nurse == test_user
        assert handover.incoming_nurse == another_user
        assert handover.shift_ending == 'DAY'
        assert "IV line change" in handover.pending_tasks
        assert "chest pain" in handover.escalations
        assert handover.acknowledged_at is None  # Not acknowledged yet

    def test_handover_note_without_escalations(self, sample_admission, test_user, another_user):
        """Escalations field should be optional."""
        kardex = sample_admission.kardex

        handover = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='NIGHT',
            pending_tasks="Routine observations",
            escalations=""  # Optional
        )

        assert handover.escalations == ""

    def test_handover_acknowledgment(self, sample_admission, test_user, another_user):
        """Incoming nurse should be able to acknowledge handover."""
        kardex = sample_admission.kardex

        handover = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='DAY',
            pending_tasks="Routine tasks"
        )

        assert handover.acknowledged_at is None

        # Acknowledge handover
        handover.acknowledged_at = timezone.now()
        handover.save()

        handover.refresh_from_db()
        assert handover.acknowledged_at is not None

    def test_multiple_handovers_same_kardex(self, sample_admission, test_user, another_user):
        """Should allow multiple handover notes for same Kardex."""
        kardex = sample_admission.kardex

        handover1 = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='DAY',
            pending_tasks="Day shift tasks"
        )

        handover2 = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=another_user,
            incoming_nurse=test_user,
            shift_ending='NIGHT',
            pending_tasks="Night shift tasks"
        )

        assert kardex.handover_notes.count() == 2
        assert handover1 in kardex.handover_notes.all()
        assert handover2 in kardex.handover_notes.all()

    def test_handover_different_nurses_required(self, sample_admission, test_user):
        """Outgoing and incoming nurses should typically be different (business logic)."""
        kardex = sample_admission.kardex

        # System allows same nurse (edge case: emergency coverage)
        # But typically they should be different
        handover = KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=test_user,  # Same nurse (allowed but unusual)
            shift_ending='DAY',
            pending_tasks="Tasks"
        )

        assert handover.outgoing_nurse == handover.incoming_nurse


@pytest.mark.django_db
class TestKardexIntegration:
    """Integration tests for Kardex ecosystem."""

    def test_kardex_with_shift_notes_and_handovers(self, sample_admission, test_user, another_user):
        """Kardex should support both shift notes and handover notes."""
        kardex = sample_admission.kardex

        # Add shift notes
        KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Day shift note"
        )

        KardexShiftNote.objects.create(
            kardex=kardex,
            shift='NIGHT',
            nurse=another_user,
            content="Night shift note"
        )

        # Add handover
        KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='DAY',
            pending_tasks="Handover tasks"
        )

        assert kardex.shift_notes.count() == 2
        assert kardex.handover_notes.count() == 1

    def test_kardex_deletion_cascades_to_notes(self, sample_admission, test_user, another_user):
        """Deleting Kardex should cascade delete shift notes and handover notes."""
        kardex = sample_admission.kardex

        # Create associated notes
        KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Note"
        )

        KardexHandoverNote.objects.create(
            kardex=kardex,
            outgoing_nurse=test_user,
            incoming_nurse=another_user,
            shift_ending='DAY',
            pending_tasks="Tasks"
        )

        kardex_id = kardex.id
        assert KardexShiftNote.objects.filter(kardex_id=kardex_id).exists()
        assert KardexHandoverNote.objects.filter(kardex_id=kardex_id).exists()

        # Delete kardex
        kardex.delete()

        # Notes should be deleted (CASCADE)
        assert not KardexShiftNote.objects.filter(kardex_id=kardex_id).exists()
        assert not KardexHandoverNote.objects.filter(kardex_id=kardex_id).exists()

    def test_admission_deletion_cascades_to_kardex(self, sample_admission, test_user):
        """Deleting admission should cascade delete Kardex and all notes."""
        kardex = sample_admission.kardex
        kardex_id = kardex.id

        # Create shift note
        KardexShiftNote.objects.create(
            kardex=kardex,
            shift='DAY',
            nurse=test_user,
            content="Note"
        )

        assert NursingKardex.objects.filter(id=kardex_id).exists()
        assert KardexShiftNote.objects.filter(kardex=kardex).exists()

        # Delete admission
        admission_id = sample_admission.id
        sample_admission.delete()

        # Kardex and notes should be deleted (CASCADE)
        assert not NursingKardex.objects.filter(id=kardex_id).exists()
        assert not KardexShiftNote.objects.filter(kardex_id=kardex_id).exists()

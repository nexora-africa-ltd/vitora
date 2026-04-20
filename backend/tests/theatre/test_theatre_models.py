"""
Tests for Theatre module models.

Covers:
- OperatingTheatre creation and constraints
- SurgeryCase auto-numbering and status transitions
- SurgicalTeamMember uniqueness
- WHOSafetyChecklist phase completion
- AnesthesiaRecord, OperativeNote, PACU models
"""

from datetime import date, time

import pytest  # type: ignore

from hmis.apps.theatre.models import (
    OperatingTheatre,
    OperativeNote,
    SurgeryCase,
    SurgicalTeamMember,
    WHOSafetyChecklist,
)


# ═══════════════════════════════════════════════════════════════════════════
#  OperatingTheatre
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestOperatingTheatre:
    def test_create_theatre(self, sample_theatre):
        assert sample_theatre.code == "OT-01"
        assert sample_theatre.theatre_type == "GENERAL"
        assert sample_theatre.is_active is True

    def test_theatre_str(self, sample_theatre):
        assert "OT-01" in str(sample_theatre)

    def test_unique_code_per_facility(self, sample_theatre, sample_organization, sample_facility):
        with pytest.raises(Exception):
            OperatingTheatre.objects.create(
                code="OT-01",
                name="Duplicate",
                theatre_type="GENERAL",
                organization=sample_organization,
                facility=sample_facility,
            )

    def test_theatre_type_choices(self, sample_theatre):
        valid_types = [c[0] for c in OperatingTheatre.TheatreType.choices]
        assert sample_theatre.theatre_type in valid_types

    def test_default_operating_hours(self, sample_organization, sample_facility):
        theatre = OperatingTheatre.objects.create(
            code="OT-99",
            name="Default Hours Theatre",
            theatre_type="MINOR",
            organization=sample_organization,
            facility=sample_facility,
        )
        assert theatre.operating_hours_start == time(8, 0)
        assert theatre.operating_hours_end == time(18, 0)
        assert theatre.slot_duration_minutes == 30


# ═══════════════════════════════════════════════════════════════════════════
#  SurgeryCase
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgeryCase:
    def test_create_case_auto_generates_number(self, sample_surgery_case):
        assert sample_surgery_case.case_number.startswith("SURG-")
        assert len(sample_surgery_case.case_number.split("-")) == 3

    def test_case_number_format(self, sample_surgery_case):
        """Case number should be SURG-YYYYMMDD-XXXX."""
        parts = sample_surgery_case.case_number.split("-")
        assert parts[0] == "SURG"
        assert len(parts[1]) == 8  # YYYYMMDD
        assert len(parts[2]) == 4  # XXXX

    def test_initial_status_is_requested(self, sample_surgery_case):
        assert sample_surgery_case.status == "REQUESTED"

    def test_case_str(self, sample_surgery_case):
        assert sample_surgery_case.case_number in str(sample_surgery_case)

    def test_sequential_case_numbers(
        self,
        sample_patient,
        sample_procedure_catalog,
        sample_theatre,
        test_user,
        sample_organization,
        sample_facility,
    ):
        """Two cases created same day get sequential numbers."""
        case1 = SurgeryCase.objects.create(
            patient=sample_patient,
            primary_procedure=sample_procedure_catalog,
            theatre=sample_theatre,
            scheduled_date=date.today(),
            scheduled_start_time=time(9, 0),
            estimated_duration_minutes=60,
            diagnosis="Test 1",
            requesting_doctor=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        case2 = SurgeryCase.objects.create(
            patient=sample_patient,
            primary_procedure=sample_procedure_catalog,
            theatre=sample_theatre,
            scheduled_date=date.today(),
            scheduled_start_time=time(10, 0),
            estimated_duration_minutes=60,
            diagnosis="Test 2",
            requesting_doctor=test_user,
            organization=sample_organization,
            facility=sample_facility,
        )
        num1 = int(case1.case_number.split("-")[-1])
        num2 = int(case2.case_number.split("-")[-1])
        assert num2 == num1 + 1

    def test_tenant_auto_resolved(self, sample_surgery_case, sample_facility):
        """Facility/org should be auto-resolved from encounter or patient."""
        assert sample_surgery_case.facility == sample_facility


# ═══════════════════════════════════════════════════════════════════════════
#  Status Transitions
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgeryCaseTransitions:
    def test_requested_to_scheduled(self, sample_surgery_case, test_user):
        sample_surgery_case.schedule(user=test_user)
        assert sample_surgery_case.status == "SCHEDULED"

    def test_scheduled_to_pre_op(self, scheduled_surgery_case, test_user):
        scheduled_surgery_case.start_pre_op(user=test_user)
        assert scheduled_surgery_case.status == "PRE_OP"

    def test_pre_op_to_in_theatre(self, pre_op_surgery_case, test_user):
        pre_op_surgery_case.enter_theatre(user=test_user)
        assert pre_op_surgery_case.status == "IN_THEATRE"

    def test_in_theatre_to_in_surgery(self, in_theatre_surgery_case, test_user):
        in_theatre_surgery_case.start_surgery(user=test_user)
        assert in_theatre_surgery_case.status == "IN_SURGERY"

    def test_in_surgery_to_in_pacu(self, in_surgery_case, test_user):
        in_surgery_case.end_surgery(user=test_user)
        assert in_surgery_case.status == "IN_PACU"

    def test_in_pacu_to_discharged(self, in_pacu_surgery_case, test_user):
        in_pacu_surgery_case.discharge(user=test_user)
        assert in_pacu_surgery_case.status == "DISCHARGED"

    def test_full_happy_path(self, sample_surgery_case, test_user):
        """Test complete perioperative workflow."""
        case = sample_surgery_case
        case.schedule(user=test_user)
        case.start_pre_op(user=test_user)
        case.enter_theatre(user=test_user)
        case.start_surgery(user=test_user)
        case.end_surgery(user=test_user)
        case.discharge(user=test_user)
        assert case.status == "DISCHARGED"

    def test_cancel_from_requested(self, sample_surgery_case, test_user):
        sample_surgery_case.cancel(user=test_user, reason="Patient request")
        assert sample_surgery_case.status == "CANCELLED"
        assert sample_surgery_case.cancellation_reason == "Patient request"

    def test_cancel_from_scheduled(self, scheduled_surgery_case, test_user):
        scheduled_surgery_case.cancel(user=test_user, reason="No OR available")
        assert scheduled_surgery_case.status == "CANCELLED"

    def test_postpone_from_scheduled(self, scheduled_surgery_case, test_user):
        scheduled_surgery_case.postpone(
            user=test_user, postponed_to=date(2026, 5, 1)
        )
        assert scheduled_surgery_case.status == "POSTPONED"
        assert scheduled_surgery_case.postponed_to_date == date(2026, 5, 1)

    def test_postponed_back_to_scheduled(self, scheduled_surgery_case, test_user):
        scheduled_surgery_case.postpone(user=test_user)
        assert scheduled_surgery_case.status == "POSTPONED"
        scheduled_surgery_case.schedule(user=test_user)
        assert scheduled_surgery_case.status == "SCHEDULED"

    def test_invalid_transition_raises(self, sample_surgery_case, test_user):
        """Cannot jump from REQUESTED directly to IN_SURGERY."""
        with pytest.raises(ValueError, match="Cannot transition"):
            sample_surgery_case.transition_to("IN_SURGERY", user=test_user)

    def test_cannot_transition_from_discharged(self, in_pacu_surgery_case, test_user):
        in_pacu_surgery_case.discharge(user=test_user)
        with pytest.raises(ValueError, match="Cannot transition"):
            in_pacu_surgery_case.schedule(user=test_user)

    def test_cannot_transition_from_cancelled(self, sample_surgery_case, test_user):
        sample_surgery_case.cancel(user=test_user, reason="Cancelled")
        with pytest.raises(ValueError, match="Cannot transition"):
            sample_surgery_case.schedule(user=test_user)

    def test_status_changed_at_updated(self, sample_surgery_case, test_user):
        initial = sample_surgery_case.status_changed_at
        sample_surgery_case.schedule(user=test_user)
        assert sample_surgery_case.status_changed_at is not None
        if initial:
            assert sample_surgery_case.status_changed_at >= initial

    def test_status_changed_by_set(self, sample_surgery_case, test_user):
        sample_surgery_case.schedule(user=test_user)
        assert sample_surgery_case.status_changed_by == test_user


# ═══════════════════════════════════════════════════════════════════════════
#  SurgicalTeamMember
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestSurgicalTeamMember:
    def test_create_team_member(self, sample_surgery_case, test_user):
        member = SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=test_user,
            role="LEAD_SURGEON",
        )
        assert member.role == "LEAD_SURGEON"
        assert "Lead Surgeon" in str(member)

    def test_unique_constraint(self, sample_surgery_case, test_user):
        """Same staff + role on same case should fail."""
        SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=test_user,
            role="LEAD_SURGEON",
        )
        with pytest.raises(Exception):
            SurgicalTeamMember.objects.create(
                surgery_case=sample_surgery_case,
                staff_member=test_user,
                role="LEAD_SURGEON",
            )

    def test_same_staff_different_roles(self, sample_surgery_case, test_user):
        """Same staff can hold different roles (observer + nurse)."""
        SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=test_user,
            role="LEAD_SURGEON",
        )
        m2 = SurgicalTeamMember.objects.create(
            surgery_case=sample_surgery_case,
            staff_member=test_user,
            role="OBSERVER",
        )
        assert m2.pk is not None


# ═══════════════════════════════════════════════════════════════════════════
#  WHOSafetyChecklist
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestWHOSafetyChecklist:
    def test_create_checklist(self, sample_surgery_case):
        checklist = WHOSafetyChecklist.objects.create(
            surgery_case=sample_surgery_case
        )
        assert not checklist.sign_in_complete
        assert not checklist.time_out_complete
        assert not checklist.sign_out_complete

    def test_complete_sign_in(self, sample_surgery_case, test_user):
        checklist = WHOSafetyChecklist.objects.create(
            surgery_case=sample_surgery_case
        )
        checklist.complete_sign_in(user=test_user)
        checklist.refresh_from_db()
        assert checklist.sign_in_complete
        assert checklist.sign_in_completed_by == test_user

    def test_complete_time_out(self, sample_surgery_case, test_user):
        checklist = WHOSafetyChecklist.objects.create(
            surgery_case=sample_surgery_case
        )
        checklist.complete_time_out(user=test_user)
        checklist.refresh_from_db()
        assert checklist.time_out_complete

    def test_complete_sign_out(self, sample_surgery_case, test_user):
        checklist = WHOSafetyChecklist.objects.create(
            surgery_case=sample_surgery_case
        )
        checklist.complete_sign_out(user=test_user)
        checklist.refresh_from_db()
        assert checklist.sign_out_complete

    def test_full_checklist_flow(self, sample_surgery_case, test_user):
        checklist = WHOSafetyChecklist.objects.create(
            surgery_case=sample_surgery_case
        )
        checklist.complete_sign_in(user=test_user)
        checklist.complete_time_out(user=test_user)
        checklist.complete_sign_out(user=test_user)
        checklist.refresh_from_db()
        assert checklist.sign_in_complete
        assert checklist.time_out_complete
        assert checklist.sign_out_complete


# ═══════════════════════════════════════════════════════════════════════════
#  OperativeNote
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
class TestOperativeNote:
    def test_create_operative_note(self, sample_surgery_case, test_user):
        note = OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            pre_operative_diagnosis="Acute appendicitis",
            post_operative_diagnosis="Acute appendicitis confirmed",
            procedure_performed="Laparoscopic appendectomy",
            findings="Inflamed appendix, no perforation",
            technique_description="Standard 3-port laparoscopic technique",
        )
        assert "OpNote" in str(note)
        assert note.signed_at is None

    def test_sign_operative_note(self, sample_surgery_case, test_user):
        note = OperativeNote.objects.create(
            surgery_case=sample_surgery_case,
            dictated_by=test_user,
            pre_operative_diagnosis="Test",
            post_operative_diagnosis="Test",
            procedure_performed="Test",
            findings="Test",
            technique_description="Test",
        )
        note.sign(user=test_user)
        note.refresh_from_db()
        assert note.signed_at is not None
        assert note.signed_by == test_user

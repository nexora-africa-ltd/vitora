"""
Tests for Scheduling Models - Phase 1: Core Scheduling Foundation.

This module tests:
- Resource model (Person, Place, Asset abstractions)
- TimeSlot model (timezone-safe time slots)
- Schedule model (provider availability definitions)
- Appointment model (booking lifecycle)
- Conflict detection
- Availability queries

Following TDD approach: Write tests BEFORE implementation.
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest  # type: ignore
from django.core.exceptions import ValidationError
from django.utils import timezone

# =============================================================================
# Resource Model Tests
# =============================================================================


class TestResourceModel:
    """Tests for the Resource model."""

    def test_create_person_resource(self, db, test_user):
        """Should create a person resource (doctor, nurse, etc.)."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="Dr. John Smith",
            resource_type="PERSON",
            code="DOC-001",
            is_active=True,
            metadata={"specialty": "General Medicine", "license": "MED-12345"},
        )

        assert resource.id is not None
        assert resource.name == "Dr. John Smith"
        assert resource.resource_type == "PERSON"
        assert resource.code == "DOC-001"
        assert resource.is_active is True
        assert resource.metadata["specialty"] == "General Medicine"

    def test_create_place_resource(self, db):
        """Should create a place resource (room, clinic, ward)."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="Consultation Room 1",
            resource_type="PLACE",
            code="ROOM-001",
            capacity=1,
            metadata={"floor": "Ground", "equipment": ["desk", "examination_bed"]},
        )

        assert resource.resource_type == "PLACE"
        assert resource.capacity == 1

    def test_create_asset_resource(self, db):
        """Should create an asset resource (bed, machine, theatre)."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="X-Ray Machine 1",
            resource_type="ASSET",
            code="XRAY-001",
            metadata={"manufacturer": "Siemens", "model": "FlexiDiagnost"},
        )

        assert resource.resource_type == "ASSET"

    def test_resource_code_must_be_unique_per_facility(self, db, sample_facility):
        """Should enforce unique resource codes within the same facility."""
        from hmis.apps.scheduling.models import Resource

        Resource.objects.create(
            name="Resource 1",
            resource_type="PERSON",
            code="RES-001",
            facility=sample_facility,
        )

        with pytest.raises(Exception):  # IntegrityError
            Resource.objects.create(
                name="Resource 2",
                resource_type="PERSON",
                code="RES-001",  # Duplicate code in same facility
                facility=sample_facility,
            )

    def test_resource_code_can_repeat_across_facilities(
        self,
        db,
        sample_facility,
        sample_organization,
        sample_county,
        sample_sub_county,
    ):
        """Same code is allowed in different facilities."""
        from hmis.apps.core.models import Facility
        from hmis.apps.scheduling.models import Resource

        other_facility = Facility.objects.create(
            name="Other Clinic",
            mfl_code="88888",
            organization=sample_organization,
            county=sample_county,
            sub_county=sample_sub_county,
        )

        Resource.objects.create(
            name="Resource 1",
            resource_type="PERSON",
            code="RES-001",
            facility=sample_facility,
        )
        r2 = Resource.objects.create(
            name="Resource 2",
            resource_type="PERSON",
            code="RES-001",  # Same code, different facility
            facility=other_facility,
        )
        assert r2.id is not None

    def test_resource_invalid_type_rejected(self, db):
        """Should reject invalid resource types."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource(
            name="Invalid Resource",
            resource_type="INVALID_TYPE",
            code="INV-001",
        )

        with pytest.raises(ValidationError):
            resource.full_clean()

    def test_resource_str_representation(self, db):
        """Should return proper string representation."""
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.create(
            name="Dr. Jane Doe",
            resource_type="PERSON",
            code="DOC-002",
        )

        assert str(resource) == "DOC-002: Dr. Jane Doe (PERSON)"

    def test_resource_link_to_staff_profile(self, db, test_user, sample_department, sample_role):
        """Should link person resource to StaffProfile."""
        from datetime import date

        from hmis.apps.core.models import StaffProfile
        from hmis.apps.scheduling.models import Resource

        staff = StaffProfile.objects.create(
            user=test_user,
            employee_id="VH-2026-001",
            primary_role=sample_role,
            primary_department=sample_department,
            date_joined=date.today(),
        )

        resource = Resource.objects.create(
            name="Dr. Test User",
            resource_type="PERSON",
            code="DOC-TEST",
            staff_profile=staff,
        )

        assert resource.staff_profile == staff
        assert resource.staff_profile.user == test_user


# =============================================================================
# TimeSlot Model Tests
# =============================================================================


class TestTimeSlotModel:
    """Tests for the TimeSlot model (timezone-safe time slots)."""

    def test_create_timeslot(self, db):
        """Should create a basic time slot."""
        from hmis.apps.scheduling.models import TimeSlot

        slot = TimeSlot.objects.create(
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            timezone="Africa/Nairobi",
        )

        assert slot.id is not None
        assert slot.duration_minutes == 60

    def test_timeslot_must_have_end_after_start(self, db):
        """Should reject time slots where end is before start."""
        from hmis.apps.scheduling.models import TimeSlot

        now = timezone.now()
        slot = TimeSlot(
            start_time=now + timedelta(hours=1),
            end_time=now,  # End before start
            timezone="Africa/Nairobi",
        )

        with pytest.raises(ValidationError) as exc_info:
            slot.full_clean()

        assert "end_time" in str(exc_info.value)

    def test_timeslot_overlaps_detection(self, db):
        """Should detect overlapping time slots."""
        from hmis.apps.scheduling.models import TimeSlot

        now = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)

        slot1 = TimeSlot.objects.create(
            start_time=now,
            end_time=now + timedelta(hours=1),
            timezone="Africa/Nairobi",
        )

        slot2_start = now + timedelta(minutes=30)
        slot2_end = now + timedelta(hours=1, minutes=30)

        assert slot1.overlaps_with(slot2_start, slot2_end) is True

    def test_timeslot_no_overlap_adjacent(self, db):
        """Adjacent time slots should not overlap."""
        from hmis.apps.scheduling.models import TimeSlot

        now = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)

        slot1 = TimeSlot.objects.create(
            start_time=now,
            end_time=now + timedelta(hours=1),
            timezone="Africa/Nairobi",
        )

        slot2_start = now + timedelta(hours=1)  # Starts when slot1 ends
        slot2_end = now + timedelta(hours=2)

        assert slot1.overlaps_with(slot2_start, slot2_end) is False

    def test_timeslot_default_timezone_nairobi(self, db):
        """Should default to Africa/Nairobi timezone."""
        from hmis.apps.scheduling.models import TimeSlot

        slot = TimeSlot.objects.create(
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
        )

        assert slot.timezone == "Africa/Nairobi"

    def test_timeslot_duration_calculation(self, db):
        """Should calculate duration in minutes correctly."""
        from hmis.apps.scheduling.models import TimeSlot

        now = timezone.now()
        slot = TimeSlot.objects.create(
            start_time=now,
            end_time=now + timedelta(hours=2, minutes=30),
            timezone="Africa/Nairobi",
        )

        assert slot.duration_minutes == 150

    def test_timeslot_contains_datetime(self, db):
        """Should check if datetime falls within slot."""
        from hmis.apps.scheduling.models import TimeSlot

        now = timezone.now().replace(hour=10, minute=0, second=0, microsecond=0)
        slot = TimeSlot.objects.create(
            start_time=now,
            end_time=now + timedelta(hours=2),
            timezone="Africa/Nairobi",
        )

        # Middle of slot
        assert slot.contains(now + timedelta(hours=1)) is True
        # Before slot
        assert slot.contains(now - timedelta(hours=1)) is False
        # After slot
        assert slot.contains(now + timedelta(hours=3)) is False


# =============================================================================
# Schedule Model Tests
# =============================================================================


class TestScheduleModel:
    """Tests for the Schedule model (provider availability definitions)."""

    def test_create_recurring_schedule(self, db, sample_person_resource):
        """Should create a recurring weekly schedule."""
        from hmis.apps.scheduling.models import Schedule

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,  # Monday
            start_time=time(9, 0),
            end_time=time(17, 0),
            slot_duration_minutes=30,
            buffer_minutes=5,
            effective_from=date.today(),
            is_active=True,
        )

        assert schedule.id is not None
        assert schedule.schedule_type == "RECURRING"
        assert schedule.day_of_week == 0
        assert schedule.slot_duration_minutes == 30

    def test_create_one_time_schedule(self, db, sample_person_resource):
        """Should create a one-time schedule for specific date."""
        from hmis.apps.scheduling.models import Schedule

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="ONE_TIME",
            specific_date=date.today() + timedelta(days=7),
            start_time=time(10, 0),
            end_time=time(14, 0),
            slot_duration_minutes=60,
            is_active=True,
        )

        assert schedule.schedule_type == "ONE_TIME"
        assert schedule.specific_date is not None

    def test_schedule_generates_available_slots(self, db, sample_person_resource):
        """Should generate available time slots for a date."""
        from hmis.apps.scheduling.models import Schedule

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,  # Monday
            start_time=time(9, 0),
            end_time=time(11, 0),
            slot_duration_minutes=30,
            buffer_minutes=0,
            effective_from=date.today(),
            is_active=True,
        )

        # Find next Monday
        next_monday = date.today()
        while next_monday.weekday() != 0:
            next_monday += timedelta(days=1)

        slots = schedule.get_available_slots(next_monday)

        # 9:00-11:00, 30 min slots = 4 slots
        assert len(slots) == 4
        assert slots[0]["start_time"] == time(9, 0)
        assert slots[0]["end_time"] == time(9, 30)
        assert slots[3]["start_time"] == time(10, 30)
        assert slots[3]["end_time"] == time(11, 0)

    def test_schedule_respects_buffer_time(self, db, sample_person_resource):
        """Should include buffer time between slots."""
        from hmis.apps.scheduling.models import Schedule

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(10, 30),
            slot_duration_minutes=30,
            buffer_minutes=5,  # 5 min buffer
            effective_from=date.today(),
            is_active=True,
        )

        next_monday = date.today()
        while next_monday.weekday() != 0:
            next_monday += timedelta(days=1)

        slots = schedule.get_available_slots(next_monday)

        # 30 + 5 = 35 min per slot
        # 90 min / 35 min = 2 complete slots (70 min), leaves 20 min unused
        assert len(slots) == 2

    def test_schedule_with_effective_dates(self, db, sample_person_resource):
        """Should respect effective_from and effective_until dates."""
        from hmis.apps.scheduling.models import Schedule

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(17, 0),
            slot_duration_minutes=30,
            effective_from=date.today() + timedelta(days=30),  # Future
            effective_until=date.today() + timedelta(days=60),
            is_active=True,
        )

        # Check if schedule is active for a date
        assert schedule.is_effective_on(date.today()) is False
        assert schedule.is_effective_on(date.today() + timedelta(days=45)) is True
        assert schedule.is_effective_on(date.today() + timedelta(days=90)) is False

    def test_schedule_break_exclusion(self, db, sample_person_resource):
        """Should exclude break times from available slots."""
        from hmis.apps.scheduling.models import Schedule, ScheduleBreak

        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(14, 0),
            slot_duration_minutes=60,
            buffer_minutes=0,
            effective_from=date.today(),
            is_active=True,
        )

        # Add lunch break
        ScheduleBreak.objects.create(
            schedule=schedule,
            start_time=time(12, 0),
            end_time=time(13, 0),
            reason="Lunch Break",
        )

        next_monday = date.today()
        while next_monday.weekday() != 0:
            next_monday += timedelta(days=1)

        slots = schedule.get_available_slots(next_monday)

        # 9-14 = 5 hours, minus 1 hour lunch = 4 slots
        assert len(slots) == 4
        slot_times = [s["start_time"] for s in slots]
        assert time(12, 0) not in slot_times  # Lunch excluded


# =============================================================================
# Appointment Model Tests
# =============================================================================


class TestAppointmentModel:
    """Tests for the Appointment model (booking lifecycle)."""

    def test_create_appointment(self, db, sample_patient, sample_person_resource):
        """Should create an appointment with CREATED status."""
        from hmis.apps.scheduling.models import Appointment

        apt = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=24),
            scheduled_end=timezone.now() + timedelta(hours=24, minutes=30),
            reason="General checkup",
        )

        assert apt.id is not None
        assert apt.status == "CREATED"
        assert apt.patient == sample_patient
        assert apt.resource == sample_person_resource

    def test_appointment_lifecycle_transitions(
        self, db, sample_patient, sample_person_resource, test_user
    ):
        """Should follow valid lifecycle transitions."""
        from hmis.apps.scheduling.models import Appointment

        apt = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=1),
            scheduled_end=timezone.now() + timedelta(hours=1, minutes=30),
            reason="Consultation",
        )

        # CREATED -> CONFIRMED
        apt.confirm(user=test_user)
        assert apt.status == "CONFIRMED"

        # CONFIRMED -> CHECKED_IN
        apt.check_in(user=test_user)
        assert apt.status == "CHECKED_IN"
        assert apt.checked_in_at is not None

        # CHECKED_IN -> IN_PROGRESS
        apt.start(user=test_user)
        assert apt.status == "IN_PROGRESS"
        assert apt.actual_start is not None

        # IN_PROGRESS -> COMPLETED
        apt.complete(user=test_user, notes="Visit completed successfully")
        assert apt.status == "COMPLETED"
        assert apt.actual_end is not None
        assert apt.completion_notes == "Visit completed successfully"

    def test_appointment_cancellation(self, db, sample_patient, sample_person_resource, test_user):
        """Should allow cancellation from valid states."""
        from hmis.apps.scheduling.models import Appointment

        apt = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=24),
            scheduled_end=timezone.now() + timedelta(hours=24, minutes=30),
            reason="Follow-up",
        )

        apt.cancel(user=test_user, reason="Patient requested cancellation")
        assert apt.status == "CANCELLED"
        assert apt.cancellation_reason == "Patient requested cancellation"
        assert apt.cancelled_at is not None
        assert apt.cancelled_by == test_user

    def test_appointment_no_show(self, db, sample_patient, sample_person_resource, test_user):
        """Should mark appointment as NO_SHOW."""
        from hmis.apps.scheduling.models import Appointment

        apt = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() - timedelta(hours=1),  # Past
            scheduled_end=timezone.now() - timedelta(minutes=30),
            status="CONFIRMED",
            reason="Checkup",
        )

        apt.mark_no_show(user=test_user)
        assert apt.status == "NO_SHOW"

    def test_appointment_invalid_transition_rejected(
        self, db, sample_patient, sample_person_resource, test_user
    ):
        """Should reject invalid status transitions."""
        from hmis.apps.scheduling.models import Appointment

        apt = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=1),
            scheduled_end=timezone.now() + timedelta(hours=1, minutes=30),
            reason="Test",
        )

        # Cannot check-in without confirming first
        with pytest.raises(ValueError):
            apt.check_in(user=test_user)

        # Cannot complete without starting
        apt.confirm(user=test_user)
        apt.check_in(user=test_user)
        with pytest.raises(ValueError):
            apt.complete(user=test_user)

    def test_appointment_cannot_be_in_past(self, db, sample_patient, sample_person_resource):
        """Should reject appointments scheduled in the past (for new bookings)."""
        from hmis.apps.scheduling.models import Appointment

        past_time = timezone.now() - timedelta(hours=1)
        apt = Appointment(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=past_time,
            scheduled_end=past_time + timedelta(minutes=30),
            reason="Test",
        )

        with pytest.raises(ValidationError) as exc_info:
            apt.full_clean()

        assert "scheduled_start" in str(exc_info.value)

    def test_appointment_unique_number_generation(self, db, sample_patient, sample_person_resource):
        """Should auto-generate unique appointment number."""
        from hmis.apps.scheduling.models import Appointment

        apt1 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=1),
            scheduled_end=timezone.now() + timedelta(hours=1, minutes=30),
            reason="Test 1",
        )

        apt2 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=timezone.now() + timedelta(hours=2),
            scheduled_end=timezone.now() + timedelta(hours=2, minutes=30),
            reason="Test 2",
        )

        assert apt1.appointment_number is not None
        assert apt2.appointment_number is not None
        assert apt1.appointment_number != apt2.appointment_number
        assert apt1.appointment_number.startswith("APT-")


# =============================================================================
# Conflict Detection Tests
# =============================================================================


class TestConflictDetection:
    """Tests for scheduling conflict detection."""

    def test_detect_double_booking_same_resource(self, db, sample_patient, sample_person_resource):
        """Should detect double-booking the same resource."""
        from hmis.apps.scheduling.models import Appointment

        start_time = timezone.now() + timedelta(hours=24)
        end_time = start_time + timedelta(minutes=30)

        # First appointment
        Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=start_time,
            scheduled_end=end_time,
            status="CONFIRMED",
            reason="First appointment",
        )

        # Second appointment overlapping
        apt2 = Appointment(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=start_time + timedelta(minutes=15),
            scheduled_end=end_time + timedelta(minutes=15),
            reason="Second appointment",
        )

        with pytest.raises(ValidationError) as exc_info:
            apt2.full_clean()

        assert "conflict" in str(exc_info.value).lower()

    def test_allow_adjacent_appointments(self, db, sample_patient, sample_person_resource):
        """Should allow back-to-back appointments without overlap."""
        from hmis.apps.scheduling.models import Appointment

        start1 = timezone.now() + timedelta(hours=24)
        end1 = start1 + timedelta(minutes=30)

        apt1 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=start1,
            scheduled_end=end1,
            status="CONFIRMED",
            reason="First",
        )

        # Starts exactly when first ends
        apt2 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=end1,
            scheduled_end=end1 + timedelta(minutes=30),
            reason="Second",
        )

        assert apt2.id is not None

    def test_cancelled_appointments_dont_conflict(
        self, db, sample_patient, sample_person_resource, test_user
    ):
        """Cancelled appointments should not cause conflicts."""
        from hmis.apps.scheduling.models import Appointment

        start_time = timezone.now() + timedelta(hours=24)
        end_time = start_time + timedelta(minutes=30)

        apt1 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=start_time,
            scheduled_end=end_time,
            status="CREATED",
            reason="Cancelled appointment",
        )
        apt1.cancel(user=test_user, reason="Test cancellation")

        # Same time slot should now be available
        apt2 = Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=start_time,
            scheduled_end=end_time,
            reason="New appointment",
        )

        assert apt2.id is not None

    def test_different_resources_no_conflict(self, db, sample_patient):
        """Same time slot for different resources should not conflict."""
        from hmis.apps.scheduling.models import Appointment, Resource

        resource1 = Resource.objects.create(
            name="Doctor 1",
            resource_type="PERSON",
            code="DOC-001",
        )
        resource2 = Resource.objects.create(
            name="Doctor 2",
            resource_type="PERSON",
            code="DOC-002",
        )

        start_time = timezone.now() + timedelta(hours=24)
        end_time = start_time + timedelta(minutes=30)

        apt1 = Appointment.objects.create(
            patient=sample_patient,
            resource=resource1,
            appointment_type="CONSULTATION",
            scheduled_start=start_time,
            scheduled_end=end_time,
            status="CONFIRMED",
            reason="Doctor 1",
        )

        apt2 = Appointment.objects.create(
            patient=sample_patient,
            resource=resource2,
            appointment_type="CONSULTATION",
            scheduled_start=start_time,
            scheduled_end=end_time,
            reason="Doctor 2",
        )

        assert apt1.id is not None
        assert apt2.id is not None


# =============================================================================
# Availability Query Tests
# =============================================================================


class TestAvailabilityQueries:
    """Tests for availability query functionality."""

    def test_get_available_slots_for_date(self, db, sample_person_resource):
        """Should return available slots for a given date."""
        from hmis.apps.scheduling.models import Schedule
        from hmis.apps.scheduling.services import get_available_slots

        # Create schedule (Monday 9-12, 30 min slots)
        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,  # Monday
            start_time=time(9, 0),
            end_time=time(12, 0),
            slot_duration_minutes=30,
            buffer_minutes=0,
            effective_from=date.today(),
            is_active=True,
        )

        # Find next Monday
        next_monday = date.today()
        while next_monday.weekday() != 0:
            next_monday += timedelta(days=1)

        slots = get_available_slots(sample_person_resource, next_monday)

        assert len(slots) == 6  # 3 hours / 30 min = 6 slots

    def test_get_available_slots_excludes_booked(self, db, sample_patient, sample_person_resource):
        """Should exclude already booked slots."""
        from hmis.apps.scheduling.models import Appointment, Schedule
        from hmis.apps.scheduling.services import get_available_slots

        # Find next Monday
        next_monday = date.today()
        while next_monday.weekday() != 0:
            next_monday += timedelta(days=1)

        # Create schedule
        schedule = Schedule.objects.create(
            resource=sample_person_resource,
            schedule_type="RECURRING",
            day_of_week=0,
            start_time=time(9, 0),
            end_time=time(12, 0),
            slot_duration_minutes=60,
            buffer_minutes=0,
            effective_from=date.today(),
            is_active=True,
        )

        # Book the 10:00 slot
        nairobi_tz = ZoneInfo("Africa/Nairobi")
        booked_start = datetime.combine(next_monday, time(10, 0), tzinfo=nairobi_tz)
        booked_end = datetime.combine(next_monday, time(11, 0), tzinfo=nairobi_tz)

        Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=booked_start,
            scheduled_end=booked_end,
            status="CONFIRMED",
            reason="Existing booking",
        )

        slots = get_available_slots(sample_person_resource, next_monday)

        # Should have 2 slots (9:00 and 11:00), not 3
        assert len(slots) == 2
        slot_times = [s["start_time"] for s in slots]
        assert time(10, 0) not in slot_times

    def test_get_resource_availability_week_view(self, db, sample_person_resource):
        """Should return weekly availability for a resource."""
        from hmis.apps.scheduling.models import Schedule
        from hmis.apps.scheduling.services import get_weekly_availability

        # Create Mon-Fri schedule
        for day in range(5):  # Mon-Fri
            Schedule.objects.create(
                resource=sample_person_resource,
                schedule_type="RECURRING",
                day_of_week=day,
                start_time=time(9, 0),
                end_time=time(17, 0),
                slot_duration_minutes=30,
                effective_from=date.today(),
                is_active=True,
            )

        availability = get_weekly_availability(
            sample_person_resource,
            date.today(),
        )

        assert "monday" in availability
        assert "saturday" in availability
        assert len(availability["monday"]["slots"]) > 0
        assert len(availability["saturday"]["slots"]) == 0  # No Saturday schedule


# Fixtures for sample_person_resource, sample_place_resource, sample_schedule,
# and sample_appointment are in tests/scheduling/conftest.py


@pytest.fixture
def sample_department(db):
    """Create a sample department for testing."""
    from hmis.apps.core.models import Department

    return Department.objects.create(
        code="OPD",
        name="Outpatient Department",
        department_type="CLINICAL",
        is_active=True,
    )


@pytest.fixture
def sample_role(db):
    """Create a sample role for testing."""
    from hmis.apps.core.models import Role

    role, _ = Role.objects.get_or_create(
        code="DOCTOR",
        defaults={
            "name": "Doctor",
            "category": "CLINICAL",
            "description": "Medical Doctor",
        },
    )
    return role

"""
Tests for Scheduling API - Phase 1: Core Scheduling Foundation.

This module tests:
- Resource CRUD endpoints
- Schedule CRUD endpoints
- Appointment CRUD endpoints
- Availability query endpoints
- Conflict detection in API
- Audit logging for scheduling actions

Following TDD approach: Write tests BEFORE implementation.
"""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

# =============================================================================
# Resource API Tests
# =============================================================================


class TestResourceAPI:
    """Tests for Resource CRUD endpoints."""

    def test_list_resources(self, authenticated_client, sample_person_resource):
        """Should list all resources."""
        response = authenticated_client.get("/api/scheduling/resources/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_resources_filter_by_type(
        self, authenticated_client, sample_person_resource, sample_place_resource
    ):
        """Should filter resources by type."""
        response = authenticated_client.get("/api/scheduling/resources/?resource_type=PERSON")

        assert response.status_code == status.HTTP_200_OK
        for resource in response.data["results"]:
            assert resource["resource_type"] == "PERSON"

    def test_list_resources_filter_active_only(self, authenticated_client, db):
        """Should filter active resources only."""
        from hmis.apps.scheduling.models import Resource

        Resource.objects.create(
            name="Active Resource",
            resource_type="PERSON",
            code="RES-ACTIVE",
            is_active=True,
        )
        Resource.objects.create(
            name="Inactive Resource",
            resource_type="PERSON",
            code="RES-INACTIVE",
            is_active=False,
        )

        response = authenticated_client.get("/api/scheduling/resources/?is_active=true")

        assert response.status_code == status.HTTP_200_OK
        for resource in response.data["results"]:
            assert resource["is_active"] is True

    def test_create_resource(self, authenticated_client):
        """Should create a new resource."""
        data = {
            "name": "Dr. New Doctor",
            "resource_type": "PERSON",
            "code": "DOC-NEW-001",
            "is_active": True,
            "metadata": {"specialty": "Pediatrics"},
        }

        response = authenticated_client.post("/api/scheduling/resources/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Dr. New Doctor"
        assert response.data["code"] == "DOC-NEW-001"

    def test_create_resource_validates_unique_code(
        self, authenticated_client, sample_person_resource
    ):
        """Should reject duplicate resource codes."""
        data = {
            "name": "Duplicate Code",
            "resource_type": "PERSON",
            "code": sample_person_resource.code,  # Duplicate
        }

        response = authenticated_client.post("/api/scheduling/resources/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "code" in response.data

    def test_retrieve_resource(self, authenticated_client, sample_person_resource):
        """Should retrieve a single resource."""
        response = authenticated_client.get(
            f"/api/scheduling/resources/{sample_person_resource.id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_person_resource.id
        assert response.data["name"] == sample_person_resource.name

    def test_update_resource(self, authenticated_client, sample_person_resource):
        """Should update a resource."""
        data = {"name": "Dr. Updated Name"}

        response = authenticated_client.patch(
            f"/api/scheduling/resources/{sample_person_resource.id}/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Dr. Updated Name"

    def test_delete_resource_soft_delete(self, authenticated_client, sample_person_resource):
        """Should soft delete (deactivate) a resource."""
        response = authenticated_client.delete(
            f"/api/scheduling/resources/{sample_person_resource.id}/"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

        # Should still exist but be inactive
        from hmis.apps.scheduling.models import Resource

        resource = Resource.objects.get(id=sample_person_resource.id)
        assert resource.is_active is False

    def test_resource_api_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/scheduling/resources/")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Schedule API Tests
# =============================================================================


class TestScheduleAPI:
    """Tests for Schedule CRUD endpoints."""

    def test_list_schedules(self, authenticated_client, sample_schedule):
        """Should list all schedules."""
        response = authenticated_client.get("/api/scheduling/schedules/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_schedules_filter_by_resource(self, authenticated_client, sample_schedule):
        """Should filter schedules by resource."""
        response = authenticated_client.get(
            f"/api/scheduling/schedules/?resource={sample_schedule.resource.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        for schedule in response.data["results"]:
            assert schedule["resource"] == sample_schedule.resource.id

    def test_create_recurring_schedule(self, authenticated_client, sample_person_resource):
        """Should create a recurring schedule."""
        data = {
            "resource": sample_person_resource.id,
            "schedule_type": "RECURRING",
            "day_of_week": 1,  # Tuesday
            "start_time": "09:00:00",
            "end_time": "17:00:00",
            "slot_duration_minutes": 30,
            "buffer_minutes": 5,
            "effective_from": str(date.today()),
            "is_active": True,
        }

        response = authenticated_client.post("/api/scheduling/schedules/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["schedule_type"] == "RECURRING"
        assert response.data["day_of_week"] == 1

    def test_create_one_time_schedule(self, authenticated_client, sample_person_resource):
        """Should create a one-time schedule."""
        target_date = date.today() + timedelta(days=14)
        data = {
            "resource": sample_person_resource.id,
            "schedule_type": "ONE_TIME",
            "specific_date": str(target_date),
            "start_time": "10:00:00",
            "end_time": "14:00:00",
            "slot_duration_minutes": 60,
            "is_active": True,
        }

        response = authenticated_client.post("/api/scheduling/schedules/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["schedule_type"] == "ONE_TIME"
        assert response.data["specific_date"] == str(target_date)

    def test_schedule_validates_time_range(self, authenticated_client, sample_person_resource):
        """Should reject end_time before start_time."""
        data = {
            "resource": sample_person_resource.id,
            "schedule_type": "RECURRING",
            "day_of_week": 0,
            "start_time": "17:00:00",
            "end_time": "09:00:00",  # Before start
            "slot_duration_minutes": 30,
            "effective_from": str(date.today()),
            "is_active": True,
        }

        response = authenticated_client.post("/api/scheduling/schedules/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_schedule(self, authenticated_client, sample_schedule):
        """Should update a schedule."""
        data = {"slot_duration_minutes": 45}

        response = authenticated_client.patch(
            f"/api/scheduling/schedules/{sample_schedule.id}/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["slot_duration_minutes"] == 45

    def test_add_break_to_schedule(self, authenticated_client, sample_schedule):
        """Should add a break to a schedule."""
        data = {
            "start_time": "12:00:00",
            "end_time": "13:00:00",
            "reason": "Lunch Break",
        }

        response = authenticated_client.post(
            f"/api/scheduling/schedules/{sample_schedule.id}/breaks/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["reason"] == "Lunch Break"


# =============================================================================
# Appointment API Tests
# =============================================================================


class TestAppointmentAPI:
    """Tests for Appointment CRUD endpoints."""

    def test_list_appointments(self, authenticated_client, sample_appointment):
        """Should list all appointments."""
        response = authenticated_client.get("/api/scheduling/appointments/")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["results"]) >= 1

    def test_list_appointments_filter_by_patient(self, authenticated_client, sample_appointment):
        """Should filter appointments by patient."""
        response = authenticated_client.get(
            f"/api/scheduling/appointments/?patient={sample_appointment.patient.id}"
        )

        assert response.status_code == status.HTTP_200_OK
        for apt in response.data["results"]:
            assert apt["patient"] == sample_appointment.patient.id

    def test_list_appointments_filter_by_date_range(self, authenticated_client, sample_appointment):
        """Should filter appointments by date range."""
        today = date.today()
        tomorrow = today + timedelta(days=1)

        response = authenticated_client.get(
            f"/api/scheduling/appointments/?from_date={today}&to_date={tomorrow}"
        )

        assert response.status_code == status.HTTP_200_OK

    def test_list_appointments_filter_by_status(self, authenticated_client, sample_appointment):
        """Should filter appointments by status."""
        response = authenticated_client.get("/api/scheduling/appointments/?status=CREATED")

        assert response.status_code == status.HTTP_200_OK
        for apt in response.data["results"]:
            assert apt["status"] == "CREATED"

    def test_create_appointment(self, authenticated_client, sample_patient, sample_person_resource):
        """Should create a new appointment."""
        scheduled_start = timezone.now() + timedelta(days=1)
        scheduled_end = scheduled_start + timedelta(minutes=30)

        data = {
            "patient": sample_patient.id,
            "resource": sample_person_resource.id,
            "appointment_type": "CONSULTATION",
            "scheduled_start": scheduled_start.isoformat(),
            "scheduled_end": scheduled_end.isoformat(),
            "reason": "General checkup",
        }

        response = authenticated_client.post("/api/scheduling/appointments/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["status"] == "CREATED"
        assert response.data["appointment_number"] is not None
        assert response.data["appointment_number"].startswith("APT-")

    def test_create_appointment_detects_conflict(
        self, authenticated_client, sample_appointment, sample_patient
    ):
        """Should reject conflicting appointments."""
        data = {
            "patient": sample_patient.id,
            "resource": sample_appointment.resource.id,
            "appointment_type": "CONSULTATION",
            "scheduled_start": sample_appointment.scheduled_start.isoformat(),
            "scheduled_end": sample_appointment.scheduled_end.isoformat(),
            "reason": "Conflicting appointment",
        }

        response = authenticated_client.post("/api/scheduling/appointments/", data, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "conflict" in str(response.data).lower()

    def test_retrieve_appointment(self, authenticated_client, sample_appointment):
        """Should retrieve a single appointment."""
        response = authenticated_client.get(
            f"/api/scheduling/appointments/{sample_appointment.id}/"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["id"] == sample_appointment.id

    def test_update_appointment(self, authenticated_client, sample_appointment):
        """Should update an appointment."""
        data = {"reason": "Updated reason"}

        response = authenticated_client.patch(
            f"/api/scheduling/appointments/{sample_appointment.id}/",
            data,
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["reason"] == "Updated reason"

    def test_confirm_appointment(self, authenticated_client, sample_appointment):
        """Should confirm an appointment."""
        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/confirm/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CONFIRMED"

    def test_check_in_appointment(self, authenticated_client, sample_appointment, test_user):
        """Should check in a confirmed appointment."""
        sample_appointment.confirm(user=test_user)
        sample_appointment.save()

        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/check-in/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CHECKED_IN"
        assert response.data["checked_in_at"] is not None

    def test_start_appointment(self, authenticated_client, sample_appointment, test_user):
        """Should start an appointment."""
        sample_appointment.confirm(user=test_user)
        sample_appointment.check_in(user=test_user)
        sample_appointment.save()

        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/start/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "IN_PROGRESS"

    def test_complete_appointment(self, authenticated_client, sample_appointment, test_user):
        """Should complete an appointment."""
        sample_appointment.confirm(user=test_user)
        sample_appointment.check_in(user=test_user)
        sample_appointment.start(user=test_user)
        sample_appointment.save()

        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/complete/",
            {"notes": "Visit completed successfully"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"

    def test_cancel_appointment(self, authenticated_client, sample_appointment):
        """Should cancel an appointment."""
        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/cancel/",
            {"reason": "Patient requested cancellation"},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "CANCELLED"
        assert response.data["cancellation_reason"] == "Patient requested cancellation"

    def test_mark_no_show(self, authenticated_client, sample_appointment, test_user):
        """Should mark appointment as no-show."""
        sample_appointment.confirm(user=test_user)
        sample_appointment.save()

        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/no-show/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "NO_SHOW"


# =============================================================================
# Availability API Tests
# =============================================================================


class TestAvailabilityAPI:
    """Tests for availability query endpoints."""

    def test_get_resource_availability(
        self, authenticated_client, sample_person_resource, sample_schedule
    ):
        """Should return available slots for a resource on a date."""
        # Find next Monday
        target_date = date.today()
        while target_date.weekday() != sample_schedule.day_of_week:
            target_date += timedelta(days=1)

        response = authenticated_client.get(
            f"/api/scheduling/resources/{sample_person_resource.id}/availability/?date={target_date}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "slots" in response.data
        assert len(response.data["slots"]) > 0

    def test_get_resource_weekly_availability(
        self, authenticated_client, sample_person_resource, sample_schedule
    ):
        """Should return weekly availability for a resource."""
        response = authenticated_client.get(
            f"/api/scheduling/resources/{sample_person_resource.id}/availability/weekly/"
            f"?start_date={date.today()}"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "monday" in response.data or "tuesday" in response.data

    def test_availability_excludes_booked_slots(
        self, authenticated_client, sample_person_resource, sample_schedule, sample_patient
    ):
        """Should exclude booked slots from availability."""
        from hmis.apps.scheduling.models import Appointment

        # Find next matching day
        target_date = date.today()
        while target_date.weekday() != sample_schedule.day_of_week:
            target_date += timedelta(days=1)

        # Book a slot
        nairobi_tz = ZoneInfo("Africa/Nairobi")
        booked_start = datetime.combine(target_date, sample_schedule.start_time, tzinfo=nairobi_tz)
        booked_end = booked_start + timedelta(minutes=sample_schedule.slot_duration_minutes)

        Appointment.objects.create(
            patient=sample_patient,
            resource=sample_person_resource,
            appointment_type="CONSULTATION",
            scheduled_start=booked_start,
            scheduled_end=booked_end,
            status="CONFIRMED",
            reason="Test booking",
        )

        response = authenticated_client.get(
            f"/api/scheduling/resources/{sample_person_resource.id}/availability/?date={target_date}"
        )

        assert response.status_code == status.HTTP_200_OK
        slot_times = [s["start_time"] for s in response.data["slots"]]
        assert sample_schedule.start_time.isoformat() not in slot_times

    def test_check_slot_availability(
        self, authenticated_client, sample_person_resource, sample_schedule
    ):
        """Should check if specific slot is available."""
        target_date = date.today()
        while target_date.weekday() != sample_schedule.day_of_week:
            target_date += timedelta(days=1)

        response = authenticated_client.get(
            f"/api/scheduling/resources/{sample_person_resource.id}/availability/check/"
            f"?date={target_date}&start_time={sample_schedule.start_time}&duration_minutes=30"
        )

        assert response.status_code == status.HTTP_200_OK
        assert "available" in response.data
        assert response.data["available"] is True


# =============================================================================
# Audit Logging Tests
# =============================================================================


class TestSchedulingAuditLog:
    """Tests for audit logging of scheduling actions."""

    def test_appointment_creation_logged(
        self, authenticated_client, sample_patient, sample_person_resource
    ):
        """Should log appointment creation."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.count()

        scheduled_start = timezone.now() + timedelta(days=1)
        data = {
            "patient": sample_patient.id,
            "resource": sample_person_resource.id,
            "appointment_type": "CONSULTATION",
            "scheduled_start": scheduled_start.isoformat(),
            "scheduled_end": (scheduled_start + timedelta(minutes=30)).isoformat(),
            "reason": "Audit test",
        }

        response = authenticated_client.post("/api/scheduling/appointments/", data, format="json")

        assert response.status_code == status.HTTP_201_CREATED
        assert AuditLog.objects.count() > initial_count

        log = AuditLog.objects.filter(action="appointment_create").last()
        assert log is not None
        assert log.resource_type == "Appointment"

    def test_appointment_status_change_logged(self, authenticated_client, sample_appointment):
        """Should log appointment status changes."""
        from hmis.apps.core.models import AuditLog

        initial_count = AuditLog.objects.count()

        response = authenticated_client.post(
            f"/api/scheduling/appointments/{sample_appointment.id}/confirm/",
            {},
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert AuditLog.objects.count() > initial_count

        log = AuditLog.objects.filter(action="appointment_confirm").last()
        assert log is not None


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_person_resource(db):
    """Create a sample person resource for testing."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Test Doctor",
        resource_type="PERSON",
        code="DOC-TEST-API-001",
        is_active=True,
        metadata={"specialty": "General Practice"},
    )


@pytest.fixture
def sample_place_resource(db):
    """Create a sample place resource for testing."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Consultation Room 1",
        resource_type="PLACE",
        code="ROOM-API-001",
        capacity=2,
        is_active=True,
    )


@pytest.fixture
def sample_schedule(db, sample_person_resource):
    """Create a sample schedule for testing."""
    from hmis.apps.scheduling.models import Schedule

    return Schedule.objects.create(
        resource=sample_person_resource,
        schedule_type="RECURRING",
        day_of_week=0,  # Monday
        start_time=time(9, 0),
        end_time=time(17, 0),
        slot_duration_minutes=30,
        buffer_minutes=0,
        effective_from=date.today(),
        is_active=True,
    )


@pytest.fixture
def sample_appointment(db, sample_patient, sample_person_resource):
    """Create a sample appointment for testing."""
    from hmis.apps.scheduling.models import Appointment

    scheduled_start = timezone.now() + timedelta(hours=24)
    scheduled_end = scheduled_start + timedelta(minutes=30)

    return Appointment.objects.create(
        patient=sample_patient,
        resource=sample_person_resource,
        appointment_type="CONSULTATION",
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        reason="Test appointment",
    )

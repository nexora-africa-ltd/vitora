"""
Tests for Imaging Scheduling Calendar.

Following TDD methodology - tests written BEFORE implementation.

Task B.2.3: Add scheduling calendar view (deferred from Phase B)

This module tests:
- Imaging room/machine resources integration with scheduling
- ImagingOrder -> Appointment linking
- Calendar availability for imaging departments
- Slot availability and booking for imaging procedures
"""

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.imaging.models import ImagingOrder, ImagingProcedure
from hmis.apps.scheduling.models import Appointment, Resource, Schedule

# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def imaging_room_resource(db, sample_facility):
    """Create an imaging room resource (X-Ray Room 1)."""
    return Resource.objects.create(
        name="X-Ray Room 1",
        resource_type="PLACE",
        code="IMG-XRAY-01",
        is_active=True,
        capacity=1,
        facility=sample_facility,
        metadata={
            "department": "radiology",
            "modalities": ["XR"],
            "has_contrast_capability": False,
        },
    )


@pytest.fixture
def ct_scanner_resource(db, sample_facility):
    """Create a CT scanner asset resource."""
    return Resource.objects.create(
        name="CT Scanner 1",
        resource_type="ASSET",
        code="IMG-CT-01",
        is_active=True,
        capacity=1,
        facility=sample_facility,
        metadata={
            "department": "radiology",
            "modalities": ["CT"],
            "has_contrast_capability": True,
        },
    )


@pytest.fixture
def mri_scanner_resource(db, sample_facility):
    """Create an MRI scanner asset resource."""
    return Resource.objects.create(
        name="MRI Scanner 1",
        resource_type="ASSET",
        code="IMG-MRI-01",
        is_active=True,
        capacity=1,
        facility=sample_facility,
        metadata={
            "department": "radiology",
            "modalities": ["MRI"],
            "has_contrast_capability": True,
        },
    )


@pytest.fixture
def imaging_room_schedule(db, imaging_room_resource):
    """Create a schedule for the X-Ray room (Mon-Fri 8am-5pm)."""
    schedules = []
    for day in range(5):  # Monday to Friday
        schedules.append(
            Schedule.objects.create(
                resource=imaging_room_resource,
                schedule_type="RECURRING",
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(17, 0),
                slot_duration_minutes=30,  # 30-minute imaging slots
                buffer_minutes=10,  # 10-minute buffer between procedures
                is_active=True,
            )
        )
    return schedules


@pytest.fixture
def ct_scanner_schedule(db, ct_scanner_resource):
    """Create a schedule for CT scanner (Mon-Fri 8am-6pm, 45min slots)."""
    schedules = []
    for day in range(5):  # Monday to Friday
        schedules.append(
            Schedule.objects.create(
                resource=ct_scanner_resource,
                schedule_type="RECURRING",
                day_of_week=day,
                start_time=time(8, 0),
                end_time=time(18, 0),
                slot_duration_minutes=45,  # CT scans take longer
                buffer_minutes=15,
                is_active=True,
            )
        )
    return schedules


@pytest.fixture
def xray_procedure(db):
    """Create an X-Ray procedure."""
    return ImagingProcedure.objects.create(
        code="XR-CHEST-PA",
        name="Chest X-Ray PA View",
        modality="XR",
        body_region="CHEST",
        cost=Decimal("1500.00"),
        sha_claimable=True,
        turnaround_hours=24,
    )


@pytest.fixture
def ct_procedure(db):
    """Create a CT procedure."""
    return ImagingProcedure.objects.create(
        code="CT-HEAD-NC",
        name="CT Head without Contrast",
        modality="CT",
        body_region="HEAD",
        cost=Decimal("8000.00"),
        sha_claimable=True,
        turnaround_hours=48,
    )


@pytest.fixture
def imaging_order(db, sample_patient, sample_encounter, test_user, xray_procedure):
    """Create a sample imaging order for testing."""
    order = ImagingOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        priority="ROUTINE",
        clinical_indication="Rule out pneumonia",
        status="ORDERED",
    )
    order.items.create(
        procedure=xray_procedure,
        laterality="NA",
        unit_cost=xray_procedure.cost,
    )
    return order


# ============================================================================
# Imaging Resources API Tests
# ============================================================================


@pytest.mark.django_db
class TestImagingResourcesAPI:
    """Tests for listing imaging-specific resources."""

    def test_list_imaging_resources(
        self, authenticated_client, imaging_room_resource, ct_scanner_resource
    ):
        """Should list resources filtered by radiology department."""
        response = authenticated_client.get("/api/imaging/resources/")

        assert response.status_code == status.HTTP_200_OK
        # Only radiology resources should be returned
        codes = [r["code"] for r in response.data["results"]]
        assert "IMG-XRAY-01" in codes
        assert "IMG-CT-01" in codes

    def test_list_imaging_resources_filter_by_modality(
        self, authenticated_client, imaging_room_resource, ct_scanner_resource
    ):
        """Should filter imaging resources by modality."""
        response = authenticated_client.get("/api/imaging/resources/?modality=XR")

        assert response.status_code == status.HTTP_200_OK
        # Only X-Ray capable resources should be returned
        for resource in response.data["results"]:
            assert "XR" in resource["metadata"].get("modalities", [])

    def test_list_imaging_resources_requires_auth(self, api_client):
        """Should require authentication."""
        response = api_client.get("/api/imaging/resources/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# ============================================================================
# Imaging Calendar Availability API Tests
# ============================================================================


@pytest.mark.django_db
class TestImagingCalendarAvailabilityAPI:
    """Tests for imaging calendar availability endpoints."""

    def test_get_imaging_slots_for_date(
        self, authenticated_client, imaging_room_resource, imaging_room_schedule
    ):
        """Should return available slots for a specific imaging resource and date."""
        # Get next Monday
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)

        response = authenticated_client.get(
            f"/api/imaging/resources/{imaging_room_resource.id}/availability/",
            {"date": next_monday.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "slots" in response.data
        assert len(response.data["slots"]) > 0

        # Verify slot structure
        slot = response.data["slots"][0]
        assert "start_time" in slot
        assert "end_time" in slot
        assert "is_available" in slot

    def test_get_imaging_weekly_availability(
        self, authenticated_client, imaging_room_resource, imaging_room_schedule
    ):
        """Should return weekly availability calendar."""
        today = date.today()

        response = authenticated_client.get(
            f"/api/imaging/resources/{imaging_room_resource.id}/availability/weekly/",
            {"start_date": today.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "days" in response.data
        assert len(response.data["days"]) == 7  # Full week

    def test_check_slot_availability(
        self, authenticated_client, imaging_room_resource, imaging_room_schedule
    ):
        """Should check if a specific slot is available."""
        # Get next Monday 9:00 AM
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)

        response = authenticated_client.get(
            f"/api/imaging/resources/{imaging_room_resource.id}/availability/check/",
            {
                "date": next_monday.isoformat(),
                "start_time": "09:00",
                "end_time": "09:30",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert "is_available" in response.data
        assert response.data["is_available"] is True  # No bookings yet


# ============================================================================
# Schedule Imaging Order Tests
# ============================================================================


@pytest.mark.django_db
class TestScheduleImagingOrderAPI:
    """Tests for scheduling imaging orders via calendar."""

    def test_schedule_imaging_order_with_appointment(
        self,
        authenticated_client,
        imaging_order,
        imaging_room_resource,
        imaging_room_schedule,
    ):
        """Should schedule an imaging order and create linked appointment."""
        # Get next Monday 10:00 AM
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)
        scheduled_datetime = datetime.combine(
            next_monday, time(10, 0), tzinfo=ZoneInfo("Africa/Nairobi")
        )

        response = authenticated_client.post(
            f"/api/imaging/orders/{imaging_order.order_number}/schedule/",
            {
                "resource_id": imaging_room_resource.id,
                "scheduled_datetime": scheduled_datetime.isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "SCHEDULED"
        assert "appointment" in response.data
        assert response.data["appointment"]["resource"]["id"] == imaging_room_resource.id

        # Verify appointment was created
        imaging_order.refresh_from_db()
        assert imaging_order.appointment is not None
        assert imaging_order.appointment.appointment_type == "IMAGING"
        assert imaging_order.appointment.status == "CONFIRMED"

    def test_schedule_imaging_order_checks_availability(
        self,
        authenticated_client,
        imaging_order,
        imaging_room_resource,
        imaging_room_schedule,
        sample_patient,
    ):
        """Should reject scheduling when slot is not available."""
        # Get next Monday 10:00 AM
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)
        scheduled_datetime = datetime.combine(
            next_monday, time(10, 0), tzinfo=ZoneInfo("Africa/Nairobi")
        )

        # Create a blocking appointment first
        Appointment.objects.create(
            patient=sample_patient,
            resource=imaging_room_resource,
            appointment_type="IMAGING",
            scheduled_start=scheduled_datetime,
            scheduled_end=scheduled_datetime + timedelta(minutes=30),
            status="CONFIRMED",
            reason="Existing booking",
        )

        response = authenticated_client.post(
            f"/api/imaging/orders/{imaging_order.order_number}/schedule/",
            {
                "resource_id": imaging_room_resource.id,
                "scheduled_datetime": scheduled_datetime.isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert "not available" in response.data["error"].lower()

    def test_schedule_imaging_order_validates_resource_modality(
        self,
        authenticated_client,
        imaging_order,  # Has XR procedure
        ct_scanner_resource,  # CT only
        ct_scanner_schedule,
    ):
        """Should validate that resource supports the required modality."""
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)
        scheduled_datetime = datetime.combine(
            next_monday, time(10, 0), tzinfo=ZoneInfo("Africa/Nairobi")
        )

        response = authenticated_client.post(
            f"/api/imaging/orders/{imaging_order.order_number}/schedule/",
            {
                "resource_id": ct_scanner_resource.id,  # Wrong modality!
                "scheduled_datetime": scheduled_datetime.isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "modality" in response.data["error"].lower()

    def test_reschedule_imaging_order(
        self,
        authenticated_client,
        imaging_order,
        imaging_room_resource,
        imaging_room_schedule,
    ):
        """Should allow rescheduling an already scheduled order."""
        # First schedule
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)
        first_datetime = datetime.combine(
            next_monday, time(10, 0), tzinfo=ZoneInfo("Africa/Nairobi")
        )

        # Schedule first
        authenticated_client.post(
            f"/api/imaging/orders/{imaging_order.order_number}/schedule/",
            {
                "resource_id": imaging_room_resource.id,
                "scheduled_datetime": first_datetime.isoformat(),
            },
            format="json",
        )

        # Reschedule to different time
        new_datetime = datetime.combine(next_monday, time(14, 0), tzinfo=ZoneInfo("Africa/Nairobi"))

        response = authenticated_client.post(
            f"/api/imaging/orders/{imaging_order.order_number}/schedule/",
            {
                "resource_id": imaging_room_resource.id,
                "scheduled_datetime": new_datetime.isoformat(),
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK

        # Old slot should be freed
        imaging_order.refresh_from_db()
        # Appointment is stored in UTC, Kenya is UTC+3, so 14:00 EAT = 11:00 UTC
        assert imaging_order.appointment.scheduled_start.hour == 11


# ============================================================================
# Imaging Calendar View API Tests
# ============================================================================


@pytest.mark.django_db
class TestImagingCalendarViewAPI:
    """Tests for the imaging calendar overview endpoint."""

    def test_get_department_calendar(
        self,
        authenticated_client,
        imaging_room_resource,
        ct_scanner_resource,
        imaging_room_schedule,
        ct_scanner_schedule,
    ):
        """Should return combined calendar view for all imaging resources."""
        today = date.today()

        response = authenticated_client.get(
            "/api/imaging/calendar/",
            {"date": today.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK
        assert "resources" in response.data
        assert len(response.data["resources"]) >= 2

        # Each resource should have slots
        for resource_data in response.data["resources"]:
            assert "resource" in resource_data
            assert "slots" in resource_data

    def test_get_department_calendar_with_appointments(
        self,
        authenticated_client,
        imaging_room_resource,
        imaging_room_schedule,
        imaging_order,
        sample_patient,
    ):
        """Should show booked slots in calendar."""
        # Get next Monday
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        next_monday = today + timedelta(days=days_until_monday)
        scheduled_datetime = datetime.combine(
            next_monday, time(10, 0), tzinfo=ZoneInfo("Africa/Nairobi")
        )

        # Create appointment
        appointment = Appointment.objects.create(
            patient=sample_patient,
            resource=imaging_room_resource,
            appointment_type="IMAGING",
            scheduled_start=scheduled_datetime,
            scheduled_end=scheduled_datetime + timedelta(minutes=30),
            status="CONFIRMED",
            reason="Chest X-Ray",
        )

        response = authenticated_client.get(
            "/api/imaging/calendar/",
            {"date": next_monday.isoformat()},
        )

        assert response.status_code == status.HTTP_200_OK

        # Find the imaging room in response
        room_data = next(
            (
                r
                for r in response.data["resources"]
                if r["resource"]["id"] == imaging_room_resource.id
            ),
            None,
        )
        assert room_data is not None

        # Find the 10:00 slot - should be booked
        booked_slot = next(
            (s for s in room_data["slots"] if s["start_time"] == "10:00:00"),
            None,
        )
        assert booked_slot is not None
        assert booked_slot["is_available"] is False
        assert booked_slot["appointment"]["id"] == appointment.id


# ============================================================================
# ImagingOrder Appointment Linking Tests
# ============================================================================


@pytest.mark.django_db
class TestImagingOrderAppointmentLink:
    """Tests for the ImagingOrder -> Appointment FK relationship."""

    def test_imaging_order_has_appointment_field(self, imaging_order):
        """ImagingOrder should have optional appointment field."""
        assert hasattr(imaging_order, "appointment")
        assert imaging_order.appointment is None  # Not scheduled yet

    def test_appointment_links_back_to_imaging_order(
        self, imaging_order, imaging_room_resource, sample_patient
    ):
        """Appointment should have imaging_order reference."""
        from hmis.apps.scheduling.models import Appointment

        scheduled_datetime = timezone.now() + timedelta(days=1)

        appointment = Appointment.objects.create(
            patient=sample_patient,
            resource=imaging_room_resource,
            appointment_type="IMAGING",
            scheduled_start=scheduled_datetime,
            scheduled_end=scheduled_datetime + timedelta(minutes=30),
            status="CONFIRMED",
            reason="Chest X-Ray",
        )

        imaging_order.appointment = appointment
        imaging_order.save()

        # Can navigate back from appointment to imaging order
        assert hasattr(appointment, "imaging_order")
        assert appointment.imaging_order == imaging_order

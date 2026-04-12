"""
Tests for Shift attendance / clock-in endpoints.

Tests:
- GET /api/scheduling/shifts/my-today/ — today's shift for current user
- GET /api/scheduling/shifts/my-history/ — personal shift history with stats
- POST /api/scheduling/shifts/{id}/start/ — clock in
- POST /api/scheduling/shifts/{id}/complete/ — clock out
"""

from datetime import date, time, timedelta

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def my_resource(db, test_staff_profile, sample_facility):
    """Create a Resource linked to the test user's StaffProfile."""
    from hmis.apps.scheduling.models import Resource

    return Resource.objects.create(
        name="Dr. Test Doctor",
        resource_type="PERSON",
        code="DOC-ME-001",
        is_active=True,
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def my_shift_today(db, my_resource, sample_facility):
    """Create a SCHEDULED shift for today for the test user."""
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=my_resource,
        shift_date=date.today(),
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="SCHEDULED",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def my_completed_shifts(db, my_resource, sample_facility):
    """Create several completed shifts for history/stats tests."""
    from hmis.apps.scheduling.models import Shift

    shifts = []
    for i in range(5):
        shift_date = date.today() - timedelta(days=i + 1)
        scheduled_start = timezone.make_aware(
            timezone.datetime(shift_date.year, shift_date.month, shift_date.day, 7, 0)
        )
        s = Shift.objects.create(
            staff_resource=my_resource,
            shift_date=shift_date,
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="COMPLETED",
            started_at=scheduled_start + timedelta(minutes=3),  # on-time
            completed_at=scheduled_start + timedelta(hours=12, minutes=10),
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        shifts.append(s)

    # Add one late shift
    shift_date = date.today() - timedelta(days=7)
    scheduled_start = timezone.make_aware(
        timezone.datetime(shift_date.year, shift_date.month, shift_date.day, 7, 0)
    )
    late = Shift.objects.create(
        staff_resource=my_resource,
        shift_date=shift_date,
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="COMPLETED",
        started_at=scheduled_start + timedelta(minutes=25),  # late (>15min)
        completed_at=scheduled_start + timedelta(hours=12),
        facility=sample_facility,
        organization=sample_facility.organization,
    )
    shifts.append(late)
    return shifts


# =============================================================================
# My Today Tests
# =============================================================================


class TestMyToday:
    """Tests for GET /api/scheduling/shifts/my-today/."""

    def test_no_resource_returns_no_shift(self, authenticated_client):
        """User with no linked resource gets NO_SHIFT."""
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["attendance_status"] == "NO_SHIFT"
        assert response.data["shifts"] == []

    def test_scheduled_shift_upcoming(self, authenticated_client, my_shift_today):
        """Shift not yet started returns UPCOMING or SHOULD_CLOCK_IN."""
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data["shifts"]) == 1
        assert response.data["attendance_status"] in ("UPCOMING", "SHOULD_CLOCK_IN")

    def test_active_shift_returns_clocked_in(self, authenticated_client, my_shift_today):
        """Active shift returns CLOCKED_IN status."""
        my_shift_today.start_shift()
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["attendance_status"] == "CLOCKED_IN"

    def test_completed_shift(self, authenticated_client, my_shift_today):
        """Completed shift returns COMPLETED status."""
        my_shift_today.start_shift()
        my_shift_today.complete_shift()
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["attendance_status"] == "COMPLETED"

    def test_off_day_excluded(self, authenticated_client, my_resource, sample_facility):
        """OFF/REST/LEAVE shifts should not appear in my-today."""
        from hmis.apps.scheduling.models import Shift

        Shift.objects.create(
            staff_resource=my_resource,
            shift_date=date.today(),
            start_time=time(0, 0),
            end_time=time(23, 59),
            shift_type="OFF",
            status="SCHEDULED",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["attendance_status"] == "NO_SHIFT"

    def test_unauthenticated_rejected(self, api_client):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Clock In / Clock Out Tests
# =============================================================================


class TestClockInOut:
    """Tests for POST /shifts/{id}/start/ and /shifts/{id}/complete/."""

    def test_clock_in(self, authenticated_client, my_shift_today):
        """POST start/ should clock in and set started_at."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/start/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"
        assert response.data["started_at"] is not None

    def test_clock_out(self, authenticated_client, my_shift_today):
        """POST complete/ should clock out and set completed_at."""
        my_shift_today.start_shift()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/complete/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"
        assert response.data["completed_at"] is not None

    def test_cannot_clock_out_before_clock_in(self, authenticated_client, my_shift_today):
        """Cannot complete a SCHEDULED shift (must be ACTIVE first)."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/complete/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_clock_in_twice(self, authenticated_client, my_shift_today):
        """Cannot start an already ACTIVE shift."""
        my_shift_today.start_shift()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/start/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


# =============================================================================
# Break / Resume Tests
# =============================================================================


class TestBreakResume:
    """Tests for POST /shifts/{id}/take-break/ and /shifts/{id}/resume/."""

    def test_take_break(self, authenticated_client, my_shift_today):
        """Should transition ACTIVE → ON_BREAK."""
        my_shift_today.start_shift()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/take-break/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ON_BREAK"
        assert response.data["break_started_at"] is not None

    def test_resume_from_break(self, authenticated_client, my_shift_today):
        """Should transition ON_BREAK → ACTIVE."""
        my_shift_today.start_shift()
        my_shift_today.take_break()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/resume/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "ACTIVE"
        assert response.data["break_started_at"] is None

    def test_cannot_break_without_clocking_in(self, authenticated_client, my_shift_today):
        """Cannot take break on a SCHEDULED shift."""
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/take-break/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_cannot_resume_active_shift(self, authenticated_client, my_shift_today):
        """Cannot resume a shift that is already ACTIVE."""
        my_shift_today.start_shift()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/resume/"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_on_break_shows_in_my_today(self, authenticated_client, my_shift_today):
        """ON_BREAK shift should return ON_BREAK attendance status."""
        my_shift_today.start_shift()
        my_shift_today.take_break()
        response = authenticated_client.get("/api/scheduling/shifts/my-today/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["attendance_status"] == "ON_BREAK"

    def test_complete_from_break(self, authenticated_client, my_shift_today):
        """Should be able to clock out directly from ON_BREAK."""
        my_shift_today.start_shift()
        my_shift_today.take_break()
        response = authenticated_client.post(
            f"/api/scheduling/shifts/{my_shift_today.id}/complete/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "COMPLETED"


# =============================================================================
# My History / Stats Tests
# =============================================================================


class TestMyHistory:
    """Tests for GET /api/scheduling/shifts/my-history/."""

    def test_no_resource_returns_empty(self, authenticated_client):
        """User with no linked resource gets empty history."""
        response = authenticated_client.get("/api/scheduling/shifts/my-history/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 0
        assert response.data["stats"]["total_shifts"] == 0

    def test_history_with_stats(self, authenticated_client, my_completed_shifts):
        """Should return shifts with correct attendance stats."""
        response = authenticated_client.get("/api/scheduling/shifts/my-history/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 6  # 5 on-time + 1 late
        stats = response.data["stats"]
        assert stats["total_shifts"] == 6
        assert stats["on_time_count"] == 5
        assert stats["late_count"] == 1
        assert stats["on_time_rate"] > 80  # 5/6 = 83.3%
        assert stats["total_hours"] > 0

    def test_history_date_filter(self, authenticated_client, my_completed_shifts):
        """Date range filters should work."""
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        today = date.today().isoformat()
        response = authenticated_client.get(
            f"/api/scheduling/shifts/my-history/?from_date={yesterday}&to_date={today}"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] == 1  # Only yesterday's shift

    def test_unauthenticated_rejected(self, api_client):
        """Unauthenticated requests should be rejected."""
        response = api_client.get("/api/scheduling/shifts/my-history/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Night Shift Validation
# =============================================================================


class TestNightShiftValidation:
    """Tests for overnight shift serializer acceptance."""

    def test_night_shift_accepted(self, authenticated_client, my_resource, sample_facility):
        """NIGHT shifts with end_time < start_time should be valid (crosses midnight)."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": my_resource.id,
                "shift_date": date.today().isoformat(),
                "start_time": "19:00",
                "end_time": "07:00",
                "shift_type": "NIGHT",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["shift_type"] == "NIGHT"

    def test_night_off_accepted(self, authenticated_client, my_resource, sample_facility):
        """NIGHT_OFF shifts with end_time < start_time should be valid."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": my_resource.id,
                "shift_date": date.today().isoformat(),
                "start_time": "19:00",
                "end_time": "07:00",
                "shift_type": "NIGHT_OFF",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_day_shift_rejects_bad_times(self, authenticated_client, my_resource, sample_facility):
        """DAY shift with end_time < start_time should be rejected."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/",
            {
                "staff_resource": my_resource.id,
                "shift_date": date.today().isoformat(),
                "start_time": "19:00",
                "end_time": "07:00",
                "shift_type": "DAY",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "end_time" in response.data

    def test_bulk_create_night_shifts(self, authenticated_client, my_resource, sample_facility):
        """Bulk-create should accept night shifts without errors."""
        payload = {
            "shifts": [
                {
                    "staff_resource": my_resource.id,
                    "shift_date": (date.today() + timedelta(days=1)).isoformat(),
                    "start_time": "19:00",
                    "end_time": "07:00",
                    "shift_type": "NIGHT",
                },
            ],
        }
        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-create/", payload, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["created"] == 1
        assert response.data["errors"] == 0


# =============================================================================
# Bulk Delete
# =============================================================================


class TestBulkDelete:
    """Tests for POST /api/scheduling/shifts/bulk-delete/."""

    def test_bulk_delete_scheduled_shifts(self, authenticated_client, my_resource, sample_facility):
        """Should delete SCHEDULED shifts in the given date range."""
        from hmis.apps.scheduling.models import Shift

        tomorrow = date.today() + timedelta(days=1)
        for i in range(3):
            Shift.objects.create(
                staff_resource=my_resource,
                shift_date=tomorrow + timedelta(days=i),
                start_time=time(7, 0),
                end_time=time(19, 0),
                shift_type="DAY",
                status="SCHEDULED",
                facility=sample_facility,
                organization=sample_facility.organization,
            )
        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-delete/",
            {
                "from_date": tomorrow.isoformat(),
                "to_date": (tomorrow + timedelta(days=2)).isoformat(),
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["deleted"] == 3

    def test_bulk_delete_preserves_active_shifts(self, authenticated_client, my_resource, sample_facility):
        """Should NOT delete ACTIVE shifts."""
        from hmis.apps.scheduling.models import Shift

        tomorrow = date.today() + timedelta(days=1)
        Shift.objects.create(
            staff_resource=my_resource,
            shift_date=tomorrow,
            start_time=time(7, 0),
            end_time=time(19, 0),
            shift_type="DAY",
            status="ACTIVE",
            facility=sample_facility,
            organization=sample_facility.organization,
        )
        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-delete/",
            {
                "from_date": tomorrow.isoformat(),
                "to_date": tomorrow.isoformat(),
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["deleted"] == 0

    def test_bulk_delete_requires_dates(self, authenticated_client):
        """Should reject if dates are missing."""
        response = authenticated_client.post(
            "/api/scheduling/shifts/bulk-delete/", {}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

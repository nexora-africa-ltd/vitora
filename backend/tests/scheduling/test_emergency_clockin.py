"""
Tests for Emergency Clock-In feature.

POST /api/scheduling/shifts/emergency-clock-in/
Creates an ad-hoc shift and immediately clocks in when no shift is scheduled.
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
        name="Dr. Emergency",
        resource_type="PERSON",
        code="DOC-EMRG-001",
        is_active=True,
        staff_profile=test_staff_profile,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def active_shift_today(db, my_resource, sample_facility):
    """Create an ACTIVE shift for today for the test user."""
    from hmis.apps.scheduling.models import Shift

    return Shift.objects.create(
        staff_resource=my_resource,
        shift_date=date.today(),
        start_time=time(7, 0),
        end_time=time(19, 0),
        shift_type="DAY",
        status="ACTIVE",
        started_at=timezone.now(),
        facility=sample_facility,
        organization=sample_facility.organization,
    )


# =============================================================================
# Tests
# =============================================================================

URL = "/api/scheduling/shifts/emergency-clock-in/"


class TestEmergencyClockIn:
    """Tests for the emergency clock-in endpoint."""

    def test_emergency_clockin_creates_shift_and_clocks_in(self, authenticated_client, my_resource):
        """Should create an ad-hoc shift, mark it ACTIVE, and flag is_emergency."""
        response = authenticated_client.post(
            URL,
            {"reason": "Called in for emergency surgery cover"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data
        assert data["status"] == "ACTIVE"
        assert data["is_emergency"] is True
        assert data["emergency_reason"] == "Called in for emergency surgery cover"
        assert data["started_at"] is not None
        assert data["shift_type"] == "DAY"  # default
        assert data["shift_date"] == str(date.today())

    def test_emergency_clockin_custom_shift_type(self, authenticated_client, my_resource):
        """Should respect custom shift_type."""
        response = authenticated_client.post(
            URL,
            {"reason": "Night emergency cover", "shift_type": "NIGHT"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["shift_type"] == "NIGHT"

    def test_emergency_clockin_custom_duration(self, authenticated_client, my_resource):
        """Should compute end_time based on duration_hours."""
        response = authenticated_client.post(
            URL,
            {"reason": "Short cover shift", "duration_hours": 4.0},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Verify the shift was created with start and end times
        assert response.data["start_time"] is not None
        assert response.data["end_time"] is not None

    def test_emergency_clockin_requires_reason(self, authenticated_client, my_resource):
        """Should reject request without a reason."""
        response = authenticated_client.post(URL, {}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "reason" in response.data

    def test_emergency_clockin_blocks_when_already_active(
        self, authenticated_client, my_resource, active_shift_today
    ):
        """Should return 409 if user already has an active shift today."""
        response = authenticated_client.post(
            URL,
            {"reason": "Trying again"},
            format="json",
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        assert response.data["code"] == "already_active"

    def test_emergency_clockin_requires_authentication(self, api_client):
        """Should reject unauthenticated requests."""
        response = api_client.post(
            URL,
            {"reason": "Should not work"},
            format="json",
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_emergency_clockin_no_resource_returns_error(
        self, authenticated_client, test_staff_profile, sample_facility
    ):
        """Should return 400 if user has no scheduling resource."""
        response = authenticated_client.post(
            URL,
            {"reason": "No resource"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["code"] == "no_resource"

    def test_emergency_clockin_creates_audit_log(self, authenticated_client, my_resource):
        """Should create an audit log entry for emergency clock-in."""
        from hmis.apps.core.models import AuditLog

        response = authenticated_client.post(
            URL,
            {"reason": "Audit test"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        log = AuditLog.objects.filter(action="emergency_clock_in").first()
        assert log is not None
        assert log.details["reason"] == "Audit test"
        assert log.resource_type == "Shift"

    def test_emergency_clockin_publishes_event(self, authenticated_client, my_resource, mocker):
        """Should publish SHIFT_EMERGENCY_CREATED event."""
        from hmis.apps.core.events.types import SchedulingEvents

        mock_publish = mocker.patch("hmis.apps.scheduling.signals.publish_event")

        response = authenticated_client.post(
            URL,
            {"reason": "Event test"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # Check that SHIFT_EMERGENCY_CREATED was published (first call is create, second is start)
        event_types = [
            call.kwargs.get("event_type") or call.args[0] for call in mock_publish.call_args_list
        ]
        assert SchedulingEvents.SHIFT_EMERGENCY_CREATED in event_types

    def test_emergency_clockin_session_auto_opened(self, authenticated_client, my_resource):
        """Response should include session_auto_opened flag."""
        response = authenticated_client.post(
            URL,
            {"reason": "Session test"},
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        # session_auto_opened should be present in the response
        assert "session_auto_opened" in response.data

"""
TDD Tests for Scheduling WebSocket Consumer.

Tests for real-time scheduling updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/scheduling/{facility_id}/appointments/

Events broadcasted:
- scheduling.appointment_created: New appointment booked
- scheduling.appointment_confirmed: Appointment confirmed
- scheduling.appointment_checked_in: Patient checked in
- scheduling.appointment_started: Consultation started
- scheduling.appointment_completed: Appointment completed
- scheduling.appointment_cancelled: Appointment cancelled
- scheduling.appointment_no_show: Patient marked as no-show
- scheduling.schedule_updated: Schedule/availability changed
- scheduling.assignment_decided: Auto-assignment decision made
- scheduling.stats_updated: Scheduling statistics updated
"""

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator

from hmis.apps.core.models import County, Facility, Organization, SubCounty

# =============================================================================
# ASYNC HELPER FUNCTIONS
# =============================================================================


@database_sync_to_async
def create_test_organization():
    """Create a test organization (async-safe)."""
    org, _ = Organization.objects.get_or_create(
        name="Scheduling Test Org",
        defaults={"slug": "scheduling-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    facility, _ = Facility.objects.get_or_create(
        name="Scheduling Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "SCHED-001",
            "level": "3",
            "county": county,
            "sub_county": sub_county,
            "is_active": True,
        },
    )
    return facility


# =============================================================================
# CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSchedulingConsumerConnection:
    """Test WebSocket connection handling for scheduling."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility scheduling endpoint."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/scheduling/99999/appointments/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific scheduling channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"scheduling_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "scheduling_update",
                "event": "test_event",
                "data": {"test": "data"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "test_event"
        assert response["data"] == {"test": "data"}

        await communicator.disconnect()

    async def test_disconnect_leaves_group(self):
        """Should leave channel group on disconnect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Should not raise an error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"scheduling_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "scheduling_update",
                "event": "test_event",
                "data": {},
            },
        )

    async def test_ping_pong(self):
        """Should respond to ping with pong."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_json_to({"type": "ping", "timestamp": 1234567890})
        response = await communicator.receive_json_from()
        assert response["type"] == "pong"
        assert response["timestamp"] == 1234567890

        await communicator.disconnect()

    async def test_invalid_json_returns_error(self):
        """Should handle invalid JSON gracefully."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# SCHEDULING EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSchedulingEventBroadcasts:
    """Test that scheduling events are properly broadcasted."""

    async def test_appointment_created_event(self):
        """Should broadcast event when appointment is created."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_created",
                "event": "scheduling.appointment.created",
                "data": {
                    "id": 1,
                    "patient_name": "Jane Doe",
                    "appointment_date": "2026-07-15",
                    "status": "SCHEDULED",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.created"
        assert response["data"]["patient_name"] == "Jane Doe"
        assert response["data"]["status"] == "SCHEDULED"

        await communicator.disconnect()

    async def test_appointment_confirmed_event(self):
        """Should broadcast event when appointment is confirmed."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_confirmed",
                "event": "scheduling.appointment.confirmed",
                "data": {"id": 1, "status": "CONFIRMED"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.confirmed"
        assert response["data"]["status"] == "CONFIRMED"

        await communicator.disconnect()

    async def test_appointment_checked_in_event(self):
        """Should broadcast event when patient checks in."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_checked_in",
                "event": "scheduling.appointment.checked_in",
                "data": {"id": 1, "status": "CHECKED_IN"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.checked_in"

        await communicator.disconnect()

    async def test_appointment_started_event(self):
        """Should broadcast event when appointment consultation starts."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_started",
                "event": "scheduling.appointment.started",
                "data": {"id": 1, "status": "IN_PROGRESS"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.started"

        await communicator.disconnect()

    async def test_appointment_completed_event(self):
        """Should broadcast event when appointment is completed."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_completed",
                "event": "scheduling.appointment.completed",
                "data": {"id": 1, "status": "COMPLETED"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.completed"
        assert response["data"]["status"] == "COMPLETED"

        await communicator.disconnect()

    async def test_appointment_cancelled_event(self):
        """Should broadcast event when appointment is cancelled."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_cancelled",
                "event": "scheduling.appointment.cancelled",
                "data": {"id": 1, "reason": "Patient requested"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.cancelled"
        assert response["data"]["reason"] == "Patient requested"

        await communicator.disconnect()

    async def test_appointment_no_show_event(self):
        """Should broadcast event when patient is marked as no-show."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_appointment_no_show",
                "event": "scheduling.appointment.no_show",
                "data": {"id": 1, "status": "NO_SHOW"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.appointment.no_show"

        await communicator.disconnect()

    async def test_schedule_updated_event(self):
        """Should broadcast event when schedule availability changes."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_schedule_updated",
                "event": "scheduling.schedule.updated",
                "data": {"schedule_id": 5, "available_slots": 10},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.schedule.updated"
        assert response["data"]["available_slots"] == 10

        await communicator.disconnect()

    async def test_assignment_decided_event(self):
        """Should broadcast event when auto-assignment decision is made."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_assignment_decided",
                "event": "scheduling.assignment.decided",
                "data": {
                    "appointment_id": 1,
                    "assigned_to": "Dr. Smith",
                    "strategy": "round_robin",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.assignment.decided"
        assert response["data"]["assigned_to"] == "Dr. Smith"

        await communicator.disconnect()

    async def test_stats_updated_event(self):
        """Should broadcast event when scheduling stats are updated."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/scheduling/{facility.id}/appointments/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"scheduling_{facility.id}",
            {
                "type": "scheduling_stats_updated",
                "event": "scheduling.stats.updated",
                "data": {
                    "total_today": 25,
                    "completed": 10,
                    "pending": 15,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "scheduling.stats.updated"
        assert response["data"]["total_today"] == 25

        await communicator.disconnect()

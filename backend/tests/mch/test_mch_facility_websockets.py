"""
TDD Tests for MCH Facility WebSocket Consumer.

Tests for real-time MCH facility-level updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/mch/facility/{facility_id}/

Events broadcasted:
- mch.registration_created: New MCH registration
- mch.delivery_completed: Delivery completed
- mch.anc_visit_created: ANC visit created
- mch.baby_patient_created: Baby patient record created
- mch.stats_updated: MCH statistics updated
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
        name="MCH Facility Test Org",
        defaults={"slug": "mch-facility-test-org", "is_active": True, "is_verified": True},
    )
    return org


@database_sync_to_async
def create_test_facility(organization):
    """Create a test facility (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(
        name="Westlands", defaults={"county": county}
    )
    facility, _ = Facility.objects.get_or_create(
        name="MCH Facility Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "MCHF-001",
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
class TestMCHFacilityConsumerConnection:
    """Test WebSocket connection handling for MCH facility consumer."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility MCH endpoint."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, "/ws/mch/facility/99999/"
        )
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific MCH channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        group_name = f"mch_facility_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "mch_update",
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
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        channel_layer = get_channel_layer()
        group_name = f"mch_facility_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "mch_update",
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
            application, f"/ws/mch/facility/{facility.id}/"
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
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# MCH FACILITY EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestMCHFacilityEventBroadcasts:
    """Test that MCH facility events are properly broadcasted."""

    async def test_registration_created_event(self):
        """Should broadcast event when new MCH registration is created."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"mch_facility_{facility.id}",
            {
                "type": "mch_registration_created",
                "event": "mch.registration.created",
                "data": {
                    "id": 1,
                    "patient_name": "Mary Wanjiku",
                    "gravida": 2,
                    "parity": 1,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "mch.registration.created"
        assert response["data"]["patient_name"] == "Mary Wanjiku"

        await communicator.disconnect()

    async def test_delivery_completed_event(self):
        """Should broadcast event when delivery is completed."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"mch_facility_{facility.id}",
            {
                "type": "mch_delivery_completed",
                "event": "mch.delivery.completed",
                "data": {
                    "id": 1,
                    "mother_name": "Mary Wanjiku",
                    "delivery_mode": "SVD",
                    "outcome": "LIVE_BIRTH",
                    "baby_weight": 3.2,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "mch.delivery.completed"
        assert response["data"]["delivery_mode"] == "SVD"
        assert response["data"]["baby_weight"] == 3.2

        await communicator.disconnect()

    async def test_anc_visit_created_event(self):
        """Should broadcast event when ANC visit is created."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"mch_facility_{facility.id}",
            {
                "type": "mch_anc_visit_created",
                "event": "mch.anc_visit.created",
                "data": {
                    "id": 1,
                    "visit_number": 3,
                    "gestational_age_weeks": 28,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "mch.anc_visit.created"
        assert response["data"]["visit_number"] == 3

        await communicator.disconnect()

    async def test_baby_patient_created_event(self):
        """Should broadcast event when baby patient record is created."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"mch_facility_{facility.id}",
            {
                "type": "mch_baby_patient_created",
                "event": "mch.baby_patient.created",
                "data": {
                    "id": 1,
                    "mother_id": 10,
                    "birth_weight": 3.5,
                    "gender": "F",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "mch.baby_patient.created"
        assert response["data"]["birth_weight"] == 3.5

        await communicator.disconnect()

    async def test_stats_updated_event(self):
        """Should broadcast event when MCH stats are updated."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/mch/facility/{facility.id}/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"mch_facility_{facility.id}",
            {
                "type": "mch_stats_updated",
                "event": "mch.stats.updated",
                "data": {
                    "active_registrations": 45,
                    "deliveries_today": 3,
                    "anc_visits_today": 12,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "mch.stats.updated"
        assert response["data"]["deliveries_today"] == 3

        await communicator.disconnect()

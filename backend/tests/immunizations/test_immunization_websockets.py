"""
TDD Tests for Immunization WebSocket Consumer.

Tests for real-time immunization updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/immunizations/{facility_id}/records/

Events broadcasted:
- immunization.record_administered: Vaccine dose administered
- immunization.aefi_reported: AEFI (adverse event following immunization) reported
- immunization.schedule_generated: Immunization schedule generated
- immunization.stats_updated: Immunization statistics updated
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
        name="Immunization Test Org",
        defaults={"slug": "immunization-test-org", "is_active": True, "is_verified": True},
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
        name="Immunization Test Hospital",
        defaults={
            "organization": organization,
            "mfl_code": "IMM-001",
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
class TestImmunizationConsumerConnection:
    """Test WebSocket connection handling for immunizations."""

    async def test_connect_to_valid_facility_succeeds(self):
        """Should accept connection to valid facility immunization endpoint."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_facility_fails(self):
        """Should reject connection to non-existent facility."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, "/ws/immunizations/99999/records/"
        )
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_facility_group(self):
        """Should join the facility-specific immunization channel group on connect."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        group_name = f"immunization_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "immunization_update",
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
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        channel_layer = get_channel_layer()
        group_name = f"immunization_{facility.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "immunization_update",
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
            application, f"/ws/immunizations/{facility.id}/records/"
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
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.send_to(text_data="not valid json{{{")
        response = await communicator.receive_json_from()
        assert "error" in response

        await communicator.disconnect()


# =============================================================================
# IMMUNIZATION EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestImmunizationEventBroadcasts:
    """Test that immunization events are properly broadcasted."""

    async def test_record_administered_event(self):
        """Should broadcast event when vaccine is administered."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"immunization_{facility.id}",
            {
                "type": "immunization_record_administered",
                "event": "immunization.record.administered",
                "data": {
                    "id": 1,
                    "patient_name": "Baby Doe",
                    "vaccine": "BCG",
                    "dose_number": 1,
                    "administered_by": "Nurse Wanjiku",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "immunization.record.administered"
        assert response["data"]["vaccine"] == "BCG"
        assert response["data"]["dose_number"] == 1

        await communicator.disconnect()

    async def test_aefi_reported_event(self):
        """Should broadcast event when AEFI is reported."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"immunization_{facility.id}",
            {
                "type": "immunization_aefi_reported",
                "event": "immunization.aefi.reported",
                "data": {
                    "id": 1,
                    "patient_name": "Baby Doe",
                    "vaccine": "DPT",
                    "severity": "MILD",
                    "reaction": "Injection site swelling",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "immunization.aefi.reported"
        assert response["data"]["severity"] == "MILD"

        await communicator.disconnect()

    async def test_schedule_generated_event(self):
        """Should broadcast event when immunization schedule is generated."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"immunization_{facility.id}",
            {
                "type": "immunization_schedule_generated",
                "event": "immunization.schedule.generated",
                "data": {
                    "patient_id": 1,
                    "schedule_count": 12,
                    "next_due": "2026-08-15",
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "immunization.schedule.generated"
        assert response["data"]["schedule_count"] == 12

        await communicator.disconnect()

    async def test_stats_updated_event(self):
        """Should broadcast event when immunization stats are updated."""
        from hmis.asgi import application

        org = await create_test_organization()
        facility = await create_test_facility(org)

        communicator = WebsocketCommunicator(
            application, f"/ws/immunizations/{facility.id}/records/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            f"immunization_{facility.id}",
            {
                "type": "immunization_stats_updated",
                "event": "immunization.stats.updated",
                "data": {
                    "administered_today": 30,
                    "aefi_count": 2,
                    "coverage_rate": 87.5,
                },
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "immunization.stats.updated"
        assert response["data"]["administered_today"] == 30

        await communicator.disconnect()

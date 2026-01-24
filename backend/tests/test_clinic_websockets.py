"""
TDD Tests for Clinic Queue WebSocket Integration.

Tests for real-time queue updates via WebSocket connections.
WebSocket endpoint: ws://localhost/ws/clinics/{clinic_id}/queue/

Events broadcasted:
- queue.patient_added: New patient added to queue
- queue.patient_called: Patient called
- queue.consultation_started: Consultation started
- queue.visit_completed: Visit completed
- queue.patient_removed: Patient removed from queue
- queue.stats_updated: Queue statistics updated
"""

import pytest # type: ignore
from datetime import date
from unittest.mock import patch, MagicMock, AsyncMock
from channels.testing import WebsocketCommunicator
from channels.layers import get_channel_layer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from asgiref.sync import sync_to_async

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.patients.models import Patient
from hmis.apps.core.models import County, SubCounty

User = get_user_model()


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def sample_county(db):
    """Create a sample county."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    return county


@pytest.fixture
def sample_sub_county(db, sample_county):
    """Create a sample sub-county."""
    sub_county, _ = SubCounty.objects.get_or_create(
        name="Westlands", defaults={"county": sample_county}
    )
    return sub_county


@pytest.fixture
def sample_patient(db, sample_county, sample_sub_county):
    """Create a sample patient."""
    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth="1990-01-15",
        gender="M",
        county=sample_county,
        sub_county=sample_sub_county,
    )


@pytest.fixture
def sample_clinic(db):
    """Create a sample clinic."""
    return Clinic.objects.create(
        name="General OPD",
        code="GEN-OPD-001",
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
        location="Ground Floor",
    )


@pytest.fixture
def sample_session(db, sample_clinic):
    """Create today's clinic session."""
    session, _ = ClinicSession.objects.get_or_create(
        clinic=sample_clinic,
        session_date=date.today(),
        defaults={"status": "OPEN"},
    )
    return session


@pytest.fixture
def sample_visit(db, sample_session, sample_patient):
    """Create a sample clinic visit."""
    return ClinicVisit.objects.create(
        session=sample_session,
        patient=sample_patient,
        status="WAITING",
        chief_complaint="Test complaint",
    )


@pytest.fixture
def test_user(db):
    """Create a test user."""
    return User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="testpass123",
    )


# =============================================================================
# CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestClinicQueueConsumerConnection:
    """Test WebSocket connection handling."""

    async def test_connect_to_valid_clinic_succeeds(self, sample_clinic):
        """Should accept connection to valid clinic queue."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_clinic_fails(self):
        """Should reject connection to non-existent clinic."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, "/ws/clinics/99999/queue/"
        )
        connected, _ = await communicator.connect()

        # Should disconnect immediately or reject
        assert connected is False

    async def test_connect_joins_clinic_group(self, sample_clinic):
        """Should join the clinic-specific channel group on connect."""
        from hmis.asgi import application
        from hmis.apps.clinics.consumers import ClinicQueueConsumer

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"clinic_queue_{sample_clinic.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "queue.update",
                "event": "test_event",
                "data": {"test": "data"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "test_event"
        assert response["data"] == {"test": "data"}

        await communicator.disconnect()

    async def test_disconnect_leaves_group(self, sample_clinic):
        """Should leave channel group on disconnect."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Verify no error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"clinic_queue_{sample_clinic.id}"

        # This should not raise an error
        await channel_layer.group_send(
            group_name,
            {
                "type": "queue.update",
                "event": "test_event",
                "data": {},
            },
        )


# =============================================================================
# QUEUE EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestQueueEventBroadcasts:
    """Test that queue events are properly broadcasted."""

    async def test_patient_added_event_broadcasted(
        self, sample_clinic, sample_session, sample_patient
    ):
        """Should broadcast event when patient is added to queue."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Broadcast a patient added event
        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="patient_added",
            data={
                "visit_id": 1,
                "patient_name": "Test Patient",
                "queue_number": "Q001",
                "priority": "STANDARD",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "patient_added"
        assert response["data"]["patient_name"] == "Test Patient"
        assert response["data"]["queue_number"] == "Q001"

        await communicator.disconnect()

    async def test_patient_called_event_broadcasted(self, sample_clinic, sample_visit):
        """Should broadcast event when patient is called."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="patient_called",
            data={
                "visit_id": sample_visit.id,
                "patient_name": sample_visit.patient.full_name,
                "queue_number": sample_visit.queue_number,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "patient_called"
        assert response["data"]["visit_id"] == sample_visit.id

        await communicator.disconnect()

    async def test_consultation_started_event_broadcasted(
        self, sample_clinic, sample_visit
    ):
        """Should broadcast event when consultation starts."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="consultation_started",
            data={
                "visit_id": sample_visit.id,
                "patient_name": sample_visit.patient.full_name,
                "encounter_id": 123,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "consultation_started"
        assert response["data"]["encounter_id"] == 123

        await communicator.disconnect()

    async def test_visit_completed_event_broadcasted(self, sample_clinic, sample_visit):
        """Should broadcast event when visit is completed."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="visit_completed",
            data={
                "visit_id": sample_visit.id,
                "patient_name": sample_visit.patient.full_name,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "visit_completed"

        await communicator.disconnect()

    async def test_stats_updated_event_broadcasted(self, sample_clinic):
        """Should broadcast queue stats update event."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="stats_updated",
            data={
                "waiting_count": 5,
                "in_consultation_count": 2,
                "completed_count": 10,
                "avg_wait_minutes": 15,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "stats_updated"
        assert response["data"]["waiting_count"] == 5
        assert response["data"]["in_consultation_count"] == 2

        await communicator.disconnect()


# =============================================================================
# MULTIPLE CLIENTS TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestMultipleClients:
    """Test multiple WebSocket clients receiving broadcasts."""

    async def test_multiple_clients_receive_broadcasts(self, sample_clinic):
        """All connected clients should receive broadcasted events."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        # Connect multiple clients
        communicator1 = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        communicator2 = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )

        connected1, _ = await communicator1.connect()
        connected2, _ = await communicator2.connect()

        assert connected1 is True
        assert connected2 is True

        # Broadcast event
        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="patient_added",
            data={"test": "data"},
        )

        # Both clients should receive
        response1 = await communicator1.receive_json_from()
        response2 = await communicator2.receive_json_from()

        assert response1["event"] == "patient_added"
        assert response2["event"] == "patient_added"

        await communicator1.disconnect()
        await communicator2.disconnect()

    async def test_different_clinics_isolated(self, sample_clinic, db):
        """Clients connected to different clinics should not receive each other's events."""
        from hmis.asgi import application
        from hmis.apps.clinics.websockets import broadcast_queue_event

        # Create another clinic
        other_clinic = await database_sync_to_async(Clinic.objects.create)(
            name="Other Clinic",
            code="OTHER-001",
            clinic_type="EYE",
            status="ACTIVE",
        )

        communicator1 = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        communicator2 = WebsocketCommunicator(
            application, f"/ws/clinics/{other_clinic.id}/queue/"
        )

        await communicator1.connect()
        await communicator2.connect()

        # Broadcast to clinic1 only
        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="patient_added",
            data={"clinic": "clinic1"},
        )

        # Client 1 should receive
        response1 = await communicator1.receive_json_from()
        assert response1["event"] == "patient_added"

        # Client 2 should not receive (timeout expected)
        with pytest.raises(TimeoutError):
            await communicator2.receive_json_from(timeout=0.5)

        await communicator1.disconnect()
        await communicator2.disconnect()


# =============================================================================
# MODEL SIGNAL INTEGRATION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestModelSignalBroadcasts:
    """Test that model changes trigger WebSocket broadcasts."""

    async def test_clinic_visit_create_triggers_broadcast(
        self, sample_session, sample_patient
    ):
        """Creating a ClinicVisit should broadcast patient_added event."""
        from hmis.asgi import application

        clinic = sample_session.clinic

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Create visit in database (triggers signal)
        @database_sync_to_async
        def create_visit():
            return ClinicVisit.objects.create(
                session=sample_session,
                patient=sample_patient,
                status="WAITING",
                chief_complaint="New complaint",
            )

        visit = await create_visit()

        try:
            response = await communicator.receive_json_from(timeout=2)
            assert response["event"] == "patient_added"
            assert response["data"]["visit_id"] == visit.id
        except TimeoutError:
            pytest.fail("Expected patient_added event was not received")

        await communicator.disconnect()

    async def test_clinic_visit_status_change_triggers_broadcast(
        self, sample_session, sample_visit
    ):
        """Changing visit status should broadcast appropriate event."""
        from hmis.asgi import application

        clinic = sample_session.clinic

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Update visit status to CALLED
        @database_sync_to_async
        def call_patient():
            sample_visit.status = "CALLED"
            sample_visit.save()
            return sample_visit

        await call_patient()

        try:
            response = await communicator.receive_json_from(timeout=2)
            assert response["event"] == "patient_called"
        except TimeoutError:
            pytest.fail("Expected patient_called event was not received")

        await communicator.disconnect()


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestErrorHandling:
    """Test error handling in WebSocket consumer."""

    async def test_invalid_message_format_handled(self, sample_clinic):
        """Should handle invalid message formats gracefully."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(
            application, f"/ws/clinics/{sample_clinic.id}/queue/"
        )
        connected, _ = await communicator.connect()
        assert connected is True

        # Send invalid message
        await communicator.send_to(text_data="not json")

        # Should receive error response or be disconnected gracefully
        try:
            response = await communicator.receive_json_from(timeout=1)
            assert response.get("error") is not None
        except TimeoutError:
            # Acceptable - no response to invalid message
            pass

        await communicator.disconnect()

    async def test_broadcast_to_empty_group_no_error(self, sample_clinic):
        """Broadcasting to clinic with no connections should not raise errors."""
        from hmis.apps.clinics.websockets import broadcast_queue_event

        # Should not raise any exception
        await broadcast_queue_event(
            clinic_id=sample_clinic.id,
            event_type="test_event",
            data={"test": "data"},
        )

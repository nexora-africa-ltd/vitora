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

from datetime import date

import pytest
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model

from hmis.apps.clinics.models import Clinic, ClinicSession, ClinicVisit
from hmis.apps.core.models import County, SubCounty
from hmis.apps.patients.models import Patient

User = get_user_model()


# =============================================================================
# ASYNC HELPER FUNCTIONS
# =============================================================================


@database_sync_to_async
def create_test_clinic(name="Test OPD", code="TEST-OPD-001"):
    """Create a test clinic (async-safe)."""
    return Clinic.objects.create(
        name=name,
        code=code,
        clinic_type="GENERAL_OPD",
        status="ACTIVE",
        location="Test Location",
    )


@database_sync_to_async
def create_test_patient():
    """Create a test patient (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    return Patient.objects.create(
        first_name="Test",
        last_name="Patient",
        date_of_birth="1990-01-15",
        gender="M",
        county=county,
        sub_county=sub_county,
    )


@database_sync_to_async
def create_test_session(clinic):
    """Create a test clinic session (async-safe)."""
    session, _ = ClinicSession.objects.get_or_create(
        clinic=clinic,
        session_date=date.today(),
        defaults={"status": "OPEN"},
    )
    return session


@database_sync_to_async
def create_test_visit(session, patient, chief_complaint="Test complaint"):
    """Create a test clinic visit (async-safe)."""
    return ClinicVisit.objects.create(
        session=session,
        patient=patient,
        status="WAITING",
        chief_complaint=chief_complaint,
    )


@database_sync_to_async
def update_visit_status(visit_id, new_status):
    """Update a visit's status (async-safe)."""
    visit = ClinicVisit.objects.get(id=visit_id)
    visit.status = new_status
    visit.save()
    return visit


# =============================================================================
# FIXTURES (Sync - for non-async tests)
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

    async def test_connect_to_valid_clinic_succeeds(self):
        """Should accept connection to valid clinic queue."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Valid OPD", code="VALID-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_clinic_fails(self):
        """Should reject connection to non-existent clinic."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/clinics/99999/queue/")
        connected, _ = await communicator.connect()

        # Should disconnect immediately or reject
        assert connected is False

    async def test_connect_joins_clinic_group(self):
        """Should join the clinic-specific channel group on connect."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Group Test OPD", code="GROUP-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"clinic_queue_{clinic.id}"

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

    async def test_disconnect_leaves_group(self):
        """Should leave channel group on disconnect."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Disconnect Test OPD", code="DISC-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Verify no error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"clinic_queue_{clinic.id}"

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

    async def test_patient_added_event_broadcasted(self):
        """Should broadcast event when patient is added to queue."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Broadcast OPD", code="BCAST-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Broadcast a patient added event
        await broadcast_queue_event(
            clinic_id=clinic.id,
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

    async def test_patient_called_event_broadcasted(self):
        """Should broadcast event when patient is called."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Called OPD", code="CALL-001")
        session = await create_test_session(clinic)
        patient = await create_test_patient()
        visit = await create_test_visit(session, patient)

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=clinic.id,
            event_type="patient_called",
            data={
                "visit_id": visit.id,
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "queue_number": visit.queue_number,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "patient_called"
        assert response["data"]["visit_id"] == visit.id

        await communicator.disconnect()

    async def test_consultation_started_event_broadcasted(self):
        """Should broadcast event when consultation starts."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Consult OPD", code="CONS-001")
        session = await create_test_session(clinic)
        patient = await create_test_patient()
        visit = await create_test_visit(session, patient)

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=clinic.id,
            event_type="consultation_started",
            data={
                "visit_id": visit.id,
                "patient_name": f"{patient.first_name} {patient.last_name}",
                "encounter_id": 123,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "consultation_started"
        assert response["data"]["encounter_id"] == 123

        await communicator.disconnect()

    async def test_visit_completed_event_broadcasted(self):
        """Should broadcast event when visit is completed."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Complete OPD", code="COMP-001")
        session = await create_test_session(clinic)
        patient = await create_test_patient()
        visit = await create_test_visit(session, patient)

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=clinic.id,
            event_type="visit_completed",
            data={
                "visit_id": visit.id,
                "patient_name": f"{patient.first_name} {patient.last_name}",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "visit_completed"

        await communicator.disconnect()

    async def test_stats_updated_event_broadcasted(self):
        """Should broadcast queue stats update event."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Stats OPD", code="STAT-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_queue_event(
            clinic_id=clinic.id,
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

    async def test_multiple_clients_receive_broadcasts(self):
        """All connected clients should receive broadcasted events."""
        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Multi OPD", code="MULTI-001")

        # Connect multiple clients
        communicator1 = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        communicator2 = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")

        connected1, _ = await communicator1.connect()
        connected2, _ = await communicator2.connect()

        assert connected1 is True
        assert connected2 is True

        # Broadcast event
        await broadcast_queue_event(
            clinic_id=clinic.id,
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

    async def test_different_clinics_isolated(self):
        """Clients connected to different clinics should not receive each other's events."""
        import asyncio

        from hmis.apps.clinics.websockets import broadcast_queue_event
        from hmis.asgi import application

        clinic1 = await create_test_clinic(name="Clinic One", code="ISO-001")
        clinic2 = await create_test_clinic(name="Clinic Two", code="ISO-002")

        communicator1 = WebsocketCommunicator(application, f"/ws/clinics/{clinic1.id}/queue/")
        communicator2 = WebsocketCommunicator(application, f"/ws/clinics/{clinic2.id}/queue/")

        await communicator1.connect()
        await communicator2.connect()

        # Broadcast to clinic1 only
        await broadcast_queue_event(
            clinic_id=clinic1.id,
            event_type="patient_added",
            data={"clinic": "clinic1"},
        )

        # Client 1 should receive
        response1 = await communicator1.receive_json_from()
        assert response1["event"] == "patient_added"

        # Client 2 should not receive (timeout expected)
        try:
            await communicator2.receive_json_from(timeout=0.5)
            pytest.fail("Client 2 should not have received a message")
        except TimeoutError:
            pass  # Expected - client 2 didn't receive the message

        await communicator1.disconnect()
        # Clean up communicator2 - it may be in a cancelled state from the timeout
        try:
            await communicator2.disconnect()
        except asyncio.CancelledError:
            pass  # Ignore cancelled error during cleanup


# =============================================================================
# MODEL SIGNAL INTEGRATION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestModelSignalBroadcasts:
    """Test that model changes trigger WebSocket broadcasts."""

    async def test_clinic_visit_create_triggers_broadcast(self):
        """Creating a ClinicVisit should broadcast patient_added event."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Signal OPD", code="SIG-001")
        session = await create_test_session(clinic)
        patient = await create_test_patient()

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Create visit in database (triggers signal)
        visit = await create_test_visit(session, patient, chief_complaint="Signal test")

        try:
            response = await communicator.receive_json_from(timeout=2)
            assert response["event"] == "patient_added"
            assert response["data"]["visit_id"] == visit.id
        except TimeoutError:
            pytest.fail("Expected patient_added event was not received")

        await communicator.disconnect()

    async def test_clinic_visit_status_change_triggers_broadcast(self):
        """Changing visit status should broadcast appropriate event."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Status OPD", code="STATUS-001")
        session = await create_test_session(clinic)
        patient = await create_test_patient()
        visit = await create_test_visit(session, patient)

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Update visit status to CALLED
        await update_visit_status(visit.id, "CALLED")

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

    async def test_invalid_message_format_handled(self):
        """Should handle invalid message formats gracefully."""
        from hmis.asgi import application

        clinic = await create_test_clinic(name="Error OPD", code="ERR-001")

        communicator = WebsocketCommunicator(application, f"/ws/clinics/{clinic.id}/queue/")
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

    async def test_broadcast_to_empty_group_no_error(self):
        """Broadcasting to clinic with no connections should not raise errors."""
        from hmis.apps.clinics.websockets import broadcast_queue_event

        clinic = await create_test_clinic(name="Empty OPD", code="EMPTY-001")

        # Should not raise any exception
        await broadcast_queue_event(
            clinic_id=clinic.id,
            event_type="test_event",
            data={"test": "data"},
        )

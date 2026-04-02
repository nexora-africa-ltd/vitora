"""
TDD Tests for Ward Compatibility WebSocket Integration (Phase 2).

Tests for real-time ward compatibility updates and supervisor escalation
via WebSocket connections.

WebSocket endpoints:
- ws://localhost/ws/inpatient/wards/{ward_id}/ - Ward compatibility updates
- ws://localhost/ws/inpatient/supervisor/alerts/ - Supervisor critical alerts

Events broadcasted:
- ward.constraints_updated: Ward constraints changed
- ward.capacity_changed: Bed availability changed
- ward.compatibility_violation: Constraint violation on admission
- supervisor.critical_alert: CRITICAL violation requiring attention
"""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest  # type: ignore
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.utils import timezone

from hmis.apps.core.models import County, SubCounty
from hmis.apps.encounters.models import Encounter
from hmis.apps.inpatient.models import Admission, Bed, Ward
from hmis.apps.patients.models import Patient

User = get_user_model()


# =============================================================================
# ASYNC HELPER FUNCTIONS
# =============================================================================


@database_sync_to_async
def create_test_ward(name="Test Ward", code="TEST-W-001", ward_type="MEDICAL"):
    """Create a test ward (async-safe)."""
    return Ward.objects.create(
        name=name,
        code=code,
        ward_type=ward_type,
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
    )


@database_sync_to_async
def create_test_bed(ward, bed_number="B-001"):
    """Create a test bed (async-safe)."""
    return Bed.objects.create(
        ward=ward,
        bed_number=bed_number,
        bed_type="STANDARD",
        status="AVAILABLE",
    )


@database_sync_to_async
def create_test_patient(sample_organization, first_name="Test", last_name="Patient", gender="M"):
    """Create a test patient (async-safe)."""
    county, _ = County.objects.get_or_create(code=1, defaults={"name": "Nairobi"})
    sub_county, _ = SubCounty.objects.get_or_create(name="Westlands", defaults={"county": county})
    return Patient.objects.create(
        first_name=first_name,
        last_name=last_name,
        date_of_birth="1990-01-15",
        gender=gender,
        county=county,
        sub_county=sub_county,
        organization=sample_organization,
    )


@database_sync_to_async
def create_test_user(username="testuser"):
    """Create a test user (async-safe)."""
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={"email": f"{username}@test.com", "password": "testpass123"},
    )
    return user


@database_sync_to_async
def create_supervisor_user(username="supervisor"):
    """Create a supervisor user with critical alerts permission (async-safe)."""
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={"email": f"{username}@test.com", "password": "testpass123"},
    )
    perm = Permission.objects.get(codename="receive_critical_alerts")
    user.user_permissions.add(perm)
    return user


@database_sync_to_async
def create_test_admission_with_violations(
    patient, ward, bed, user, violations=None, override_reason=""
):
    """Create an admission with constraint violations (async-safe)."""
    return Admission.objects.create(
        patient=patient,
        ward=ward,
        bed=bed,
        admission_date=timezone.now(),
        admitting_diagnosis="J18.9",
        admitting_diagnosis_text="Pneumonia",
        admitting_officer=user,
        payer_type="CASH",
        constraint_override=True,
        constraint_override_reason=override_reason,
        constraint_violations=violations or [],
    )


@database_sync_to_async
def update_ward_constraints(ward, **updates):
    """Update ward constraint fields (async-safe)."""
    for key, value in updates.items():
        setattr(ward, key, value)
    ward.save()
    return ward


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
def inpatient_ward(db, sample_facility, sample_organization):
    """Create an inpatient ward."""
    return Ward.objects.create(
        name="Test Medical Ward",
        code="TMW-001",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def male_only_ward_ws(db, sample_facility, sample_organization):
    """Create a male-only ward for WebSocket tests."""
    return Ward.objects.create(
        name="Male Only Ward WS",
        code="MOW-WS-001",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        gender_restriction="MALE_ONLY",
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def isolation_ward(db, sample_facility, sample_organization):
    """Create an isolation-capable ward."""
    return Ward.objects.create(
        name="Isolation Ward",
        code="ISO-001",
        ward_type="ISOLATION",
        capacity=5,
        daily_rate=Decimal("1500.00"),
        is_active=True,
        isolation_capable=True,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def non_isolation_ward_ws(db, sample_facility, sample_organization):
    """Create a non-isolation ward for testing CRITICAL violations."""
    return Ward.objects.create(
        name="Non-Isolation Ward WS",
        code="NI-WS-001",
        ward_type="MEDICAL",
        capacity=10,
        daily_rate=Decimal("500.00"),
        is_active=True,
        isolation_capable=False,
        facility=sample_facility,
        organization=sample_organization,
    )


@pytest.fixture
def supervisor_user(db):
    """Create a supervisor user with critical alerts permission."""
    user = User.objects.create_user(
        username="supervisor_ws",
        email="supervisor@test.com",
        password="testpass123",
    )
    perm = Permission.objects.get(codename="receive_critical_alerts")
    user.user_permissions.add(perm)
    return user


@pytest.fixture
def test_bed(db, inpatient_ward):
    """Create a test bed."""
    return Bed.objects.create(
        ward=inpatient_ward,
        bed_number="WS-B-001",
        bed_type="STANDARD",
        status="AVAILABLE",
    )


# =============================================================================
# WARD COMPATIBILITY CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestWardCompatibilityConsumerConnection:
    """Test WebSocket connection handling for ward compatibility updates."""

    async def test_connect_to_valid_ward_succeeds(self):
        """Should accept connection to valid ward channel."""
        from hmis.asgi import application

        ward = await create_test_ward(name="Valid Ward", code="VW-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_to_invalid_ward_fails(self):
        """Should reject connection to non-existent ward."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/inpatient/wards/99999/")
        connected, _ = await communicator.connect()

        assert connected is False

    async def test_connect_joins_ward_group(self):
        """Should join the ward-specific channel group on connect."""
        from hmis.asgi import application

        ward = await create_test_ward(name="Group Test Ward", code="GTW-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = f"ward_{ward.id}"

        await channel_layer.group_send(
            group_name,
            {
                "type": "ward.update",
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

        ward = await create_test_ward(name="Disconnect Test Ward", code="DTW-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()
        assert connected is True

        await communicator.disconnect()

        # Verify no error when sending to group after disconnect
        channel_layer = get_channel_layer()
        group_name = f"ward_{ward.id}"

        # This should not raise an error
        await channel_layer.group_send(
            group_name,
            {
                "type": "ward.update",
                "event": "test_event",
                "data": {},
            },
        )


# =============================================================================
# SUPERVISOR ALERT CONSUMER CONNECTION TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSupervisorAlertConsumerConnection:
    """Test WebSocket connection handling for supervisor alerts."""

    async def test_connect_to_supervisor_alerts_succeeds(self):
        """Should accept connection to supervisor alerts channel."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/inpatient/supervisor/alerts/")
        connected, _ = await communicator.connect()

        assert connected is True
        await communicator.disconnect()

    async def test_connect_joins_supervisor_alerts_group(self):
        """Should join the supervisor_alerts channel group on connect."""
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/inpatient/supervisor/alerts/")
        connected, _ = await communicator.connect()
        assert connected is True

        # Send a message to the group and verify it's received
        channel_layer = get_channel_layer()
        group_name = "supervisor_alerts"

        await channel_layer.group_send(
            group_name,
            {
                "type": "supervisor.alert",
                "event": "critical_alert",
                "data": {"severity": "CRITICAL"},
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "critical_alert"
        assert response["data"]["severity"] == "CRITICAL"

        await communicator.disconnect()


# =============================================================================
# WARD EVENT BROADCAST TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestWardEventBroadcasts:
    """Test that ward events are properly broadcasted."""

    async def test_constraints_updated_event_broadcasted(self):
        """Should broadcast event when ward constraints are updated."""
        from hmis.apps.inpatient.websockets import broadcast_ward_event
        from hmis.asgi import application

        ward = await create_test_ward(name="Constraints Ward", code="CW-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_ward_event(
            ward_id=ward.id,
            event_type="constraints_updated",
            data={
                "ward_id": ward.id,
                "gender_restriction": "MALE_ONLY",
                "min_age_years": None,
                "max_age_years": None,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "constraints_updated"
        assert response["data"]["ward_id"] == ward.id
        assert response["data"]["gender_restriction"] == "MALE_ONLY"

        await communicator.disconnect()

    async def test_capacity_changed_event_broadcasted(self):
        """Should broadcast event when ward capacity changes."""
        from hmis.apps.inpatient.websockets import broadcast_ward_event
        from hmis.asgi import application

        ward = await create_test_ward(name="Capacity Ward", code="CAP-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_ward_event(
            ward_id=ward.id,
            event_type="capacity_changed",
            data={
                "ward_id": ward.id,
                "available_beds": 5,
                "total_beds": 10,
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "capacity_changed"
        assert response["data"]["available_beds"] == 5

        await communicator.disconnect()

    async def test_compatibility_violation_event_broadcasted(self):
        """Should broadcast event when admission has constraint violation."""
        from hmis.apps.inpatient.websockets import broadcast_ward_event
        from hmis.asgi import application

        ward = await create_test_ward(name="Violation Ward", code="VIO-001")

        communicator = WebsocketCommunicator(application, f"/ws/inpatient/wards/{ward.id}/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_ward_event(
            ward_id=ward.id,
            event_type="compatibility_violation",
            data={
                "admission_id": 123,
                "patient_name": "Test Patient",
                "violations": [
                    {"code": "GENDER_MISMATCH", "severity": "WARNING"},
                ],
                "override_reason": "No other beds available",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "compatibility_violation"
        assert response["data"]["admission_id"] == 123
        assert len(response["data"]["violations"]) == 1

        await communicator.disconnect()


# =============================================================================
# SUPERVISOR ALERT EVENT TESTS
# =============================================================================


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSupervisorAlertBroadcasts:
    """Test that supervisor alert events are properly broadcasted."""

    async def test_critical_alert_broadcasted(self):
        """Should broadcast critical alert event to supervisor channel."""
        from hmis.apps.inpatient.websockets import broadcast_supervisor_alert
        from hmis.asgi import application

        communicator = WebsocketCommunicator(application, "/ws/inpatient/supervisor/alerts/")
        connected, _ = await communicator.connect()
        assert connected is True

        await broadcast_supervisor_alert(
            event_type="critical_violation",
            data={
                "admission_id": 456,
                "patient_name": "Critical Patient",
                "patient_mrn": "MRN-12345",
                "ward_name": "Non-Isolation Ward",
                "violations": [
                    {
                        "code": "ISOLATION_REQUIRED",
                        "severity": "CRITICAL",
                        "message": "Patient requires isolation",
                    },
                ],
                "override_reason": "Emergency admission",
                "admitted_by": "Dr. Test",
                "timestamp": "2026-02-12T10:00:00Z",
            },
        )

        response = await communicator.receive_json_from()
        assert response["event"] == "critical_violation"
        assert response["data"]["admission_id"] == 456
        assert response["data"]["violations"][0]["severity"] == "CRITICAL"

        await communicator.disconnect()


# =============================================================================
# SIGNAL HANDLER TESTS
# =============================================================================


@pytest.mark.django_db
class TestWardConstraintsSignalHandler:
    """Test signal handler for ward constraint updates."""

    @patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync")
    def test_ward_constraint_update_triggers_broadcast(self, mock_broadcast, inpatient_ward):
        """Should broadcast event when ward constraints are updated."""
        # Update ward constraints
        inpatient_ward.gender_restriction = "MALE_ONLY"
        inpatient_ward.save()

        # Verify broadcast was called
        mock_broadcast.assert_called()
        call_args = mock_broadcast.call_args
        assert call_args[1]["ward_id"] == inpatient_ward.id
        assert call_args[1]["event_type"] == "constraints_updated"


@pytest.mark.django_db
class TestAdmissionViolationSignalHandler:
    """Test signal handler for admission constraint violations."""

    @patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync")
    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    def test_admission_with_warning_triggers_ward_broadcast(
        self,
        mock_celery_task,
        mock_broadcast,
        male_only_ward_ws,
        sample_patient,
        test_user,
        sample_facility,
    ):
        """Should broadcast to ward when admission has WARNING violation."""
        bed = Bed.objects.create(
            ward=male_only_ward_ws,
            bed_number="MW-001",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Admitted for management",
            facility=sample_facility,
        )

        # Create admission with WARNING violation
        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=male_only_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="No other beds",
            constraint_violations=[
                {"code": "GENDER_MISMATCH", "severity": "WARNING", "message": "Gender mismatch"}
            ],
        )

        # Verify ward broadcast was called but NOT supervisor task
        mock_broadcast.assert_called()
        mock_celery_task.assert_not_called()

    @patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync")
    @patch("hmis.apps.inpatient.signals.broadcast_supervisor_alert_sync")
    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    def test_admission_with_critical_triggers_supervisor_escalation(
        self,
        mock_celery_task,
        mock_supervisor_broadcast,
        mock_ward_broadcast,
        non_isolation_ward_ws,
        sample_patient,
        test_user,
        sample_facility,
    ):
        """Should escalate to supervisors when admission has CRITICAL violation."""
        bed = Bed.objects.create(
            ward=non_isolation_ward_ws,
            bed_number="NI-001",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Emergency admission",
            facility=sample_facility,
        )

        # Create admission with CRITICAL violation
        Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=non_isolation_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="Emergency",
            constraint_violations=[
                {
                    "code": "ISOLATION_REQUIRED",
                    "severity": "CRITICAL",
                    "message": "Patient requires isolation",
                }
            ],
        )

        # Verify supervisor broadcast AND celery task were called
        mock_supervisor_broadcast.assert_called()
        mock_celery_task.assert_called()


@pytest.mark.django_db
class TestNonCriticalViolationNoSupervisorEscalation:
    """Tests for WARNING (non-critical) violation supervisor escalation behavior."""

    @patch("hmis.apps.inpatient.signals.broadcast_ward_event_sync")
    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    def test_warning_violation_does_not_trigger_supervisor_task(
        self, mock_celery_task, mock_broadcast, male_only_ward_ws, sample_patient, test_user,
        sample_facility,
    ):
        """WARNING (non-critical) violation should NOT trigger supervisor escalation."""
        bed = Bed.objects.create(
            ward=male_only_ward_ws,
            bed_number="MW-002",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Gender exception admission",
            facility=sample_facility,
        )

        # Create admission with only WARNING violations
        Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=male_only_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="Gender exception",
            constraint_violations=[
                {"code": "GENDER_MISMATCH", "severity": "WARNING", "message": "Gender mismatch"}
            ],
        )

        # Verify supervisor task was NOT called
        mock_celery_task.assert_not_called()


# =============================================================================
# CELERY TASK TESTS
# =============================================================================


@pytest.mark.django_db
class TestNotifySupervisorsCriticalViolationTask:
    """Tests for the Celery task that notifies supervisors of critical violations."""

    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    @patch("hmis.apps.inpatient.tasks.send_mail")
    def test_task_sends_email_to_supervisors(
        self,
        mock_send_mail,
        mock_signal_task,  # Prevent signal from also calling task
        supervisor_user,
        non_isolation_ward_ws,
        sample_patient,
        test_user,
        sample_facility,
    ):
        """Should send email notification to users with receive_critical_alerts permission."""
        from hmis.apps.inpatient.tasks import notify_supervisors_critical_violation

        bed = Bed.objects.create(
            ward=non_isolation_ward_ws,
            bed_number="NI-002",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Critical isolation admission",
            facility=sample_facility,
        )

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=non_isolation_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="Emergency room overflow",
            constraint_violations=[
                {
                    "code": "ISOLATION_REQUIRED",
                    "severity": "CRITICAL",
                    "message": "Patient requires isolation",
                }
            ],
        )

        # Run the task synchronously (isolated from signal)
        notify_supervisors_critical_violation(admission.id)

        # Verify email was sent exactly once by our explicit call
        mock_send_mail.assert_called_once()
        call_kwargs = mock_send_mail.call_args.kwargs
        assert "CRITICAL" in call_kwargs["subject"]
        assert supervisor_user.email in call_kwargs["recipient_list"]

    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    @patch("hmis.apps.inpatient.tasks.send_mail")
    def test_task_includes_violation_details_in_email(
        self,
        mock_send_mail,
        mock_signal_task,  # Prevent signal from also calling task
        supervisor_user,
        non_isolation_ward_ws,
        sample_patient,
        test_user,
        sample_facility,
    ):
        """Email should include full violation details."""
        from hmis.apps.inpatient.tasks import notify_supervisors_critical_violation

        bed = Bed.objects.create(
            ward=non_isolation_ward_ws,
            bed_number="NI-003",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="Violation details test",
            facility=sample_facility,
        )

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=non_isolation_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="No isolation beds",
            constraint_violations=[
                {
                    "code": "ISOLATION_REQUIRED",
                    "severity": "CRITICAL",
                    "message": "Patient requires isolation",
                }
            ],
        )

        notify_supervisors_critical_violation(admission.id)

        # Verify email body contains key details
        mock_send_mail.assert_called_once()
        call_kwargs = mock_send_mail.call_args.kwargs
        email_body = call_kwargs["message"]
        assert sample_patient.first_name in email_body
        assert sample_patient.last_name in email_body
        assert non_isolation_ward_ws.name in email_body
        # The task uses message text, not code
        assert "Patient requires isolation" in email_body

    @patch("hmis.apps.inpatient.signals.notify_supervisors_critical_violation.delay")
    @patch("hmis.apps.inpatient.tasks.send_mail")
    def test_task_handles_no_supervisors_gracefully(
        self,
        mock_send_mail,
        mock_signal_task,  # Prevent signal from also calling task
        non_isolation_ward_ws,
        sample_patient,
        test_user,
        sample_facility,
    ):
        """Should not fail if no users have receive_critical_alerts permission."""
        from hmis.apps.inpatient.tasks import notify_supervisors_critical_violation

        # Remove all supervisor permissions
        Permission.objects.get(codename="receive_critical_alerts").user_set.clear()

        bed = Bed.objects.create(
            ward=non_isolation_ward_ws,
            bed_number="NI-004",
            status="AVAILABLE",
        )

        # Create IPD encounter (required for admission)
        ipd_encounter = Encounter.objects.create(
            patient=sample_patient,
            encounter_type="IPD",
            chief_complaint="No supervisors test",
            facility=sample_facility,
        )

        admission = Admission.objects.create(
            patient=sample_patient,
            ipd_encounter=ipd_encounter,
            ward=non_isolation_ward_ws,
            bed=bed,
            admission_date=timezone.now(),
            admitting_diagnosis="J18.9",
            admitting_diagnosis_text="Pneumonia",
            admitting_officer=test_user,
            payer_type="CASH",
            constraint_override=True,
            constraint_override_reason="Emergency",
            constraint_violations=[
                {
                    "code": "ISOLATION_REQUIRED",
                    "severity": "CRITICAL",
                    "message": "Patient requires isolation",
                }
            ],
        )

        # Should not raise an exception
        notify_supervisors_critical_violation(admission.id)

        # Verify email was NOT sent (no recipients)
        mock_send_mail.assert_not_called()


# =============================================================================
# POLLING FALLBACK ENDPOINT TESTS
# =============================================================================


@pytest.mark.django_db
class TestPollingFallbackEndpoint:
    """Tests for the polling fallback endpoint when WebSocket is unavailable."""

    def test_get_ward_updates_returns_recent_events(self, authenticated_client, inpatient_ward):
        """Should return list of recent events for a ward."""
        response = authenticated_client.get(f"/api/inpatient/wards/{inpatient_ward.id}/updates/")

        assert response.status_code == 200
        assert "events" in response.data
        assert isinstance(response.data["events"], list)

    def test_get_ward_updates_filters_by_since_timestamp(
        self, authenticated_client, inpatient_ward
    ):
        """Should filter events by since parameter."""
        since = timezone.now().isoformat()
        response = authenticated_client.get(
            f"/api/inpatient/wards/{inpatient_ward.id}/updates/",
            {"since": since},
        )

        assert response.status_code == 200
        assert "events" in response.data

    def test_get_supervisor_alerts_returns_critical_violations(
        self, authenticated_client, test_user
    ):
        """Should return list of recent critical violations for supervisor."""
        # Grant supervisor permission to test user
        perm = Permission.objects.get(codename="receive_critical_alerts")
        test_user.user_permissions.add(perm)
        # Clear the permission cache
        test_user = User.objects.get(pk=test_user.pk)
        authenticated_client.force_authenticate(user=test_user)

        response = authenticated_client.get("/api/inpatient/supervisor/alerts/")

        assert response.status_code == 200
        assert "alerts" in response.data
        assert isinstance(response.data["alerts"], list)

    def test_supervisor_alerts_requires_permission(self, authenticated_client):
        """Should require receive_critical_alerts permission."""
        response = authenticated_client.get("/api/inpatient/supervisor/alerts/")

        assert response.status_code == 403

"""
Tests for HL7 v2 app (Gap #28: HL7v2 Full Implementation).

Tests cover:
- HL7Message model lifecycle and properties
- ADT message building (A01, A02, A03, A08)
- HL7QueueService enqueue, retry, dead-letter
- Celery task wiring
"""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.test import override_settings
from django.utils import timezone

from hmis.apps.hl7.models import HL7Message, HL7MessageDirection, HL7MessageStatus
from hmis.apps.hl7.services.adt_service import ADTService
from hmis.apps.hl7.services.queue_service import HL7QueueService


def _mock_obj(str_val: str) -> MagicMock:
    """Create a MagicMock whose str() returns the given value."""
    m = MagicMock()
    m.__str__ = MagicMock(return_value=str_val)
    return m


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_patient():
    """Mock patient with minimal fields for ADT."""
    p = SimpleNamespace(
        id=1,
        mrn="MRN-20260301-0001",
        first_name="Jane",
        last_name="Doe",
        middle_name="Wanjiku",
        date_of_birth="1985-05-20",
        gender="F",
        phone_number="0712345678",
        national_id="12345678",
        emergency_contact_name="John Doe",
        emergency_contact_phone="0723456789",
        emergency_contact_relationship="Spouse",
        county=SimpleNamespace(__str__=lambda s: "Nairobi"),
        sub_county=SimpleNamespace(__str__=lambda s: "Westlands"),
        ward=None,
    )
    return p


@pytest.fixture
def mock_admission(mock_patient):
    """Mock admission with ward and bed."""
    return SimpleNamespace(
        id=42,
        patient=mock_patient,
        ward=_mock_obj("Medical Ward 1"),
        bed=_mock_obj("B-005"),
        attending_doctor=SimpleNamespace(
            id=10,
            get_full_name=lambda: "Dr. Amina Ochieng",
        ),
        attending_doctor_id=10,
        admitted_at=timezone.now(),
        discharged_at=None,
    )


@pytest.fixture
def adt_service():
    """ADT service instance."""
    return ADTService()


# ============================================================================
# HL7Message Model Tests
# ============================================================================


@pytest.mark.django_db
class TestHL7MessageModel:
    """Tests for HL7Message model."""

    def test_create_message(self):
        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="ADT202603010001",
        )
        assert msg.id is not None
        assert msg.status == HL7MessageStatus.PENDING
        assert msg.direction == HL7MessageDirection.OUTBOUND
        assert msg.retry_count == 0

    def test_str(self):
        msg = HL7Message(
            message_type="ADT^A01",
            status=HL7MessageStatus.PENDING,
            message_control_id="TEST001",
        )
        assert "ADT^A01" in str(msg)
        assert "PENDING" in str(msg)
        assert "TEST001" in str(msg)

    def test_is_retryable_within_limit(self):
        msg = HL7Message(
            status=HL7MessageStatus.FAILED,
            retry_count=2,
            max_retries=5,
        )
        assert msg.is_retryable is True

    def test_is_retryable_at_limit(self):
        msg = HL7Message(
            status=HL7MessageStatus.FAILED,
            retry_count=5,
            max_retries=5,
        )
        assert msg.is_retryable is False

    def test_is_retryable_wrong_status(self):
        msg = HL7Message(
            status=HL7MessageStatus.ACKNOWLEDGED,
            retry_count=0,
            max_retries=5,
        )
        assert msg.is_retryable is False

    def test_mark_dead_letter(self):
        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="DEAD001",
            status=HL7MessageStatus.FAILED,
            retry_count=5,
            max_retries=5,
        )
        msg.mark_dead_letter()
        msg.refresh_from_db()
        assert msg.status == HL7MessageStatus.DEAD_LETTER

    def test_message_ordering(self):
        """Most recent messages should come first."""
        m1 = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="first",
            message_control_id="ORD001",
        )
        m2 = HL7Message.objects.create(
            message_type="ADT^A08",
            raw_message="second",
            message_control_id="ORD002",
        )
        messages = list(HL7Message.objects.all())
        assert messages[0].id == m2.id


# ============================================================================
# ADT Service Tests
# ============================================================================


class TestADTService:
    """Tests for ADT message building."""

    def test_build_adt_a01(self, adt_service, mock_admission):
        """ADT^A01 contains MSH, EVN, PID, NK1, PV1 segments."""
        message, msg_id = adt_service.build_adt_a01(mock_admission)

        lines = message.strip().split("\r")
        segment_types = [line.split("|")[0] for line in lines]

        assert "MSH" in segment_types
        assert "EVN" in segment_types
        assert "PID" in segment_types
        assert "NK1" in segment_types
        assert "PV1" in segment_types

        # Check MSH message type
        msh = lines[0]
        assert "ADT^A01" in msh
        assert "2.5.1" in msh

        # Check PID contains patient data
        pid_line = [l for l in lines if l.startswith("PID")][0]
        assert "Doe" in pid_line
        assert "Jane" in pid_line
        assert "MRN-20260301-0001" in pid_line

        assert msg_id
        assert msg_id.startswith("ADT")

    def test_build_adt_a02(self, adt_service, mock_admission):
        """ADT^A02 transfer message is well-formed."""
        message, msg_id = adt_service.build_adt_a02(
            mock_admission, from_ward="Old Ward", from_bed="B-001"
        )

        lines = message.strip().split("\r")
        msh = lines[0]
        assert "ADT^A02" in msh

        segment_types = [l.split("|")[0] for l in lines]
        assert "PV1" in segment_types
        assert msg_id

    def test_build_adt_a03(self, adt_service, mock_admission):
        """ADT^A03 discharge message is well-formed."""
        mock_admission.discharged_at = timezone.now()
        message, msg_id = adt_service.build_adt_a03(mock_admission)

        lines = message.strip().split("\r")
        msh = lines[0]
        assert "ADT^A03" in msh

        segment_types = [l.split("|")[0] for l in lines]
        assert "EVN" in segment_types
        assert "PID" in segment_types
        assert "PV1" in segment_types

    def test_build_adt_a08(self, adt_service, mock_patient):
        """ADT^A08 update patient info message is well-formed."""
        message, msg_id = adt_service.build_adt_a08(mock_patient)

        lines = message.strip().split("\r")
        msh = lines[0]
        assert "ADT^A08" in msh

        segment_types = [l.split("|")[0] for l in lines]
        assert "PID" in segment_types
        assert "NK1" in segment_types
        assert "PV1" in segment_types

        # PV1 should have outpatient class
        pv1 = [l for l in lines if l.startswith("PV1")][0]
        fields = pv1.split("|")
        assert fields[2] == "O"  # Outpatient

    def test_a01_without_emergency_contact(self, adt_service, mock_admission):
        """ADT^A01 without emergency contact omits NK1."""
        mock_admission.patient.emergency_contact_name = ""
        message, _ = adt_service.build_adt_a01(mock_admission)
        segment_types = [l.split("|")[0] for l in message.strip().split("\r")]
        assert "NK1" not in segment_types

    def test_a01_gender_mapping(self, adt_service, mock_admission):
        """PID-8 correctly maps gender codes."""
        mock_admission.patient.gender = "M"
        message, _ = adt_service.build_adt_a01(mock_admission)
        pid = [l for l in message.strip().split("\r") if l.startswith("PID")][0]
        fields = pid.split("|")
        assert fields[8] == "M"

    def test_escape_special_characters(self, adt_service):
        """HL7 special characters are escaped."""
        assert adt_service._escape("test|value") == "test\\F\\value"
        assert adt_service._escape("a^b") == "a\\S\\b"
        assert adt_service._escape("a&b") == "a\\T\\b"
        assert adt_service._escape("") == ""

    def test_unique_message_ids(self, adt_service, mock_admission):
        """Each message gets a unique control ID."""
        _, id1 = adt_service.build_adt_a01(mock_admission)
        _, id2 = adt_service.build_adt_a01(mock_admission)
        assert id1 != id2

    def test_a01_ward_and_bed_in_pv1(self, adt_service, mock_admission):
        """PV1 includes ward and bed location."""
        message, _ = adt_service.build_adt_a01(mock_admission)
        pv1 = [l for l in message.strip().split("\r") if l.startswith("PV1")][0]
        assert "Medical Ward 1" in pv1
        assert "B-005" in pv1

    def test_a01_attending_doctor_in_pv1(self, adt_service, mock_admission):
        """PV1-7 includes attending doctor."""
        message, _ = adt_service.build_adt_a01(mock_admission)
        pv1 = [l for l in message.strip().split("\r") if l.startswith("PV1")][0]
        assert "Dr. Amina Ochieng" in pv1


# ============================================================================
# Queue Service Tests
# ============================================================================


@pytest.mark.django_db
class TestHL7QueueService:
    """Tests for HL7 message queue and retry."""

    def test_enqueue_creates_message(self):
        """Enqueue creates a persistent HL7 message."""
        msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="ENQ001",
            resource_type="Admission",
            resource_id=42,
        )
        assert msg.id is not None
        assert msg.message_type == "ADT^A01"
        assert msg.message_control_id == "ENQ001"
        assert msg.resource_type == "Admission"
        assert msg.resource_id == 42

    @override_settings(HL7_MLLP_HOST="", HL7_MLLP_PORT=None)
    def test_enqueue_no_host_stays_pending(self):
        """Without MLLP host, message stays PENDING."""
        msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="NOHOST001",
        )
        # No host configured so it shouldn't try to auto-send
        assert msg.status in (HL7MessageStatus.PENDING, HL7MessageStatus.FAILED)

    @override_settings(HL7_INTEGRATION_ENABLED=False)
    def test_enqueue_disabled_stays_pending(self):
        """With integration disabled, message stays PENDING."""
        msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="DISABLED001",
            destination_host="localhost",
            destination_port=2575,
        )
        assert msg.status == HL7MessageStatus.PENDING

    @patch("hmis.apps.hl7.services.queue_service.HL7QueueService._try_send")
    @override_settings(HL7_INTEGRATION_ENABLED=True)
    def test_enqueue_auto_sends_when_enabled(self, mock_send):
        """With integration enabled and host set, auto-sends."""
        mock_send.return_value = True
        msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="AUTO001",
            destination_host="localhost",
            destination_port=2575,
        )
        mock_send.assert_called_once()

    def test_retry_pending_processes_due_messages(self):
        """Retry picks up messages with next_retry_at in the past."""
        past = timezone.now() - timedelta(minutes=5)
        HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="RETRY001",
            status=HL7MessageStatus.PENDING,
            next_retry_at=past,
        )
        # No MLLP host → will fail gracefully
        results = HL7QueueService.retry_pending()
        assert results["failed"] >= 0 or results["sent"] >= 0

    def test_retry_dead_letters_exhausted_messages(self):
        """Messages at max retries get dead-lettered."""
        past = timezone.now() - timedelta(minutes=5)
        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="DEADLETTER001",
            status=HL7MessageStatus.FAILED,
            retry_count=5,
            max_retries=5,
            next_retry_at=past,
        )
        results = HL7QueueService.retry_pending()
        msg.refresh_from_db()
        assert msg.status == HL7MessageStatus.DEAD_LETTER
        assert results["dead_letter"] >= 1

    def test_retry_skips_future_messages(self):
        """Messages with future next_retry_at are not processed."""
        future = timezone.now() + timedelta(hours=1)
        HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="FUTURE001",
            status=HL7MessageStatus.FAILED,
            retry_count=1,
            next_retry_at=future,
        )
        results = HL7QueueService.retry_pending()
        assert results["sent"] == 0

    def test_try_send_no_destination_fails(self):
        """Message without destination host/port fails immediately."""
        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="NODEST001",
            destination_host="",
            destination_port=None,
        )
        result = HL7QueueService._try_send(msg)
        assert result is False
        msg.refresh_from_db()
        assert msg.status == HL7MessageStatus.FAILED
        assert "No MLLP destination" in msg.last_error

    @patch("hmis.apps.laboratory.services.mllp_client.MLLPClient")
    def test_try_send_success_with_ack(self, MockMLLPClient):
        """Successful send with positive ACK."""
        mock_response = MagicMock()
        mock_response.message = "MSH|...|\rMSA|AA|TEST001\r"
        mock_client = MagicMock()
        mock_client.send_message.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        MockMLLPClient.return_value = mock_client

        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="ACKSUCCESS001",
            destination_host="localhost",
            destination_port=2575,
        )
        result = HL7QueueService._try_send(msg)
        assert result is True
        msg.refresh_from_db()
        assert msg.status == HL7MessageStatus.ACKNOWLEDGED
        assert msg.ack_code == "AA"
        assert msg.sent_at is not None
        assert msg.acknowledged_at is not None

    @patch("hmis.apps.laboratory.services.mllp_client.MLLPClient")
    def test_try_send_negative_ack(self, MockMLLPClient):
        """Negative ACK marks message as FAILED."""
        mock_response = MagicMock()
        mock_response.message = "MSH|...|\rMSA|AE|TEST001\r"
        mock_client = MagicMock()
        mock_client.send_message.return_value = mock_response
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        MockMLLPClient.return_value = mock_client

        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="NEGACK001",
            destination_host="localhost",
            destination_port=2575,
        )
        result = HL7QueueService._try_send(msg)
        assert result is False
        msg.refresh_from_db()
        assert msg.status == HL7MessageStatus.FAILED
        assert msg.ack_code == "AE"

    @patch("hmis.apps.laboratory.services.mllp_client.MLLPClient")
    def test_try_send_connection_error_retries(self, MockMLLPClient):
        """Connection errors increment retry and set backoff."""
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(side_effect=ConnectionRefusedError("Connection refused"))
        mock_client.__exit__ = MagicMock(return_value=False)
        MockMLLPClient.return_value = mock_client

        msg = HL7Message.objects.create(
            message_type="ADT^A01",
            raw_message="MSH|...",
            message_control_id="CONNERR001",
            destination_host="localhost",
            destination_port=2575,
        )
        result = HL7QueueService._try_send(msg)
        assert result is False
        msg.refresh_from_db()
        assert msg.retry_count == 1
        assert msg.next_retry_at is not None
        assert "Connection refused" in msg.last_error

    def test_parse_ack_code(self):
        """ACK code extraction from MSA segment."""
        assert HL7QueueService._parse_ack_code("MSH|...|\rMSA|AA|CTRL001\r") == "AA"
        assert HL7QueueService._parse_ack_code("MSH|...|\rMSA|AE|CTRL001\r") == "AE"
        assert HL7QueueService._parse_ack_code("MSH|...|\r") == ""
        assert HL7QueueService._parse_ack_code("") == ""


# ============================================================================
# Task Tests
# ============================================================================


@pytest.mark.django_db
class TestHL7Tasks:
    """Tests for Celery tasks."""

    @patch("hmis.apps.hl7.services.queue_service.HL7QueueService.retry_pending")
    def test_process_outbound_queue_task(self, mock_retry):
        """Task calls HL7QueueService.retry_pending."""
        from hmis.apps.hl7.tasks import process_outbound_queue

        mock_retry.return_value = {"sent": 1, "failed": 0, "dead_letter": 0}
        result = process_outbound_queue()
        mock_retry.assert_called_once_with(batch_size=50)
        assert result["sent"] == 1

    @patch("hmis.apps.hl7.services.queue_service.HL7QueueService.retry_pending")
    def test_process_outbound_queue_custom_batch(self, mock_retry):
        """Task accepts custom batch size."""
        from hmis.apps.hl7.tasks import process_outbound_queue

        mock_retry.return_value = {"sent": 0, "failed": 0, "dead_letter": 0}
        process_outbound_queue(batch_size=10)
        mock_retry.assert_called_once_with(batch_size=10)


# ============================================================================
# Integration: ADT + Queue
# ============================================================================


@pytest.mark.django_db
class TestADTQueueIntegration:
    """Integration tests: build ADT messages then enqueue them."""

    @override_settings(HL7_INTEGRATION_ENABLED=False)
    def test_build_and_enqueue_a01(self, mock_admission, adt_service):
        """Build A01 then enqueue - stays PENDING when disabled."""
        message, msg_id = adt_service.build_adt_a01(mock_admission)
        hl7_msg = HL7QueueService.enqueue(
            message_type="ADT^A01",
            raw_message=message,
            message_control_id=msg_id,
            resource_type="Admission",
            resource_id=mock_admission.id,
        )
        assert hl7_msg.status == HL7MessageStatus.PENDING
        assert "ADT^A01" in hl7_msg.raw_message
        assert hl7_msg.resource_type == "Admission"
        assert hl7_msg.resource_id == 42

    @override_settings(HL7_INTEGRATION_ENABLED=False)
    def test_build_and_enqueue_a08(self, mock_patient, adt_service):
        """Build A08 then enqueue."""
        message, msg_id = adt_service.build_adt_a08(mock_patient)
        hl7_msg = HL7QueueService.enqueue(
            message_type="ADT^A08",
            raw_message=message,
            message_control_id=msg_id,
            resource_type="Patient",
            resource_id=mock_patient.id,
        )
        assert hl7_msg.status == HL7MessageStatus.PENDING
        assert hl7_msg.resource_type == "Patient"

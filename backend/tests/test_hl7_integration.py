"""
Tests for HL7 v2.x Message Service and MLLP Client.

Sprint Phase 4: HL7 v2 Messaging (Lab Integration)
Reference: docs/fhir-validation-plan.md

These tests verify:
- ORM^O01 (Lab Order) message generation
- ORU^R01 (Lab Result) message parsing
- ACK message handling
- MLLP message framing/unframing
- Result import functionality
"""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest  # type: ignore
from django.contrib.auth import get_user_model

from hmis.apps.laboratory.models import LabOrder, LabOrderItem, LabResult, TestCatalog
from hmis.apps.laboratory.services.hl7_service import (
    HL7AckResponse,
    HL7LabResult,
    HL7ParseError,
    HL7Service,
    HL7ValidationError,
)
from hmis.apps.laboratory.services.mllp_client import (
    MLLP_CARRIAGE_RETURN,
    MLLP_END_BLOCK,
    MLLP_START_BLOCK,
    MLLPClient,
    MLLPConfig,
    MLLPConnectionError,
    MLLPFramingError,
    MLLPResponse,
)
from hmis.apps.patients.models import Patient

User = get_user_model()


# ============================================================================
# HL7 Service Tests
# ============================================================================


@pytest.mark.django_db
class TestHL7ServiceMessageBuilding:
    """Tests for HL7 message building functionality."""

    @pytest.fixture
    def hl7_service(self):
        """Create HL7 service instance."""
        return HL7Service(
            sending_application="VITORA_TEST",
            sending_facility="TEST_FACILITY",
            receiving_application="LAB_LIS",
            receiving_facility="EXT_LAB",
        )

    @pytest.fixture
    def test_catalog(self, db):
        """Create test catalog for lab tests."""
        return TestCatalog.objects.create(
            code="CBC",
            name="Complete Blood Count",
            short_name="CBC",
            loinc_code="58410-2",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="PANEL",
            cost=Decimal("500.00"),
        )

    @pytest.fixture
    def lab_order_with_items(
        self, db, sample_patient, sample_encounter, test_user, test_catalog
    ):
        """Create lab order with items for testing."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="EXTERNAL",
            status="ORDERED",
            priority="ROUTINE",
            clinical_notes="Patient presenting with fatigue",
        )

        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        return order

    def test_build_orm_o01_message_structure(self, hl7_service, lab_order_with_items):
        """Should generate valid ORM^O01 message with correct structure."""
        message = hl7_service.build_orm_o01(lab_order_with_items)

        # Check message contains required segments
        assert "MSH|" in message
        assert "PID|" in message
        assert "PV1|" in message
        assert "ORC|" in message
        assert "OBR|" in message

        # Check message type in MSH segment
        assert "ORM^O01" in message

        # Check HL7 version
        assert "2.5.1" in message

    def test_build_orm_o01_msh_segment(self, hl7_service, lab_order_with_items):
        """Should build correct MSH segment."""
        message = hl7_service.build_orm_o01(lab_order_with_items)
        lines = message.strip().split("\r")
        msh = lines[0]

        # Check MSH structure
        assert msh.startswith("MSH|^~\\&|")

        # Check sending/receiving applications
        assert "VITORA_TEST" in msh
        assert "TEST_FACILITY" in msh
        assert "LAB_LIS" in msh
        assert "EXT_LAB" in msh

    def test_build_orm_o01_pid_segment(self, hl7_service, lab_order_with_items):
        """Should build correct PID segment with patient data."""
        message = hl7_service.build_orm_o01(lab_order_with_items)
        patient = lab_order_with_items.patient

        # Find PID segment
        pid_segment = None
        for line in message.split("\r"):
            if line.startswith("PID|"):
                pid_segment = line
                break

        assert pid_segment is not None
        assert patient.last_name in pid_segment
        assert patient.first_name in pid_segment

        # Check MRN is included
        assert patient.mrn in pid_segment

    def test_build_orm_o01_orc_segment(self, hl7_service, lab_order_with_items):
        """Should build correct ORC segment with order control."""
        message = hl7_service.build_orm_o01(lab_order_with_items)

        # Find ORC segment
        orc_segment = None
        for line in message.split("\r"):
            if line.startswith("ORC|"):
                orc_segment = line
                break

        assert orc_segment is not None

        # Check order control is NW (New Order)
        fields = orc_segment.split("|")
        assert fields[1] == "NW"

        # Check placer order number is our order number
        assert lab_order_with_items.order_number in orc_segment

    def test_build_orm_o01_obr_segment(self, hl7_service, lab_order_with_items):
        """Should build correct OBR segment with test information."""
        message = hl7_service.build_orm_o01(lab_order_with_items)

        # Find OBR segment
        obr_segment = None
        for line in message.split("\r"):
            if line.startswith("OBR|"):
                obr_segment = line
                break

        assert obr_segment is not None

        # Check LOINC code is included
        test_item = lab_order_with_items.items.first()
        if test_item.test.loinc_code:
            assert test_item.test.loinc_code in obr_segment

    def test_build_orm_o01_multiple_tests(
        self, hl7_service, lab_order_with_items, db
    ):
        """Should generate OBR segments for each test in order."""
        # Add second test
        test2 = TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            loinc_code="718-7",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            cost=Decimal("100.00"),
        )
        LabOrderItem.objects.create(
            lab_order=lab_order_with_items,
            test=test2,
            unit_cost=test2.cost,
        )

        message = hl7_service.build_orm_o01(lab_order_with_items)

        # Count OBR segments (should be 2)
        obr_count = sum(1 for line in message.split("\r") if line.startswith("OBR|"))
        assert obr_count == 2

    def test_build_orm_o01_without_items_raises_error(
        self, hl7_service, sample_patient, sample_encounter, test_user
    ):
        """Should raise error when order has no items."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="EXTERNAL",
            status="ORDERED",
        )

        with pytest.raises(HL7ValidationError, match="at least one test item"):
            hl7_service.build_orm_o01(order)

    def test_build_orm_o01_escapes_special_characters(
        self, hl7_service, lab_order_with_items
    ):
        """Should escape HL7 special characters in text fields."""
        lab_order_with_items.clinical_notes = "Patient has fever | headache ^ fatigue"
        lab_order_with_items.save()

        message = hl7_service.build_orm_o01(lab_order_with_items)

        # Check that special characters are escaped
        # | becomes \F\, ^ becomes \S\
        assert "\\F\\" in message or "fever" in message


@pytest.mark.django_db
class TestHL7ServiceMessageParsing:
    """Tests for HL7 message parsing functionality."""

    @pytest.fixture
    def hl7_service(self):
        """Create HL7 service instance."""
        return HL7Service()

    def test_parse_oru_r01_basic_result(self, hl7_service):
        """Should parse basic ORU^R01 message."""
        oru_message = (
            "MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FACILITY|20260131120000||ORU^R01|MSG001|P|2.5.1\r"
            "PID|1||MRN-20260101-0001^^^MRN||Doe^Jane||19850520|F\r"
            "ORC|RE|LAB-20260131-0001|EXT-001||CM\r"
            "OBR|1|LAB-20260131-0001|EXT-001|58410-2^Complete Blood Count^LN|||20260131100000\r"
            "OBX|1|NM|718-7^Hemoglobin^LN||14.5|g/dL|12.0-15.0|N|||F\r"
        )

        results = hl7_service.parse_oru_r01(oru_message)

        assert len(results) == 1
        result = results[0]

        assert result.test_code == "718-7"
        assert result.test_name == "Hemoglobin"
        assert result.value == "14.5"
        assert result.units == "g/dL"
        assert result.reference_range == "12.0-15.0"
        assert result.abnormal_flag == "N"
        assert result.observation_status == "F"

    def test_parse_oru_r01_multiple_results(self, hl7_service):
        """Should parse ORU^R01 with multiple OBX segments."""
        oru_message = (
            "MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FACILITY|20260131120000||ORU^R01|MSG001|P|2.5.1\r"
            "ORC|RE|LAB-20260131-0001|EXT-001||CM\r"
            "OBR|1|LAB-20260131-0001|EXT-001|58410-2^CBC^LN|||20260131100000\r"
            "OBX|1|NM|718-7^Hemoglobin^LN||14.5|g/dL|12.0-15.0|N|||F\r"
            "OBX|2|NM|6690-2^WBC^LN||7500|cells/uL|4000-11000|N|||F\r"
            "OBX|3|NM|789-8^RBC^LN||4.8|x10^12/L|4.5-5.5|N|||F\r"
        )

        results = hl7_service.parse_oru_r01(oru_message)

        assert len(results) == 3
        assert results[0].test_code == "718-7"
        assert results[1].test_code == "6690-2"
        assert results[2].test_code == "789-8"

    def test_parse_oru_r01_abnormal_flags(self, hl7_service):
        """Should correctly parse abnormal flags."""
        oru_message = (
            "MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FACILITY|20260131120000||ORU^R01|MSG001|P|2.5.1\r"
            "ORC|RE|LAB-20260131-0001|EXT-001||CM\r"
            "OBR|1|LAB-20260131-0001|EXT-001|58410-2^CBC^LN|||20260131100000\r"
            "OBX|1|NM|718-7^Hemoglobin^LN||8.5|g/dL|12.0-15.0|LL|||F\r"
        )

        results = hl7_service.parse_oru_r01(oru_message)

        assert len(results) == 1
        assert results[0].abnormal_flag == "LL"  # Critical Low

    def test_parse_oru_r01_extracts_order_numbers(self, hl7_service):
        """Should extract placer and filler order numbers."""
        oru_message = (
            "MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FACILITY|20260131120000||ORU^R01|MSG001|P|2.5.1\r"
            "ORC|RE|LAB-20260131-0001|EXT-ABC123||CM\r"
            "OBR|1|LAB-20260131-0001|EXT-ABC123|718-7^Hemoglobin^LN|||20260131100000\r"
            "OBX|1|NM|718-7^Hemoglobin^LN||14.5|g/dL|12.0-15.0|N|||F\r"
        )

        results = hl7_service.parse_oru_r01(oru_message)

        assert results[0].placer_order_number == "LAB-20260131-0001"
        assert results[0].filler_order_number == "EXT-ABC123"

    def test_parse_oru_r01_empty_message_raises_error(self, hl7_service):
        """Should raise error for empty message."""
        with pytest.raises(HL7ParseError, match="Empty message"):
            hl7_service.parse_oru_r01("")

    def test_parse_oru_r01_invalid_message_type_raises_error(self, hl7_service):
        """Should raise error for non-ORU message."""
        adt_message = (
            "MSH|^~\\&|APP|FAC|REC|FAC|20260131||ADT^A01|MSG001|P|2.5.1\r"
            "PID|1||12345||Doe^John\r"
        )

        with pytest.raises(HL7ValidationError, match="Expected ORU message"):
            hl7_service.parse_oru_r01(adt_message)

    def test_parse_oru_r01_missing_msh_raises_error(self, hl7_service):
        """Should raise error when MSH segment is missing."""
        bad_message = "ORC|RE|12345||\r"

        with pytest.raises(HL7ParseError, match="must start with MSH"):
            hl7_service.parse_oru_r01(bad_message)


@pytest.mark.django_db
class TestHL7ServiceAckMessages:
    """Tests for ACK message generation and parsing."""

    @pytest.fixture
    def hl7_service(self):
        """Create HL7 service instance."""
        return HL7Service()

    def test_build_ack_accept(self, hl7_service):
        """Should build ACK message with accept code."""
        ack = hl7_service.build_ack(
            original_message_control_id="MSG001",
            ack_code="AA",
            text_message="Message accepted successfully",
        )

        assert "MSH|" in ack
        assert "ACK" in ack
        assert "MSA|AA|MSG001" in ack
        assert "accepted successfully" in ack

    def test_build_ack_error(self, hl7_service):
        """Should build ACK message with error code and ERR segment."""
        ack = hl7_service.build_ack(
            original_message_control_id="MSG001",
            ack_code="AE",
            text_message="Validation failed",
            error_code="207",
            error_location="PID^1",
        )

        assert "MSA|AE|MSG001" in ack
        assert "ERR|" in ack

    def test_build_ack_reject(self, hl7_service):
        """Should build ACK message with reject code."""
        ack = hl7_service.build_ack(
            original_message_control_id="MSG001",
            ack_code="AR",
            text_message="Message rejected",
        )

        assert "MSA|AR|MSG001" in ack

    def test_parse_ack_accept(self, hl7_service):
        """Should parse ACK accept message."""
        ack_message = (
            "MSH|^~\\&|LAB|FAC|VITORA|FAC|20260131||ACK^A01|ACK001|P|2.5.1\r"
            "MSA|AA|MSG001|Message processed\r"
        )

        response = hl7_service.parse_ack(ack_message)

        assert response.ack_code == "AA"
        assert response.message_control_id == "MSG001"
        assert "processed" in response.text_message

    def test_parse_ack_error_with_err_segment(self, hl7_service):
        """Should parse ACK error with ERR segment."""
        ack_message = (
            "MSH|^~\\&|LAB|FAC|VITORA|FAC|20260131||ACK^A01|ACK001|P|2.5.1\r"
            "MSA|AE|MSG001|Validation error\r"
            "ERR|PID^3||207|Patient not found\r"
        )

        response = hl7_service.parse_ack(ack_message)

        assert response.ack_code == "AE"
        assert response.error_location == "PID^3"


@pytest.mark.django_db
class TestHL7ServiceResultImport:
    """Tests for importing HL7 results into the database."""

    @pytest.fixture
    def hl7_service(self):
        """Create HL7 service instance."""
        return HL7Service()

    @pytest.fixture
    def test_catalog_with_loinc(self, db):
        """Create test catalog with LOINC code."""
        return TestCatalog.objects.create(
            code="HB",
            name="Hemoglobin",
            short_name="Hb",
            loinc_code="718-7",
            category="HEMATOLOGY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="g/dL",
            cost=Decimal("100.00"),
        )

    @pytest.fixture
    def lab_order_for_import(
        self, db, sample_patient, sample_encounter, test_user, test_catalog_with_loinc
    ):
        """Create lab order for result import testing."""
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="EXTERNAL",
            status="ORDERED",
        )

        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog_with_loinc,
            unit_cost=test_catalog_with_loinc.cost,
        )

        return order

    def test_import_result_creates_lab_result(
        self, hl7_service, lab_order_for_import, test_user
    ):
        """Should create LabResult from parsed HL7 data."""
        hl7_result = HL7LabResult(
            order_control="RE",
            placer_order_number=lab_order_for_import.order_number,
            filler_order_number="EXT-001",
            test_code="718-7",
            test_name="Hemoglobin",
            value="14.5",
            units="g/dL",
            reference_range="12.0-15.0",
            abnormal_flag="N",
            observation_status="F",
            result_datetime=datetime.now(),
            performer_id="LAB001",
            performer_name="Lab Tech",
        )

        result = hl7_service.import_result(hl7_result, test_user)

        assert result is not None
        assert result.numeric_value == Decimal("14.5")
        assert result.result_unit == "g/dL"
        assert result.reference_range_text == "12.0-15.0"
        assert result.result_flag == "NORMAL"
        assert result.is_external_result is True
        assert result.verification_status == "UNVERIFIED"

    def test_import_result_updates_order_item_status(
        self, hl7_service, lab_order_for_import, test_user
    ):
        """Should update order item status to COMPLETED."""
        hl7_result = HL7LabResult(
            order_control="RE",
            placer_order_number=lab_order_for_import.order_number,
            filler_order_number="EXT-001",
            test_code="718-7",
            test_name="Hemoglobin",
            value="14.5",
            units="g/dL",
            reference_range=None,
            abnormal_flag=None,
            observation_status="F",
            result_datetime=None,
            performer_id=None,
            performer_name=None,
        )

        hl7_service.import_result(hl7_result, test_user)

        order_item = lab_order_for_import.items.first()
        order_item.refresh_from_db()
        assert order_item.status == "COMPLETED"

    def test_import_result_with_abnormal_flag(
        self, hl7_service, lab_order_for_import, test_user
    ):
        """Should map HL7 abnormal flags to our flag system."""
        hl7_result = HL7LabResult(
            order_control="RE",
            placer_order_number=lab_order_for_import.order_number,
            filler_order_number="EXT-001",
            test_code="718-7",
            test_name="Hemoglobin",
            value="8.5",
            units="g/dL",
            reference_range="12.0-15.0",
            abnormal_flag="LL",  # Critical Low
            observation_status="F",
            result_datetime=None,
            performer_id=None,
            performer_name=None,
        )

        result = hl7_service.import_result(hl7_result, test_user)

        assert result.result_flag == "CRITICAL_LOW"

    def test_import_result_order_not_found_returns_none(
        self, hl7_service, test_user
    ):
        """Should return None when order is not found."""
        hl7_result = HL7LabResult(
            order_control="RE",
            placer_order_number="NONEXISTENT-ORDER",
            filler_order_number="EXT-001",
            test_code="718-7",
            test_name="Hemoglobin",
            value="14.5",
            units="g/dL",
            reference_range=None,
            abnormal_flag=None,
            observation_status="F",
            result_datetime=None,
            performer_id=None,
            performer_name=None,
        )

        result = hl7_service.import_result(hl7_result, test_user)

        assert result is None

    def test_import_result_duplicate_prevented(
        self, hl7_service, lab_order_for_import, test_user
    ):
        """Should not create duplicate result for same order item."""
        hl7_result = HL7LabResult(
            order_control="RE",
            placer_order_number=lab_order_for_import.order_number,
            filler_order_number="EXT-001",
            test_code="718-7",
            test_name="Hemoglobin",
            value="14.5",
            units="g/dL",
            reference_range=None,
            abnormal_flag=None,
            observation_status="F",
            result_datetime=None,
            performer_id=None,
            performer_name=None,
        )

        # First import
        result1 = hl7_service.import_result(hl7_result, test_user)
        assert result1 is not None

        # Second import should return None (result already exists)
        result2 = hl7_service.import_result(hl7_result, test_user)
        assert result2 is None


# ============================================================================
# MLLP Client Tests
# ============================================================================


class TestMLLPMessageFraming:
    """Tests for MLLP message framing."""

    def test_frame_message_adds_delimiters(self):
        """Should add MLLP framing delimiters to message."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        message = "MSH|^~\\&|APP|FAC|||20260131||ORM^O01|MSG001|P|2.5.1"
        framed = client._frame_message(message)

        assert framed.startswith(MLLP_START_BLOCK)
        assert framed.endswith(MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN)
        assert message.encode() in framed

    def test_unframe_message_removes_delimiters(self):
        """Should remove MLLP framing and return message."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        original = "MSH|^~\\&|APP|FAC|||20260131||ACK|MSG001|P|2.5.1"
        framed = MLLP_START_BLOCK + original.encode() + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN

        unframed = client._unframe_message(framed)
        assert unframed == original

    def test_unframe_message_missing_start_raises_error(self):
        """Should raise error when start block is missing."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        bad_frame = b"MSH|^~\\&|" + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN

        with pytest.raises(MLLPFramingError, match="Missing MLLP start block"):
            client._unframe_message(bad_frame)

    def test_unframe_message_missing_end_raises_error(self):
        """Should raise error when end block is missing."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        bad_frame = MLLP_START_BLOCK + b"MSH|^~\\&|" + MLLP_CARRIAGE_RETURN

        with pytest.raises(MLLPFramingError, match="Missing MLLP end block"):
            client._unframe_message(bad_frame)

    def test_unframe_message_empty_raises_error(self):
        """Should raise error for empty data."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        with pytest.raises(MLLPFramingError, match="Empty response"):
            client._unframe_message(b"")


class TestMLLPClientConnection:
    """Tests for MLLP client connection handling."""

    def test_client_initial_state_disconnected(self):
        """Should start in disconnected state."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        assert not client.is_connected
        assert client.state.value == "disconnected"

    def test_client_config_defaults(self):
        """Should use sensible defaults for configuration."""
        config = MLLPConfig(host="lab.example.com", port=2575)

        assert config.timeout == 30.0
        assert config.receive_timeout == 60.0
        assert config.max_retries == 3
        assert config.retry_delay == 1.0
        assert config.use_ssl is False
        assert config.keep_alive is True

    @patch("socket.socket")
    def test_connect_success(self, mock_socket_class):
        """Should successfully connect to MLLP server."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        config = MLLPConfig(host="localhost", port=2575, max_retries=1)
        client = MLLPClient(config)

        client.connect()

        assert client.is_connected
        mock_socket.connect.assert_called_once_with(("localhost", 2575))

    @patch("socket.socket")
    def test_connect_failure_raises_error(self, mock_socket_class):
        """Should raise error after max retries."""
        import socket

        mock_socket = MagicMock()
        mock_socket.connect.side_effect = OSError("Connection refused")
        mock_socket_class.return_value = mock_socket

        config = MLLPConfig(host="localhost", port=2575, max_retries=2, retry_delay=0)
        client = MLLPClient(config)

        with pytest.raises(MLLPConnectionError, match="Failed to connect"):
            client.connect()

        assert client.stats.connection_errors == 2

    @patch("socket.socket")
    def test_disconnect_closes_socket(self, mock_socket_class):
        """Should close socket on disconnect."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        client.connect()
        client.disconnect()

        assert not client.is_connected
        mock_socket.close.assert_called()

    @patch("socket.socket")
    def test_context_manager_connects_and_disconnects(self, mock_socket_class):
        """Should connect on enter and disconnect on exit."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        config = MLLPConfig(host="localhost", port=2575)

        with MLLPClient(config) as client:
            assert client.is_connected

        mock_socket.close.assert_called()


class TestMLLPClientSendReceive:
    """Tests for MLLP send/receive operations."""

    @patch("socket.socket")
    def test_send_message_returns_response(self, mock_socket_class):
        """Should send message and return response."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        # Setup mock response
        response_msg = "MSH|^~\\&|LAB|FAC|||20260131||ACK|ACK001|P|2.5.1\rMSA|AA|MSG001"
        mock_socket.recv.return_value = (
            MLLP_START_BLOCK + response_msg.encode() + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN
        )

        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)
        client.connect()

        response = client.send_message("MSH|^~\\&|APP|||20260131||ORM^O01|MSG001|P|2.5.1")

        assert response is not None
        assert "ACK" in response.message
        assert "AA" in response.message
        assert client.stats.messages_sent == 1
        assert client.stats.messages_received == 1

    @patch("socket.socket")
    def test_send_message_without_ack(self, mock_socket_class):
        """Should send message without waiting for response."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)
        client.connect()

        response = client.send_message(
            "MSH|^~\\&|APP|||20260131||ORM^O01|MSG001|P|2.5.1",
            wait_for_ack=False,
        )

        assert response is None
        assert client.stats.messages_sent == 1
        mock_socket.recv.assert_not_called()

    def test_send_message_not_connected_raises_error(self):
        """Should raise error when not connected."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        with pytest.raises(MLLPConnectionError, match="Not connected"):
            client.send_message("test message")


class TestMLLPClientStatistics:
    """Tests for MLLP client statistics tracking."""

    def test_stats_initial_values(self):
        """Should have zero initial statistics."""
        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)

        stats = client.stats
        assert stats.messages_sent == 0
        assert stats.messages_received == 0
        assert stats.bytes_sent == 0
        assert stats.bytes_received == 0
        assert stats.connection_errors == 0
        assert stats.avg_response_time_ms == 0.0

    @patch("socket.socket")
    def test_stats_bytes_tracking(self, mock_socket_class):
        """Should track bytes sent and received."""
        mock_socket = MagicMock()
        mock_socket_class.return_value = mock_socket

        response_data = MLLP_START_BLOCK + b"MSA|AA|MSG001" + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN
        mock_socket.recv.return_value = response_data

        config = MLLPConfig(host="localhost", port=2575)
        client = MLLPClient(config)
        client.connect()

        client.send_message("MSH|test")

        assert client.stats.bytes_sent > 0
        assert client.stats.bytes_received == len(response_data)


# ============================================================================
# Integration Tests
# ============================================================================


@pytest.mark.django_db
class TestHL7FullWorkflow:
    """Integration tests for complete HL7 workflow."""

    @pytest.fixture
    def hl7_service(self):
        """Create HL7 service instance."""
        return HL7Service()

    @pytest.fixture
    def complete_lab_order(
        self, db, sample_patient, sample_encounter, test_user
    ):
        """Create complete lab order for workflow testing."""
        # Create test catalog
        test_catalog = TestCatalog.objects.create(
            code="GLU",
            name="Glucose",
            short_name="Glu",
            loinc_code="2339-0",
            category="CHEMISTRY",
            specimen_type="BLOOD",
            result_type="NUMERIC",
            result_unit="mg/dL",
            normal_range_male="70-100",
            normal_range_female="70-100",
            cost=Decimal("150.00"),
        )

        # Create order
        order = LabOrder.objects.create(
            patient=sample_patient,
            encounter=sample_encounter,
            ordered_by=test_user,
            order_type="EXTERNAL",
            status="ORDERED",
            priority="ROUTINE",
            clinical_notes="Fasting glucose test",
        )

        # Add test item
        LabOrderItem.objects.create(
            lab_order=order,
            test=test_catalog,
            unit_cost=test_catalog.cost,
        )

        return order

    def test_round_trip_order_to_result(
        self, hl7_service, complete_lab_order, test_user
    ):
        """Should complete full order -> message -> result workflow."""
        # Step 1: Generate order message
        order_message = hl7_service.build_orm_o01(complete_lab_order)
        assert "ORM^O01" in order_message
        assert complete_lab_order.order_number in order_message

        # Step 2: Simulate external lab response
        result_message = (
            f"MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FAC|20260131120000||ORU^R01|RES001|P|2.5.1\r"
            f"ORC|RE|{complete_lab_order.order_number}|EXT-001||CM\r"
            f"OBR|1|{complete_lab_order.order_number}|EXT-001|2339-0^Glucose^LN|||20260131100000\r"
            f"OBX|1|NM|2339-0^Glucose^LN||95|mg/dL|70-100|N|||F\r"
        )

        # Step 3: Parse result message
        parsed_results = hl7_service.parse_oru_r01(result_message)
        assert len(parsed_results) == 1
        assert parsed_results[0].value == "95"

        # Step 4: Import result into database
        imported_result = hl7_service.import_result(parsed_results[0], test_user)
        assert imported_result is not None
        assert imported_result.numeric_value == Decimal("95")
        assert imported_result.result_flag == "NORMAL"

        # Step 5: Verify order item was updated
        order_item = complete_lab_order.items.first()
        order_item.refresh_from_db()
        assert order_item.status == "COMPLETED"

    def test_generate_ack_for_received_result(
        self, hl7_service, complete_lab_order
    ):
        """Should generate appropriate ACK for received result."""
        # Receive result message
        result_message = (
            f"MSH|^~\\&|LAB_LIS|EXT_LAB|VITORA|FAC|20260131120000||ORU^R01|RES001|P|2.5.1\r"
            f"ORC|RE|{complete_lab_order.order_number}|EXT-001||CM\r"
            f"OBR|1|{complete_lab_order.order_number}|EXT-001|2339-0^Glucose^LN|||20260131100000\r"
            f"OBX|1|NM|2339-0^Glucose^LN||95|mg/dL|70-100|N|||F\r"
        )

        # Parse to verify valid
        results = hl7_service.parse_oru_r01(result_message)
        assert len(results) > 0

        # Generate acceptance ACK
        ack = hl7_service.build_ack(
            original_message_control_id="RES001",
            ack_code="AA",
            text_message="Result received and processed",
        )

        assert "ACK" in ack
        assert "AA" in ack
        assert "RES001" in ack

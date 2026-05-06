"""
Tests for Phase L3: Analyzer Interfacing.

Comprehensive test suite covering:
- InstrumentChannel model
- AnalyzerMessage model
- AnalyzerDriverTemplate model
- Protocol adapters (ASTM, HL7, Serial)
- Message processing service
- API endpoints (channels, messages, templates, dashboard)
- Domain events
"""

from datetime import timedelta
from unittest.mock import patch

import pytest  # type: ignore
from django.utils import timezone
from rest_framework import status

from hmis.apps.laboratory.analyzers.models import (
    AnalyzerDriverTemplate,
    AnalyzerMessage,
    InstrumentChannel,
)
from hmis.apps.laboratory.analyzers.protocols.astm_adapter import ASTMAdapter
from hmis.apps.laboratory.analyzers.protocols.base import ChecksumError, FramingError, ParsedMessage
from hmis.apps.laboratory.analyzers.protocols.hl7_adapter import HL7BidirectionalAdapter
from hmis.apps.laboratory.analyzers.protocols.serial_adapter import SerialBridgeAdapter
from hmis.apps.laboratory.analyzers.services import (
    build_work_order,
    check_channel_health,
    get_adapter_for_channel,
    get_pending_work_orders,
    process_inbound_message,
    resolve_lab_order_item,
    resolve_specimen_from_sample_id,
)
from hmis.apps.laboratory.models import (
    Instrument,
    LabOrder,
    LabOrderItem,
    LabResult,
    Specimen,
    TestCatalog,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sample_instrument(db, sample_facility):
    """Create a sample instrument for testing."""
    return Instrument.objects.create(
        code="SYS-XN1000",
        name="Sysmex XN-1000",
        manufacturer="Sysmex",
        model="XN-1000",
        serial_number="SN-12345",
        department="Hematology",
        interface_type="ASTM",
        is_active=True,
        facility=sample_facility,
    )


@pytest.fixture
def sample_channel(db, sample_instrument, sample_facility):
    """Create a sample instrument channel."""
    return InstrumentChannel.objects.create(
        instrument=sample_instrument,
        name="Primary ASTM",
        protocol=InstrumentChannel.Protocol.ASTM,
        direction=InstrumentChannel.Direction.BIDIRECTIONAL,
        host="192.168.1.100",
        port=9100,
        encoding="ascii",
        config={"timeout_ms": 30000, "frame_size": 240},
        field_mapping={
            "sample_id_field": "O.2.0",
            "test_code_field": "R.2.3",
            "result_value_field": "R.3",
        },
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def hl7_channel(db, sample_instrument, sample_facility):
    """Create an HL7 instrument channel."""
    return InstrumentChannel.objects.create(
        instrument=sample_instrument,
        name="HL7 MLLP",
        protocol=InstrumentChannel.Protocol.HL7,
        direction=InstrumentChannel.Direction.BIDIRECTIONAL,
        host="192.168.1.100",
        port=5000,
        encoding="utf-8",
        config={
            "sending_application": "VITORA",
            "sending_facility": "TEST_LAB",
            "receiving_application": "ANALYZER",
            "version": "2.5",
        },
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def sample_test_catalog(db):
    """Create a test catalog entry."""
    return TestCatalog.objects.create(
        code="HGB",
        name="Hemoglobin",
        short_name="HGB",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="g/dL",
        normal_range_male="13.0-17.0",
        normal_range_female="12.0-15.0",
    )


@pytest.fixture
def sample_lab_order(db, sample_patient, sample_facility, sample_encounter, test_user):
    """Create a sample lab order."""
    return LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        status="SPECIMEN_COLLECTED",
        priority="ROUTINE",
        order_type="IN_HOUSE",
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def sample_specimen(db, sample_lab_order):
    """Create a sample specimen."""
    return Specimen.objects.create(
        lab_order=sample_lab_order,
        barcode="SPEC-2026-001",
        specimen_type="BLOOD",
        status="RECEIVED",
    )


@pytest.fixture
def sample_order_item(db, sample_lab_order, sample_test_catalog):
    """Create a sample lab order item."""
    return LabOrderItem.objects.create(
        lab_order=sample_lab_order,
        test=sample_test_catalog,
        status="PENDING",
    )


@pytest.fixture
def sample_driver_template(db):
    """Create a sample driver template."""
    return AnalyzerDriverTemplate.objects.create(
        name="Sysmex XN Series (ASTM)",
        manufacturer="Sysmex",
        model_pattern="XN-*",
        category=AnalyzerDriverTemplate.AnalyzerCategory.HEMATOLOGY,
        protocol=InstrumentChannel.Protocol.ASTM,
        default_port=9100,
        default_encoding="ascii",
        default_config={"timeout_ms": 30000, "frame_size": 240},
        default_field_mapping={"sample_id_field": "O.2", "test_code_field": "R.2"},
        is_active=True,
        notes="Test template",
    )


# =============================================================================
# Model Tests
# =============================================================================


@pytest.mark.django_db
class TestInstrumentChannelModel:
    """Tests for InstrumentChannel model."""

    def test_create_channel(self, sample_channel):
        """Should create channel with all fields."""
        assert sample_channel.name == "Primary ASTM"
        assert sample_channel.protocol == InstrumentChannel.Protocol.ASTM
        assert sample_channel.host == "192.168.1.100"
        assert sample_channel.port == 9100
        assert sample_channel.is_active is True
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.DISCONNECTED

    def test_channel_str(self, sample_channel):
        """String representation should be meaningful."""
        assert "SYS-XN1000" in str(sample_channel)
        assert "Primary ASTM" in str(sample_channel)

    def test_connection_url(self, sample_channel):
        """connection_url property should format host:port."""
        assert sample_channel.connection_url == "192.168.1.100:9100"

    def test_update_status(self, sample_channel):
        """update_status should set status and timestamp."""
        sample_channel.update_status(InstrumentChannel.ConnectionStatus.CONNECTED)
        sample_channel.refresh_from_db()
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.CONNECTED
        assert sample_channel.last_activity_at is not None

    def test_update_status_with_error(self, sample_channel):
        """update_status with error should record the error."""
        sample_channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, "Connection refused")
        sample_channel.refresh_from_db()
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.ERROR
        assert sample_channel.last_error == "Connection refused"

    def test_update_status_connected_clears_error(self, sample_channel):
        """Connecting should clear any previous error."""
        sample_channel.last_error = "Previous error"
        sample_channel.save()
        sample_channel.update_status(InstrumentChannel.ConnectionStatus.CONNECTED)
        sample_channel.refresh_from_db()
        assert sample_channel.last_error == ""

    def test_unique_together_instrument_name(self, sample_instrument, sample_facility):
        """Cannot have two channels with same name for same instrument."""
        InstrumentChannel.objects.create(
            instrument=sample_instrument,
            name="Channel A",
            protocol=InstrumentChannel.Protocol.ASTM,
            host="192.168.1.1",
            port=9100,
            facility=sample_facility,
        )
        with pytest.raises(Exception):
            InstrumentChannel.objects.create(
                instrument=sample_instrument,
                name="Channel A",
                protocol=InstrumentChannel.Protocol.HL7,
                host="192.168.1.2",
                port=5000,
                facility=sample_facility,
            )


@pytest.mark.django_db
class TestAnalyzerMessageModel:
    """Tests for AnalyzerMessage model."""

    def test_create_message(self, sample_channel, sample_facility):
        """Should create message with required fields."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="H|\\^&|||Analyzer|||||||P|20260506",
            status=AnalyzerMessage.Status.RECEIVED,
            facility=sample_facility,
        )
        assert msg.direction == "INBOUND"
        assert msg.status == "RECEIVED"
        assert msg.message_type == AnalyzerMessage.MessageType.RAW

    def test_mark_parsed(self, sample_channel, sample_facility):
        """mark_parsed should update status and parsed_data."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test",
            facility=sample_facility,
        )
        msg.mark_parsed({"test_code": "HGB", "value": "14.5"})
        msg.refresh_from_db()
        assert msg.status == AnalyzerMessage.Status.PARSED
        assert msg.parsed_data["test_code"] == "HGB"
        assert msg.processed_at is not None

    def test_mark_applied(self, sample_channel, sample_facility):
        """mark_applied should update status."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test",
            status=AnalyzerMessage.Status.PARSED,
            facility=sample_facility,
        )
        msg.mark_applied()
        msg.refresh_from_db()
        assert msg.status == AnalyzerMessage.Status.APPLIED

    def test_mark_failed(self, sample_channel, sample_facility):
        """mark_failed should record error."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test",
            facility=sample_facility,
        )
        msg.mark_failed("Checksum error")
        msg.refresh_from_db()
        assert msg.status == AnalyzerMessage.Status.FAILED
        assert msg.error_message == "Checksum error"

    def test_mark_sent(self, sample_channel, sample_facility):
        """mark_sent should update outbound message status."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            raw_data="order data",
            status=AnalyzerMessage.Status.PENDING,
            facility=sample_facility,
        )
        msg.mark_sent()
        msg.refresh_from_db()
        assert msg.status == AnalyzerMessage.Status.SENT

    def test_mark_timeout(self, sample_channel, sample_facility):
        """mark_timeout should update status."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            raw_data="test",
            facility=sample_facility,
        )
        msg.mark_timeout()
        msg.refresh_from_db()
        assert msg.status == AnalyzerMessage.Status.TIMEOUT


@pytest.mark.django_db
class TestAnalyzerDriverTemplateModel:
    """Tests for AnalyzerDriverTemplate model."""

    def test_create_template(self, sample_driver_template):
        """Should create template with all fields."""
        assert sample_driver_template.name == "Sysmex XN Series (ASTM)"
        assert sample_driver_template.manufacturer == "Sysmex"
        assert sample_driver_template.protocol == InstrumentChannel.Protocol.ASTM

    def test_apply_to_channel(self, sample_driver_template, sample_channel):
        """apply_to_channel should update channel config."""
        sample_channel.config = {"custom_setting": True}
        sample_channel.field_mapping = {}
        sample_channel.save()

        sample_driver_template.apply_to_channel(sample_channel)
        sample_channel.refresh_from_db()

        assert sample_channel.protocol == InstrumentChannel.Protocol.ASTM
        assert sample_channel.port == 9100
        assert sample_channel.encoding == "ascii"
        # Should merge (template defaults + existing custom)
        assert "timeout_ms" in sample_channel.config
        assert sample_channel.config["custom_setting"] is True


# =============================================================================
# Protocol Adapter Tests
# =============================================================================


class TestASTMAdapter:
    """Tests for ASTM E1394/LIS2-A2 protocol adapter."""

    def setup_method(self):
        self.adapter = ASTMAdapter(
            config={"timeout_ms": 30000, "frame_size": 240},
            field_mapping={},
        )

    def test_parse_result_message(self):
        """Should parse ASTM result record."""
        raw = "H|\\^&|||Analyzer\rP|1|PAT001\rO|1|SPEC001||^^^HGB\rR|1|^^^HGB|14.5|g/dL||H\rL|1|N"
        parsed = self.adapter.parse_message(raw)
        assert parsed.message_type == "RESULT"
        assert parsed.sample_id == "SPEC001"
        assert parsed.test_code == "HGB"
        assert parsed.result_value == "14.5"
        assert parsed.result_unit == "g/dL"
        assert parsed.result_flags == "H"
        assert parsed.patient_id == "PAT001"

    def test_parse_query_message(self):
        """Should parse ASTM query record."""
        raw = "H|\\^&|||Analyzer\rQ|1|^SPEC-2026-001||\rL|1|N"
        parsed = self.adapter.parse_message(raw)
        assert parsed.message_type == "QUERY"
        assert parsed.sample_id == "SPEC-2026-001"

    def test_parse_empty_message(self):
        """Should return error for empty data."""
        parsed = self.adapter.parse_message("")
        assert parsed.has_errors

    def test_build_order_message(self):
        """Should build valid ASTM order message."""
        msg = self.adapter.build_order_message(
            sample_id="SPEC-001",
            test_codes=["HGB", "WBC", "PLT"],
            patient_id="PAT123",
            priority="STAT",
        )
        assert "SPEC-001" in msg
        assert "^^^HGB" in msg
        assert "^^^WBC" in msg
        assert "^^^PLT" in msg
        assert "PAT123" in msg
        assert "S" in msg  # STAT priority

    def test_build_ack(self):
        """Should return ACK character."""
        assert self.adapter.build_ack(True) == "\x06"
        assert self.adapter.build_ack(False) == "\x15"

    def test_frame_message(self):
        """Should frame with STX/ETX/checksum."""
        framed = self.adapter.frame_message("H|\\^&|||Analyzer")
        assert framed[0:1] == b"\x02"  # STX
        # Should end with CR LF
        assert framed[-2:] == b"\x0d\x0a"

    def test_unframe_message(self):
        """Should unframe and validate checksum."""
        # Frame a message first
        msg = "H|\\^&|||Analyzer"
        framed = self.adapter.frame_message(msg)
        # Unframe it
        result = self.adapter.unframe_message(framed)
        assert result == msg

    def test_unframe_control_chars(self):
        """Should handle single control characters."""
        assert self.adapter.unframe_message(b"\x06") == "\x06"  # ACK
        assert self.adapter.unframe_message(b"\x15") == "\x15"  # NAK
        assert self.adapter.unframe_message(b"\x05") == "\x05"  # ENQ

    def test_validate_valid_message(self):
        """Should validate well-formed ASTM message."""
        assert self.adapter.validate_message("H|\\^&|||Test\rR|1|HGB|14.5\rL|1|N")

    def test_validate_invalid_record_type(self):
        """Should reject invalid record types."""
        assert not self.adapter.validate_message("X|invalid record type")

    def test_checksum_calculation(self):
        """Checksum should be mod-256 of bytes, 2 hex chars."""
        cs = ASTMAdapter._calculate_checksum("1H|\\^&|||Test\x03")
        assert len(cs) == 2
        assert all(c in "0123456789ABCDEF" for c in cs)

    def test_parse_with_custom_delimiters(self):
        """Should respect custom delimiters from config."""
        adapter = ASTMAdapter(
            config={"field_delimiter": "#", "component_delimiter": "~"},
            field_mapping={},
        )
        raw = "H#\\~&#Sender\rR#1#~~~HGB#14.5#g/dL\rL#1#N"
        parsed = adapter.parse_message(raw)
        assert parsed.message_type == "RESULT"
        assert parsed.test_code == "HGB"


class TestHL7BidirectionalAdapter:
    """Tests for HL7 v2.x bidirectional adapter."""

    def setup_method(self):
        self.adapter = HL7BidirectionalAdapter(
            config={
                "sending_application": "VITORA",
                "sending_facility": "TEST_LAB",
                "receiving_application": "ANALYZER",
                "version": "2.5",
            },
            field_mapping={},
        )

    def test_parse_oru_result(self):
        """Should parse ORU^R01 result message."""
        msg = (
            "MSH|^~\\&|ANALYZER|LAB|VITORA|TEST_LAB|20260506120000||ORU^R01|MSG001|P|2.5\r"
            "PID|||PAT001||\r"
            "OBR|1|ORD001|SPEC001|HGB|||||||||||\r"
            "OBX|1|NM|HGB^Hemoglobin||14.5|g/dL|12.0-17.0|H|||F"
        )
        parsed = self.adapter.parse_message(msg)
        assert parsed.message_type == "RESULT"
        assert parsed.test_code == "HGB"
        assert parsed.result_value == "14.5"
        assert parsed.result_unit == "g/dL"
        assert parsed.result_flags == "H"
        assert parsed.patient_id == "PAT001"
        assert parsed.sample_id == "SPEC001"

    def test_parse_orm_order(self):
        """Should parse ORM^O01 order message."""
        msg = (
            "MSH|^~\\&|ANALYZER|LAB|VITORA|TEST_LAB|20260506||ORM^O01|MSG002|P|2.5\r"
            "ORC|NW|SPEC001|||R\r"
            "OBR|1|SPEC001||CBC"
        )
        parsed = self.adapter.parse_message(msg)
        assert parsed.message_type == "ORDER"
        assert parsed.sample_id == "SPEC001"

    def test_parse_query_message(self):
        """Should parse QBP query message."""
        msg = (
            "MSH|^~\\&|ANALYZER|LAB|VITORA|TEST_LAB|20260506||QBP^Q11|MSG003|P|2.5\r"
            "QPD|QRY001||SPEC001"
        )
        parsed = self.adapter.parse_message(msg)
        assert parsed.message_type == "QUERY"
        assert parsed.sample_id == "SPEC001"

    def test_parse_invalid_message(self):
        """Should handle invalid messages gracefully."""
        parsed = self.adapter.parse_message("not a valid hl7 message")
        assert parsed.message_type == "RAW"
        assert parsed.has_errors

    def test_build_order_message(self):
        """Should build valid ORM^O01 message."""
        msg = self.adapter.build_order_message(
            sample_id="SPEC-001",
            test_codes=["HGB", "WBC"],
            patient_id="PAT001",
            priority="STAT",
        )
        assert "ORM^O01" in msg
        assert "SPEC-001" in msg
        assert "PAT001" in msg
        assert "HGB" in msg
        assert "WBC" in msg

    def test_build_ack_success(self):
        """Should build AA (Application Accept) ACK."""
        ack = self.adapter.build_ack(True)
        assert "ACK^R01" in ack
        assert "AA" in ack

    def test_build_ack_error(self):
        """Should build AE (Application Error) ACK."""
        ack = self.adapter.build_ack(False)
        assert "AE" in ack

    def test_frame_message_mllp(self):
        """Should apply MLLP framing."""
        framed = self.adapter.frame_message("MSH|^~\\&|TEST")
        assert framed[0:1] == b"\x0b"  # VT start
        assert b"\x1c" in framed  # FS end
        assert framed[-1:] == b"\x0d"  # CR

    def test_unframe_message_mllp(self):
        """Should remove MLLP framing."""
        framed = self.adapter.frame_message("MSH|^~\\&|TEST|LAB")
        unframed = self.adapter.unframe_message(framed)
        assert unframed == "MSH|^~\\&|TEST|LAB"

    def test_validate_valid_message(self):
        """Should validate well-formed HL7 message."""
        msg = "MSH|^~\\&|APP|FAC|APP2|FAC2|20260506||ORU^R01|1|P|2.5"
        assert self.adapter.validate_message(msg)

    def test_validate_invalid_message(self):
        """Should reject invalid messages."""
        assert not self.adapter.validate_message("NOT|MSH")
        assert not self.adapter.validate_message("")


class TestSerialBridgeAdapter:
    """Tests for Serial/RS-232 bridge adapter."""

    def setup_method(self):
        self.adapter = SerialBridgeAdapter(
            config={
                "baud_rate": 9600,
                "data_bits": 8,
                "parity": "N",
                "stop_bits": 1,
                "bridge_type": "transparent",
                "underlying_protocol": "ASTM",
            },
            field_mapping={},
        )

    def test_parse_delegates_to_astm(self):
        """Should delegate parsing to ASTM adapter."""
        raw = "H|\\^&|||Analyzer\rR|1|^^^HGB|14.5|g/dL||H\rL|1|N"
        parsed = self.adapter.parse_message(raw)
        assert parsed.message_type == "RESULT"
        assert parsed.result_value == "14.5"

    def test_build_order_delegates(self):
        """Should delegate order building to ASTM adapter."""
        msg = self.adapter.build_order_message("SPEC-001", ["HGB"])
        assert "SPEC-001" in msg

    def test_serial_config_summary(self):
        """Should return human-readable serial config."""
        assert self.adapter.serial_config_summary == "9600-8-N-1"

    def test_frame_delegates_to_astm(self):
        """Should apply ASTM framing for transparent bridge."""
        framed = self.adapter.frame_message("H|\\^&|||Test")
        assert framed[0:1] == b"\x02"  # STX from ASTM framing

    def test_raw_mode(self):
        """Should handle raw mode (no underlying protocol)."""
        adapter = SerialBridgeAdapter(
            config={"bridge_type": "transparent", "underlying_protocol": "RAW"},
            field_mapping={},
        )
        parsed = adapter.parse_message("some raw data\r\nmore data")
        assert parsed.message_type == "RAW"


# =============================================================================
# Service Tests
# =============================================================================


@pytest.mark.django_db
class TestAdapterResolution:
    """Tests for get_adapter_for_channel."""

    def test_astm_channel(self, sample_channel):
        """Should return ASTMAdapter for ASTM channels."""
        adapter = get_adapter_for_channel(sample_channel)
        assert isinstance(adapter, ASTMAdapter)

    def test_hl7_channel(self, hl7_channel):
        """Should return HL7BidirectionalAdapter for HL7 channels."""
        adapter = get_adapter_for_channel(hl7_channel)
        assert isinstance(adapter, HL7BidirectionalAdapter)

    def test_serial_channel(self, sample_instrument, sample_facility):
        """Should return SerialBridgeAdapter for SERIAL channels."""
        channel = InstrumentChannel.objects.create(
            instrument=sample_instrument,
            name="Serial",
            protocol=InstrumentChannel.Protocol.SERIAL,
            host="192.168.1.50",
            port=4001,
            config={"underlying_protocol": "ASTM"},
            facility=sample_facility,
        )
        adapter = get_adapter_for_channel(channel)
        assert isinstance(adapter, SerialBridgeAdapter)


@pytest.mark.django_db
class TestSpecimenResolution:
    """Tests for resolve_specimen_from_sample_id."""

    def test_resolve_by_barcode(self, sample_specimen, sample_facility):
        """Should find specimen by exact barcode."""
        result = resolve_specimen_from_sample_id("SPEC-2026-001", sample_facility.id)
        assert result == sample_specimen

    def test_resolve_not_found(self, sample_facility):
        """Should return None for unknown barcode."""
        result = resolve_specimen_from_sample_id("UNKNOWN", sample_facility.id)
        assert result is None

    def test_resolve_empty_id(self):
        """Should return None for empty sample ID."""
        result = resolve_specimen_from_sample_id("")
        assert result is None


@pytest.mark.django_db
class TestLabOrderItemResolution:
    """Tests for resolve_lab_order_item."""

    def test_resolve_by_test_code(self, sample_specimen, sample_order_item):
        """Should find order item by test code."""
        result = resolve_lab_order_item(sample_specimen, "HGB")
        assert result == sample_order_item

    def test_resolve_not_found(self, sample_specimen):
        """Should return None for unknown test code."""
        result = resolve_lab_order_item(sample_specimen, "UNKNOWN")
        assert result is None

    def test_resolve_none_specimen(self):
        """Should return None if specimen is None."""
        result = resolve_lab_order_item(None, "HGB")
        assert result is None


@pytest.mark.django_db
class TestProcessInboundMessage:
    """Tests for process_inbound_message."""

    def test_process_result_message(
        self, sample_channel, sample_specimen, sample_order_item, sample_facility
    ):
        """Should parse result and apply it."""
        raw = "H|\\^&|||Analyzer\rP|1|\rO|1|SPEC-2026-001||^^^HGB\rR|1|^^^HGB|14.5|g/dL||H\rL|1|N"
        msg = process_inbound_message(sample_channel, raw)

        assert msg.status == AnalyzerMessage.Status.APPLIED
        assert msg.sample_id == "SPEC-2026-001"
        assert msg.test_code == "HGB"
        assert msg.result_value == "14.5"
        assert msg.specimen == sample_specimen

        # Verify LabResult was created
        lab_result = LabResult.objects.filter(order_item=sample_order_item).first()
        assert lab_result is not None
        assert lab_result.numeric_value == pytest.approx(14.5)
        assert lab_result.result_flag == "HIGH"

    def test_process_query_message(self, sample_channel):
        """Should parse query message without applying results."""
        raw = "H|\\^&|||Analyzer\rQ|1|^SPEC-001||\rL|1|N"
        msg = process_inbound_message(sample_channel, raw)

        assert msg.message_type == AnalyzerMessage.MessageType.QUERY
        assert msg.sample_id == "SPEC-001"
        # Query should not fail even if specimen not found
        assert msg.status in [
            AnalyzerMessage.Status.PARSED,
            AnalyzerMessage.Status.RECEIVED,
        ]

    def test_process_unparseable_message(self, sample_channel):
        """Should mark message as failed on parse error."""
        raw = ""  # Empty = unparseable
        msg = process_inbound_message(sample_channel, raw)
        assert msg.status == AnalyzerMessage.Status.FAILED

    def test_channel_status_updated(self, sample_channel):
        """Should update channel to CONNECTED on successful message."""
        raw = "H|\\^&|||Analyzer\rR|1|^^^HGB|14.5|g/dL||H\rL|1|N"
        process_inbound_message(sample_channel, raw)
        sample_channel.refresh_from_db()
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.CONNECTED


@pytest.mark.django_db
class TestBuildWorkOrder:
    """Tests for build_work_order."""

    def test_build_order_for_specimen(self, sample_channel, sample_specimen, sample_order_item):
        """Should generate work order message."""
        msg = build_work_order(sample_channel, sample_specimen)
        assert msg is not None
        assert msg.direction == AnalyzerMessage.Direction.OUTBOUND
        assert msg.message_type == AnalyzerMessage.MessageType.ORDER_DOWNLOAD
        assert msg.status == AnalyzerMessage.Status.PENDING
        assert sample_specimen.barcode in msg.raw_data

    def test_no_order_for_completed_items(self, sample_channel, sample_specimen, sample_order_item):
        """Should return None if all items are completed."""
        sample_order_item.status = "COMPLETED"
        sample_order_item.save()
        msg = build_work_order(sample_channel, sample_specimen)
        assert msg is None


@pytest.mark.django_db
class TestChannelHealth:
    """Tests for check_channel_health."""

    def test_health_check(self, sample_channel, sample_facility):
        """Should return health status dict."""
        health = check_channel_health(sample_channel)
        assert health["channel_id"] == sample_channel.id
        assert health["instrument_code"] == "SYS-XN1000"
        assert "messages_last_hour" in health
        assert "is_healthy" in health

    def test_idle_detection(self, sample_channel):
        """Should mark connected channel as idle if no recent activity."""
        sample_channel.connection_status = InstrumentChannel.ConnectionStatus.CONNECTED
        sample_channel.last_activity_at = timezone.now() - timedelta(hours=1)
        sample_channel.config = {"idle_timeout_minutes": 30}
        sample_channel.save()

        check_channel_health(sample_channel)
        sample_channel.refresh_from_db()
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.IDLE


# =============================================================================
# API Endpoint Tests
# =============================================================================


@pytest.mark.django_db
class TestInstrumentChannelAPI:
    """Tests for InstrumentChannel API endpoints."""

    def test_list_channels(self, authenticated_client, sample_channel):
        """Should list channels for facility."""
        response = authenticated_client.get("/api/lab/analyzers/channels/")
        assert response.status_code == status.HTTP_200_OK

    def test_create_channel(self, authenticated_client, sample_instrument):
        """Should create a new channel."""
        data = {
            "instrument": sample_instrument.id,
            "name": "New Channel",
            "protocol": "ASTM",
            "direction": "BIDIRECTIONAL",
            "host": "192.168.1.200",
            "port": 9200,
        }
        response = authenticated_client.post("/api/lab/analyzers/channels/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "New Channel"

    def test_create_channel_invalid_port(self, authenticated_client, sample_instrument):
        """Should reject invalid port numbers."""
        data = {
            "instrument": sample_instrument.id,
            "name": "Bad Port",
            "protocol": "ASTM",
            "host": "192.168.1.1",
            "port": 99999,
        }
        response = authenticated_client.post("/api/lab/analyzers/channels/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_retrieve_channel_detail(self, authenticated_client, sample_channel):
        """Should return full channel detail."""
        response = authenticated_client.get(f"/api/lab/analyzers/channels/{sample_channel.id}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["connection_url"] == "192.168.1.100:9100"

    def test_update_channel(self, authenticated_client, sample_channel):
        """Should update channel config."""
        response = authenticated_client.patch(
            f"/api/lab/analyzers/channels/{sample_channel.id}/",
            {"host": "10.0.0.50"},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK

    def test_apply_template(self, authenticated_client, sample_channel, sample_driver_template):
        """Should apply driver template to channel."""
        response = authenticated_client.post(
            f"/api/lab/analyzers/channels/{sample_channel.id}/apply_template/",
            {"template_id": sample_driver_template.id},
        )
        assert response.status_code == status.HTTP_200_OK

    def test_channel_health(self, authenticated_client, sample_channel):
        """Should return channel health status."""
        response = authenticated_client.get(
            f"/api/lab/analyzers/channels/{sample_channel.id}/health/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "connection_status" in response.data

    def test_disconnect_channel(self, authenticated_client, sample_channel):
        """Should disconnect channel."""
        response = authenticated_client.post(
            f"/api/lab/analyzers/channels/{sample_channel.id}/disconnect/"
        )
        assert response.status_code == status.HTTP_200_OK
        sample_channel.refresh_from_db()
        assert sample_channel.connection_status == InstrumentChannel.ConnectionStatus.DISCONNECTED

    def test_unauthenticated_access(self, api_client, sample_channel):
        """Should reject unauthenticated requests."""
        response = api_client.get("/api/lab/analyzers/channels/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAnalyzerMessageAPI:
    """Tests for AnalyzerMessage API endpoints."""

    def test_list_messages(self, authenticated_client, sample_channel, sample_facility):
        """Should list messages."""
        AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test message",
            facility=sample_facility,
        )
        response = authenticated_client.get("/api/lab/analyzers/messages/")
        assert response.status_code == status.HTTP_200_OK

    def test_ingest_message(self, authenticated_client, sample_channel):
        """Should ingest and process raw message."""
        data = {
            "channel_id": sample_channel.id,
            "raw_data": "H|\\^&|||Analyzer\rR|1|^^^HGB|14.5|g/dL||N\rL|1|N",
        }
        response = authenticated_client.post(
            "/api/lab/analyzers/messages/ingest/", data, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["message_type"] == "RESULT"

    def test_ingest_invalid_channel(self, authenticated_client):
        """Should reject message for invalid channel."""
        data = {"channel_id": 99999, "raw_data": "test"}
        response = authenticated_client.post(
            "/api/lab/analyzers/messages/ingest/", data, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_filter_by_direction(self, authenticated_client, sample_channel, sample_facility):
        """Should filter messages by direction."""
        AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="inbound",
            facility=sample_facility,
        )
        AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            raw_data="outbound",
            facility=sample_facility,
        )
        response = authenticated_client.get("/api/lab/analyzers/messages/?direction=INBOUND")
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestDriverTemplateAPI:
    """Tests for AnalyzerDriverTemplate API endpoints."""

    def test_list_templates(self, authenticated_client, sample_driver_template):
        """Should list active templates."""
        response = authenticated_client.get("/api/lab/analyzers/templates/")
        assert response.status_code == status.HTTP_200_OK

    def test_filter_by_manufacturer(self, authenticated_client, sample_driver_template):
        """Should filter templates by manufacturer."""
        response = authenticated_client.get("/api/lab/analyzers/templates/?manufacturer=Sysmex")
        assert response.status_code == status.HTTP_200_OK

    def test_retrieve_template_detail(self, authenticated_client, sample_driver_template):
        """Should return full template detail."""
        response = authenticated_client.get(
            f"/api/lab/analyzers/templates/{sample_driver_template.id}/"
        )
        assert response.status_code == status.HTTP_200_OK
        assert "default_config" in response.data
        assert "default_field_mapping" in response.data


@pytest.mark.django_db
class TestAnalyzerDashboardAPI:
    """Tests for analyzer dashboard endpoint."""

    def test_dashboard_view(self, authenticated_client, sample_channel):
        """Should return dashboard summary."""
        response = authenticated_client.get("/api/lab/analyzers/dashboard/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_channels" in response.data
        assert "connected_channels" in response.data
        assert "channel_statuses" in response.data

    def test_dashboard_unauthenticated(self, api_client):
        """Should reject unauthenticated access."""
        response = api_client.get("/api/lab/analyzers/dashboard/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


# =============================================================================
# Domain Event Tests
# =============================================================================


@pytest.mark.django_db
class TestAnalyzerEvents:
    """Tests for analyzer domain events."""

    @patch("hmis.apps.laboratory.analyzers.signals.publish_event")
    def test_message_created_publishes_event(self, mock_publish, sample_channel, sample_facility):
        """Should publish event when analyzer message is created."""
        AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test",
            facility=sample_facility,
        )
        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert "laboratory.analyzer.message_received" in str(call_args)

    @patch("hmis.apps.laboratory.analyzers.signals.publish_event")
    def test_message_applied_publishes_event(self, mock_publish, sample_channel, sample_facility):
        """Should publish event when result is applied."""
        msg = AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            raw_data="test",
            status=AnalyzerMessage.Status.PARSED,
            facility=sample_facility,
        )
        mock_publish.reset_mock()
        msg.mark_applied()
        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert "laboratory.analyzer.result_applied" in str(call_args)

    @patch("hmis.apps.laboratory.analyzers.signals.publish_event")
    def test_channel_error_publishes_event(self, mock_publish, sample_channel):
        """Should publish event when channel enters error state."""
        mock_publish.reset_mock()
        sample_channel.update_status(InstrumentChannel.ConnectionStatus.ERROR, "Connection lost")
        mock_publish.assert_called()
        call_args = mock_publish.call_args
        assert "laboratory.analyzer.channel_status_changed" in str(call_args)


# =============================================================================
# Celery Task Tests
# =============================================================================


@pytest.mark.django_db
class TestAnalyzerTasks:
    """Tests for analyzer Celery tasks."""

    def test_check_channel_health_task(self, sample_channel):
        """Should check health for all active channels."""
        from hmis.apps.laboratory.analyzers.tasks import check_all_channel_health

        result = check_all_channel_health()
        assert result["checked"] >= 1

    def test_retry_failed_messages_task(self, sample_channel, sample_facility):
        """Should increment retry count on failed messages."""
        from hmis.apps.laboratory.analyzers.tasks import retry_failed_messages

        AnalyzerMessage.objects.create(
            channel=sample_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            raw_data="failed msg",
            status=AnalyzerMessage.Status.FAILED,
            retry_count=0,
            facility=sample_facility,
        )
        result = retry_failed_messages()
        assert result["attempted"] == 1
        assert result["success"] == 1

    def test_broadcast_work_orders_task(self, sample_channel):
        """Should run without error even with no pending orders."""
        from hmis.apps.laboratory.analyzers.tasks import broadcast_work_orders

        result = broadcast_work_orders()
        assert "channels_checked" in result

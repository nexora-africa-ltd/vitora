# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Simulator-backed integration tests for analyzer HL7 outbound transmission worker.

How to run:
  poetry run pytest tests/laboratory/test_analyzer_hl7_roundtrip.py -q

Supported inputs:
  - Local TCP/MLLP simulator responses for QCK^Q02 and DSR^Q03 roundtrip flows.
"""

from __future__ import annotations

import socket
import threading
from contextlib import closing

import pytest  # type: ignore

from hmis.apps.laboratory.analyzers.models import AnalyzerMessage, InstrumentChannel
from hmis.apps.laboratory.analyzers.services import (
    dispatch_pending_outbound_messages,
    process_inbound_message,
)
from hmis.apps.laboratory.models import Instrument, LabOrder, LabOrderItem, Specimen, TestCatalog


class _MLLPRoundtripSimulator:
    """Tiny TCP server that accepts MLLP-framed messages and returns ACK frames."""

    def __init__(self):
        self._stop = threading.Event()
        self.received_messages: list[str] = []
        self._thread: threading.Thread | None = None
        self.port = self._reserve_port()

    def _reserve_port(self) -> int:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.bind(("127.0.0.1", 0))
            sock.listen(1)
            return sock.getsockname()[1]

    def start(self) -> None:
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        try:
            with closing(socket.create_connection(("127.0.0.1", self.port), timeout=0.2)):
                pass
        except OSError:
            pass
        if self._thread:
            self._thread.join(timeout=2)

    def _serve(self) -> None:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as server:
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind(("127.0.0.1", self.port))
            server.listen(5)
            server.settimeout(0.2)

            while not self._stop.is_set():
                try:
                    conn, _ = server.accept()
                except TimeoutError:
                    continue
                with closing(conn):
                    conn.settimeout(2)
                    payload = self._recv_mllp(conn)
                    if not payload:
                        continue
                    self.received_messages.append(payload)
                    ack_message = self._build_ack_for(payload)
                    conn.sendall(self._frame_mllp(ack_message))

    @staticmethod
    def _frame_mllp(message: str) -> bytes:
        return b"\x0b" + message.encode("utf-8") + b"\x1c\x0d"

    @staticmethod
    def _recv_mllp(conn: socket.socket) -> str:
        data = b""
        while b"\x1c\x0d" not in data:
            chunk = conn.recv(4096)
            if not chunk:
                break
            data += chunk

        if b"\x0b" not in data or b"\x1c" not in data:
            return ""

        start = data.index(b"\x0b") + 1
        end = data.index(b"\x1c")
        return data[start:end].decode("utf-8", errors="replace")

    @staticmethod
    def _extract_message_control_id(message: str) -> str:
        msh = message.split("\r")[0].split("|")
        return msh[9] if len(msh) > 9 else "UNKNOWN"

    def _build_ack_for(self, inbound: str) -> str:
        control_id = self._extract_message_control_id(inbound)
        if "DSR^Q03" in inbound:
            return (
                "MSH|^~\\&|SIM|LIS|VITORA|LAB|20260908120000||ACK^Q03|SIMACK1|P|2.3.1\r"
                f"MSA|AA|{control_id}"
            )

        return (
            "MSH|^~\\&|SIM|LIS|VITORA|LAB|20260908120000||QCK^Q02|SIMQCK1|P|2.3.1\r"
            f"MSA|AA|{control_id}\r"
            "QAK|1|OK"
        )


@pytest.fixture
def hl7_roundtrip_channel(db, sample_facility):
    instrument = Instrument.objects.create(
        code="GOLD-01",
        name="Goldsite Analyzer",
        manufacturer="Goldsite",
        model="Automatic Zoom",
        serial_number="GS-1001",
        department="Chemistry",
        interface_type="HL7",
        is_active=True,
        facility=sample_facility,
    )
    return InstrumentChannel.objects.create(
        instrument=instrument,
        name="Goldsite HL7",
        protocol=InstrumentChannel.Protocol.HL7,
        direction=InstrumentChannel.Direction.BIDIRECTIONAL,
        host="127.0.0.1",
        port=2575,
        encoding="utf-8",
        config={
            "sending_application": "VITORA",
            "sending_facility": "LAB",
            "receiving_application": "GOLSITE",
            "receiving_facility": "AA",
            "version": "2.3.1",
            "timeout": 3,
            "receive_timeout": 3,
            "max_retries": 1,
        },
        is_active=True,
        facility=sample_facility,
        organization=sample_facility.organization,
    )


@pytest.fixture
def hl7_specimen_context(db, sample_patient, sample_facility, sample_encounter, test_user):
    catalog = TestCatalog.objects.create(
        code="HGB",
        name="Hemoglobin",
        short_name="HGB",
        category="HEMATOLOGY",
        specimen_type="BLOOD",
        result_type="NUMERIC",
        result_unit="g/dL",
    )
    order = LabOrder.objects.create(
        patient=sample_patient,
        encounter=sample_encounter,
        ordered_by=test_user,
        status="SPECIMEN_COLLECTED",
        priority="ROUTINE",
        order_type="IN_HOUSE",
        facility=sample_facility,
        organization=sample_facility.organization,
    )
    specimen = Specimen.objects.create(
        lab_order=order,
        barcode="GS-BC-001",
        specimen_type="BLOOD",
        status="RECEIVED",
    )
    LabOrderItem.objects.create(lab_order=order, test=catalog, status="PENDING")
    return specimen


@pytest.mark.django_db
def test_goldsite_roundtrip_qry_qck_dsr_ack_q03(hl7_roundtrip_channel, hl7_specimen_context):
    simulator = _MLLPRoundtripSimulator()
    hl7_roundtrip_channel.port = simulator.port
    hl7_roundtrip_channel.save(update_fields=["port"])
    simulator.start()

    try:
        process_inbound_message(
            hl7_roundtrip_channel,
            (
                "MSH|^~\\&|GOLSITE|AA|VITORA|LAB|20260908110000||QRY^Q02|MSG100|P|2.3.1\r"
                f"QRD|20260908110000|R|D|1|||RD|{hl7_specimen_context.barcode}|OTH|||T\r"
                "QRF|AA|||||RCT|COR|ALL"
            ),
        )

        pending = AnalyzerMessage.objects.filter(
            channel=hl7_roundtrip_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            status=AnalyzerMessage.Status.PENDING,
            sample_id=hl7_specimen_context.barcode,
        )
        assert pending.count() >= 2

        dispatch_result = dispatch_pending_outbound_messages(channel_id=hl7_roundtrip_channel.id)
        assert dispatch_result["attempted"] >= 2
        assert dispatch_result["sent"] >= 2
        assert dispatch_result["acked"] >= 2

        sent_messages = AnalyzerMessage.objects.filter(
            channel=hl7_roundtrip_channel,
            direction=AnalyzerMessage.Direction.OUTBOUND,
            sample_id=hl7_specimen_context.barcode,
            status=AnalyzerMessage.Status.SENT,
        )
        assert sent_messages.count() >= 2

        inbound_acks = AnalyzerMessage.objects.filter(
            channel=hl7_roundtrip_channel,
            direction=AnalyzerMessage.Direction.INBOUND,
            message_type=AnalyzerMessage.MessageType.ACK_HL7,
            sample_id=hl7_specimen_context.barcode,
        )
        assert inbound_acks.count() >= 2
        assert any("ACK^Q03" in msg.raw_data for msg in inbound_acks)
        assert any("QCK^Q02" in msg for msg in simulator.received_messages)
        assert any("DSR^Q03" in msg for msg in simulator.received_messages)
    finally:
        simulator.stop()

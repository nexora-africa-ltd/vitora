# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
HL7 v2.x Bidirectional Protocol Adapter.

Enhanced HL7 adapter supporting bidirectional communication:
- Inbound ORU^R01 (results from analyzer)
- Outbound ORM^O01 (orders to analyzer)
- Host query/response for work order download
- ACK/NAK generation

Builds on existing HL7 app infrastructure but adds bidirectional
capabilities for direct analyzer communication (vs. external LIS routing).
"""

import logging
from datetime import datetime

from .base import ParsedMessage, ProtocolAdapter

logger = logging.getLogger(__name__)

# MLLP framing characters
MLLP_START = "\x0b"  # VT (Vertical Tab)
MLLP_END = "\x1c"  # FS (File Separator)
MLLP_CR = "\x0d"  # CR


class HL7BidirectionalAdapter(ProtocolAdapter):
    """
    HL7 v2.x bidirectional protocol adapter for analyzer communication.

    Handles MLLP framing and HL7 message parsing/construction for
    direct instrument interfacing.
    """

    FIELD_SEPARATOR = "|"
    COMPONENT_SEPARATOR = "^"
    REPEAT_SEPARATOR = "~"
    ESCAPE_CHARACTER = "\\"
    SUBCOMPONENT_SEPARATOR = "&"

    def __init__(self, config: dict, field_mapping: dict):
        super().__init__(config, field_mapping)
        self.sending_application = config.get("sending_application", "VITORA")
        self.sending_facility = config.get("sending_facility", "VITORA_LAB")
        self.receiving_application = config.get("receiving_application", "")
        self.receiving_facility = config.get("receiving_facility", "")
        self.version = config.get("version", "2.5")
        self.ack_mode = config.get("ack_mode", "AL")  # AL=Always, NE=Never, ER=Error only

    def parse_message(self, raw_data: str) -> ParsedMessage:
        """
        Parse an HL7 v2.x message into structured data.

        Handles ORU^R01 (results), ORM^O01 (orders), QRY (queries), ACK.
        """
        # Remove MLLP framing if present
        content = raw_data.strip(MLLP_START + MLLP_END + MLLP_CR)

        segments = self._split_segments(content)
        if not segments:
            return ParsedMessage(message_type="RAW", errors=["No HL7 segments found"])

        # Parse MSH segment
        msh = self._parse_segment(segments[0])
        if not msh or msh.get("segment_type") != "MSH":
            return ParsedMessage(message_type="RAW", errors=["Invalid or missing MSH segment"])

        # Determine message type from MSH-9
        # In our field dict, MSH fields are indexed from 2 (since MSH-1 is | and MSH-2 is encoding)
        # So MSH-9 (message type) is at dict key "8"
        msh_fields = msh.get("fields", {})
        msg_type_field = msh_fields.get("8", "")
        msg_type = self._determine_message_type(msg_type_field)
        message_control_id = msh_fields.get("9", "")
        goldsite_result_type = msh_fields.get("15", "")

        # Extract data based on message type
        sample_id = ""
        test_code = ""
        result_value = ""
        result_unit = ""
        result_flags = ""
        patient_id = ""
        order_id = ""
        timestamp = ""
        raw_fields = {
            "MSH": msh,
            "meta": {
                "message_control_id": message_control_id,
                "message_type": msg_type_field,
                "goldsite_result_type": goldsite_result_type,
            },
        }

        for segment_str in segments[1:]:
            seg = self._parse_segment(segment_str)
            if not seg:
                continue

            seg_type = seg.get("segment_type", "")
            fields = seg.get("fields", {})
            raw_fields[seg_type] = fields

            if seg_type == "PID":
                # Patient Identification
                patient_id = fields.get("3", "")  # PID-3: Patient ID

            elif seg_type == "OBR":
                # Observation Request
                order_id = fields.get("2", "")  # OBR-2: Placer Order Number
                sample_id = (
                    sample_id or fields.get("3", "") or fields.get("2", "")
                )  # OBR-3 (Filler) or OBR-2 (Placer)
                if not test_code:
                    test_code = self._extract_component(
                        fields.get("4", ""), 0
                    )  # OBR-4: Universal Service ID

            elif seg_type == "OBX":
                # Observation Result
                msg_type = "RESULT"
                test_code = self._extract_component(
                    fields.get("3", ""), 0
                )  # OBX-3: Observation Identifier
                result_value = fields.get("5", "")  # OBX-5: Observation Value
                result_unit = fields.get("6", "")  # OBX-6: Units
                result_flags = fields.get("8", "")  # OBX-8: Abnormal Flags
                timestamp = fields.get("14", "")  # OBX-14: Date/Time of Observation

            elif seg_type == "ORC":
                # Order Common
                order_id = order_id or fields.get("2", "")  # ORC-2: Placer Order Number
                sample_id = sample_id or fields.get("2", "")  # Also use as sample ID

            elif seg_type == "QPD":
                # Query Parameter Definition (for host queries)
                msg_type = "QUERY"
                sample_id = fields.get("3", "")  # Sample being queried

            elif seg_type == "QRD":
                # Goldsite QRY^Q02 uses QRD-8 for sample barcode in real-time mode.
                msg_type = "QUERY"
                sample_id = sample_id or fields.get("8", "")

            elif seg_type == "DSP":
                # Goldsite DSR^Q03 uses DSP-3 as comma-delimited pending item IDs.
                # Keep first code in test_code for backward-compatible downstream routing.
                pending_items = fields.get("3", "")
                if pending_items:
                    first_code = pending_items.split(",")[0].strip()
                    test_code = test_code or first_code
                    raw_fields.setdefault("meta", {})["pending_item_ids"] = [
                        part.strip() for part in pending_items.split(",") if part.strip()
                    ]

            elif seg_type == "ERR":
                # In Goldsite query-display flows ERR indicates completed/not-found semantics.
                raw_fields.setdefault("meta", {})["query_status_code"] = fields.get("1", "")

            elif seg_type == "MSA":
                raw_fields.setdefault("meta", {})["ack_code"] = fields.get("1", "")
                raw_fields.setdefault("meta", {})["ack_message_control_id"] = fields.get("2", "")
                raw_fields.setdefault("meta", {})["ack_error_text"] = fields.get("3", "")
                raw_fields.setdefault("meta", {})["ack_error_code"] = fields.get("6", "")

        # Apply field_mapping overrides
        if self.field_mapping:
            sample_id = self.extract_field(raw_fields, "sample_id_field") or sample_id
            test_code = self.extract_field(raw_fields, "test_code_field") or test_code
            result_value = self.extract_field(raw_fields, "result_value_field") or result_value

        return ParsedMessage(
            message_type=msg_type,
            sample_id=sample_id,
            test_code=test_code,
            result_value=result_value,
            result_unit=result_unit,
            result_flags=result_flags,
            patient_id=patient_id,
            order_id=order_id,
            timestamp=timestamp,
            raw_fields=raw_fields,
        )

    def build_order_message(
        self,
        sample_id: str,
        test_codes: list[str],
        patient_id: str = "",
        priority: str = "ROUTINE",
    ) -> str:
        """
        Build an ORM^O01 order message for the analyzer.
        """
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        msg_control_id = f"VITORA{now}"
        priority_code = "S" if priority == "STAT" else "R"

        segments = []

        # MSH - Message Header
        segments.append(
            f"MSH|^~\\&|{self.sending_application}|{self.sending_facility}|"
            f"{self.receiving_application}|{self.receiving_facility}|{now}||"
            f"ORM^O01^ORM_O01|{msg_control_id}|P|{self.version}"
        )

        # PID - Patient Identification (minimal)
        segments.append(f"PID|||{patient_id}||")

        # ORC - Common Order
        segments.append(f"ORC|NW|{sample_id}|||{priority_code}")

        # OBR - Observation Request (one per test)
        for i, test_code in enumerate(test_codes, 1):
            segments.append(f"OBR|{i}|{sample_id}||{test_code}|||{now}|||||||{now}")

        return "\r".join(segments)

    def build_ack(
        self,
        success: bool = True,
        original_message_control_id: str = "",
        error_code: str = "",
        error_text: str = "",
    ) -> str:
        """
        Build an HL7 ACK message.

        Supports Goldsite-compatible status signaling via MSA-3 (text)
        and MSA-6 (error/status code) while remaining backward-compatible
        with existing call sites that only pass success/failure.
        """
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        msg_control_id = f"ACK{now}"
        ack_code = "AA" if success else "AE"
        ack_ref = original_message_control_id or msg_control_id
        msa_segment = f"MSA|{ack_code}|{ack_ref}"

        if error_text:
            msa_segment += f"|{error_text}"
        if error_code:
            if not error_text:
                msa_segment += "|"
            msa_segment += f"||{error_code}"

        segments = [
            f"MSH|^~\\&|{self.sending_application}|{self.sending_facility}|"
            f"{self.receiving_application}|{self.receiving_facility}|{now}||"
            f"ACK^R01|{msg_control_id}|P|{self.version}",
            msa_segment,
        ]
        return "\r".join(segments)

    def build_query_ack(
        self,
        query_id: str,
        original_message_control_id: str,
        accepted: bool = True,
        error_code: str = "",
        error_text: str = "",
    ) -> str:
        """Build Goldsite-compatible QCK^Q02 acknowledgement."""
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        msg_control_id = f"QCK{now}"
        ack_code = "AA" if accepted else "AE"
        qak_status = "OK" if accepted else "AE"

        segments = [
            f"MSH|^~\\&|{self.sending_application}|{self.sending_facility}|"
            f"{self.receiving_application}|{self.receiving_facility}|{now}||"
            f"QCK^Q02|{msg_control_id}|P|{self.version}",
            f"MSA|{ack_code}|{original_message_control_id}",
            f"QAK|{query_id}|{qak_status}",
        ]

        if error_code or error_text:
            segments.append(f"ERR|{error_code or '0'}")

        return "\r".join(segments)

    def build_display_response(
        self,
        query_id: str,
        original_message_control_id: str,
        sample_id: str,
        pending_item_ids: list[str] | None = None,
        completed_or_not_found: bool = False,
    ) -> str:
        """Build Goldsite-compatible DSR^Q03 response."""
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        msg_control_id = f"DSR{now}"
        pending_item_ids = pending_item_ids or []
        qrd_segment = f"QRD|{now}|R|D|{query_id}|||RD|{sample_id}|OTH|||T"

        segments = [
            f"MSH|^~\\&|{self.sending_application}|{self.sending_facility}|"
            f"{self.receiving_application}|{self.receiving_facility}|{now}||"
            f"DSR^Q03|{msg_control_id}|P|{self.version}|||P",
            f"MSA|AA|{original_message_control_id}",
            qrd_segment,
            "QRF||||||RCT|COR|ALL",
        ]

        if completed_or_not_found or not pending_item_ids:
            segments.append("ERR|0")
        else:
            joined_items = ",".join(pending_item_ids)
            segments.append(f"DSP|10000001|1|{joined_items}")

        return "\r".join(segments)

    def frame_message(self, message: str) -> bytes:
        """Apply MLLP framing to HL7 message."""
        framed = f"{MLLP_START}{message}{MLLP_END}{MLLP_CR}"
        encoding = self.config.get("encoding", "utf-8")
        return framed.encode(encoding)

    def unframe_message(self, data: bytes) -> str:
        """Remove MLLP framing from received data."""
        encoding = self.config.get("encoding", "utf-8")
        text = data.decode(encoding, errors="replace")

        # Strip MLLP framing
        if text.startswith(MLLP_START):
            text = text[1:]
        if MLLP_END in text:
            text = text[: text.index(MLLP_END)]

        return text.strip()

    def validate_message(self, raw_data: str) -> bool:
        """Validate HL7 message structure."""
        try:
            content = raw_data.strip(MLLP_START + MLLP_END + MLLP_CR)
            segments = self._split_segments(content)
            if not segments:
                return False

            # First segment must be MSH
            if not segments[0].startswith("MSH"):
                return False

            # MSH must have at least 9 fields
            fields = segments[0].split(self.FIELD_SEPARATOR)
            return not len(fields) < 9
        except (
            AttributeError,
            TypeError,
            ValueError,
            RuntimeError,
            OSError,
            AssertionError,
            ImportError,
        ):
            return False

    def _split_segments(self, message: str) -> list[str]:
        """Split HL7 message into segments."""
        segments = []
        for seg in message.replace("\r\n", "\r").split("\r"):
            seg = seg.strip()
            if seg:
                segments.append(seg)
        return segments

    def _parse_segment(self, segment: str) -> dict | None:
        """Parse a single HL7 segment into type + fields dict."""
        if not segment:
            return None

        fields = segment.split(self.FIELD_SEPARATOR)
        seg_type = fields[0]

        # For MSH, field 1 is the field separator itself
        field_dict = {}
        start_idx = 2 if seg_type == "MSH" else 1
        for i, field_val in enumerate(fields[start_idx:], start=start_idx):
            field_dict[str(i)] = field_val

        return {"segment_type": seg_type, "fields": field_dict}

    def _extract_component(self, field: str, index: int) -> str:
        """Extract component from HL7 field."""
        parts = field.split(self.COMPONENT_SEPARATOR)
        if index < len(parts):
            return parts[index].strip()
        return ""

    def _determine_message_type(self, msg_type_field: str) -> str:
        """Map HL7 message type to internal type."""
        components = msg_type_field.split(self.COMPONENT_SEPARATOR)
        if not components:
            return "RAW"

        msg_code = components[0]

        type_map = {
            "ORU": "RESULT",
            "ORM": "ORDER",
            "QRY": "QUERY",
            "QBP": "QUERY",
            "DSR": "QUERY",
            "QCK": "ACK",
            "ACK": "ACK",
            "RSP": "RESULT",
        }
        return type_map.get(msg_code, "RAW")

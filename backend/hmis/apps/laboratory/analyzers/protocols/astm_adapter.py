"""
ASTM E1394/LIS2-A2 Protocol Adapter.

Implements the ASTM protocol used by most clinical chemistry and hematology
analyzers (Roche cobas, Abbott Architect, Sysmex XN/XP, etc.).

ASTM Frame structure:
  <STX><FN><text><ETX><CS><CR><LF>

Where:
  STX = 0x02 (Start of Text)
  FN  = Frame Number (1-7, then wraps)
  ETX = 0x03 (End of Text) or ETB = 0x17 (End of Transmission Block)
  CS  = Checksum (2 hex chars, sum of bytes from FN to ETX/ETB inclusive, mod 256)
  CR  = 0x0D
  LF  = 0x0A

Record types:
  H = Header, P = Patient, O = Order, R = Result, C = Comment,
  Q = Query, L = Terminator, M = Manufacturer-specific
"""

import logging
from datetime import datetime

from .base import ChecksumError, FramingError, ParsedMessage, ProtocolAdapter

logger = logging.getLogger(__name__)

# Control characters
STX = "\x02"
ETX = "\x03"
ETB = "\x17"
ENQ = "\x05"
EOT = "\x04"
ACK = "\x06"
NAK = "\x15"
CR = "\x0d"
LF = "\x0a"


class ASTMAdapter(ProtocolAdapter):
    """
    ASTM E1394/LIS2-A2 protocol adapter.

    Supports parsing and building ASTM messages for bidirectional
    communication with laboratory analyzers.
    """

    FIELD_DELIMITER = "|"
    REPEAT_DELIMITER = "\\"
    COMPONENT_DELIMITER = "^"
    ESCAPE_DELIMITER = "&"

    def __init__(self, config: dict, field_mapping: dict):
        super().__init__(config, field_mapping)
        # Allow custom delimiters (some analyzers deviate from standard)
        self.field_delim = config.get("field_delimiter", self.FIELD_DELIMITER)
        self.component_delim = config.get("component_delimiter", self.COMPONENT_DELIMITER)
        self.timeout_ms = config.get("timeout_ms", 30000)
        self.frame_size = config.get("frame_size", 240)  # Max frame content length

    def parse_message(self, raw_data: str) -> ParsedMessage:
        """
        Parse an ASTM message (potentially multi-record).

        Handles common record types: H, P, O, R, Q, L.
        Returns a ParsedMessage focused on the primary data (result or query).
        """
        records = self._split_records(raw_data)
        if not records:
            return ParsedMessage(message_type="RAW", errors=["No valid ASTM records found"])

        # Determine message type from record content
        msg_type = "RAW"
        sample_id = ""
        test_code = ""
        result_value = ""
        result_unit = ""
        result_flags = ""
        patient_id = ""
        order_id = ""
        timestamp = ""
        raw_fields = {}

        for record in records:
            if not record:
                continue
            record_type = record[0]
            fields = record.split(self.field_delim)
            raw_fields[record_type] = fields

            if record_type == "Q":
                # Query record — instrument requesting work orders
                msg_type = "QUERY"
                # Q|1|^sample_id||
                if len(fields) > 2:
                    sample_id = self._extract_component(fields[2], 1)

            elif record_type == "O":
                # Order record
                if msg_type != "RESULT":
                    msg_type = "ORDER"
                # O|1|sample_id||test_code|priority|...
                if len(fields) > 2:
                    sample_id = sample_id or self._extract_component(fields[2], 0)
                if len(fields) > 4:
                    test_code = test_code or self._extract_component(fields[4], 3)

            elif record_type == "R":
                # Result record
                msg_type = "RESULT"
                # R|seq|test_code|result_value|units|ref_range|flags|...
                if len(fields) > 2:
                    test_code = self._extract_component(fields[2], 3)
                if len(fields) > 3:
                    result_value = fields[3].strip()
                if len(fields) > 4:
                    result_unit = fields[4].strip()
                if len(fields) > 6:
                    result_flags = fields[6].strip()
                if len(fields) > 12:
                    timestamp = fields[12].strip()

            elif record_type == "P":
                # Patient record
                # P|seq|patient_id|...
                if len(fields) > 2:
                    patient_id = self._extract_component(fields[2], 0)

            elif record_type == "H":
                # Header — extract sender info
                if len(fields) > 4:
                    raw_fields["sender"] = fields[4]

        # Apply field_mapping overrides if configured
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
        Build an ASTM order download message (Host → Instrument).

        Structure: H|P|O|L records.
        """
        now = datetime.now().strftime("%Y%m%d%H%M%S")
        priority_code = "S" if priority == "STAT" else "R"

        # Header record
        header = (
            f"H{self.field_delim}\\^&{self.field_delim}{self.field_delim}{self.field_delim}"
            f"Vitora HMIS{self.field_delim}{self.field_delim}{self.field_delim}{self.field_delim}"
            f"{self.field_delim}{self.field_delim}{self.field_delim}"
            f"P{self.field_delim}{now}"
        )

        # Patient record
        patient = f"P{self.field_delim}1{self.field_delim}{patient_id}"

        # Order record (test codes joined by repeat delimiter)
        tests_str = self.REPEAT_DELIMITER.join(f"^^^{code}" for code in test_codes)
        order = (
            f"O{self.field_delim}1{self.field_delim}{sample_id}{self.field_delim}"
            f"{self.field_delim}{tests_str}{self.field_delim}{priority_code}"
            f"{self.field_delim}{self.field_delim}{now}"
        )

        # Terminator
        terminator = f"L{self.field_delim}1{self.field_delim}N"

        return f"{header}\r{patient}\r{order}\r{terminator}"

    def build_ack(self, success: bool = True) -> str:
        """Build ASTM ACK (0x06) or NAK (0x15) character."""
        return ACK if success else NAK

    def frame_message(self, message: str) -> bytes:
        """
        Frame an ASTM message with STX/ETX and checksum.

        For messages exceeding frame_size, splits into intermediate frames
        using ETB for continuation.
        """
        frames = []
        frame_num = 1

        # Split into chunks if message exceeds frame size
        chunks = [message[i : i + self.frame_size] for i in range(0, len(message), self.frame_size)]

        for i, chunk in enumerate(chunks):
            is_last = i == len(chunks) - 1
            end_char = ETX if is_last else ETB

            # Frame content (FN + text + end_char)
            frame_content = f"{frame_num}{chunk}{end_char}"

            # Calculate checksum
            checksum = self._calculate_checksum(frame_content)

            # Complete frame
            frame = f"{STX}{frame_content}{checksum}{CR}{LF}"
            frames.append(frame.encode(self.config.get("encoding", "ascii")))

            frame_num = (frame_num % 7) + 1

        return b"".join(frames)

    def unframe_message(self, data: bytes) -> str:
        """
        Remove ASTM framing and validate checksum.

        Handles multi-frame messages (ETB continuation).
        """
        encoding = self.config.get("encoding", "ascii")
        text = data.decode(encoding, errors="replace")

        # Handle single-character control messages (ENQ, EOT, ACK, NAK)
        if len(text) == 1 and text in (ENQ, EOT, ACK, NAK):
            return text

        # Extract content between STX and checksum
        content_parts = []
        frames = text.split(STX)

        for frame in frames:
            if not frame:
                continue

            # Find ETX or ETB
            etx_pos = frame.find(ETX)
            etb_pos = frame.find(ETB)

            if etx_pos == -1 and etb_pos == -1:
                raise FramingError(f"No ETX/ETB found in frame: {repr(frame[:50])}")

            end_pos = etx_pos if etx_pos != -1 else etb_pos
            frame_content = frame[: end_pos + 1]

            # Validate checksum (2 chars after ETX/ETB)
            expected_cs = frame[end_pos + 1 : end_pos + 3]
            actual_cs = self._calculate_checksum(frame_content)

            if expected_cs and expected_cs != actual_cs:
                raise ChecksumError(f"Checksum mismatch: expected {expected_cs}, got {actual_cs}")

            # Extract text (skip frame number)
            content_parts.append(frame_content[1:-1])  # Skip FN and ETX/ETB

        return "".join(content_parts)

    def validate_message(self, raw_data: str) -> bool:
        """Validate ASTM message structure."""
        try:
            # Single control char messages are always valid
            if len(raw_data) == 1 and raw_data in (ENQ, EOT, ACK, NAK):
                return True

            # Must have at least one valid record type
            records = self._split_records(raw_data)
            if not records:
                return False

            return all(not (record and record[0] not in "HPORQLCMS") for record in records)
        except Exception:
            return False

    def _split_records(self, data: str) -> list[str]:
        """Split multi-record ASTM message into individual records."""
        # Records are separated by CR or CR+LF
        records = []
        for line in data.replace("\r\n", "\r").split("\r"):
            line = line.strip()
            if line:
                records.append(line)
        return records

    def _extract_component(self, field: str, index: int) -> str:
        """Extract a component from a field using component delimiter."""
        parts = field.split(self.component_delim)
        if index < len(parts):
            return parts[index].strip()
        return ""

    @staticmethod
    def _calculate_checksum(frame_content: str) -> str:
        """
        Calculate ASTM checksum.

        Sum of all characters from frame number to and including ETX/ETB,
        modulo 256, expressed as 2 uppercase hex characters.
        """
        total = sum(ord(c) for c in frame_content)
        return f"{total % 256:02X}"

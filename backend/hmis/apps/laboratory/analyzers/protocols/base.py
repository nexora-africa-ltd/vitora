"""
Abstract base class for protocol adapters.

All protocol adapters must implement this interface to provide
consistent message handling regardless of the underlying protocol.
"""

import abc
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ParsedMessage:
    """Standardized parsed message from any protocol."""

    message_type: str  # QUERY, RESULT, ORDER, ACK, NAK, STATUS
    sample_id: str = ""
    test_code: str = ""
    result_value: str = ""
    result_unit: str = ""
    result_flags: str = ""  # H, L, HH, LL, etc.
    patient_id: str = ""
    order_id: str = ""
    instrument_id: str = ""
    operator_id: str = ""
    timestamp: str = ""
    raw_fields: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)

    @property
    def is_result(self) -> bool:
        return self.message_type == "RESULT"

    @property
    def is_query(self) -> bool:
        return self.message_type == "QUERY"

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0


@dataclass
class ProtocolFrame:
    """A framed protocol message ready for transmission."""

    data: bytes
    checksum: str = ""
    frame_number: int = 0


class ProtocolAdapter(abc.ABC):
    """
    Abstract base class for instrument protocol adapters.

    Subclasses implement the specifics of ASTM, HL7, Serial, etc.
    """

    def __init__(self, config: dict, field_mapping: dict):
        """
        Initialize adapter with channel configuration.

        Args:
            config: Protocol-specific settings from InstrumentChannel.config
            field_mapping: Field extraction mapping from InstrumentChannel.field_mapping
        """
        self.config = config
        self.field_mapping = field_mapping

    @abc.abstractmethod
    def parse_message(self, raw_data: str) -> ParsedMessage:
        """
        Parse a raw protocol message into structured data.

        Args:
            raw_data: Raw message string (may contain control chars)

        Returns:
            ParsedMessage with extracted fields
        """

    @abc.abstractmethod
    def build_order_message(
        self,
        sample_id: str,
        test_codes: list[str],
        patient_id: str = "",
        priority: str = "ROUTINE",
    ) -> str:
        """
        Build a work order download message for the instrument.

        Args:
            sample_id: Specimen barcode/ID
            test_codes: List of test codes to request
            patient_id: Optional patient identifier
            priority: Order priority (ROUTINE, STAT)

        Returns:
            Formatted protocol message string
        """

    @abc.abstractmethod
    def build_ack(self, success: bool = True) -> str:
        """
        Build an acknowledgement message.

        Args:
            success: True for ACK, False for NAK

        Returns:
            Formatted ACK/NAK message
        """

    @abc.abstractmethod
    def frame_message(self, message: str) -> bytes:
        """
        Apply protocol framing (STX/ETX, checksum, etc.) to a message.

        Args:
            message: The message content to frame

        Returns:
            Framed bytes ready for transmission
        """

    @abc.abstractmethod
    def unframe_message(self, data: bytes) -> str:
        """
        Remove protocol framing and validate checksum.

        Args:
            data: Raw bytes received from instrument

        Returns:
            Unframed message content

        Raises:
            ProtocolError: If checksum fails or framing is invalid
        """

    @abc.abstractmethod
    def validate_message(self, raw_data: str) -> bool:
        """
        Validate message structure/checksum without full parsing.

        Args:
            raw_data: Raw message to validate

        Returns:
            True if message structure is valid
        """

    def extract_field(self, parsed_data: dict, field_key: str) -> str:
        """
        Extract a field value using the configured field_mapping.

        Supports dot-notation paths: "RECORD.field_index.component_index"
        For ASTM: "R.2.3" = R record, field 2, component 3 (split by ^)
        For HL7: "OBX.5" = OBX segment, field 5

        Args:
            parsed_data: Parsed message data
            field_key: Logical field name (e.g., 'sample_id_field')

        Returns:
            Extracted value or empty string
        """
        mapping_path = self.field_mapping.get(field_key, "")
        if not mapping_path:
            return ""

        # Support dot-notation paths (e.g., "OBR.3.1")
        parts = mapping_path.split(".")
        current = parsed_data
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part, "")
            elif isinstance(current, (list, tuple)):
                try:
                    current = current[int(part)]
                except (IndexError, ValueError):
                    return ""
            elif isinstance(current, str):
                # String with remaining path → split by component delimiter (^)
                components = current.split("^")
                try:
                    return components[int(part)].strip()
                except (IndexError, ValueError):
                    return current
            else:
                return str(current) if current else ""
        return str(current) if current else ""


class ProtocolError(Exception):
    """Base exception for protocol errors."""

    pass


class ChecksumError(ProtocolError):
    """Checksum validation failed."""

    pass


class FramingError(ProtocolError):
    """Message framing is invalid."""

    pass


class TimeoutError(ProtocolError):
    """Communication timeout."""

    pass

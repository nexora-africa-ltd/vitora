"""
Serial/RS-232 via TCP-Serial Bridge Adapter.

Handles communication with analyzers connected via serial-to-TCP bridges
(e.g., Moxa NPort, Lantronix, Digi Connect). These devices convert
RS-232 serial communication to TCP/IP, allowing network-based access
to serial-only instruments.

The adapter wraps ASTM or raw serial data with any bridge-specific framing.
Most bridges are transparent (pass-through), but some add headers/trailers.
"""

import logging

from .astm_adapter import ASTMAdapter
from .base import ParsedMessage, ProtocolAdapter, ProtocolError

logger = logging.getLogger(__name__)


class SerialBridgeAdapter(ProtocolAdapter):
    """
    Serial/RS-232 via TCP bridge adapter.

    Wraps an underlying protocol (usually ASTM) with serial bridge
    configuration. Most serial bridges are transparent — the adapter
    handles timing and framing differences.
    """

    def __init__(self, config: dict, field_mapping: dict):
        super().__init__(config, field_mapping)

        # Serial parameters (for documentation/bridge config reference)
        self.baud_rate = config.get("baud_rate", 9600)
        self.data_bits = config.get("data_bits", 8)
        self.stop_bits = config.get("stop_bits", 1)
        self.parity = config.get("parity", "N")  # N=None, E=Even, O=Odd
        self.flow_control = config.get("flow_control", "none")  # none, xon_xoff, rts_cts

        # Bridge-specific settings
        self.bridge_type = config.get("bridge_type", "transparent")
        self.inter_char_timeout_ms = config.get("inter_char_timeout_ms", 100)
        self.message_delimiter = config.get("message_delimiter", "\r\n")

        # Underlying protocol adapter (usually ASTM for serial analyzers)
        underlying_protocol = config.get("underlying_protocol", "ASTM")
        if underlying_protocol == "ASTM":
            self._underlying = ASTMAdapter(config, field_mapping)
        else:
            self._underlying = None

    def parse_message(self, raw_data: str) -> ParsedMessage:
        """
        Parse serial data by delegating to the underlying protocol adapter.

        Strips any bridge-specific framing before parsing.
        """
        # Strip bridge framing if present
        content = self._strip_bridge_framing(raw_data)

        if self._underlying:
            return self._underlying.parse_message(content)

        # Raw mode — basic line parsing
        return ParsedMessage(
            message_type="RAW",
            raw_fields={"raw_lines": content.split(self.message_delimiter)},
        )

    def build_order_message(
        self,
        sample_id: str,
        test_codes: list[str],
        patient_id: str = "",
        priority: str = "ROUTINE",
    ) -> str:
        """Build order message using underlying protocol."""
        if self._underlying:
            return self._underlying.build_order_message(sample_id, test_codes, patient_id, priority)
        raise ProtocolError("No underlying protocol configured for order building")

    def build_ack(self, success: bool = True) -> str:
        """Build ACK using underlying protocol."""
        if self._underlying:
            return self._underlying.build_ack(success)
        return "\x06" if success else "\x15"

    def frame_message(self, message: str) -> bytes:
        """
        Frame message for serial transmission.

        Applies underlying protocol framing, then any bridge-specific wrapper.
        """
        if self._underlying:
            data = self._underlying.frame_message(message)
        else:
            encoding = self.config.get("encoding", "ascii")
            data = f"{message}{self.message_delimiter}".encode(encoding)

        return self._apply_bridge_framing(data)

    def unframe_message(self, data: bytes) -> str:
        """
        Remove bridge and protocol framing from received data.
        """
        # Remove bridge framing
        stripped = self._strip_bridge_framing_bytes(data)

        if self._underlying:
            return self._underlying.unframe_message(stripped)

        encoding = self.config.get("encoding", "ascii")
        return stripped.decode(encoding, errors="replace").strip()

    def validate_message(self, raw_data: str) -> bool:
        """Validate message using underlying protocol."""
        content = self._strip_bridge_framing(raw_data)
        if self._underlying:
            return self._underlying.validate_message(content)
        # Raw mode — just check non-empty
        return bool(content.strip())

    def _strip_bridge_framing(self, data: str) -> str:
        """Strip bridge-specific framing from string data."""
        if self.bridge_type == "transparent":
            return data
        # TODO: [AFTER PILOT] Add support for specific bridge header/trailer formats
        # (Moxa proprietary headers, Lantronix tunneling, etc.)
        return data

    def _strip_bridge_framing_bytes(self, data: bytes) -> bytes:
        """Strip bridge-specific framing from bytes data."""
        if self.bridge_type == "transparent":
            return data
        # TODO: [AFTER PILOT] Add support for specific bridge byte-level framing
        return data

    def _apply_bridge_framing(self, data: bytes) -> bytes:
        """Apply bridge-specific framing to outbound data."""
        if self.bridge_type == "transparent":
            return data
        # TODO: [AFTER PILOT] Add bridge-specific headers/trailers
        return data

    @property
    def serial_config_summary(self) -> str:
        """Human-readable serial config string (e.g., '9600-8-N-1')."""
        return f"{self.baud_rate}-{self.data_bits}-{self.parity}-{self.stop_bits}"

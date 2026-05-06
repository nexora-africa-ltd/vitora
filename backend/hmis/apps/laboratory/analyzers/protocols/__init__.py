"""
Protocol adapter base and implementations for analyzer communication.

Provides a pluggable adapter architecture for ASTM, HL7, and Serial protocols.
Each adapter handles framing, parsing, and message construction for its protocol.
"""

from .astm_adapter import ASTMAdapter
from .base import ProtocolAdapter
from .hl7_adapter import HL7BidirectionalAdapter
from .serial_adapter import SerialBridgeAdapter

__all__ = [
    "ProtocolAdapter",
    "ASTMAdapter",
    "HL7BidirectionalAdapter",
    "SerialBridgeAdapter",
]

"""
Minimal HL7v2 MLLP Echo/ACK Server for staging integration testing.

Listens on port 2575, accepts any HL7v2 message wrapped in MLLP framing,
returns an ACK (AA) response. Logs message type and control ID.
"""

import datetime
import logging
import socketserver

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("hl7-mock")

# MLLP framing characters
SB = b"\x0b"  # Start Block
EB = b"\x1c"  # End Block
CR = b"\x0d"  # Carriage Return


def build_ack(message_control_id: str, sending_app: str = "HL7_MOCK") -> bytes:
    """Build a minimal ACK message for the given control ID."""
    now = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    ack = (
        f"MSH|^~\\&|{sending_app}|STAGING_LIS|VITORA_HMIS|VITORA|{now}||ACK|{now}|P|2.5\r"
        f"MSA|AA|{message_control_id}\r"
    )
    return ack.encode("utf-8")


def extract_control_id(raw: bytes) -> str:
    """Extract MSH-10 (Message Control ID) from raw HL7."""
    try:
        text = raw.decode("utf-8", errors="replace")
        lines = text.split("\r")
        for line in lines:
            if line.startswith("MSH"):
                fields = line.split("|")
                if len(fields) > 9:
                    return fields[9]
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


def extract_message_type(raw: bytes) -> str:
    """Extract MSH-9 (Message Type) from raw HL7."""
    try:
        text = raw.decode("utf-8", errors="replace")
        lines = text.split("\r")
        for line in lines:
            if line.startswith("MSH"):
                fields = line.split("|")
                if len(fields) > 8:
                    return fields[8]
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


class MLLPHandler(socketserver.StreamRequestHandler):
    """Handle a single MLLP connection (may carry multiple messages)."""

    def handle(self):
        logger.info("Connection from %s", self.client_address)
        buffer = b""

        while True:
            chunk = self.request.recv(4096)
            if not chunk:
                break
            buffer += chunk

            # Process complete MLLP frames in buffer
            while SB in buffer and EB in buffer:
                start = buffer.index(SB)
                end = buffer.index(EB)
                if end <= start:
                    buffer = buffer[end + 1 :]
                    continue

                # Extract HL7 payload (between SB and EB)
                payload = buffer[start + 1 : end]
                # Skip trailing CR after EB if present
                remaining_start = end + 1
                if remaining_start < len(buffer) and buffer[remaining_start : remaining_start + 1] == CR:
                    remaining_start += 1
                buffer = buffer[remaining_start:]

                # Parse and ACK
                msg_type = extract_message_type(payload)
                control_id = extract_control_id(payload)
                logger.info("Received %s (ID: %s) — sending ACK", msg_type, control_id)

                ack = build_ack(control_id)
                # Send ACK wrapped in MLLP framing
                self.request.sendall(SB + ack + EB + CR)

        logger.info("Connection closed from %s", self.client_address)


class MLLPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    host, port = "0.0.0.0", 2575
    logger.info("HL7 MLLP Mock Server starting on %s:%d", host, port)
    with MLLPServer((host, port), MLLPHandler) as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            logger.info("Shutting down")
            server.shutdown()

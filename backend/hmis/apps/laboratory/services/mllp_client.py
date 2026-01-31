"""
MLLP (Minimal Lower Layer Protocol) Client for HL7 Message Transport.

This module provides TCP/IP transport layer functionality for HL7 v2.x
messages using the MLLP protocol (HL7 standard for message framing).

MLLP Frame Format:
    <VT> (0x0B) - Start Block character
    [HL7 Message Data]
    <FS> (0x1C) - End Block character
    <CR> (0x0D) - Carriage Return

Sprint Phase 4: HL7 v2 Messaging (Lab Integration)
Reference: docs/fhir-validation-plan.md

MLLP Specification: HL7 v2.x Implementation Guide
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import socket
import ssl
import time
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from threading import Lock
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# MLLP framing characters
MLLP_START_BLOCK = b"\x0b"  # Vertical Tab (VT)
MLLP_END_BLOCK = b"\x1c"  # File Separator (FS)
MLLP_CARRIAGE_RETURN = b"\x0d"  # Carriage Return (CR)


class MLLPError(Exception):
    """Base exception for MLLP errors."""

    pass


class MLLPConnectionError(MLLPError):
    """Raised when connection fails."""

    pass


class MLLPTimeoutError(MLLPError):
    """Raised when operation times out."""

    pass


class MLLPFramingError(MLLPError):
    """Raised when message framing is invalid."""

    pass


class ConnectionState(Enum):
    """MLLP connection states."""

    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


@dataclass
class MLLPConfig:
    """Configuration for MLLP client."""

    host: str
    port: int
    timeout: float = 30.0  # Connection timeout in seconds
    receive_timeout: float = 60.0  # Receive timeout in seconds
    max_retries: int = 3
    retry_delay: float = 1.0  # Delay between retries in seconds
    use_ssl: bool = False
    ssl_verify: bool = True
    ssl_cert_file: str | None = None
    ssl_key_file: str | None = None
    ssl_ca_file: str | None = None
    keep_alive: bool = True
    keep_alive_interval: int = 30  # Keep-alive interval in seconds
    buffer_size: int = 65536  # Receive buffer size


@dataclass
class MLLPResponse:
    """MLLP response data."""

    message: str
    raw_data: bytes
    receive_time: datetime
    response_time_ms: float


@dataclass
class MLLPStats:
    """MLLP connection statistics."""

    messages_sent: int = 0
    messages_received: int = 0
    bytes_sent: int = 0
    bytes_received: int = 0
    connection_errors: int = 0
    last_activity: datetime | None = None
    total_response_time_ms: float = 0.0

    @property
    def avg_response_time_ms(self) -> float:
        """Calculate average response time."""
        if self.messages_sent == 0:
            return 0.0
        return self.total_response_time_ms / self.messages_sent


class MLLPClient:
    """
    MLLP Client for HL7 Message Transport.

    Provides synchronous TCP/IP transport for HL7 messages using MLLP framing.
    Supports TLS/SSL, retries, and connection pooling.

    Usage:
        config = MLLPConfig(host="lab.example.com", port=2575)
        client = MLLPClient(config)

        with client:
            response = client.send_message(hl7_message)
            print(response.message)

    Or without context manager:
        client = MLLPClient(config)
        try:
            client.connect()
            response = client.send_message(hl7_message)
        finally:
            client.disconnect()
    """

    def __init__(self, config: MLLPConfig):
        """
        Initialize MLLP client.

        Args:
            config: MLLP configuration
        """
        self.config = config
        self._socket: socket.socket | None = None
        self._state = ConnectionState.DISCONNECTED
        self._stats = MLLPStats()
        self._lock = Lock()

    @property
    def state(self) -> ConnectionState:
        """Get current connection state."""
        return self._state

    @property
    def stats(self) -> MLLPStats:
        """Get connection statistics."""
        return self._stats

    @property
    def is_connected(self) -> bool:
        """Check if client is connected."""
        return self._state == ConnectionState.CONNECTED and self._socket is not None

    def __enter__(self) -> MLLPClient:
        """Context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.disconnect()

    def connect(self) -> None:
        """
        Establish connection to MLLP server.

        Raises:
            MLLPConnectionError: If connection fails after retries
        """
        with self._lock:
            if self._state == ConnectionState.CONNECTED:
                return

            self._state = ConnectionState.CONNECTING
            last_error: Exception | None = None

            for attempt in range(self.config.max_retries):
                try:
                    self._create_socket()
                    self._socket.connect((self.config.host, self.config.port))
                    self._state = ConnectionState.CONNECTED
                    logger.info(
                        "Connected to MLLP server %s:%d",
                        self.config.host,
                        self.config.port,
                    )
                    return

                except (socket.timeout, OSError) as e:
                    last_error = e
                    self._stats.connection_errors += 1
                    self._cleanup_socket()

                    if attempt < self.config.max_retries - 1:
                        logger.warning(
                            "Connection attempt %d failed: %s. Retrying in %.1fs...",
                            attempt + 1,
                            str(e),
                            self.config.retry_delay,
                        )
                        time.sleep(self.config.retry_delay)

            self._state = ConnectionState.ERROR
            raise MLLPConnectionError(
                f"Failed to connect to {self.config.host}:{self.config.port} "
                f"after {self.config.max_retries} attempts: {last_error}"
            )

    def disconnect(self) -> None:
        """Close connection to MLLP server."""
        with self._lock:
            self._cleanup_socket()
            self._state = ConnectionState.DISCONNECTED
            logger.info("Disconnected from MLLP server")

    def _create_socket(self) -> None:
        """Create and configure socket."""
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.settimeout(self.config.timeout)

        # Configure keep-alive
        if self.config.keep_alive:
            self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
            # Platform-specific keep-alive settings
            try:
                self._socket.setsockopt(
                    socket.IPPROTO_TCP,
                    socket.TCP_KEEPIDLE,
                    self.config.keep_alive_interval,
                )
                self._socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)
                self._socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
            except (AttributeError, OSError):
                pass  # Not available on all platforms

        # Wrap with SSL if configured
        if self.config.use_ssl:
            self._socket = self._wrap_ssl(self._socket)

    def _wrap_ssl(self, sock: socket.socket) -> ssl.SSLSocket:
        """Wrap socket with SSL/TLS."""
        context = ssl.create_default_context()

        if not self.config.ssl_verify:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE

        if self.config.ssl_ca_file:
            context.load_verify_locations(self.config.ssl_ca_file)

        if self.config.ssl_cert_file and self.config.ssl_key_file:
            context.load_cert_chain(
                self.config.ssl_cert_file,
                self.config.ssl_key_file,
            )

        return context.wrap_socket(sock, server_hostname=self.config.host)

    def _cleanup_socket(self) -> None:
        """Clean up socket resources."""
        if self._socket:
            with contextlib.suppress(OSError):
                self._socket.shutdown(socket.SHUT_RDWR)
            with contextlib.suppress(OSError):
                self._socket.close()
            self._socket = None

    def _frame_message(self, message: str) -> bytes:
        """
        Frame HL7 message with MLLP delimiters.

        Args:
            message: HL7 message string

        Returns:
            MLLP-framed message bytes
        """
        message_bytes = message.encode("utf-8")
        return MLLP_START_BLOCK + message_bytes + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN

    def _unframe_message(self, data: bytes) -> str:
        """
        Remove MLLP framing from received data.

        Args:
            data: MLLP-framed message bytes

        Returns:
            Unframed HL7 message string

        Raises:
            MLLPFramingError: If framing is invalid
        """
        if not data:
            raise MLLPFramingError("Empty response data")

        # Find start block
        start_idx = data.find(MLLP_START_BLOCK)
        if start_idx == -1:
            raise MLLPFramingError("Missing MLLP start block")

        # Find end block
        end_idx = data.find(MLLP_END_BLOCK, start_idx)
        if end_idx == -1:
            raise MLLPFramingError("Missing MLLP end block")

        # Extract message content
        message_bytes = data[start_idx + 1 : end_idx]
        return message_bytes.decode("utf-8")

    def send_message(self, message: str, wait_for_ack: bool = True) -> MLLPResponse | None:
        """
        Send HL7 message and optionally wait for response.

        Args:
            message: HL7 message string to send
            wait_for_ack: Whether to wait for acknowledgment

        Returns:
            MLLPResponse if wait_for_ack is True, None otherwise

        Raises:
            MLLPConnectionError: If not connected
            MLLPTimeoutError: If response times out
            MLLPFramingError: If response framing is invalid
        """
        if not self.is_connected:
            raise MLLPConnectionError("Not connected to MLLP server")

        start_time = time.time()

        # Frame and send message
        framed_message = self._frame_message(message)

        try:
            with self._lock:
                self._socket.sendall(framed_message)
                self._stats.messages_sent += 1
                self._stats.bytes_sent += len(framed_message)
                self._stats.last_activity = datetime.now()

            logger.debug("Sent MLLP message (%d bytes)", len(framed_message))

            if not wait_for_ack:
                return None

            # Receive response
            response = self._receive_message()
            response_time_ms = (time.time() - start_time) * 1000
            self._stats.total_response_time_ms += response_time_ms

            return response

        except socket.timeout as e:
            self._state = ConnectionState.ERROR
            raise MLLPTimeoutError(f"Timeout waiting for response: {e}") from e

        except OSError as e:
            self._state = ConnectionState.ERROR
            self._stats.connection_errors += 1
            raise MLLPConnectionError(f"Socket error: {e}") from e

    def _receive_message(self) -> MLLPResponse:
        """
        Receive MLLP-framed message from server.

        Returns:
            MLLPResponse with received message

        Raises:
            MLLPTimeoutError: If receive times out
            MLLPFramingError: If message framing is invalid
        """
        start_time = time.time()
        self._socket.settimeout(self.config.receive_timeout)

        data = b""
        while True:
            try:
                chunk = self._socket.recv(self.config.buffer_size)
                if not chunk:
                    break

                data += chunk
                self._stats.bytes_received += len(chunk)

                # Check if we have complete message (ends with FS+CR)
                if MLLP_END_BLOCK in data and data.endswith(MLLP_CARRIAGE_RETURN):
                    break

            except socket.timeout as e:
                if data:
                    # Got partial data before timeout
                    break
                raise MLLPTimeoutError("Timeout waiting for response") from e

        self._stats.messages_received += 1
        self._stats.last_activity = datetime.now()

        # Unframe message
        message = self._unframe_message(data)
        response_time_ms = (time.time() - start_time) * 1000

        logger.debug(
            "Received MLLP message (%d bytes) in %.2fms",
            len(data),
            response_time_ms,
        )

        return MLLPResponse(
            message=message,
            raw_data=data,
            receive_time=datetime.now(),
            response_time_ms=response_time_ms,
        )

    def send_and_receive(
        self,
        message: str,
        response_handler: Callable[[str], Any] | None = None,
    ) -> tuple[MLLPResponse, Any]:
        """
        Send message and process response with optional handler.

        Args:
            message: HL7 message to send
            response_handler: Optional callback to process response

        Returns:
            Tuple of (MLLPResponse, handler_result)
        """
        response = self.send_message(message, wait_for_ack=True)

        handler_result = None
        if response and response_handler:
            handler_result = response_handler(response.message)

        return response, handler_result


class AsyncMLLPClient:
    """
    Async MLLP Client for HL7 Message Transport.

    Provides asynchronous TCP/IP transport for HL7 messages using MLLP framing.
    Useful for high-throughput scenarios or integration with async frameworks.

    Usage:
        config = MLLPConfig(host="lab.example.com", port=2575)
        async with AsyncMLLPClient(config) as client:
            response = await client.send_message(hl7_message)
            print(response.message)
    """

    def __init__(self, config: MLLPConfig):
        """
        Initialize async MLLP client.

        Args:
            config: MLLP configuration
        """
        self.config = config
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._state = ConnectionState.DISCONNECTED
        self._stats = MLLPStats()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> ConnectionState:
        """Get current connection state."""
        return self._state

    @property
    def stats(self) -> MLLPStats:
        """Get connection statistics."""
        return self._stats

    @property
    def is_connected(self) -> bool:
        """Check if client is connected."""
        return self._state == ConnectionState.CONNECTED and self._writer is not None

    async def __aenter__(self) -> AsyncMLLPClient:
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.disconnect()

    async def connect(self) -> None:
        """
        Establish connection to MLLP server.

        Raises:
            MLLPConnectionError: If connection fails after retries
        """
        async with self._lock:
            if self._state == ConnectionState.CONNECTED:
                return

            self._state = ConnectionState.CONNECTING
            last_error: Exception | None = None

            for attempt in range(self.config.max_retries):
                try:
                    if self.config.use_ssl:
                        ssl_context = ssl.create_default_context()
                        if not self.config.ssl_verify:
                            ssl_context.check_hostname = False
                            ssl_context.verify_mode = ssl.CERT_NONE
                    else:
                        ssl_context = None

                    self._reader, self._writer = await asyncio.wait_for(
                        asyncio.open_connection(
                            self.config.host,
                            self.config.port,
                            ssl=ssl_context,
                        ),
                        timeout=self.config.timeout,
                    )

                    self._state = ConnectionState.CONNECTED
                    logger.info(
                        "Async connected to MLLP server %s:%d",
                        self.config.host,
                        self.config.port,
                    )
                    return

                except (asyncio.TimeoutError, OSError) as e:
                    last_error = e
                    self._stats.connection_errors += 1
                    await self._cleanup()

                    if attempt < self.config.max_retries - 1:
                        logger.warning(
                            "Async connection attempt %d failed: %s. Retrying...",
                            attempt + 1,
                            str(e),
                        )
                        await asyncio.sleep(self.config.retry_delay)

            self._state = ConnectionState.ERROR
            raise MLLPConnectionError(
                f"Failed to connect to {self.config.host}:{self.config.port}: {last_error}"
            )

    async def disconnect(self) -> None:
        """Close connection to MLLP server."""
        async with self._lock:
            await self._cleanup()
            self._state = ConnectionState.DISCONNECTED
            logger.info("Async disconnected from MLLP server")

    async def _cleanup(self) -> None:
        """Clean up connection resources."""
        if self._writer:
            with contextlib.suppress(Exception):
                self._writer.close()
                await self._writer.wait_closed()
            self._writer = None
            self._reader = None

    def _frame_message(self, message: str) -> bytes:
        """Frame HL7 message with MLLP delimiters."""
        message_bytes = message.encode("utf-8")
        return MLLP_START_BLOCK + message_bytes + MLLP_END_BLOCK + MLLP_CARRIAGE_RETURN

    def _unframe_message(self, data: bytes) -> str:
        """Remove MLLP framing from received data."""
        if not data:
            raise MLLPFramingError("Empty response data")

        start_idx = data.find(MLLP_START_BLOCK)
        if start_idx == -1:
            raise MLLPFramingError("Missing MLLP start block")

        end_idx = data.find(MLLP_END_BLOCK, start_idx)
        if end_idx == -1:
            raise MLLPFramingError("Missing MLLP end block")

        message_bytes = data[start_idx + 1 : end_idx]
        return message_bytes.decode("utf-8")

    async def send_message(
        self,
        message: str,
        wait_for_ack: bool = True,
    ) -> MLLPResponse | None:
        """
        Send HL7 message and optionally wait for response.

        Args:
            message: HL7 message string to send
            wait_for_ack: Whether to wait for acknowledgment

        Returns:
            MLLPResponse if wait_for_ack is True, None otherwise
        """
        if not self.is_connected:
            raise MLLPConnectionError("Not connected to MLLP server")

        start_time = time.time()

        # Frame and send message
        framed_message = self._frame_message(message)

        try:
            async with self._lock:
                self._writer.write(framed_message)
                await self._writer.drain()

                self._stats.messages_sent += 1
                self._stats.bytes_sent += len(framed_message)
                self._stats.last_activity = datetime.now()

            logger.debug("Async sent MLLP message (%d bytes)", len(framed_message))

            if not wait_for_ack:
                return None

            # Receive response
            response = await self._receive_message()
            response_time_ms = (time.time() - start_time) * 1000
            self._stats.total_response_time_ms += response_time_ms

            return response

        except asyncio.TimeoutError as e:
            self._state = ConnectionState.ERROR
            raise MLLPTimeoutError(f"Timeout waiting for response: {e}") from e

        except OSError as e:
            self._state = ConnectionState.ERROR
            self._stats.connection_errors += 1
            raise MLLPConnectionError(f"Connection error: {e}") from e

    async def _receive_message(self) -> MLLPResponse:
        """Receive MLLP-framed message from server."""
        start_time = time.time()

        data = b""
        while True:
            try:
                chunk = await asyncio.wait_for(
                    self._reader.read(self.config.buffer_size),
                    timeout=self.config.receive_timeout,
                )

                if not chunk:
                    break

                data += chunk
                self._stats.bytes_received += len(chunk)

                # Check if we have complete message
                if MLLP_END_BLOCK in data and data.endswith(MLLP_CARRIAGE_RETURN):
                    break

            except asyncio.TimeoutError as e:
                if data:
                    break
                raise MLLPTimeoutError("Timeout waiting for response") from e

        self._stats.messages_received += 1
        self._stats.last_activity = datetime.now()

        message = self._unframe_message(data)
        response_time_ms = (time.time() - start_time) * 1000

        return MLLPResponse(
            message=message,
            raw_data=data,
            receive_time=datetime.now(),
            response_time_ms=response_time_ms,
        )


class MLLPClientPool:
    """
    Connection pool for MLLP clients.

    Manages multiple connections for high-throughput scenarios.

    Usage:
        config = MLLPConfig(host="lab.example.com", port=2575)
        pool = MLLPClientPool(config, pool_size=5)

        with pool.get_client() as client:
            response = client.send_message(message)
    """

    def __init__(self, config: MLLPConfig, pool_size: int = 5):
        """
        Initialize connection pool.

        Args:
            config: MLLP configuration
            pool_size: Number of connections to maintain
        """
        self.config = config
        self.pool_size = pool_size
        self._pool: list[MLLPClient] = []
        self._available: list[MLLPClient] = []
        self._lock = Lock()
        self._initialized = False

    def initialize(self) -> None:
        """Initialize connection pool."""
        with self._lock:
            if self._initialized:
                return

            for _ in range(self.pool_size):
                client = MLLPClient(self.config)
                try:
                    client.connect()
                    self._pool.append(client)
                    self._available.append(client)
                except MLLPConnectionError as e:
                    logger.warning("Failed to initialize pool connection: %s", e)

            self._initialized = True
            logger.info(
                "Initialized MLLP connection pool with %d connections",
                len(self._pool),
            )

    def shutdown(self) -> None:
        """Shutdown connection pool."""
        with self._lock:
            for client in self._pool:
                client.disconnect()
            self._pool.clear()
            self._available.clear()
            self._initialized = False
            logger.info("Shutdown MLLP connection pool")

    @contextmanager
    def get_client(self):
        """
        Get a client from the pool.

        Yields:
            MLLPClient: Connected client

        Raises:
            MLLPConnectionError: If no clients available
        """
        if not self._initialized:
            self.initialize()

        client = None
        with self._lock:
            if self._available:
                client = self._available.pop()

        if not client:
            # Create a new temporary client
            client = MLLPClient(self.config)
            client.connect()
            try:
                yield client
            finally:
                client.disconnect()
            return

        try:
            # Ensure client is connected
            if not client.is_connected:
                client.connect()
            yield client
        finally:
            with self._lock:
                self._available.append(client)

    def __enter__(self) -> MLLPClientPool:
        """Context manager entry."""
        self.initialize()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.shutdown()

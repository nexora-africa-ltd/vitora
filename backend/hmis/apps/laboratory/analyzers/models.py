"""
Phase L3: Analyzer Interfacing Models.

InstrumentChannel — Communication channel config for an instrument.
AnalyzerMessage — Individual protocol messages (inbound/outbound).
AnalyzerDriverTemplate — Pre-built config templates for common analyzers.
"""

from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.laboratory.models import Instrument, LabOrderItem, Specimen


class InstrumentChannel(FacilityScopedModel):
    """
    Communication channel configuration for a laboratory instrument.

    Each instrument may have one or more channels (e.g., primary + backup).
    The channel defines the protocol, connection parameters, and message mapping.
    """

    class Protocol(models.TextChoices):
        ASTM = "ASTM", "ASTM E1394/LIS2-A2"
        HL7 = "HL7", "HL7 v2.x over MLLP"
        SERIAL = "SERIAL", "Serial/RS-232 via TCP bridge"
        TCP = "TCP", "Raw TCP socket"

    class Direction(models.TextChoices):
        BIDIRECTIONAL = "BIDIRECTIONAL", "Bidirectional"
        HOST_TO_INSTRUMENT = "HOST_TO_INSTRUMENT", "Host → Instrument only"
        INSTRUMENT_TO_HOST = "INSTRUMENT_TO_HOST", "Instrument → Host only"

    class ConnectionStatus(models.TextChoices):
        CONNECTED = "CONNECTED", "Connected"
        DISCONNECTED = "DISCONNECTED", "Disconnected"
        ERROR = "ERROR", "Error"
        IDLE = "IDLE", "Idle (no recent activity)"

    # Relationships
    instrument = models.ForeignKey(
        Instrument,
        on_delete=models.CASCADE,
        related_name="channels",
        help_text="Instrument this channel connects to",
    )

    # Identity
    name = models.CharField(
        max_length=100,
        help_text="Channel display name (e.g., 'Primary ASTM', 'Backup HL7')",
    )

    # Protocol configuration
    protocol = models.CharField(
        max_length=20,
        choices=Protocol.choices,
        help_text="Communication protocol",
    )
    direction = models.CharField(
        max_length=30,
        choices=Direction.choices,
        default=Direction.BIDIRECTIONAL,
        help_text="Communication direction",
    )

    # Connection parameters
    host = models.CharField(
        max_length=255,
        help_text="Host address (IP or hostname) of the instrument or TCP bridge",
    )
    port = models.PositiveIntegerField(
        help_text="TCP port number",
    )
    encoding = models.CharField(
        max_length=20,
        default="ascii",
        help_text="Character encoding (ascii, utf-8, cp1252)",
    )

    # Protocol-specific configuration (JSONField for flexibility)
    config = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Protocol-specific settings. "
            "ASTM: {baud_rate, data_bits, stop_bits, parity, timeout_ms, frame_size}. "
            "HL7: {receiving_application, receiving_facility, version, ack_mode}. "
            "SERIAL: {baud_rate, data_bits, stop_bits, parity, flow_control}. "
            "TCP: {timeout_ms, keepalive_interval}."
        ),
    )

    # Message mapping (how to extract sample IDs, results from protocol messages)
    field_mapping = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Maps protocol fields to Vitora fields. "
            "E.g., {'sample_id_field': 'OBR.3', 'result_value_field': 'OBX.5', "
            "'test_code_field': 'OBX.3.1'}"
        ),
    )

    # Status
    is_active = models.BooleanField(default=True)
    connection_status = models.CharField(
        max_length=20,
        choices=ConnectionStatus.choices,
        default=ConnectionStatus.DISCONNECTED,
    )
    last_activity_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Instrument Channel"
        verbose_name_plural = "Instrument Channels"
        ordering = ["instrument__name", "name"]
        unique_together = [("instrument", "name")]
        indexes = [
            models.Index(fields=["instrument", "is_active"]),
            models.Index(fields=["connection_status"]),
            models.Index(fields=["protocol"]),
        ]

    def __str__(self):
        return f"{self.instrument.code} / {self.name} ({self.get_protocol_display()})"

    def update_status(self, status: str, error: str = "") -> None:
        """Update connection status with timestamp."""
        self.connection_status = status
        self.last_activity_at = timezone.now()
        if error:
            self.last_error = error
        elif status == self.ConnectionStatus.CONNECTED:
            self.last_error = ""
        self.save(update_fields=["connection_status", "last_activity_at", "last_error"])

    @property
    def connection_url(self) -> str:
        """Return formatted connection string."""
        return f"{self.host}:{self.port}"


class AnalyzerMessage(FacilityScopedModel):
    """
    Individual protocol message sent to/received from an analyzer.

    Every message exchanged with an analyzer is logged for audit,
    replay, and troubleshooting purposes.
    """

    class Direction(models.TextChoices):
        INBOUND = "INBOUND", "Instrument → Host"
        OUTBOUND = "OUTBOUND", "Host → Instrument"

    class MessageType(models.TextChoices):
        # ASTM message types
        QUERY = "QUERY", "Host Query (work order request)"
        RESULT = "RESULT", "Result Upload"
        ACK = "ACK", "Acknowledgement"
        NAK = "NAK", "Negative Acknowledgement"
        ORDER_DOWNLOAD = "ORDER_DOWNLOAD", "Order Download (work order)"
        # HL7 message types
        ORM = "ORM", "Order Message (ORM^O01)"
        ORU = "ORU", "Result Message (ORU^R01)"
        QRY = "QRY", "Query Message"
        ACK_HL7 = "ACK_HL7", "HL7 Acknowledgement"
        # Generic
        STATUS = "STATUS", "Status/Heartbeat"
        ERROR = "ERROR", "Error Message"
        RAW = "RAW", "Raw/Unknown"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Processing"
        SENT = "SENT", "Sent to Instrument"
        RECEIVED = "RECEIVED", "Received from Instrument"
        PARSED = "PARSED", "Parsed Successfully"
        APPLIED = "APPLIED", "Results Applied to Lab Order"
        FAILED = "FAILED", "Processing Failed"
        REJECTED = "REJECTED", "Rejected by Instrument (NAK)"
        TIMEOUT = "TIMEOUT", "Timed Out"

    # Relationships
    channel = models.ForeignKey(
        InstrumentChannel,
        on_delete=models.CASCADE,
        related_name="messages",
        help_text="Channel this message was sent/received on",
    )
    specimen = models.ForeignKey(
        Specimen,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analyzer_messages",
        help_text="Linked specimen (resolved from sample ID in message)",
    )
    lab_order_item = models.ForeignKey(
        LabOrderItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="analyzer_messages",
        help_text="Linked lab order item (resolved from test code in message)",
    )

    # Message metadata
    direction = models.CharField(
        max_length=10,
        choices=Direction.choices,
    )
    message_type = models.CharField(
        max_length=20,
        choices=MessageType.choices,
        default=MessageType.RAW,
    )
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Content
    raw_data = models.TextField(
        help_text="Raw protocol frame as received/sent (hex-encoded for binary)",
    )
    parsed_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Structured parse of the message content",
    )

    # Sample mapping
    sample_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Sample/barcode ID extracted from message",
    )
    test_code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Test/analyte code extracted from message",
    )
    result_value = models.CharField(
        max_length=200,
        blank=True,
        help_text="Result value extracted from message (if result type)",
    )
    result_unit = models.CharField(
        max_length=50,
        blank=True,
        help_text="Result unit extracted from message",
    )

    # Error tracking
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)

    # Timing
    timestamp = models.DateTimeField(
        default=timezone.now,
        help_text="When this message was sent/received",
    )
    processed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When processing completed",
    )

    # Audit
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Analyzer Message"
        verbose_name_plural = "Analyzer Messages"
        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["channel", "direction", "-timestamp"]),
            models.Index(fields=["status"]),
            models.Index(fields=["sample_id"]),
            models.Index(fields=["message_type"]),
            models.Index(fields=["-timestamp"]),
        ]

    def __str__(self):
        return (
            f"{self.get_direction_display()} {self.get_message_type_display()} "
            f"via {self.channel.name} [{self.get_status_display()}]"
        )

    def mark_parsed(self, parsed_data: dict) -> None:
        """Mark message as successfully parsed."""
        self.status = self.Status.PARSED
        self.parsed_data = parsed_data
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "parsed_data", "processed_at"])

    def mark_applied(self) -> None:
        """Mark message as applied (results created from this message)."""
        self.status = self.Status.APPLIED
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_at"])

    def mark_failed(self, error: str) -> None:
        """Mark message as failed with error details."""
        self.status = self.Status.FAILED
        self.error_message = error
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "error_message", "processed_at"])

    def mark_sent(self) -> None:
        """Mark outbound message as sent."""
        self.status = self.Status.SENT
        self.save(update_fields=["status"])

    def mark_timeout(self) -> None:
        """Mark message as timed out."""
        self.status = self.Status.TIMEOUT
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_at"])


class AnalyzerDriverTemplate(models.Model):
    """
    Pre-built configuration template for common laboratory analyzers.

    These templates can be applied to InstrumentChannel to auto-configure
    the protocol settings, field mappings, and message formats for known
    analyzer models.
    """

    class AnalyzerCategory(models.TextChoices):
        HEMATOLOGY = "HEMATOLOGY", "Hematology"
        CHEMISTRY = "CHEMISTRY", "Chemistry"
        IMMUNOASSAY = "IMMUNOASSAY", "Immunoassay"
        MICROBIOLOGY = "MICROBIOLOGY", "Microbiology"
        MOLECULAR = "MOLECULAR", "Molecular/PCR"
        URINALYSIS = "URINALYSIS", "Urinalysis"
        COAGULATION = "COAGULATION", "Coagulation"
        OTHER = "OTHER", "Other"

    # Identity
    name = models.CharField(
        max_length=200,
        unique=True,
        help_text="Template name (e.g., 'Sysmex XN-1000 ASTM')",
    )
    manufacturer = models.CharField(max_length=100)
    model_pattern = models.CharField(
        max_length=100,
        help_text="Model pattern this template applies to (e.g., 'XN-*', 'cobas c*')",
    )
    category = models.CharField(
        max_length=20,
        choices=AnalyzerCategory.choices,
    )
    description = models.TextField(blank=True)

    # Protocol defaults
    protocol = models.CharField(
        max_length=20,
        choices=InstrumentChannel.Protocol.choices,
    )
    default_port = models.PositiveIntegerField(
        help_text="Default communication port for this analyzer",
    )
    default_encoding = models.CharField(max_length=20, default="ascii")

    # Config template
    default_config = models.JSONField(
        default=dict,
        help_text="Default protocol configuration for this analyzer model",
    )
    default_field_mapping = models.JSONField(
        default=dict,
        help_text="Default field mapping for extracting results",
    )

    # Metadata
    is_active = models.BooleanField(default=True)
    notes = models.TextField(
        blank=True,
        help_text="Implementation notes, known quirks, firmware requirements",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Analyzer Driver Template"
        verbose_name_plural = "Analyzer Driver Templates"
        ordering = ["manufacturer", "name"]

    def __str__(self):
        return f"{self.manufacturer} {self.name} ({self.get_protocol_display()})"

    def apply_to_channel(self, channel: InstrumentChannel) -> None:
        """Apply this template's defaults to an InstrumentChannel."""
        channel.protocol = self.protocol
        channel.port = self.default_port
        channel.encoding = self.default_encoding
        channel.config = {**self.default_config, **channel.config}
        channel.field_mapping = {**self.default_field_mapping, **channel.field_mapping}
        channel.save()

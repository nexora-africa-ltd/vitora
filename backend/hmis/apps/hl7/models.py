"""
HL7 v2 message persistence models.

Provides HL7Endpoint (facility-scoped connection config) and HL7Message
(outbound/inbound message tracking with status and retry support).
"""

from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel


class HL7EndpointType(models.TextChoices):
    """Type of HL7 endpoint."""

    LIS = "LIS", "Laboratory Information System"
    RIS = "RIS", "Radiology Information System"
    PAS = "PAS", "Patient Administration System"
    PHARMACY = "PHARMACY", "Pharmacy System"
    OTHER = "OTHER", "Other"


class HL7Endpoint(FacilityScopedModel):
    """
    Facility-scoped HL7/MLLP endpoint configuration.

    Each facility can configure one or more external systems to
    communicate with via HL7 v2 over MLLP. The queue service
    resolves the appropriate endpoint at send time based on
    the facility context.
    """

    name = models.CharField(
        max_length=150,
        help_text="Human-readable name (e.g., 'Lancet Lab', 'PathCare')",
    )
    endpoint_type = models.CharField(
        max_length=20,
        choices=HL7EndpointType.choices,
        default=HL7EndpointType.LIS,
    )
    mllp_host = models.CharField(
        max_length=255,
        help_text="MLLP hostname or IP address",
    )
    mllp_port = models.PositiveIntegerField(
        default=2575,
        help_text="MLLP TCP port",
    )
    receiving_application = models.CharField(
        max_length=100,
        default="LAB_LIS",
        help_text="HL7 MSH-5 Receiving Application",
    )
    receiving_facility = models.CharField(
        max_length=100,
        default="EXTERNAL_LAB",
        help_text="HL7 MSH-6 Receiving Facility",
    )
    sending_application = models.CharField(
        max_length=100,
        default="VITORA_HMIS",
        help_text="HL7 MSH-3 Sending Application",
    )
    sending_facility = models.CharField(
        max_length=100,
        blank=True,
        help_text="HL7 MSH-4 Sending Facility (defaults to facility name)",
    )
    lis_code_system = models.CharField(
        max_length=50,
        default="LIS_DEFAULT",
        help_text="External code system for test mapping",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this endpoint is currently active for message routing",
    )
    use_ssl = models.BooleanField(
        default=False,
        help_text="Use TLS/SSL for MLLP connection",
    )
    timeout = models.FloatField(
        default=30.0,
        help_text="Connection timeout in seconds",
    )
    max_retries = models.PositiveIntegerField(
        default=5,
        help_text="Maximum retry attempts for failed messages",
    )
    notes = models.TextField(
        blank=True,
        help_text="Internal notes about this endpoint",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "HL7 Endpoint"
        verbose_name_plural = "HL7 Endpoints"
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "mllp_host", "mllp_port"],
                name="unique_facility_endpoint",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.mllp_host}:{self.mllp_port})"

    @property
    def address(self) -> str:
        """Return host:port string."""
        return f"{self.mllp_host}:{self.mllp_port}"


class HL7MessageDirection(models.TextChoices):
    OUTBOUND = "OUT", "Outbound"
    INBOUND = "IN", "Inbound"


class HL7MessageStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENDING = "SENDING", "Sending"
    SENT = "SENT", "Sent"
    ACKNOWLEDGED = "ACK", "Acknowledged"
    FAILED = "FAILED", "Failed"
    DEAD_LETTER = "DEAD", "Dead Letter"


class HL7Message(FacilityScopedModel):
    """
    Persistent record of HL7 v2 messages.

    Tracks outbound and inbound HL7 messages with status, retry
    counts, and error tracking. Used by the HL7 message queue for
    reliable delivery.
    """

    message_type = models.CharField(
        max_length=20,
        help_text="HL7 message type (e.g., 'ADT^A01', 'ORM^O01', 'ORU^R01')",
    )
    direction = models.CharField(
        max_length=3,
        choices=HL7MessageDirection.choices,
        default=HL7MessageDirection.OUTBOUND,
    )
    raw_message = models.TextField(
        help_text="Complete HL7 v2 message content",
    )
    message_control_id = models.CharField(
        max_length=50,
        db_index=True,
        help_text="MSH-10 Message Control ID",
    )
    status = models.CharField(
        max_length=10,
        choices=HL7MessageStatus.choices,
        default=HL7MessageStatus.PENDING,
        db_index=True,
    )
    retry_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of send attempts",
    )
    max_retries = models.PositiveIntegerField(
        default=5,
        help_text="Maximum retry attempts before dead-letter",
    )
    last_error = models.TextField(
        blank=True,
        default="",
        help_text="Error message from last send attempt",
    )
    ack_code = models.CharField(
        max_length=5,
        blank=True,
        default="",
        help_text="ACK code from response (AA, AE, AR)",
    )

    # Linking to source record
    resource_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Source model type (e.g., 'Patient', 'Admission')",
    )
    resource_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Source record ID",
    )

    # Destination
    endpoint = models.ForeignKey(
        HL7Endpoint,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="messages",
        help_text="Resolved HL7 endpoint (facility-scoped)",
    )
    destination_host = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Target MLLP host",
    )
    destination_port = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Target MLLP port",
    )

    # Timestamps
    next_retry_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When to attempt next retry",
    )
    sent_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When message was successfully sent",
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When ACK was received",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "HL7 Message"
        verbose_name_plural = "HL7 Messages"
        indexes = [
            models.Index(fields=["status", "next_retry_at"]),
            models.Index(fields=["resource_type", "resource_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.message_type} [{self.status}] {self.message_control_id}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    @property
    def is_retryable(self) -> bool:
        """Check if the message can be retried."""
        return self.status == HL7MessageStatus.FAILED and self.retry_count < self.max_retries

    def mark_dead_letter(self) -> None:
        """Move to dead letter after exhausting retries."""
        self.status = HL7MessageStatus.DEAD_LETTER
        self.save(update_fields=["status", "updated_at"])

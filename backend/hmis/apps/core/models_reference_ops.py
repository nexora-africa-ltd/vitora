# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models reference ops for Vitora HMIS.

What this file is for:
- Implement models reference ops logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from hmis.apps.core.models_audit_sync import TimeStampedModel


class Notification(models.Model):
    """
    In-app notification for users.

    Supports notifications for lab results, appointments, and other system events.
    Priority levels determine urgency and delivery method (e.g., email for critical).

    Attributes:
        user: User receiving the notification
        notification_type: Category of notification (e.g., 'lab_result', 'appointment')
        priority: Urgency level (low, normal, high, critical)
        title: Short notification title (max 200 chars)
        message: Full notification message
        related_model: Optional model name this notification relates to
        related_id: Optional ID of related object
        action_url: Optional URL for user action
        is_read: Whether notification has been read
        read_at: When notification was marked as read
        created_at: When notification was created
    """

    class Priority(models.TextChoices):
        """Priority levels for notifications."""

        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    id = models.BigAutoField(primary_key=True)

    # Core fields
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        help_text="User receiving this notification",
    )
    notification_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Category of notification (e.g., 'lab_result', 'appointment')",
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.NORMAL,
        db_index=True,
        help_text="Urgency level - critical notifications may trigger emails",
    )
    title = models.CharField(max_length=200, help_text="Short notification title")
    message = models.TextField(help_text="Full notification message")

    # Link to related object
    related_model = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Model name this notification relates to (e.g., 'LabOrder')",
    )
    related_id = models.BigIntegerField(null=True, blank=True, help_text="ID of the related object")
    action_url = models.CharField(
        max_length=500, blank=True, default="", help_text="URL for user action (e.g., view results)"
    )

    # Read status
    is_read = models.BooleanField(
        default=False, db_index=True, help_text="Whether notification has been read"
    )
    read_at = models.DateTimeField(
        null=True, blank=True, help_text="When notification was marked as read"
    )

    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True, db_index=True, help_text="When notification was created"
    )

    class Meta:
        """Meta options for Notification model."""

        ordering = ["-created_at"]  # Newest first
        indexes = [
            models.Index(fields=["user", "is_read", "-created_at"]),
            models.Index(fields=["user", "notification_type"]),
            models.Index(fields=["priority", "-created_at"]),
        ]
        verbose_name = "Notification"
        verbose_name_plural = "Notifications"

    def __str__(self) -> str:
        """String representation of the notification."""
        return f"{self.user.username}: {self.title}"

    def mark_as_read(self):
        """Mark notification as read with timestamp."""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=["is_read", "read_at"])


class SMSDeliveryCallback(TimeStampedModel):
    """Stores inbound SMS delivery callbacks from providers."""

    class DeliveryStatus(models.TextChoices):
        DELIVERED = "DELIVERED", "Delivered"
        FAILED = "FAILED", "Failed"
        PENDING = "PENDING", "Pending"
        UNKNOWN = "UNKNOWN", "Unknown"

    provider = models.CharField(max_length=40, default="africastalking", db_index=True)
    provider_message_id = models.CharField(max_length=120, blank=True, default="", db_index=True)
    status = models.CharField(max_length=80, blank=True, default="", db_index=True)
    delivery_status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.UNKNOWN,
        db_index=True,
    )
    phone_last4 = models.CharField(max_length=4, blank=True, default="", db_index=True)
    network_code = models.CharField(max_length=20, blank=True, default="")
    retry_count = models.PositiveIntegerField(default=0)
    failure_reason = models.TextField(blank=True, default="")
    callback_payload = models.JSONField(default=dict, blank=True)
    callback_ip = models.GenericIPAddressField(null=True, blank=True)
    token_valid = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        msg_id = self.provider_message_id or "n/a"
        return f"SMS callback {self.provider} {msg_id} {self.delivery_status}"


class PushSubscription(models.Model):
    """
    Web Push subscription for browser push notifications.

    Stores the Push API subscription info (endpoint, p256dh key, auth secret)
    returned by PushManager.subscribe() in the browser. Used by pywebpush to
    send notifications via the Web Push protocol (RFC 8030).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField(max_length=500, help_text="Push service endpoint URL")
    p256dh = models.CharField(max_length=200, help_text="Client public key (base64url)")
    auth = models.CharField(max_length=200, help_text="Auth secret (base64url)")
    user_agent = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["user", "endpoint"], name="unique_push_subscription"),
        ]
        verbose_name = "Push Subscription"
        verbose_name_plural = "Push Subscriptions"

    def __str__(self) -> str:
        return f"{self.user.username}: {self.endpoint[:60]}..."


class IdempotencyKey(models.Model):
    """
    Track idempotent API requests to prevent duplicate operations.

    This model stores idempotency keys for critical operations like
    patient registration, admission, and encounter creation.

    When a client submits a request with an X-Idempotency-Key header,
    the system:
    1. Checks if the key exists for this user
    2. If yes, returns the cached response (idempotent replay)
    3. If no, processes the request and caches the response

    Keys are automatically cleaned up after 24 hours.

    Attributes:
        key: The idempotency key (UUID from client)
        user: The user who made the request
        resource_type: Type of resource created (Patient, Encounter, etc.)
        resource_id: ID of the created resource
        response_status: HTTP status code of the original response
        response_data: JSON response data to replay
        created_at: When the key was created
    """

    key = models.CharField(
        max_length=64,
        help_text="Unique idempotency key from client (usually UUID)",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="idempotency_keys",
        help_text="User who made the request",
    )
    resource_type = models.CharField(
        max_length=50,
        help_text="Type of resource created (e.g., Patient, Encounter)",
    )
    resource_id = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="ID of the created resource",
    )
    response_status = models.IntegerField(
        help_text="HTTP status code of the original response",
    )
    response_data = models.JSONField(
        default=dict,
        help_text="Response data to replay on duplicate requests",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this key was created",
    )

    class Meta:
        """Meta options for IdempotencyKey model."""

        verbose_name = "Idempotency Key"
        verbose_name_plural = "Idempotency Keys"
        constraints = [
            # Each user can only use each key once
            models.UniqueConstraint(
                fields=["key", "user"],
                name="unique_idempotency_key_per_user",
            ),
        ]
        indexes = [
            models.Index(fields=["key", "user"]),
            models.Index(fields=["created_at"]),  # For cleanup queries
        ]

    def __str__(self) -> str:
        """String representation of the idempotency key."""
        return f"{self.user.username}: {self.key[:16]}... -> {self.resource_type}"

    @classmethod
    def get_or_none(cls, key: str, user) -> "IdempotencyKey | None":
        """
        Get an existing idempotency key or None.

        Args:
            key: The idempotency key string
            user: The user making the request

        Returns:
            IdempotencyKey if found, None otherwise
        """
        try:
            return cls.objects.get(key=key, user=user)
        except cls.DoesNotExist:
            return None

    @classmethod
    def cleanup_old_keys(cls, hours: int = 24):
        """
        Delete idempotency keys older than specified hours.

        Args:
            hours: Number of hours after which keys are considered stale

        Returns:
            Number of deleted keys
        """
        from datetime import timedelta

        cutoff = timezone.now() - timedelta(hours=hours)
        deleted, _ = cls.objects.filter(created_at__lt=cutoff).delete()
        return deleted


class CodeSystem(models.Model):
    """
    Registry of code systems used in Vitora HMIS.

    This model provides a centralized registry of all vocabularies and code systems
    used within Vitora, including internal codes (like vitora-lab) and external
    standards (like ICD-10, LOINC, SHA tariffs).

    Used for:
    - FHIR exports to reference proper CodeSystem URIs
    - Self-documenting API responses
    - Terminology governance and version tracking

    Example:
        CodeSystem(slug='vitora-lab', uri='https://vitora.health/fhir/CodeSystem/laboratory')
        CodeSystem(slug='icd-10', uri='http://hl7.org/fhir/sid/icd-10')

    Attributes:
        slug: Unique identifier used in ExternalCodeMapping.code_system
        name: Human-readable name
        uri: FHIR CodeSystem URI for interoperability
        version: Optional version string (e.g., '2025', 'R4')
        publisher: Organization/authority responsible for the code system
        description: Detailed description of the code system
        is_internal: Whether this is a Vitora-managed vocabulary
        is_active: Whether this code system is currently in use
    """

    slug = models.SlugField(
        unique=True,
        max_length=100,
        help_text="Unique identifier (e.g., 'vitora-lab', 'icd-10', 'loinc')",
    )
    name = models.CharField(
        max_length=100,
        help_text="Human-readable name of the code system",
    )
    uri = models.URLField(
        max_length=255,
        help_text="FHIR CodeSystem URI (e.g., 'http://hl7.org/fhir/sid/icd-10')",
    )
    version = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Code system version (e.g., '2025', 'R4')",
    )
    publisher = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Organization responsible for the code system",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed description of the code system",
    )
    is_internal = models.BooleanField(
        default=False,
        help_text="Whether this is a Vitora-managed vocabulary",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this code system is currently in use",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this code system was registered",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When this code system was last updated",
    )

    class Meta:
        """Meta options for CodeSystem model."""

        verbose_name = "Code System"
        verbose_name_plural = "Code Systems"
        ordering = ["slug"]

    def __str__(self) -> str:
        """String representation of the code system."""
        return f"{self.name} ({self.slug})"


class ExternalCodeMapping(models.Model):
    """
    Maps external system codes to internal Vitora entities.

    This model provides a translation layer between external systems (LIS vendors,
    SHA/NHIF tariffs, LOINC, etc.) and internal Vitora entities (TestCatalog,
    ICD10Code, future ProcedureCatalog, DrugCatalog, etc.).

    Supports any model via GenericForeignKey, enabling flexible mapping without
    requiring changes to domain models.

    Example usage:
        # In HL7 ORU parser
        test = ExternalCodeMapping.resolve('LIS_ACME', '12345')
        if test:
            LabResult.objects.create(order_item=item, ...)

    Attributes:
        code_system: External system identifier (e.g., 'LIS_ACME', 'SHA_TARIFF')
        external_code: Code in the external system
        external_display: Display name in external system (for reference)
        internal_object: The internal Vitora entity (via GenericForeignKey)
        relationship: How the codes relate (equivalent, broader, narrower, related)
        is_active: Whether this mapping is currently active
        notes: Additional notes about the mapping
    """

    # Relationship type choices
    RELATIONSHIP_CHOICES = [
        ("EQUIVALENT", "Equivalent"),
        ("BROADER", "Broader"),
        ("NARROWER", "Narrower"),
        ("RELATED", "Related"),
    ]

    # External system identifier
    code_system = models.CharField(
        max_length=100,
        db_index=True,
        help_text="External system ID, e.g., 'LIS_ACME', 'SHA_TARIFF', 'NHIF_2025', 'LOINC'",
    )
    code_system_ref = models.ForeignKey(
        "CodeSystem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mappings",
        help_text="Optional link to CodeSystem registry for FHIR compliance",
    )
    external_code = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Code in the external system",
    )
    external_display = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Display name in external system (for reference)",
    )

    # Internal Vitora entity (generic)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        help_text="Type of internal Vitora entity",
    )
    object_id = models.PositiveIntegerField(
        help_text="ID of the internal Vitora entity",
    )
    internal_object = GenericForeignKey("content_type", "object_id")

    # Mapping metadata
    relationship = models.CharField(
        max_length=20,
        choices=RELATIONSHIP_CHOICES,
        default="EQUIVALENT",
        help_text="How the external code relates to the internal entity",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this mapping is currently active",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes about this mapping",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When this mapping was created",
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="When this mapping was last updated",
    )

    class Meta:
        """Meta options for ExternalCodeMapping model."""

        unique_together = ["code_system", "external_code"]
        indexes = [
            models.Index(fields=["code_system", "external_code"]),
            models.Index(fields=["content_type", "object_id"]),
        ]
        verbose_name = "External Code Mapping"
        verbose_name_plural = "External Code Mappings"

    def __str__(self) -> str:
        """String representation of the mapping."""
        return f"{self.code_system}:{self.external_code} → {self.internal_object}"

    @classmethod
    def resolve(cls, code_system: str, external_code: str):
        """
        Resolve an external code to its internal Vitora object.

        Args:
            code_system: The external system identifier
            external_code: The code in the external system

        Returns:
            The internal Vitora object, or None if not mapped.
        """
        try:
            mapping = cls.objects.select_related("content_type").get(
                code_system=code_system,
                external_code=external_code,
                is_active=True,
            )
            return mapping.internal_object
        except cls.DoesNotExist:
            return None

    @classmethod
    def resolve_or_raise(cls, code_system: str, external_code: str):
        """
        Resolve an external code or raise DoesNotExist.

        Args:
            code_system: The external system identifier
            external_code: The code in the external system

        Returns:
            The internal Vitora object.

        Raises:
            ExternalCodeMapping.DoesNotExist: If no active mapping exists.
        """
        mapping = cls.objects.select_related("content_type").get(
            code_system=code_system,
            external_code=external_code,
            is_active=True,
        )
        return mapping.internal_object

    @classmethod
    def get_mappings_for_object(cls, obj):
        """
        Get all external mappings for a given internal object.

        Args:
            obj: The internal Vitora object

        Returns:
            QuerySet of ExternalCodeMapping instances.
        """
        content_type = ContentType.objects.get_for_model(obj)
        return cls.objects.filter(
            content_type=content_type,
            object_id=obj.pk,
            is_active=True,
        )

    @classmethod
    def get_external_code(cls, obj, code_system: str) -> str | None:
        """
        Get the external code for an internal object in a specific code system.

        Args:
            obj: The internal Vitora object
            code_system: The external system identifier

        Returns:
            The external code string, or None if not mapped.
        """
        content_type = ContentType.objects.get_for_model(obj)
        try:
            mapping = cls.objects.get(
                content_type=content_type,
                object_id=obj.pk,
                code_system=code_system,
                is_active=True,
            )
            return mapping.external_code
        except cls.DoesNotExist:
            return None

    def get_fhir_uri(self) -> str | None:
        """
        Get the FHIR CodeSystem URI for this mapping.

        Returns the URI from the linked CodeSystem if available,
        otherwise returns None.

        Returns:
            FHIR CodeSystem URI string, or None if not linked.
        """
        if self.code_system_ref:
            return self.code_system_ref.uri
        return None


class FeatureFlag(models.Model):
    """
    Runtime-togglable feature flag.

    Allows facilities to enable/disable features without redeployment.
    Managed exclusively via Django admin — the API is read-only.
    """

    name = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text="Unique feature name (e.g., smart_autopopulate)",
    )
    is_enabled = models.BooleanField(
        default=False,
        help_text="Whether the feature is currently enabled",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Human-readable description of what this flag controls",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Feature Flag"
        verbose_name_plural = "Feature Flags"

    def __str__(self) -> str:
        status = "enabled" if self.is_enabled else "disabled"
        return f"{self.name} ({status})"

    @classmethod
    def is_flag_enabled(cls, name: str) -> bool:
        """Check if a feature flag is enabled. Returns False for unknown flags."""
        try:
            return cls.objects.values_list("is_enabled", flat=True).get(name=name)
        except cls.DoesNotExist:
            return False

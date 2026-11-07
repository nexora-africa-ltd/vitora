# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Core models audit sync for Vitora HMIS.

What this file is for:
- Implement models audit sync logic for the core domain.

How to use it:
- Import classes and functions from this module in Django app code and tests.

Supported inputs/args:
- Python imports and Django ORM/runtime inputs; no standalone CLI arguments.
"""

import hashlib
import hmac
import json
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

WEBSOCKET_TICKET_LIFETIME = timedelta(minutes=2)


class WebSocketTicket(models.Model):
    """One-time, short-lived credential for authenticated WebSocket upgrades."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="websocket_tickets",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField(db_index=True)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["expires_at", "consumed_at"])]

    def __str__(self) -> str:
        """Return a safe administrative representation without revealing the ticket."""
        return f"WebSocket ticket for user {self.user_id}"

    @classmethod
    def issue(cls, user) -> str:
        """Create an opaque ticket while persisting only its SHA-256 digest."""
        token = secrets.token_urlsafe(32)
        cls.objects.create(
            user=user,
            token_hash=cls.hash_token(token),
            expires_at=timezone.now() + WEBSOCKET_TICKET_LIFETIME,
        )
        return token

    @classmethod
    def consume(cls, token: str):
        """Atomically consume a valid ticket and return its user, or ``None``."""
        if not token:
            return None

        now = timezone.now()
        with transaction.atomic():
            ticket = (
                cls.objects.select_for_update()
                .select_related("user")
                .filter(
                    token_hash=cls.hash_token(token),
                    consumed_at__isnull=True,
                    expires_at__gt=now,
                )
                .first()
            )
            if ticket is None or not ticket.user.is_active:
                return None
            ticket.consumed_at = now
            ticket.save(update_fields=["consumed_at"])
            return ticket.user

    @staticmethod
    def hash_token(token: str) -> str:
        """Return the fixed-length digest used for ticket lookup."""
        return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AuditLog(models.Model):
    """
    Audit log model for tracking user actions and data access.

    This model is designed for Kenya Data Protection Act (2019) compliance,
    which requires maintaining detailed records of data processing activities.

    Attributes:
        user: The user who performed the action (nullable for anonymous/system actions)
        action: The type of action performed (e.g., 'patient_view', 'login_success')
        resource_type: The type of resource accessed (e.g., 'Patient', 'Encounter')
        resource_id: The ID of the specific resource accessed
        timestamp: When the action occurred
        ip_address: IP address of the request
        user_agent: User agent string from the request
        details: JSON field for additional context (changes, purpose, etc.)
        patient_id: Direct reference to patient for sensitive access tracking
    """

    # Action type choices for common operations
    ACTION_CHOICES = [
        # Authentication actions
        ("login_success", "Login Success"),
        ("login_failed", "Login Failed"),
        ("account_locked", "Account Locked"),
        ("account_unlocked", "Account Unlocked"),
        ("session_idle_revoked", "Session Idle Revoked"),
        ("session_revoked", "Session Revoked"),
        ("logout", "Logout"),
        ("token_refresh", "Token Refresh"),
        # Patient actions
        ("patient_create", "Patient Create"),
        ("patient_view", "Patient View"),
        ("patient_update", "Patient Update"),
        ("patient_delete", "Patient Delete"),
        ("patient_list", "Patient List"),
        # Sensitive access
        ("view_sensitive_patient", "View Sensitive Patient"),
        ("sensitive_access_denied", "Sensitive Access Denied"),
        # Encounter actions
        ("encounter_create", "Encounter Create"),
        ("encounter_view", "Encounter View"),
        ("encounter_update", "Encounter Update"),
        ("encounter_delete", "Encounter Delete"),
        # Emergency access (break-glass)
        ("emergency_access_invoke", "Emergency Access Invoked"),
        ("emergency_access_approved", "Emergency Access Approved"),
        ("emergency_access_revoked", "Emergency Access Revoked"),
        ("emergency_access_closed", "Emergency Access Closed"),
        ("emergency_access_resource_accessed", "Emergency Access Resource Accessed"),
        ("emergency_access_review_overdue", "Emergency Access Review Overdue"),
        ("encounter_emergency_deferred_overdue", "Encounter Emergency Deferred Overdue"),
        ("triage_emergency_deferred_overdue", "Triage Emergency Deferred Overdue"),
        ("triage_emergency_deferred_completed", "Triage Emergency Deferred Completed"),
        # System actions
        ("system_error", "System Error"),
        ("data_export", "Data Export"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        help_text="User who performed the action",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        help_text="Organization context when action occurred.",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
        help_text="Facility context when action occurred.",
    )
    action = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Type of action performed",
    )
    resource_type = models.CharField(
        max_length=100,
        blank=True,
        default="",
        db_index=True,
        help_text="Type of resource accessed (e.g., Patient, Encounter)",
    )
    resource_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="ID of the resource accessed",
    )
    timestamp = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When the action occurred",
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of the request",
    )
    user_agent = models.TextField(
        blank=True,
        default="",
        help_text="User agent string from the request",
    )
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional context (changes, purpose, legal basis, etc.)",
    )
    patient_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Patient ID for sensitive access tracking (denormalized for query performance)",
    )

    # Hash chaining fields for tamper-resistant audit log (DHA Sprint 3.C)
    HASH_ALGO_SHA256 = "SHA256"
    HASH_ALGO_HMAC_SHA256 = "HMAC_SHA256"
    HASH_ALGORITHM_CHOICES = [
        (HASH_ALGO_SHA256, "SHA-256"),
        (HASH_ALGO_HMAC_SHA256, "HMAC-SHA256"),
    ]

    sequence_number = models.BigIntegerField(
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Monotonic sequence number for hash chain ordering",
    )
    entry_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="SHA-256 hex digest of this audit entry",
    )
    previous_hash = models.CharField(
        max_length=64,
        blank=True,
        default="",
        help_text="SHA-256 hash of the previous entry in the chain",
    )
    hash_algorithm = models.CharField(
        max_length=20,
        choices=HASH_ALGORITHM_CHOICES,
        null=True,
        blank=True,
        db_index=True,
        help_text="Hash algorithm used for this entry",
    )

    GENESIS_HASH = "0" * 64

    class Meta:
        """Meta options for AuditLog model."""

        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["patient_id", "timestamp"]),
        ]
        verbose_name = "Audit Log"
        verbose_name_plural = "Audit Logs"

    def __str__(self) -> str:
        """String representation of the audit log entry."""
        user_str = self.user.username if self.user else "Anonymous"
        return f"{self.timestamp.isoformat()} - {user_str} - {self.action}"

    @classmethod
    def log(
        cls,
        action: str,
        user=None,
        resource_type: str = "",
        resource_id: int = None,
        ip_address: str = None,
        user_agent: str = "",
        details: dict = None,
        patient_id: int = None,
        facility=None,
        organization=None,
        request=None,
    ):
        """
        Create an audit log entry.

        Args:
            action: Type of action performed
            user: User performing the action (optional)
            resource_type: Type of resource accessed
            resource_id: ID of the resource
            ip_address: Client IP address
            user_agent: Client user agent
            details: Additional context dictionary
            patient_id: Patient ID for sensitive access tracking
            facility: Facility context (or auto-resolved from request)
            organization: Organization context (or auto-resolved from request)
            request: HTTP request to auto-resolve facility/organization from TenantMiddleware

        Returns:
            AuditLog: The created audit log entry
        """
        # Auto-resolve facility/organization from request if not explicitly provided
        if request is not None:
            if facility is None:
                facility = getattr(request, "facility", None)
            if organization is None:
                organization = getattr(request, "organization", None)

        # Fallback: resolve organization from user's staff profile
        if organization is None and user is not None:
            profile = getattr(user, "staff_profile", None)
            if profile is not None:
                org = getattr(profile, "organization", None)
                if org is not None:
                    organization = org
                    # Also resolve facility if still missing
                    if facility is None:
                        fac = getattr(profile, "primary_facility", None)
                        if fac is not None:
                            facility = fac

        resolved_details = details or {}

        # Redact PII values before persisting to audit log
        from hmis.apps.core.pii import redact_pii

        resolved_details = redact_pii(resolved_details)

        with transaction.atomic():
            # Get the last entry's hash and sequence for chaining.
            # Use select_for_update on databases that support it (PostgreSQL).
            # SQLite uses serialized transactions inherently.
            from django.db import connection

            qs = cls.objects.filter(sequence_number__isnull=False).order_by("-sequence_number")
            if connection.vendor != "sqlite":
                qs = qs.select_for_update()
            last_entry = qs.values("sequence_number", "entry_hash").first()

            if last_entry:
                next_seq = last_entry["sequence_number"] + 1
                prev_hash = last_entry["entry_hash"]
            else:
                next_seq = 1
                prev_hash = cls.GENESIS_HASH

            ts = timezone.now()
            user_id = user.pk if user else 0

            entry_hash = cls.compute_hash(
                sequence_number=next_seq,
                previous_hash=prev_hash,
                action=action,
                user_id=user_id,
                timestamp=ts,
                resource_type=resource_type,
                resource_id=resource_id,
                details=resolved_details,
                hash_algorithm=cls.HASH_ALGO_HMAC_SHA256,
            )

            return cls.objects.create(
                user=user,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                timestamp=ts,
                ip_address=ip_address,
                user_agent=user_agent,
                details=resolved_details,
                patient_id=patient_id,
                facility=facility,
                organization=organization,
                sequence_number=next_seq,
                previous_hash=prev_hash,
                entry_hash=entry_hash,
                hash_algorithm=cls.HASH_ALGO_HMAC_SHA256,
            )

    @staticmethod
    def compute_hash(
        *,
        sequence_number: int,
        previous_hash: str,
        action: str,
        user_id: int,
        timestamp,
        resource_type: str,
        resource_id: int | None,
        details: dict,
        hash_algorithm: str | None = None,
    ) -> str:
        """Compute hash for an audit log entry using the configured algorithm."""
        payload = (
            f"{sequence_number}|{previous_hash}|{action}|{user_id}"
            f"|{timestamp.isoformat()}|{resource_type}|{resource_id}"
            f"|{json.dumps(details, sort_keys=True, default=str)}"
        )

        algorithm = hash_algorithm or AuditLog.HASH_ALGO_HMAC_SHA256
        if algorithm == AuditLog.HASH_ALGO_SHA256:
            return hashlib.sha256(payload.encode("utf-8")).hexdigest()

        chain_key = getattr(settings, "AUDIT_LOG_CHAIN_KEY", "") or getattr(
            settings, "SECRET_KEY", ""
        )
        return hmac.new(
            chain_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()


class FrontendEvent(models.Model):
    """
    Frontend event logging for tracking user interactions in the web/mobile apps.

    This captures clinical workflow events like:
    - Viewing a patient record
    - Opening an encounter
    - Updating diagnosis certainty
    - Saving form changes

    These events complement AuditLog by providing more granular UX tracking
    and support offline-first sync (events can be batched from the frontend).
    """

    # Event type categories
    EVENT_TYPES = [
        # Navigation events
        ("page_view", "Page View"),
        ("modal_open", "Modal Opened"),
        ("tab_switch", "Tab Switch"),
        # Clinical workflow events
        ("encounter_open", "Encounter Opened"),
        ("encounter_save", "Encounter Saved"),
        ("encounter_finalize", "Encounter Finalized"),
        ("diagnosis_add", "Diagnosis Added"),
        ("diagnosis_update", "Diagnosis Updated"),
        ("diagnosis_remove", "Diagnosis Removed"),
        ("lab_order_create", "Lab Order Created"),
        ("lab_result_view", "Lab Result Viewed"),
        ("prescription_create", "Prescription Created"),
        ("prescription_dispense", "Prescription Dispensed"),
        # Patient events
        ("patient_view", "Patient Viewed"),
        ("patient_search", "Patient Search"),
        # Form events
        ("form_start", "Form Started"),
        ("form_save", "Form Saved"),
        ("form_submit", "Form Submitted"),
        ("form_error", "Form Error"),
        # Offline events
        ("offline_queue", "Queued Offline"),
        ("offline_sync", "Synced from Offline"),
        # Other
        ("custom", "Custom Event"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="frontend_events",
        help_text="User who triggered the event",
    )
    event_type = models.CharField(
        max_length=50,
        choices=EVENT_TYPES,
        db_index=True,
        help_text="Type of frontend event",
    )
    resource_type = models.CharField(
        max_length=100,
        blank=True,
        default="",
        db_index=True,
        help_text="Type of resource (e.g., Patient, Encounter)",
    )
    resource_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="ID of the resource",
    )
    # Client-side timestamp (when event actually occurred)
    client_timestamp = models.DateTimeField(
        help_text="When the event occurred on the client",
    )
    # Server-side timestamp (when event was received)
    server_timestamp = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When the event was received by the server",
    )
    # Session/device info
    session_id = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Client session identifier for grouping events",
    )
    device_type = models.CharField(
        max_length=20,
        blank=True,
        default="web",
        help_text="Device type (web, desktop, mobile)",
    )
    # Additional context
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional event details (page, component, metadata)",
    )
    # Network status when event occurred
    was_offline = models.BooleanField(
        default=False,
        help_text="Whether the event occurred while offline",
    )

    class Meta:
        ordering = ["-server_timestamp"]
        indexes = [
            models.Index(fields=["user", "server_timestamp"]),
            models.Index(fields=["event_type", "server_timestamp"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["session_id"]),
        ]
        verbose_name = "Frontend Event"
        verbose_name_plural = "Frontend Events"

    def __str__(self):
        return f"{self.event_type} by {self.user} at {self.client_timestamp}"


class ActivityFeed(models.Model):
    """
    Real-time activity feed for dashboard.

    Provides a user-friendly activity stream for the dashboard,
    capturing key events across all HMIS modules.

    Unlike AuditLog (which is for compliance), ActivityFeed is designed
    for user-facing notifications and dashboard widgets.
    """

    ACTIVITY_TYPES = [
        ("patient", "Patient"),
        ("encounter", "Encounter"),
        ("laboratory", "Laboratory"),
        ("pharmacy", "Pharmacy"),
        ("billing", "Billing"),
        ("triage", "Triage"),
        ("inpatient", "Inpatient"),
        ("prescription", "Prescription"),
        ("appointment", "Appointment"),
        ("system", "System"),
    ]

    activity_type = models.CharField(
        max_length=20,
        choices=ACTIVITY_TYPES,
        db_index=True,
        help_text="Type of activity (module)",
    )
    action = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Action performed (e.g., registered, completed, dispensed)",
    )
    title = models.CharField(
        max_length=200,
        help_text="Human-readable title for the activity",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Additional description or context",
    )
    timestamp = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When the activity occurred",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activity_feed",
        help_text="User who performed the action",
    )
    resource_type = models.CharField(
        max_length=50,
        help_text="Type of resource (e.g., Patient, LabOrder)",
    )
    resource_id = models.PositiveIntegerField(
        help_text="ID of the resource",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional structured data (e.g., MRN, patient name)",
    )

    class Meta:
        """Meta options for ActivityFeed model."""

        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["activity_type", "-timestamp"]),
            models.Index(fields=["-timestamp"]),
        ]
        verbose_name = "Activity Feed"
        verbose_name_plural = "Activity Feed Entries"

    def __str__(self) -> str:
        """String representation of the activity."""
        return f"{self.timestamp.isoformat()} - {self.activity_type}: {self.title}"

    @classmethod
    def log_activity(
        cls,
        activity_type: str,
        action: str,
        title: str,
        resource_type: str,
        resource_id: int,
        user=None,
        description: str = "",
        metadata: dict = None,
    ):
        """
        Create an activity feed entry.

        Args:
            activity_type: Type of activity (patient, encounter, etc.)
            action: Action performed (registered, completed, etc.)
            title: Human-readable title
            resource_type: Type of resource (Patient, LabOrder, etc.)
            resource_id: ID of the resource
            user: User who performed the action (optional)
            description: Additional description (optional)
            metadata: Additional structured data (optional)

        Returns:
            ActivityFeed: The created activity entry
        """
        return cls.objects.create(
            activity_type=activity_type,
            action=action,
            title=title,
            description=description,
            user=user,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata=metadata or {},
        )


class TimeStampedModel(models.Model):
    """
    Abstract base model with created/updated timestamps.

    All models that need audit trails should inherit from this.
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for TimeStampedModel."""

        abstract = True


class SyncQueue(models.Model):
    """
    Queue for tracking local changes that need to be synced.

    This model stores all CREATE, UPDATE, and DELETE operations
    made while offline for later synchronization.

    Sprint 0.5: Offline Sync Logic
    """

    OPERATION_CHOICES = [
        ("CREATE", "Create"),
        ("UPDATE", "Update"),
        ("DELETE", "Delete"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("SYNCING", "Syncing"),
        ("SYNCED", "Synced"),
        ("FAILED", "Failed"),
        ("CONFLICT", "Conflict"),
    ]

    operation = models.CharField(
        max_length=10,
        choices=OPERATION_CHOICES,
        db_index=True,
        help_text="Type of operation to sync",
    )
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_queue_entries",
        help_text="Organization context for this sync entry.",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_queue_entries",
        help_text="Facility that generated this sync entry.",
    )
    model_name = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Name of the model being synced",
    )
    record_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="ID of the record (null for new records)",
    )
    data = models.JSONField(
        default=dict,
        help_text="Serialized data for the operation",
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="PENDING",
        db_index=True,
        help_text="Current sync status",
    )
    retry_count = models.PositiveIntegerField(
        default=0,
        help_text="Number of sync attempts",
    )
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Error message if sync failed",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When the entry was queued",
    )
    synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the entry was successfully synced",
    )

    class Meta:
        """Meta options for SyncQueue model."""

        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["model_name", "record_id"]),
        ]
        verbose_name = "Sync Queue Entry"
        verbose_name_plural = "Sync Queue Entries"

    def __str__(self) -> str:
        """String representation of the sync queue entry."""
        return f"{self.operation} {self.model_name}:{self.record_id} [{self.status}]"

    def mark_syncing(self):
        """Mark the entry as currently syncing."""
        self.status = "SYNCING"
        self.save(update_fields=["status"])

    def mark_synced(self):
        """Mark the entry as successfully synced."""
        self.status = "SYNCED"
        self.synced_at = timezone.now()
        self.save(update_fields=["status", "synced_at"])

    def mark_failed(self, error_message: str):
        """Mark the entry as failed with error message."""
        self.status = "FAILED"
        self.error_message = error_message
        self.retry_count += 1
        self.save(update_fields=["status", "error_message", "retry_count"])

    def mark_conflict(self):
        """Mark the entry as having a conflict."""
        self.status = "CONFLICT"
        self.save(update_fields=["status"])


class SyncIdentityMap(TimeStampedModel):
    """Map a source-node record identity to the receiving database primary key.

    The mapping is internal sync state. It makes replay of append-only records
    idempotent when cloud and hub primary keys differ, without treating mutable
    clinical fields as unsafe pseudo-identities.
    """

    source_node = models.CharField(max_length=160)
    model_label = models.CharField(max_length=100)
    remote_record_id = models.CharField(max_length=128)
    local_record_id = models.BigIntegerField(db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["source_node", "model_label", "remote_record_id"],
                name="unique_sync_identity_source_record",
            )
        ]
        indexes = [models.Index(fields=["model_label", "local_record_id"])]
        verbose_name = "Sync Identity Map"
        verbose_name_plural = "Sync Identity Maps"

    def __str__(self) -> str:
        """Return a concise source-to-local identity description."""
        return f"{self.source_node}:{self.model_label}:{self.remote_record_id} -> {self.local_record_id}"


class SyncDeferredMaterialization(TimeStampedModel):
    """Persist inbound rows whose mapped parents have not arrived yet."""

    STATUS_PENDING = "PENDING"
    STATUS_RESOLVED = "RESOLVED"
    status = models.CharField(max_length=12, default=STATUS_PENDING, db_index=True)
    source_node = models.CharField(max_length=160)
    model_label = models.CharField(max_length=100)
    remote_record_id = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    error_message = models.TextField(blank=True, default="")
    retry_count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["source_node", "model_label", "remote_record_id"],
                name="unique_deferred_sync_source_record",
            )
        ]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self) -> str:
        """Return a concise deferred inbound identity."""
        return f"{self.source_node}:{self.model_label}:{self.remote_record_id} [{self.status}]"


class SyncConflict(models.Model):
    """
    Record of sync conflicts for audit and resolution.

    This model tracks conflicts between local and remote changes
    for manual or automatic resolution.

    Sprint 0.5: Offline Sync Logic
    """

    RESOLUTION_STRATEGIES = [
        ("LAST_WRITE_WINS", "Last Write Wins"),
        ("LOCAL_WINS", "Local Wins"),
        ("REMOTE_WINS", "Remote Wins"),
        ("MANUAL", "Manual Resolution"),
        ("MERGED", "Merged"),
    ]

    STATUS_CHOICES = [
        ("PENDING", "Pending Resolution"),
        ("RESOLVED", "Resolved"),
        ("DISMISSED", "Dismissed"),
    ]

    model_name = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Name of the model with conflict",
    )
    record_id = models.BigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="ID of the record with conflict",
    )
    field_name = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Specific field with conflict (if field-level)",
    )
    local_data = models.JSONField(
        default=dict,
        help_text="Local version of the data",
    )
    remote_data = models.JSONField(
        default=dict,
        help_text="Remote version of the data",
    )
    resolved_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Final resolved data",
    )
    resolution_strategy = models.CharField(
        max_length=20,
        choices=RESOLUTION_STRATEGIES,
        default="LAST_WRITE_WINS",
        help_text="Strategy used to resolve the conflict",
    )
    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="PENDING",
        db_index=True,
        help_text="Current resolution status",
    )
    detected_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When the conflict was detected",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the conflict was resolved",
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_conflicts",
        help_text="User who resolved the conflict (if manual)",
    )

    class Meta:
        """Meta options for SyncConflict model."""

        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["status", "detected_at"]),
            models.Index(fields=["model_name", "record_id"]),
        ]
        verbose_name = "Sync Conflict"
        verbose_name_plural = "Sync Conflicts"

    def __str__(self) -> str:
        """String representation of the sync conflict."""
        return f"Conflict on {self.model_name}:{self.record_id} [{self.status}]"

    def resolve(self, resolved_data: dict, strategy: str, user=None):
        """Resolve the conflict with the given data."""
        self.resolved_data = resolved_data
        self.resolution_strategy = strategy
        self.status = "RESOLVED"
        self.resolved_at = timezone.now()
        self.resolved_by = user
        self.save()


class NetworkStatus(models.Model):
    """
    Track network connectivity status over time.

    This model records connectivity changes for monitoring
    and analytics purposes.

    Sprint 0.5: Offline Sync Logic
    """

    is_online = models.BooleanField(
        default=True,
        help_text="Whether the system is currently online",
    )
    last_check = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="When the status was last checked",
    )
    latency_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Network latency in milliseconds",
    )
    server_url = models.URLField(
        blank=True,
        default="",
        help_text="Server URL that was checked",
    )

    class Meta:
        """Meta options for NetworkStatus model."""

        ordering = ["-last_check"]
        verbose_name = "Network Status"
        verbose_name_plural = "Network Status Entries"

    def __str__(self) -> str:
        """String representation of the network status."""
        status = "Online" if self.is_online else "Offline"
        return f"{status} at {self.last_check.isoformat()}"


class SyncableModel(models.Model):
    """
    Abstract base model for models that support offline sync.

    Adds version tracking and sync metadata fields.
    """

    version = models.PositiveIntegerField(
        default=1,
        help_text="Version number for conflict detection",
    )
    sync_status = models.CharField(
        max_length=20,
        default="local",
        help_text="Sync status: local, synced, pending",
    )
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the record was last synced",
    )
    server_id = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="ID on the remote server (if different)",
    )

    class Meta:
        """Meta options for SyncableModel."""

        abstract = True

    def increment_version(self):
        """Increment the version number on update."""
        self.version += 1

    def mark_synced(self, server_id: int = None):
        """Mark the record as synced."""
        self.sync_status = "synced"
        self.last_synced_at = timezone.now()
        if server_id:
            self.server_id = server_id
        self.save(update_fields=["sync_status", "last_synced_at", "server_id"])


class SyncMetrics(models.Model):
    """
    Model for tracking sync task metrics.

    Records performance metrics and statistics for sync operations.

    Sprint 0.5: Offline Sync Logic
    """

    task_id = models.CharField(
        max_length=255,
        unique=True,
        help_text="Celery task ID",
    )
    task_name = models.CharField(
        max_length=255,
        help_text="Name of the task",
    )
    started_at = models.DateTimeField(
        help_text="When the task started",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the task completed",
    )
    duration_ms = models.PositiveIntegerField(
        default=0,
        help_text="Duration in milliseconds",
    )
    entries_processed = models.PositiveIntegerField(
        default=0,
        help_text="Number of entries processed",
    )
    entries_succeeded = models.PositiveIntegerField(
        default=0,
        help_text="Number of entries successfully synced",
    )
    entries_failed = models.PositiveIntegerField(
        default=0,
        help_text="Number of entries that failed",
    )
    entries_conflicts = models.PositiveIntegerField(
        default=0,
        help_text="Number of entries with conflicts",
    )
    status = models.CharField(
        max_length=20,
        default="running",
        help_text="Task status (running, completed, failed)",
    )
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Error message if task failed",
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the record was created",
    )

    class Meta:
        """Meta options for SyncMetrics."""

        verbose_name = "Sync Metrics"
        verbose_name_plural = "Sync Metrics"
        ordering = ["-created_at"]

    def __str__(self):
        """Return string representation."""
        return f"{self.task_name} ({self.task_id})"

    def calculate_duration(self):
        """Calculate and set duration from started_at and completed_at."""
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)
            return self.duration_ms
        return 0

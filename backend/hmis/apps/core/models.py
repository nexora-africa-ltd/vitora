"""
Core models for Vitora HMIS.

This module contains shared models used across the application,
including the AuditLog model for Kenya Data Protection Act compliance,
and sync-related models for offline-first functionality.
"""

import hashlib
import json
from decimal import Decimal

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel, OrganizationScopedModel
from hmis.apps.core.pii import encrypted_pii_property
from hmis.apps.core.upload_validators import validate_image_upload as _validate_image_upload


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

    GENESIS_HASH = "0" * 64

    class Meta:
        """Meta options for AuditLog model."""

        ordering = ["-timestamp"]
        indexes = [
            models.Index(fields=["user", "timestamp"]),
            models.Index(fields=["action", "timestamp"]),
            models.Index(fields=["resource_type", "resource_id"]),
            models.Index(fields=["patient_id", "timestamp"]),
            models.Index(fields=["sequence_number"]),
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
    ) -> str:
        """Compute SHA-256 hash for an audit log entry."""
        payload = (
            f"{sequence_number}|{previous_hash}|{action}|{user_id}"
            f"|{timestamp.isoformat()}|{resource_type}|{resource_id}"
            f"|{json.dumps(details, sort_keys=True, default=str)}"
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


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


# ============================================================================
# Kenya Location Hierarchy Models
# ============================================================================


class County(models.Model):
    """
    Kenya County model (47 counties).

    Represents the first level of Kenya's administrative hierarchy.
    """

    code = models.PositiveSmallIntegerField(
        unique=True,
        help_text="County code (1-47)",
    )
    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="County name",
    )

    class Meta:
        """Meta options for County."""

        verbose_name = "County"
        verbose_name_plural = "Counties"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return county name."""
        return self.name


class SubCounty(models.Model):
    """
    Kenya Sub-County model.

    Represents the second level of Kenya's administrative hierarchy.
    Each sub-county belongs to one county.
    """

    county = models.ForeignKey(
        County,
        on_delete=models.CASCADE,
        related_name="sub_counties",
        help_text="Parent county",
    )
    name = models.CharField(
        max_length=100,
        help_text="Sub-county name",
    )

    class Meta:
        """Meta options for SubCounty."""

        verbose_name = "Sub-County"
        verbose_name_plural = "Sub-Counties"
        ordering = ["name"]
        unique_together = ["county", "name"]

    def __str__(self) -> str:
        """Return sub-county and county name."""
        return f"{self.name}, {self.county.name}"


class Ward(models.Model):
    """
    Kenya Ward model.

    Represents the third level of Kenya's administrative hierarchy.
    Each ward belongs to one sub-county.
    """

    sub_county = models.ForeignKey(
        SubCounty,
        on_delete=models.CASCADE,
        related_name="wards",
        help_text="Parent sub-county",
    )
    name = models.CharField(
        max_length=100,
        help_text="Ward name",
    )

    class Meta:
        """Meta options for Ward."""

        verbose_name = "Ward"
        verbose_name_plural = "Wards"
        ordering = ["name"]
        unique_together = ["sub_county", "name"]

    def __str__(self) -> str:
        """Return ward and sub-county name."""
        return f"{self.name}, {self.sub_county.name}"


# ============================================================================
# RBAC Models (Sprint 1.1-1.2 Track C)
# ============================================================================


class Department(FacilityScopedModel):
    """
    Hospital department for staff organization and access control.

    Supports hierarchical structure for complex organizational charts.
    Each department can have a head (StaffProfile) and multiple staff members.

    Scoped to a Facility (branch). The ``organization`` FK is auto-set from
    the facility on save via :class:`FacilityScopedModel`.
    """

    DEPARTMENT_TYPES = [
        ("CLINICAL", "Clinical"),
        ("ADMINISTRATIVE", "Administrative"),
        ("SUPPORT", "Support"),
        ("LABORATORY", "Laboratory"),
        ("PHARMACY", "Pharmacy"),
        ("RADIOLOGY", "Radiology"),
        ("RECORDS", "Medical Records"),
    ]

    code = models.CharField(
        max_length=20,
        help_text="Department code (e.g., OPD, IPD, LAB). Unique per facility.",
    )
    name = models.CharField(
        max_length=100,
        help_text="Department name",
    )
    description = models.TextField(
        blank=True,
        help_text="Department description",
    )
    department_type = models.CharField(
        max_length=20,
        choices=DEPARTMENT_TYPES,
        help_text="Type of department",
    )
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Parent department for hierarchical structure",
    )
    head = models.ForeignKey(
        "StaffProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="headed_departments",
        help_text="Department head",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this department is active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Department."""

        verbose_name = "Department"
        verbose_name_plural = "Departments"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "code"],
                name="unique_department_code_per_facility",
                condition=models.Q(facility__isnull=False),
            ),
        ]

    def __str__(self) -> str:
        """Return department name."""
        return f"{self.name} ({self.code})"

    def get_staff_count(self) -> int:
        """
        Get count of active staff in this department.

        Returns:
            int: Number of staff with this as primary department
        """
        return self.primary_staff.filter(employment_status="ACTIVE").count()

    def get_hierarchy(self) -> list:
        """
        Get full parent chain from root to this department.

        Returns:
            list: List of departments from root to self
        """
        hierarchy = []
        current = self
        while current is not None:
            hierarchy.insert(0, current)
            current = current.parent
        return hierarchy

    def get_subdepartments(self):
        """
        Get child departments.

        Returns:
            QuerySet: Child departments
        """
        return self.department_set.all()


class Role(models.Model):
    """
    Hospital role with hierarchical permissions.

    Defines role-based access control with flexible JSON permission matrix.
    Can be linked to Django Groups for standard permission fallback.
    Supports Kenya-specific requirements like license tracking.
    """

    ROLE_CATEGORIES = [
        ("CLINICAL", "Clinical Staff"),
        ("ADMINISTRATIVE", "Administrative Staff"),
        ("TECHNICAL", "Technical Staff"),
        ("MANAGEMENT", "Management"),
        ("COMMUNITY", "Community Health"),
        ("ALLIED_HEALTH", "Allied Health"),
    ]

    ROLE_SCOPES = [
        ("ORG", "Organization-wide"),
        ("FACILITY", "Facility-specific"),
    ]

    code = models.CharField(
        max_length=30,
        unique=True,
        help_text="Unique role code (e.g., DOCTOR, NURSE)",
    )
    name = models.CharField(
        max_length=100,
        help_text="Role name",
    )
    category = models.CharField(
        max_length=20,
        choices=ROLE_CATEGORIES,
        help_text="Role category",
    )
    description = models.TextField(
        blank=True,
        help_text="Role description",
    )

    # Multitenancy scope
    scope = models.CharField(
        max_length=10,
        choices=ROLE_SCOPES,
        default="ORG",
        help_text="Whether this role applies org-wide or to a specific facility.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="roles",
        help_text="Organization this role belongs to (null = system-wide default).",
    )
    facility = models.ForeignKey(
        "Facility",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="roles",
        help_text="Facility this role is scoped to (only when scope=FACILITY).",
    )

    # Permission matrix (JSON for flexibility)
    permissions_matrix = models.JSONField(
        default=dict,
        help_text="Permission matrix with resources and actions",
    )

    # Hierarchy
    hierarchy_level = models.PositiveIntegerField(
        default=0,
        help_text="Hierarchy level (0=highest)",
    )
    parent_role = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Parent role for permission inheritance",
    )

    # Linked Django Group (for standard permissions)
    django_group = models.OneToOneField(
        "auth.Group",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="Linked Django Group for standard permissions",
    )

    # Kenya-specific
    requires_license = models.BooleanField(
        default=False,
        help_text="Whether this role requires a medical license",
    )
    license_body = models.CharField(
        max_length=100,
        blank=True,
        help_text="Licensing body (e.g., KMPDB, NCK)",
    )

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this role is active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Role."""

        verbose_name = "Role"
        verbose_name_plural = "Roles"
        ordering = ["hierarchy_level", "name"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(scope="FACILITY", facility__isnull=True),
                name="role_facility_required_when_facility_scoped",
            ),
        ]

    def __str__(self) -> str:
        """Return role name."""
        return f"{self.name} ({self.code})"

    def has_permission(self, action: str, resource: str) -> bool:
        """
        Check if role has permission for action on resource.

        Args:
            action: Action to check (create, read, update, delete, etc.)
            resource: Resource type (Patient, Encounter, etc.)

        Returns:
            bool: True if permission granted
        """
        if not self.permissions_matrix:
            return False

        resource_perms = self.permissions_matrix.get(resource, {})
        return resource_perms.get(action, False)

    def get_all_permissions(self) -> dict:
        """
        Get all permissions including inherited from parent.

        Returns:
            dict: Combined permission matrix
        """
        if not self.parent_role:
            return self.permissions_matrix.copy()

        # Start with parent permissions
        all_perms = self.parent_role.get_all_permissions()

        # Override/extend with this role's permissions
        for resource, actions in self.permissions_matrix.items():
            if resource not in all_perms:
                all_perms[resource] = {}
            all_perms[resource].update(actions)

        return all_perms

    def can_access_department(self, department) -> bool:
        """
        Check if role can access department.

        Args:
            department: Department to check

        Returns:
            bool: True if access allowed
        """
        # For now, all roles can access all departments
        # This can be extended with department-specific rules
        return True


class StaffProfile(models.Model):
    """
    Extended profile for hospital staff members.

    Links users to roles and departments for role-based access control.
    Tracks Kenya-specific requirements like license verification and employment status.
    """

    EMPLOYMENT_STATUS = [
        ("ACTIVE", "Active"),
        ("ON_LEAVE", "On Leave"),
        ("SUSPENDED", "Suspended"),
        ("TERMINATED", "Terminated"),
    ]

    EMPLOYMENT_TYPE = [
        ("PERMANENT", "Permanent"),
        ("CONTRACT", "Contract"),
        ("LOCUM", "Locum (Part-time)"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        help_text="Linked user account",
    )

    # Identity
    employee_id = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique employee ID (e.g., VH-2026-001)",
    )
    title = models.CharField(
        max_length=20,
        blank=True,
        help_text="Title (e.g., Dr., Nurse)",
    )
    middle_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Middle name (optional)",
    )

    # Role and Department
    primary_role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="primary_staff",
        help_text="Primary role",
    )
    secondary_roles = models.ManyToManyField(
        Role,
        blank=True,
        related_name="secondary_staff",
        help_text="Additional roles",
    )
    primary_department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name="primary_staff",
        help_text="Primary department",
    )
    secondary_departments = models.ManyToManyField(
        Department,
        blank=True,
        related_name="secondary_staff",
        help_text="Additional departments",
    )

    # Facility assignment (Capability-Based Experience)
    organization = models.ForeignKey(
        "Organization",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="staff_profiles",
        help_text="Primary organization (cached from primary_facility for query performance)",
    )
    secondary_organizations = models.ManyToManyField(
        "Organization",
        blank=True,
        related_name="secondary_staff_profiles",
        help_text="Additional organizations (for locum, part-time, or consultant physicians)",
    )
    primary_facility = models.ForeignKey(
        "Facility",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="staff",
        help_text="Primary work facility",
    )
    secondary_facilities = models.ManyToManyField(
        "Facility",
        blank=True,
        related_name="secondary_staff",
        help_text="Additional facilities (for multi-site workers)",
    )

    # Professional details (Kenya-specific)
    hwr_id = models.CharField(
        max_length=50,
        blank=True,
        help_text="Health Worker Registry ID (e.g., PUID-059839)",
    )
    license_number = models.CharField(
        max_length=100,
        blank=True,
        help_text="Professional license number from licensing body (e.g., COC-Clinical Officer-2026-620095)",
    )
    license_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="License expiry date",
    )
    license_verified = models.BooleanField(
        default=False,
        help_text="Whether license has been verified via DHA registry lookup",
    )
    licensing_body = models.CharField(
        max_length=100,
        blank=True,
        help_text="Regulatory body (e.g., Clinical Officers Council, NCK)",
    )
    specialization = models.CharField(
        max_length=100,
        blank=True,
        help_text="Medical specialization",
    )
    hwr_national_id_encrypted = models.TextField(default="", blank=True)
    hwr_national_id_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    hwr_national_id = encrypted_pii_property("hwr_national_id")
    hwr_last_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of last successful HWR verification",
    )

    # Contact (encrypted at rest — Kenya DPA 2019 § 41)
    phone_number_encrypted = models.TextField(default="", blank=True)
    phone_number = encrypted_pii_property("phone_number")
    emergency_contact_name_encrypted = models.TextField(default="", blank=True)
    emergency_contact_name = encrypted_pii_property("emergency_contact_name")
    emergency_contact_phone_encrypted = models.TextField(default="", blank=True)
    emergency_contact_phone = encrypted_pii_property("emergency_contact_phone")

    # Account lifecycle
    must_change_password = models.BooleanField(
        default=False,
        help_text="When True the user must set a new password on next login.",
    )
    mfa_grace_deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "Deadline by which MFA must be configured for roles that require it. "
            "Set on first login; after this deadline, API access is blocked until "
            "MFA is set up. Default grace period: 72 hours."
        ),
    )

    # Employment
    employment_status = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_STATUS,
        default="ACTIVE",
        help_text="Current employment status",
    )
    employment_type = models.CharField(
        max_length=20,
        choices=EMPLOYMENT_TYPE,
        default="PERMANENT",
        help_text="Type of employment (Permanent, Contract, or Locum/Part-time)",
    )
    date_joined = models.DateField(
        help_text="Date joined the organization",
    )
    date_left = models.DateField(
        null=True,
        blank=True,
        help_text="Date left the organization",
    )

    # Supervisor
    supervisor = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="supervisees",
        help_text="Direct supervisor",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for StaffProfile."""

        verbose_name = "Staff Profile"
        verbose_name_plural = "Staff Profiles"
        ordering = ["user__last_name", "user__first_name"]

    def __str__(self) -> str:
        """Return formatted name."""
        return self.get_full_name()

    def clean(self):
        """Validate cross-organization constraints."""
        from django.core.exceptions import ValidationError

        errors = {}
        if self.primary_facility_id and self.organization_id:
            if self.primary_facility.organization_id != self.organization_id:
                errors["primary_facility"] = (
                    "Primary facility must belong to the staff member's primary organization."
                )
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        """Auto-set organization from primary_facility on save."""
        if self.primary_facility and self.primary_facility.organization:
            self.organization = self.primary_facility.organization
        super().save(*args, **kwargs)

    def validate_secondary_facilities(self):
        """Validate that all secondary facilities belong to allowed organizations.

        Allowed orgs = primary organization + secondary organizations.
        Call after saving M2M relations.
        """
        from django.core.exceptions import ValidationError

        if not self.pk:
            return
        allowed_org_ids = set()
        if self.organization_id:
            allowed_org_ids.add(self.organization_id)
        allowed_org_ids.update(self.secondary_organizations.values_list("id", flat=True))
        if not allowed_org_ids:
            return
        bad = list(
            self.secondary_facilities.exclude(organization_id__in=allowed_org_ids).values_list(
                "name", flat=True
            )
        )
        if bad:
            raise ValidationError(
                {
                    "secondary_facilities": (
                        f"These facilities do not belong to any of the staff member's "
                        f"organizations: {', '.join(bad)}"
                    )
                }
            )

    def get_full_name(self) -> str:
        """
        Get full name with title.

        Returns:
            str: Title + User's full name
        """
        full_name = self.user.get_full_name() or self.user.username
        if self.title:
            return f"{self.title} {full_name}"
        return full_name

    def get_all_roles(self) -> list:
        """
        Get primary + secondary roles.

        Returns:
            list: All roles
        """
        roles = [self.primary_role]
        roles.extend(list(self.secondary_roles.all()))
        return roles

    def get_all_departments(self) -> list:
        """
        Get primary + secondary departments.

        Returns:
            list: All departments
        """
        departments = [self.primary_department]
        departments.extend(list(self.secondary_departments.all()))
        return departments

    def get_all_facilities(self) -> list:
        """
        Get primary + secondary facilities.

        Returns:
            list: All assigned facilities (primary first, then secondaries).
                  Empty list if no primary facility is set.
        """
        facilities = []
        if self.primary_facility:
            facilities.append(self.primary_facility)
        facilities.extend(list(self.secondary_facilities.all()))
        return facilities

    def has_permission(self, action: str, resource: str) -> bool:
        """
        Check if staff has permission for action on resource.

        Aggregates permissions from all roles (including inherited).

        Args:
            action: Action to check
            resource: Resource type

        Returns:
            bool: True if permission granted from any role
        """
        for role in self.get_all_roles():
            # Use get_all_permissions to include inherited permissions
            all_perms = role.get_all_permissions()
            resource_perms = all_perms.get(resource, {})
            if resource_perms.get(action, False):
                return True
        return False

    def is_license_valid(self) -> bool:
        """
        Check if license is valid (not expired).

        Returns:
            bool: True if no expiry or not yet expired
        """
        if not self.license_expiry:
            return True

        from datetime import date

        return self.license_expiry >= date.today()

    @property
    def is_external(self) -> bool:
        """
        Check if staff is an external service provider.

        Locum (part-time) staff are considered external providers.

        Returns:
            bool: True if employment type is LOCUM
        """
        return self.employment_type == "LOCUM"

    def get_supervisees(self):
        """
        Get direct reports.

        Returns:
            QuerySet: StaffProfiles supervised by this staff
        """
        return self.supervisees.all()

    # ------------------------------------------------------------------
    # OrgMembership compat properties (Phase 1 multi-org)
    # ------------------------------------------------------------------

    @property
    def active_memberships(self):
        """Return queryset of ACTIVE OrgMembership records."""
        return self.memberships.filter(status="ACTIVE")

    @property
    def primary_membership(self):
        """Return the primary OrgMembership, or None."""
        return self.active_memberships.filter(is_primary=True).first()

    def get_membership_for_org(self, org_id: int):
        """Return the ACTIVE OrgMembership for a specific org, or None."""
        return self.active_memberships.filter(organization_id=org_id).first()

    def has_permission_for_org(self, action: str, resource: str, org_id: int) -> bool:
        """Check permission using the org-specific role from OrgMembership."""
        membership = self.get_membership_for_org(org_id)
        if not membership:
            return False
        all_perms = membership.role.get_all_permissions()
        resource_perms = all_perms.get(resource, {})
        return resource_perms.get(action, False)


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


# ============================================================================
# Subscription Plan Model (SaaS Licensing)
# ============================================================================


class SubscriptionPlan(TimeStampedModel):
    """
    Defines a subscription tier with pricing, limits, and feature flags.

    Each Organization references a tier code (FREE / BASIC / PROFESSIONAL / ENTERPRISE)
    and this model stores the configurable details for that tier.
    """

    class TierCode(models.TextChoices):
        """Tier code choices — must stay in sync with Organization.SubscriptionTier."""

        FREE = "FREE", "Free"
        BASIC = "BASIC", "Basic"
        PROFESSIONAL = "PROFESSIONAL", "Professional"
        ENTERPRISE = "ENTERPRISE", "Enterprise"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    code = models.CharField(
        max_length=20,
        choices=TierCode.choices,
        unique=True,
        help_text="Unique tier code (matches Organization.subscription_tier).",
    )
    name = models.CharField(
        max_length=100,
        help_text="Display name shown to customers (e.g. 'Professional Plan').",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Marketing description of this plan.",
    )

    # ------------------------------------------------------------------
    # Pricing (KES)
    # ------------------------------------------------------------------

    monthly_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Monthly price in KES.",
    )
    annual_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Annual price in KES (typically discounted).",
    )

    # ------------------------------------------------------------------
    # Limits
    # ------------------------------------------------------------------

    max_facilities = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of facilities (null = unlimited).",
    )
    max_users = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of staff users (null = unlimited).",
    )
    max_patients = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of patient records (null = unlimited).",
    )

    # ------------------------------------------------------------------
    # Features
    # ------------------------------------------------------------------

    features = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Feature flags for this plan. Example: "
            '{"pharmacy": true, "laboratory": true, "ai_assistant": false}'
        ),
    )

    # Canonical registry of subscription feature keys.
    # Used by the admin widget to render toggleable checkboxes.
    FEATURE_REGISTRY: list[tuple[str, str]] = [
        # Module features (mirror Facility has_* flags)
        ("outpatient", "Outpatient (OPD)"),
        ("inpatient", "Inpatient (IPD)"),
        ("emergency", "Emergency / Casualty"),
        ("pharmacy", "Pharmacy"),
        ("laboratory", "Laboratory"),
        ("imaging", "Imaging / Radiology"),
        ("theatre", "Surgical Theatre"),
        ("dialysis", "Renal Dialysis"),
        ("icu", "ICU"),
        ("maternity", "Maternity / Obstetrics"),
        ("mortuary", "Mortuary"),
        ("blood_bank", "Blood Bank"),
        ("inventory", "Inventory / Supply Chain"),
        ("billing", "Billing & Invoicing"),
        ("scheduling", "Staff Rostering & Scheduling"),
        ("triage", "Triage / Acuity Scoring"),
        ("surveillance", "Disease Surveillance / IDSR"),
        ("immunizations", "Immunizations / Vaccination"),
        ("allied_health", "Allied Health (Physio, Nutrition, etc.)"),
        ("quality", "Quality Improvement & Clinical Audit"),
        ("private_insurance", "Private Insurance Claims"),
        ("moh_reporting", "MOH 705/711/717 Aggregate Reporting"),
        # Standalone module variants (sold as dedicated SaaS plans)
        ("lis_standalone", "Standalone Laboratory (LIS)"),
        ("pharmacy_standalone", "Standalone Pharmacy / Retail"),
        ("imaging_standalone", "Standalone Imaging / RIS"),
        # Platform features
        ("ai_assistant", "AI Assistant (TibaBot)"),
        ("sha_claims", "SHA Claims Integration"),
        ("dhis2_reporting", "DHIS2 / KHIS Reporting"),
        ("api_access", "API Access"),
        ("custom_reports", "Custom Reports"),
        ("offline_sync", "Offline Sync"),
        ("sms_notifications", "SMS & WhatsApp Notifications"),
    ]

    # ------------------------------------------------------------------
    # Display & Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this plan is currently available for selection.",
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        help_text="Display order (lower = first).",
    )
    trial_period_days = models.PositiveIntegerField(
        default=0,
        help_text="Trial period in days (0 = no trial).",
    )
    monthly_ai_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Monthly AI token quota (null = unlimited). Resets on billing cycle.",
    )

    # ------------------------------------------------------------------
    # Meta & Methods
    # ------------------------------------------------------------------

    class Meta:
        verbose_name = "Subscription Plan"
        verbose_name_plural = "Subscription Plans"
        ordering = ["sort_order", "monthly_price"]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_code_display()})"

    @property
    def annual_savings(self) -> Decimal:
        """Return annual savings compared to monthly billing."""
        monthly_annual = self.monthly_price * Decimal("12")
        return max(monthly_annual - self.annual_price, Decimal("0"))

    @property
    def has_trial(self) -> bool:
        """Whether this plan offers a trial period."""
        return self.trial_period_days > 0


# ============================================================================
# Organization Model (Multitenancy – Phase 1)
# ============================================================================


class Organization(TimeStampedModel):
    """
    Top-level tenant in the Vitora HMIS multi-tenancy hierarchy.

    An Organization represents a legal entity that operates one or more
    healthcare Facilities (branches). All clinical data is scoped to an
    Organization — patients are shared within an org, while encounters
    and operational records are further scoped to individual Facilities.

    Hierarchy::

        Organization (tenant)
        └── Facility (branch)  ← one-to-many

    The Organization model supports:

    * **Identity** – name, slug (for URLs / subdomains), contact details.
    * **Subscription** – tier, user/facility limits (for SaaS licensing).
    * **Compliance** – data retention period (Kenya DPA 2019).
    * **Location** – optional HQ county/sub-county.
    * **Configuration** – JSON settings for org-level defaults.
    """

    class SubscriptionTier(models.TextChoices):
        """Subscription tiers for SaaS licensing."""

        FREE = "FREE", "Free"
        BASIC = "BASIC", "Basic"
        PROFESSIONAL = "PROFESSIONAL", "Professional"
        ENTERPRISE = "ENTERPRISE", "Enterprise"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    name = models.CharField(
        max_length=200,
        unique=True,
        help_text="Official organization name.",
    )
    slug = models.SlugField(
        max_length=100,
        unique=True,
        help_text="URL-safe identifier (used in subdomains and API routing).",
    )
    logo = models.ImageField(
        upload_to="organizations/logos/",
        null=True,
        blank=True,
        validators=[_validate_image_upload],
        help_text="Organization logo for branding.",
    )

    # ------------------------------------------------------------------
    # Contact
    # ------------------------------------------------------------------

    contact_email_encrypted = models.TextField(default="", blank=True)
    contact_email = encrypted_pii_property("contact_email")
    contact_phone_encrypted = models.TextField(default="", blank=True)
    contact_phone = encrypted_pii_property("contact_phone")
    address_encrypted = models.TextField(default="", blank=True)
    address = encrypted_pii_property("address")

    # ------------------------------------------------------------------
    # Location (optional HQ)
    # ------------------------------------------------------------------

    county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="HQ county.",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="HQ sub-county.",
    )

    # ------------------------------------------------------------------
    # Subscription & Limits
    # ------------------------------------------------------------------

    subscription_plan = models.ForeignKey(
        "core.SubscriptionPlan",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organizations",
        help_text="Linked subscription plan (source of truth for limits/features).",
    )
    subscription_tier = models.CharField(
        max_length=20,
        choices=SubscriptionTier.choices,
        default=SubscriptionTier.FREE,
        editable=False,
        help_text="Derived from subscription_plan.code — do not set directly.",
    )
    max_facilities = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of facilities allowed (synced from plan, null = unlimited).",
    )
    max_users = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of staff users allowed (synced from plan, null = unlimited).",
    )
    max_patients = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum number of patient records (synced from plan, null = unlimited).",
    )

    # ------------------------------------------------------------------
    # Subscription Validity
    # ------------------------------------------------------------------

    class SubscriptionStatus(models.TextChoices):
        """Subscription lifecycle states."""

        ACTIVE = "ACTIVE", "Active"
        TRIAL = "TRIAL", "Trial"
        EXPIRED = "EXPIRED", "Expired"
        SUSPENDED = "SUSPENDED", "Suspended"

    subscription_status = models.CharField(
        max_length=20,
        choices=SubscriptionStatus.choices,
        default=SubscriptionStatus.ACTIVE,
        help_text="Current subscription lifecycle state.",
    )
    subscription_valid_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the current subscription period expires (null = no expiry).",
    )

    # ------------------------------------------------------------------
    # AI Token Usage (per billing cycle)
    # ------------------------------------------------------------------

    monthly_ai_tokens = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Monthly AI token quota (synced from plan, null = unlimited).",
    )
    ai_tokens_used = models.PositiveIntegerField(
        default=0,
        help_text="AI tokens consumed in the current billing cycle.",
    )
    ai_tokens_reset_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the AI token counter was last reset.",
    )

    # ------------------------------------------------------------------
    # Compliance (Kenya DPA 2019)
    # ------------------------------------------------------------------

    data_retention_years = models.PositiveIntegerField(
        default=7,
        help_text="Minimum data retention period in years (Kenya DPA default: 7).",
    )

    # ------------------------------------------------------------------
    # Configuration
    # ------------------------------------------------------------------

    settings = models.JSONField(
        default=dict,
        blank=True,
        help_text="Org-level configuration (branding, defaults, retention policy).",
    )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether this organization is currently active.",
    )

    is_verified = models.BooleanField(
        default=False,
        help_text="Whether the admin email has been verified (self-service signup).",
    )

    # ------------------------------------------------------------------
    # Onboarding
    # ------------------------------------------------------------------

    onboarding_completed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When initial onboarding was completed. NULL means the org admin "
            "has not finished setting up the organization (facility modules, "
            "first clinic, inviting staff, etc.)."
        ),
    )

    # ------------------------------------------------------------------
    # Meta & Methods
    # ------------------------------------------------------------------

    class Meta:
        """Meta options for Organization."""

        verbose_name = "Organization"
        verbose_name_plural = "Organizations"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return the organization name."""
        return self.name

    def save(self, *args, **kwargs):
        """Auto-sync tier and limits from the linked plan on every save."""
        update_fields = kwargs.get("update_fields")
        # Only sync when subscription_plan is being saved (or full save)
        if update_fields is None or "subscription_plan" in update_fields:
            if self.subscription_plan is not None:
                self.subscription_tier = self.subscription_plan.code
                self.max_facilities = self.subscription_plan.max_facilities
                self.max_users = self.subscription_plan.max_users
                self.max_patients = self.subscription_plan.max_patients
                self.monthly_ai_tokens = self.subscription_plan.monthly_ai_tokens
            else:
                self.subscription_tier = self.SubscriptionTier.FREE
                self.monthly_ai_tokens = 0
            if update_fields is not None:
                extra = {
                    "subscription_tier",
                    "max_facilities",
                    "max_users",
                    "max_patients",
                    "monthly_ai_tokens",
                }
                kwargs["update_fields"] = list(set(update_fields) | extra)
        super().save(*args, **kwargs)

    @property
    def facility_count(self) -> int:
        """Return the number of facilities under this organization."""
        return self.facilities.count()

    @property
    def staff_count(self) -> int:
        """Return the number of staff members in this organization."""
        return self.staff_profiles.count()

    @property
    def patient_count(self) -> int:
        """Return the number of patients under this organization."""
        from hmis.apps.patients.models import Patient

        return Patient.objects.filter(organization=self).count()

    def can_add_facility(self) -> bool:
        """Check if the organization can add another facility."""
        if self.max_facilities is None:
            return True
        return self.facility_count < self.max_facilities

    def can_add_user(self) -> bool:
        """Check if the organization can add another user."""
        if self.max_users is None:
            return True
        return self.staff_count < self.max_users

    def can_add_patient(self) -> bool:
        """Check if the organization can add another patient."""
        if self.max_patients is None:
            return True
        return self.patient_count < self.max_patients

    # Baseline features for orgs without a subscription plan.
    # Only core clinical features are enabled — everything else requires a plan.
    PLAN_FALLBACK_FEATURES: dict[str, bool] = {
        "outpatient": True,
        "pharmacy": True,
        "billing": True,
    }

    def has_feature(self, feature_key: str) -> bool:
        """Check if a feature is enabled for this org's subscription plan.

        Orgs without a plan get only the baseline features defined in
        ``PLAN_FALLBACK_FEATURES`` (outpatient, pharmacy, billing).
        """
        if self.subscription_plan is None:
            return self.PLAN_FALLBACK_FEATURES.get(feature_key, False)
        return bool(self.subscription_plan.features.get(feature_key, False))

    @property
    def is_subscription_expired(self) -> bool:
        """Whether the subscription has passed its validity date."""
        if self.subscription_valid_until is None:
            return False
        return timezone.now() > self.subscription_valid_until

    @property
    def ai_tokens_remaining(self) -> int | None:
        """Return remaining AI tokens, or None if unlimited."""
        if self.monthly_ai_tokens is None:
            return None
        return max(0, self.monthly_ai_tokens - self.ai_tokens_used)

    def can_use_ai_tokens(self, tokens_needed: int = 0) -> bool:
        """Check if the organization has enough AI tokens."""
        if self.monthly_ai_tokens is None:
            return True
        return self.ai_tokens_used + tokens_needed <= self.monthly_ai_tokens

    def record_ai_token_usage(self, tokens: int) -> None:
        """Atomically increment the AI token counter."""
        from django.db.models import F

        Organization.objects.filter(pk=self.pk).update(ai_tokens_used=F("ai_tokens_used") + tokens)
        self.ai_tokens_used += tokens  # Keep instance in sync

    def reset_ai_tokens(self) -> None:
        """Reset the AI token counter (called at billing cycle start)."""
        self.ai_tokens_used = 0
        self.ai_tokens_reset_at = timezone.now()
        self.save(update_fields=["ai_tokens_used", "ai_tokens_reset_at"])

    def sync_from_plan(self, save: bool = True) -> None:
        """Sync tier, limits from the linked SubscriptionPlan.

        .. note:: The ``save()`` override already auto-syncs on every
           save, so this method is only needed for explicit in-memory
           sync without a full save, or for legacy callers.
        """
        plan = self.subscription_plan
        if plan is None:
            self.subscription_tier = self.SubscriptionTier.FREE
            self.monthly_ai_tokens = 0
        else:
            self.subscription_tier = plan.code
            self.max_facilities = plan.max_facilities
            self.max_users = plan.max_users
            self.max_patients = plan.max_patients
            self.monthly_ai_tokens = plan.monthly_ai_tokens
        if save:
            self.save(
                update_fields=[
                    "subscription_plan",
                    "subscription_tier",
                    "max_facilities",
                    "max_users",
                    "max_patients",
                    "monthly_ai_tokens",
                ]
            )

    @property
    def onboarding_complete(self) -> bool:
        """Whether the organization has completed initial onboarding."""
        return self.onboarding_completed_at is not None

    def get_onboarding_checklist(self) -> list[dict]:
        """
        Return the onboarding checklist with completion status for each step.

        Steps:
        1. Facility modules configured (at least 1 non-default module enabled)
        2. First clinic created
        3. At least 1 staff invited or created (beyond the initial admin)
        """
        from hmis.apps.clinics.models import Clinic

        # Check facility modules - at least one facility has modules beyond defaults
        facilities = self.facilities.filter(is_active=True)
        has_configured_modules = facilities.exists() and any(
            sum(1 for v in fac.modules.values() if v) > 1 for fac in facilities
        )

        # Check if at least one clinic exists
        has_clinic = Clinic.objects.filter(
            facility__organization=self,
            facility__is_active=True,
        ).exists()

        # Check if there's more than 1 staff member (the initial admin)
        has_invited_staff = self.staff_count > 1

        steps = [
            {
                "key": "facility_modules",
                "label": "Configure facility modules",
                "description": "Enable the clinical modules your facility offers (e.g. pharmacy, laboratory, inpatient).",
                "done": has_configured_modules,
                "required": True,
            },
            {
                "key": "first_clinic",
                "label": "Create your first clinic",
                "description": "Set up an outpatient clinic for patient consultations.",
                "done": has_clinic,
                "required": True,
            },
            {
                "key": "invite_staff",
                "label": "Invite team members",
                "description": "Add doctors, nurses, and other staff to the system.",
                "done": has_invited_staff,
                "required": True,
            },
        ]

        return steps


# ============================================================================
# Facility Model (RBAC Capability Plan – Phase 1)
# ============================================================================


class Facility(TimeStampedModel):
    """
    Healthcare facility with enabled service modules.

    Represents a physical healthcare facility registered on the Kenya Master
    Facility List (MFL).  The model captures:

    * **Identity** – MFL code, official name, KEPH level, and ownership type.
    * **Location** – Links to the Kenya three-tier administrative hierarchy
      (County → Sub-County → Ward).
    * **SHA integration** – Whether the facility is contracted by the Social
      Health Authority for claims processing.
    * **Capability modules** – Explicit boolean flags indicating which clinical
      service modules are enabled at this facility.  These flags drive the
      capability-based sidebar filtering in the web frontend so that users
      only see navigation items relevant to their facility's services.

    The ``modules`` property returns all capability flags as a dictionary,
    suitable for serialization in API responses.  The ``default_modules_for_level``
    class method provides sensible defaults when creating a new facility based
    on its KEPH level.
    """

    # ------------------------------------------------------------------
    # Choice Constants
    # ------------------------------------------------------------------

    class FacilityLevel(models.TextChoices):
        """
        Kenya Essential Package for Health (KEPH) facility levels.

        Level 1 – Community health units (no physical infrastructure).
        Level 2 – Dispensaries and clinics.
        Level 3 – Health centres and maternity/nursing homes.
        Level 4 – Sub-county and medium-sized hospitals.
        Level 5 – County referral hospitals.
        Level 6 – National referral hospitals.
        """

        LEVEL_1 = "1", "Level 1 – Community Unit"
        LEVEL_2 = "2", "Level 2 – Dispensary"
        LEVEL_3 = "3", "Level 3 – Health Centre"
        LEVEL_4 = "4", "Level 4 – Sub-County Hospital"
        LEVEL_5 = "5", "Level 5 – County Referral Hospital"
        LEVEL_6 = "6", "Level 6 – National Referral Hospital"

    class OwnershipType(models.TextChoices):
        """
        Facility ownership categories as defined by the Ministry of Health.

        GOK     – Government of Kenya (public) facilities.
        FBO     – Faith-Based Organization facilities.
        NGO     – Non-Governmental Organization facilities.
        PRIVATE – Private-practice / commercial facilities.
        """

        GOK = "GOK", "Government of Kenya"
        FBO = "FBO", "Faith-Based Organization"
        NGO = "NGO", "Non-Governmental Organization"
        PRIVATE = "PRIVATE", "Private Practice"

    class OperatingMode(models.TextChoices):
        """
        Top-level facility operating mode.

        Selecting a standalone mode cascades the relevant ``has_*`` module
        flags off (clinical workflow modules) and on (the chosen standalone
        module + billing + inventory). Switching back to FULL_HMIS does
        **not** auto-restore previous flags; admins must re-enable them or
        rely on KEPH-level defaults.
        """

        FULL_HMIS = "FULL_HMIS", "Full HMIS"
        STANDALONE_LAB = "STANDALONE_LAB", "Standalone Lab"
        STANDALONE_PHARMACY = "STANDALONE_PHARMACY", "Standalone Pharmacy"
        STANDALONE_IMAGING = "STANDALONE_IMAGING", "Standalone Imaging"
        STANDALONE_DIAGNOSTIC = "STANDALONE_DIAGNOSTIC", "Standalone Diagnostic Centre"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    organization = models.ForeignKey(
        "Organization",
        on_delete=models.PROTECT,
        related_name="facilities",
        null=True,
        blank=True,
        help_text="Parent organization (tenant) that owns this facility.",
    )
    mfl_code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Kenya Master Facility List (MFL) code – the unique identifier "
        "assigned to every registered health facility by the MoH.",
    )
    name = models.CharField(
        max_length=200,
        help_text="Official facility name as registered on the MFL.",
    )
    level = models.CharField(
        max_length=1,
        choices=FacilityLevel.choices,
        help_text="KEPH level (1–6) determining the scope of services offered.",
    )
    ownership = models.CharField(
        max_length=20,
        choices=OwnershipType.choices,
        help_text="Ownership category (GOK, FBO, NGO, or Private).",
    )
    is_headquarters = models.BooleanField(
        default=False,
        help_text="Whether this is the main branch of the organization.",
    )
    branch_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Internal branch identifier within the organization.",
    )
    logo = models.ImageField(
        upload_to="facilities/logos/",
        null=True,
        blank=True,
        validators=[_validate_image_upload],
        help_text="Facility logo for branding. Falls back to organization logo if not set.",
    )

    # ------------------------------------------------------------------
    # Location (Kenya administrative hierarchy)
    # ------------------------------------------------------------------

    county = models.ForeignKey(
        "County",
        on_delete=models.PROTECT,
        related_name="facilities",
        help_text="County where the facility is located.",
    )
    sub_county = models.ForeignKey(
        "SubCounty",
        on_delete=models.PROTECT,
        related_name="facilities",
        help_text="Sub-county where the facility is located.",
    )
    ward = models.ForeignKey(
        "Ward",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="facilities",
        help_text="Ward where the facility is located (optional).",
    )

    # ------------------------------------------------------------------
    # SHA (Social Health Authority) Registration
    # ------------------------------------------------------------------

    sha_contracted = models.BooleanField(
        default=False,
        help_text="Whether the facility is contracted by the Social Health "
        "Authority (SHA) for claims processing.",
    )
    sha_contract_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="Date when the current SHA contract expires.",
    )
    sha_facility_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA-specific facility code used in claims submission.",
    )

    # Biometrics agent — PII encrypted (Kenya DPA 2019 § 41)
    biometrics_agent_national_id_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted national ID of the biometrics agent.",
    )
    biometrics_agent_national_id = encrypted_pii_property("biometrics_agent_national_id")

    # ------------------------------------------------------------------
    # DHA Registry Cache (populated via ILM facility-search)
    # ------------------------------------------------------------------
    # Non-PII fields stored as plain columns for offline access.
    # PII fields (admin phone, email, ID) stored encrypted.

    dha_registry_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the DHA registry data was last fetched.",
    )
    dha_fid_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHA Facility ID code.",
    )
    dha_fr_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHA Facility Registration code.",
    )
    dha_license_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="License status from DHA (e.g. LICENSED).",
    )
    dha_license_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="License number from DHA.",
    )
    dha_license_expiry = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="License expiry date string from DHA.",
    )
    dha_operational_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Regulatory operational status from DHA.",
    )
    dha_sha_contract_status = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA contract status from DHA.",
    )
    dha_sha_contract_start = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="SHA contract start date string from DHA.",
    )
    dha_sha_contract_end = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="SHA contract end date string from DHA.",
    )
    dha_total_beds = models.PositiveIntegerField(
        default=0,
        help_text="Total bed capacity from DHA.",
    )
    dha_icu_beds = models.PositiveIntegerField(
        default=0,
        help_text="ICU bed count from DHA.",
    )
    dha_hdu_beds = models.PositiveIntegerField(
        default=0,
        help_text="HDU bed count from DHA.",
    )
    dha_facility_type = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Facility type from DHA.",
    )
    dha_keph_level = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="KEPH level from DHA.",
    )
    dha_ownership = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Ownership from DHA.",
    )
    dha_regulatory_body = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Regulatory body from DHA.",
    )

    # DHA PII fields — encrypted (admin contact, facility contact)
    dha_admin_name_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator name.",
    )
    dha_admin_phone_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator phone.",
    )
    dha_admin_email_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator email.",
    )
    dha_admin_id_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted DHA administrator national ID.",
    )
    dha_facility_phone_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted facility phone from DHA.",
    )
    dha_facility_email_encrypted = models.TextField(
        blank=True,
        default="",
        help_text="KMS-encrypted facility email from DHA.",
    )

    # Property descriptors — transparent encrypt-on-write, decrypt-on-read
    dha_admin_name = encrypted_pii_property("dha_admin_name")
    dha_admin_phone = encrypted_pii_property("dha_admin_phone")
    dha_admin_email = encrypted_pii_property("dha_admin_email")
    dha_admin_id = encrypted_pii_property("dha_admin_id")
    dha_facility_phone = encrypted_pii_property("dha_facility_phone")
    dha_facility_email = encrypted_pii_property("dha_facility_email")

    # Full DHA response (non-PII subset) for UI rendering
    dha_registry_data = models.JSONField(
        null=True,
        blank=True,
        help_text="Cached DHA registry response with PII fields stripped.",
    )

    # ------------------------------------------------------------------
    # DHIS2 / KHIS Integration
    # ------------------------------------------------------------------

    dhis2_org_unit = models.CharField(
        max_length=11,
        blank=True,
        default="",
        help_text="DHIS2 Organisation Unit UID for this facility. "
        "Each facility has a unique 11-character UID in KHIS.",
    )

    # ------------------------------------------------------------------
    # Enabled Modules (Capability-Based Experience)
    # ------------------------------------------------------------------
    # Explicit booleans are used instead of a JSONField so that Django
    # can enforce type safety and queries remain straightforward
    # (e.g. ``Facility.objects.filter(has_laboratory=True)``).

    has_outpatient = models.BooleanField(
        default=True,
        help_text="Outpatient Department (OPD) services.",
    )
    has_inpatient = models.BooleanField(
        default=False,
        help_text="Inpatient (ward admission) services.",
    )
    has_emergency = models.BooleanField(
        default=False,
        help_text="Emergency / Casualty department.",
    )
    has_pharmacy = models.BooleanField(
        default=True,
        help_text="Pharmacy / dispensing services.",
    )
    has_laboratory = models.BooleanField(
        default=False,
        help_text="Laboratory / diagnostics services.",
    )
    has_imaging = models.BooleanField(
        default=False,
        help_text="Radiology / imaging services.",
    )
    has_theatre = models.BooleanField(
        default=False,
        help_text="Surgical theatre / operating room.",
    )
    has_dialysis = models.BooleanField(
        default=False,
        help_text="Renal dialysis unit.",
    )
    has_icu = models.BooleanField(
        default=False,
        help_text="Intensive Care Unit (ICU).",
    )
    has_maternity = models.BooleanField(
        default=False,
        help_text="Maternity / obstetrics services.",
    )
    has_mortuary = models.BooleanField(
        default=False,
        help_text="Mortuary / funeral services.",
    )
    has_blood_bank = models.BooleanField(
        default=False,
        help_text="Blood bank / transfusion services.",
    )
    has_inventory = models.BooleanField(
        default=False,
        help_text="Inventory / supply chain management module.",
    )
    has_lis_standalone = models.BooleanField(
        default=False,
        help_text="LIS standalone mode: lab operates independently without full HMIS.",
    )
    has_pharmacy_standalone = models.BooleanField(
        default=False,
        help_text="Pharmacy standalone mode: pharmacy operates as a retail/walk-in dispensary without full HMIS.",
    )
    has_imaging_standalone = models.BooleanField(
        default=False,
        help_text="Imaging standalone mode: imaging operates independently (e.g., diagnostic centre) without full HMIS.",
    )
    has_triage = models.BooleanField(
        default=True,
        help_text="Triage / patient acuity assessment.",
    )
    has_scheduling = models.BooleanField(
        default=True,
        help_text="Appointment scheduling and roster management.",
    )
    has_surveillance = models.BooleanField(
        default=False,
        help_text="Disease surveillance and outbreak reporting.",
    )
    has_immunizations = models.BooleanField(
        default=False,
        help_text="Immunization / vaccination programme.",
    )
    has_allied_health = models.BooleanField(
        default=False,
        help_text="Allied health services (physiotherapy, nutrition, social work, etc.).",
    )
    has_quality = models.BooleanField(
        default=False,
        help_text="Quality improvement and clinical audit.",
    )
    has_billing = models.BooleanField(
        default=True,
        help_text="Billing, invoicing, and financial management.",
    )
    has_private_insurance = models.BooleanField(
        default=False,
        help_text="Private insurance claims, pre-authorizations, and remittances.",
    )
    has_moh_reporting = models.BooleanField(
        default=True,
        help_text="MOH 705/711/717 aggregate reporting and DHIS2 submission.",
    )
    has_ai_assistant = models.BooleanField(
        default=False,
        help_text="TibaBot AI assistant available at this facility (requires plan ai_assistant feature).",
    )
    has_cds = models.BooleanField(
        default=False,
        help_text="Clinical Decision Support (CDS) available at this facility (requires plan ai_assistant feature).",
    )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    is_active = models.BooleanField(
        default=True,
        help_text="Whether the facility is currently operational.",
    )

    operating_mode = models.CharField(
        max_length=30,
        choices=OperatingMode.choices,
        default=OperatingMode.FULL_HMIS,
        help_text=(
            "Top-level facility mode. Choosing a standalone mode disables "
            "clinical workflow modules (inpatient, ER, triage, etc.) and "
            "enables the relevant standalone module + billing + inventory."
        ),
    )

    # ------------------------------------------------------------------
    # Meta & Magic Methods
    # ------------------------------------------------------------------

    class Meta:
        """Meta options for Facility."""

        verbose_name = "Facility"
        verbose_name_plural = "Facilities"
        ordering = ["name"]

    def __str__(self) -> str:
        """Return the facility name and MFL code for human-readable display."""
        return f"{self.name} ({self.mfl_code})"

    def save(self, *args, **kwargs):
        """Auto-apply default modules based on KEPH level on creation."""
        # Detect operating_mode changes so we cascade module flags on save.
        apply_mode_cascade = False
        if self._state.adding:
            if self.operating_mode and self.operating_mode != self.OperatingMode.FULL_HMIS:
                apply_mode_cascade = True
        else:
            try:
                previous = type(self).objects.only("operating_mode").get(pk=self.pk)
            except type(self).DoesNotExist:
                previous = None
            if previous and previous.operating_mode != self.operating_mode:
                apply_mode_cascade = True

        if self._state.adding and not getattr(self, "_skip_module_defaults", False):
            module_fields = [
                "has_outpatient",
                "has_inpatient",
                "has_emergency",
                "has_pharmacy",
                "has_laboratory",
                "has_imaging",
                "has_theatre",
                "has_dialysis",
                "has_icu",
                "has_maternity",
                "has_mortuary",
                "has_blood_bank",
                "has_inventory",
                "has_triage",
                "has_scheduling",
                "has_surveillance",
                "has_immunizations",
                "has_allied_health",
                "has_quality",
                "has_billing",
                "has_private_insurance",
            ]
            # Only apply defaults if no module was explicitly set beyond the
            # model-level defaults (outpatient=True, pharmacy=True, triage=True,
            # scheduling=True, billing=True, rest=False).
            defaults_from_model = {
                "has_outpatient": True,
                "has_pharmacy": True,
                "has_triage": True,
                "has_scheduling": True,
                "has_billing": True,
            }
            all_at_model_default = all(
                getattr(self, f) == defaults_from_model.get(f, False) for f in module_fields
            )
            if all_at_model_default and self.level:
                level_defaults = self.default_modules_for_level(self.level)
                for module_name, enabled in level_defaults.items():
                    setattr(self, f"has_{module_name}", enabled)

        if apply_mode_cascade:
            self._apply_operating_mode_cascade()

        super().save(*args, **kwargs)

    # ------------------------------------------------------------------
    # Operating-mode cascade
    # ------------------------------------------------------------------

    # Clinical workflow modules disabled in any standalone mode.
    # Lab/imaging standalone flags are included here and selectively
    # re-enabled per mode via _MODE_ENABLES.
    _STANDALONE_DISABLES = (
        "has_inpatient",
        "has_emergency",
        "has_triage",
        "has_maternity",
        "has_theatre",
        "has_dialysis",
        "has_icu",
        "has_mortuary",
        "has_blood_bank",
        "has_allied_health",
        "has_scheduling",
        "has_surveillance",
        "has_immunizations",
        "has_outpatient",
        "has_moh_reporting",
        # Quality, private insurance and AI/CDS are full-HMIS only.
        "has_quality",
        "has_private_insurance",
        "has_ai_assistant",
        "has_cds",
        # Lab/imaging flags — disabled by default, re-enabled per mode
        "has_laboratory",
        "has_imaging",
        "has_lis_standalone",
        "has_imaging_standalone",
    )

    # Per-mode flags to force-enable.
    _MODE_ENABLES: dict[str, tuple[str, ...]] = {
        "STANDALONE_LAB": (
            "has_laboratory",
            "has_lis_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_PHARMACY": (
            "has_pharmacy",
            "has_pharmacy_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_IMAGING": (
            "has_imaging",
            "has_imaging_standalone",
            "has_billing",
            "has_inventory",
        ),
        "STANDALONE_DIAGNOSTIC": (
            "has_laboratory",
            "has_imaging",
            "has_lis_standalone",
            "has_imaging_standalone",
            "has_billing",
            "has_inventory",
        ),
    }

    # ------------------------------------------------------------------
    # Subscription tier gating
    # ------------------------------------------------------------------

    # Maps each Facility ``has_*`` boolean to the matching subscription
    # feature key on ``SubscriptionPlan.features``. Used by the facility
    # serializer to reject module flips that the org's plan does not cover.
    MODULE_FLAG_TO_FEATURE: dict[str, str] = {
        "has_outpatient": "outpatient",
        "has_inpatient": "inpatient",
        "has_emergency": "emergency",
        "has_pharmacy": "pharmacy",
        "has_laboratory": "laboratory",
        "has_imaging": "imaging",
        "has_theatre": "theatre",
        "has_dialysis": "dialysis",
        "has_icu": "icu",
        "has_maternity": "maternity",
        "has_mortuary": "mortuary",
        "has_blood_bank": "blood_bank",
        "has_inventory": "inventory",
        "has_lis_standalone": "lis_standalone",
        "has_pharmacy_standalone": "pharmacy_standalone",
        "has_imaging_standalone": "imaging_standalone",
        "has_triage": "triage",
        "has_scheduling": "scheduling",
        "has_surveillance": "surveillance",
        "has_immunizations": "immunizations",
        "has_allied_health": "allied_health",
        "has_quality": "quality",
        "has_billing": "billing",
        "has_private_insurance": "private_insurance",
        "has_moh_reporting": "moh_reporting",
        "has_ai_assistant": "ai_assistant",
        "has_cds": "ai_assistant",
    }

    # Subscription features required to switch into a given operating mode.
    # Used by the facility serializer to reject unsupported mode changes.
    OPERATING_MODE_REQUIRED_FEATURES: dict[str, tuple[str, ...]] = {
        "STANDALONE_LAB": ("laboratory", "lis_standalone"),
        "STANDALONE_PHARMACY": ("pharmacy", "pharmacy_standalone"),
        "STANDALONE_IMAGING": ("imaging", "imaging_standalone"),
        "STANDALONE_DIAGNOSTIC": (
            "laboratory",
            "imaging",
            "lis_standalone",
            "imaging_standalone",
        ),
    }

    def _apply_operating_mode_cascade(self) -> None:
        """
        Cascade ``has_*`` flags based on ``operating_mode``.

        FULL_HMIS does not alter flags (admin manages individually).
        Any STANDALONE_* mode disables clinical workflow modules and
        force-enables the relevant standalone module plus billing/inventory.
        """
        mode = self.operating_mode
        if not mode or mode == self.OperatingMode.FULL_HMIS:
            return

        enables = self._MODE_ENABLES.get(str(mode), ())
        for flag in self._STANDALONE_DISABLES:
            if flag not in enables:
                setattr(self, flag, False)
        for flag in enables:
            setattr(self, flag, True)

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def modules(self) -> dict[str, bool]:
        """
        Return enabled service modules as a flat dictionary.

        This is used by the ``FacilitySerializer`` to expose the capability
        map in API responses, which in turn powers the sidebar filtering on
        the frontend.

        Returns:
            Dictionary mapping module name → enabled boolean.
        """
        return {
            "outpatient": self.has_outpatient,
            "inpatient": self.has_inpatient,
            "emergency": self.has_emergency,
            "pharmacy": self.has_pharmacy,
            "laboratory": self.has_laboratory,
            "imaging": self.has_imaging,
            "theatre": self.has_theatre,
            "dialysis": self.has_dialysis,
            "icu": self.has_icu,
            "maternity": self.has_maternity,
            "mortuary": self.has_mortuary,
            "blood_bank": self.has_blood_bank,
            "inventory": self.has_inventory,
            "lis_standalone": self.has_lis_standalone,
            "pharmacy_standalone": self.has_pharmacy_standalone,
            "imaging_standalone": self.has_imaging_standalone,
            "triage": self.has_triage,
            "scheduling": self.has_scheduling,
            "surveillance": self.has_surveillance,
            "immunizations": self.has_immunizations,
            "allied_health": self.has_allied_health,
            "quality": self.has_quality,
            "billing": self.has_billing,
            "private_insurance": self.has_private_insurance,
            "moh_reporting": self.has_moh_reporting,
            "ai_assistant": self.has_ai_assistant,
            "cds": self.has_cds,
        }

    @property
    def enabled_module_names(self) -> list[str]:
        """
        Return a list of *enabled* module names (convenience helper).

        Example::

            >>> facility.enabled_module_names
            ['outpatient', 'pharmacy', 'laboratory']
        """
        return [name for name, enabled in self.modules.items() if enabled]

    @property
    def effective_logo(self):
        """
        Return the facility's own logo, falling back to the organization logo.

        This allows facilities to either use their own branding or inherit
        the parent organization's logo.
        """
        if self.logo:
            return self.logo
        if self.organization and self.organization.logo:
            return self.organization.logo
        return None

    # ------------------------------------------------------------------
    # DHA Registry Sync
    # ------------------------------------------------------------------

    # PII field keys in DHA responses — stripped from dha_registry_data
    _DHA_PII_KEYS = frozenset(
        {
            "facilityAdministratorName",
            "facilityAdministratorPhone",
            "facilityAdministratorEmail",
            "facilityAdministratorIdentifier",
            "facilityPhoneNumber",
            "facilityEmail",
        }
    )

    def update_from_dha_response(self, data: dict) -> None:
        """
        Populate cached DHA registry fields from a DHA API response dict.

        Non-PII fields are stored as plain columns.  PII fields (admin
        contact, facility contact) are stored encrypted.  The full response
        is cached in ``dha_registry_data`` with PII keys stripped.
        """
        from django.utils import timezone

        # Non-PII columns
        self.dha_fid_code = str(data.get("fidCode", "") or "")
        self.dha_fr_code = str(data.get("frCode", "") or "")
        self.dha_license_status = str(data.get("facilityLicenseStatus", "") or "")
        self.dha_license_number = str(data.get("licenseNumber", "") or "")
        self.dha_license_expiry = str(data.get("facilityLicenseEndDate", "") or "")
        self.dha_facility_type = str(data.get("facilityType", "") or "")
        self.dha_keph_level = str(data.get("kephLevel", "") or "")
        self.dha_ownership = str(data.get("facilityOwnership", "") or "")
        self.dha_regulatory_body = str(data.get("regulatoryBody", "") or "")

        # Operational / SHA status
        reg_ops = data.get("regulatoryOperationalStatus") or {}
        self.dha_operational_status = str(
            reg_ops.get("operationalStatus", "") if isinstance(reg_ops, dict) else ""
        )
        self.dha_sha_contract_status = str(data.get("shaContractStatus", "") or "")
        self.dha_sha_contract_start = str(data.get("shaConstractStartDate", "") or "")
        self.dha_sha_contract_end = str(data.get("shaConstractEndDate", "") or "")

        # Bed capacity
        beds = data.get("bedOccupancy") or {}
        if isinstance(beds, dict):
            self.dha_total_beds = int(beds.get("totalBeds", 0) or 0)
            self.dha_icu_beds = int(beds.get("icuBeds", 0) or 0)
            self.dha_hdu_beds = int(beds.get("hduBeds", 0) or 0)

        # PII fields — encrypted
        self.dha_admin_name = str(data.get("facilityAdministratorName", "") or "")
        self.dha_admin_phone = str(data.get("facilityAdministratorPhone", "") or "")
        self.dha_admin_email = str(data.get("facilityAdministratorEmail", "") or "")
        self.dha_admin_id = str(data.get("facilityAdministratorIdentifier", "") or "")
        self.dha_facility_phone = str(data.get("facilityPhoneNumber", "") or "")
        self.dha_facility_email = str(data.get("facilityEmail", "") or "")

        # Cache the full response with PII stripped
        safe_data = {k: v for k, v in data.items() if k not in self._DHA_PII_KEYS}
        self.dha_registry_data = safe_data
        self.dha_registry_synced_at = timezone.now()

    # ------------------------------------------------------------------
    # Class Methods
    # ------------------------------------------------------------------

    @classmethod
    def default_modules_for_level(cls, level: str) -> dict[str, bool]:
        """
        Return sensible default module flags for a given KEPH level.

        These defaults mirror the Kenya MoH guidelines on which services
        are typically available at each facility tier.  They are used when
        creating a new facility to pre-populate the capability flags.

        Args:
            level: KEPH level string ("1" through "6").

        Returns:
            Dictionary mapping module name → default boolean.
        """
        all_modules = {
            "outpatient": False,
            "inpatient": False,
            "emergency": False,
            "pharmacy": False,
            "laboratory": False,
            "imaging": False,
            "theatre": False,
            "dialysis": False,
            "icu": False,
            "maternity": False,
            "mortuary": False,
            "blood_bank": False,
            "inventory": False,
            "triage": False,
            "scheduling": False,
            "surveillance": False,
            "immunizations": False,
            "allied_health": False,
            "quality": False,
            "billing": False,
            "private_insurance": False,
            "ai_assistant": False,
            "cds": False,
        }

        level_overrides: dict[str, dict[str, bool]] = {
            "1": {
                "outpatient": True,
                "triage": True,
                "billing": True,
                "immunizations": True,
            },
            "2": {
                "outpatient": True,
                "pharmacy": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
            },
            "3": {
                "outpatient": True,
                "pharmacy": True,
                "laboratory": True,
                "maternity": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
            },
            "4": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "maternity": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
            },
            "5": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "icu": True,
                "maternity": True,
                "dialysis": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
            },
            "6": {
                "outpatient": True,
                "inpatient": True,
                "emergency": True,
                "pharmacy": True,
                "laboratory": True,
                "imaging": True,
                "theatre": True,
                "icu": True,
                "maternity": True,
                "dialysis": True,
                "blood_bank": True,
                "mortuary": True,
                "inventory": True,
                "triage": True,
                "scheduling": True,
                "billing": True,
                "immunizations": True,
                "surveillance": True,
                "allied_health": True,
                "quality": True,
                "private_insurance": True,
            },
        }

        overrides = level_overrides.get(
            level, {"outpatient": True, "triage": True, "billing": True}
        )
        return {**all_modules, **overrides}


class SNOMEDConcept(models.Model):
    """
    Local cache of SNOMED CT concepts for offline search.

    Populated via the `seed_snomed_common` management command with frequently
    used clinical concepts. Supplemented at runtime when clinicians search
    via the Snowstorm API — results are cached here for subsequent lookups.

    Attributes:
        concept_id: SNOMED CT concept ID (e.g., '38341003')
        display: Preferred term (e.g., 'Hypertensive disorder')
        semantic_tag: FSN semantic tag (e.g., 'disorder', 'finding', 'procedure')
        is_active: Whether the concept is active in SNOMED CT
    """

    concept_id = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text="SNOMED CT concept ID (e.g., '38341003')",
    )
    display = models.CharField(
        max_length=500,
        help_text="SNOMED CT preferred term",
    )
    semantic_tag = models.CharField(
        max_length=50,
        blank=True,
        default="",
        db_index=True,
        help_text="Semantic tag from FSN (e.g., 'disorder', 'finding', 'procedure')",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this concept is active in SNOMED CT",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "SNOMED CT Concept"
        verbose_name_plural = "SNOMED CT Concepts"
        ordering = ["display"]
        indexes = [
            models.Index(fields=["display"]),
        ]

    def __str__(self) -> str:
        return f"{self.concept_id} | {self.display}"


# =============================================================================
# DHIS2 Configuration (Multi-Facility / Multi-Org)
# =============================================================================


class DHIS2Config(OrganizationScopedModel, TimeStampedModel):
    """
    DHIS2/KHIS connection configuration scoped to an Organization.

    In Kenya's DHIS2 ecosystem (KHIS), credentials are typically issued at
    the sub-county or county level — one user account can submit data for
    multiple facilities. The DHIS2 Organisation Unit UID, however, is
    per-facility and lives on the ``Facility.dhis2_org_unit`` field.

    This model stores the **connection credentials** (base URL + auth) that
    are shared across all facilities within an organization. Facilities
    resolve their own org unit from ``Facility.dhis2_org_unit``.

    Security:
        The ``password`` field is stored encrypted via the KMS provider.
        Use ``set_password()`` / ``get_password()`` for read/write access.
    """

    class Environment(models.TextChoices):
        """DHIS2 target environment."""

        LOCAL = "local", "Local (dev/test)"
        STAGING = "staging", "Staging"
        PRODUCTION = "production", "Production (KHIS)"

    name = models.CharField(
        max_length=100,
        help_text="Human-readable label, e.g. 'Mombasa Sub-County KHIS'.",
    )
    base_url = models.URLField(
        max_length=255,
        help_text="DHIS2 instance base URL, e.g. 'https://hiskenya.org'.",
    )
    username = models.CharField(
        max_length=150,
        help_text="DHIS2 API username.",
    )
    _password = models.TextField(
        db_column="password",
        help_text="Encrypted DHIS2 API password. Use set_password()/get_password().",
    )
    environment = models.CharField(
        max_length=12,
        choices=Environment.choices,
        default=Environment.PRODUCTION,
        help_text="Target DHIS2 environment (controls data-element UID resolution).",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this configuration is currently active.",
    )

    class Meta:
        verbose_name = "DHIS2 Configuration"
        verbose_name_plural = "DHIS2 Configurations"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization"],
                condition=models.Q(is_active=True),
                name="unique_active_dhis2_config_per_org",
            ),
        ]

    def __str__(self) -> str:
        org_name = getattr(self.organization, "name", "—")
        return f"{self.name} ({org_name})"

    # -- Password encryption helpers ------------------------------------

    def set_password(self, plain: str) -> None:
        """Encrypt and store a plaintext password."""
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        self._password = kms.encrypt(plain.encode()).decode()

    def get_password(self) -> str:
        """Decrypt and return the stored password."""
        if not self._password:
            return ""
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        return kms.decrypt(self._password.encode()).decode()

    # -- Convenience helpers --------------------------------------------

    @property
    def api_url(self) -> str:
        """Return the base URL with trailing slash stripped."""
        return self.base_url.rstrip("/")

    @classmethod
    def get_for_facility(cls, facility) -> "DHIS2Config | None":
        """Return the active DHIS2 config for a facility's organization.

        Falls back to global Django settings if no DB config exists
        (backward-compatible with env-var-only deployments).
        """
        if not facility or not facility.organization_id:
            return None
        return (
            cls.objects.filter(
                organization=facility.organization,
                is_active=True,
            )
            .select_related("organization")
            .first()
        )


# =============================================================================
# PKI & Digital Signature Models (DHA Gap #32 — Sprint 3.C)
# =============================================================================


class CertificateAuthority(models.Model):
    """
    X.509 Certificate Authority for document signing.

    Supports a root CA with optional intermediate CAs. Private keys
    are encrypted at rest using the KMS provider.
    """

    name = models.CharField(
        max_length=200,
        help_text="CA display name (e.g., 'Vitora HMIS Root CA')",
    )
    serial_number = models.CharField(
        max_length=64,
        unique=True,
        help_text="Certificate serial number (hex)",
    )
    subject_dn = models.CharField(
        max_length=500,
        help_text="Distinguished Name (e.g., 'CN=Vitora HMIS Root CA, O=Nexora Africa Ltd, C=KE')",
    )
    public_key_pem = models.TextField(
        help_text="PEM-encoded public key",
    )
    private_key_pem_encrypted = models.TextField(
        help_text="PEM private key encrypted with KMS",
    )
    certificate_pem = models.TextField(
        help_text="X.509 certificate in PEM format",
    )
    valid_from = models.DateTimeField(help_text="Certificate validity start")
    valid_to = models.DateTimeField(help_text="Certificate validity end")
    is_root = models.BooleanField(
        default=True,
        help_text="Whether this is a root CA (self-signed)",
    )
    parent_ca = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="subordinate_cas",
        help_text="Parent CA for intermediate CAs",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Whether this CA is currently active for issuing certificates",
    )
    key_size = models.IntegerField(
        default=2048,
        help_text="RSA key size in bits",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Certificate Authority"
        verbose_name_plural = "Certificate Authorities"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        status = "Active" if self.is_active else "Inactive"
        return f"{self.name} ({status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.valid_to


class UserCertificate(models.Model):
    """
    X.509 user certificate for document signing.

    Issued by a CertificateAuthority. Private key encrypted at rest via KMS.
    """

    class RevocationReason(models.TextChoices):
        KEY_COMPROMISE = "KEY_COMPROMISE", "Key Compromise"
        AFFILIATION_CHANGED = "AFFILIATION_CHANGED", "Affiliation Changed"
        SUPERSEDED = "SUPERSEDED", "Superseded"
        CESSATION = "CESSATION", "Cessation of Operation"
        PRIVILEGE_WITHDRAWN = "PRIVILEGE_WITHDRAWN", "Privilege Withdrawn"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificates",
        help_text="User who owns this certificate",
    )
    certificate_authority = models.ForeignKey(
        CertificateAuthority,
        on_delete=models.PROTECT,
        related_name="issued_certificates",
        help_text="CA that issued this certificate",
    )
    serial_number = models.CharField(
        max_length=64,
        unique=True,
        help_text="Certificate serial number (hex)",
    )
    subject_dn = models.CharField(
        max_length=500,
        help_text="Certificate subject DN",
    )
    public_key_pem = models.TextField(
        help_text="PEM-encoded public key",
    )
    private_key_pem_encrypted = models.TextField(
        help_text="PEM private key encrypted with KMS",
    )
    certificate_pem = models.TextField(
        help_text="X.509 certificate in PEM format",
    )
    valid_from = models.DateTimeField(help_text="Certificate validity start")
    valid_to = models.DateTimeField(help_text="Certificate validity end")
    is_revoked = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this certificate has been revoked",
    )
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the certificate was revoked",
    )
    revocation_reason = models.CharField(
        max_length=30,
        choices=RevocationReason.choices,
        blank=True,
        default="",
        help_text="Reason for revocation",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Certificate"
        verbose_name_plural = "User Certificates"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_revoked"]),
        ]

    def __str__(self) -> str:
        status = "Revoked" if self.is_revoked else ("Expired" if self.is_expired else "Valid")
        return f"Cert {self.serial_number[:8]}... ({self.user.username}, {status})"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.valid_to

    @property
    def is_valid(self) -> bool:
        return not self.is_revoked and not self.is_expired and self.certificate_authority.is_active


class CertificateRevocation(models.Model):
    """CRL entry for a revoked certificate."""

    certificate = models.ForeignKey(
        UserCertificate,
        on_delete=models.CASCADE,
        related_name="revocations",
        help_text="The revoked certificate",
    )
    revoked_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the certificate was revoked",
    )
    reason = models.CharField(
        max_length=30,
        choices=UserCertificate.RevocationReason.choices,
        help_text="Reason for revocation",
    )
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="certificate_revocations",
        help_text="User who revoked the certificate",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Certificate Revocation"
        verbose_name_plural = "Certificate Revocations"
        ordering = ["-revoked_at"]

    def __str__(self) -> str:
        return f"Revocation of {self.certificate.serial_number[:8]}... ({self.reason})"


class DocumentSignature(models.Model):
    """
    Cryptographic signature for a clinical document.

    Stores an RSA-2048 signature over the SHA-256 hash of the
    document's canonical content at signing time.
    """

    document_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Model name of the signed document (e.g., 'LabResult', 'Prescription')",
    )
    document_id = models.BigIntegerField(
        db_index=True,
        help_text="Primary key of the signed document",
    )
    signer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="document_signatures",
        help_text="User who signed the document",
    )
    certificate = models.ForeignKey(
        UserCertificate,
        on_delete=models.PROTECT,
        related_name="signatures",
        help_text="Certificate used to create the signature",
    )
    content_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hex digest of the document content at signing time",
    )
    signature = models.TextField(
        help_text="Base64-encoded RSA signature",
    )
    hash_algorithm = models.CharField(
        max_length=20,
        default="SHA-256",
        help_text="Hash algorithm used",
    )
    signed_at = models.DateTimeField(
        default=timezone.now,
        help_text="When the document was signed",
    )
    is_valid = models.BooleanField(
        default=True,
        help_text="Cached validity (updated on verification)",
    )
    verification_note = models.TextField(
        blank=True,
        default="",
        help_text="Notes from the last verification",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Document Signature"
        verbose_name_plural = "Document Signatures"
        ordering = ["-signed_at"]
        indexes = [
            models.Index(fields=["document_type", "document_id"]),
            models.Index(fields=["signer", "signed_at"]),
        ]

    def __str__(self) -> str:
        return f"Sig on {self.document_type}#{self.document_id} by {self.signer.username}"


# ============================================================================
# Staff Invitation & Password Reset Models
# ============================================================================


class StaffInvitation(models.Model):
    """
    Invitation for a new staff member to join the system.

    An admin creates an invitation specifying the email, role, department, and
    facility. The system sends an email with a unique link. The invitee uses the
    link to set their own username, password, and personal details. Once accepted
    a User + StaffProfile are created with the pre-configured role/department.

    Invitations expire after ``expires_hours`` (default 72h, max 720h / 30 days).
    """

    class InvitationStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACCEPTED = "ACCEPTED", "Accepted"
        EXPIRED = "EXPIRED", "Expired"
        REVOKED = "REVOKED", "Revoked"
        DECLINED = "DECLINED", "Declined"

    # Invitation identity
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique token embedded in the invitation link.",
    )
    email_encrypted = models.TextField(default="", blank=True)
    email_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    email = encrypted_pii_property("email")

    # Pre-configured admin settings
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="invitations",
        help_text="Organization the invitee will belong to.",
    )
    facility = models.ForeignKey(
        "Facility",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary facility assignment.",
    )
    role = models.ForeignKey(
        "Role",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary role to assign on acceptance.",
    )
    department = models.ForeignKey(
        "Department",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invitations",
        help_text="Primary department to assign on acceptance.",
    )
    secondary_roles = models.ManyToManyField(
        "Role",
        blank=True,
        related_name="secondary_invitations",
        help_text="Additional roles to assign on acceptance.",
    )
    secondary_departments = models.ManyToManyField(
        "Department",
        blank=True,
        related_name="secondary_invitations",
        help_text="Additional departments to assign on acceptance.",
    )
    job_title = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Job title for the new staff member.",
    )
    employee_id = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Pre-assigned employee ID (admin can pre-fill or leave blank).",
    )

    # Lifecycle
    status = models.CharField(
        max_length=10,
        choices=InvitationStatus.choices,
        default=InvitationStatus.PENDING,
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
        help_text="Admin who created the invitation.",
    )
    expires_at = models.DateTimeField(
        help_text="When the invitation link expires.",
    )
    expires_hours = models.PositiveIntegerField(
        default=72,
        help_text="Invitation validity in hours (default 72, max 720 = 30 days).",
    )

    # Acceptance tracking
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_invitation",
        help_text="User account created when invitation was accepted.",
    )

    # Email tracking
    last_sent_at = models.DateTimeField(null=True, blank=True)
    send_count = models.PositiveIntegerField(default=0)

    # Cross-org invitation fields
    is_cross_org = models.BooleanField(
        default=False,
        help_text="True when inviting an existing user to a different org.",
    )
    existing_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cross_org_invitations",
        help_text="Reference to existing user being invited cross-org.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Staff Invitation"
        verbose_name_plural = "Staff Invitations"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["email_hmac"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"Invitation for {self.email} ({self.status})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""
        import uuid

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            hours = min(self.expires_hours, 720)  # Cap at 30 days
            self.expires_at = timezone.now() + timedelta(hours=hours)
        super().save(*args, **kwargs)

    @property
    def is_expired(self) -> bool:
        """Check if the invitation has expired."""
        return timezone.now() > self.expires_at

    @property
    def is_usable(self) -> bool:
        """Check if the invitation can still be accepted."""
        return self.status == self.InvitationStatus.PENDING and not self.is_expired

    def revoke(self, user=None):
        """Revoke the invitation."""
        self.status = self.InvitationStatus.REVOKED
        self.save(update_fields=["status", "updated_at"])

    def mark_accepted(self, user):
        """Mark invitation as accepted and link to the created user."""
        self.status = self.InvitationStatus.ACCEPTED
        self.accepted_at = timezone.now()
        self.accepted_user = user
        self.save(update_fields=["status", "accepted_at", "accepted_user", "updated_at"])


class PasswordResetToken(models.Model):
    """
    Time-limited token for password reset flows.

    Tokens are single-use and expire after 1 hour by default.
    The endpoint always returns 200 regardless of email existence
    to prevent email enumeration attacks.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="password_reset_tokens",
    )
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique reset token.",
    )
    expires_at = models.DateTimeField(
        help_text="When this token expires (default: 1 hour).",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this token has been used.",
    )
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Password Reset Token"
        verbose_name_plural = "Password Reset Tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user", "used"]),
        ]

    def __str__(self) -> str:
        return f"Reset token for {self.user.username} (used={self.used})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""
        import uuid

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            self.expires_at = timezone.now() + timedelta(hours=1)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        """Check if this token is still valid (not used, not expired)."""
        return not self.used and timezone.now() < self.expires_at

    def consume(self):
        """Mark the token as used."""
        self.used = True
        self.used_at = timezone.now()
        self.save(update_fields=["used", "used_at"])


# ============================================================================
# Email Verification Token (Self-Service Org Signup)
# ============================================================================


class EmailVerificationToken(models.Model):
    """
    Time-limited token for email verification during self-service org signup.

    Tokens are single-use and expire after 24 hours by default.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verification_tokens",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="verification_tokens",
    )
    token = models.UUIDField(
        unique=True,
        editable=False,
        help_text="Unique verification token.",
    )
    expires_at = models.DateTimeField(
        help_text="When this token expires (default: 24 hours).",
    )
    used = models.BooleanField(
        default=False,
        help_text="Whether this token has been used.",
    )
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Email Verification Token"
        verbose_name_plural = "Email Verification Tokens"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["token"]),
            models.Index(fields=["user", "used"]),
        ]

    def __str__(self) -> str:
        return f"Verification token for {self.user.username} (used={self.used})"

    def save(self, *args, **kwargs):
        """Auto-generate token and set expiry on first save."""
        import uuid

        if not self.token:
            self.token = uuid.uuid4()
        if not self.expires_at:
            from datetime import timedelta

            self.expires_at = timezone.now() + timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        """Check if this token is still valid (not used, not expired)."""
        return not self.used and timezone.now() < self.expires_at

    def consume(self):
        """Mark the token as used."""
        self.used = True
        self.used_at = timezone.now()
        self.save(update_fields=["used", "used_at"])


# ---------------------------------------------------------------------------
# OrgMembership — multi-org support with per-org roles
# ---------------------------------------------------------------------------


class OrgMembership(TimeStampedModel):
    """
    Join table linking a StaffProfile to an Organization with per-org role,
    department, and facility assignments.

    Replaces the flat ``StaffProfile.secondary_organizations`` M2M which
    cannot carry per-org metadata (role, department, facilities).

    A user has exactly one ``is_primary=True`` membership (their home org)
    and zero or more secondary memberships (locum, consultant, etc.).
    """

    class MembershipStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        REVOKED = "REVOKED", "Revoked"

    staff_profile = models.ForeignKey(
        "StaffProfile",
        on_delete=models.CASCADE,
        related_name="memberships",
        help_text="Staff member this membership belongs to.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="memberships",
        help_text="Organization the staff member belongs to.",
    )
    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="org_memberships",
        help_text="Role within this organization.",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="org_memberships",
        help_text="Department within this organization (optional).",
    )
    facilities = models.ManyToManyField(
        "Facility",
        blank=True,
        related_name="org_memberships",
        help_text="Facilities the member can access within this organization.",
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Whether this is the staff member's primary (home) organization.",
    )
    status = models.CharField(
        max_length=20,
        choices=MembershipStatus.choices,
        default=MembershipStatus.ACTIVE,
        help_text="Current membership status.",
    )
    joined_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When the member joined this organization.",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="org_invitations_sent",
        help_text="User who invited this member (if applicable).",
    )

    class Meta:
        verbose_name = "Organization Membership"
        verbose_name_plural = "Organization Memberships"
        ordering = ["-is_primary", "-joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["staff_profile", "organization"],
                name="unique_staff_org_membership",
            ),
        ]
        indexes = [
            models.Index(fields=["staff_profile", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.staff_profile.get_full_name()} @ {self.organization.name}"

    def clean(self):
        """Validate that assigned facilities belong to the membership's org."""
        from django.core.exceptions import ValidationError as DjangoValidationError

        if not self.pk:
            return  # Can't check M2M before save
        bad = list(
            self.facilities.exclude(organization=self.organization).values_list("name", flat=True)
        )
        if bad:
            raise DjangoValidationError(
                {
                    "facilities": (
                        f"These facilities do not belong to {self.organization.name}: "
                        f"{', '.join(bad)}"
                    )
                }
            )

    @property
    def is_active(self) -> bool:
        """Whether this membership is currently active."""
        return self.status == self.MembershipStatus.ACTIVE

    @property
    def facility_ids(self) -> list[int]:
        """Return list of facility PKs for this membership."""
        return list(self.facilities.values_list("pk", flat=True))


class OrgJoinRequest(TimeStampedModel):
    """
    Self-service request for a user to join an organization.

    Users can request to join orgs they are not yet members of.
    Org admins can approve (creating an OrgMembership) or reject.
    Only one PENDING request per user-org pair is allowed.
    """

    class RequestStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="join_requests",
        help_text="User requesting to join.",
    )
    organization = models.ForeignKey(
        "Organization",
        on_delete=models.CASCADE,
        related_name="join_requests",
        help_text="Organization the user wants to join.",
    )
    requested_role = models.ForeignKey(
        Role,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="join_requests",
        help_text="Role the user is requesting (optional suggestion).",
    )
    message = models.TextField(
        blank=True,
        default="",
        help_text="Reason the user wants to join.",
    )
    status = models.CharField(
        max_length=20,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_join_requests",
        help_text="Admin who approved or rejected.",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(
        blank=True,
        default="",
        help_text="Admin notes on approval/rejection.",
    )

    class Meta:
        verbose_name = "Organization Join Request"
        verbose_name_plural = "Organization Join Requests"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "organization"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_join_request",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.get_full_name() or self.user.username} → {self.organization.name} ({self.status})"


class DHAOutboundCall(TimeStampedModel):
    """Audit row for every outbound call to the DHA HIE Middleware (ILM).

    Captures method, path, status, latency and a PII-redacted excerpt of the
    request/response payloads. Backed by a 7-year retention task to satisfy
    Kenya DPA 2019.
    """

    class Status(models.TextChoices):
        SUCCESS = "SUCCESS", "Success"
        CLIENT_ERROR = "CLIENT_ERROR", "Client Error (4xx)"
        SERVER_ERROR = "SERVER_ERROR", "Server Error (5xx)"
        TRANSPORT = "TRANSPORT", "Transport Error"
        TIMEOUT = "TIMEOUT", "Timeout"

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
    )
    user = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dha_outbound_calls",
        help_text="User who triggered the call (if request-scoped).",
    )

    method = models.CharField(max_length=10)
    path = models.CharField(max_length=500, help_text="Path on the ILM middleware (no host).")
    base_url = models.CharField(max_length=255, blank=True, default="")
    auth_mode = models.CharField(max_length=20, blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices)
    status_code = models.IntegerField(null=True, blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    attempt = models.PositiveSmallIntegerField(default=1)

    consent_token = models.CharField(max_length=255, blank=True, default="")
    request_id = models.CharField(max_length=64, blank=True, default="")
    correlation_id = models.CharField(max_length=64, blank=True, default="")
    error_code = models.CharField(max_length=64, blank=True, default="")

    request_payload = models.JSONField(null=True, blank=True, help_text="PII-redacted body.")
    response_excerpt = models.JSONField(null=True, blank=True, help_text="First 4KB of response.")
    error_message = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["facility", "-created_at"]),
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["consent_token"]),
            models.Index(fields=["correlation_id"]),
            models.Index(fields=["path"]),
        ]
        verbose_name = "DHA Outbound Call"
        verbose_name_plural = "DHA Outbound Calls"

    def __str__(self) -> str:  # pragma: no cover - cosmetic
        return (
            f"[{self.created_at:%Y-%m-%d %H:%M:%S}] {self.method} {self.path} -> {self.status_code}"
        )


# Import MFA models so Django discovers them for syncdb (--no-migrations mode)
# Import EventStore so Django discovers it for migrations
from hmis.apps.core.events.store import EventStore  # noqa: E402, F401
from hmis.apps.core.mfa.models import (  # noqa: E402, F401
    BackupCode,
    MFAToken,
    UserTOTPDevice,
    UserWebAuthnCredential,
)

# Import projection models so Django discovers them for migrations
from hmis.apps.core.projections.models import (  # noqa: E402, F401
    ClinicQueueStats,
    PharmacyQueueStats,
    RoomUtilizationStats,
    WardOccupancyStats,
)

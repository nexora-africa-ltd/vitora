"""
Core models for Vitora HMIS.

This module contains shared models used across the application,
including the AuditLog model for Kenya Data Protection Act compliance,
and sync-related models for offline-first functionality.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


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

        Returns:
            AuditLog: The created audit log entry
        """
        return cls.objects.create(
            user=user,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details or {},
            patient_id=patient_id,
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

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


class Department(models.Model):
    """
    Hospital department for staff organization and access control.

    Supports hierarchical structure for complex organizational charts.
    Each department can have a head (StaffProfile) and multiple staff members.
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
        unique=True,
        help_text="Unique department code (e.g., OPD, IPD, LAB)",
    )
    name = models.CharField(
        max_length=100,
        help_text="Department name",
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

    # Professional details (Kenya-specific)
    license_number = models.CharField(
        max_length=50,
        blank=True,
        help_text="Professional license number",
    )
    license_expiry = models.DateField(
        null=True,
        blank=True,
        help_text="License expiry date",
    )
    license_verified = models.BooleanField(
        default=False,
        help_text="Whether license has been verified by admin",
    )
    specialization = models.CharField(
        max_length=100,
        blank=True,
        help_text="Medical specialization",
    )

    # Contact
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        help_text="Contact phone number",
    )
    emergency_contact_name = models.CharField(
        max_length=100,
        blank=True,
        help_text="Emergency contact name",
    )
    emergency_contact_phone = models.CharField(
        max_length=20,
        blank=True,
        help_text="Emergency contact phone",
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
        LOW = 'low', 'Low'
        NORMAL = 'normal', 'Normal'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'
    
    id = models.BigAutoField(primary_key=True)
    
    # Core fields
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        help_text="User receiving this notification"
    )
    notification_type = models.CharField(
        max_length=50,
        db_index=True,
        help_text="Category of notification (e.g., 'lab_result', 'appointment')"
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.NORMAL,
        db_index=True,
        help_text="Urgency level - critical notifications may trigger emails"
    )
    title = models.CharField(
        max_length=200,
        help_text="Short notification title"
    )
    message = models.TextField(
        help_text="Full notification message"
    )
    
    # Link to related object
    related_model = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Model name this notification relates to (e.g., 'LabOrder')"
    )
    related_id = models.BigIntegerField(
        null=True,
        blank=True,
        help_text="ID of the related object"
    )
    action_url = models.CharField(
        max_length=500,
        blank=True,
        default="",
        help_text="URL for user action (e.g., view results)"
    )
    
    # Read status
    is_read = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether notification has been read"
    )
    read_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When notification was marked as read"
    )
    
    # Timestamps
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        help_text="When notification was created"
    )
    
    class Meta:
        """Meta options for Notification model."""
        ordering = ['-created_at']  # Newest first
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
            models.Index(fields=['user', 'notification_type']),
            models.Index(fields=['priority', '-created_at']),
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
            self.save(update_fields=['is_read', 'read_at'])

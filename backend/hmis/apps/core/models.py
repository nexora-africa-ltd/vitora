"""
Core models for Vitora HMIS.

This module contains shared models used across the application,
including the AuditLog model for Kenya Data Protection Act compliance.
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

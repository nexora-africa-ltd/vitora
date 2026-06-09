"""
Licensing models for Vitora HMIS.

Tracks physical installations of the HMIS and their license status.
Each installation is tied to an Organization and its SubscriptionPlan.
License tokens (JWT, RS256-signed) are issued on activation and refreshed
on periodic check-ins.
"""

import uuid

from django.db import models

from hmis.apps.core.models import TimeStampedModel


class Installation(TimeStampedModel):
    """
    Represents a single deployed instance of the Vitora HMIS.

    Each physical deployment (desktop hub, kiosk, etc.) registers as an
    Installation and receives a signed license JWT derived from the
    Organization's subscription plan.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending Activation"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        REVOKED = "REVOKED", "Revoked"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    installation_id = models.UUIDField(
        unique=True,
        default=uuid.uuid4,
        editable=False,
        help_text="Unique hardware/installation identifier generated on first run.",
    )
    name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Human-friendly name (e.g., 'Reception Desk 1', 'Pharmacy Hub').",
    )

    # ------------------------------------------------------------------
    # Ownership
    # ------------------------------------------------------------------

    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="installations",
        help_text="Organization this installation belongs to.",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="installations",
        help_text="Facility this installation is deployed at (optional).",
    )
    activated_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="activated_installations",
        help_text="User who activated this installation.",
    )

    # ------------------------------------------------------------------
    # Activation
    # ------------------------------------------------------------------

    activation_code = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="One-time activation code issued to the customer.",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    activated_at = models.DateTimeField(null=True, blank=True)

    # ------------------------------------------------------------------
    # License Token
    # ------------------------------------------------------------------

    license_jwt = models.TextField(
        blank=True,
        default="",
        help_text="Current signed license JWT for this installation.",
    )
    last_check_in = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this installation checked in for token renewal.",
    )
    check_in_ip = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of last check-in.",
    )

    # ------------------------------------------------------------------
    # Revocation
    # ------------------------------------------------------------------

    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.TextField(blank=True, default="")

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    app_version = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="App version reported on last check-in.",
    )
    os_info = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="OS info reported on last check-in.",
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name or self.installation_id} ({self.organization})"

    @property
    def is_active(self) -> bool:
        return self.status == self.Status.ACTIVE

    def revoke(self, reason: str = "") -> None:
        """Revoke this installation's license."""
        from django.utils import timezone

        self.status = self.Status.REVOKED
        self.revoked_at = timezone.now()
        self.revoked_reason = reason
        self.license_jwt = ""
        self.save(
            update_fields=["status", "revoked_at", "revoked_reason", "license_jwt", "updated_at"]
        )

    def suspend(self, reason: str = "") -> None:
        """Temporarily suspend this installation."""
        self.status = self.Status.SUSPENDED
        self.revoked_reason = reason
        self.save(update_fields=["status", "revoked_reason", "updated_at"])

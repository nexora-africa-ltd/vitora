# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""County notification delivery models for surveillance workflows.

What this file is for:
- Persist facility-scoped county notification settings and outbound delivery attempts.

How to use it:
- Import models from `hmis.apps.surveillance.models` where these classes are re-exported.

Supported inputs/args:
- Django ORM model fields only; no standalone CLI arguments.
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.pii import encrypted_pii_property


class CountyNotificationChannel(models.TextChoices):
    """Outbound county-notification channels."""

    SMS = "SMS", "SMS"
    EMAIL = "EMAIL", "Email"


class CountyNotificationDeliveryStatus(models.TextChoices):
    """Delivery lifecycle status for county notifications."""

    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Sent"
    RETRY_SCHEDULED = "RETRY_SCHEDULED", "Retry Scheduled"
    FAILED = "FAILED", "Failed"


class SurveillanceFacilitySettings(FacilityScopedModel):
    """Facility-scoped county-notification settings for surveillance."""

    notify_via_sms = models.BooleanField(default=False)
    notify_via_email = models.BooleanField(default=False)

    sms_recipient_encrypted = models.TextField(default="", blank=True)
    sms_recipient = encrypted_pii_property("sms_recipient")
    email_recipient_encrypted = models.TextField(default="", blank=True)
    email_recipient = encrypted_pii_property("email_recipient")

    include_patient_identifiers = models.BooleanField(
        default=False,
        help_text="Include direct patient identifiers in outbound county notifications.",
    )
    max_retry_attempts = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    retry_backoff_minutes = models.PositiveIntegerField(
        default=15,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],
    )
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility"],
                name="unique_surveillance_settings_per_facility",
            )
        ]


class CountyNotificationDelivery(FacilityScopedModel):
    """Persistent record of outbound county notification delivery attempts."""

    case = models.ForeignKey(
        "surveillance.NotifiableCase",
        on_delete=models.CASCADE,
        related_name="county_notification_deliveries",
    )
    channel = models.CharField(max_length=10, choices=CountyNotificationChannel.choices)
    status = models.CharField(
        max_length=20,
        choices=CountyNotificationDeliveryStatus.choices,
        default=CountyNotificationDeliveryStatus.PENDING,
    )

    recipient_encrypted = models.TextField(default="", blank=True)
    recipient = encrypted_pii_property("recipient")

    attempt_count = models.PositiveIntegerField(default=0)
    max_retry_attempts = models.PositiveSmallIntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    retry_backoff_minutes = models.PositiveIntegerField(
        default=15,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],
    )
    last_error = models.TextField(blank=True, default="")

    sent_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)

    triggered_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="surveillance_county_notifications_triggered",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["case", "channel"]),
            models.Index(fields=["status", "next_retry_at"]),
        ]

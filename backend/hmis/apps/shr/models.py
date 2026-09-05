# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Persistent DHA Shared Health Record consent visits.

Each row represents one DHA SHR visit and keeps its bearer token encrypted at
rest. Tokens are used only by backend services and are never serialized.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.pii import encrypted_pii_property


class SHRConsentVisit(FacilityScopedModel):
    """A DHA consent lifecycle that authorizes Shared Health Record access."""

    class VisitType(models.TextChoices):
        OP = "OP", "Outpatient"
        IP = "IP", "Inpatient"

    class RequestKind(models.TextChoices):
        STANDARD = "STANDARD", "Standard"
        EMERGENCY = "EMERGENCY", "Emergency"
        DEPENDANT = "DEPENDANT", "Dependant or representative"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CLOSURE_PENDING = "CLOSURE_PENDING", "Closure pending OTP"
        CLOSED = "CLOSED", "Closed"
        FAILED = "FAILED", "Failed"

    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="shr_consent_visits"
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shr_consent_visits",
    )
    consent_id = models.CharField(max_length=100, blank=True, default="", db_index=True)
    visit_id = models.CharField(max_length=100, blank=True, default="", db_index=True)
    visit_type = models.CharField(max_length=2, choices=VisitType.choices)
    request_kind = models.CharField(max_length=12, choices=RequestKind.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    otp_record = models.CharField(max_length=100, blank=True, default="")
    consent_token_encrypted = models.TextField(blank=True, default="")
    consent_token = encrypted_pii_property("consent_token")
    requested_by = models.CharField(max_length=200)
    practitioner_id = models.CharField(max_length=100, blank=True, default="")
    representative_cr_id = models.CharField(max_length=100, blank=True, default="")
    representative_relationship = models.CharField(max_length=50, blank=True, default="")
    patient_capable = models.BooleanField(default=True)
    emergency = models.BooleanField(default=False)
    incapacity_reason = models.TextField(blank=True, default="")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="shr_consent_visits_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "consent_id"],
                condition=~models.Q(consent_id=""),
                name="unique_shr_consent_per_facility",
            ),
            models.UniqueConstraint(
                fields=["facility", "visit_id"],
                condition=~models.Q(visit_id=""),
                name="unique_shr_visit_per_facility",
            ),
        ]
        indexes = [
            models.Index(fields=["patient", "facility", "status"]),
            models.Index(fields=["facility", "status", "created_at"]),
        ]

    def approve(self, *, consent_id: str, visit_id: str, consent_token: str) -> None:
        """Persist an approved DHA visit and its server-only bearer token."""
        self.consent_id = consent_id or self.consent_id
        self.visit_id = visit_id or self.visit_id
        self.consent_token = consent_token
        self.status = self.Status.APPROVED
        self.approved_at = timezone.now()
        self.save()

    def reject(self) -> None:
        """Persist a patient refusal returned by DHA."""
        self.status = self.Status.REJECTED
        self.save(update_fields=["status", "updated_at"])

    def set_pending_otp(self, otp_record: str) -> None:
        """Replace the OTP reference after DHA sends or resends an OTP."""
        self.otp_record = otp_record
        self.status = self.Status.PENDING
        self.save(update_fields=["otp_record", "status", "updated_at"])

    def begin_closure(self, otp_record: str) -> None:
        """Record DHA's OTP-gated visit closure request."""
        self.otp_record = otp_record
        self.status = self.Status.CLOSURE_PENDING
        self.save(update_fields=["otp_record", "status", "updated_at"])

    def close(self, end_date) -> None:
        """Mark the visit closed and discard the no-longer-valid bearer token."""
        self.status = self.Status.CLOSED
        self.end_date = end_date
        self.closed_at = timezone.now()
        self.consent_token = ""
        self.save()

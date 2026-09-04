# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Standalone LIS models.

Provides walk-in patient registration and standalone lab order capabilities
for facilities operating the LIS independently of the full HMIS.
"""

import uuid

from django.contrib.auth import get_user_model
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

User = get_user_model()


class WalkInPatient(FacilityScopedModel, TimeStampedModel):
    """
    Lightweight patient record for standalone LIS walk-in registrations.

    Used when the full HMIS patient module is not needed or when patients
    present directly to the lab without a clinical encounter.
    """

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    # Identity
    registration_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Auto-generated: WLKN-YYYYMMDD-XXXX",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True)

    # Contact (encrypted at rest — Kenya DPA 2019 § 41)
    phone_number_encrypted = models.TextField(default="", blank=True)
    phone_number_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    phone_number = encrypted_pii_property("phone_number")
    email_encrypted = models.TextField(default="", blank=True)
    email = encrypted_pii_property("email")

    # Identification (encrypted at rest)
    national_id_encrypted = models.TextField(default="", blank=True)
    national_id_hmac = models.CharField(max_length=64, default="", blank=True, db_index=True)
    national_id = encrypted_pii_property("national_id")
    id_type = models.CharField(
        max_length=20,
        blank=True,
        choices=[
            ("NATIONAL_ID", "National ID"),
            ("PASSPORT", "Passport"),
            ("BIRTH_CERT", "Birth Certificate"),
            ("MILITARY_ID", "Military ID"),
            ("OTHER", "Other"),
        ],
    )

    # Source
    referring_facility = models.CharField(
        max_length=200, blank=True, help_text="External facility that referred this patient"
    )
    referring_clinician = models.CharField(
        max_length=200, blank=True, help_text="Name of referring clinician"
    )

    # Link to full HMIS patient (if later registered)
    linked_patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="walkin_registrations",
        help_text="Links to full HMIS patient record if later registered",
    )

    # Registered by
    registered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    class Meta:
        verbose_name = "Walk-in Patient"
        verbose_name_plural = "Walk-in Patients"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["registration_number"]),
            models.Index(fields=["national_id_hmac"]),
            models.Index(fields=["last_name", "first_name"]),
            models.Index(fields=["phone_number_hmac"]),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.registration_number})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def promote_to_patient(self, user, county_id=None, sub_county_id=None, ward_id=None, **extra):
        """
        Promote this walk-in record to a full HMIS ``Patient``.

        Idempotent: if ``linked_patient`` is already set, returns the
        existing patient without creating a duplicate.

        Args:
            user: The acting user (set as ``registered_by`` on the new
                Patient and used for audit purposes).
            county_id, sub_county_id, ward_id: Kenya location FKs (county
            and sub_county are optional on Patient but recommended).
            **extra: Additional Patient field overrides (e.g. ``date_of_birth``,
            ``identification_type``, ``email``, ``phone_number``).

        Returns:
            The linked ``Patient`` instance.
        """
        if self.linked_patient_id:
            return self.linked_patient

        from hmis.apps.patients.models import Patient

        # Map id_type → Patient.identification_type choices (lowercase enum).
        id_type_map = {
            "NATIONAL_ID": "national_id",
            "PASSPORT": "passport",
            "BIRTH_CERT": "birth_certificate",
            "MILITARY_ID": "military_id",
            "OTHER": "other",
        }
        identification_type = extra.pop(
            "identification_type",
            id_type_map.get(self.id_type, "national_id"),
        )

        patient_kwargs = {
            "first_name": self.first_name,
            "last_name": self.last_name,
            "date_of_birth": self.date_of_birth,
            "gender": self.gender or "O",
            "identification_type": identification_type,
            "registered_by": user,
            "organization": self.organization,
            "facility": self.facility,
        }
        if county_id:
            patient_kwargs["county_id"] = county_id
        if sub_county_id:
            patient_kwargs["sub_county_id"] = sub_county_id
        if ward_id:
            patient_kwargs["ward_id"] = ward_id
        patient_kwargs.update(extra)

        patient = Patient.objects.create(**patient_kwargs)

        # Copy encrypted PII via descriptor (transparent encrypt-on-write).
        if self.national_id:
            patient.identification_number = self.national_id
        if self.phone_number:
            patient.phone_number = self.phone_number
        if self.email:
            patient.email = self.email
        patient.save()

        self.linked_patient = patient
        self.save(update_fields=["linked_patient", "updated_at"])
        return patient

    def save(self, *args, **kwargs):
        if not self.registration_number:
            self.registration_number = self._generate_registration_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_registration_number():
        from datetime import datetime

        today = datetime.now().strftime("%Y%m%d")
        prefix = f"WLKN-{today}-"
        last = (
            WalkInPatient.objects.filter(registration_number__startswith=prefix)
            .order_by("-registration_number")
            .values_list("registration_number", flat=True)
            .first()
        )
        seq = int(last.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"


class ExternalOrderRequest(FacilityScopedModel, TimeStampedModel):
    """
    Tracks inbound HL7 ORM^O01 orders from external systems.

    When an external system sends an ORM message, this model stores the
    request metadata and links to the created LabOrder (if auto-created).
    """

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"

    # HL7 message tracking
    trace_id = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    idempotency_key = models.CharField(max_length=120, blank=True, db_index=True)
    message_control_id = models.CharField(max_length=100, db_index=True)
    sending_application = models.CharField(max_length=100)
    sending_facility = models.CharField(max_length=100)

    # Patient from external system
    external_patient_id = models.CharField(max_length=100, blank=True)
    patient_name = models.CharField(max_length=200)
    patient_dob = models.DateField(null=True, blank=True)
    patient_gender = models.CharField(max_length=1, blank=True)
    patient_id_number = models.CharField(max_length=50, blank=True)

    # Order details
    placer_order_number = models.CharField(
        max_length=100, db_index=True, help_text="Order number from sending system"
    )
    order_priority = models.CharField(max_length=20, default="ROUTINE")
    clinical_info = models.TextField(blank=True)
    requested_tests = models.JSONField(default=list, help_text="List of test codes/names requested")

    # Processing
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    rejection_reason = models.TextField(blank=True)
    raw_message = models.TextField(help_text="Raw HL7 message content")

    # Linked records (created during processing)
    walkin_patient = models.ForeignKey(
        WalkInPatient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_orders",
    )
    lab_order = models.ForeignKey(
        "laboratory.LabOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_requests",
    )

    # Processing user
    processed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "External Order Request"
        verbose_name_plural = "External Order Requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["trace_id"]),
            models.Index(fields=["idempotency_key"]),
            models.Index(fields=["message_control_id"]),
            models.Index(fields=["placer_order_number"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.placer_order_number} from {self.sending_facility} ({self.status})"

    def accept(self, user):
        """Accept and process the external order request."""
        from django.utils import timezone

        self.status = self.Status.ACCEPTED
        self.processed_by = user
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_by", "processed_at", "updated_at"])

    def reject(self, user, reason: str):
        """Reject the external order request."""
        from django.utils import timezone

        self.status = self.Status.REJECTED
        self.rejection_reason = reason
        self.processed_by = user
        self.processed_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "rejection_reason",
                "processed_by",
                "processed_at",
                "updated_at",
            ]
        )


class ExternalPatientIdentifierCrosswalk(FacilityScopedModel, TimeStampedModel):
    """Maps external patient identifiers to local walk-in/HMIS patient records."""

    source_system = models.CharField(max_length=100, db_index=True)
    external_patient_id = models.CharField(max_length=100, db_index=True)
    external_member_id = models.CharField(max_length=100, blank=True)
    patient_name_snapshot = models.CharField(max_length=200, blank=True)

    walkin_patient = models.ForeignKey(
        WalkInPatient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="identifier_crosswalks",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lab_identifier_crosswalks",
    )

    class Meta:
        verbose_name = "External Patient Identifier Crosswalk"
        verbose_name_plural = "External Patient Identifier Crosswalks"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["facility", "source_system", "external_patient_id"],
                name="uniq_lab_xwalk_facility_source_external_patient",
            )
        ]
        indexes = [
            models.Index(fields=["source_system", "external_patient_id"]),
            models.Index(fields=["external_member_id"]),
        ]

    def __str__(self):
        return f"{self.source_system}:{self.external_patient_id}"


class InboundIngestionEvent(FacilityScopedModel, TimeStampedModel):
    """Tracks standalone LIS inbound ingestion lifecycle and replay diagnostics."""

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        MAPPED = "MAPPED", "Mapped"
        FAILED = "FAILED", "Failed"
        REPLAYED = "REPLAYED", "Replayed"

    trace_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    source_system = models.CharField(max_length=100, default="EXTERNAL", db_index=True)
    channel = models.CharField(max_length=20, default="API")
    idempotency_key = models.CharField(max_length=120, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    raw_payload = models.TextField()
    error_message = models.TextField(blank=True)
    replay_count = models.PositiveIntegerField(default=0)
    last_replayed_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    external_order = models.ForeignKey(
        ExternalOrderRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ingestion_events",
    )

    class Meta:
        verbose_name = "Inbound Ingestion Event"
        verbose_name_plural = "Inbound Ingestion Events"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["idempotency_key"]),
            models.Index(fields=["source_system"]),
            models.Index(fields=["trace_id"]),
        ]

    def __str__(self):
        return f"{self.trace_id} ({self.status})"


class ResultDeliveryLog(FacilityScopedModel, TimeStampedModel):
    """Tracks outbound delivery attempts for released standalone LIS results."""

    class Channel(models.TextChoices):
        WEBHOOK = "WEBHOOK", "API Callback/Webhook"
        PDF_PACKAGE = "PDF_PACKAGE", "Downloadable PDF Package"
        HL7_FHIR = "HL7_FHIR", "HL7/FHIR Adapter"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        DELIVERED = "DELIVERED", "Delivered"
        FAILED = "FAILED", "Failed"

    trace_id = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    channel = models.CharField(max_length=20, choices=Channel.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    destination = models.CharField(max_length=500, blank=True)

    external_order = models.ForeignKey(
        ExternalOrderRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="result_deliveries",
    )
    lab_order = models.ForeignKey(
        "laboratory.LabOrder",
        on_delete=models.CASCADE,
        related_name="result_deliveries",
    )
    requested_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    payload = models.JSONField(default=dict, blank=True)
    response_status_code = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    delivered_at = models.DateTimeField(null=True, blank=True)

    pdf_filename = models.CharField(max_length=255, blank=True)
    pdf_package = models.BinaryField(null=True, blank=True)

    class Meta:
        verbose_name = "Result Delivery Log"
        verbose_name_plural = "Result Delivery Logs"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["channel"]),
            models.Index(fields=["trace_id"]),
        ]

    def __str__(self):
        return f"{self.lab_order.order_number} -> {self.channel} ({self.status})"

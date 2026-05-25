"""
Standalone Imaging models.

Provides walk-in patient registration and external referral intake for
facilities operating an imaging/diagnostics centre independently of the
full HMIS.
"""

from django.contrib.auth import get_user_model
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

User = get_user_model()


class WalkInImagingPatient(FacilityScopedModel, TimeStampedModel):
    """
    Lightweight patient record for standalone imaging walk-ins.

    Used when the full HMIS patient module is not needed or when patients
    present directly to the imaging centre with an external referral.
    """

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    registration_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Auto-generated: WLKR-YYYYMMDD-XXXX",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True)

    # Contact (encrypted at rest)
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
        related_name="imaging_walkin_registrations",
        help_text="Links to full HMIS patient record if later registered",
    )

    registered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    class Meta:
        verbose_name = "Walk-in Imaging Patient"
        verbose_name_plural = "Walk-in Imaging Patients"
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

    def save(self, *args, **kwargs):
        if not self.registration_number:
            self.registration_number = self._generate_registration_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_registration_number():
        from datetime import datetime

        today = datetime.now().strftime("%Y%m%d")
        prefix = f"WLKR-{today}-"
        last = (
            WalkInImagingPatient.objects.filter(registration_number__startswith=prefix)
            .order_by("-registration_number")
            .values_list("registration_number", flat=True)
            .first()
        )
        seq = int(last.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"


class ExternalImagingOrderRequest(FacilityScopedModel, TimeStampedModel):
    """
    Tracks inbound external imaging orders (HL7 ORM^O01 for imaging,
    e-referrals, or manually entered referrals from outside clinicians).
    """

    class Status(models.TextChoices):
        RECEIVED = "RECEIVED", "Received"
        ACCEPTED = "ACCEPTED", "Accepted"
        REJECTED = "REJECTED", "Rejected"
        PROCESSING = "PROCESSING", "Processing"
        COMPLETED = "COMPLETED", "Completed"

    # Source tracking
    message_control_id = models.CharField(max_length=100, blank=True, db_index=True)
    sending_application = models.CharField(max_length=100, blank=True)
    sending_facility = models.CharField(max_length=100)
    referring_clinician = models.CharField(max_length=200, blank=True)
    referring_clinician_license = models.CharField(max_length=100, blank=True)

    # Patient (external)
    external_patient_id = models.CharField(max_length=100, blank=True)
    patient_name = models.CharField(max_length=200)
    patient_dob = models.DateField(null=True, blank=True)
    patient_gender = models.CharField(max_length=1, blank=True)
    patient_phone = models.CharField(max_length=20, blank=True)
    patient_id_number = models.CharField(max_length=50, blank=True)

    # Order details
    placer_order_number = models.CharField(
        max_length=100,
        db_index=True,
        help_text="Order/referral number from external system",
    )
    priority = models.CharField(max_length=20, default="ROUTINE")
    clinical_indication = models.TextField(blank=True)
    relevant_clinical_history = models.TextField(blank=True)
    requested_procedures = models.JSONField(
        default=list,
        help_text="List of requested procedures: [{code, name, laterality, modality}]",
    )

    # Processing
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    rejection_reason = models.TextField(blank=True)
    raw_message = models.TextField(blank=True, help_text="Raw HL7/JSON message content")

    # Linked records
    walkin_patient = models.ForeignKey(
        WalkInImagingPatient,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_orders",
    )
    imaging_order = models.ForeignKey(
        "imaging.ImagingOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_requests",
    )

    processed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "External Imaging Order Request"
        verbose_name_plural = "External Imaging Order Requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["message_control_id"]),
            models.Index(fields=["placer_order_number"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.placer_order_number} from {self.sending_facility} ({self.status})"

    def accept(self, user):
        from django.utils import timezone

        self.status = self.Status.ACCEPTED
        self.processed_by = user
        self.processed_at = timezone.now()
        self.save(update_fields=["status", "processed_by", "processed_at", "updated_at"])

    def reject(self, user, reason: str):
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

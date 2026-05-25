"""
Standalone Pharmacy models.

Provides walk-in customer registration and external prescription intake
for facilities operating a pharmacy independently of the full HMIS.
"""

from django.contrib.auth import get_user_model
from django.db import models

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel
from hmis.apps.core.pii import encrypted_pii_property

User = get_user_model()


class WalkInCustomer(FacilityScopedModel, TimeStampedModel):
    """
    Lightweight customer record for standalone pharmacy walk-ins.

    Used when the full HMIS patient module is not needed or when customers
    present directly to the pharmacy with an external prescription.
    """

    class Gender(models.TextChoices):
        MALE = "M", "Male"
        FEMALE = "F", "Female"
        OTHER = "O", "Other"

    registration_number = models.CharField(
        max_length=30,
        unique=True,
        editable=False,
        help_text="Auto-generated: WLKC-YYYYMMDD-XXXX",
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
        max_length=200, blank=True, help_text="External facility that issued the prescription"
    )
    referring_clinician = models.CharField(
        max_length=200, blank=True, help_text="Name of prescribing clinician"
    )

    # Link to full HMIS patient (if later registered)
    linked_patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_walkin_registrations",
        help_text="Links to full HMIS patient record if later registered",
    )

    registered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")

    class Meta:
        verbose_name = "Walk-in Pharmacy Customer"
        verbose_name_plural = "Walk-in Pharmacy Customers"
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
        prefix = f"WLKC-{today}-"
        last = (
            WalkInCustomer.objects.filter(registration_number__startswith=prefix)
            .order_by("-registration_number")
            .values_list("registration_number", flat=True)
            .first()
        )
        seq = int(last.split("-")[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"


class ExternalPrescriptionRequest(FacilityScopedModel, TimeStampedModel):
    """
    Tracks inbound external prescriptions (HL7 RDE^O11 messages, e-prescriptions,
    or manually entered referrals from outside prescribers).

    The request is stored as pending until pharmacy staff accept/reject and
    create a Prescription record.
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
    prescriber_name = models.CharField(max_length=200, blank=True)
    prescriber_license = models.CharField(max_length=100, blank=True)

    # Patient (external)
    external_patient_id = models.CharField(max_length=100, blank=True)
    patient_name = models.CharField(max_length=200)
    patient_dob = models.DateField(null=True, blank=True)
    patient_gender = models.CharField(max_length=1, blank=True)
    patient_phone = models.CharField(max_length=20, blank=True)
    patient_id_number = models.CharField(max_length=50, blank=True)

    # Prescription details
    external_prescription_number = models.CharField(
        max_length=100, db_index=True, help_text="Prescription number from external prescriber"
    )
    priority = models.CharField(max_length=20, default="ROUTINE")
    clinical_info = models.TextField(blank=True)
    requested_items = models.JSONField(
        default=list,
        help_text="List of prescribed items: [{drug_name, drug_code, dose, frequency, duration, quantity}]",
    )

    # Processing
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    rejection_reason = models.TextField(blank=True)
    raw_message = models.TextField(blank=True, help_text="Raw HL7/JSON message content")

    # Linked records (created during processing)
    walkin_customer = models.ForeignKey(
        WalkInCustomer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_prescriptions",
    )
    prescription = models.ForeignKey(
        "pharmacy.Prescription",
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
        verbose_name = "External Prescription Request"
        verbose_name_plural = "External Prescription Requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["message_control_id"]),
            models.Index(fields=["external_prescription_number"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.external_prescription_number} from {self.sending_facility} ({self.status})"

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

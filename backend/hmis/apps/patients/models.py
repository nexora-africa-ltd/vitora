"""
Patient model for Vitora HMIS.

This module defines the Patient model and related functionality.
"""

from datetime import date, datetime

from django.core.exceptions import ValidationError
from django.core.validators import EmailValidator
from django.db import models


def generate_mrn():
    """
    Generate a unique Medical Record Number (MRN).

    Format: MRN-YYYYMMDD-XXXX
    Where XXXX is a 4-digit sequential number for the day.

    Returns:
        str: A unique MRN string
    """
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"MRN-{today}-"

    # Find the highest MRN for today
    latest_patient = Patient.objects.filter(mrn__startswith=prefix).order_by("-mrn").first()

    if latest_patient:
        # Extract the sequence number and increment
        last_sequence = int(latest_patient.mrn.split("-")[-1])
        sequence = last_sequence + 1
    else:
        # First patient of the day
        sequence = 1

    return f"{prefix}{sequence:04d}"


class Patient(models.Model):
    """
    Patient model representing a patient in the system.

    Attributes:
        mrn: Unique Medical Record Number (auto-generated)
        first_name: Patient's first name (required)
        middle_name: Patient's middle name (optional)
        last_name: Patient's last name (required)
        date_of_birth: Patient's date of birth (required)
        gender: Patient's gender (M/F/O)
        phone_number: Patient's phone number (optional)
        email: Patient's email address (optional)
        address: Patient's physical address (optional)
        national_id: Patient's national ID number (optional)
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
    """

    GENDER_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other"),
    ]

    # Required fields
    mrn = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        help_text="Medical Record Number (auto-generated)",
    )
    first_name = models.CharField(max_length=100, help_text="Patient's first name")
    last_name = models.CharField(max_length=100, help_text="Patient's last name")
    date_of_birth = models.DateField(help_text="Patient's date of birth")
    gender = models.CharField(max_length=1, choices=GENDER_CHOICES, help_text="Patient's gender")

    # Optional fields
    middle_name = models.CharField(
        max_length=100, blank=True, default="", help_text="Patient's middle name"
    )
    phone_number = models.CharField(
        max_length=20, blank=True, null=True, help_text="Patient's phone number"
    )
    email = models.EmailField(blank=True, default="", help_text="Patient's email address")
    address = models.TextField(blank=True, default="", help_text="Patient's physical address")
    national_id = models.CharField(
        max_length=50, blank=True, null=True, help_text="Patient's national ID number"
    )

    # Privacy & Consent (Kenya Data Protection Act compliance)
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Marks patient record as sensitive (HIV, GBV, Mental Health)",
    )
    consent_given = models.BooleanField(
        default=False,
        help_text="Whether patient has given consent for data processing",
    )
    consent_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date and time when consent was given",
    )

    # Staff registration tracking
    registered_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="registered_patients",
        help_text="Staff member who registered this patient",
    )

    # Referral source tracking
    REFERRAL_SOURCE_CHOICES = [
        ("self", "Self"),
        ("clinic", "Clinic"),
        ("other_facility", "Other Facility"),
    ]
    referral_source = models.CharField(
        max_length=20,
        choices=REFERRAL_SOURCE_CHOICES,
        default="self",
        help_text="How the patient was referred to this facility",
    )
    referred_from_facility = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Name of facility patient was referred from (if applicable)",
    )

    # Kenya Location Hierarchy
    county = models.ForeignKey(
        "core.County",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="patients",
        help_text="Patient's county of residence",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="patients",
        help_text="Patient's sub-county of residence",
    )
    ward = models.ForeignKey(
        "core.Ward",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="patients",
        help_text="Patient's ward of residence (optional)",
    )
    village = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Patient's village/estate (optional, free text)",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Patient model."""

        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["mrn"]),
            models.Index(fields=["last_name", "first_name"]),
            models.Index(fields=["date_of_birth"]),
            models.Index(fields=["is_sensitive"]),
        ]
        verbose_name = "Patient"
        verbose_name_plural = "Patients"
        permissions = [
            ("view_sensitive_patient", "Can view sensitive patient records"),
        ]

    def __str__(self) -> str:
        """String representation of the patient."""
        return f"{self.mrn} - {self.full_name}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate MRN if not set."""
        if not self.mrn:
            self.mrn = generate_mrn()
        super().save(*args, **kwargs)

    def clean(self):
        """Validate the model fields."""
        super().clean()

        # Validate date of birth is not in the future
        if self.date_of_birth and self.date_of_birth > date.today():
            raise ValidationError({"date_of_birth": "Date of birth cannot be in the future."})

        # Validate email if provided
        if self.email:
            validator = EmailValidator()
            try:
                validator(self.email)
            except ValidationError as e:
                raise ValidationError({"email": e.message}) from e

        # Validate referred_from_facility is provided when referral_source is 'other_facility'
        if self.referral_source == "other_facility" and not self.referred_from_facility:
            raise ValidationError(
                {
                    "referred_from_facility": "Facility name is required when referral source is 'Other Facility'."
                }
            )

        # Validate county and sub_county are provided (mandatory)
        if not self.county_id:
            raise ValidationError({"county": "County is required."})
        if not self.sub_county_id:
            raise ValidationError({"sub_county": "Sub-county is required."})

    @property
    def full_name(self) -> str:
        """
        Get patient's full name.

        Returns:
            str: Patient's full name (first + last)
        """
        if self.middle_name:
            return f"{self.first_name} {self.middle_name} {self.last_name}"
        return f"{self.first_name} {self.last_name}"

    @property
    def age(self) -> int:
        """
        Calculate patient's age in years.

        Returns:
            int: Patient's age in complete years
        """
        today = date.today()
        age = (
            today.year
            - self.date_of_birth.year
            - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
        )
        return age


class EmergencyContact(models.Model):
    """
    Emergency contact for a patient.

    Stores next of kin / emergency contact information for patients.
    A patient can have multiple emergency contacts.

    Attributes:
        patient: The patient this contact belongs to
        full_name: Contact's full name (required)
        relationship: Relationship to patient (required)
        phone_number: Primary phone number (required)
        alternative_phone: Alternative phone number (optional)
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
    """

    RELATIONSHIP_CHOICES = [
        ("spouse", "Spouse"),
        ("parent", "Parent"),
        ("child", "Child"),
        ("sibling", "Sibling"),
        ("friend", "Friend"),
        ("other", "Other"),
    ]

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="emergency_contacts",
        help_text="The patient this emergency contact belongs to",
    )
    full_name = models.CharField(
        max_length=200,
        help_text="Contact's full name",
    )
    relationship = models.CharField(
        max_length=50,
        choices=RELATIONSHIP_CHOICES,
        help_text="Relationship to patient",
    )
    phone_number = models.CharField(
        max_length=20,
        help_text="Primary phone number",
    )
    alternative_phone = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Alternative phone number",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for EmergencyContact model."""

        ordering = ["-created_at"]
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"

    def __str__(self) -> str:
        """String representation of the emergency contact."""
        return f"{self.full_name} ({self.relationship}) - {self.patient.mrn}"

    def clean(self):
        """Validate the model fields."""
        super().clean()

        errors = {}

        if not self.full_name or not self.full_name.strip():
            errors["full_name"] = "Full name is required."

        if not self.relationship or not self.relationship.strip():
            errors["relationship"] = "Relationship is required."

        if not self.phone_number or not self.phone_number.strip():
            errors["phone_number"] = "Phone number is required."

        if errors:
            raise ValidationError(errors)

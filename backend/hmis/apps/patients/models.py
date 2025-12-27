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
        max_length=20, blank=True, default="", help_text="Patient's phone number"
    )
    email = models.EmailField(blank=True, default="", help_text="Patient's email address")
    address = models.TextField(blank=True, default="", help_text="Patient's physical address")
    national_id = models.CharField(
        max_length=50, blank=True, default="", help_text="Patient's national ID number"
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
        ]
        verbose_name = "Patient"
        verbose_name_plural = "Patients"

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

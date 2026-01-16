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
        cr_number: Client Registry number (from Kenya HIE)
        first_name: Patient's first name (required)
        middle_name: Patient's middle name (optional)
        last_name: Patient's last name (required)
        title: Patient's title (Mr, Mrs, Miss, etc.)
        date_of_birth: Patient's date of birth (required)
        place_of_birth: Patient's place of birth (optional)
        gender: Patient's gender (M/F/O)
        identification_type: Type of ID used (national_id, passport, etc.)
        identification_number: ID number value
        phone_number: Patient's phone number (optional)
        email: Patient's email address (optional)
        address: Patient's physical address (optional)
        national_id: Patient's national ID number (deprecated, use identification_number)
        citizenship: Patient's citizenship (default: Kenyan)
        is_person_with_disability: PWD status
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
    """

    GENDER_CHOICES = [
        ("M", "Male"),
        ("F", "Female"),
        ("O", "Other"),
    ]

    TITLE_CHOICES = [
        ("Mr", "Mr"),
        ("Mrs", "Mrs"),
        ("Miss", "Miss"),
        ("Ms", "Ms"),
        ("Dr", "Dr"),
        ("Prof", "Prof"),
        ("Hon", "Hon"),
        ("Rev", "Rev"),
        ("", "None"),
    ]

    # SHA/CR supported identification types
    IDENTIFICATION_TYPE_CHOICES = [
        ("national_id", "National ID"),
        ("cr_number", "HIE Patient ID"),
        ("mandate_number", "Mandate Number"),
        ("alien_id", "Alien ID"),
        ("kra_pin", "KRA PIN"),
        ("temporary_id", "Temporary ID"),
        ("passport", "Passport Number"),
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

    # Client Registry Integration
    cr_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        unique=True,
        help_text="Client Registry number from Kenya HIE (CR-XXXXXXXXXX-X format)",
    )

    # SHA Integration
    sha_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="SHA member number for Social Health Authority coverage",
    )

    # Title and Names
    title = models.CharField(
        max_length=10,
        choices=TITLE_CHOICES,
        blank=True,
        default="",
        help_text="Patient's title (Mr, Mrs, Miss, etc.)",
    )
    middle_name = models.CharField(
        max_length=100, blank=True, default="", help_text="Patient's middle name"
    )
    place_of_birth = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Patient's place of birth",
    )

    # Identification (flexible for multiple ID types)
    identification_type = models.CharField(
        max_length=20,
        choices=IDENTIFICATION_TYPE_CHOICES,
        default="national_id",
        help_text="Type of identification document",
    )
    identification_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="Identification document number",
    )

    # Contact Information
    phone_number = models.CharField(
        max_length=20, blank=True, null=True, help_text="Patient's phone number"
    )
    email = models.EmailField(blank=True, default="", help_text="Patient's email address")
    address = models.TextField(blank=True, default="", help_text="Patient's physical address")

    # Legacy field - kept for backward compatibility, use identification_number instead
    national_id = models.CharField(
        max_length=50, blank=True, null=True, help_text="Patient's national ID number (legacy)"
    )

    # Demographics
    citizenship = models.CharField(
        max_length=100,
        default="Kenyan",
        help_text="Patient's citizenship",
    )
    is_person_with_disability = models.BooleanField(
        default=False,
        help_text="Whether the patient has a disability (1=Yes, 0=No)",
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
    # Track if consent was deferred (needs to be obtained before discharge)
    consent_deferred = models.BooleanField(
        default=False,
        help_text="Consent was deferred and must be obtained before discharge",
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
            models.Index(fields=["cr_number"]),
            models.Index(fields=["last_name", "first_name"]),
            models.Index(fields=["date_of_birth"]),
            models.Index(fields=["is_sensitive"]),
            models.Index(fields=["identification_type", "identification_number"]),
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
            str: Patient's full name (first + middle + last)
        """
        parts = []
        if self.title:
            parts.append(self.title)
        parts.append(self.first_name)
        if self.middle_name:
            parts.append(self.middle_name)
        parts.append(self.last_name)
        return " ".join(parts)

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

    # Age category thresholds in days
    AGE_CATEGORY_THRESHOLDS = {
        "newborn": (0, 28),  # 0-28 days
        "infant": (29, 365),  # 1-12 months
        "toddler": (366, 1095),  # 1-3 years
        "preschool": (1096, 2190),  # 3-6 years
        "school_age": (2191, 4380),  # 6-12 years
        "adolescent": (4381, 6570),  # 12-18 years
    }

    VALID_AGE_CATEGORIES = [
        "newborn",
        "infant",
        "toddler",
        "preschool",
        "school_age",
        "adolescent",
        "adult",
    ]

    def get_age_in_days(self) -> int:
        """
        Calculate patient's age in days.

        Returns:
            int: Patient's age in days
        """
        if not self.date_of_birth:
            return 0
        today = date.today()
        delta = today - self.date_of_birth
        return delta.days

    def get_age_category(self) -> str:
        """
        Get patient's age category for clinical decision support.

        Categories:
        - newborn: 0-28 days
        - infant: 1-12 months
        - toddler: 1-3 years
        - preschool: 3-6 years
        - school_age: 6-12 years
        - adolescent: 12-18 years
        - adult: 18+ years

        Returns:
            str: Age category (newborn/infant/toddler/preschool/school_age/adolescent/adult)
        """
        age_days = self.get_age_in_days()

        for category, (min_days, max_days) in self.AGE_CATEGORY_THRESHOLDS.items():
            if min_days <= age_days <= max_days:
                return category

        # If over 18 years (6570 days), return adult
        return "adult"

    def get_age_category_display(self) -> str:
        """
        Get human-readable age category display name.

        Returns:
            str: Capitalized age category name
        """
        category = self.get_age_category()
        display_names = {
            "newborn": "Newborn",
            "infant": "Infant",
            "toddler": "Toddler",
            "preschool": "Preschool",
            "school_age": "School Age",
            "adolescent": "Adolescent",
            "adult": "Adult",
        }
        return display_names.get(category, category.replace("_", " ").title())


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

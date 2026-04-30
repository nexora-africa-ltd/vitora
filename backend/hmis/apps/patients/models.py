"""
Patient model for Vitora HMIS.

This module defines the Patient model and related functionality.
"""

from datetime import date, datetime

from django.core.exceptions import ValidationError
from django.core.validators import EmailValidator
from django.db import models
from simple_history.models import HistoricalRecords

from hmis.apps.core.history import HistoryMixin


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


class Patient(HistoryMixin, models.Model):
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
        history: Version history tracked by django-simple-history
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
        ("birth_certificate", "Birth Certificate"),
    ]

    # Required fields
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="patients",
        null=True,
        blank=True,
        help_text="Owning organization (tenant). Patient is visible across all org facilities.",
    )
    registered_at_facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.SET_NULL,
        related_name="registered_patients",
        null=True,
        blank=True,
        help_text="Facility where the patient was first registered.",
    )
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
    cr_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When patient was last synced with the Client Registry",
    )

    # SHA Integration
    sha_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="SHA member number for Social Health Authority coverage",
    )
    household_number = models.CharField(
        max_length=50,
        blank=True,
        null=True,
        help_text="SHA household number used to group related members and dependants",
    )
    principal_national_id = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Principal member's national ID (for dependants). Used for eligibility checks since DHA resolves coverage via principal.",
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

    # Deceased status (denormalized from DeathRecord for query efficiency)
    is_deceased = models.BooleanField(
        default=False,
        help_text="Whether the patient is deceased (auto-set from DeathRecord)",
    )
    date_of_death = models.DateField(
        null=True,
        blank=True,
        help_text="Date of death (auto-set from DeathRecord)",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Version history tracking (DHA Audit Trail Enhancement)
    history = HistoricalRecords(
        table_name="patients_patient_history",
        excluded_fields=["updated_at"],  # Auto-updated field not useful in history
    )

    class Meta:
        """Meta options for Patient model."""

        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["mrn"]),
            models.Index(fields=["cr_number"]),
            models.Index(fields=["household_number"]),
            models.Index(fields=["last_name", "first_name"]),
            models.Index(fields=["date_of_birth"]),
            models.Index(fields=["is_sensitive"]),
            models.Index(fields=["is_deceased"]),
            models.Index(fields=["identification_type", "identification_number"]),
        ]
        verbose_name = "Patient"
        verbose_name_plural = "Patients"
        permissions = [
            ("view_sensitive_patient", "Can view sensitive patient records"),
        ]
        constraints = [
            # Prevent duplicate patients with same identification
            # (Only applies when identification_number is not null and not empty)
            models.UniqueConstraint(
                fields=["identification_type", "identification_number"],
                condition=models.Q(identification_number__isnull=False)
                & ~models.Q(identification_number=""),
                name="unique_patient_identification",
            ),
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


class DeathRecord(models.Model):
    """
    Detailed death record for a patient (Last Office / morgue management).

    Source of truth for deceased status. When created, auto-sets
    Patient.is_deceased=True and Patient.date_of_death.

    Compliant with:
    - Kenya Civil Registration and Vital Statistics (CRVS) requirements
    - WHO International Form of Medical Certificate of Cause of Death
    - D1 Notification of Death form fields
    """

    MANNER_OF_DEATH_CHOICES = [
        ("NATURAL", "Natural"),
        ("ACCIDENT", "Accident"),
        ("SUICIDE", "Suicide"),
        ("HOMICIDE", "Homicide"),
        ("UNDETERMINED", "Undetermined"),
        ("PENDING_INVESTIGATION", "Pending Investigation"),
    ]

    PLACE_OF_DEATH_CHOICES = [
        ("INPATIENT", "Inpatient Ward"),
        ("EMERGENCY", "Emergency Department"),
        ("THEATRE", "Operating Theatre"),
        ("ICU", "Intensive Care Unit"),
        ("BROUGHT_IN_DEAD", "Brought in Dead (BID)"),
        ("OTHER", "Other"),
    ]

    NOTIFICATION_SOURCE_CHOICES = [
        ("INPATIENT_DISCHARGE", "Inpatient Discharge"),
        ("EMERGENCY", "Emergency Department"),
        ("MANUAL_ENTRY", "Manual Entry"),
        ("CLIENT_REGISTRY", "Client Registry Sync"),
    ]

    STATUS_CHOICES = [
        ("PENDING_CERTIFICATION", "Pending Certification"),
        ("CERTIFIED", "Certified"),
        ("REPORTED_TO_CIVIL_REGISTRY", "Reported to Civil Registry"),
        ("RELEASED_TO_FAMILY", "Released to Family"),
        ("VOIDED", "Voided (Entered in Error)"),
    ]

    BODY_STATUS_CHOICES = [
        ("IN_MORGUE", "In Morgue"),
        ("RELEASED", "Released to Family"),
        ("TRANSFERRED", "Transferred to Another Facility"),
        ("PENDING_COLLECTION", "Pending Collection"),
    ]

    # ── Core ───────────────────────────────────────────────
    patient = models.OneToOneField(
        Patient,
        on_delete=models.PROTECT,
        related_name="death_record",
        help_text="The deceased patient",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="PENDING_CERTIFICATION",
        help_text="Current status of this death record",
    )

    # ── Death Details ──────────────────────────────────────
    date_of_death = models.DateField(
        help_text="Date of death",
    )
    time_of_death = models.TimeField(
        null=True,
        blank=True,
        help_text="Time of death (if known)",
    )
    manner_of_death = models.CharField(
        max_length=25,
        choices=MANNER_OF_DEATH_CHOICES,
        default="NATURAL",
        help_text="Manner of death",
    )
    place_of_death = models.CharField(
        max_length=20,
        choices=PLACE_OF_DEATH_CHOICES,
        default="INPATIENT",
        help_text="Where the death occurred",
    )
    place_of_death_detail = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Ward name, room number, or other detail",
    )
    notification_source = models.CharField(
        max_length=20,
        choices=NOTIFICATION_SOURCE_CHOICES,
        default="MANUAL_ENTRY",
        help_text="How this death record was initiated",
    )

    # ── Cause of Death (WHO Certificate of Cause of Death) ─
    primary_cause = models.TextField(
        help_text="Immediate cause of death (Line a)",
    )
    primary_cause_icd10 = models.ForeignKey(
        "encounters.ICD10Code",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records_primary",
        help_text="ICD-10 code for primary cause of death",
    )
    antecedent_cause = models.TextField(
        blank=True,
        default="",
        help_text="Due to / antecedent cause (Line b)",
    )
    antecedent_cause_icd10 = models.ForeignKey(
        "encounters.ICD10Code",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records_antecedent",
        help_text="ICD-10 code for antecedent cause",
    )
    underlying_cause = models.TextField(
        blank=True,
        default="",
        help_text="Underlying cause of death (Line c)",
    )
    underlying_cause_icd10 = models.ForeignKey(
        "encounters.ICD10Code",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records_underlying",
        help_text="ICD-10 code for underlying cause",
    )
    contributing_conditions = models.TextField(
        blank=True,
        default="",
        help_text="Other significant conditions contributing to death (Part II)",
    )

    # ── Certification ──────────────────────────────────────
    certified_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="death_certifications",
        help_text="Clinician who certified the death",
    )
    certified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the death was certified",
    )
    death_certificate_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Death certificate number (civil registry)",
    )

    # ── Last Office / Morgue Details ──────────────────────
    body_status = models.CharField(
        max_length=20,
        choices=BODY_STATUS_CHOICES,
        default="IN_MORGUE",
        help_text="Current status of the body",
    )
    morgue_admission_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the body was admitted to the morgue",
    )
    morgue_compartment = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Morgue compartment/refrigerator number",
    )
    released_to = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Name of person the body was released to",
    )
    released_to_id_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="ID number of person collecting the body",
    )
    released_to_relationship = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Relationship of collector to deceased",
    )
    release_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the body was released",
    )
    burial_permit_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Burial permit number",
    )

    # ── Linked Records ─────────────────────────────────────
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records",
        help_text="Linked inpatient admission (if died while admitted)",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records",
        help_text="Linked encounter (if died during visit)",
    )

    # ── Audit ──────────────────────────────────────────────
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="death_records_recorded",
        help_text="Staff who recorded this death",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes",
    )
    voided_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="death_records_voided",
        help_text="Staff who voided this record (if entered in error)",
    )
    voided_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the record was voided",
    )
    void_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for voiding the record",
    )

    # ── Timestamps ─────────────────────────────────────────
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_of_death"]
        verbose_name = "Death Record"
        verbose_name_plural = "Death Records"
        permissions = [
            ("certify_death", "Can certify a death"),
            ("release_body", "Can release a body from morgue"),
            ("void_death_record", "Can void a death record"),
        ]

    def __str__(self):
        return f"Death Record: {self.patient.mrn} - {self.date_of_death}"

    def save(self, *args, **kwargs):
        """Auto-propagate deceased status to Patient on create."""
        is_new = self._state.adding
        super().save(*args, **kwargs)

        if is_new and self.status != "VOIDED":
            # Mark patient as deceased
            Patient.objects.filter(pk=self.patient_id).update(
                is_deceased=True,
                date_of_death=self.date_of_death,
            )

    def clean(self):
        """Validate death record fields."""
        from django.core.exceptions import ValidationError

        super().clean()

        if self.date_of_death and self.patient_id:
            if self.date_of_death > date.today():
                raise ValidationError({"date_of_death": "Date of death cannot be in the future."})
            if self.patient.date_of_birth and self.date_of_death < self.patient.date_of_birth:
                raise ValidationError(
                    {"date_of_death": "Date of death cannot be before date of birth."}
                )

    # ── State Transition Methods ──────────────────────────

    def certify(self, user, certificate_number=""):
        """Certify this death record."""
        from django.utils import timezone

        self.status = "CERTIFIED"
        self.certified_by = user
        self.certified_at = timezone.now()
        if certificate_number:
            self.death_certificate_number = certificate_number
        self.save(
            update_fields=[
                "status",
                "certified_by",
                "certified_at",
                "death_certificate_number",
                "updated_at",
            ]
        )

    def report_to_civil_registry(self):
        """Mark as reported to civil registry."""
        self.status = "REPORTED_TO_CIVIL_REGISTRY"
        self.save(update_fields=["status", "updated_at"])

    def release_body(self, released_to, id_number="", relationship="", burial_permit=""):
        """Release body to family."""
        from django.utils import timezone

        self.body_status = "RELEASED"
        self.status = "RELEASED_TO_FAMILY"
        self.released_to = released_to
        self.released_to_id_number = id_number
        self.released_to_relationship = relationship
        self.release_date = timezone.now()
        if burial_permit:
            self.burial_permit_number = burial_permit
        self.save(
            update_fields=[
                "body_status",
                "status",
                "released_to",
                "released_to_id_number",
                "released_to_relationship",
                "release_date",
                "burial_permit_number",
                "updated_at",
            ]
        )

    def void(self, user, reason):
        """Void this death record (entered in error). Reverses Patient.is_deceased."""
        from django.utils import timezone

        self.status = "VOIDED"
        self.voided_by = user
        self.voided_at = timezone.now()
        self.void_reason = reason
        self.save(update_fields=["status", "voided_by", "voided_at", "void_reason", "updated_at"])
        # Reverse patient deceased status
        Patient.objects.filter(pk=self.patient_id).update(
            is_deceased=False,
            date_of_death=None,
        )

    @property
    def is_voided(self):
        return self.status == "VOIDED"

    @property
    def is_certified(self):
        return self.status in ("CERTIFIED", "REPORTED_TO_CIVIL_REGISTRY", "RELEASED_TO_FAMILY")

    @property
    def is_released(self):
        return self.body_status == "RELEASED"


class Allergy(models.Model):
    """
    Structured allergy record for a patient.

    Stores medication, food, and environmental allergies with structured
    data for clinical decision support and drug-allergy interaction checking.

    Compliant with:
    - DHA Digital Health Standards (structured allergy data)
    - FHIR R4 AllergyIntolerance resource mapping

    Attributes:
        patient: The patient this allergy belongs to
        substance: The allergen (drug name, food item, or environmental trigger)
        substance_type: Category of allergen (medication, food, environmental)
        reaction_type: Type of allergic reaction
        severity: Severity of the reaction (mild, moderate, severe)
        onset_date: When the allergy was first identified
        status: Current status of the allergy (active, inactive, resolved)
        verification_status: Whether the allergy is confirmed or suspected
        notes: Additional clinical notes
        recorded_by: Staff who recorded this allergy
        source_encounter: Encounter during which allergy was recorded (optional)
        created_at: Timestamp when the record was created
        updated_at: Timestamp when the record was last updated
    """

    SUBSTANCE_TYPE_CHOICES = [
        ("medication", "Medication"),
        ("food", "Food"),
        ("environmental", "Environmental"),
        ("biological", "Biological"),
        ("other", "Other"),
    ]

    REACTION_TYPE_CHOICES = [
        ("anaphylaxis", "Anaphylaxis"),
        ("angioedema", "Angioedema"),
        ("bronchospasm", "Bronchospasm"),
        ("cardiac_arrhythmia", "Cardiac Arrhythmia"),
        ("diarrhea", "Diarrhea"),
        ("dyspnea", "Dyspnea"),
        ("hives", "Hives/Urticaria"),
        ("hypotension", "Hypotension"),
        ("itching", "Itching/Pruritus"),
        ("nausea", "Nausea"),
        ("rash", "Rash"),
        ("swelling", "Swelling"),
        ("vomiting", "Vomiting"),
        ("other", "Other"),
    ]

    SEVERITY_CHOICES = [
        ("mild", "Mild"),
        ("moderate", "Moderate"),
        ("severe", "Severe"),
        ("life_threatening", "Life-Threatening"),
    ]

    STATUS_CHOICES = [
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("resolved", "Resolved"),
    ]

    VERIFICATION_STATUS_CHOICES = [
        ("unconfirmed", "Unconfirmed"),
        ("presumed", "Presumed"),
        ("confirmed", "Confirmed"),
        ("refuted", "Refuted"),
        ("entered_in_error", "Entered in Error"),
    ]

    CRITICALITY_CHOICES = [
        ("low", "Low Risk"),
        ("high", "High Risk"),
        ("unable_to_assess", "Unable to Assess"),
    ]

    # Core fields
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="allergies",
        null=True,
        blank=True,
        help_text="Owning organization. Allergies are shared across org facilities.",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="allergies",
        help_text="The patient this allergy belongs to",
    )

    # Substance information - supports both free text and structured lookup
    substance = models.CharField(
        max_length=500,
        help_text="Name of the allergen (medication, food, or environmental trigger)",
    )
    substance_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Standard code for the substance (RxNorm, SNOMED CT, or local drug code)",
    )
    substance_code_system = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Code system URI (e.g., http://www.nlm.nih.gov/research/umls/rxnorm)",
    )
    substance_type = models.CharField(
        max_length=20,
        choices=SUBSTANCE_TYPE_CHOICES,
        default="medication",
        help_text="Category of allergen",
    )

    # Link to Drug model for medication allergies (enables drug-allergy checking)
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patient_allergies",
        help_text="Linked drug record for medication allergies (enables interaction checking)",
    )

    # Reaction details
    reaction_type = models.CharField(
        max_length=30,
        choices=REACTION_TYPE_CHOICES,
        default="other",
        help_text="Type of allergic reaction",
    )
    reaction_description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed description of the reaction",
    )
    severity = models.CharField(
        max_length=20,
        choices=SEVERITY_CHOICES,
        default="moderate",
        help_text="Severity of the allergic reaction",
    )
    criticality = models.CharField(
        max_length=20,
        choices=CRITICALITY_CHOICES,
        default="unable_to_assess",
        help_text="Estimate of potential clinical harm (FHIR criticality)",
    )

    # Dates
    onset_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date when the allergy was first identified",
    )
    last_occurrence = models.DateField(
        null=True,
        blank=True,
        help_text="Date of most recent known occurrence",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="active",
        help_text="Current status of the allergy",
    )
    verification_status = models.CharField(
        max_length=20,
        choices=VERIFICATION_STATUS_CHOICES,
        default="unconfirmed",
        help_text="Whether the allergy is confirmed or suspected",
    )

    # Clinical notes
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinical notes about the allergy",
    )

    # Source tracking
    source_encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_allergies",
        help_text="Encounter during which this allergy was recorded",
    )
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_allergies",
        help_text="Staff member who recorded this allergy",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        """Meta options for Allergy model."""

        ordering = ["-severity", "-created_at"]
        verbose_name = "Allergy"
        verbose_name_plural = "Allergies"
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["substance"]),
            models.Index(fields=["severity"]),
            models.Index(fields=["substance_type"]),
        ]
        # Prevent duplicate active allergies for the same substance
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "substance"],
                condition=models.Q(status="active"),
                name="unique_active_allergy_per_patient",
            ),
        ]

    def __str__(self) -> str:
        """String representation of the allergy."""
        return f"{self.substance} ({self.get_severity_display()}) - {self.patient.mrn}"

    def clean(self):
        """Validate the model fields."""
        super().clean()

        errors = {}

        if not self.substance or not self.substance.strip():
            errors["substance"] = "Substance is required."

        # Validate onset_date is not in the future
        if self.onset_date and self.onset_date > date.today():
            errors["onset_date"] = "Onset date cannot be in the future."

        # Validate last_occurrence is not in the future
        if self.last_occurrence and self.last_occurrence > date.today():
            errors["last_occurrence"] = "Last occurrence date cannot be in the future."

        # Validate last_occurrence is after onset_date
        if self.onset_date and self.last_occurrence and self.last_occurrence < self.onset_date:
            errors["last_occurrence"] = "Last occurrence cannot be before onset date."

        if errors:
            raise ValidationError(errors)

    @property
    def is_high_risk(self) -> bool:
        """Check if this allergy is high risk (severe or life-threatening)."""
        return self.severity in ("severe", "life_threatening") or self.criticality == "high"

    @property
    def is_active(self) -> bool:
        """Check if this allergy is currently active."""
        return self.status == "active"

    @classmethod
    def get_active_allergies_for_patient(cls, patient_id: int) -> models.QuerySet:
        """
        Get all active allergies for a patient.

        Args:
            patient_id: The patient's ID

        Returns:
            QuerySet of active Allergy objects
        """
        return cls.objects.filter(patient_id=patient_id, status="active")

    @classmethod
    def check_drug_allergy(cls, patient_id: int, drug_id: int) -> list["Allergy"]:
        """
        Check if a patient has an allergy to a specific drug.

        Args:
            patient_id: The patient's ID
            drug_id: The drug's ID

        Returns:
            List of matching Allergy objects (empty if no allergy)
        """
        return list(
            cls.objects.filter(
                patient_id=patient_id,
                drug_id=drug_id,
                status="active",
            )
        )

    @classmethod
    def check_drug_name_allergy(cls, patient_id: int, drug_name: str) -> list["Allergy"]:
        """
        Check if a patient has an allergy to a drug by name (case-insensitive).

        This is useful for checking allergies when only the drug name is known,
        or when checking against generic names.

        Args:
            patient_id: The patient's ID
            drug_name: The drug's generic or brand name

        Returns:
            List of matching Allergy objects (empty if no allergy)
        """
        return list(
            cls.objects.filter(
                patient_id=patient_id,
                status="active",
                substance_type="medication",
                substance__icontains=drug_name,
            )
        )


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

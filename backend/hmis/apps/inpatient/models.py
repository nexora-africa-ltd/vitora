"""
Inpatient models for Vitora HMIS.

Sprint 1.5-1.6 Track D: Inpatient Foundation

This module implements the core IPD models including:
- Ward: Hospital wards for inpatient care
- Bed: Individual beds within wards
- AdmissionRecommendation: OPD → IPD admission recommendations
- Admission: Inpatient admission records
- WardRound: Daily ward round documentation
- NursingKardex: Nursing care coordination
- ShiftHandover: Ward shift handovers
- Transfer: Patient transfers between wards
- Discharge: Patient discharge records
"""

from datetime import timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel

User = get_user_model()


class Ward(TimeStampedModel):
    """
    Hospital ward for inpatient care.

    Represents a physical ward within the hospital with bed capacity
    and daily charging rates.

    Attributes:
        name: Unique ward name (e.g., "Medical Ward 1")
        code: Unique ward code (e.g., "MED-01")
        ward_type: Type of ward (MEDICAL, SURGICAL, etc.)
        floor: Floor location (optional)
        capacity: Total bed count
        description: Ward description (optional)
        is_active: Whether ward is currently active
        daily_rate: Bed charge per day
    """

    WARD_TYPE_CHOICES = [
        ("MEDICAL", "Medical Ward"),
        ("SURGICAL", "Surgical Ward"),
        ("PEDIATRIC", "Pediatric Ward"),
        ("MATERNITY", "Maternity Ward"),
        ("ICU", "Intensive Care Unit"),
        ("ISOLATION", "Isolation Ward"),
    ]

    name = models.CharField(
        max_length=100,
        unique=True,
        help_text="Unique ward name (e.g., 'Medical Ward 1')",
    )
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Unique ward code (e.g., 'MED-01')",
    )
    ward_type = models.CharField(
        max_length=20,
        choices=WARD_TYPE_CHOICES,
        help_text="Type of ward",
    )
    floor = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Floor location",
    )
    capacity = models.PositiveIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Total bed count (must be positive)",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Ward description",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether ward is currently active",
    )
    daily_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text="Bed charge per day (must be positive)",
    )

    class Meta:
        """Meta options for Ward model."""

        ordering = ["name"]
        verbose_name = "Ward"
        verbose_name_plural = "Wards"

    def __str__(self):
        """Return string representation."""
        return f"{self.name} ({self.code})"

    @property
    def available_beds(self) -> int:
        """
        Count of beds with status AVAILABLE.

        Returns:
            Number of beds in AVAILABLE status
        """
        return self.beds.filter(status="AVAILABLE").count()

    @property
    def occupancy_rate(self) -> float:
        """
        Current occupancy percentage.

        Returns:
            Occupancy rate as percentage (0-100)
        """
        total_beds = self.beds.count()
        if total_beds == 0:
            return 0.0

        occupied_beds = self.beds.filter(status="OCCUPIED").count()
        return round((occupied_beds / total_beds) * 100, 2)


class Bed(TimeStampedModel):
    """
    Individual bed within a ward.

    Represents a single bed that can be assigned to patients.
    Tracks bed status and maintains audit trail of status changes.

    Attributes:
        ward: Parent ward
        bed_number: Bed identifier within ward (e.g., "B-101")
        status: Current bed status (AVAILABLE, OCCUPIED, etc.)
        bed_type: Type of bed (optional)
        notes: Additional notes (e.g., maintenance reason)
        status_changed_at: When status last changed
        status_changed_by: User who changed status
    """

    BED_STATUS_CHOICES = [
        ("AVAILABLE", "Available"),
        ("OCCUPIED", "Occupied"),
        ("MAINTENANCE", "Under Maintenance"),
        ("RESERVED", "Reserved"),
    ]

    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name="beds",
        help_text="Parent ward",
    )
    bed_number = models.CharField(
        max_length=20,
        help_text="Bed identifier (e.g., 'B-101')",
    )
    status = models.CharField(
        max_length=20,
        choices=BED_STATUS_CHOICES,
        default="AVAILABLE",
        help_text="Current bed status",
    )
    bed_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Type of bed (e.g., 'Standard', 'ICU')",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes (maintenance reason, etc.)",
    )
    status_changed_at = models.DateTimeField(
        auto_now=True,
        help_text="When status last changed",
    )
    status_changed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bed_status_changes",
        help_text="User who changed status",
    )

    class Meta:
        """Meta options for Bed model."""

        unique_together = ["ward", "bed_number"]
        ordering = ["ward", "bed_number"]
        verbose_name = "Bed"
        verbose_name_plural = "Beds"

    def __str__(self):
        """Return string representation."""
        return f"{self.ward.code} - {self.bed_number}"

    def mark_occupied(self, user):
        """
        Transition bed to OCCUPIED status.

        Args:
            user: User performing the action

        Raises:
            ValueError: If bed is not available
        """
        if self.status not in ["AVAILABLE", "RESERVED"]:
            raise ValueError(f"Cannot occupy bed with status {self.status}")

        self.status = "OCCUPIED"
        self.status_changed_by = user
        self.save()

    def mark_available(self, user):
        """
        Transition bed to AVAILABLE status.

        Args:
            user: User performing the action
        """
        self.status = "AVAILABLE"
        self.status_changed_by = user
        self.notes = ""
        self.save()

    def mark_maintenance(self, user, reason):
        """
        Transition bed to MAINTENANCE status with reason.

        Args:
            user: User performing the action
            reason: Reason for maintenance
        """
        self.status = "MAINTENANCE"
        self.status_changed_by = user
        self.notes = reason
        self.save()

    def mark_reserved(self, user, duration_hours=24):
        """
        Transition bed to RESERVED status with expiry.

        Args:
            user: User performing the action
            duration_hours: Reservation duration (default 24 hours)
        """
        self.status = "RESERVED"
        self.status_changed_by = user
        self.save()


class AdmissionRecommendation(TimeStampedModel):
    """
    Clinician recommendation for patient admission from OPD.

    Captures the clinician's recommendation to admit a patient from
    OPD to IPD, including clinical reasoning and urgency.

    Attributes:
        encounter: OPD encounter that generated this recommendation
        recommended_by: Clinician making the recommendation
        reason: Clinical reason for admission
        provisional_diagnosis: ICD-10 code for provisional diagnosis
        provisional_diagnosis_text: Text description of diagnosis
        urgency: Urgency level (ROUTINE, URGENT, EMERGENCY)
        preferred_ward_type: Preferred ward type (optional)
        status: Current status (PENDING, ACCEPTED, DECLINED, EXPIRED)
        expires_at: Expiration time (default 24 hours)
        resolved_at: When recommendation was accepted/declined
        resolved_by: User who resolved the recommendation
        decline_reason: Reason if recommendation was declined
    """

    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("ACCEPTED", "Accepted"),
        ("DECLINED", "Declined"),
        ("EXPIRED", "Expired"),
    ]

    URGENCY_CHOICES = [
        ("ROUTINE", "Routine"),
        ("URGENT", "Urgent"),
        ("EMERGENCY", "Emergency"),
    ]

    encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        related_name="admission_recommendation",
        help_text="OPD encounter that generated this recommendation",
    )
    recommended_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="admission_recommendations_made",
        help_text="Clinician making the recommendation",
    )
    reason = models.TextField(
        help_text="Clinical reason for admission",
    )
    provisional_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code for provisional diagnosis",
    )
    provisional_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of diagnosis",
    )
    urgency = models.CharField(
        max_length=20,
        choices=URGENCY_CHOICES,
        default="ROUTINE",
        help_text="Urgency level",
    )
    preferred_ward_type = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Preferred ward type (optional)",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING",
        help_text="Current status",
    )
    expires_at = models.DateTimeField(
        help_text="Expiration time (default 24 hours from creation)",
    )

    # Resolution
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When recommendation was accepted/declined",
    )
    resolved_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="admission_recommendations_resolved",
        help_text="User who resolved the recommendation",
    )
    decline_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason if recommendation was declined",
    )

    class Meta:
        """Meta options for AdmissionRecommendation model."""

        ordering = ["-created_at"]
        verbose_name = "Admission Recommendation"
        verbose_name_plural = "Admission Recommendations"

    def __str__(self):
        """Return string representation."""
        return f"Admission Recommendation for {self.encounter.patient} - {self.status}"

    def accept(self, user):
        """
        Mark recommendation as accepted.

        Args:
            user: User accepting the recommendation

        Raises:
            ValueError: If recommendation already resolved
        """
        if self.status in ["ACCEPTED", "DECLINED"]:
            raise ValueError("Recommendation already resolved")

        self.status = "ACCEPTED"
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save()

    def decline(self, user, reason):
        """
        Mark recommendation as declined with reason.

        Args:
            user: User declining the recommendation
            reason: Reason for declining

        Raises:
            ValueError: If recommendation already resolved
        """
        if self.status in ["ACCEPTED", "DECLINED"]:
            raise ValueError("Recommendation already resolved")

        self.status = "DECLINED"
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.decline_reason = reason
        self.save()

    def is_expired(self) -> bool:
        """
        Check if recommendation has expired.

        Returns:
            True if current time is past expires_at, False otherwise
        """
        return timezone.now() > self.expires_at


class Admission(TimeStampedModel):
    """
    Inpatient admission record.

    Represents a patient's admission to the inpatient department,
    linking OPD/IPD encounters, bed assignment, and insurance details.

    Attributes:
        patient: Patient being admitted
        opd_encounter: Optional OPD encounter that led to admission
        ipd_encounter: IPD encounter for this admission
        recommendation: Optional admission recommendation
        admission_number: Unique admission number (ADM-YYYYMMDD-XXXX)
        admission_date: Date and time of admission
        admitting_diagnosis: ICD-10 code for admitting diagnosis
        admitting_diagnosis_text: Text description of diagnosis
        admitting_officer: User who processed the admission
        attending_doctor: Doctor attending the patient
        ward: Ward where patient is admitted
        bed: Specific bed assigned
        status: Current admission status
        payer_type: Type of payer (CASH, SHA, CORPORATE)
        insurance_details: JSON field for insurance information
        discharge_date: Date and time of discharge (if applicable)
    """

    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("DISCHARGED", "Discharged"),
        ("TRANSFERRED_OUT", "Transferred Out"),
        ("DECEASED", "Deceased"),
        ("ABSCONDED", "Absconded"),
    ]

    PAYER_TYPE_CHOICES = [
        ("CASH", "Cash"),
        ("SHA", "SHA Insurance"),
        ("CORPORATE", "Corporate"),
    ]

    # Patient and encounter linkage
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Patient being admitted",
    )
    opd_encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admission_from_opd",
        help_text="OPD encounter that led to admission (if applicable)",
    )
    ipd_encounter = models.OneToOneField(
        "encounters.Encounter",
        on_delete=models.PROTECT,
        related_name="admission",
        help_text="IPD encounter for this admission",
    )
    recommendation = models.OneToOneField(
        AdmissionRecommendation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admission",
        help_text="Admission recommendation (if from OPD)",
    )

    # Admission details
    admission_number = models.CharField(
        max_length=50,
        unique=True,
        editable=False,
        help_text="Unique admission number (ADM-YYYYMMDD-XXXX)",
    )
    admission_date = models.DateTimeField(
        help_text="Date and time of admission",
    )
    admitting_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code for admitting diagnosis",
    )
    admitting_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of diagnosis",
    )
    admitting_officer = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="admissions_processed",
        help_text="User who processed the admission",
    )
    attending_doctor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients_attending",
        help_text="Doctor attending the patient",
    )

    # Location
    ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Ward where patient is admitted",
    )
    bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="admissions",
        help_text="Specific bed assigned",
    )

    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ACTIVE",
        help_text="Current admission status",
    )

    # Insurance/payment
    payer_type = models.CharField(
        max_length=20,
        choices=PAYER_TYPE_CHOICES,
        help_text="Type of payer",
    )
    insurance_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Insurance information (for SHA/Corporate)",
    )

    # Timestamps
    discharge_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Date and time of discharge",
    )

    class Meta:
        """Meta options for Admission model."""

        ordering = ["-admission_date"]
        verbose_name = "Admission"
        verbose_name_plural = "Admissions"

    def __str__(self):
        """Return string representation."""
        return f"{self.admission_number} - {self.patient} ({self.ward.code})"

    def save(self, *args, **kwargs):
        """Override save to auto-generate admission number and update bed status."""
        # Generate admission number if not set
        if not self.admission_number:
            self.admission_number = self.generate_admission_number()

        # Call parent save
        super().save(*args, **kwargs)

        # Update bed status to OCCUPIED
        if self.bed.status != "OCCUPIED":
            self.bed.status = "OCCUPIED"
            self.bed.status_changed_by = self.admitting_officer
            self.bed.save()

    def clean(self):
        """Validate admission data."""
        from django.core.exceptions import ValidationError

        # Check for duplicate active admission
        if self.status == "ACTIVE":
            existing = Admission.objects.filter(
                patient=self.patient,
                status="ACTIVE"
            ).exclude(pk=self.pk)
            
            if existing.exists():
                raise ValidationError("Patient already has an active admission")

    def generate_admission_number(self):
        """
        Auto-generate admission number in format: ADM-YYYYMMDD-XXXX.

        Returns:
            Unique admission number string
        """
        from django.db.models import Max
        import re

        today = self.admission_date.strftime("%Y%m%d")
        prefix = f"ADM-{today}-"

        # Get the last admission number for today
        last_admission = Admission.objects.filter(
            admission_number__startswith=prefix
        ).aggregate(Max("admission_number"))["admission_number__max"]

        if last_admission:
            # Extract sequence number and increment
            match = re.search(r"-(\d{4})$", last_admission)
            if match:
                sequence = int(match.group(1)) + 1
            else:
                sequence = 1
        else:
            sequence = 1

        return f"{prefix}{sequence:04d}"

    @property
    def length_of_stay(self) -> int:
        """
        Calculate length of stay in days.

        Returns:
            Number of days between admission and discharge (or current date)
        """
        end_date = self.discharge_date if self.discharge_date else timezone.now()
        delta = end_date - self.admission_date
        return delta.days


class Discharge(TimeStampedModel):
    """
    Patient discharge record.

    Documents the discharge of a patient from inpatient care,
    including clinical summary, medications, follow-up plans, and clearances.

    Attributes:
        admission: Admission being discharged
        discharge_type: Type of discharge (NORMAL, AGAINST_ADVICE, etc.)
        discharge_date: Date and time of discharge
        discharged_by: User who processed the discharge
        admission_diagnosis: ICD-10 code from admission
        final_diagnosis: ICD-10 code at discharge
        final_diagnosis_text: Text description of final diagnosis
        procedures_performed: Summary of procedures during stay
        treatment_summary: Overall treatment summary
        discharge_medications: JSON list of discharge medications
        follow_up_date: Date for follow-up appointment
        follow_up_instructions: Instructions for follow-up
        referral_facility: Facility if transferred
        referral_reason: Reason for referral
        patient_instructions: Instructions for patient
        pharmacy_cleared: Pharmacy clearance status
        billing_cleared: Billing clearance status
        lab_results_acknowledged: Lab results reviewed
    """

    DISCHARGE_TYPE_CHOICES = [
        ("NORMAL", "Normal Discharge"),
        ("AGAINST_ADVICE", "Discharge Against Medical Advice"),
        ("TRANSFERRED", "Transferred to Another Facility"),
        ("DECEASED", "Deceased"),
        ("ABSCONDED", "Absconded"),
    ]

    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name="discharge",
        help_text="Admission being discharged",
    )

    # Discharge details
    discharge_type = models.CharField(
        max_length=20,
        choices=DISCHARGE_TYPE_CHOICES,
        help_text="Type of discharge",
    )
    discharge_date = models.DateTimeField(
        help_text="Date and time of discharge",
    )
    discharged_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="discharges_processed",
        help_text="User who processed the discharge",
    )

    # Clinical summary
    admission_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code from admission",
    )
    final_diagnosis = models.CharField(
        max_length=10,
        help_text="ICD-10 code at discharge",
    )
    final_diagnosis_text = models.CharField(
        max_length=255,
        help_text="Text description of final diagnosis",
    )
    procedures_performed = models.TextField(
        blank=True,
        default="",
        help_text="Summary of procedures performed during stay",
    )
    treatment_summary = models.TextField(
        help_text="Overall treatment summary",
    )

    # Discharge medications
    discharge_medications = models.JSONField(
        default=list,
        blank=True,
        help_text="List of discharge medications with dosage and instructions",
    )

    # Follow-up
    follow_up_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date for follow-up appointment",
    )
    follow_up_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Instructions for follow-up care",
    )

    # Referrals
    referral_facility = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Facility name if transferred",
    )
    referral_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for referral/transfer",
    )

    # Patient instructions
    patient_instructions = models.TextField(
        help_text="Discharge instructions for patient",
    )

    # Clearances
    pharmacy_cleared = models.BooleanField(
        default=False,
        help_text="Pharmacy clearance obtained",
    )
    billing_cleared = models.BooleanField(
        default=False,
        help_text="Billing clearance obtained",
    )
    lab_results_acknowledged = models.BooleanField(
        default=False,
        help_text="Lab results reviewed and acknowledged",
    )

    class Meta:
        """Meta options for Discharge model."""

        ordering = ["-discharge_date"]
        verbose_name = "Discharge"
        verbose_name_plural = "Discharges"

    def __str__(self):
        """Return string representation."""
        return f"Discharge: {self.admission.admission_number} - {self.discharge_type}"

    def save(self, *args, **kwargs):
        """Override save to update admission and bed status."""
        # Call parent save first
        super().save(*args, **kwargs)

        # Update admission status and discharge date
        if self.discharge_type == "DECEASED":
            self.admission.status = "DECEASED"
        elif self.discharge_type == "ABSCONDED":
            self.admission.status = "ABSCONDED"
        elif self.discharge_type == "TRANSFERRED":
            self.admission.status = "TRANSFERRED_OUT"
        else:
            self.admission.status = "DISCHARGED"

        self.admission.discharge_date = self.discharge_date
        self.admission.save()

        # Update bed status to AVAILABLE
        bed = self.admission.bed
        if bed.status == "OCCUPIED":
            bed.status = "AVAILABLE"
            bed.status_changed_by = self.discharged_by
            bed.notes = ""
            bed.save()

    def clean(self):
        """Validate discharge data."""
        from django.core.exceptions import ValidationError

        # Validate discharge date is not before admission date
        if self.discharge_date < self.admission.admission_date:
            raise ValidationError("Discharge date cannot be before admission date")

        # For normal discharge, require all clearances
        if self.discharge_type == "NORMAL":
            if not (self.pharmacy_cleared and self.billing_cleared and self.lab_results_acknowledged):
                raise ValidationError("All clearances required for normal discharge")

    @property
    def length_of_stay(self) -> int:
        """
        Calculate length of stay in days.

        Returns:
            Number of days between admission and discharge
        """
        delta = self.discharge_date - self.admission.admission_date
        return delta.days

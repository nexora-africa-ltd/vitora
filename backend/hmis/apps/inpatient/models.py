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

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractUser
    from django.db.models import QuerySet

User = get_user_model()


def default_recommendation_expiry():
    return timezone.now() + timedelta(hours=24)


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

    # Type hints for reverse relations
    beds: QuerySet[Bed]
    admissions: QuerySet[Admission]
    transfers_out: QuerySet[Transfer]
    transfers_in: QuerySet[Transfer]
    shift_handovers: QuerySet[ShiftHandover]

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

    class Meta(TimeStampedModel.Meta):
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

    class Meta(TimeStampedModel.Meta):
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
        default=default_recommendation_expiry,
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

    class Meta(TimeStampedModel.Meta):
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
        """True if current time is past expires_at."""
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
        admission_status: Current admission status
        payer_type: Type of payer (CASH, SHA, CORPORATE)
        insurance_details: JSON field for insurance information
        discharge_date: Date and time of discharge (if applicable)
    """

    # Type hints for reverse relations
    ward_rounds: QuerySet[WardRound]
    transfers: QuerySet[Transfer]

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
    admission_status = models.CharField(
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

    class Meta(TimeStampedModel.Meta):
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
        if self.admission_status == "ACTIVE":
            existing = Admission.objects.filter(
                patient=self.patient,
                admission_status="ACTIVE"
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

    @property
    def status(self) -> str:
        """Backward-compatible alias for admission_status."""
        return self.admission_status

    @status.setter
    def status(self, value: str) -> None:
        self.admission_status = value


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

    class Meta(TimeStampedModel.Meta):
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
            self.admission.admission_status = "DECEASED"
        elif self.discharge_type == "ABSCONDED":
            self.admission.admission_status = "ABSCONDED"
        elif self.discharge_type == "TRANSFERRED":
            self.admission.admission_status = "TRANSFERRED_OUT"
        else:
            self.admission.admission_status = "DISCHARGED"

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


class Transfer(TimeStampedModel):
    """
    Patient transfer between wards.

    Documents the transfer of a patient from one ward to another,
    with automatic bed status updates and admission tracking.

    Attributes:
        admission: Admission being transferred
        source_ward: Ward patient is transferring from
        source_bed: Bed patient is leaving
        destination_ward: Ward patient is transferring to
        destination_bed: Bed patient is moving to
        reason: Reason for transfer
        reason_details: Additional details about transfer
        transferred_by: User who processed the transfer
        transfer_date: Date and time of transfer
        clinical_handover_notes: Clinical information for receiving team
    """

    TRANSFER_REASON_CHOICES = [
        ("STEP_UP", "Step Up Care (e.g., to ICU)"),
        ("STEP_DOWN", "Step Down Care"),
        ("SPECIALTY", "Specialty Care"),
        ("BED_MANAGEMENT", "Bed Management"),
        ("PATIENT_REQUEST", "Patient Request"),
        ("OTHER", "Other"),
    ]

    admission = models.ForeignKey(
        Admission,
        on_delete=models.CASCADE,
        related_name="transfers",
        help_text="Admission being transferred",
    )

    # Source
    source_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Ward patient is transferring from",
    )
    source_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_out",
        help_text="Bed patient is leaving",
    )

    # Destination
    destination_ward = models.ForeignKey(
        Ward,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Ward patient is transferring to",
    )
    destination_bed = models.ForeignKey(
        Bed,
        on_delete=models.PROTECT,
        related_name="transfers_in",
        help_text="Bed patient is moving to",
    )

    # Details
    reason = models.CharField(
        max_length=20,
        choices=TRANSFER_REASON_CHOICES,
        help_text="Reason for transfer",
    )
    reason_details = models.TextField(
        blank=True,
        default="",
        help_text="Additional details about transfer reason",
    )
    transferred_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="transfers_processed",
        help_text="User who processed the transfer",
    )
    transfer_date = models.DateTimeField(
        help_text="Date and time of transfer",
    )

    # Handover
    clinical_handover_notes = models.TextField(
        help_text="Clinical information for receiving team",
    )

    class Meta(TimeStampedModel.Meta):
        """Meta options for Transfer model."""

        ordering = ["-transfer_date"]
        verbose_name = "Transfer"
        verbose_name_plural = "Transfers"

    def __str__(self):
        """Return string representation."""
        return f"Transfer: {self.admission.admission_number} - {self.source_ward.name} → {self.destination_ward.name}"

    def save(self, *args, **kwargs):
        """Override save to update bed and admission status."""
        # Call parent save first
        super().save(*args, **kwargs)

        # Update source bed status to AVAILABLE
        if self.source_bed.status == "OCCUPIED":
            self.source_bed.status = "AVAILABLE"
            self.source_bed.status_changed_by = self.transferred_by
            self.source_bed.notes = ""
            self.source_bed.save()

        # Update destination bed status to OCCUPIED
        if self.destination_bed.status == "AVAILABLE":
            self.destination_bed.status = "OCCUPIED"
            self.destination_bed.status_changed_by = self.transferred_by
            self.destination_bed.save()

        # Update admission's current ward and bed
        self.admission.ward = self.destination_ward
        self.admission.bed = self.destination_bed
        self.admission.save()

    def clean(self):
        """Validate transfer data."""
        from django.core.exceptions import ValidationError

        # Prevent transfer within same ward
        if self.source_ward == self.destination_ward:
            raise ValidationError("Cannot transfer patient within the same ward")

        # Validate destination bed is available
        if self.destination_bed.status != "AVAILABLE":
            raise ValidationError("Destination bed must be available")

        # Validate transfer date is not before admission date
        if self.transfer_date < self.admission.admission_date:
            raise ValidationError("Transfer date cannot be before admission date")


class WardRound(TimeStampedModel):
    """Daily ward round documentation using SOAP notes format."""

    CONDITION_STATUS_CHOICES = [
        ("STABLE", "Stable"),
        ("IMPROVING", "Improving"),
        ("DETERIORATING", "Deteriorating"),
        ("CRITICAL", "Critical"),
    ]

    admission = models.ForeignKey(
        Admission, on_delete=models.CASCADE, related_name="ward_rounds"
    )
    round_date = models.DateField()
    round_time = models.TimeField()
    conducted_by = models.ForeignKey(User, on_delete=models.PROTECT)

    # SOAP notes
    subjective = models.TextField(help_text="Patient complaints, symptoms")
    objective = models.TextField(
        help_text="Examination findings, vitals, observations"
    )
    assessment = models.TextField(
        help_text="Clinical assessment, diagnosis updates"
    )
    plan = models.TextField(help_text="Treatment plan, orders, next steps")

    # Patient condition tracking
    condition_status = models.CharField(
        max_length=20, choices=CONDITION_STATUS_CHOICES
    )

    # Consultant review flags
    requires_consultant_review = models.BooleanField(default=False)
    consultant_specialty = models.CharField(max_length=100, blank=True)

    class Meta(TimeStampedModel.Meta):
        unique_together = ["admission", "round_date", "conducted_by"]
        ordering = ["-round_date", "-round_time"]
        verbose_name = "Ward Round"
        verbose_name_plural = "Ward Rounds"

    def __str__(self):
        return f"Ward Round - {self.admission.patient} on {self.round_date}"

    def clean(self):
        """Validate ward round data."""
        super().clean()

        # Validate round date is not in the future
        from datetime import date

        if self.round_date and self.round_date > date.today():
            raise ValidationError(
                {"round_date": "Round date cannot be in the future"}
            )


class NursingKardex(models.Model):
    """
    Nursing Kardex for inpatient care coordination.
    
    One-to-one relationship with Admission. Auto-created when admission is saved.
    Contains nursing care plan, risk assessments, and related shift/handover notes.
    """
    
    RISK_CHOICES = [
        ('LOW', 'Low'),
        ('MODERATE', 'Moderate'),
        ('HIGH', 'High'),
    ]
    
    admission = models.OneToOneField(
        Admission,
        on_delete=models.CASCADE,
        related_name='kardex',
        help_text="One Kardex per admission"
    )
    
    # Nursing care plan (editable sections)
    nursing_problems = models.TextField(
        blank=True,
        help_text="Identified nursing problems/diagnoses"
    )
    interventions = models.TextField(
        blank=True,
        help_text="Nursing interventions and care activities"
    )
    monitoring_requirements = models.TextField(
        blank=True,
        help_text="What to monitor and how often"
    )
    care_task_frequency = models.TextField(
        blank=True,
        help_text="Frequency of care tasks (e.g., 'Wound dressing BD')"
    )
    
    # Risk assessments
    fall_risk = models.CharField(
        max_length=20,
        choices=RISK_CHOICES,
        default='LOW',
        help_text="Patient fall risk level"
    )
    pressure_sore_risk = models.CharField(
        max_length=20,
        choices=RISK_CHOICES,
        default='LOW',
        help_text="Pressure sore risk level"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = "Nursing Kardexes"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Kardex for {self.admission.patient} - Admission {self.admission.admission_number}"


class KardexShiftNote(models.Model):
    """
    Individual shift note entry in Kardex (append-only design).
    
    Nurses add notes throughout their shift documenting patient status,
    care provided, and observations. Notes are immutable once created
    (timestamp auto-set on creation and cannot be changed).
    """
    
    SHIFT_CHOICES = [
        ('DAY', 'Day Shift'),
        ('NIGHT', 'Night Shift'),
    ]
    
    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name='shift_notes',
        help_text="Kardex this note belongs to"
    )
    shift = models.CharField(
        max_length=10,
        choices=SHIFT_CHOICES,
        help_text="Which shift this note is from"
    )
    nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        help_text="Nurse who created this note"
    )
    content = models.TextField(
        help_text="Shift note content - observations, care provided, patient status"
    )
    timestamp = models.DateTimeField(
        auto_now_add=True,
        help_text="When this note was created (immutable)"
    )
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['kardex', '-timestamp']),
            models.Index(fields=['shift', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.shift} shift note by {self.nurse.username} at {self.timestamp}"


class KardexHandoverNote(models.Model):
    """
    Handover notes for shift transitions.
    
    Documents pending tasks, escalations, and important information
    to be communicated between outgoing and incoming nursing staff.
    """
    
    kardex = models.ForeignKey(
        NursingKardex,
        on_delete=models.CASCADE,
        related_name='handover_notes',
        help_text="Kardex this handover belongs to"
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='kardex_handovers_given',
        help_text="Nurse ending their shift"
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='kardex_handovers_received',
        help_text="Nurse starting their shift"
    )
    shift_ending = models.CharField(
        max_length=10,
        help_text="Which shift is ending (DAY/NIGHT)"
    )
    pending_tasks = models.TextField(
        help_text="Tasks that need completion in next shift"
    )
    escalations = models.TextField(
        blank=True,
        help_text="Issues escalated to doctors or management"
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When incoming nurse acknowledged the handover"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['kardex', '-created_at']),
        ]
    
    def __str__(self):
        status = "✓ Acknowledged" if self.acknowledged_at else "Pending"
        return f"Handover from {self.outgoing_nurse.username} to {self.incoming_nurse.username} - {status}"


class ShiftHandover(TimeStampedModel):
    """
    Formal ward-level shift handover record.
    
    Documents shift handovers between nursing teams for ward-level patient care
    coordination. Tracks patient counts, critical cases, and pending tasks.
    
    Attributes:
        ward: Hospital ward where handover occurs
        shift_date: Date of the shift
        shift_ending: Shift that is ending (DAY, EVENING, NIGHT)
        outgoing_nurse: Nurse handing over shift
        incoming_nurse: Nurse receiving handover
        total_patients: Total patient count in ward
        critical_patients: Number of critical/unstable patients
        new_admissions: Number of new admissions during shift
        discharges_pending: Number of pending discharges
        general_notes: General shift notes
        acknowledged_at: When incoming nurse acknowledged handover
    """
    
    SHIFT_CHOICES = [
        ("DAY", "Day Shift (07:00-15:00)"),
        ("EVENING", "Evening Shift (15:00-23:00)"),
        ("NIGHT", "Night Shift (23:00-07:00)"),
    ]
    
    ward = models.ForeignKey(
        Ward,
        on_delete=models.CASCADE,
        related_name="shift_handovers",
        help_text="Ward where handover occurs"
    )
    shift_date = models.DateField(help_text="Date of the shift")
    shift_ending = models.CharField(
        max_length=10,
        choices=SHIFT_CHOICES,
        help_text="Shift that is ending"
    )
    outgoing_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_given",
        help_text="Nurse handing over shift"
    )
    incoming_nurse = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="handovers_received",
        help_text="Nurse receiving handover"
    )
    
    # Patient counts
    total_patients = models.PositiveIntegerField(
        help_text="Total patient count in ward"
    )
    critical_patients = models.PositiveIntegerField(
        default=0,
        help_text="Number of critical/unstable patients"
    )
    new_admissions = models.PositiveIntegerField(
        default=0,
        help_text="Number of new admissions during shift"
    )
    discharges_pending = models.PositiveIntegerField(
        default=0,
        help_text="Number of pending discharges"
    )
    
    # Notes
    general_notes = models.TextField(
        blank=True,
        help_text="General shift notes and observations"
    )
    acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When incoming nurse acknowledged handover"
    )
    
    class Meta(TimeStampedModel.Meta):
        ordering = ['-shift_date', '-created_at']
        unique_together = ['ward', 'shift_date', 'shift_ending']
        indexes = [
            models.Index(fields=['ward', '-shift_date']),
            models.Index(fields=['shift_date', 'shift_ending']),
        ]
    
    def __str__(self) -> str:
        # get_shift_ending_display() is auto-generated by Django for choice fields
        shift_display: str = self.get_shift_ending_display()  # type: ignore[attr-defined]
        return f"{self.ward.name} - {shift_display} - {self.shift_date}"
    
    @property
    def is_acknowledged(self) -> bool:
        """Check if handover has been acknowledged."""
        return self.acknowledged_at is not None
    
    def acknowledge(self, user: "AbstractUser") -> None:
        """
        Acknowledge handover receipt.
        
        Args:
            user: User acknowledging the handover (should be incoming_nurse)
        """
        self.acknowledged_at = timezone.now()
        self.save(update_fields=['acknowledged_at'])
    
    def auto_populate_counts(self) -> None:
        """
        Auto-populate patient counts from ward data.
        
        Queries current ward admissions to calculate:
        - Total patients
        - Critical patients (based on ward round condition status)
        - New admissions today
        - Discharges pending
        """
        from django.db.models import Q, Count
        
        # Get all active admissions in this ward
        active_admissions = Admission.objects.filter(
            ward=self.ward,
            discharge__isnull=True
        )
        
        self.total_patients = active_admissions.count()
        
        # Count new admissions for this shift date
        self.new_admissions = active_admissions.filter(
            admission_date__date=self.shift_date
        ).count()
        
        # Count critical patients (patients with DETERIORATING status in latest ward round)
        critical_count = 0
        for admission in active_admissions:
            latest_round = admission.ward_rounds.order_by('-round_date').first()
            if latest_round and latest_round.condition_status == 'DETERIORATING':
                critical_count += 1
        self.critical_patients = critical_count
        
        # Count pending discharges (admissions with recent discharge recommendations)
        # TODO: This is a simplified count - could be enhanced with actual discharge orders
        self.discharges_pending = 0  # Placeholder - implement based on your workflow
        
        self.save()


# ============================================================================
# Signals
# ============================================================================

from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=Admission)
def create_kardex_for_admission(sender, instance, created, **kwargs):
    """
    Auto-create Nursing Kardex when an Admission is created.
    
    This ensures every admission has a Kardex for nursing care coordination.
    """
    if created:
        NursingKardex.objects.create(admission=instance)

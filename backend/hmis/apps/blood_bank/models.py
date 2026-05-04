"""Blood Bank models for Vitora HMIS."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.models import TimeStampedModel


class BloodGroup(models.TextChoices):
    A_POS = "A+", "A Positive"
    A_NEG = "A-", "A Negative"
    B_POS = "B+", "B Positive"
    B_NEG = "B-", "B Negative"
    AB_POS = "AB+", "AB Positive"
    AB_NEG = "AB-", "AB Negative"
    O_POS = "O+", "O Positive"
    O_NEG = "O-", "O Negative"


class BloodComponent(models.TextChoices):
    WHOLE_BLOOD = "WHOLE_BLOOD", "Whole Blood"
    PACKED_RBC = "PACKED_RBC", "Packed Red Blood Cells"
    PLATELETS = "PLATELETS", "Platelets"
    FFP = "FFP", "Fresh Frozen Plasma"
    CRYOPRECIPITATE = "CRYOPRECIPITATE", "Cryoprecipitate"


class UnitStatus(models.TextChoices):
    COLLECTED = "COLLECTED", "Collected"
    TESTING = "TESTING", "Testing"
    AVAILABLE = "AVAILABLE", "Available"
    RESERVED = "RESERVED", "Reserved"
    ISSUED = "ISSUED", "Issued"
    EXPIRED = "EXPIRED", "Expired"
    DISCARDED = "DISCARDED", "Discarded"
    QUARANTINED = "QUARANTINED", "Quarantined"


class RequestStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    CROSSMATCH_PENDING = "CROSSMATCH_PENDING", "Crossmatch Pending"
    READY = "READY", "Ready for Issue"
    ISSUED = "ISSUED", "Issued"
    TRANSFUSED = "TRANSFUSED", "Transfused"
    CANCELLED = "CANCELLED", "Cancelled"
    RETURNED = "RETURNED", "Returned"


class RequestUrgency(models.TextChoices):
    ROUTINE = "ROUTINE", "Routine"
    URGENT = "URGENT", "Urgent"
    EMERGENCY = "EMERGENCY", "Emergency"


class CrossMatchResult(models.TextChoices):
    COMPATIBLE = "COMPATIBLE", "Compatible"
    INCOMPATIBLE = "INCOMPATIBLE", "Incompatible"
    PENDING = "PENDING", "Pending"


class TransfusionReaction(models.TextChoices):
    NONE = "NONE", "None"
    FEBRILE = "FEBRILE", "Febrile Non-Hemolytic"
    ALLERGIC = "ALLERGIC", "Allergic"
    HEMOLYTIC_ACUTE = "HEMOLYTIC_ACUTE", "Acute Hemolytic"
    HEMOLYTIC_DELAYED = "HEMOLYTIC_DELAYED", "Delayed Hemolytic"
    ANAPHYLACTIC = "ANAPHYLACTIC", "Anaphylactic"
    TACO = "TACO", "Transfusion-Associated Circulatory Overload"
    TRALI = "TRALI", "Transfusion-Related Acute Lung Injury"


# =============================================================================
# Models
# =============================================================================


class BloodDonor(FacilityScopedModel, TimeStampedModel):
    """Blood donor registration."""

    donor_number = models.CharField(max_length=30, unique=True, editable=False)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="blood_donations",
        help_text="Link to patient record if donor is also a patient.",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    date_of_birth = models.DateField()
    gender = models.CharField(max_length=1, choices=[("M", "Male"), ("F", "Female")])
    blood_group = models.CharField(max_length=3, choices=BloodGroup.choices)
    phone_number = models.CharField(max_length=20, blank=True)
    national_id = models.CharField(max_length=20, blank=True)

    is_active = models.BooleanField(default=True)
    last_donation_date = models.DateField(null=True, blank=True)
    total_donations = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.donor_number} - {self.first_name} {self.last_name} ({self.blood_group})"

    def save(self, *args, **kwargs):
        if not self.donor_number:
            self.donor_number = self._generate_donor_number()
        super().save(*args, **kwargs)

    def _generate_donor_number(self):
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"BD-{today}"
        last = (
            BloodDonor.objects.filter(donor_number__startswith=prefix)
            .order_by("-donor_number")
            .first()
        )
        seq = int(last.donor_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}-{seq:04d}"

    @property
    def eligible_to_donate(self) -> bool:
        """Donor eligible if last donation was >56 days ago (whole blood)."""
        if not self.last_donation_date:
            return True
        days_since = (timezone.now().date() - self.last_donation_date).days
        return days_since >= 56


class BloodUnit(FacilityScopedModel, TimeStampedModel):
    """Individual blood unit collected and stored."""

    unit_number = models.CharField(max_length=30, unique=True, editable=False)
    donor = models.ForeignKey(BloodDonor, on_delete=models.PROTECT, related_name="units")
    blood_group = models.CharField(max_length=3, choices=BloodGroup.choices)
    component = models.CharField(
        max_length=20, choices=BloodComponent.choices, default=BloodComponent.WHOLE_BLOOD
    )
    status = models.CharField(
        max_length=20, choices=UnitStatus.choices, default=UnitStatus.COLLECTED
    )

    collection_date = models.DateTimeField(default=timezone.now)
    expiry_date = models.DateTimeField()
    volume_ml = models.PositiveIntegerField(default=450)

    # Screening results
    hiv_screened = models.BooleanField(default=False)
    hbv_screened = models.BooleanField(default=False)
    hcv_screened = models.BooleanField(default=False)
    syphilis_screened = models.BooleanField(default=False)
    malaria_screened = models.BooleanField(default=False)
    all_screens_negative = models.BooleanField(default=False)

    storage_location = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-collection_date"]

    def __str__(self):
        return f"{self.unit_number} ({self.blood_group} {self.get_component_display()})"

    def save(self, *args, **kwargs):
        if not self.unit_number:
            self.unit_number = self._generate_unit_number()
        super().save(*args, **kwargs)

    def _generate_unit_number(self):
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"BU-{today}"
        last = (
            BloodUnit.objects.filter(unit_number__startswith=prefix)
            .order_by("-unit_number")
            .first()
        )
        seq = int(last.unit_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}-{seq:04d}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expiry_date

    @property
    def is_available(self) -> bool:
        return self.status == UnitStatus.AVAILABLE and not self.is_expired

    def mark_available(self):
        """Mark unit available after all screens pass."""
        self.status = UnitStatus.AVAILABLE
        self.all_screens_negative = True
        self.save(update_fields=["status", "all_screens_negative", "updated_at"])

    def quarantine(self, reason=""):
        """Quarantine unit (positive screen or QC failure)."""
        self.status = UnitStatus.QUARANTINED
        if reason:
            self.notes = f"{self.notes}\nQuarantined: {reason}".strip()
        self.save(update_fields=["status", "notes", "updated_at"])


class BloodRequest(FacilityScopedModel, TimeStampedModel):
    """Blood product request for a patient."""

    request_number = models.CharField(max_length=30, unique=True, editable=False)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="blood_requests"
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="blood_requests",
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="blood_requests_made"
    )

    blood_group = models.CharField(max_length=3, choices=BloodGroup.choices)
    component = models.CharField(
        max_length=20, choices=BloodComponent.choices, default=BloodComponent.WHOLE_BLOOD
    )
    units_requested = models.PositiveIntegerField(default=1)
    urgency = models.CharField(
        max_length=10, choices=RequestUrgency.choices, default=RequestUrgency.ROUTINE
    )
    status = models.CharField(
        max_length=20, choices=RequestStatus.choices, default=RequestStatus.PENDING
    )

    clinical_indication = models.TextField(help_text="Reason for transfusion")
    patient_hemoglobin = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True, help_text="Pre-transfusion Hb (g/dL)"
    )

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.request_number} - {self.patient} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.request_number:
            self.request_number = self._generate_request_number()
        super().save(*args, **kwargs)

    def _generate_request_number(self):
        today = timezone.now().strftime("%Y%m%d")
        prefix = f"BR-{today}"
        last = (
            BloodRequest.objects.filter(request_number__startswith=prefix)
            .order_by("-request_number")
            .first()
        )
        seq = int(last.request_number.split("-")[-1]) + 1 if last else 1
        return f"{prefix}-{seq:04d}"

    def cancel(self, reason=""):
        self.status = RequestStatus.CANCELLED
        if reason:
            self.notes = f"{self.notes}\nCancelled: {reason}".strip()
        self.save(update_fields=["status", "notes", "updated_at"])


class CrossMatch(FacilityScopedModel, TimeStampedModel):
    """Cross-match test between a blood unit and patient sample."""

    blood_request = models.ForeignKey(
        BloodRequest, on_delete=models.CASCADE, related_name="crossmatches"
    )
    blood_unit = models.ForeignKey(BloodUnit, on_delete=models.PROTECT, related_name="crossmatches")
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="crossmatches_performed"
    )

    result = models.CharField(
        max_length=15, choices=CrossMatchResult.choices, default=CrossMatchResult.PENDING
    )
    performed_at = models.DateTimeField(default=timezone.now)
    method = models.CharField(max_length=50, default="Gel card")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-performed_at"]
        unique_together = [("blood_request", "blood_unit")]

    def __str__(self):
        return (
            f"XM {self.blood_unit.unit_number} → {self.blood_request.request_number}: {self.result}"
        )


class BloodIssue(FacilityScopedModel, TimeStampedModel):
    """Record of blood unit issued to patient."""

    blood_request = models.ForeignKey(BloodRequest, on_delete=models.CASCADE, related_name="issues")
    blood_unit = models.OneToOneField(BloodUnit, on_delete=models.PROTECT, related_name="issue")
    crossmatch = models.ForeignKey(
        CrossMatch, on_delete=models.SET_NULL, null=True, blank=True, related_name="issue"
    )
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="blood_issues_made"
    )

    issued_at = models.DateTimeField(default=timezone.now)
    transfusion_started_at = models.DateTimeField(null=True, blank=True)
    transfusion_completed_at = models.DateTimeField(null=True, blank=True)
    transfusion_reaction = models.CharField(
        max_length=20, choices=TransfusionReaction.choices, default=TransfusionReaction.NONE
    )
    reaction_details = models.TextField(blank=True)
    vital_signs_pre = models.JSONField(default=dict, blank=True)
    vital_signs_post = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-issued_at"]

    def __str__(self):
        return f"Issue {self.blood_unit.unit_number} → {self.blood_request.patient}"

    def save(self, *args, **kwargs):
        if not self.pk:
            # Mark unit as issued
            self.blood_unit.status = UnitStatus.ISSUED
            self.blood_unit.save(update_fields=["status", "updated_at"])
        super().save(*args, **kwargs)

    def complete_transfusion(self, reaction=TransfusionReaction.NONE, details=""):
        """Complete transfusion and record reaction."""
        self.transfusion_completed_at = timezone.now()
        self.transfusion_reaction = reaction
        if details:
            self.reaction_details = details
        self.save(
            update_fields=[
                "transfusion_completed_at",
                "transfusion_reaction",
                "reaction_details",
                "updated_at",
            ]
        )
        # Update request status if all units transfused
        request = self.blood_request
        transfused_count = request.issues.filter(transfusion_completed_at__isnull=False).count()
        if transfused_count >= request.units_requested:
            request.status = RequestStatus.TRANSFUSED
            request.save(update_fields=["status", "updated_at"])

"""
Disease Surveillance models for Vitora HMIS.

Implements Kenya's MOH 502 notifiable diseases reporting requirements
including immediate reportable diseases and IDSR (Integrated Disease
Surveillance and Response) weekly reporting.

Phase 1 Sprint 1.B: Disease Surveillance Foundation
"""

from datetime import timedelta
from typing import TYPE_CHECKING

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel
from hmis.apps.core.pii import encrypted_pii_property

if TYPE_CHECKING:
    pass


class NotifiableCategory(models.TextChoices):
    """
    MOH disease notification categories based on reporting timeline.

    IMMEDIATE: Must be reported within 24 hours (e.g., cholera, measles)
    WEEKLY: Reported in weekly IDSR summary (e.g., malaria, typhoid)
    MONTHLY: Aggregated in monthly reports
    """

    IMMEDIATE = "IMMEDIATE", "Immediate (within 24 hours)"
    WEEKLY = "WEEKLY", "Weekly (IDSR)"
    MONTHLY = "MONTHLY", "Monthly"


class CaseSeverity(models.TextChoices):
    """Severity classification for notifiable disease cases."""

    MILD = "MILD", "Mild"
    MODERATE = "MODERATE", "Moderate"
    SEVERE = "SEVERE", "Severe"
    CRITICAL = "CRITICAL", "Critical"


class CaseOutcome(models.TextChoices):
    """Outcome status for disease cases."""

    ACTIVE = "ACTIVE", "Active/Under Treatment"
    RECOVERED = "RECOVERED", "Recovered"
    REFERRED = "REFERRED", "Referred to Higher Facility"
    DECEASED = "DECEASED", "Deceased"
    LOST_TO_FOLLOWUP = "LOST_TO_FOLLOWUP", "Lost to Follow-up"


class NotificationStatus(models.TextChoices):
    """Status of disease notification to authorities."""

    PENDING = "PENDING", "Pending Notification"
    NOTIFIED = "NOTIFIED", "Notified to County"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged by County"
    INVESTIGATED = "INVESTIGATED", "Under Investigation"
    CLOSED = "CLOSED", "Case Closed"


class NotifiableDisease(models.Model):
    """
    Reference model for MOH 502 notifiable diseases.

    Contains the official list of diseases that must be reported to
    Kenya's Ministry of Health according to category and timeline.

    Attributes:
        name: Disease name (e.g., "Cholera", "Measles")
        icd10_codes: Comma-separated ICD-10 codes that map to this disease
        category: Notification category (IMMEDIATE, WEEKLY, MONTHLY)
        reporting_hours: Maximum hours to report (24 for immediate)
        description: Clinical description and criteria
        is_active: Whether disease is currently on reportable list
    """

    name = models.CharField(
        max_length=200,
        unique=True,
        help_text="Disease name (e.g., Cholera, Measles)",
    )
    icd10_codes = models.TextField(
        help_text="Comma-separated ICD-10 codes (e.g., 'A00,A00.0,A00.1,A00.9')",
    )
    category = models.CharField(
        max_length=20,
        choices=NotifiableCategory.choices,
        default=NotifiableCategory.WEEKLY,
        help_text="MOH notification category",
    )
    reporting_hours = models.PositiveIntegerField(
        default=24,
        validators=[MinValueValidator(1), MaxValueValidator(720)],
        help_text="Maximum hours to report to authorities",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Clinical description and case definition",
    )
    case_definition = models.TextField(
        blank=True,
        default="",
        help_text="WHO/MOH case definition criteria",
    )
    laboratory_criteria = models.TextField(
        blank=True,
        default="",
        help_text="Laboratory confirmation criteria",
    )
    is_ihr_notifiable = models.BooleanField(
        default=False,
        help_text="Requires International Health Regulations notification",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether disease is currently on MOH reportable list",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "name"]
        verbose_name = "Notifiable Disease"
        verbose_name_plural = "Notifiable Diseases"
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.get_category_display()})"

    def get_icd10_code_list(self) -> list[str]:
        """Return list of ICD-10 codes for this disease."""
        return [code.strip().upper() for code in self.icd10_codes.split(",") if code.strip()]

    @property
    def is_immediate(self) -> bool:
        """Return True if this is an immediate reportable disease."""
        return self.category == NotifiableCategory.IMMEDIATE


class NotifiableCase(FacilityScopedModel):
    """
    Recorded instance of a notifiable disease case.

    Created automatically when an encounter diagnosis matches a
    NotifiableDisease ICD-10 code, or manually by clinicians.

    Attributes:
        disease: Reference to NotifiableDisease
        patient: Patient with the condition
        encounter: Encounter where diagnosis was made
        diagnosis: The Diagnosis record that triggered the case
        detected_at: When the case was detected
        notification_status: Current notification workflow status
        notified_at: When county was notified
        county: Patient's county for notification routing
    """

    disease = models.ForeignKey(
        NotifiableDisease,
        on_delete=models.PROTECT,
        related_name="cases",
        help_text="Notifiable disease type",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="notifiable_cases",
        help_text="Patient with notifiable condition",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.CASCADE,
        related_name="notifiable_cases",
        help_text="Encounter where diagnosis was made",
    )
    diagnosis = models.ForeignKey(
        "encounters.Diagnosis",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifiable_cases",
        help_text="Diagnosis record that triggered case creation",
    )
    # Case details
    onset_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of symptom onset",
    )
    severity = models.CharField(
        max_length=20,
        choices=CaseSeverity.choices,
        default=CaseSeverity.MODERATE,
        help_text="Clinical severity",
    )
    outcome = models.CharField(
        max_length=20,
        choices=CaseOutcome.choices,
        default=CaseOutcome.ACTIVE,
        help_text="Patient outcome",
    )
    laboratory_confirmed = models.BooleanField(
        default=False,
        help_text="Whether diagnosis is laboratory confirmed",
    )
    lab_result_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date of confirmatory lab result",
    )
    # Notification tracking
    notification_status = models.CharField(
        max_length=20,
        choices=NotificationStatus.choices,
        default=NotificationStatus.PENDING,
        help_text="Notification workflow status",
    )
    detected_at = models.DateTimeField(
        default=timezone.now,
        help_text="When case was detected/created",
    )
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When county health office was notified",
    )
    notification_deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Deadline for notification based on disease category",
    )
    # County routing (from patient's registered county)
    county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifiable_cases",
        help_text="County health office to notify",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifiable_cases",
        help_text="Sub-county for granular reporting",
    )
    # Investigation
    contact_tracing_initiated = models.BooleanField(
        default=False,
        help_text="Whether contact tracing has started",
    )
    contacts_identified = models.PositiveIntegerField(
        default=0,
        help_text="Number of contacts identified",
    )
    investigation_notes = models.TextField(
        blank=True,
        default="",
        help_text="Notes from case investigation",
    )
    # Record keeping
    reported_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="reported_cases",
        help_text="Staff who reported/created the case",
    )
    notified_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notified_cases",
        help_text="Staff who submitted notification",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-detected_at"]
        verbose_name = "Notifiable Case"
        verbose_name_plural = "Notifiable Cases"
        indexes = [
            models.Index(fields=["notification_status"]),
            models.Index(fields=["detected_at"]),
            models.Index(fields=["disease", "notification_status"]),
            models.Index(fields=["county", "notification_status"]),
        ]
        # Prevent duplicate case for same patient/encounter/disease
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "encounter", "disease"],
                name="unique_patient_encounter_disease",
            )
        ]

    def __str__(self) -> str:
        return f"{self.disease.name} - {self.patient} ({self.get_notification_status_display()})"

    def save(self, *args, **kwargs):
        """Calculate notification deadline and auto-resolve tenant on save."""
        if not self.notification_deadline and self.disease:
            self.notification_deadline = self.detected_at + timedelta(
                hours=self.disease.reporting_hours
            )
        if not self.county and self.patient:
            self.county = self.patient.county
            self.sub_county = self.patient.sub_county
        # Auto-resolve tenant from encounter or patient
        if not self.facility_id:
            if self.encounter_id:
                try:
                    enc = self.encounter
                    if enc.facility_id:
                        self.facility_id = enc.facility_id
                        self.organization_id = enc.organization_id
                except Exception:
                    pass
            if not self.facility_id and self.patient_id:
                try:
                    patient = self.patient
                    if patient.registered_at_facility_id:
                        self.facility_id = patient.registered_at_facility_id
                        self.organization_id = patient.organization_id
                except Exception:
                    pass
        if self.facility_id and not self.organization_id:
            try:
                if self.facility and self.facility.organization_id:
                    self.organization_id = self.facility.organization_id
            except Exception:
                pass
        super().save(*args, **kwargs)

    @property
    def is_overdue(self) -> bool:
        """Return True if notification deadline has passed."""
        if not self.notification_deadline:
            return False
        if self.notification_status in [
            NotificationStatus.NOTIFIED,
            NotificationStatus.ACKNOWLEDGED,
            NotificationStatus.INVESTIGATED,
            NotificationStatus.CLOSED,
        ]:
            return False
        return timezone.now() > self.notification_deadline

    @property
    def hours_until_deadline(self) -> int | None:
        """Return hours until notification deadline (negative if overdue)."""
        if not self.notification_deadline:
            return None
        delta = self.notification_deadline - timezone.now()
        return int(delta.total_seconds() / 3600)

    @property
    def is_immediate(self) -> bool:
        """Return True if this is an immediate reportable case."""
        return self.disease.is_immediate if self.disease else False

    def mark_notified(self, user=None) -> None:
        """Mark case as notified to county."""
        self.notification_status = NotificationStatus.NOTIFIED
        self.notified_at = timezone.now()
        if user:
            self.notified_by = user
        self.save(update_fields=["notification_status", "notified_at", "notified_by", "updated_at"])


class SurveillanceAlert(FacilityScopedModel):
    """
    Real-time alert for notifiable disease cases.

    Generated when a new case is detected, especially for immediate
    reportable diseases. Sent via WebSocket to surveillance dashboard
    and optionally via SMS/email to county health officers.

    Attributes:
        case: NotifiableCase that triggered the alert
        alert_type: Type of alert (NEW_CASE, OVERDUE, OUTBREAK)
        is_acknowledged: Whether alert has been seen/acknowledged
        sent_via_sms: Whether SMS was sent
        sent_via_email: Whether email was sent
    """

    class AlertType(models.TextChoices):
        NEW_CASE = "NEW_CASE", "New Case Detected"
        OVERDUE = "OVERDUE", "Notification Overdue"
        OUTBREAK = "OUTBREAK", "Outbreak Threshold Reached"
        CASE_UPDATE = "CASE_UPDATE", "Case Updated"

    case = models.ForeignKey(
        NotifiableCase,
        on_delete=models.CASCADE,
        related_name="alerts",
        help_text="Case that triggered this alert",
    )
    alert_type = models.CharField(
        max_length=20,
        choices=AlertType.choices,
        default=AlertType.NEW_CASE,
    )
    message = models.TextField(
        help_text="Alert message content",
    )
    is_acknowledged = models.BooleanField(
        default=False,
        help_text="Whether alert has been acknowledged",
    )
    acknowledged_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="acknowledged_surveillance_alerts",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    # Notification channels
    sent_via_websocket = models.BooleanField(default=False)
    sent_via_sms = models.BooleanField(default=False)
    sent_via_email = models.BooleanField(default=False)
    sms_recipient_encrypted = models.TextField(default="", blank=True)
    sms_recipient = encrypted_pii_property("sms_recipient")
    email_recipient_encrypted = models.TextField(default="", blank=True)
    email_recipient = encrypted_pii_property("email_recipient")
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Surveillance Alert"
        verbose_name_plural = "Surveillance Alerts"
        indexes = [
            models.Index(fields=["is_acknowledged", "created_at"]),
            models.Index(fields=["alert_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.get_alert_type_display()} - {self.case.disease.name}"

    def save(self, *args, **kwargs):
        """Auto-resolve tenant from parent case."""
        if not self.facility_id and self.case_id:
            try:
                case = self.case
                if case.facility_id:
                    self.facility_id = case.facility_id
            except Exception:
                pass
        super().save(*args, **kwargs)

    def acknowledge(self, user) -> None:
        """Mark alert as acknowledged."""
        self.is_acknowledged = True
        self.acknowledged_by = user
        self.acknowledged_at = timezone.now()
        self.save(update_fields=["is_acknowledged", "acknowledged_by", "acknowledged_at"])


class OutbreakThreshold(models.Model):
    """
    Threshold configuration for outbreak detection.

    Defines per-disease thresholds that trigger outbreak alerts
    when exceeded within a time period for a geographic area.

    Attributes:
        disease: NotifiableDisease to monitor
        county: Specific county (null = all counties)
        case_threshold: Number of cases to trigger outbreak
        period_days: Time period for case counting
    """

    disease = models.ForeignKey(
        NotifiableDisease,
        on_delete=models.CASCADE,
        related_name="thresholds",
        help_text="Disease to monitor",
    )
    county = models.ForeignKey(
        "core.County",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="outbreak_thresholds",
        help_text="County for threshold (null = national)",
    )
    case_threshold = models.PositiveIntegerField(
        default=3,
        validators=[MinValueValidator(1)],
        help_text="Number of cases to trigger outbreak alert",
    )
    period_days = models.PositiveIntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(365)],
        help_text="Period in days for case counting",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether threshold is active",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["disease__name", "county__name"]
        verbose_name = "Outbreak Threshold"
        verbose_name_plural = "Outbreak Thresholds"
        constraints = [
            models.UniqueConstraint(
                fields=["disease", "county"],
                name="unique_disease_county_threshold",
            ),
            models.UniqueConstraint(
                fields=["disease"],
                condition=models.Q(county__isnull=True),
                name="unique_disease_national_threshold",
            ),
        ]

    def __str__(self) -> str:
        county_name = self.county.name if self.county else "National"
        return f"{self.disease.name} - {county_name}: {self.case_threshold} cases / {self.period_days} days"

    def check_threshold(self) -> tuple[bool, int]:
        """
        Check if outbreak threshold is exceeded.

        Returns:
            Tuple of (is_exceeded, current_count)
        """
        from django.utils import timezone

        cutoff = timezone.now() - timedelta(days=self.period_days)

        cases = NotifiableCase.objects.filter(
            disease=self.disease,
            detected_at__gte=cutoff,
        )

        if self.county:
            cases = cases.filter(county=self.county)

        count = cases.count()
        return (count >= self.case_threshold, count)


class IDSRReportStatus(models.TextChoices):
    """Status of IDSR weekly report."""

    DRAFT = "DRAFT", "Draft"
    PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
    APPROVED = "APPROVED", "Approved"
    SUBMITTED = "SUBMITTED", "Submitted to DHIS2"
    FAILED = "FAILED", "Submission Failed"


class IDSRWeeklyReport(models.Model):
    """
    Integrated Disease Surveillance and Response (IDSR) Weekly Report.

    Aggregates notifiable disease cases by epidemiological week for
    submission to county health offices and DHIS2/KHIS.

    Epidemiological weeks follow ISO 8601 standard:
    - Week 1 contains the first Thursday of the year
    - Weeks run Monday to Sunday

    Attributes:
        epi_year: Epidemiological year
        epi_week: Epidemiological week number (1-53)
        facility: Healthcare facility (facility code from settings)
        county: County for reporting/routing
        status: Report workflow status
        generated_at: When report was auto-generated
        submitted_at: When submitted to DHIS2
    """

    # Epidemiological week identification
    epi_year = models.PositiveIntegerField(
        help_text="Epidemiological year (ISO 8601)",
    )
    epi_week = models.PositiveIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(53)],
        help_text="Epidemiological week number (1-53)",
    )
    week_start_date = models.DateField(
        help_text="Monday of the epidemiological week",
    )
    week_end_date = models.DateField(
        help_text="Sunday of the epidemiological week",
    )

    # Tenant scoping
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="idsr_weekly_reports",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility_ref = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="idsr_weekly_reports",
        null=True,
        blank=True,
        help_text="Facility FK for tenant scoping.",
    )

    # Legacy facility identification (kept for DHIS2 reporting)
    facility_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="MFL code or facility identifier",
    )
    facility_name = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text="Facility name at time of report generation",
    )

    # County for reporting
    county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="idsr_weekly_reports",
        help_text="County health office for submission",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="idsr_weekly_reports",
        help_text="Sub-county for detailed reporting",
    )

    # Summary statistics
    total_cases = models.PositiveIntegerField(
        default=0,
        help_text="Total notifiable cases reported this week",
    )
    total_deaths = models.PositiveIntegerField(
        default=0,
        help_text="Total deaths from notifiable diseases this week",
    )
    immediate_cases = models.PositiveIntegerField(
        default=0,
        help_text="Cases of immediate reportable diseases",
    )
    lab_confirmed_cases = models.PositiveIntegerField(
        default=0,
        help_text="Laboratory confirmed cases",
    )

    # Outbreak indicators
    outbreak_declared = models.BooleanField(
        default=False,
        help_text="Whether outbreak was declared this week",
    )
    outbreak_diseases = models.TextField(
        blank=True,
        default="",
        help_text="Comma-separated list of outbreak diseases",
    )

    # Report workflow
    status = models.CharField(
        max_length=20,
        choices=IDSRReportStatus.choices,
        default=IDSRReportStatus.DRAFT,
        help_text="Report workflow status",
    )
    generated_at = models.DateTimeField(
        auto_now_add=True,
        help_text="When report was auto-generated",
    )
    generated_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_idsr_reports",
        help_text="User or system that generated the report",
    )
    reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When report was reviewed",
    )
    reviewed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_idsr_reports",
        help_text="User who reviewed the report",
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When report was approved",
    )
    approved_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_idsr_reports",
        help_text="User who approved the report",
    )

    # DHIS2 submission tracking
    dhis2_submitted_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When submitted to DHIS2",
    )
    dhis2_response = models.JSONField(
        null=True,
        blank=True,
        help_text="DHIS2 API response",
    )
    dhis2_import_summary = models.JSONField(
        null=True,
        blank=True,
        help_text="DHIS2 import summary (imported, updated, ignored counts)",
    )

    # Notes and comments
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes or comments",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-epi_year", "-epi_week"]
        verbose_name = "IDSR Weekly Report"
        verbose_name_plural = "IDSR Weekly Reports"
        constraints = [
            models.UniqueConstraint(
                fields=["epi_year", "epi_week", "facility_code"],
                name="unique_idsr_week_facility",
            )
        ]
        indexes = [
            models.Index(fields=["epi_year", "epi_week"]),
            models.Index(fields=["status"]),
            models.Index(fields=["county"]),
        ]

    def __str__(self) -> str:
        return f"IDSR Week {self.epi_week}/{self.epi_year} - {self.facility_name or self.facility_code}"

    def save(self, *args, **kwargs):
        """Auto-resolve tenant and populate facility_code/name."""
        if self.facility_ref_id:
            try:
                fac = self.facility_ref
                if not self.facility_code and fac.mfl_code:
                    self.facility_code = fac.mfl_code
                if not self.facility_name and fac.name:
                    self.facility_name = fac.name
                if not self.organization_id and fac.organization_id:
                    self.organization_id = fac.organization_id
            except Exception:
                pass
        super().save(*args, **kwargs)

    @property
    def is_submitted(self) -> bool:
        """Return True if report has been submitted to DHIS2."""
        return self.status == IDSRReportStatus.SUBMITTED

    @property
    def can_edit(self) -> bool:
        """Return True if report can still be edited."""
        return self.status in [IDSRReportStatus.DRAFT, IDSRReportStatus.PENDING_REVIEW]

    @property
    def week_label(self) -> str:
        """Return formatted week label (e.g., 'W08 2026')."""
        return f"W{self.epi_week:02d} {self.epi_year}"

    def approve(self, user) -> None:
        """Approve the report for submission."""
        self.status = IDSRReportStatus.APPROVED
        self.approved_at = timezone.now()
        self.approved_by = user
        self.save(update_fields=["status", "approved_at", "approved_by", "updated_at"])

    def mark_submitted(self, dhis2_response: dict | None = None) -> None:
        """Mark report as submitted to DHIS2."""
        self.status = IDSRReportStatus.SUBMITTED
        self.dhis2_submitted_at = timezone.now()
        if dhis2_response:
            self.dhis2_response = dhis2_response
            self.dhis2_import_summary = dhis2_response.get("importSummary")
        self.save(
            update_fields=[
                "status",
                "dhis2_submitted_at",
                "dhis2_response",
                "dhis2_import_summary",
                "updated_at",
            ]
        )

    def mark_failed(self, error_response: dict | None = None) -> None:
        """Mark report submission as failed."""
        self.status = IDSRReportStatus.FAILED
        if error_response:
            self.dhis2_response = error_response
        self.save(update_fields=["status", "dhis2_response", "updated_at"])


class IDSRDiseaseSummary(models.Model):
    """
    Per-disease summary within an IDSR Weekly Report.

    Contains case counts, deaths, and lab confirmation status
    for each notifiable disease reported in the week.

    Attributes:
        report: Parent IDSRWeeklyReport
        disease: NotifiableDisease reference
        cases: Number of cases reported
        deaths: Number of deaths
        lab_confirmed: Number of lab-confirmed cases
    """

    report = models.ForeignKey(
        IDSRWeeklyReport,
        on_delete=models.CASCADE,
        related_name="disease_summaries",
        help_text="Parent weekly report",
    )
    disease = models.ForeignKey(
        NotifiableDisease,
        on_delete=models.PROTECT,
        related_name="idsr_summaries",
        help_text="Notifiable disease",
    )

    # Case counts
    cases_under_5 = models.PositiveIntegerField(
        default=0,
        help_text="Cases in children under 5 years",
    )
    cases_5_and_above = models.PositiveIntegerField(
        default=0,
        help_text="Cases in patients 5 years and above",
    )
    total_cases = models.PositiveIntegerField(
        default=0,
        help_text="Total cases (auto-calculated)",
    )

    # Deaths
    deaths_under_5 = models.PositiveIntegerField(
        default=0,
        help_text="Deaths in children under 5 years",
    )
    deaths_5_and_above = models.PositiveIntegerField(
        default=0,
        help_text="Deaths in patients 5 years and above",
    )
    total_deaths = models.PositiveIntegerField(
        default=0,
        help_text="Total deaths (auto-calculated)",
    )

    # Lab confirmation
    lab_confirmed = models.PositiveIntegerField(
        default=0,
        help_text="Number of laboratory confirmed cases",
    )

    # Case fatality rate (CFR)
    case_fatality_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="CFR percentage (deaths/cases * 100)",
    )

    # Outbreak flag
    is_outbreak = models.BooleanField(
        default=False,
        help_text="Whether this disease is in outbreak status",
    )

    # Notes
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Disease-specific notes or investigation status",
    )

    class Meta:
        ordering = ["disease__name"]
        verbose_name = "IDSR Disease Summary"
        verbose_name_plural = "IDSR Disease Summaries"
        constraints = [
            models.UniqueConstraint(
                fields=["report", "disease"],
                name="unique_report_disease_summary",
            )
        ]

    def __str__(self) -> str:
        return f"{self.disease.name}: {self.total_cases} cases, {self.total_deaths} deaths"

    def save(self, *args, **kwargs):
        """Calculate totals and CFR on save."""
        self.total_cases = self.cases_under_5 + self.cases_5_and_above
        self.total_deaths = self.deaths_under_5 + self.deaths_5_and_above
        if self.total_cases > 0 and self.total_deaths > 0:
            from decimal import Decimal

            self.case_fatality_rate = (
                Decimal(self.total_deaths) / Decimal(self.total_cases) * Decimal("100")
            )
        else:
            self.case_fatality_rate = None
        super().save(*args, **kwargs)


class IHRUrgency(models.TextChoices):
    """
    IHR notification urgency level based on WHO IHR (2005) Article 12.

    EMERGENCY: Public Health Emergency of International Concern (PHEIC)
    URGENT: Requires urgent assessment and notification within 24 hours
    ROUTINE: Requires notification but less time-critical
    """

    EMERGENCY = "EMERGENCY", "Public Health Emergency (PHEIC)"
    URGENT = "URGENT", "Urgent (within 24 hours)"
    ROUTINE = "ROUTINE", "Routine IHR Notification"


class IHRNotificationStatus(models.TextChoices):
    """
    Status of an IHR notification through the escalation pipeline.

    DRAFT: Initial assessment being prepared
    PENDING_REVIEW: Awaiting senior clinical/epidemiological review
    SUBMITTED_COUNTY: Submitted to County Disease Surveillance Coordinator
    ESCALATED_NATIONAL: Escalated to MOH National IHR Focal Point
    NOTIFIED_WHO: WHO IHR Contact Point notified
    ACKNOWLEDGED: WHO has acknowledged receipt
    CLOSED: Notification resolved/closed
    REJECTED: Notification rejected (not IHR-reportable upon review)
    """

    DRAFT = "DRAFT", "Draft"
    PENDING_REVIEW = "PENDING_REVIEW", "Pending Review"
    SUBMITTED_COUNTY = "SUBMITTED_COUNTY", "Submitted to County"
    ESCALATED_NATIONAL = "ESCALATED_NATIONAL", "Escalated to MOH"
    NOTIFIED_WHO = "NOTIFIED_WHO", "Notified to WHO"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged by WHO"
    CLOSED = "CLOSED", "Closed"
    REJECTED = "REJECTED", "Rejected"


class IHRNotification(FacilityScopedModel):
    """
    International Health Regulations (2005) notification record.

    Tracks the lifecycle of IHR-notifiable events from detection
    through facility → county → MOH → WHO escalation pathway.

    Per WHO IHR Article 6, State Parties must assess and notify WHO
    within 24 hours of events that may constitute a PHEIC using the
    Annex 2 decision instrument.

    Attributes:
        disease: NotifiableDisease (must have is_ihr_notifiable=True)
        case: Source NotifiableCase that triggered IHR assessment
        event_description: Description of the public health event
        urgency: IHR urgency classification
        status: Notification workflow status
        annex2_criteria: JSON storing Annex 2 decision instrument answers
    """

    # Source reference
    disease = models.ForeignKey(
        NotifiableDisease,
        on_delete=models.PROTECT,
        related_name="ihr_notifications",
        help_text="IHR-notifiable disease",
    )
    case = models.ForeignKey(
        NotifiableCase,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_notifications",
        help_text="Source notifiable case (if triggered by specific case)",
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_notifications",
        help_text="Index patient (if applicable)",
    )

    # Event details
    event_description = models.TextField(
        help_text="Description of the public health event",
    )
    event_date = models.DateField(
        help_text="Date the event was detected/identified",
    )
    urgency = models.CharField(
        max_length=20,
        choices=IHRUrgency.choices,
        default=IHRUrgency.URGENT,
        help_text="IHR urgency classification",
    )

    # WHO IHR Annex 2 Decision Instrument
    annex2_criteria = models.JSONField(
        default=dict,
        blank=True,
        help_text="Annex 2 decision instrument responses (JSON)",
    )
    is_annex2_positive = models.BooleanField(
        default=False,
        help_text="Whether event meets Annex 2 criteria for WHO notification",
    )

    # Epidemiological context
    cases_count = models.PositiveIntegerField(
        default=1,
        help_text="Total cases associated with event",
    )
    deaths_count = models.PositiveIntegerField(
        default=0,
        help_text="Deaths associated with event",
    )
    affected_area = models.TextField(
        blank=True,
        default="",
        help_text="Description of affected geographic area",
    )

    # Location
    county = models.ForeignKey(
        "core.County",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_notifications",
        help_text="County where event detected",
    )
    sub_county = models.ForeignKey(
        "core.SubCounty",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_notifications",
        help_text="Sub-county where event detected",
    )

    # Notification workflow status
    status = models.CharField(
        max_length=25,
        choices=IHRNotificationStatus.choices,
        default=IHRNotificationStatus.DRAFT,
        help_text="Current notification pipeline status",
    )

    # Facility-level reporting
    reported_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="ihr_notifications_reported",
        help_text="Staff who initiated the IHR notification",
    )
    report_date = models.DateTimeField(
        default=timezone.now,
        help_text="When the notification was first reported",
    )

    # County-level escalation
    county_notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When County Disease Surveillance Coordinator was notified",
    )
    county_reviewed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_county_reviews",
        help_text="County officer who reviewed",
    )
    county_notes = models.TextField(
        blank=True,
        default="",
        help_text="County review notes",
    )

    # National MOH escalation
    national_notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When MOH National IHR Focal Point was notified",
    )
    national_reviewed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ihr_national_reviews",
        help_text="MOH officer who reviewed",
    )
    national_notes = models.TextField(
        blank=True,
        default="",
        help_text="MOH review notes",
    )

    # WHO notification
    who_notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When WHO IHR Contact Point was notified",
    )
    who_reference_number = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="WHO reference/event ID",
    )
    who_acknowledged_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When WHO acknowledged receipt",
    )

    # Resolution
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When notification was resolved/closed",
    )
    resolution_notes = models.TextField(
        blank=True,
        default="",
        help_text="Resolution summary",
    )

    # Risk assessment
    risk_assessment = models.TextField(
        blank=True,
        default="",
        help_text="Public health risk assessment summary",
    )
    response_measures = models.TextField(
        blank=True,
        default="",
        help_text="Response measures taken",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-report_date"]
        verbose_name = "IHR Notification"
        verbose_name_plural = "IHR Notifications"
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["urgency", "status"]),
            models.Index(fields=["disease", "status"]),
            models.Index(fields=["report_date"]),
        ]
        permissions = [
            ("escalate_ihr_to_county", "Can escalate IHR notification to county"),
            ("escalate_ihr_to_national", "Can escalate IHR notification to MOH"),
            ("notify_ihr_to_who", "Can notify WHO of IHR event"),
        ]

    def __str__(self) -> str:
        return (
            f"IHR-{self.id:04d}: {self.disease.name} - "
            f"{self.get_status_display()} ({self.get_urgency_display()})"
        )

    def save(self, *args, **kwargs):
        """Auto-populate county and tenant from case or patient on save."""
        if not self.county:
            if self.case and self.case.county:
                self.county = self.case.county
                self.sub_county = self.case.sub_county
            elif self.patient and self.patient.county:
                self.county = self.patient.county
                self.sub_county = self.patient.sub_county
        # Auto-resolve tenant from case or patient
        if not self.facility_id:
            if self.case_id:
                try:
                    case = self.case
                    if case.facility_id:
                        self.facility_id = case.facility_id
                        self.organization_id = case.organization_id
                except Exception:
                    pass
            if not self.facility_id and self.patient_id:
                try:
                    patient = self.patient
                    if patient.registered_at_facility_id:
                        self.facility_id = patient.registered_at_facility_id
                        self.organization_id = patient.organization_id
                except Exception:
                    pass
        if self.facility_id and not self.organization_id:
            try:
                if self.facility and self.facility.organization_id:
                    self.organization_id = self.facility.organization_id
            except Exception:
                pass
        super().save(*args, **kwargs)

    @property
    def notification_reference(self) -> str:
        """Return formatted IHR notification reference."""
        return f"IHR-{self.id:04d}" if self.id else "IHR-DRAFT"

    @property
    def is_escalated(self) -> bool:
        """Return True if notification has been escalated beyond facility."""
        return self.status not in [
            IHRNotificationStatus.DRAFT,
            IHRNotificationStatus.PENDING_REVIEW,
            IHRNotificationStatus.REJECTED,
        ]

    @property
    def is_who_notified(self) -> bool:
        """Return True if WHO has been notified."""
        return self.status in [
            IHRNotificationStatus.NOTIFIED_WHO,
            IHRNotificationStatus.ACKNOWLEDGED,
            IHRNotificationStatus.CLOSED,
        ]

    @property
    def hours_since_detection(self) -> int | None:
        """Return hours since event detection (for 24h compliance tracking)."""
        if not self.report_date:
            return None
        delta = timezone.now() - self.report_date
        return int(delta.total_seconds() / 3600)

    @property
    def is_overdue(self) -> bool:
        """Return True if 24h notification window has passed without WHO notification."""
        if self.is_who_notified or self.status == IHRNotificationStatus.REJECTED:
            return False
        if self.status == IHRNotificationStatus.CLOSED:
            return False
        hours = self.hours_since_detection
        return hours is not None and hours > 24

    def submit_to_county(self, user=None, notes: str = "") -> None:
        """Submit notification to County Disease Surveillance Coordinator."""
        self.status = IHRNotificationStatus.SUBMITTED_COUNTY
        self.county_notified_at = timezone.now()
        if user:
            self.county_reviewed_by = user
        if notes:
            self.county_notes = notes
        self.save(
            update_fields=[
                "status",
                "county_notified_at",
                "county_reviewed_by",
                "county_notes",
                "updated_at",
            ]
        )

    def escalate_to_national(self, user=None, notes: str = "") -> None:
        """Escalate notification to MOH National IHR Focal Point."""
        self.status = IHRNotificationStatus.ESCALATED_NATIONAL
        self.national_notified_at = timezone.now()
        if user:
            self.national_reviewed_by = user
        if notes:
            self.national_notes = notes
        self.save(
            update_fields=[
                "status",
                "national_notified_at",
                "national_reviewed_by",
                "national_notes",
                "updated_at",
            ]
        )

    def notify_who(self, reference_number: str = "") -> None:
        """Mark as notified to WHO."""
        self.status = IHRNotificationStatus.NOTIFIED_WHO
        self.who_notified_at = timezone.now()
        if reference_number:
            self.who_reference_number = reference_number
        self.save(
            update_fields=[
                "status",
                "who_notified_at",
                "who_reference_number",
                "updated_at",
            ]
        )

    def acknowledge_who(self) -> None:
        """Mark WHO acknowledgement."""
        self.status = IHRNotificationStatus.ACKNOWLEDGED
        self.who_acknowledged_at = timezone.now()
        self.save(update_fields=["status", "who_acknowledged_at", "updated_at"])

    def close(self, notes: str = "") -> None:
        """Close the IHR notification."""
        self.status = IHRNotificationStatus.CLOSED
        self.resolved_at = timezone.now()
        if notes:
            self.resolution_notes = notes
        self.save(update_fields=["status", "resolved_at", "resolution_notes", "updated_at"])

    def reject(self, user=None, notes: str = "") -> None:
        """Reject the IHR notification (not IHR-reportable upon review)."""
        self.status = IHRNotificationStatus.REJECTED
        self.resolved_at = timezone.now()
        if notes:
            self.resolution_notes = notes
        self.save(update_fields=["status", "resolved_at", "resolution_notes", "updated_at"])


class IndicatorType(models.TextChoices):
    """DHIS2 indicator types for age/outcome disaggregation."""

    CASES_UNDER_5 = "cases_under_5", "Cases Under 5 Years"
    CASES_5_AND_ABOVE = "cases_5_and_above", "Cases 5 Years and Above"
    DEATHS_UNDER_5 = "deaths_under_5", "Deaths Under 5 Years"
    DEATHS_5_AND_ABOVE = "deaths_5_and_above", "Deaths 5 Years and Above"


class DHIS2Environment(models.TextChoices):
    """DHIS2 environment for mapping (allows different UIDs per environment)."""

    LOCAL = "local", "Local Development"
    STAGING = "staging", "Staging/UAT"
    PRODUCTION = "production", "Production (KHIS)"


class DHIS2DataElementMapping(models.Model):
    """
    Mapping between NotifiableDisease and DHIS2 Data Element UIDs.

    Allows managing DHIS2 data element mappings via Django admin,
    supporting different UIDs per environment (local, staging, production).

    For expandability, new diseases can be mapped without code changes
    by adding records via Django admin or data import.

    Attributes:
        disease: Reference to NotifiableDisease
        indicator_type: Type of indicator (cases_under_5, etc.)
        environment: Target DHIS2 environment
        data_element_uid: DHIS2 Data Element UID (11 chars)
        short_name: DHIS2 short name for reference
        is_active: Whether this mapping is active

    Example:
        disease="Cholera", indicator_type="cases_under_5",
        environment="local", data_element_uid="jOdkuwpQGKX"
    """

    disease = models.ForeignKey(
        NotifiableDisease,
        on_delete=models.CASCADE,
        related_name="dhis2_mappings",
        help_text="Notifiable disease to map",
    )
    indicator_type = models.CharField(
        max_length=30,
        choices=IndicatorType.choices,
        help_text="Age/outcome indicator type",
    )
    environment = models.CharField(
        max_length=20,
        choices=DHIS2Environment.choices,
        default=DHIS2Environment.LOCAL,
        help_text="DHIS2 environment (local/staging/production)",
    )
    data_element_uid = models.CharField(
        max_length=11,
        help_text="DHIS2 Data Element UID (11 characters)",
    )
    short_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="DHIS2 short name for reference (e.g., IDSR_CHOLERA_U5_CASES)",
    )
    is_active = models.BooleanField(
        default=True,
        help_text="Whether this mapping is currently active",
    )
    notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional notes or KHIS mapping references",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["disease__name", "indicator_type", "environment"]
        verbose_name = "DHIS2 Data Element Mapping"
        verbose_name_plural = "DHIS2 Data Element Mappings"
        constraints = [
            models.UniqueConstraint(
                fields=["disease", "indicator_type", "environment"],
                name="unique_disease_indicator_environment",
            )
        ]
        indexes = [
            models.Index(fields=["environment", "is_active"]),
            models.Index(fields=["data_element_uid"]),
        ]

    def __str__(self) -> str:
        return f"{self.disease.name} - {self.get_indicator_type_display()} ({self.environment})"

    @classmethod
    def get_uid(
        cls,
        disease_name: str,
        indicator_type: str,
        environment: str = "local",
    ) -> str | None:
        """
        Get DHIS2 data element UID for a disease indicator.

        Args:
            disease_name: Disease name (case-insensitive)
            indicator_type: One of IndicatorType values
            environment: DHIS2 environment (local, staging, production)

        Returns:
            Data element UID or None if not mapped
        """
        try:
            mapping = cls.objects.get(
                disease__name__iexact=disease_name,
                indicator_type=indicator_type,
                environment=environment,
                is_active=True,
            )
            return mapping.data_element_uid
        except cls.DoesNotExist:
            return None

    @classmethod
    def get_all_mappings(cls, environment: str = "local") -> dict:
        """
        Get all active mappings for an environment as a dictionary.

        Returns:
            Dict in format: {disease_name_lower: {indicator_type: uid}}
        """
        mappings = cls.objects.filter(
            environment=environment,
            is_active=True,
        ).select_related("disease")

        result: dict[str, dict[str, str]] = {}
        for m in mappings:
            key = m.disease.name.lower().replace(" ", "_")
            if key not in result:
                result[key] = {}
            result[key][m.indicator_type] = m.data_element_uid

        return result

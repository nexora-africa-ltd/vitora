"""
Clinical Decision Support (CDS) Models.

Provides a rule-driven clinical decision support engine for:
- Drug-allergy interaction alerts
- Critical lab value alerts
- Vital sign abnormality detection
- Drug-drug interaction warnings
- Guideline-based care recommendations

Compliant with:
- DHA Digital Health Standards (evidence-based CDS)
- Kenya clinical practice guidelines
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.mixins import FacilityScopedModel

# ──────────────────────────── TextChoices ────────────────────────────


class CDSRuleCategory(models.TextChoices):
    """Categories of CDS rules."""

    DRUG_ALLERGY = "DRUG_ALLERGY", "Drug-Allergy Interaction"
    DRUG_DRUG = "DRUG_DRUG", "Drug-Drug Interaction"
    CRITICAL_LAB = "CRITICAL_LAB", "Critical Lab Value"
    VITAL_SIGN = "VITAL_SIGN", "Vital Sign Alert"
    GUIDELINE = "GUIDELINE", "Clinical Guideline"
    PREVENTIVE = "PREVENTIVE", "Preventive Care"
    DOSAGE = "DOSAGE", "Dosage Check"


class CDSRulePriority(models.TextChoices):
    """Priority/severity of a CDS rule."""

    CRITICAL = "CRITICAL", "Critical"
    HIGH = "HIGH", "High"
    MEDIUM = "MEDIUM", "Medium"
    LOW = "LOW", "Low"
    INFO = "INFO", "Informational"


class CDSEvidenceLevel(models.TextChoices):
    """Evidence level supporting a CDS rule."""

    LEVEL_A = "A", "Level A — Strong evidence"
    LEVEL_B = "B", "Level B — Moderate evidence"
    LEVEL_C = "C", "Level C — Limited evidence"
    LEVEL_D = "D", "Level D — Expert consensus"


class CDSRuleStatus(models.TextChoices):
    """Lifecycle status of a CDS rule."""

    DRAFT = "DRAFT", "Draft"
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"
    RETIRED = "RETIRED", "Retired"


class CDSAlertStatus(models.TextChoices):
    """Status of a generated CDS alert."""

    PENDING = "PENDING", "Pending"
    ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
    ACCEPTED = "ACCEPTED", "Accepted"
    OVERRIDDEN = "OVERRIDDEN", "Overridden"
    DISMISSED = "DISMISSED", "Dismissed"
    AUTO_RESOLVED = "AUTO_RESOLVED", "Auto-Resolved"


class CDSActionType(models.TextChoices):
    """Type of action recommended by a CDS rule."""

    ALERT = "ALERT", "Show Alert"
    CONTRAINDICATE = "CONTRAINDICATE", "Contraindicate"
    WARN = "WARN", "Warn"
    SUGGEST = "SUGGEST", "Suggest"
    REQUIRE = "REQUIRE", "Require Action"
    INFORM = "INFORM", "Inform"


# ──────────────────────────── Models ────────────────────────────


class CDSRule(models.Model):
    """
    A clinical decision support rule definition.

    Rules are stored as JSON logic conditions that can be evaluated
    against patient context (vitals, allergies, medications, lab results).

    Attributes:
        code: Unique rule identifier (e.g., "DRUG-ALLERGY-001")
        name: Human-readable rule name
        description: Detailed rule description
        category: Category of rule (drug-allergy, vital sign, etc.)
        priority: Severity/priority level
        evidence_level: Strength of evidence supporting this rule
        status: Lifecycle status (draft, active, inactive, retired)
        condition: JSON logic defining when this rule triggers
        action_type: What action to recommend when triggered
        action_message: Template message to display
        suggestion: Recommended clinical action
        references: JSON list of clinical references/guidelines
        metadata: Additional rule configuration as JSON
        created_by: User who created the rule
        approved_by: User who approved/activated the rule
        approved_at: Timestamp of approval
    """

    # Identification
    code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique rule code (e.g., DRUG-ALLERGY-001)",
    )
    name = models.CharField(
        max_length=255,
        help_text="Human-readable rule name",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed description of what this rule checks",
    )

    # Classification
    category = models.CharField(
        max_length=20,
        choices=CDSRuleCategory.choices,
        help_text="Category of clinical decision support rule",
    )
    priority = models.CharField(
        max_length=10,
        choices=CDSRulePriority.choices,
        default=CDSRulePriority.MEDIUM,
        help_text="Priority/severity when triggered",
    )
    evidence_level = models.CharField(
        max_length=5,
        choices=CDSEvidenceLevel.choices,
        default=CDSEvidenceLevel.LEVEL_D,
        help_text="Evidence level supporting this rule",
    )

    # Status
    status = models.CharField(
        max_length=10,
        choices=CDSRuleStatus.choices,
        default=CDSRuleStatus.DRAFT,
        help_text="Lifecycle status",
    )

    # Rule Logic — JSON-based condition and action
    condition = models.JSONField(
        help_text=(
            "JSON logic condition. Keys: 'type' (vital_range|drug_allergy|"
            "drug_drug|lab_range|custom), plus type-specific fields."
        ),
    )
    action_type = models.CharField(
        max_length=20,
        choices=CDSActionType.choices,
        default=CDSActionType.ALERT,
        help_text="Type of action when rule triggers",
    )
    action_message = models.TextField(
        help_text="Message template shown when rule triggers. Supports {variable} placeholders.",
    )
    suggestion = models.TextField(
        blank=True,
        default="",
        help_text="Recommended clinical action",
    )

    # Evidence & References
    references = models.JSONField(
        default=list,
        blank=True,
        help_text="List of clinical references/guidelines supporting this rule",
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional rule configuration (thresholds, parameters)",
    )

    # Audit
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cds_rules_created",
        help_text="User who created this rule",
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cds_rules_approved",
        help_text="User who approved/activated this rule",
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the rule was approved/activated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-priority", "category", "name"]
        verbose_name = "CDS Rule"
        verbose_name_plural = "CDS Rules"
        indexes = [
            models.Index(fields=["category", "status"]),
            models.Index(fields=["status", "priority"]),
            models.Index(fields=["code"]),
        ]

    def __str__(self) -> str:
        return f"[{self.code}] {self.name}"

    # ─── State-transition methods ───

    def activate(self, user: Any = None) -> None:
        """Activate a draft or inactive rule."""
        self.status = CDSRuleStatus.ACTIVE
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])

    def deactivate(self) -> None:
        """Deactivate an active rule."""
        self.status = CDSRuleStatus.INACTIVE
        self.save(update_fields=["status", "updated_at"])

    def retire(self) -> None:
        """Permanently retire a rule."""
        self.status = CDSRuleStatus.RETIRED
        self.save(update_fields=["status", "updated_at"])

    # ─── Properties ───

    @property
    def is_active(self) -> bool:
        return self.status == CDSRuleStatus.ACTIVE

    @property
    def trigger_count(self) -> int:
        """Number of alerts generated by this rule."""
        return self.alerts.count()

    @property
    def override_rate(self) -> float | None:
        """Percentage of alerts that were overridden (None if no alerts)."""
        total = self.alerts.count()
        if total == 0:
            return None
        overridden = self.alerts.filter(status=CDSAlertStatus.OVERRIDDEN).count()
        return round((overridden / total) * 100, 1)


class CDSAlert(FacilityScopedModel):
    """
    A clinical decision support alert generated by rule evaluation.

    Created when a CDS rule fires against a patient context (encounter,
    prescription, lab result, etc.).

    Attributes:
        rule: The CDS rule that triggered this alert
        patient: The patient this alert is about
        encounter: The encounter context (optional)
        priority: Inherited from rule at creation time
        status: Current alert status (pending, acknowledged, overridden, etc.)
        message: The rendered alert message
        details: JSON with evaluation context (values that triggered)
        override_reason: Reason if clinician overrode the alert
        resolved_by: User who resolved/acknowledged
        resolved_at: When the alert was resolved
    """

    # Source
    rule = models.ForeignKey(
        CDSRule,
        on_delete=models.CASCADE,
        related_name="alerts",
        help_text="CDS rule that generated this alert",
    )

    # Context
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="cds_alerts",
        help_text="Patient this alert is for",
    )
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cds_alerts",
        help_text="Encounter context (if applicable)",
    )

    # Alert content
    priority = models.CharField(
        max_length=10,
        choices=CDSRulePriority.choices,
        help_text="Priority (copied from rule at trigger time)",
    )
    status = models.CharField(
        max_length=15,
        choices=CDSAlertStatus.choices,
        default=CDSAlertStatus.PENDING,
        help_text="Current alert status",
    )
    message = models.TextField(
        help_text="Rendered alert message",
    )
    suggestion = models.TextField(
        blank=True,
        default="",
        help_text="Recommended action (copied from rule)",
    )
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Evaluation context — values that triggered the alert",
    )

    # Resolution
    override_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason provided when overriding the alert",
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cds_alerts_resolved",
        help_text="User who resolved this alert",
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the alert was resolved",
    )
    triggered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cds_alerts_triggered",
        help_text="User whose action triggered this alert",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "CDS Alert"
        verbose_name_plural = "CDS Alerts"
        indexes = [
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["encounter", "status"]),
            models.Index(fields=["status", "priority"]),
            models.Index(fields=["rule", "status"]),
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return f"Alert [{self.rule.code}] for {self.patient} — {self.get_status_display()}"

    # ─── State-transition methods ───

    def acknowledge(self, user: Any = None) -> None:
        """Mark the alert as acknowledged."""
        self.status = CDSAlertStatus.ACKNOWLEDGED
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    def accept(self, user: Any = None) -> None:
        """Accept the recommendation."""
        self.status = CDSAlertStatus.ACCEPTED
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    def override(self, user: Any = None, reason: str = "") -> None:
        """Override the alert with a clinical reason."""
        self.status = CDSAlertStatus.OVERRIDDEN
        self.override_reason = reason
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save(
            update_fields=[
                "status",
                "override_reason",
                "resolved_by",
                "resolved_at",
                "updated_at",
            ]
        )

    def dismiss(self, user: Any = None) -> None:
        """Dismiss the alert."""
        self.status = CDSAlertStatus.DISMISSED
        self.resolved_by = user
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_by", "resolved_at", "updated_at"])

    def auto_resolve(self) -> None:
        """Automatically resolve — condition no longer applies."""
        self.status = CDSAlertStatus.AUTO_RESOLVED
        self.resolved_at = timezone.now()
        self.save(update_fields=["status", "resolved_at", "updated_at"])

    # ─── Properties ───

    @property
    def is_pending(self) -> bool:
        return self.status == CDSAlertStatus.PENDING

    @property
    def is_resolved(self) -> bool:
        return self.status in (
            CDSAlertStatus.ACKNOWLEDGED,
            CDSAlertStatus.ACCEPTED,
            CDSAlertStatus.OVERRIDDEN,
            CDSAlertStatus.DISMISSED,
            CDSAlertStatus.AUTO_RESOLVED,
        )

    @property
    def is_critical(self) -> bool:
        return self.priority == CDSRulePriority.CRITICAL

    @property
    def age_hours(self) -> float | None:
        """Hours since the alert was created."""
        if not self.created_at:
            return None
        delta = timezone.now() - self.created_at
        return round(delta.total_seconds() / 3600, 1)

    @property
    def rule_code(self) -> str:
        return self.rule.code

    @property
    def rule_name(self) -> str:
        return self.rule.name

    @property
    def patient_name(self) -> str:
        return f"{self.patient.first_name} {self.patient.last_name}"

    @property
    def patient_mrn(self) -> str:
        return self.patient.mrn

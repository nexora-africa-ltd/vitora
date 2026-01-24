# Procedures Module Implementation Plan

**Version**: 1.0
**Created**: January 24, 2026
**Status**: Proposed
**Target Phase**: Phase 2 (Sprint 2.3-2.4)

---

## Executive Summary

This document outlines the implementation plan for a standalone **Procedures Module** in Vitora HMIS. The module handles discrete clinical actions (circumcision, wound care, minor surgery, eye irrigation, etc.) that are distinct from diagnoses and require proper consent tracking, consumable usage, outcome documentation, and billing.

### Why a Separate Module?

| Aspect | Current State | Procedures Module |
|--------|---------------|-------------------|
| **Tracking** | Procedures mentioned in notes only | Structured procedure records with outcomes |
| **Consent** | Patient-level consent only | Procedure-specific consent with witness |
| **Consumables** | Manual stock adjustment | Auto-deduct from pharmacy inventory |
| **Billing** | Manual service charges | Auto-generate billing from procedure catalog |
| **Outcomes** | Not tracked | Structured outcome tracking (success/complication) |
| **Follow-up** | Manual scheduling | Auto-schedule based on procedure type |
| **Reporting** | Not possible | DHIS2 service counts, SHA claims |

---

## 1. Architecture Overview

### 1.1 Module Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PROCEDURE WORKFLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Encounter/ClinicVisit → Order → Consent → Perform → Outcome → Follow-up   │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │  Encounter   │───▶│ProcedureOrder│───▶│ ProcedureLog │                  │
│  │   (exists)   │    │    (NEW)     │    │    (NEW)     │                  │
│  └──────────────┘    └──────┬───────┘    └──────┬───────┘                  │
│                             │                    │                          │
│         ┌───────────────────┴────────────────────┴─────────┐               │
│         │                                                   │               │
│         ▼                                                   ▼               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Consent    │    │ Consumables  │    │   Outcome    │                  │
│  │    (NEW)     │    │    Used      │    │    (NEW)     │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Model Hierarchy

```
ProcedureCatalog (Reference Data)
├── ProcedureConsent (Per-procedure consent record)
├── ProcedureOrder (Request/Order)
│   └── ProcedureLog (Performance Record)
│       ├── ProcedureConsumable (Stock used)
│       ├── ProcedureOutcome (Result)
│       └── ProcedureFollowUp (Scheduled follow-up)
└── ProcedureKit (Standard consumable sets)
```

---

## 2. Data Models

### 2.1 Procedure Catalog (Reference)

```python
# backend/hmis/apps/procedures/models.py

from django.db import models
from hmis.apps.core.models import TimeStampedModel


class ProcedureCatalog(TimeStampedModel):
    """
    Master catalog of procedures that can be performed.
    
    Links to standard coding systems (ICHI, CPT) and defines
    consent requirements, typical consumables, and billing codes.
    """
    
    # =========================================================================
    # Category Choices
    # =========================================================================
    CATEGORY_CHOICES = [
        ("MINOR", "Minor Procedure"),
        ("SURGICAL", "Surgical Procedure"),
        ("DIAGNOSTIC", "Diagnostic Procedure"),
        ("THERAPEUTIC", "Therapeutic Procedure"),
        ("PREVENTIVE", "Preventive Procedure"),
        ("EMERGENCY", "Emergency Procedure"),
        ("DENTAL", "Dental Procedure"),
        ("OPHTHALMIC", "Ophthalmic Procedure"),
        ("ENT", "ENT Procedure"),
        ("OBSTETRIC", "Obstetric Procedure"),
        ("WOUND_CARE", "Wound Care"),
        ("INJECTION", "Injection/Infusion"),
        ("OTHER", "Other"),
    ]
    
    # =========================================================================
    # Body System Choices (for filtering)
    # =========================================================================
    BODY_SYSTEM_CHOICES = [
        ("INTEGUMENTARY", "Integumentary (Skin)"),
        ("MUSCULOSKELETAL", "Musculoskeletal"),
        ("RESPIRATORY", "Respiratory"),
        ("CARDIOVASCULAR", "Cardiovascular"),
        ("DIGESTIVE", "Digestive"),
        ("URINARY", "Urinary"),
        ("REPRODUCTIVE", "Reproductive"),
        ("NERVOUS", "Nervous"),
        ("ENDOCRINE", "Endocrine"),
        ("LYMPHATIC", "Lymphatic"),
        ("SENSORY", "Sensory (Eye/Ear)"),
        ("DENTAL", "Dental"),
        ("GENERAL", "General/Multiple"),
    ]
    
    # =========================================================================
    # Risk Level Choices
    # =========================================================================
    RISK_LEVEL_CHOICES = [
        ("LOW", "Low Risk"),
        ("MEDIUM", "Medium Risk"),
        ("HIGH", "High Risk"),
    ]
    
    # =========================================================================
    # Core Fields
    # =========================================================================
    code = models.CharField(
        max_length=20,
        unique=True,
        help_text="Internal procedure code (e.g., PROC-001)"
    )
    name = models.CharField(
        max_length=200,
        help_text="Procedure name"
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Detailed description of the procedure"
    )
    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default="MINOR"
    )
    body_system = models.CharField(
        max_length=20,
        choices=BODY_SYSTEM_CHOICES,
        default="GENERAL"
    )
    risk_level = models.CharField(
        max_length=10,
        choices=RISK_LEVEL_CHOICES,
        default="LOW"
    )
    
    # =========================================================================
    # Standard Coding (ICHI, CPT)
    # =========================================================================
    ichi_code = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="ICHI procedure code (WHO standard)"
    )
    cpt_code = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="CPT procedure code (if applicable)"
    )
    icd10_pcs_code = models.CharField(
        max_length=10,
        blank=True,
        default="",
        help_text="ICD-10-PCS code (if applicable)"
    )
    
    # =========================================================================
    # Consent & Requirements
    # =========================================================================
    consent_required = models.BooleanField(
        default=True,
        help_text="Whether written consent is required"
    )
    consent_template = models.TextField(
        blank=True,
        default="",
        help_text="Default consent form text"
    )
    guardian_consent_required = models.BooleanField(
        default=False,
        help_text="Whether guardian consent required for minors"
    )
    witness_required = models.BooleanField(
        default=False,
        help_text="Whether a witness signature is required"
    )
    
    # =========================================================================
    # Clinical Requirements
    # =========================================================================
    requires_anesthesia = models.BooleanField(
        default=False,
        help_text="Whether anesthesia is typically required"
    )
    anesthesia_type = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Type of anesthesia (local, general, sedation)"
    )
    typical_duration_minutes = models.PositiveIntegerField(
        default=30,
        help_text="Typical procedure duration in minutes"
    )
    requires_fasting = models.BooleanField(
        default=False,
        help_text="Whether pre-procedure fasting is required"
    )
    pre_procedure_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Instructions for patient before procedure"
    )
    post_procedure_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Instructions for patient after procedure"
    )
    
    # =========================================================================
    # Staffing Requirements
    # =========================================================================
    required_qualifications = models.TextField(
        blank=True,
        default="",
        help_text="Staff qualifications required (e.g., 'Surgeon, Nurse')"
    )
    minimum_staff_count = models.PositiveIntegerField(
        default=1,
        help_text="Minimum staff required"
    )
    
    # =========================================================================
    # Billing & SHA
    # =========================================================================
    base_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base procedure fee (KES)"
    )
    sha_tariff_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA intervention tariff code"
    )
    sha_package_code = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="SHA package code (if bundled)"
    )
    
    # =========================================================================
    # Follow-up
    # =========================================================================
    requires_follow_up = models.BooleanField(
        default=False,
        help_text="Whether follow-up appointment is typically needed"
    )
    default_follow_up_days = models.PositiveIntegerField(
        default=7,
        help_text="Default days until follow-up"
    )
    follow_up_clinic = models.ForeignKey(
        "clinics.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_procedures",
        help_text="Default clinic for follow-up"
    )
    
    # =========================================================================
    # Status
    # =========================================================================
    is_active = models.BooleanField(
        default=True,
        help_text="Whether procedure is currently offered"
    )
    
    class Meta:
        ordering = ["category", "name"]
        verbose_name = "Procedure Catalog Entry"
        verbose_name_plural = "Procedure Catalog"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["ichi_code"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class ProcedureKit(TimeStampedModel):
    """
    Standard consumable kit for a procedure.
    
    Defines the typical items needed for a procedure,
    allowing quick addition of all consumables.
    """
    
    procedure = models.ForeignKey(
        ProcedureCatalog,
        on_delete=models.CASCADE,
        related_name="kits"
    )
    name = models.CharField(
        max_length=100,
        help_text="Kit name (e.g., 'Standard Suturing Kit')"
    )
    description = models.TextField(
        blank=True,
        default=""
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Default kit for this procedure"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["procedure", "name"]
        verbose_name = "Procedure Kit"
        verbose_name_plural = "Procedure Kits"

    def __str__(self):
        return f"{self.procedure.name} - {self.name}"


class ProcedureKitItem(models.Model):
    """
    Individual item in a procedure kit.
    """
    
    kit = models.ForeignKey(
        ProcedureKit,
        on_delete=models.CASCADE,
        related_name="items"
    )
    stock_item = models.ForeignKey(
        "pharmacy.StockItem",
        on_delete=models.CASCADE,
        help_text="Item from pharmacy inventory"
    )
    quantity = models.PositiveIntegerField(
        default=1,
        help_text="Quantity needed"
    )
    is_optional = models.BooleanField(
        default=False,
        help_text="Whether this item is optional"
    )
    notes = models.CharField(
        max_length=200,
        blank=True,
        default=""
    )

    class Meta:
        ordering = ["kit", "-is_optional", "stock_item__name"]
        unique_together = ["kit", "stock_item"]

    def __str__(self):
        return f"{self.kit.name} - {self.stock_item.name} x{self.quantity}"
```

### 2.2 Procedure Order Model

```python
class ProcedureOrder(TimeStampedModel):
    """
    Order/request for a procedure to be performed.
    
    Created when a clinician orders a procedure during an encounter.
    """
    
    # =========================================================================
    # Status Choices
    # =========================================================================
    STATUS_CHOICES = [
        ("ORDERED", "Ordered - Awaiting consent/scheduling"),
        ("CONSENT_PENDING", "Consent Pending"),
        ("SCHEDULED", "Scheduled"),
        ("READY", "Ready to Perform"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
    ]
    
    # =========================================================================
    # Priority Choices
    # =========================================================================
    PRIORITY_CHOICES = [
        ("EMERGENCY", "Emergency - Immediate"),
        ("URGENT", "Urgent - Within 24 hours"),
        ("ROUTINE", "Routine - Scheduled"),
        ("ELECTIVE", "Elective - Non-urgent"),
    ]
    
    # =========================================================================
    # Core Fields
    # =========================================================================
    order_number = models.CharField(
        max_length=20,
        unique=True,
        editable=False,
        help_text="Auto-generated order number (PROC-YYYYMMDD-XXXX)"
    )
    procedure = models.ForeignKey(
        ProcedureCatalog,
        on_delete=models.PROTECT,
        related_name="orders"
    )
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="procedure_orders"
    )
    
    # =========================================================================
    # Context (where order originated)
    # =========================================================================
    encounter = models.ForeignKey(
        "encounters.Encounter",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Encounter where procedure was ordered"
    )
    clinic_visit = models.ForeignKey(
        "clinics.ClinicVisit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Clinic visit where procedure was ordered"
    )
    admission = models.ForeignKey(
        "inpatient.Admission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="If ordered for inpatient"
    )
    
    # =========================================================================
    # Order Details
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="ORDERED"
    )
    priority = models.CharField(
        max_length=20,
        choices=PRIORITY_CHOICES,
        default="ROUTINE"
    )
    indication = models.TextField(
        help_text="Clinical indication / reason for procedure"
    )
    clinical_notes = models.TextField(
        blank=True,
        default="",
        help_text="Additional clinical notes"
    )
    
    # =========================================================================
    # Site/Laterality
    # =========================================================================
    LATERALITY_CHOICES = [
        ("LEFT", "Left"),
        ("RIGHT", "Right"),
        ("BILATERAL", "Bilateral"),
        ("NA", "Not Applicable"),
    ]
    
    body_site = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Specific body site (e.g., 'Right forearm')"
    )
    laterality = models.CharField(
        max_length=20,
        choices=LATERALITY_CHOICES,
        default="NA"
    )
    
    # =========================================================================
    # Scheduling
    # =========================================================================
    scheduled_date = models.DateField(
        null=True,
        blank=True,
        help_text="Scheduled procedure date"
    )
    scheduled_time = models.TimeField(
        null=True,
        blank=True,
        help_text="Scheduled procedure time"
    )
    scheduled_location = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Procedure room/location"
    )
    estimated_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Estimated duration (override from catalog)"
    )
    
    # =========================================================================
    # Staff
    # =========================================================================
    ordered_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="procedure_orders_created",
        help_text="Clinician who ordered the procedure"
    )
    ordered_at = models.DateTimeField(
        auto_now_add=True
    )
    assigned_performer = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_procedures",
        help_text="Staff assigned to perform"
    )
    
    # =========================================================================
    # Cancellation
    # =========================================================================
    cancelled_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_procedure_orders"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-ordered_at"]
        verbose_name = "Procedure Order"
        verbose_name_plural = "Procedure Orders"
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["scheduled_date"]),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.procedure.name} for {self.patient}"
    
    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = self._generate_order_number()
        super().save(*args, **kwargs)
    
    def _generate_order_number(self):
        """Generate unique order number: PROC-YYYYMMDD-XXXX"""
        from django.utils import timezone
        today = timezone.now().date()
        prefix = f"PROC-{today.strftime('%Y%m%d')}-"
        
        last_order = ProcedureOrder.objects.filter(
            order_number__startswith=prefix
        ).order_by("-order_number").first()
        
        if last_order:
            last_num = int(last_order.order_number.split("-")[-1])
            next_num = last_num + 1
        else:
            next_num = 1
        
        return f"{prefix}{next_num:04d}"
    
    def can_perform(self):
        """Check if procedure can be performed."""
        if self.status not in ["SCHEDULED", "READY"]:
            return False, "Order not in performable status"
        
        if self.procedure.consent_required:
            if not hasattr(self, 'consent') or self.consent.status != "SIGNED":
                return False, "Consent not obtained"
        
        return True, "Ready to perform"
    
    def cancel(self, user, reason):
        """Cancel the procedure order."""
        from django.utils import timezone
        self.status = "CANCELLED"
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save()
```

### 2.3 Procedure Consent Model

```python
class ProcedureConsent(TimeStampedModel):
    """
    Consent record for a procedure.
    
    Tracks informed consent with patient signature,
    witness signature (if required), and guardian consent for minors.
    """
    
    STATUS_CHOICES = [
        ("PENDING", "Pending - Not yet signed"),
        ("SIGNED", "Signed - Consent given"),
        ("DECLINED", "Declined - Consent refused"),
        ("WITHDRAWN", "Withdrawn - Consent withdrawn"),
    ]
    
    CONSENT_TYPE_CHOICES = [
        ("WRITTEN", "Written Consent"),
        ("VERBAL", "Verbal Consent (documented)"),
        ("EMERGENCY", "Emergency (implied consent)"),
    ]
    
    order = models.OneToOneField(
        ProcedureOrder,
        on_delete=models.CASCADE,
        related_name="consent"
    )
    
    # =========================================================================
    # Consent Details
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PENDING"
    )
    consent_type = models.CharField(
        max_length=20,
        choices=CONSENT_TYPE_CHOICES,
        default="WRITTEN"
    )
    consent_text = models.TextField(
        help_text="Full consent form text presented to patient"
    )
    
    # =========================================================================
    # Information Provided
    # =========================================================================
    procedure_explained = models.BooleanField(
        default=False,
        help_text="Procedure was explained to patient"
    )
    risks_explained = models.BooleanField(
        default=False,
        help_text="Risks and complications were explained"
    )
    alternatives_explained = models.BooleanField(
        default=False,
        help_text="Alternative treatments were discussed"
    )
    questions_answered = models.BooleanField(
        default=False,
        help_text="Patient's questions were answered"
    )
    
    # =========================================================================
    # Patient/Guardian Signature
    # =========================================================================
    signed_by_patient = models.BooleanField(
        default=False,
        help_text="Whether patient signed"
    )
    patient_signature = models.TextField(
        blank=True,
        default="",
        help_text="Patient signature (base64 image or typed name)"
    )
    patient_signed_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # For minors or incapacitated patients
    signed_by_guardian = models.BooleanField(
        default=False,
        help_text="Whether guardian signed (for minors)"
    )
    guardian_name = models.CharField(
        max_length=200,
        blank=True,
        default=""
    )
    guardian_relationship = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Relationship to patient (parent, spouse, etc.)"
    )
    guardian_id_number = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Guardian's ID number"
    )
    guardian_signature = models.TextField(
        blank=True,
        default=""
    )
    guardian_signed_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # =========================================================================
    # Witness
    # =========================================================================
    witness_required = models.BooleanField(default=False)
    witness_name = models.CharField(
        max_length=200,
        blank=True,
        default=""
    )
    witness_signature = models.TextField(
        blank=True,
        default=""
    )
    witness_signed_at = models.DateTimeField(
        null=True,
        blank=True
    )
    witnessed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="witnessed_consents",
        help_text="Staff who witnessed the consent"
    )
    
    # =========================================================================
    # Staff who obtained consent
    # =========================================================================
    obtained_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="consents_obtained",
        help_text="Staff who obtained consent"
    )
    obtained_at = models.DateTimeField(
        null=True,
        blank=True
    )
    
    # =========================================================================
    # Decline/Withdrawal
    # =========================================================================
    decline_reason = models.TextField(
        blank=True,
        default="",
        help_text="Reason for declining/withdrawing consent"
    )
    declined_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Procedure Consent"
        verbose_name_plural = "Procedure Consents"

    def __str__(self):
        return f"Consent for {self.order}"
    
    def is_valid(self):
        """Check if consent is valid."""
        if self.status != "SIGNED":
            return False
        
        if not self.procedure_explained or not self.risks_explained:
            return False
        
        if self.order.patient.is_minor() and self.order.procedure.guardian_consent_required:
            if not self.signed_by_guardian:
                return False
        elif not self.signed_by_patient:
            return False
        
        if self.witness_required and not self.witness_signature:
            return False
        
        return True


class ProcedureLog(TimeStampedModel):
    """
    Record of a performed procedure.
    
    Documents the actual performance including timing,
    staff involved, findings, and immediate outcome.
    """
    
    STATUS_CHOICES = [
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed Successfully"),
        ("PARTIAL", "Partially Completed"),
        ("ABANDONED", "Abandoned"),
        ("COMPLICATED", "Completed with Complications"),
    ]
    
    order = models.OneToOneField(
        ProcedureOrder,
        on_delete=models.CASCADE,
        related_name="log"
    )
    
    # =========================================================================
    # Timing
    # =========================================================================
    started_at = models.DateTimeField(
        help_text="Procedure start time"
    )
    ended_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Procedure end time"
    )
    actual_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Actual duration in minutes"
    )
    
    # =========================================================================
    # Staff Involved
    # =========================================================================
    performed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="procedures_performed",
        help_text="Primary performer"
    )
    assistant = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedures_assisted",
        help_text="Assistant (if any)"
    )
    
    # =========================================================================
    # Location
    # =========================================================================
    location = models.CharField(
        max_length=100,
        help_text="Where procedure was performed"
    )
    
    # =========================================================================
    # Anesthesia
    # =========================================================================
    anesthesia_used = models.BooleanField(default=False)
    anesthesia_type = models.CharField(
        max_length=50,
        blank=True,
        default=""
    )
    anesthesia_agent = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Anesthetic agent used (e.g., Lidocaine 2%)"
    )
    anesthesia_dose = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text="Dose administered"
    )
    
    # =========================================================================
    # Findings & Technique
    # =========================================================================
    pre_procedure_findings = models.TextField(
        blank=True,
        default="",
        help_text="Findings before/during procedure"
    )
    technique_description = models.TextField(
        blank=True,
        default="",
        help_text="Description of technique used"
    )
    specimens_collected = models.BooleanField(
        default=False,
        help_text="Whether specimens were collected"
    )
    specimen_details = models.TextField(
        blank=True,
        default="",
        help_text="Details of specimens collected"
    )
    
    # =========================================================================
    # Status & Outcome
    # =========================================================================
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="IN_PROGRESS"
    )
    immediate_outcome = models.TextField(
        blank=True,
        default="",
        help_text="Immediate post-procedure notes"
    )
    
    # =========================================================================
    # Complications
    # =========================================================================
    complications_occurred = models.BooleanField(default=False)
    complication_details = models.TextField(
        blank=True,
        default=""
    )
    
    # =========================================================================
    # Post-Procedure
    # =========================================================================
    post_procedure_instructions_given = models.BooleanField(default=False)
    post_procedure_instructions = models.TextField(
        blank=True,
        default="",
        help_text="Instructions given to patient"
    )
    
    # =========================================================================
    # Documentation
    # =========================================================================
    notes = models.TextField(
        blank=True,
        default=""
    )

    class Meta:
        ordering = ["-started_at"]
        verbose_name = "Procedure Log"
        verbose_name_plural = "Procedure Logs"

    def __str__(self):
        return f"Log: {self.order}"
    
    def save(self, *args, **kwargs):
        if self.started_at and self.ended_at:
            delta = self.ended_at - self.started_at
            self.actual_duration_minutes = int(delta.total_seconds() / 60)
        super().save(*args, **kwargs)
    
    def complete(self, user, status="COMPLETED"):
        """Mark procedure as completed."""
        from django.utils import timezone
        self.ended_at = timezone.now()
        self.status = status
        self.save()
        
        # Update order status
        self.order.status = "COMPLETED"
        self.order.save()


class ProcedureConsumable(models.Model):
    """
    Consumables used during a procedure.
    
    Tracks stock items used for inventory management
    and billing purposes.
    """
    
    log = models.ForeignKey(
        ProcedureLog,
        on_delete=models.CASCADE,
        related_name="consumables"
    )
    stock_item = models.ForeignKey(
        "pharmacy.StockItem",
        on_delete=models.PROTECT,
        help_text="Item from pharmacy inventory"
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Specific batch used"
    )
    quantity = models.PositiveIntegerField(
        help_text="Quantity used"
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Unit cost at time of use"
    )
    total_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Total cost (quantity × unit_cost)"
    )
    notes = models.CharField(
        max_length=200,
        blank=True,
        default=""
    )
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        "auth.User",
        on_delete=models.SET_NULL,
        null=True
    )

    class Meta:
        ordering = ["log", "stock_item__name"]
        verbose_name = "Procedure Consumable"
        verbose_name_plural = "Procedure Consumables"

    def __str__(self):
        return f"{self.stock_item.name} x{self.quantity} for {self.log.order}"
    
    def save(self, *args, **kwargs):
        if self.unit_cost and self.quantity:
            self.total_cost = self.unit_cost * self.quantity
        super().save(*args, **kwargs)
        
        # Deduct from inventory (if not already done)
        if not self.pk:  # New record
            self._deduct_stock()
    
    def _deduct_stock(self):
        """Deduct consumable from pharmacy stock."""
        from hmis.apps.pharmacy.models import StockMovement
        
        StockMovement.objects.create(
            stock_item=self.stock_item,
            batch=self.batch,
            movement_type="PROCEDURE",
            quantity=-self.quantity,
            reference_type="ProcedureLog",
            reference_id=self.log.id,
            notes=f"Used in {self.log.order.order_number}",
            performed_by=self.recorded_by,
        )


class ProcedureOutcome(TimeStampedModel):
    """
    Outcome tracking for a procedure.
    
    Documents follow-up outcomes, healing progress,
    and any delayed complications.
    """
    
    OUTCOME_CHOICES = [
        ("SUCCESSFUL", "Successful - Full recovery"),
        ("PARTIAL_SUCCESS", "Partial Success"),
        ("HEALING", "Healing as expected"),
        ("DELAYED_HEALING", "Delayed Healing"),
        ("INFECTION", "Infection"),
        ("COMPLICATION", "Post-procedure Complication"),
        ("RE_PROCEDURE_NEEDED", "Re-procedure Needed"),
        ("REFERRED", "Referred for Further Care"),
    ]
    
    log = models.ForeignKey(
        ProcedureLog,
        on_delete=models.CASCADE,
        related_name="outcomes"
    )
    assessment_date = models.DateField(
        help_text="Date of outcome assessment"
    )
    outcome = models.CharField(
        max_length=30,
        choices=OUTCOME_CHOICES
    )
    findings = models.TextField(
        help_text="Clinical findings"
    )
    notes = models.TextField(
        blank=True,
        default=""
    )
    assessed_by = models.ForeignKey(
        "auth.User",
        on_delete=models.PROTECT,
        related_name="procedure_outcomes_assessed"
    )
    
    # Follow-up scheduling
    next_follow_up = models.DateField(
        null=True,
        blank=True
    )
    follow_up_notes = models.TextField(
        blank=True,
        default=""
    )
    
    # Photos/images (stored as references)
    images = models.JSONField(
        null=True,
        blank=True,
        help_text="List of image file references"
    )

    class Meta:
        ordering = ["-assessment_date"]
        verbose_name = "Procedure Outcome"
        verbose_name_plural = "Procedure Outcomes"

    def __str__(self):
        return f"Outcome: {self.log.order} - {self.get_outcome_display()}"
```

---

## 3. API Endpoints

```
# Procedure Catalog (Reference)
GET    /api/procedures/catalog/                    # List all procedures
GET    /api/procedures/catalog/{id}/               # Get procedure details
GET    /api/procedures/catalog/search/?q=          # Search procedures
GET    /api/procedures/catalog/by-category/{cat}/  # Filter by category

# Procedure Orders
GET    /api/procedures/orders/                     # List orders (filtered)
POST   /api/procedures/orders/                     # Create order
GET    /api/procedures/orders/{id}/                # Get order details
PATCH  /api/procedures/orders/{id}/                # Update order
DELETE /api/procedures/orders/{id}/cancel/         # Cancel order

# Procedure Consent
GET    /api/procedures/orders/{id}/consent/        # Get consent
POST   /api/procedures/orders/{id}/consent/        # Create/submit consent
PATCH  /api/procedures/orders/{id}/consent/        # Update consent

# Procedure Performance
POST   /api/procedures/orders/{id}/start/          # Start procedure
PATCH  /api/procedures/orders/{id}/log/            # Update procedure log
POST   /api/procedures/orders/{id}/complete/       # Complete procedure
POST   /api/procedures/orders/{id}/consumables/    # Add consumable

# Procedure Outcomes
GET    /api/procedures/orders/{id}/outcomes/       # List outcomes
POST   /api/procedures/orders/{id}/outcomes/       # Add outcome

# Dashboard/Reports
GET    /api/procedures/dashboard/                  # Procedure statistics
GET    /api/procedures/scheduled/                  # Scheduled procedures
GET    /api/procedures/pending-consent/            # Orders awaiting consent
```

---

## 4. Frontend Implementation

### 4.1 Navigation

Procedures are accessed from multiple locations:

1. **During Encounter/Consultation** → Order Procedure button
2. **Clinic Queue** → Procedure Room clinic
3. **Inpatient Ward** → Order Procedure from ward round
4. **Dedicated Procedures Page** → Surgical OPD / Procedure Room view

### 4.2 Page Structure

```
web-app/app/(dashboard)/procedures/
├── page.tsx                        # Procedures dashboard
├── orders/
│   ├── page.tsx                    # All orders list
│   ├── [orderId]/
│   │   ├── page.tsx                # Order details
│   │   ├── consent/
│   │   │   └── page.tsx            # Consent form
│   │   └── perform/
│   │       └── page.tsx            # Perform procedure
├── catalog/
│   ├── page.tsx                    # Procedure catalog
│   └── [procedureId]/
│       └── page.tsx                # Catalog entry details
├── scheduled/
│   └── page.tsx                    # Scheduled procedures
└── reports/
    └── page.tsx                    # Procedure reports
```

### 4.3 Key Components

```typescript
// Order Procedure Modal (used in Encounter)
interface OrderProcedureModalProps {
  encounter: Encounter;
  patient: Patient;
  onSuccess: (order: ProcedureOrder) => void;
}

// Consent Form Component
interface ConsentFormProps {
  order: ProcedureOrder;
  onConsentObtained: (consent: ProcedureConsent) => void;
}

// Procedure Performance Form
interface ProcedurePerformanceProps {
  order: ProcedureOrder;
  onComplete: (log: ProcedureLog) => void;
}

// Consumable Picker
interface ConsumablePickerProps {
  log: ProcedureLog;
  defaultKit?: ProcedureKit;
  onAdd: (consumable: ProcedureConsumable) => void;
}
```

### 4.4 Procedure Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Procedures Dashboard                                           [+ New Order]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  SCHEDULED  │ │  AWAITING   │ │ IN PROGRESS │ │  COMPLETED  │           │
│  │   TODAY     │ │  CONSENT    │ │             │ │    TODAY    │           │
│  │     8       │ │      3      │ │      2      │ │     12      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  TODAY'S SCHEDULED PROCEDURES                                          │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  Time  │ Patient        │ Procedure           │ Status      │ Actions │ │
│  ├────────┼────────────────┼─────────────────────┼─────────────┼─────────┤ │
│  │  09:00 │ John Kamau     │ Circumcision        │ ✓ Consented │ [Start] │ │
│  │  09:30 │ Jane Wanjiku   │ Wound Dressing      │ ✓ Consented │ [Start] │ │
│  │  10:00 │ Peter Omondi   │ I&D (Abscess)       │ ⏳ Consent  │ [Consent]│ │
│  │  10:30 │ Mary Akinyi    │ Suturing            │ 🔄 In Progress│ [View] │ │
│  │  ...   │ ...            │ ...                 │ ...         │ ...     │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  COMMON PROCEDURES (Quick Order)                                       │ │
│  ├───────────────────────────────────────────────────────────────────────┤ │
│  │  [Wound Dressing] [Suturing] [I&D] [Circumcision] [Eye Irrigation]    │ │
│  │  [Catheterization] [NG Tube] [IV Cannulation] [Injection] [Dressing]  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Integration Points

### 5.1 Encounter Integration

```python
# In encounter consultation view
class EncounterViewSet:
    @action(detail=True, methods=["post"])
    def order_procedure(self, request, pk=None):
        """Order a procedure from an encounter."""
        encounter = self.get_object()
        
        order = ProcedureOrder.objects.create(
            procedure_id=request.data["procedure_id"],
            patient=encounter.patient,
            encounter=encounter,
            indication=request.data["indication"],
            priority=request.data.get("priority", "ROUTINE"),
            ordered_by=request.user,
        )
        
        # Auto-generate billing
        self._generate_procedure_billing(order)
        
        return Response(ProcedureOrderSerializer(order).data)
```

### 5.2 Pharmacy Integration

```python
# When consumables are used, stock is automatically deducted
# See ProcedureConsumable._deduct_stock()

# Pharmacy can query procedure-related stock movements
StockMovement.objects.filter(movement_type="PROCEDURE")
```

### 5.3 Billing Integration

```python
def _generate_procedure_billing(order):
    """Generate billing line items for procedure."""
    from hmis.apps.billing.models import BillingLineItem, Invoice
    
    invoice = Invoice.get_or_create_for_patient(order.patient)
    
    # Procedure fee
    if order.procedure.base_fee:
        BillingLineItem.objects.create(
            invoice=invoice,
            service_type="PROCEDURE",
            description=f"Procedure: {order.procedure.name}",
            quantity=1,
            unit_price=order.procedure.base_fee,
            sha_code=order.procedure.sha_tariff_code,
            reference_type="ProcedureOrder",
            reference_id=order.id,
        )
```

### 5.4 SHA Claims Integration

```python
# Include procedure in FHIR claim bundle
def add_procedure_to_claim(claim_bundle, procedure_log):
    """Add procedure to SHA claim."""
    procedure_entry = {
        "resourceType": "Procedure",
        "status": "completed",
        "code": {
            "coding": [{
                "system": "https://sha.go.ke/ichi",
                "code": procedure_log.order.procedure.ichi_code,
                "display": procedure_log.order.procedure.name
            }]
        },
        "performedDateTime": procedure_log.started_at.isoformat(),
        "outcome": {
            "text": procedure_log.status
        }
    }
    claim_bundle["entry"].append({"resource": procedure_entry})
```

---

## 6. Implementation Phases

### Phase 2.3 (Weeks 5-6): Core Models & API

- [ ] Create `procedures` Django app
- [ ] Implement ProcedureCatalog, ProcedureOrder models
- [ ] Implement ProcedureConsent model
- [ ] Implement ProcedureLog, ProcedureConsumable, ProcedureOutcome
- [ ] Create migrations
- [ ] Implement serializers and viewsets
- [ ] Write unit tests (target: 80+ tests)
- [ ] Seed initial procedure catalog (common procedures)

### Phase 2.4 (Weeks 7-8): Frontend & Integration

- [ ] Create procedure dashboard page
- [ ] Build order procedure modal
- [ ] Implement consent form (with signature capture)
- [ ] Build procedure performance form
- [ ] Implement consumable picker
- [ ] Integrate with Encounter order flow
- [ ] Integrate with Pharmacy stock deduction
- [ ] Integrate with Billing

### Phase 2.5 (Weeks 9-10): Reporting & Testing

- [ ] Implement procedure reports
- [ ] Add SHA claims integration
- [ ] E2E testing
- [ ] Performance optimization

---

## 7. Seed Data: Initial Procedure Catalog

```python
INITIAL_PROCEDURES = [
    # Wound Care
    {"code": "PROC-WC-001", "name": "Wound Dressing (Simple)", "category": "WOUND_CARE", "base_fee": 500},
    {"code": "PROC-WC-002", "name": "Wound Dressing (Complex)", "category": "WOUND_CARE", "base_fee": 1000},
    {"code": "PROC-WC-003", "name": "Suturing (Simple)", "category": "WOUND_CARE", "base_fee": 1500},
    {"code": "PROC-WC-004", "name": "Suturing (Complex)", "category": "WOUND_CARE", "base_fee": 3000},
    {"code": "PROC-WC-005", "name": "Suture Removal", "category": "WOUND_CARE", "base_fee": 300},
    
    # Minor Surgical
    {"code": "PROC-MS-001", "name": "Incision & Drainage (Abscess)", "category": "MINOR", "base_fee": 3000},
    {"code": "PROC-MS-002", "name": "Foreign Body Removal (Skin)", "category": "MINOR", "base_fee": 2000},
    {"code": "PROC-MS-003", "name": "Cyst Excision", "category": "MINOR", "base_fee": 5000},
    {"code": "PROC-MS-004", "name": "Lipoma Excision", "category": "MINOR", "base_fee": 8000},
    {"code": "PROC-MS-005", "name": "Nail Removal", "category": "MINOR", "base_fee": 2500},
    
    # Preventive
    {"code": "PROC-PV-001", "name": "Male Circumcision (Adult)", "category": "PREVENTIVE", "base_fee": 5000},
    {"code": "PROC-PV-002", "name": "Male Circumcision (Pediatric)", "category": "PREVENTIVE", "base_fee": 3000},
    
    # Injections
    {"code": "PROC-INJ-001", "name": "IM Injection", "category": "INJECTION", "base_fee": 200},
    {"code": "PROC-INJ-002", "name": "IV Injection", "category": "INJECTION", "base_fee": 300},
    {"code": "PROC-INJ-003", "name": "SC Injection", "category": "INJECTION", "base_fee": 200},
    {"code": "PROC-INJ-004", "name": "IV Cannulation", "category": "INJECTION", "base_fee": 500},
    {"code": "PROC-INJ-005", "name": "IV Infusion Setup", "category": "INJECTION", "base_fee": 800},
    
    # Ophthalmic
    {"code": "PROC-EYE-001", "name": "Eye Irrigation", "category": "OPHTHALMIC", "base_fee": 500},
    {"code": "PROC-EYE-002", "name": "Foreign Body Removal (Eye)", "category": "OPHTHALMIC", "base_fee": 1500},
    {"code": "PROC-EYE-003", "name": "Eye Examination (Detailed)", "category": "OPHTHALMIC", "base_fee": 1000},
    
    # ENT
    {"code": "PROC-ENT-001", "name": "Ear Syringing", "category": "ENT", "base_fee": 500},
    {"code": "PROC-ENT-002", "name": "Foreign Body Removal (Ear)", "category": "ENT", "base_fee": 1000},
    {"code": "PROC-ENT-003", "name": "Foreign Body Removal (Nose)", "category": "ENT", "base_fee": 1000},
    {"code": "PROC-ENT-004", "name": "Nasal Packing", "category": "ENT", "base_fee": 1500},
    
    # Urological
    {"code": "PROC-URO-001", "name": "Urethral Catheterization", "category": "THERAPEUTIC", "base_fee": 1000},
    {"code": "PROC-URO-002", "name": "Catheter Change", "category": "THERAPEUTIC", "base_fee": 500},
    {"code": "PROC-URO-003", "name": "Bladder Irrigation", "category": "THERAPEUTIC", "base_fee": 800},
    
    # GI
    {"code": "PROC-GI-001", "name": "NG Tube Insertion", "category": "THERAPEUTIC", "base_fee": 1000},
    {"code": "PROC-GI-002", "name": "NG Tube Removal", "category": "THERAPEUTIC", "base_fee": 300},
    {"code": "PROC-GI-003", "name": "Gastric Lavage", "category": "THERAPEUTIC", "base_fee": 2000},
    {"code": "PROC-GI-004", "name": "Rectal Examination", "category": "DIAGNOSTIC", "base_fee": 500},
    {"code": "PROC-GI-005", "name": "Enema Administration", "category": "THERAPEUTIC", "base_fee": 800},
    
    # Diagnostic
    {"code": "PROC-DX-001", "name": "Lumbar Puncture", "category": "DIAGNOSTIC", "base_fee": 5000},
    {"code": "PROC-DX-002", "name": "Paracentesis (Abdominal Tap)", "category": "DIAGNOSTIC", "base_fee": 5000},
    {"code": "PROC-DX-003", "name": "Thoracentesis", "category": "DIAGNOSTIC", "base_fee": 8000},
    {"code": "PROC-DX-004", "name": "Bone Marrow Aspiration", "category": "DIAGNOSTIC", "base_fee": 10000},
    
    # Obstetric
    {"code": "PROC-OB-001", "name": "Vaginal Examination", "category": "OBSTETRIC", "base_fee": 500},
    {"code": "PROC-OB-002", "name": "Cervical Examination", "category": "OBSTETRIC", "base_fee": 500},
    {"code": "PROC-OB-003", "name": "Manual Vacuum Aspiration (MVA)", "category": "OBSTETRIC", "base_fee": 8000},
    {"code": "PROC-OB-004", "name": "Episiotomy Repair", "category": "OBSTETRIC", "base_fee": 3000},
    {"code": "PROC-OB-005", "name": "Perineal Tear Repair", "category": "OBSTETRIC", "base_fee": 5000},
    
    # Dental
    {"code": "PROC-DENT-001", "name": "Tooth Extraction (Simple)", "category": "DENTAL", "base_fee": 2000},
    {"code": "PROC-DENT-002", "name": "Tooth Extraction (Surgical)", "category": "DENTAL", "base_fee": 5000},
    {"code": "PROC-DENT-003", "name": "Dental Scaling", "category": "DENTAL", "base_fee": 3000},
    {"code": "PROC-DENT-004", "name": "Dental Filling", "category": "DENTAL", "base_fee": 2500},
    {"code": "PROC-DENT-005", "name": "Root Canal Treatment", "category": "DENTAL", "base_fee": 15000},
]
```

---

## 8. Success Criteria

| Metric | Target |
|--------|--------|
| Unit test coverage | ≥80% |
| Procedure ordering time | <1 min |
| Consent completion time | <3 min |
| Consumable deduction accuracy | 100% |
| Billing generation accuracy | 100% |

---

## Appendix A: Related Documents

- [Clinics Module Implementation Plan](clinics-module-implementation-plan.md)
- [ROADMAP.md](../ROADMAP.md)
- [ideal-patient-flow.md](ideal-patient-flow.md)
- [SHA Integration Guide](sha-frontend-integration-guide.md)

---

**Document Status**: Draft
**Next Review**: January 31, 2026
**Owner**: Engineering Lead

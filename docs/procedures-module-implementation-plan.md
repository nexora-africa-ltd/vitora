# Procedures Module Implementation Plan

**Version**: 2.0
**Created**: January 24, 2026
**Revised**: March 30, 2026
**Status**: Revised — aligned with codebase conventions (ready for implementation)
**Target Phase**: Phase 2 (Sprint 2.3-2.4)

### Revision Summary (v2.0)

| Change | Detail |
|--------|--------|
| Multi-tenancy | Added `organization` + `facility` FKs to all tenant-scoped models |
| TextChoices enums | Converted all raw choice tuples to `models.TextChoices` inner classes |
| User FK convention | Replaced `"auth.User"` with `settings.AUTH_USER_MODEL` throughout |
| Pharmacy references | Changed `pharmacy.StockItem` → `pharmacy.Drug` (actual model name) |
| Stock deduction | Replaced `StockMovement` (does not exist) with `StockBatch` deduction pattern |
| State-transition methods | Added full lifecycle methods on `ProcedureOrder` and `ProcedureLog` |
| Scheduling integration | Added optional `scheduling.Appointment` FK on `ProcedureOrder` |
| Theatre boundary | Documented scope split — minor/outpatient here, major surgical in future `theatre` app |
| Frontend structure | Flattened nested routes to detail-page-with-tabs convention |
| Serializer specs | Added serializer class definitions (list, detail, create, action) |
| Admin specs | Added admin class definitions with fieldsets and colored badges |
| Implementation phases | Aligned with 13-step full-stack pattern from copilot-instructions |

---

## Executive Summary

This document outlines the implementation plan for a standalone **Procedures Module** in Vitora HMIS. The module handles discrete clinical actions (circumcision, wound care, minor surgery, eye irrigation, etc.) that are distinct from diagnoses and require proper consent tracking, consumable usage, outcome documentation, and billing.

### Scope Boundary: Procedures vs Theatre

| Concern | Procedures Module (this plan) | Theatre Module (separate, future) |
|---------|-------------------------------|-----------------------------------|
| **Type** | Minor / outpatient procedures | Major surgical operations |
| **Setting** | Procedure room, consultation room, ward | Operating theatre / OR suite |
| **Anesthesia** | Local / topical / none | General / regional / spinal |
| **Staffing** | 1-2 clinicians | Full surgical team |
| **Duration** | Minutes to ~1 hour | Hours |
| **Examples** | Wound dressing, suturing, I&D, circumcision, injections, catheterization | Laparotomy, C-section, appendectomy, orthopaedic fixation |

> **Note**: The existing frontend `web-app/app/(dashboard)/theatre/` handles surgical cases and is **out of scope** for this module. When the theatre backend is built, it will share `ProcedureCatalog` as a reference but have its own `SurgicalCase`, `OperatingSlot`, and `SurgicalChecklist` models. Categories `MINOR`, `WOUND_CARE`, `INJECTION`, `DIAGNOSTIC`, `THERAPEUTIC`, `PREVENTIVE`, `DENTAL`, `OPHTHALMIC`, `ENT`, `OBSTETRIC`, and `OTHER` belong to **this module**. Category `SURGICAL` is **reserved for theatre**.

### Why a Separate Module?

| Aspect | Current State | Procedures Module |
|--------|---------------|-------------------|
| **Tracking** | Procedures mentioned in notes only | Structured procedure records with outcomes |
| **Consent** | Patient-level consent only | Procedure-specific consent with witness |
| **Consumables** | Manual stock adjustment | Auto-deduct from pharmacy inventory |
| **Billing** | Manual service charges | Auto-generate billing from procedure catalog |
| **Outcomes** | Not tracked | Structured outcome tracking (success/complication) |
| **Follow-up** | Manual scheduling | Auto-schedule via scheduling app |
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
│         ┌───────────────────┼────────────────────┼─────────┐               │
│         │                   │                    │         │               │
│         ▼                   ▼                    ▼         ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ ┌──────────┐       │
│  │   Consent    │  │ Consumables  │  │   Outcome    │ │Scheduling│       │
│  │    (NEW)     │  │    Used      │  │    (NEW)     │ │ (exists) │       │
│  └──────────────┘  └──────────────┘  └──────────────┘ └──────────┘       │
│                                                                             │
│  Cross-module integrations:                                                 │
│  • billing.Service ← ProcedureCatalog (billing linkage)                     │
│  • pharmacy.Drug + StockBatch ← ProcedureConsumable (stock deduction)       │
│  • scheduling.Appointment ← ProcedureOrder (optional appointment link)      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Model Hierarchy

```
ProcedureCatalog (Reference Data)
├── ProcedureKit (Standard consumable sets)
│   └── ProcedureKitItem (Individual items in a kit)
├── ProcedureOrder (Request/Order)
│   ├── ProcedureConsent (Per-procedure consent record)
│   └── ProcedureLog (Performance Record)
│       ├── ProcedureConsumable (Stock used)
│       └── ProcedureOutcome (Result/follow-up tracking)
```

---

## 2. Data Models

### 2.1 Procedure Catalog (Reference)

```python
# backend/hmis/apps/procedures/models.py

from django.conf import settings
from django.db import models
from django.utils import timezone

from hmis.apps.core.models import TimeStampedModel


class ProcedureCatalog(TimeStampedModel):
    """
    Master catalog of procedures that can be performed.

    Links to standard coding systems (ICHI, CPT) and defines
    consent requirements, typical consumables, and billing codes.

    NOTE: Category "SURGICAL" is reserved for the future theatre module.
    This module covers minor/outpatient procedures only.
    """

    # =========================================================================
    # TextChoices Enums (codebase convention)
    # =========================================================================
    class Category(models.TextChoices):
        MINOR = "MINOR", "Minor Procedure"
        DIAGNOSTIC = "DIAGNOSTIC", "Diagnostic Procedure"
        THERAPEUTIC = "THERAPEUTIC", "Therapeutic Procedure"
        PREVENTIVE = "PREVENTIVE", "Preventive Procedure"
        EMERGENCY = "EMERGENCY", "Emergency Procedure"
        DENTAL = "DENTAL", "Dental Procedure"
        OPHTHALMIC = "OPHTHALMIC", "Ophthalmic Procedure"
        ENT = "ENT", "ENT Procedure"
        OBSTETRIC = "OBSTETRIC", "Obstetric Procedure"
        WOUND_CARE = "WOUND_CARE", "Wound Care"
        INJECTION = "INJECTION", "Injection/Infusion"
        OTHER = "OTHER", "Other"

    class BodySystem(models.TextChoices):
        INTEGUMENTARY = "INTEGUMENTARY", "Integumentary (Skin)"
        MUSCULOSKELETAL = "MUSCULOSKELETAL", "Musculoskeletal"
        RESPIRATORY = "RESPIRATORY", "Respiratory"
        CARDIOVASCULAR = "CARDIOVASCULAR", "Cardiovascular"
        DIGESTIVE = "DIGESTIVE", "Digestive"
        URINARY = "URINARY", "Urinary"
        REPRODUCTIVE = "REPRODUCTIVE", "Reproductive"
        NERVOUS = "NERVOUS", "Nervous"
        ENDOCRINE = "ENDOCRINE", "Endocrine"
        LYMPHATIC = "LYMPHATIC", "Lymphatic"
        SENSORY = "SENSORY", "Sensory (Eye/Ear)"
        DENTAL = "DENTAL", "Dental"
        GENERAL = "GENERAL", "General/Multiple"

    class RiskLevel(models.TextChoices):
        LOW = "LOW", "Low Risk"
        MEDIUM = "MEDIUM", "Medium Risk"
        HIGH = "HIGH", "High Risk"

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
        choices=Category.choices,
        default=Category.MINOR,
    )
    body_system = models.CharField(
        max_length=20,
        choices=BodySystem.choices,
        default=BodySystem.GENERAL,
    )
    risk_level = models.CharField(
        max_length=10,
        choices=RiskLevel.choices,
        default=RiskLevel.LOW,
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

    # =========================================================================
    # Multi-tenancy (codebase convention)
    # =========================================================================
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_catalog_entries",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_catalog_entries",
        null=True,
        blank=True,
        help_text="Facility offering this procedure.",
    )

    class Meta:
        ordering = ["category", "name"]
        verbose_name = "Procedure Catalog Entry"
        verbose_name_plural = "Procedure Catalog"
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["ichi_code"]),
            models.Index(fields=["category"]),
            models.Index(fields=["facility", "is_active"]),
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
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.CASCADE,
        help_text="Drug/consumable item from pharmacy catalog"
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
        ordering = ["kit", "-is_optional", "drug__name"]
        unique_together = ["kit", "drug"]

    def __str__(self):
        return f"{self.kit.name} - {self.drug.name} x{self.quantity}"
```

### 2.2 Procedure Order Model

```python
class ProcedureOrder(TimeStampedModel):
    """
    Order/request for a procedure to be performed.

    Created when a clinician orders a procedure during an encounter.
    State transitions are owned by the model (codebase convention).
    """

    # =========================================================================
    # TextChoices Enums
    # =========================================================================
    class Status(models.TextChoices):
        ORDERED = "ORDERED", "Ordered"
        CONSENT_PENDING = "CONSENT_PENDING", "Consent Pending"
        SCHEDULED = "SCHEDULED", "Scheduled"
        READY = "READY", "Ready to Perform"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Priority(models.TextChoices):
        EMERGENCY = "EMERGENCY", "Emergency — Immediate"
        URGENT = "URGENT", "Urgent — Within 24 hours"
        ROUTINE = "ROUTINE", "Routine — Scheduled"
        ELECTIVE = "ELECTIVE", "Elective — Non-urgent"

    class Laterality(models.TextChoices):
        LEFT = "LEFT", "Left"
        RIGHT = "RIGHT", "Right"
        BILATERAL = "BILATERAL", "Bilateral"
        NA = "NA", "Not Applicable"

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
        choices=Status.choices,
        default=Status.ORDERED,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.ROUTINE,
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
    body_site = models.CharField(
        max_length=100,
        blank=True,
        default="",
        help_text="Specific body site (e.g., 'Right forearm')"
    )
    laterality = models.CharField(
        max_length=20,
        choices=Laterality.choices,
        default=Laterality.NA,
    )

    # =========================================================================
    # Scheduling (inline for minor procedures; link to scheduling app optional)
    # =========================================================================
    appointment = models.ForeignKey(
        "scheduling.Appointment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="procedure_orders",
        help_text="Optional link to scheduling.Appointment for formal booking"
    )
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
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="procedure_orders_created",
        help_text="Clinician who ordered the procedure"
    )
    ordered_at = models.DateTimeField(
        auto_now_add=True
    )
    assigned_performer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
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
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_procedure_orders"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default="")

    # =========================================================================
    # Multi-tenancy
    # =========================================================================
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_orders",
        null=True,
        blank=True,
        help_text="Owning organization (auto-set from facility).",
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_orders",
        null=True,
        blank=True,
        help_text="Facility where procedure was ordered.",
    )

    class Meta:
        ordering = ["-ordered_at"]
        verbose_name = "Procedure Order"
        verbose_name_plural = "Procedure Orders"
        indexes = [
            models.Index(fields=["order_number"]),
            models.Index(fields=["patient", "status"]),
            models.Index(fields=["scheduled_date"]),
            models.Index(fields=["facility", "status"]),
        ]

    def __str__(self):
        return f"{self.order_number} - {self.procedure.name} for {self.patient}"

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = self._generate_order_number()
        super().save(*args, **kwargs)

    def _generate_order_number(self):
        """Generate unique order number: PROC-YYYYMMDD-XXXX"""
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

    # =========================================================================
    # State-transition methods (model owns workflow logic)
    # =========================================================================
    def request_consent(self) -> None:
        """Transition ORDERED → CONSENT_PENDING."""
        self.status = self.Status.CONSENT_PENDING
        self.save(update_fields=["status", "updated_at"])

    def schedule(self, date, time=None, location="", duration=None) -> None:
        """Transition → SCHEDULED after consent obtained (or if not required)."""
        self.status = self.Status.SCHEDULED
        self.scheduled_date = date
        self.scheduled_time = time
        self.scheduled_location = location
        if duration:
            self.estimated_duration_minutes = duration
        self.save(update_fields=[
            "status", "scheduled_date", "scheduled_time",
            "scheduled_location", "estimated_duration_minutes", "updated_at",
        ])

    def mark_ready(self) -> None:
        """Transition SCHEDULED → READY (patient arrived, prep complete)."""
        self.status = self.Status.READY
        self.save(update_fields=["status", "updated_at"])

    def start_procedure(self, performed_by) -> "ProcedureLog":
        """Transition READY/SCHEDULED → IN_PROGRESS and create ProcedureLog."""
        self.status = self.Status.IN_PROGRESS
        self.save(update_fields=["status", "updated_at"])

        log = ProcedureLog.objects.create(
            order=self,
            started_at=timezone.now(),
            performed_by=performed_by,
            location=self.scheduled_location,
            organization=self.organization,
            facility=self.facility,
        )
        return log

    def complete(self) -> None:
        """Transition IN_PROGRESS → COMPLETED (called by ProcedureLog.complete)."""
        self.status = self.Status.COMPLETED
        self.save(update_fields=["status", "updated_at"])

    def cancel(self, user, reason: str) -> None:
        """Cancel the procedure order."""
        self.status = self.Status.CANCELLED
        self.cancelled_by = user
        self.cancelled_at = timezone.now()
        self.cancellation_reason = reason
        self.save(update_fields=[
            "status", "cancelled_by", "cancelled_at",
            "cancellation_reason", "updated_at",
        ])

    # =========================================================================
    # Computed properties
    # =========================================================================
    def can_perform(self) -> tuple[bool, str]:
        """Check if procedure can be performed."""
        if self.status not in [self.Status.SCHEDULED, self.Status.READY]:
            return False, "Order not in performable status"

        if self.procedure.consent_required:
            if not hasattr(self, "consent") or self.consent.status != ProcedureConsent.Status.SIGNED:
                return False, "Consent not obtained"

        return True, "Ready to perform"

    @property
    def is_overdue(self) -> bool:
        """True if scheduled_date is in the past and still not completed."""
        if self.status in [self.Status.COMPLETED, self.Status.CANCELLED]:
            return False
        if self.scheduled_date and self.scheduled_date < timezone.now().date():
            return True
        return False
```

### 2.3 Procedure Consent Model

```python
class ProcedureConsent(TimeStampedModel):
    """
    Consent record for a procedure.

    Tracks informed consent with patient signature,
    witness signature (if required), and guardian consent for minors.
    """

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending — Not yet signed"
        SIGNED = "SIGNED", "Signed — Consent given"
        DECLINED = "DECLINED", "Declined — Consent refused"
        WITHDRAWN = "WITHDRAWN", "Withdrawn — Consent withdrawn"

    class ConsentType(models.TextChoices):
        WRITTEN = "WRITTEN", "Written Consent"
        VERBAL = "VERBAL", "Verbal Consent (documented)"
        EMERGENCY = "EMERGENCY", "Emergency (implied consent)"

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
        choices=Status.choices,
        default=Status.PENDING,
    )
    consent_type = models.CharField(
        max_length=20,
        choices=ConsentType.choices,
        default=ConsentType.WRITTEN,
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
        settings.AUTH_USER_MODEL,
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
        settings.AUTH_USER_MODEL,
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

    # =========================================================================
    # Multi-tenancy
    # =========================================================================
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_consents",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_consents",
        null=True,
        blank=True,
    )

    def is_valid(self) -> bool:
        """Check if consent is valid."""
        if self.status != self.Status.SIGNED:
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

    # =========================================================================
    # State-transition methods
    # =========================================================================
    def sign(self, user) -> None:
        """Mark consent as signed and transition order to SCHEDULED or READY."""
        self.status = self.Status.SIGNED
        self.obtained_by = user
        self.obtained_at = timezone.now()
        self.save(update_fields=[
            "status", "obtained_by", "obtained_at", "updated_at",
        ])

    def decline(self, reason: str = "") -> None:
        """Mark consent as declined."""
        self.status = self.Status.DECLINED
        self.decline_reason = reason
        self.declined_at = timezone.now()
        self.save(update_fields=["status", "decline_reason", "declined_at", "updated_at"])

    def withdraw(self, reason: str = "") -> None:
        """Withdraw previously given consent."""
        self.status = self.Status.WITHDRAWN
        self.decline_reason = reason
        self.declined_at = timezone.now()
        self.save(update_fields=["status", "decline_reason", "declined_at", "updated_at"])


class ProcedureLog(TimeStampedModel):
    """
    Record of a performed procedure.

    Documents the actual performance including timing,
    staff involved, findings, and immediate outcome.
    """

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed Successfully"
        PARTIAL = "PARTIAL", "Partially Completed"
        ABANDONED = "ABANDONED", "Abandoned"
        COMPLICATED = "COMPLICATED", "Completed with Complications"

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
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="procedures_performed",
        help_text="Primary performer"
    )
    assistant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
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
        choices=Status.choices,
        default=Status.IN_PROGRESS,
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

    # =========================================================================
    # Multi-tenancy
    # =========================================================================
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_logs",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_logs",
        null=True,
        blank=True,
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

    # =========================================================================
    # State-transition methods
    # =========================================================================
    def complete(self, status: str = "COMPLETED", outcome: str = "") -> None:
        """Mark procedure as completed and update the parent order."""
        self.ended_at = timezone.now()
        self.status = status
        if outcome:
            self.immediate_outcome = outcome
        self.save(update_fields=[
            "ended_at", "status", "immediate_outcome",
            "actual_duration_minutes", "updated_at",
        ])
        self.order.complete()

    def abandon(self, reason: str = "") -> None:
        """Mark procedure as abandoned."""
        self.ended_at = timezone.now()
        self.status = self.Status.ABANDONED
        self.notes = reason
        self.save(update_fields=["ended_at", "status", "notes", "actual_duration_minutes", "updated_at"])
        self.order.cancel(user=self.performed_by, reason=f"Procedure abandoned: {reason}")


class ProcedureConsumable(models.Model):
    """
    Consumables used during a procedure.

    Tracks drugs/items used for inventory management
    and billing purposes. Stock is deducted via StockBatch.
    """

    log = models.ForeignKey(
        ProcedureLog,
        on_delete=models.CASCADE,
        related_name="consumables"
    )
    drug = models.ForeignKey(
        "pharmacy.Drug",
        on_delete=models.PROTECT,
        help_text="Drug/consumable from pharmacy catalog"
    )
    batch = models.ForeignKey(
        "pharmacy.StockBatch",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Specific batch used (for FEFO tracking)"
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
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )

    class Meta:
        ordering = ["log", "drug__name"]
        verbose_name = "Procedure Consumable"
        verbose_name_plural = "Procedure Consumables"

    def __str__(self):
        return f"{self.drug.name} x{self.quantity} for {self.log.order}"

    def save(self, *args, **kwargs):
        if self.unit_cost and self.quantity:
            self.total_cost = self.unit_cost * self.quantity
        is_new = self.pk is None
        super().save(*args, **kwargs)

        # Deduct from inventory on first save only
        if is_new:
            self._deduct_stock()

    def _deduct_stock(self):
        """
        Deduct consumable from pharmacy stock.

        Uses StockBatch directly — the pharmacy app does NOT have a
        StockMovement model. StockBatch tracks quantity_available and
        provides dispense()/return_stock() methods.
        """
        if self.batch:
            # Deduct from specific batch
            self.batch.quantity_available = max(
                0, self.batch.quantity_available - self.quantity
            )
            self.batch.save(update_fields=["quantity_available"])


class ProcedureOutcome(TimeStampedModel):
    """
    Outcome tracking for a procedure.

    Documents follow-up outcomes, healing progress,
    and any delayed complications.
    """

    class OutcomeStatus(models.TextChoices):
        SUCCESSFUL = "SUCCESSFUL", "Successful — Full recovery"
        PARTIAL_SUCCESS = "PARTIAL_SUCCESS", "Partial Success"
        HEALING = "HEALING", "Healing as expected"
        DELAYED_HEALING = "DELAYED_HEALING", "Delayed Healing"
        INFECTION = "INFECTION", "Infection"
        COMPLICATION = "COMPLICATION", "Post-procedure Complication"
        RE_PROCEDURE_NEEDED = "RE_PROCEDURE_NEEDED", "Re-procedure Needed"
        REFERRED = "REFERRED", "Referred for Further Care"

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
        choices=OutcomeStatus.choices,
    )
    findings = models.TextField(
        help_text="Clinical findings"
    )
    notes = models.TextField(
        blank=True,
        default=""
    )
    assessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
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

    # Multi-tenancy
    organization = models.ForeignKey(
        "core.Organization",
        on_delete=models.CASCADE,
        related_name="procedure_outcomes",
        null=True,
        blank=True,
    )
    facility = models.ForeignKey(
        "core.Facility",
        on_delete=models.CASCADE,
        related_name="procedure_outcomes",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-assessment_date"]
        verbose_name = "Procedure Outcome"
        verbose_name_plural = "Procedure Outcomes"

    def __str__(self):
        return f"Outcome: {self.log.order} - {self.get_outcome_display()}"
```

---

## 3. Serializers

```python
# backend/hmis/apps/procedures/serializers.py

from rest_framework import serializers


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
class ProcedureCatalogListSerializer(serializers.ModelSerializer):
    """Compact list view for search/dropdowns."""
    class Meta:
        model = ProcedureCatalog
        fields = [
            "id", "code", "name", "category", "body_system",
            "risk_level", "base_fee", "typical_duration_minutes",
            "consent_required", "is_active",
        ]


class ProcedureCatalogDetailSerializer(serializers.ModelSerializer):
    """Full detail including coding, consent template, and requirements."""
    class Meta:
        model = ProcedureCatalog
        fields = "__all__"


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------
class ProcedureOrderListSerializer(serializers.ModelSerializer):
    procedure_name = serializers.CharField(source="procedure.name", read_only=True)
    patient_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProcedureOrder
        fields = [
            "id", "order_number", "procedure", "procedure_name",
            "patient", "patient_name", "status", "priority",
            "scheduled_date", "scheduled_time", "is_overdue",
            "ordered_at",
        ]

    def get_patient_name(self, obj):
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class ProcedureOrderCreateSerializer(serializers.ModelSerializer):
    """Used for POST /api/procedures/orders/."""
    class Meta:
        model = ProcedureOrder
        fields = [
            "procedure", "patient", "encounter", "clinic_visit",
            "admission", "priority", "indication", "clinical_notes",
            "body_site", "laterality", "scheduled_date", "scheduled_time",
            "scheduled_location", "estimated_duration_minutes",
            "assigned_performer",
        ]


class ProcedureOrderDetailSerializer(serializers.ModelSerializer):
    procedure = ProcedureCatalogListSerializer(read_only=True)
    consent = serializers.SerializerMethodField()
    log = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ProcedureOrder
        fields = "__all__"

    def get_consent(self, obj):
        if hasattr(obj, "consent"):
            return ProcedureConsentSerializer(obj.consent).data
        return None

    def get_log(self, obj):
        if hasattr(obj, "log"):
            return ProcedureLogSerializer(obj.log).data
        return None


# ---------------------------------------------------------------------------
# Action serializers (for @action endpoints)
# ---------------------------------------------------------------------------
class ProcedureScheduleSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/schedule/"""
    scheduled_date = serializers.DateField()
    scheduled_time = serializers.TimeField(required=False)
    scheduled_location = serializers.CharField(required=False, default="")
    estimated_duration_minutes = serializers.IntegerField(required=False)


class ProcedureCancelSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/cancel/"""
    reason = serializers.CharField()


class ProcedureStartSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/start/"""
    location = serializers.CharField(required=False, default="")


class ProcedureCompleteSerializer(serializers.Serializer):
    """POST /api/procedures/orders/{id}/complete/"""
    status = serializers.ChoiceField(
        choices=["COMPLETED", "PARTIAL", "COMPLICATED"],
        default="COMPLETED",
    )
    immediate_outcome = serializers.CharField(required=False, default="")
    complications_occurred = serializers.BooleanField(required=False, default=False)
    complication_details = serializers.CharField(required=False, default="")


# ---------------------------------------------------------------------------
# Consent, Log, Consumable, Outcome serializers
# ---------------------------------------------------------------------------
class ProcedureConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsent
        fields = "__all__"


class ProcedureConsentCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsent
        fields = [
            "consent_type", "consent_text",
            "procedure_explained", "risks_explained",
            "alternatives_explained", "questions_answered",
            "signed_by_patient", "patient_signature",
            "signed_by_guardian", "guardian_name",
            "guardian_relationship", "guardian_id_number",
            "guardian_signature", "witness_required",
            "witness_name", "witness_signature",
        ]


class ProcedureLogSerializer(serializers.ModelSerializer):
    consumables = serializers.SerializerMethodField()

    class Meta:
        model = ProcedureLog
        fields = "__all__"

    def get_consumables(self, obj):
        return ProcedureConsumableSerializer(obj.consumables.all(), many=True).data


class ProcedureConsumableSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(source="drug.name", read_only=True)

    class Meta:
        model = ProcedureConsumable
        fields = "__all__"


class ProcedureConsumableCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureConsumable
        fields = ["drug", "batch", "quantity", "notes"]


class ProcedureOutcomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureOutcome
        fields = "__all__"


class ProcedureOutcomeCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcedureOutcome
        fields = [
            "assessment_date", "outcome", "findings",
            "notes", "next_follow_up", "follow_up_notes", "images",
        ]
```

---

## 4. Admin

```python
# backend/hmis/apps/procedures/admin.py

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    ProcedureCatalog, ProcedureKit, ProcedureKitItem,
    ProcedureOrder, ProcedureConsent, ProcedureLog,
    ProcedureConsumable, ProcedureOutcome,
)


class ProcedureKitItemInline(admin.TabularInline):
    model = ProcedureKitItem
    extra = 1


@admin.register(ProcedureCatalog)
class ProcedureCatalogAdmin(admin.ModelAdmin):
    list_display = ["code", "name", "category_badge", "risk_badge", "base_fee", "is_active"]
    list_filter = ["category", "risk_level", "body_system", "is_active", "facility"]
    search_fields = ["code", "name", "ichi_code", "cpt_code"]
    fieldsets = (
        ("Identification", {"fields": ("code", "name", "description", "category", "body_system", "risk_level")}),
        ("Standard Coding", {"fields": ("ichi_code", "cpt_code", "icd10_pcs_code")}),
        ("Consent", {"fields": ("consent_required", "consent_template", "guardian_consent_required", "witness_required")}),
        ("Clinical", {"fields": ("requires_anesthesia", "anesthesia_type", "typical_duration_minutes", "requires_fasting")}),
        ("Billing & SHA", {"fields": ("base_fee", "sha_tariff_code", "sha_package_code")}),
        ("Tenant", {"fields": ("organization", "facility")}),
    )

    @admin.display(description="Category")
    def category_badge(self, obj):
        colors = {"MINOR": "#3b82f6", "EMERGENCY": "#ef4444", "DIAGNOSTIC": "#8b5cf6"}
        bg = colors.get(obj.category, "#6b7280")
        return format_html('<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>', bg, obj.get_category_display())

    @admin.display(description="Risk")
    def risk_badge(self, obj):
        colors = {"LOW": "#22c55e", "MEDIUM": "#f59e0b", "HIGH": "#ef4444"}
        bg = colors.get(obj.risk_level, "#6b7280")
        return format_html('<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>', bg, obj.get_risk_level_display())


@admin.register(ProcedureKit)
class ProcedureKitAdmin(admin.ModelAdmin):
    list_display = ["name", "procedure", "is_default", "is_active"]
    list_filter = ["is_default", "is_active"]
    inlines = [ProcedureKitItemInline]


@admin.register(ProcedureOrder)
class ProcedureOrderAdmin(admin.ModelAdmin):
    list_display = ["order_number", "procedure", "patient", "status_badge", "priority", "scheduled_date", "ordered_at"]
    list_filter = ["status", "priority", "facility"]
    search_fields = ["order_number", "patient__first_name", "patient__last_name"]
    raw_id_fields = ["patient", "encounter", "clinic_visit", "admission", "ordered_by", "assigned_performer"]
    readonly_fields = ["order_number", "ordered_at"]

    @admin.display(description="Status")
    def status_badge(self, obj):
        colors = {
            "ORDERED": "#3b82f6", "CONSENT_PENDING": "#f59e0b",
            "SCHEDULED": "#8b5cf6", "READY": "#06b6d4",
            "IN_PROGRESS": "#f97316", "COMPLETED": "#22c55e",
            "CANCELLED": "#ef4444",
        }
        bg = colors.get(obj.status, "#6b7280")
        return format_html('<span style="background:{}; color:#fff; padding:2px 8px; border-radius:4px;">{}</span>', bg, obj.get_status_display())


@admin.register(ProcedureLog)
class ProcedureLogAdmin(admin.ModelAdmin):
    list_display = ["order", "performed_by", "status", "started_at", "ended_at", "actual_duration_minutes"]
    list_filter = ["status", "facility"]
    raw_id_fields = ["order", "performed_by", "assistant"]
```

---

## 5. API Endpoints

```
# Procedure Catalog (Reference)
GET    /api/procedures/catalog/                    # List (filterable by category, body_system, is_active)
GET    /api/procedures/catalog/{id}/               # Detail
GET    /api/procedures/catalog/?search=            # Search by name/code

# Procedure Orders
GET    /api/procedures/orders/                     # List (filterable by status, patient, date range)
POST   /api/procedures/orders/                     # Create order
GET    /api/procedures/orders/{id}/                # Detail (includes nested consent + log)
PATCH  /api/procedures/orders/{id}/                # Update order fields

# Order workflow @actions
POST   /api/procedures/orders/{id}/schedule/       # Schedule procedure
POST   /api/procedures/orders/{id}/start/          # Start → creates ProcedureLog
POST   /api/procedures/orders/{id}/complete/       # Complete procedure
POST   /api/procedures/orders/{id}/cancel/         # Cancel with reason

# Consent (nested under order)
GET    /api/procedures/orders/{id}/consent/        # Get consent
POST   /api/procedures/orders/{id}/consent/        # Create consent
POST   /api/procedures/orders/{id}/consent/sign/   # Sign consent
POST   /api/procedures/orders/{id}/consent/decline/ # Decline consent

# Consumables (nested under order's log)
GET    /api/procedures/orders/{id}/consumables/    # List consumables used
POST   /api/procedures/orders/{id}/consumables/    # Add consumable

# Outcomes (nested under order's log)
GET    /api/procedures/orders/{id}/outcomes/       # List outcomes
POST   /api/procedures/orders/{id}/outcomes/       # Add outcome

# Dashboard
GET    /api/procedures/dashboard/                  # Stats: scheduled_today, pending_consent, in_progress, completed_today
```

---

## 6. Frontend Implementation

### 6.1 TypeScript Types

```typescript
// web-app/lib/types/procedure.ts

export interface ProcedureCatalogEntry {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  body_system: string;
  risk_level: string;
  ichi_code: string;
  cpt_code: string;
  consent_required: boolean;
  typical_duration_minutes: number;
  base_fee: number | null;
  sha_tariff_code: string;
  is_active: boolean;
}

export interface ProcedureOrder {
  id: number;
  order_number: string;
  procedure: ProcedureCatalogEntry;
  patient: number;
  patient_name: string;
  status: ProcedureOrderStatus;
  priority: string;
  indication: string;
  body_site: string;
  laterality: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_location: string;
  ordered_at: string;
  is_overdue: boolean;
  consent: ProcedureConsent | null;
  log: ProcedureLog | null;
}

export type ProcedureOrderStatus =
  | "ORDERED"
  | "CONSENT_PENDING"
  | "SCHEDULED"
  | "READY"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export interface ProcedureConsent {
  id: number;
  status: "PENDING" | "SIGNED" | "DECLINED" | "WITHDRAWN";
  consent_type: string;
  procedure_explained: boolean;
  risks_explained: boolean;
  signed_by_patient: boolean;
  patient_signed_at: string | null;
  signed_by_guardian: boolean;
}

export interface ProcedureLog {
  id: number;
  started_at: string;
  ended_at: string | null;
  actual_duration_minutes: number | null;
  status: string;
  immediate_outcome: string;
  complications_occurred: boolean;
  consumables: ProcedureConsumable[];
}

export interface ProcedureConsumable {
  id: number;
  drug: number;
  drug_name: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
}

export interface ProcedureOutcome {
  id: number;
  assessment_date: string;
  outcome: string;
  findings: string;
  next_follow_up: string | null;
}

export interface ProcedureDashboard {
  scheduled_today: number;
  pending_consent: number;
  in_progress: number;
  completed_today: number;
}
```

### 6.2 Zod Schemas

```typescript
// web-app/lib/schemas/procedure.schema.ts

import { z } from "zod";

export const ProcedureCatalogListSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  category: z.string(),
  body_system: z.string(),
  risk_level: z.string(),
  base_fee: z.number().nullable(),
  typical_duration_minutes: z.number(),
  consent_required: z.boolean(),
  is_active: z.boolean(),
});

export const ProcedureOrderListSchema = z.object({
  id: z.number(),
  order_number: z.string(),
  procedure_name: z.string(),
  patient_name: z.string(),
  status: z.string(),
  priority: z.string(),
  scheduled_date: z.string().nullable(),
  is_overdue: z.boolean(),
  ordered_at: z.string(),
});

export const ProcedureDashboardSchema = z.object({
  scheduled_today: z.number(),
  pending_consent: z.number(),
  in_progress: z.number(),
  completed_today: z.number(),
});
```

### 6.3 API Client

```typescript
// web-app/lib/api/procedures.ts

import { apiClient } from "./client";
import { parseResponse } from "@/lib/schemas/validation";
import {
  ProcedureCatalogListSchema,
  ProcedureOrderListSchema,
  ProcedureDashboardSchema,
} from "@/lib/schemas/procedure.schema";

export const proceduresApi = {
  // Catalog
  listCatalog: async (params?: Record<string, string>) => {
    const response = await apiClient.get("/api/procedures/catalog/", { params });
    return parseResponse(
      z.array(ProcedureCatalogListSchema),
      response.data.results ?? response.data,
      { context: "proceduresApi.listCatalog" },
    );
  },

  // Orders
  listOrders: async (params?: Record<string, string>) => {
    const response = await apiClient.get("/api/procedures/orders/", { params });
    return parseResponse(
      z.array(ProcedureOrderListSchema),
      response.data.results ?? response.data,
      { context: "proceduresApi.listOrders" },
    );
  },
  createOrder: async (data: Record<string, unknown>) => {
    const response = await apiClient.post("/api/procedures/orders/", data);
    return response.data;
  },
  getOrder: async (id: number) => {
    const response = await apiClient.get(`/api/procedures/orders/${id}/`);
    return response.data;
  },

  // Workflow actions
  scheduleOrder: async (id: number, data: { scheduled_date: string; scheduled_time?: string }) => {
    const response = await apiClient.post(`/api/procedures/orders/${id}/schedule/`, data);
    return response.data;
  },
  startProcedure: async (id: number) => {
    const response = await apiClient.post(`/api/procedures/orders/${id}/start/`);
    return response.data;
  },
  completeProcedure: async (id: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(`/api/procedures/orders/${id}/complete/`, data);
    return response.data;
  },
  cancelOrder: async (id: number, reason: string) => {
    const response = await apiClient.post(`/api/procedures/orders/${id}/cancel/`, { reason });
    return response.data;
  },

  // Consent
  getConsent: async (orderId: number) => {
    const response = await apiClient.get(`/api/procedures/orders/${orderId}/consent/`);
    return response.data;
  },
  createConsent: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(`/api/procedures/orders/${orderId}/consent/`, data);
    return response.data;
  },

  // Consumables
  addConsumable: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(`/api/procedures/orders/${orderId}/consumables/`, data);
    return response.data;
  },

  // Outcomes
  addOutcome: async (orderId: number, data: Record<string, unknown>) => {
    const response = await apiClient.post(`/api/procedures/orders/${orderId}/outcomes/`, data);
    return response.data;
  },

  // Dashboard
  getDashboard: async () => {
    const response = await apiClient.get("/api/procedures/dashboard/");
    return parseResponse(ProcedureDashboardSchema, response.data, {
      context: "proceduresApi.getDashboard",
    });
  },
};
```

### 6.4 Navigation Entry

```typescript
// Add to web-app/lib/config/navigation.ts
{
  title: "Procedures",
  href: "/procedures",
  icon: Scissors,           // from lucide-react
  moduleKey: "procedures",
  facilityModule: "procedures",
}
```

### 6.5 Page Structure (flattened — detail page with tabs, not nested routes)

```
web-app/app/(dashboard)/procedures/
├── page.tsx                        # Dashboard: stats cards + today's list + quick order
├── orders/
│   ├── page.tsx                    # All orders list (filterable, paginated)
│   └── [orderId]/
│       └── page.tsx                # Order detail with tabs: Overview | Consent | Perform | Outcomes
├── catalog/
│   └── page.tsx                    # Procedure catalog browser
└── reports/
    └── page.tsx                    # Procedure reports / DHIS2 export
```

> **Convention note**: Consent and performance are handled as **tabs or dialogs** on the order detail page, not as separate nested routes. This matches the `billing/invoices/[id]` and `inpatient/admissions/[id]` patterns.

### 6.6 Key Components

```typescript
// Order Procedure Dialog (used in Encounter and Clinic Visit)
interface OrderProcedureDialogProps {
  encounter?: Encounter;
  clinicVisit?: ClinicVisit;
  patient: Patient;
  onSuccess: (order: ProcedureOrder) => void;
}

// Consent Tab/Dialog (on order detail page)
interface ConsentFormProps {
  order: ProcedureOrder;
  onConsentObtained: (consent: ProcedureConsent) => void;
}

// Perform Tab (on order detail page)
interface ProcedurePerformanceProps {
  order: ProcedureOrder;
  onComplete: (log: ProcedureLog) => void;
}

// Consumable Picker (within Perform tab)
interface ConsumablePickerProps {
  log: ProcedureLog;
  defaultKit?: ProcedureKit;
  onAdd: (consumable: ProcedureConsumable) => void;
}
```

### 6.7 Procedure Dashboard Wireframe

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

## 7. Integration Points

### 7.1 Encounter Integration

```python
# In encounter consultation view — thin view delegates to model
class EncounterViewSet:
    @action(detail=True, methods=["post"])
    def order_procedure(self, request, pk=None):
        """Order a procedure from an encounter."""
        encounter = self.get_object()
        serializer = ProcedureOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = serializer.save(
            encounter=encounter,
            patient=encounter.patient,
            ordered_by=request.user,
            organization=request.facility.organization if request.facility else None,
            facility=request.facility,
        )

        return Response(ProcedureOrderDetailSerializer(order).data, status=201)
```

### 7.2 Pharmacy Integration

```python
# Consumable stock deduction uses StockBatch directly.
# The pharmacy app does NOT have a StockMovement model.
# StockBatch.quantity_available is decremented in ProcedureConsumable._deduct_stock().
#
# To query procedure-related consumption:
ProcedureConsumable.objects.filter(
    log__order__facility=facility,
    recorded_at__date=date.today(),
)
```

### 7.3 Billing Integration

```python
def _generate_procedure_billing(order):
    """Generate billing line items for procedure."""
    from hmis.apps.billing.models import Invoice, InvoiceItem

    invoice = Invoice.objects.filter(
        patient=order.patient,
        status__in=["proforma", "draft", "pending"],
    ).first()

    if not invoice:
        invoice = Invoice.objects.create(
            patient=order.patient,
            organization=order.organization,
            facility=order.facility,
            created_by=order.ordered_by,
        )

    if order.procedure.base_fee:
        InvoiceItem.objects.create(
            invoice=invoice,
            description=f"Procedure: {order.procedure.name}",
            quantity=1,
            unit_price=order.procedure.base_fee,
        )
```

### 7.4 SHA Claims Integration

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

### 7.5 Scheduling Integration

```python
# For procedures that need formal appointment booking, link to scheduling app:
from hmis.apps.scheduling.models import Appointment, Resource

# Create appointment, then link to order
appointment = Appointment.objects.create(
    resource=procedure_room_resource,  # scheduling.Resource (type=PLACE)
    patient=order.patient,
    start_time=...,
    end_time=...,
)
order.appointment = appointment
order.save(update_fields=["appointment"])
```

---

## 8. Implementation Phases (13-step full-stack pattern)

### Phase 2.3a (Week 5): Backend Models & Migration

| Step | Task | Deliverable |
|------|------|-------------|
| 1 | Create `procedures` Django app | `hmis/apps/procedures/` with `apps.py` |
| 2 | Implement models with TextChoices + multi-tenancy | `models.py` — all 8 models |
| 3 | Register in `INSTALLED_APPS` | `settings/base.py` |
| 4 | Create & apply migration | `0001_initial.py` |
| 5 | Implement serializers | `serializers.py` — list, detail, create, action serializers |
| 6 | Implement ViewSets with `get_serializer_class()` | `views.py` |
| 7 | Register URLs | `urls.py` + include in `hmis/urls.py` |
| 8 | Implement admin | `admin.py` with colored badges, fieldsets |

### Phase 2.3b (Week 6): Backend Tests & Seed Data

| Step | Task | Target |
|------|------|--------|
| 9 | Model tests (creation, state transitions, validation) | 30+ tests |
| 10 | Serializer validation tests | 20+ tests |
| 11 | API endpoint tests (CRUD + workflow actions) | 30+ tests |
| 12 | Seed initial procedure catalog | Management command |
| 13 | Verify: `make test` ≥80% coverage | CI gate |

### Phase 2.4a (Week 7): Frontend Types, Schemas, API Client

| Step | Task | Deliverable |
|------|------|-------------|
| 1 | TypeScript interfaces | `lib/types/procedure.ts` |
| 2 | Zod schemas | `lib/schemas/procedure.schema.ts` |
| 3 | API client with `parseResponse()` | `lib/api/procedures.ts` |
| 4 | Navigation entry | `lib/config/navigation.ts` |

### Phase 2.4b (Week 8): Frontend Pages

| Step | Task | Deliverable |
|------|------|-------------|
| 5 | Procedures dashboard page | `procedures/page.tsx` |
| 6 | Orders list page | `procedures/orders/page.tsx` |
| 7 | Order detail page (tabs: Overview, Consent, Perform, Outcomes) | `procedures/orders/[orderId]/page.tsx` |
| 8 | Procedure catalog browser | `procedures/catalog/page.tsx` |
| 9 | Order Procedure dialog (reusable from encounters/clinics) | `components/procedures/` |
| 10 | Verify: `npx tsc --noEmit` | No type errors |

### Phase 2.5 (Weeks 9-10): Integration & Testing

- [ ] Encounter → Order Procedure integration
- [ ] Billing auto-generation on order
- [ ] Pharmacy stock deduction on consumable add
- [ ] SHA claims integration
- [ ] Procedure reports page
- [ ] E2E testing
- [ ] Update DHA compliance roadmap

---

## 9. Seed Data: Initial Procedure Catalog

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

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Unit test coverage | ≥80% |
| Backend tests | 80+ (model, serializer, API) |
| `make quality` | Passes (ruff + mypy + bandit) |
| Procedure ordering time | <1 min |
| Consent completion time | <3 min |
| Consumable deduction accuracy | 100% |
| Billing generation accuracy | 100% |
| Frontend type-check | `npx tsc --noEmit` passes |
| Zod validation | All API responses validated |

---

## Appendix A: Related Documents

- [Clinics Module Implementation Plan](clinics-module-implementation-plan.md)
- [ROADMAP.md](../ROADMAP.md)
- [ideal-patient-flow.md](ideal-patient-flow.md)
- [SHA Integration Guide](sha-frontend-integration-guide.md)
- [Coding Standards](coding-standards.md)
- [TDD Guidelines](tdd-guidelines.md)

## Appendix B: Key Compatibility Notes

| Convention | How this plan aligns |
|---|---|
| **Multi-tenancy** (`organization` + `facility`) | Added to ProcedureCatalog, ProcedureOrder, ProcedureConsent, ProcedureLog, ProcedureOutcome |
| **TextChoices enums** | All choice fields use inner `TextChoices` classes |
| **User FK** | `settings.AUTH_USER_MODEL` (not `"auth.User"`) |
| **Pharmacy integration** | Uses `pharmacy.Drug` (catalog) + `pharmacy.StockBatch` (inventory) — not phantom `StockItem`/`StockMovement` |
| **State-transition methods on model** | `ProcedureOrder`: `request_consent()`, `schedule()`, `mark_ready()`, `start_procedure()`, `complete()`, `cancel()` |
| **Serializer-per-action** | `get_serializer_class()` returns list/detail/create/action serializers |
| **Frontend route convention** | Flat routes with detail-page tabs (not nested `/consent/`, `/perform/` routes) |
| **Scheduling app** | Optional `scheduling.Appointment` FK on ProcedureOrder |
| **Theatre boundary** | Category `SURGICAL` reserved for future theatre app; this module covers minor/outpatient only |

---

**Document Status**: Revised v2.0
**Last Review**: March 30, 2026
**Owner**: Engineering Lead

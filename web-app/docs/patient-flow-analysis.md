# Vitora HMIS - Patient Flow Implementation Analysis

> **Analysis Date**: February 9, 2026
> **Codebase Version**: Current develop branch
> **Analyst**: GitHub Copilot (Claude Opus 4.5)

---

## Executive Summary

This document provides a comprehensive analysis of how patient flow is implemented in the Vitora HMIS codebase. The system has a well-architected foundation with many core components in place, though some areas need completion for a fully cohesive patient journey.

**Overall Assessment**: 🟡 **Partially Complete** - Core infrastructure is solid; some workflow gaps remain.

---

## 1. Patient Identification / Resolution

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/patients/models.py](../backend/hmis/apps/patients/models.py), [backend/hmis/apps/checkin/views.py](../backend/hmis/apps/checkin/views.py)

The system supports multiple identification methods:

| Method | Field | Implementation |
|--------|-------|----------------|
| **MRN** | `Patient.mrn` | Auto-generated `MRN-YYYYMMDD-XXXX`, unique, immutable |
| **Client Registry** | `Patient.cr_number` | Kenya HIE integration (CR-XXXXXXXXXX-X format) |
| **SHA Number** | `Patient.sha_number` | Social Health Authority member number |
| **National ID** | `Patient.identification_number` + `identification_type` | Flexible ID types (national_id, passport, alien_id, etc.) |
| **Phone Number** | `Patient.phone_number` | Searchable, normalized |

**Patient Lookup Service** ([checkin/views.py#L63-L112](../backend/hmis/apps/checkin/views.py)):
```python
# Search priority:
1. Exact MRN match
2. MRN prefix match
3. Phone number (normalized)
4. Identification number
5. Name search (first + last)
```

**Duplicate Prevention**:
```python
# Unique constraint prevents duplicate patients with same ID
models.UniqueConstraint(
    fields=["identification_type", "identification_number"],
    condition=models.Q(identification_number__isnull=False) & ~models.Q(identification_number=""),
    name="unique_patient_identification",
)
```

### Frontend Contract
- **Type**: [web-app/lib/types/patient.ts](../web-app/lib/types/patient.ts) - `Patient`, `IdentificationType`
- **API**: [web-app/lib/api/patients.ts](../web-app/lib/api/patients.ts) - `patientsApi`
- **Schema**: [web-app/lib/schemas/patient.schema.ts](../web-app/lib/schemas/patient.schema.ts) - Zod validation

### Gaps
- ❌ **Biometric integration** - Field exists in CheckIn but no implementation
- ❌ **QR code patient ID** - qr_utils.py exists in core but not tied to patient lookup

---

## 2. Visit Context / Visit Reason Taxonomy

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/encounters/models.py#L482-L495](../backend/hmis/apps/encounters/models.py), [backend/hmis/apps/checkin/models.py#L46-L62](../backend/hmis/apps/checkin/models.py)

The system has a comprehensive visit reason taxonomy:

```python
# Encounter.VISIT_REASON_CHOICES
VISIT_REASON_CHOICES = [
    ("NEW_COMPLAINT", "New Complaint"),
    ("FOLLOW_UP", "Follow-up"),
    ("CHRONIC_CARE", "Chronic Care Review"),
    ("PROCEDURE_REVIEW", "Post-Procedure Review"),
    ("REFILL_ONLY", "Medication Refill Only"),
    ("LAB_REVIEW", "Lab Results Review"),
    ("REFERRAL_VISIT", "Referral from Another Facility"),
    ("OTHER", "Other"),
]
```

**Visit Type Detection** ([checkin/services.py#L136-L188](../backend/hmis/apps/checkin/services.py)):
```python
def determine_visit_context(patient) -> VisitContext:
    """Auto-detects visit type based on patient history:
    1. No previous visits → NEW patient
    2. Has pending results → LAB_REVIEW (skip triage)
    3. Visit within 30 days → FOLLOW_UP
    4. Has chronic conditions → CHRONIC_CARE
    5. Otherwise → RETURN visit
    """
```

**Triage Skip Logic**:
```python
# Visit reasons that skip triage (from web-app/lib/types/encounter.ts)
SKIP_TRIAGE_REASONS: VisitReason[] = ['LAB_REVIEW', 'REFILL_ONLY'];
```

### Frontend Contract
- **Type**: [web-app/lib/types/checkin.ts](../web-app/lib/types/checkin.ts) - `VisitType`, `VisitReason`
- **Options**: `VISIT_TYPE_OPTIONS`, `VISIT_REASON_OPTIONS` with `skipTriage` flag

---

## 3. Admin Check-In Process

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/checkin/](../backend/hmis/apps/checkin/)

The check-in module provides a comprehensive workflow:

**CheckIn Model** ([checkin/models.py](../backend/hmis/apps/checkin/models.py)):
```python
class CheckIn(TimeStampedModel):
    patient = ForeignKey("patients.Patient")
    encounter = ForeignKey("encounters.Encounter", null=True)
    linked_encounter = ForeignKey("encounters.Encounter", null=True)  # For follow-ups
    
    # Routing
    destination_type = CharField(choices=["TRIAGE", "CLINIC"])
    destination_clinic = ForeignKey("clinics.Clinic", null=True)
    skip_triage = BooleanField(default=False)
    
    # Classification
    visit_type = CharField(choices=["NEW", "RETURN", "FOLLOW_UP", "EMERGENCY", "SCHEDULED"])
    visit_reason = CharField(choices=VISIT_REASON_CHOICES)
    
    # Identity verification
    identity_method = CharField(choices=["MRN", "NATIONAL_ID", "PHONE", "BIOMETRIC", "MANUAL"])
    
    # Status tracking
    status = CharField(choices=["WAITING", "IN_TRIAGE", "TRIAGED", "IN_CONSULTATION", "COMPLETED", "CANCELLED", "NO_SHOW"])
    
    # Queue links
    waiting_queue_entry = ForeignKey("triage.WaitingQueue", null=True)
    clinic_visit = ForeignKey("clinics.ClinicVisit", null=True)
```

**Check-In API** ([checkin/views.py](../backend/hmis/apps/checkin/views.py)):
```
POST /api/checkin/patients/{patient_id}/checkin/
GET  /api/checkin/today/
GET  /api/checkin/lookup/?q={query}
```

**State History Tracking**:
```python
class CheckInStateHistory(models.Model):
    checkin = ForeignKey(CheckIn)
    from_status = CharField()
    to_status = CharField()
    changed_at = DateTimeField()
    changed_by = ForeignKey(User)
    reason = TextField()
```

### Frontend
- **Page**: [web-app/app/(dashboard)/patients/checkin/page.tsx](../web-app/app/(dashboard)/patients/checkin/page.tsx)
- **API**: [web-app/lib/api/checkin.ts](../web-app/lib/api/checkin.ts)
- **Types**: [web-app/lib/types/checkin.ts](../web-app/lib/types/checkin.ts)

### Gaps
- ⚠️ **Demographic update at check-in** - Not explicitly prompted; patient record can be edited separately
- ❌ **Insurance/payment mode selection** - Types exist but not integrated into check-in flow

---

## 4. Pre-Encounter Clinical Snapshot

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/checkin/services.py#L25-L131](../backend/hmis/apps/checkin/services.py)

The system generates a clinical snapshot during patient lookup:

```python
@dataclass
class ClinicalSnapshot:
    allergies: list[str]
    active_conditions: list[str]
    current_medications: list[str]
    last_visit_date: Optional[date]
    last_visit_clinic: Optional[str]
    pending_results: list[dict]  # Lab results awaiting
    alerts: list[str]           # Critical warnings

def get_clinical_snapshot(patient) -> ClinicalSnapshot:
    """Aggregates data from:
    - Most recent encounter (allergies, conditions, medications)
    - Pending lab results (ORDERED, COLLECTED, PROCESSING)
    - Critical alerts (severe allergies, overdue follow-ups)
    """
```

**Alert Generation**:
```python
# Auto-generated alerts:
- "⚠️ SEVERE ALLERGY: Check allergy list before prescribing"
- "Allergy alert: Patient has documented allergies"
- "Pending lab results: {N} test(s) awaiting"
- "Overdue for chronic care review ({days} days since last visit)"
```

### Frontend Contract
```typescript
// web-app/lib/types/checkin.ts
interface ClinicalSnapshot {
  allergies: string[];
  active_conditions: string[];
  current_medications: string[];
  last_visit_date: string | null;
  last_visit_clinic: string | null;
  pending_results: PendingResult[];
  alerts: string[];
}
```

### Gaps
- ⚠️ **Snapshot not persisted** - Generated on-demand at lookup, not stored with encounter
- ❌ **No clinician-facing display** - Snapshot shown at check-in but not prominently in encounter view

---

## 5. Encounter State Machine

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/encounters/models.py#L369-L394](../backend/hmis/apps/encounters/models.py), [backend/hmis/apps/encounters/services.py](../backend/hmis/apps/encounters/services.py)

The system implements a sophisticated 10-state encounter lifecycle:

```python
STATUS_CHOICES = [
    ("CREATED", "Created"),
    ("CHECKED_IN", "Checked In"),
    ("TRIAGED", "Triaged"),
    ("IN_PROGRESS", "In Progress"),
    ("ON_HOLD", "On Hold"),
    ("ORDERS_PLACED", "Orders Placed"),
    ("RESULTS_PENDING", "Results Pending"),
    ("READY_TO_CLOSE", "Ready to Close"),
    ("CLOSED", "Closed"),
    ("CANCELLED", "Cancelled"),
]
```

**Transition Rules**:
```python
VALID_TRANSITIONS = {
    "CREATED": {"CHECKED_IN", "CANCELLED"},
    "CHECKED_IN": {"TRIAGED", "IN_PROGRESS", "CANCELLED"},
    "TRIAGED": {"IN_PROGRESS", "CANCELLED"},
    "IN_PROGRESS": {"ON_HOLD", "ORDERS_PLACED", "READY_TO_CLOSE", "CANCELLED"},
    "ON_HOLD": {"IN_PROGRESS", "CANCELLED"},
    "ORDERS_PLACED": {"RESULTS_PENDING", "READY_TO_CLOSE"},
    "RESULTS_PENDING": {"READY_TO_CLOSE"},
    "READY_TO_CLOSE": {"CLOSED"},
    "CLOSED": set(),  # Terminal - immutable
    "CANCELLED": set(),  # Terminal
}
```

**State Machine Service**:
```python
class EncounterStateMachine:
    @staticmethod
    def transition(encounter, to_status, user, reason="", ip_address=None):
        """Validates transition, updates status, creates audit trail."""
```

**Immutability Enforcement**:
```python
def can_edit(self) -> bool:
    """CLOSED and CANCELLED encounters are immutable."""
    return self.status not in ("CLOSED", "CANCELLED")
```

**Unique Active Encounter Constraint**:
```python
models.UniqueConstraint(
    fields=["patient"],
    condition=models.Q(status="IN_PROGRESS"),
    name="unique_active_encounter_per_patient",
)
```

### Frontend Contract
- **Types**: [web-app/lib/types/encounter.ts#L181-L226](../web-app/lib/types/encounter.ts)
- **API**: `encountersApi.transition(id, { to_status, reason })`

---

## 6. Triage / Vitals Flow

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/triage/](../backend/hmis/apps/triage/), [backend/hmis/apps/encounters/models.py#L146-L196](../backend/hmis/apps/encounters/models.py)

**Triage Requirement Mapping by Encounter Type**:
```python
ENCOUNTER_TYPE_TRIAGE_MAP = {
    # MANDATORY triage types
    "OPD": "MANDATORY",
    "EMERGENCY": "MANDATORY",
    "ANC": "MANDATORY",
    "PAEDIATRIC": "MANDATORY",
    "DIALYSIS": "MANDATORY",
    "ONCOLOGY": "MANDATORY",
    
    # OPTIONAL triage types
    "SCHEDULED_OPD": "OPTIONAL",
    "FOLLOW_UP": "OPTIONAL",
    "CHRONIC_STABLE": "OPTIONAL",
    "SPECIALIST_CLINIC": "OPTIONAL",
    
    # NOT_REQUIRED triage types
    "PROCEDURE": "NOT_REQUIRED",
    "DAY_CASE": "NOT_REQUIRED",
    "WARD_ROUND": "NOT_REQUIRED",
    "DISCHARGE_REVIEW": "NOT_REQUIRED",
}
```

**Triage Status Workflow**:
```python
TRIAGE_STATUS_CHOICES = [
    ("PENDING", "Pending - Awaiting triage"),
    ("IN_PROGRESS", "In Progress - Being triaged"),
    ("COMPLETED", "Completed - Triage done"),
    ("BYPASSED", "Bypassed - Triage skipped"),
    ("NOT_APPLICABLE", "Not Applicable - Triage not required"),
]
```

**Triage Bypass with Justification**:
```python
TRIAGE_BYPASS_REASON_CHOICES = [
    ("STABLE_FOLLOW_UP", "Stable follow-up patient"),
    ("CONSULTANT_DECISION", "Consultant/senior decision"),
    ("CHRONIC_CARE_REVIEW", "Chronic care review"),
    ("STAFF_SHORTAGE", "Staff shortage"),
    ("PATIENT_PREFERENCE", "Patient preference"),
    ("OTHER", "Other reason"),
]
```

**KETA Triage Categories** ([triage/models.py#L276-L295](../backend/hmis/apps/triage/models.py)):
```python
TRIAGE_CATEGORY_CHOICES = [
    ("RED", "Emergency - Immediate"),
    ("ORANGE", "Very Urgent - <10 min"),
    ("YELLOW", "Urgent - <60 min"),
    ("GREEN", "Standard - <240 min"),
    ("BLUE", "Non-Urgent/Referral"),
]
```

**Triage Assessment Model**:
- Linked to encounter via `OneToOneField`
- Captures AVPU mental status, mobility, arrival mode
- Full vitals with age-appropriate thresholds
- Auto-calculates KETA category

**Vitals Flow to Encounter**:
```python
# Vitals can be recorded in:
vitals_source = CharField(choices=["TRIAGE", "CONSULTATION", "NURSING"])
vitals_recorded_by = ForeignKey(User)
vitals_recorded_at = DateTimeField()
```

### Validation Rule
```python
# MANDATORY triage cannot be bypassed
if self.triage_requirement == "MANDATORY" and self.triage_status == "BYPASSED":
    raise ValidationError("Mandatory triage cannot be bypassed...")
```

---

## 7. Clinical Encounter / Follow-Up Linking

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/encounters/models.py#L490-L512](../backend/hmis/apps/encounters/models.py)

**Encounter Linking (Sprint 2 - Phase 2B)**:
```python
# Self-referential FK for follow-up chain
linked_encounter = models.ForeignKey(
    "self",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="follow_up_encounters",
    help_text="Previous encounter this visit is following up on",
)
```

**Check-In Also Tracks Prior Encounter**:
```python
# checkin/models.py
linked_encounter = models.ForeignKey(
    "encounters.Encounter",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="follow_up_checkins",
)
```

**Clinician Assignment / Claim System**:
```python
assigned_clinician = models.ForeignKey(User, related_name="assigned_encounters")
claimed_at = models.DateTimeField()

# Prevents reassigning active encounters
if original.assigned_clinician != self.assigned_clinician and original.status == "IN_PROGRESS":
    raise ValidationError("This encounter is already being attended by...")
```

**Immutability**:
- CLOSED and CANCELLED encounters cannot be edited
- `can_edit()` method enforces this

### Frontend API
```typescript
// Get related encounters
encountersApi.getRelated(id): Promise<RelatedEncounter[]>

// Claim/release workflow
encountersApi.claim(id): Promise<EncounterClaimResponse>
encountersApi.release(id): Promise<EncounterReleaseResponse>
```

---

## 8. Orders & Fulfillment

### 8.1 Laboratory Orders ✅ **Well Implemented**

**Location**: [backend/hmis/apps/laboratory/models.py](../backend/hmis/apps/laboratory/models.py)

**LabOrder Model**:
```python
ORDER_STATUS = [
    ("DRAFT", "Draft"),
    ("ORDERED", "Ordered"),
    ("SPECIMEN_COLLECTED", "Specimen Collected"),
    ("IN_PROGRESS", "In Progress"),
    ("COMPLETED", "Completed"),
    ("CANCELLED", "Cancelled"),
    ("REJECTED", "Rejected"),
]

# Valid transitions enforced
STATUS_TRANSITIONS = {
    "DRAFT": ["ORDERED", "CANCELLED"],
    "ORDERED": ["SPECIMEN_COLLECTED", "CANCELLED", "REJECTED"],
    "SPECIMEN_COLLECTED": ["IN_PROGRESS", "REJECTED"],
    "IN_PROGRESS": ["COMPLETED"],
    "COMPLETED": [],
    "CANCELLED": [],
    "REJECTED": [],
}
```

**Key Features**:
- Test catalog with LOINC codes for interoperability
- In-house vs external lab routing
- Priority levels (ROUTINE, URGENT, STAT)
- Specimen tracking with collector info
- Result entry with abnormal flagging (age/gender-aware normal ranges)

### 8.2 Pharmacy / Prescriptions ✅ **Well Implemented**

**Location**: [backend/hmis/apps/pharmacy/models.py](../backend/hmis/apps/pharmacy/models.py)

**Drug Catalog**:
```python
class Drug(models.Model):
    code = CharField(unique=True)
    generic_name = CharField()
    categories = JSONField()  # Multiple categories allowed
    form = CharField(choices=DRUG_FORMS)
    strength = CharField()
    schedule = CharField(choices=["OTC", "POM", "P", "CD"])
    is_controlled = BooleanField()
    keml_code = CharField()  # Kenya Essential Medicines List
```

**Prescription Model**:
- Auto-generated prescription number (`RX-YYYYMMDD-XXXX`)
- Linked to encounter
- Stock batch tracking for dispensing
- KEML/NHIF code integration

### 8.3 Imaging Orders ⚠️ **Partially Implemented**

**Location**: [backend/hmis/apps/imaging/](../backend/hmis/apps/imaging/)

The imaging module exists but is less mature than lab/pharmacy.

---

## 9. Billing Integration

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/billing/models.py](../backend/hmis/apps/billing/models.py)

**Invoice Model**:
```python
class Invoice(models.Model):
    # Linkage
    patient = ForeignKey("patients.Patient")
    encounter = ForeignKey("encounters.Encounter", null=True)
    clinic_visit = ForeignKey("clinics.ClinicVisit", null=True)
    
    # Status lifecycle
    Status = TextChoices(
        "PROFORMA", "DRAFT", "PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED", "WRITTEN_OFF"
    )
    
    # Payment types
    PaymentType = TextChoices("CASH", "MPESA", "INSURANCE", "CORPORATE", "MIXED")
    
    # Insurance/SHA integration
    insurance_provider = CharField()
    sha_claim_number = CharField()
    insurance_coverage = DecimalField()  # Percentage
```

**Key Features**:
- Proforma invoice support with validity dates
- Proforma → Invoice conversion (partial or full)
- Discount support (percentage or fixed)
- Payment recording with status updates
- SHA claims integration fields

### Billing Approach: **Parallel, Not Afterthought** ✅

Evidence of billing as first-class citizen:
1. `InvoiceItem` links to `Service`, `Drug`, `Dispensing`, `LabOrder`
2. Line items created when orders are placed
3. Status can be PENDING while clinical work continues
4. Encounter can close before payment (billing is separate workflow)

### Gap
- ⚠️ **Auto-invoice generation from orders** - Items must be manually added or service integration needs completion

---

## 10. Post-Visit Continuity

### 10.1 Follow-up Scheduling ✅ **Well Implemented**

**Location**: [backend/hmis/apps/scheduling/models.py](../backend/hmis/apps/scheduling/models.py)

**Appointment Model** (comprehensive scheduling system):
```python
class Appointment(TimeStampedModel):
    patient = ForeignKey("patients.Patient")
    resource = ForeignKey(Resource)  # Doctor, Room, Equipment
    
    STATUS_CHOICES = [
        ("REQUESTED", "Requested"),
        ("CONFIRMED", "Confirmed"),
        ("CHECKED_IN", "Checked In"),
        ("IN_PROGRESS", "In Progress"),
        ("COMPLETED", "Completed"),
        ("CANCELLED", "Cancelled"),
        ("NO_SHOW", "No Show"),
        ("RESCHEDULED", "Rescheduled"),
    ]
    
    scheduled_start = DateTimeField()
    scheduled_end = DateTimeField()
    appointment_type = CharField()
    reason = TextField()
```

**Resource Types**:
- PERSON (doctors, nurses)
- PLACE (rooms, clinics)
- ASSET (equipment, beds)

**Schedule Definition**:
- Recurring weekly or one-time
- Slot duration and buffer times
- Effective date ranges
- Capacity limits

### 10.2 Treatment Plan Follow-ups

**Location**: [backend/hmis/apps/encounters/models.py](../backend/hmis/apps/encounters/models.py)

```python
class TreatmentPlan(models.Model):
    follow_up_instructions = TextField()
    follow_up_date = DateField(null=True)
    referral_needed = BooleanField()
    referral_specialty = CharField()
```

### 10.3 Care Plan Updates ⚠️ **Basic Implementation**

- Treatment plans exist per encounter
- Medical history fields on encounter (allergies, chronic conditions, medications)
- No persistent "care plan" entity that spans encounters

### 10.4 Notifications ✅ **Implemented**

**Location**: [backend/hmis/apps/core/models.py](../backend/hmis/apps/core/models.py)

```python
class Notification(models.Model):
    user = ForeignKey(User)
    notification_type = CharField()  # patient_called, lab_result, etc.
    priority = CharField(choices=["low", "normal", "high", "urgent"])
    title = CharField()
    message = TextField()
    related_model = CharField()
    related_id = BigIntegerField()
    action_url = CharField()
    is_read = BooleanField()
    is_dismissed = BooleanField()
```

### Gap
- ❌ **Patient-facing reminders** - No SMS/email appointment reminders yet
- ⚠️ **Care plan as spanning entity** - Currently per-encounter, not longitudinal

---

## Summary: Feature Completeness Matrix

| Area | Backend | Frontend | Integration | Overall |
|------|---------|----------|-------------|---------|
| 1. Patient Identification | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 2. Visit Context | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 3. Admin Check-In | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 4. Clinical Snapshot | ✅ Complete | ✅ Types | ⚠️ Display gap | 🟡 **Mostly Ready** |
| 5. Encounter State Machine | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 6. Triage Flow | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 7. Clinical Encounter | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 8. Orders & Fulfillment | ✅ Complete | ⚠️ Partial | ⚠️ Partial | 🟡 **Mostly Ready** |
| 9. Billing Integration | ✅ Complete | ⚠️ Partial | ⚠️ Partial | 🟡 **Mostly Ready** |
| 10. Post-Visit Continuity | ⚠️ Basic | ⚠️ Basic | ❌ Reminders missing | 🟡 **Needs Work** |

---

## Recommendations

This section provides detailed, actionable implementation guidance to close all partial and missing implementations identified in this analysis. Recommendations are organized by priority and include technical specifications, file locations, and estimated effort.

---

### 🔴 HIGH PRIORITY (Production Blockers)

#### 1. Display Clinical Snapshot in Encounter View

**Problem:** The `ClinicalSnapshot` is generated at check-in and displayed to registration staff, but clinicians opening an encounter don't see it prominently. This creates a patient safety risk (missed allergies, drug interactions).

**Current State:**
- ✅ Backend generates snapshot via `get_clinical_snapshot()` in [checkin/services.py](../backend/hmis/apps/checkin/services.py)
- ✅ Check-in page displays it beautifully ([patients/checkin/page.tsx](../web-app/app/(dashboard)/patients/checkin/page.tsx#L100-L240))
- ❌ Encounter detail page ([encounters/[id]/page.tsx](../web-app/app/(dashboard)/encounters/[id]/page.tsx)) has NO snapshot display

**Implementation:**

1. **Add snapshot endpoint to encounter API:**
   ```python
   # backend/hmis/apps/encounters/views.py
   @action(detail=True, methods=['get'])
   def clinical_snapshot(self, request, pk=None):
       encounter = self.get_object()
       snapshot = get_clinical_snapshot(encounter.patient)
       return Response(ClinicalSnapshotSerializer(snapshot).data)
   ```

2. **Create snapshot header component:**
   ```tsx
   // web-app/components/encounters/clinical-snapshot-banner.tsx
   // Collapsible banner at top of encounter view showing:
   // - Allergies (RED background if SEVERE)
   // - Active conditions
   // - Current medications
   // - Pending results
   // - Auto-generated alerts
   ```

3. **Add to encounter detail layout:**
   ```tsx
   // web-app/app/(dashboard)/encounters/[id]/layout.tsx
   <ClinicalSnapshotBanner patientId={encounter.patient} />
   ```

**Files to modify:**
- `backend/hmis/apps/encounters/views.py` - Add snapshot endpoint
- `web-app/components/encounters/clinical-snapshot-banner.tsx` - Create component
- `web-app/app/(dashboard)/encounters/[id]/layout.tsx` - Add banner
- `web-app/lib/hooks/use-encounters.ts` - Add `useEncounterSnapshot` hook

**Effort:** 4-6 hours | **Risk if skipped:** Medication errors, missed allergies

---

#### 2. Auto-Create Invoice Items from Orders

**Problem:** Lab orders, pharmacy dispensing, and imaging orders don't automatically generate billing line items. Staff must manually add items, risking revenue leakage.

**Current State:**
- ✅ `InvoiceItem` model links to `LabOrder`, `Dispensing`, `ImagingOrder`
- ❌ No Django signals to auto-create items when orders are placed

**Implementation:**

1. **Create billing signals:**
   ```python
   # backend/hmis/apps/billing/signals.py
   from django.db.models.signals import post_save
   from django.dispatch import receiver
   from hmis.apps.laboratory.models import LabOrder
   from hmis.apps.pharmacy.models import Dispensing
   from hmis.apps.imaging.models import ImagingOrder
   from hmis.apps.billing.services import auto_create_invoice_item

   @receiver(post_save, sender=LabOrder)
   def create_lab_invoice_item(sender, instance, created, **kwargs):
       if created and instance.status == 'ORDERED':
           auto_create_invoice_item(
               patient=instance.patient,
               encounter=instance.encounter,
               item_type='LAB',
               reference_model='LabOrder',
               reference_id=instance.id,
               service_code=instance.test.billing_code,
               amount=instance.test.price
           )
   ```

2. **Register signals in app config:**
   ```python
   # backend/hmis/apps/billing/apps.py
   def ready(self):
       import hmis.apps.billing.signals  # noqa
   ```

3. **Add service code mapping:**
   - Ensure `LabTest`, `Drug`, `ImagingProcedure` have `billing_code` and `price` fields
   - Create fallback for services without mapping

**Files to modify:**
- `backend/hmis/apps/billing/signals.py` - Create new file
- `backend/hmis/apps/billing/apps.py` - Register signals
- `backend/hmis/apps/billing/services/__init__.py` - Add `auto_create_invoice_item()`
- `backend/hmis/apps/laboratory/models.py` - Ensure billing fields exist

**Effort:** 6-8 hours | **Risk if skipped:** Revenue leakage, billing reconciliation issues

---

#### 3. Implement Patient SMS/Email Reminders

**Problem:** No patient-facing notifications for appointment reminders, follow-up dates, or medication refills. This leads to no-shows and treatment gaps.

**Current State:**
- ✅ `Notification` model exists for staff notifications
- ✅ `Appointment` model has `scheduled_start`
- ❌ No SMS/email gateway integration
- ❌ No scheduled task for sending reminders

**Implementation:**

1. **Add SMS gateway (Africa's Talking recommended for Kenya):**
   ```python
   # backend/hmis/apps/core/sms_gateway.py
   import africastalking
   
   class SMSGateway:
       def __init__(self):
           africastalking.initialize(
               username=settings.AT_USERNAME,
               api_key=settings.AT_API_KEY
           )
           self.sms = africastalking.SMS
       
       def send_reminder(self, phone: str, message: str):
           self.sms.send(message, [phone], sender_id=settings.SMS_SENDER_ID)
   ```

2. **Create Celery task for reminders:**
   ```python
   # backend/hmis/apps/scheduling/tasks.py
   from celery import shared_task
   from datetime import timedelta
   from django.utils import timezone
   
   @shared_task
   def send_appointment_reminders():
       """Send reminders for appointments in next 24 hours."""
       tomorrow = timezone.now() + timedelta(days=1)
       appointments = Appointment.objects.filter(
           scheduled_start__date=tomorrow.date(),
           status='CONFIRMED',
           reminder_sent=False
       )
       for apt in appointments:
           send_sms_reminder(apt)
           apt.reminder_sent = True
           apt.save()
   ```

3. **Schedule with Celery Beat:**
   ```python
   # backend/hmis/celery.py
   app.conf.beat_schedule = {
       'send-appointment-reminders': {
           'task': 'hmis.apps.scheduling.tasks.send_appointment_reminders',
           'schedule': crontab(hour=18, minute=0),  # Daily at 6 PM
       },
   }
   ```

**Files to create/modify:**
- `backend/hmis/apps/core/sms_gateway.py` - New file
- `backend/hmis/apps/scheduling/tasks.py` - New file
- `backend/hmis/apps/scheduling/models.py` - Add `reminder_sent` field
- `backend/hmis/settings/base.py` - Add AT credentials
- `backend/hmis/celery.py` - Register beat schedule

**Effort:** 8-12 hours | **Risk if skipped:** High no-show rates, treatment gaps

---

### 🟡 MEDIUM PRIORITY (Quality Improvements)

#### 4. Persist Clinical Snapshot with Encounter

**Problem:** Snapshot is generated on-demand and not stored. If patient data changes, historical context is lost. Also needed for audit/medico-legal purposes.

**Implementation:**

1. **Add snapshot field to Encounter:**
   ```python
   # backend/hmis/apps/encounters/models.py
   class Encounter(models.Model):
       ...
       clinical_snapshot_at_start = models.JSONField(
           null=True, 
           blank=True,
           help_text="Point-in-time snapshot captured when encounter started"
       )
   ```

2. **Capture snapshot on encounter creation:**
   ```python
   # backend/hmis/apps/encounters/views.py
   def perform_create(self, serializer):
       patient = serializer.validated_data['patient']
       snapshot = get_clinical_snapshot(patient)
       serializer.save(
           created_by=self.request.user,
           clinical_snapshot_at_start=asdict(snapshot)
       )
   ```

**Effort:** 2-3 hours

---

#### 5. Longitudinal Care Plan Entity

**Problem:** Treatment plans are per-encounter only. Chronic care patients (diabetes, HIV, hypertension) need a spanning care plan that persists across visits.

**Implementation:**

1. **Create CarePlan model:**
   ```python
   # backend/hmis/apps/patients/models.py
   class CarePlan(TimeStampedModel):
       patient = models.ForeignKey(Patient, related_name='care_plans')
       condition = models.ForeignKey('encounters.Condition')
       status = models.CharField(choices=['ACTIVE', 'COMPLETED', 'SUSPENDED'])
       
       # Goals and targets
       goals = models.JSONField(default=list)
       target_metrics = models.JSONField(default=dict)  # e.g., {"hba1c": "<7%"}
       
       # Team
       primary_provider = models.ForeignKey(User)
       care_team = models.ManyToManyField(User, related_name='care_plans_member')
       
       # Timeline
       start_date = models.DateField()
       target_end_date = models.DateField(null=True)
       review_frequency_days = models.IntegerField(default=90)
       next_review_date = models.DateField()

   class CarePlanActivity(TimeStampedModel):
       care_plan = models.ForeignKey(CarePlan, related_name='activities')
       encounter = models.ForeignKey('encounters.Encounter', null=True)
       activity_type = models.CharField()  # 'review', 'goal_update', 'metric_recording'
       notes = models.TextField()
   ```

2. **Link encounters to care plans:**
   ```python
   # When closing chronic care encounters, update CarePlan.next_review_date
   ```

**Effort:** 12-16 hours (full module)

---

#### 6. Insurance Eligibility Check at Check-In

**Problem:** Insurance/SHA status not validated at check-in. Staff discover expired coverage at billing stage, causing delays.

**Implementation:**

1. **Add eligibility check to check-in flow:**
   ```typescript
   // web-app/app/(dashboard)/patients/checkin/page.tsx
   // After patient lookup, if patient has SHA coverage:
   const { data: eligibility } = useSHAEligibility(patient.sha_number);
   
   if (eligibility?.status === 'EXPIRED') {
     // Show warning alert
   }
   ```

2. **Wire SHA validate-member API:**
   ```python
   # backend/hmis/apps/billing/services/sha_eligibility.py
   def check_eligibility(sha_number: str) -> EligibilityResult:
       response = requests.post(
           f"{SHA_API_URL}/v1/registry/validate-member",
           json={"member_number": sha_number},
           headers=get_sha_headers()
       )
       return parse_eligibility_response(response.json())
   ```

**Effort:** 4-6 hours

---

#### 7. Drug-Drug Interaction Checking

**Problem:** No automated clinical decision support for drug interactions. Contraindications are manual.

**Implementation Options:**

1. **Option A: Rule-based (simpler):**
   - Create `DrugInteraction` table with known interactions
   - Check on prescription creation
   - Flag warnings in Rx form

2. **Option B: External API (comprehensive):**
   - Integrate with OpenFDA Drug Interactions API
   - Or use commercial API (Lexicomp, First Databank)

**Effort:** 8-16 hours depending on approach

---

#### 8. Complete Imaging Module

**Problem:** Imaging module is less mature than lab/pharmacy. Missing status workflow validation, result entry, and frontend integration.

**Implementation:**
- Mirror lab module architecture
- Add status transitions with validation
- Create result entry interface
- Complete frontend pages

**Effort:** 16-24 hours

---

### 🟢 LOW PRIORITY (Nice-to-Have)

#### 9. QR Code Patient Check-In

**Current State:** `core/qr_utils.py` exists but not wired to patient flow.

**Implementation:**
- Generate QR code on patient card (contains MRN)
- Add QR scanner button to check-in page
- Decode and auto-populate patient lookup

**Effort:** 4-6 hours

---

#### 10. Biometric Patient Identification

**Implementation:**
- Integrate fingerprint scanner SDK (e.g., SecuGen)
- Store biometric template in patient record
- Match on check-in

**Effort:** 20-40 hours (hardware-dependent)

---

#### 11. Real-Time Queue Display (WebSocket)

**Implementation:**
- Use Django Channels for WebSocket
- Create waiting room display page
- Push queue updates when patients called

**Effort:** 12-16 hours

---

#### 12. ARCHIVED Encounter State

**Problem:** Guideline specifies ARCHIVED state for regulatory retention. Currently only CLOSED.

**Implementation:**
- Add `ARCHIVED` to STATUS_CHOICES
- Add transition from CLOSED → ARCHIVED
- Create Celery task to auto-archive after retention period (e.g., 7 years)

**Effort:** 2-3 hours

---

## UX / Navigation Audit

### Current State Assessment

The current navigation structure in [navigation.ts](../web-app/lib/config/navigation.ts) is **well-organized** but has some patient-flow friction points.

#### ✅ What's Working Well

| Aspect | Assessment |
|--------|------------|
| **Sidebar structure** | Logical grouping (Clinical → Diagnostics → Finance → Admin) |
| **Collapsible nav groups** | Reduces cognitive load |
| **Active state highlighting** | Clear cyan accent, border indicator |
| **Mobile responsiveness** | Proper overlay sidebar with backdrop |
| **Breadcrumbs** | Auto-generated from path |
| **Dark mode** | Consistent theming |

#### ⚠️ Navigation Friction Points

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Check-in buried** | Under Patients menu | Staff must navigate to find check-in | ✅ **Already fixed** - Check-in is now top-level |
| **No patient context bar** | All pages | When in patient context, no persistent patient info | Add persistent patient header when viewing patient-related pages |
| **Encounters ≠ Clinics confusion** | Separate nav items | Staff unsure which to use | Consider merging or adding visual connection |
| **Triage → Encounter transition** | Manual navigation | After triage, staff must manually find encounter | Auto-redirect to encounter after triage completion |
| **No "active patient" indicator** | Sidebar | No way to quickly return to current patient | Add "Current Patient" quick-access in sidebar |

### Recommended UX Improvements

#### 1. Patient Context Header (High Value)

**Problem:** When working on a patient (encounter, labs, pharmacy), there's no persistent context showing which patient is active.

**Solution:** Add a sticky patient context bar below the header when in patient scope:

```tsx
// web-app/components/layout/patient-context-bar.tsx
// Displays: Photo | Name | MRN | Age/Gender | Allergies (red if any) | Quick actions
// Visible on: /patients/[id]/*, /encounters/[id]/*, and linked pages
```

**Placement:**
```
┌──────────────────────────────────────────────────┐
│ Header (logo, search, user menu)                 │
├──────────────────────────────────────────────────┤
│ 👤 Jane Smith | MRN-20260101-0001 | 35F | ⚠️ PCN │  ← Patient Context Bar
├──────────────────────────────────────────────────┤
│ Page content...                                  │
└──────────────────────────────────────────────────┘
```

**Effort:** 4-6 hours

---

#### 2. Workflow-Based Navigation Mode (Medium Value)

**Problem:** Current navigation is module-based, not workflow-based. Clinical staff think in patient journeys, not modules.

**Solution:** Add a "Clinical Mode" toggle that restructures navigation by workflow step:

```
Standard Mode          │  Clinical Mode
──────────────────────────────────────────────────
• Dashboard            │  • Today's Queue
• Check-in             │  • Waiting for Triage
• Patients             │  • Waiting for Consult
• Triage               │  • In Progress
• Clinics              │  • Pending Results
• Encounters           │  • Ready to Close
• Pharmacy             │  • Completed Today
• Laboratory           │
```

**Effort:** 12-16 hours | **Consider:** This is a significant UX change - survey users first

---

#### 3. Auto-Redirect After Triage

**Problem:** After completing triage, nurse must manually navigate to encounters or clinic queue.

**Solution:**
```tsx
// After triage submission success:
router.push(`/clinics/${destinationClinic}/queue`);
// Or if encounter created:
router.push(`/encounters/${encounterId}`);
```

**Effort:** 1-2 hours

---

#### 4. Quick Actions Floating Button (Mobile)

**Problem:** On mobile, common actions (check-in, new encounter) require navigation through sidebar.

**Solution:** Add a floating action button (FAB) on mobile with quick actions:
- Quick Check-in (opens search modal)
- Emergency Encounter
- Scan QR

**Effort:** 3-4 hours

---

#### 5. Sidebar "Current Patient" Section

**Problem:** No quick way to return to the patient you were just working on.

**Solution:** Add a "Recent" or "Current Patient" section at the top of sidebar (below logo):

```
┌─────────────────────┐
│      [LOGO]         │
├─────────────────────┤
│ 📌 Current Patient  │
│   Jane Smith        │
│   MRN-0001 • 35F    │
│   [View] [Encounter]│
├─────────────────────┤
│ • Dashboard         │
│ • Check-in          │
│ ...                 │
└─────────────────────┘
```

**Effort:** 3-4 hours

---

### Navigation Refactor Verdict

**Should the navigation/sidebar be refactored?**

| Aspect | Verdict | Reasoning |
|--------|---------|-----------|
| **Overall structure** | ✅ Keep as-is | Logical grouping, no major issues |
| **Module organization** | ✅ Keep as-is | Clinics/Diagnostics/Finance separation is correct |
| **Add patient context bar** | 🔴 **YES - High Priority** | Reduces errors, improves continuity |
| **Add recent/current patient** | 🟡 **YES - Medium Priority** | Quick navigation to active work |
| **Workflow mode toggle** | 🟢 **Consider later** | Major change, needs user research |
| **Auto-redirect after triage** | 🔴 **YES - Quick win** | Reduces clicks, matches workflow |

### Summary: No Major Refactor Needed

The navigation is well-structured. Focus on **additions** (patient context bar, current patient section) rather than restructuring. The sidebar grouping and collapse behavior are production-ready.

---

## Implementation Roadmap

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Clinical Safety | 1. Clinical snapshot in encounter, 2. Auto-redirect after triage |
| **Week 2** | Revenue Integrity | 3. Auto-billing from orders, 4. Insurance eligibility check |
| **Week 3** | Patient Engagement | 5. SMS reminder integration |
| **Week 4** | UX Polish | 6. Patient context bar, 7. Current patient in sidebar |
| **Week 5** | Chronic Care | 8. Longitudinal care plan model |
| **Week 6** | Completeness | 9. Imaging module completion, 10. Persist snapshot |

---

## Appendix: Gap Closure Checklist

| # | Gap | Status | PR Link |
|---|-----|--------|---------|
| 1 | Clinical snapshot in encounter view | ⬜ TODO | |
| 2 | Auto-invoice from orders | ⬜ TODO | |
| 3 | SMS/email reminders | ⬜ TODO | |
| 4 | Persist snapshot with encounter | ⬜ TODO | |
| 5 | Longitudinal care plan | ⬜ TODO | |
| 6 | Insurance eligibility at check-in | ⬜ TODO | |
| 7 | Drug interaction checking | ⬜ TODO | |
| 8 | Imaging module completion | ⬜ TODO | |
| 9 | QR code check-in | ⬜ TODO | |
| 10 | Biometric integration | ⬜ TODO | |
| 11 | Real-time queue display | ⬜ TODO | |
| 12 | ARCHIVED encounter state | ⬜ TODO | |
| 13 | Patient context bar (UX) | ⬜ TODO | |
| 14 | Current patient in sidebar (UX) | ⬜ TODO | |
| 15 | Auto-redirect after triage (UX) | ⬜ TODO | |

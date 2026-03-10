# Vitora HMIS - Patient Flow Implementation Analysis

> **Analysis Date**: March 10, 2026
> **Codebase Version**: Current `feature/capability-based-ui` branch
> **Analyst**: thande788
> **Last Audit**: March 10, 2026 (updated March 10, 2026)

---

## Executive Summary

This document provides a comprehensive analysis of how patient flow is implemented in the Vitora HMIS codebase. The system has matured significantly since the initial February 2026 assessment, with auto-invoice signals, CDS rules, imaging workflow, allied health services (physiotherapy, OT, nutrition, counselling, social work), theatre scheduling, emergency dashboard, AI-assisted clinical support, and advanced triage monitoring (wait-time breach tracking, escalations) now implemented.

**Overall Assessment**: 🟢 **Mostly Complete** - Core patient flow is production-ready; remaining gaps are enhancements (SMS reminders, longitudinal care plans, scheduling UI, insurance eligibility at check-in).

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
| **National ID** | `Patient.identification_number` + `identification_type` | Flexible ID types (national_id, passport, alien_id, kra_pin, mandate_number, temporary_id, birth_certificate, cr_number) |
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
- **Type**: [web-app/lib/types/patient.ts](../web-app/lib/types/patient.ts) - `Patient`, `PatientCreateData`, `IdentificationType`, `DuplicateCheckResult`
- **API**: [web-app/lib/api/patients.ts](../web-app/lib/api/patients.ts) - `patientsApi`
- **Schema**: [web-app/lib/schemas/patient.schema.ts](../web-app/lib/schemas/patient.schema.ts) - Zod validation (✅ fully implemented)

### QR Identity Support ✅ **Implemented**
- Backend endpoint: `GET /api/patients/{id}/qr-code/`
- QR payload format: `VITORA:MRN:{mrn}`
- Patient detail page embeds a QR preview beside the MRN with expand, print, and download actions
- Check-in page includes camera-based QR scanning that decodes the patient QR and auto-populates lookup

### Consent Tracking ✅ **Enhanced**
- `consent_deferred` field added to `Patient` model (Kenya DPA compliance)
- Tracks patients where consent must be obtained before discharge

### Gaps
- ❌ **Biometric integration** - Field exists in CheckIn but no implementation
- ✅ **QR-based patient identification** - Implemented end-to-end for patient details and check-in lookup

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
- **QR scanning**: [web-app/components/patients/qr-scanner-dialog.tsx](../web-app/components/patients/qr-scanner-dialog.tsx) integrated into the check-in search flow

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
- ✅ **Clinician-facing display implemented** - Snapshot now displayed prominently in encounter view (banner + endpoint)

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
- **API**: `encountersApi.transition(id, { to_status, reason })`, `encountersApi.claim()`, `encountersApi.release()`, `encountersApi.quickConsultation()`
- **Schema**: [web-app/lib/schemas/encounter.schema.ts](../web-app/lib/schemas/encounter.schema.ts) - Zod validation (✅ fully implemented)

### ⚠️ Known Issue: Frontend/Backend Status Mismatch
The frontend `encounter.ts` lists `COMPLETED` as a status alongside `CLOSED`, but the backend `Encounter.STATUS_CHOICES` does NOT include `COMPLETED`. This mismatch should be resolved by removing `COMPLETED` from the frontend types or adding it to the backend.

### Encounter Dispositions ✅ **Implemented**

The encounter model supports structured dispositions:

```python
# EncounterDisposition choices
ADVICE_ONLY        # Patient advised, no treatment needed
TREATED_DISCHARGED # Treated and discharged
REFERRED           # Referred to another facility/specialty
ADMITTED           # Admitted to inpatient
FOLLOW_UP_SCHEDULED # Follow-up appointment created
LEFT_AMA           # Left against medical advice
```

**Mandatory notes required for**: `ADVICE_ONLY`, `LEFT_AMA`, `REFERRED`.

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

### Wait Time Breach Monitoring ✅ **Implemented**

**Location**: [backend/hmis/apps/triage/models.py](../backend/hmis/apps/triage/models.py)

```python
class WaitTimeBreach(models.Model):
    """Automatically records KETA target breaches."""
    SEVERITY_CHOICES = [
        ("CRITICAL", "RED > 0 min"),
        ("URGENT", "ORANGE > 10 min"),
        ("WARNING", "YELLOW > 60 min"),
        ("INFO", "GREEN/BLUE informational"),
    ]
    STATUS_CHOICES = [
        ("ACTIVE", "Active breach"),
        ("ACKNOWLEDGED", "Acknowledged by staff"),
        ("ESCALATED", "Escalated to supervisor"),
        ("RESOLVED", "Resolved"),
    ]
```

### Escalation Workflow ✅ **Implemented**

```python
class Escalation(models.Model):
    """Records staff escalation actions for triage breaches."""
    TYPE_CHOICES = [
        ("CHARGE_NURSE", "Escalate to charge nurse"),
        ("ADDITIONAL_STAFF", "Request additional staff"),
        ("SUPERVISOR", "Escalate to supervisor"),
    ]
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("IN_PROGRESS", "In Progress"),
        ("RESOLVED", "Resolved"),
        ("DISMISSED", "Dismissed"),
    ]
```

The triage Celery task broadcasts `emergency.wait.breach` alerts via WebSocket to the `emergency_queue` group for real-time dashboard updates.

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

### 8.3 Imaging Orders ✅ **Well Implemented**

**Location**: [backend/hmis/apps/imaging/](../backend/hmis/apps/imaging/)

The imaging module has matured significantly since the initial assessment:

**ImagingOrder Status Workflow**:
```python
ORDER_STATUS = [
    ("DRAFT", "Draft"),
    ("ORDERED", "Ordered"),
    ("SCHEDULED", "Scheduled"),
    ("IN_PROGRESS", "In Progress"),
    ("COMPLETED", "Completed"),
    ("REPORTED", "Reported"),
    ("CANCELLED", "Cancelled"),
]

# Valid transitions enforced
STATUS_TRANSITIONS = {
    "DRAFT": ["ORDERED", "CANCELLED"],
    "ORDERED": ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
    "SCHEDULED": ["IN_PROGRESS", "CANCELLED"],
    "IN_PROGRESS": ["COMPLETED"],
    "COMPLETED": ["REPORTED"],
    "REPORTED": [],
    "CANCELLED": [],
}
```

**Key Features**:
- `ImagingProcedure` catalog with RadLex and LOINC codes
- DICOM/PACS integration fields (`accession_number`, `study_instance_uid`)
- Priority levels (ROUTINE, URGENT, STAT)
- Auto-invoice signal creates `InvoiceItem` when `ImagingOrderItem` is saved
- **Frontend pages**: Orders, Procedures, Studies, Worklist at `/imaging/`

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
- ✅ **Auto-invoice generation from orders** - Implemented via Django signals:
  - `pharmacy/signals.py`: `post_save` on `PrescriptionItem` creates `InvoiceItem`
  - `imaging/signals.py`: `post_save` on `ImagingOrderItem` creates `InvoiceItem`
  - Lab orders: handled via `LabOrder.add_test()` method
- ✅ **Lab queue automation** - `laboratory/signals.py` handles:
  - `create_lab_queue_entry`: Auto-creates `LabQueue` entry when in-house `LabOrder` is placed
  - `create_specimen_for_queue`: Auto-generates `Specimen` record and barcode when queue entry is created
  - `update_order_status_on_result`: Synchronizes order/queue status as results are entered (transitions `IN_PROGRESS` → `REVIEW`)

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
- ⚠️ **Patient-facing reminders** - SMS gateway exists (`core/sms_gateway.py` with tests) but no Celery Beat scheduled task for automated appointment reminders yet. `reminder_sent` field not yet on `Appointment` model.
- ⚠️ **Care plan as spanning entity** - Currently per-encounter, not longitudinal. No `CarePlan` model exists. AI-generated care plans are stored via TibaBot but lack a dedicated model.

---

## 11. Clinical Decision Support (CDS)

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/cds/models.py](../backend/hmis/apps/cds/models.py)

**CDSRule Model**:
- Generic rule engine using JSON Logic stored in `condition` field
- Rule categories include: `DRUG_ALLERGY`, `DRUG_DRUG`, `CRITICAL_LAB`, `VITAL_SIGN`, `GUIDELINE`
- Supports severity levels and auto-evaluation

**Frontend**:
- [enhanced-cds-panel.tsx](../web-app/components/encounters/enhanced-cds-panel.tsx) provides real-time rule evaluation
- Displays vitals alerts, drug-allergy interactions during consultations

---

## 12. Referrals

### Current Implementation ✅ **Well Implemented**

**Location**: [backend/hmis/apps/referrals/models.py](../backend/hmis/apps/referrals/models.py)

**ClinicalReferral Model**:
- Unified referral system supporting: `ALLIED_HEALTH`, `SPECIALTY_CLINIC`, `ADMISSION`, `EXTERNAL`
- Lifecycle: `DRAFT` → `PENDING` → `ACCEPTED` → `IN_PROGRESS` → `COMPLETED`
- Frontend page at `/referrals/`

---

## 13. New Clinical Modules (Since Feb 2026)

### 13.1 MCH (Maternal & Child Health) ✅ **Implemented**

**Location**: [backend/hmis/apps/mch/](../backend/hmis/apps/mch/)

Models: `MCHRegistration`, `ANCVisit`, `Delivery`, `PNCVisit`, `GrowthMeasurement`, `Vaccine`, `ImmunizationRecord`, `VitaminASupplement`, `AEFI`, `HEIFollowUp`, `HEIPCRTest`

Frontend pages at `/mch/`: deliveries, growth, hei, immunizations

### 13.2 Surveillance ✅ **Implemented**

**Location**: [backend/hmis/apps/surveillance/](../backend/hmis/apps/surveillance/)

Models: `NotifiableDisease` (MOH 502), `DiseaseCase`. Implements IDSR weekly reporting.

Frontend pages at `/surveillance/`: cases, alerts, idsr, ihr

### 13.3 Quality Reporting ✅ **Implemented**

**Location**: [backend/hmis/apps/quality/](../backend/hmis/apps/quality/)

Models: `QuarterlyReport`, `AnnualReport`, `QualityMeasure`, `QualityMeasureResult`. DHA Quality Reporting (Sprint 2.C).

Frontend pages at `/quality/`: measures, reports

### 13.4 Allied Health Services ✅ **Implemented** (Backend + Frontend)

All allied health modules now have both backend models and frontend pages consolidated under `/allied-health/`.

#### Physiotherapy
**Location**: [backend/hmis/apps/physiotherapy/](../backend/hmis/apps/physiotherapy/)

Models: `PhysiotherapyTreatmentType`, `PhysiotherapyOrder`, `PhysiotherapySession`

Frontend pages at `/allied-health/physiotherapy/`: orders, sessions, treatment-types

#### Occupational Therapy
**Location**: [backend/hmis/apps/occupational_therapy/](../backend/hmis/apps/occupational_therapy/)

Models: `OTTreatmentType`, `OccupationalTherapyOrder`, `OTSession`

Frontend pages at `/allied-health/occupational-therapy/`: orders, sessions

#### Counselling ✅ **Now Has Frontend**
**Location**: [backend/hmis/apps/counselling/](../backend/hmis/apps/counselling/)

Models: `CounsellingType`, `CounsellingReferral`, `CounsellingSession`

Frontend pages at `/allied-health/counselling/`: referrals, sessions

#### Social Work ✅ **Now Has Frontend**
**Location**: [backend/hmis/apps/social_work/](../backend/hmis/apps/social_work/)

Models: `SocialWorkReferral`, `SocialWorkCase`, `CaseNote`, `SocialWorkIntervention`

Frontend pages at `/allied-health/social-work/`: cases, referrals

#### Nutrition ✅ **Now Has Frontend**
**Location**: [backend/hmis/apps/nutrition/](../backend/hmis/apps/nutrition/)

Models: `NutritionConsultation`, `DietPlan`

Frontend pages at `/allied-health/nutrition/`: consultations, diet-plans

### 13.5 Inpatient ✅ **Implemented**

**Location**: [backend/hmis/apps/inpatient/](../backend/hmis/apps/inpatient/)

Includes ward management, bed tracking, admissions, nursing kardex with care plans.

### 13.6 Theatre / Surgical Scheduling ✅ **Implemented** (Frontend)

No dedicated backend `theatre` app — surgical scheduling is handled via the `scheduling` app's `Resource` model (type `THEATRE` under `PLACE` resources).

Frontend pages at `/theatre/`: schedule, checklists, cases, reports. Gated by `ENABLE_THEATRE` feature flag.

### 13.7 Emergency Dashboard ✅ **Implemented** (Frontend)

No dedicated backend `emergency` app — ER functionality is served by the `triage` app, including `EmergencyQueueConsumer` for real-time WebSocket updates.

Frontend pages at `/emergency/`: zone-based bed board, real-time queue.

### 13.8 AI Assistant (TibaBot) ✅ **Implemented**

**Location**: [backend/hmis/apps/ai/](../backend/hmis/apps/ai/)

Models:
- `ChatSession`, `ChatMessage` — persistent clinical chat history
- `AICarePlanResult`, `AICDSResult`, `AILabInterpretResult`, `AIDischargeResult`, `AIICURiskResult` — cached AI-generated clinical outputs

Frontend: AI Assistant page at `/ai/`

API endpoints:
```
GET  /api/ai/results/care-plans/?encounter_id={id}
GET  /api/ai/results/cds/?encounter_id={id}
GET  /api/ai/results/lab-interpretations/?encounter_id={id}
GET  /api/ai/results/discharge/?admission_id={id}
GET  /api/ai/results/icu-risk/?admission_id={id}
```

---

## 14. Real-Time / WebSocket Integration

### Current Implementation ✅ **Expanded**

The system now has multiple Django Channels consumers beyond the original clinic queue:

| App | Consumer | WebSocket Path | Purpose |
|-----|----------|---------------|--------|
| **Clinics** | `ClinicQueueConsumer` | `ws/clinics/{id}/queue/` | Real-time queue position changes |
| **Triage** | `EmergencyQueueConsumer` | `ws/emergency/queue/` | ER dashboard, critical patients, zone stats, wait-time breach alerts |
| **Laboratory** | `LabEncounterConsumer` | `ws/lab/encounter/{id}/` | Result entry, verification, critical alerts, order completion |
| **Surveillance** | `SurveillanceAlertConsumer` | `ws/surveillance/alerts/` | Notifiable diseases, outbreaks, overdue notification deadlines |
| **MCH** | `LabourPartographConsumer` | `ws/mch/partograph/{id}/` | Real-time labour partograph updates |
| **Inpatient** | `WardCompatibilityConsumer` | `ws/inpatient/ward/{id}/` | Ward capacity changes, compatibility violations |
| **Inpatient** | `SupervisorAlertConsumer` | `ws/inpatient/supervisor/` | Supervisor escalation alerts |

- **Frontend**: [use-websocket.ts](../web-app/lib/hooks/use-websocket.ts) implements WebSocket hooks

---

## Summary: Feature Completeness Matrix

| Area | Backend | Frontend | Integration | Overall |
|------|---------|----------|-------------|---------|
| 1. Patient Identification | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 2. Visit Context | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 3. Admin Check-In | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 4. Clinical Snapshot | ✅ Complete | ✅ Complete | ⚠️ Not persisted with encounter | 🟡 **Mostly Ready** |
| 5. Encounter State Machine | ✅ Complete | ⚠️ COMPLETED/CLOSED mismatch | ⚠️ Type mismatch | 🟡 **Mostly Ready** |
| 6. Triage Flow | ✅ Complete (+ breach/escalation) | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 7. Clinical Encounter | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 8. Orders & Fulfillment | ✅ Complete | ✅ Complete | ✅ Auto-invoice + lab queue signals | 🟢 **Ready** |
| 9. Billing Integration | ✅ Complete | ✅ Complete | ✅ Auto-invoice signals | 🟢 **Ready** |
| 10. Post-Visit Continuity | ⚠️ SMS gateway exists, no scheduler | ⚠️ No scheduling pages | ⚠️ Reminders not automated | 🟡 **Needs Work** |
| 11. CDS (Drug Interactions) | ✅ Complete | ✅ Complete | ✅ Real-time panel | 🟢 **Ready** |
| 12. Referrals | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 13a. MCH | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 13b. Allied Health | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 13c. Theatre | ✅ Via scheduling | ✅ Complete | ✅ Feature-flagged | 🟢 **Ready** |
| 13d. Emergency Dashboard | ✅ Via triage | ✅ Complete | ✅ WebSocket | 🟢 **Ready** |
| 13e. AI Assistant | ✅ Complete | ✅ Complete | ✅ Complete | 🟢 **Ready** |
| 14. Real-Time (WebSocket) | ✅ 7 consumers | ✅ Hooks | ✅ Complete | 🟢 **Ready** |

---

## Recommendations

This section provides detailed, actionable implementation guidance to close all partial and missing implementations identified in this analysis. Recommendations are organized by priority and include technical specifications, file locations, and estimated effort.

---

### 🔴 HIGH PRIORITY (Production Blockers)

#### 1. Display Clinical Snapshot in Encounter View ✅ **Completed**

**Problem:** The `ClinicalSnapshot` is generated at check-in and displayed to registration staff, but clinicians opening an encounter don't see it prominently. This creates a patient safety risk (missed allergies, drug interactions).

**Current State:**
- ✅ Backend generates snapshot via `get_clinical_snapshot()` in [checkin/services.py](../backend/hmis/apps/checkin/services.py)
- ✅ Check-in page displays it beautifully ([patients/checkin/page.tsx](../web-app/app/(dashboard)/patients/checkin/page.tsx#L100-L240))
- ✅ Encounter API exposes `GET /api/encounters/{id}/clinical_snapshot/` (reuses check-in snapshot service + serializer)
- ✅ Encounter detail page displays a collapsible banner at the top ([encounters/[id]/page.tsx](../web-app/app/(dashboard)/encounters/[id]/page.tsx))

**Implementation (Done):**

1. **Encounter endpoint:**
    - `GET /api/encounters/{id}/clinical_snapshot/` implemented as a ViewSet action.
    - Reuses `get_clinical_snapshot()` and `ClinicalSnapshotSerializer` from the check-in module (no duplicated clinical summary logic).

2. **Encounter banner component:**
    - Collapsible banner showing allergies, conditions, medications, pending results, and auto-generated alerts.
    - Highlights severe allergy alerts using destructive styling for clinician attention.

3. **Data fetching:**
    - Added `encountersApi.getClinicalSnapshot()` and `useEncounterClinicalSnapshot(encounterId)`.

**Files to modify:**
- `backend/hmis/apps/encounters/views.py` - Added `clinical_snapshot` action
- `backend/tests/test_encounter_clinical_snapshot_api.py` - Added endpoint tests
- `web-app/components/encounters/clinical-snapshot-banner.tsx` - Added banner component
- `web-app/app/(dashboard)/encounters/[id]/page.tsx` - Rendered banner near the top
- `web-app/lib/api/encounters.ts` - Added `getClinicalSnapshot()` client method
- `web-app/lib/hooks/use-encounters.ts` - Added `useEncounterClinicalSnapshot()` hook

**Effort:** 4-6 hours | **Risk if skipped:** Medication errors, missed allergies

---

#### 2. Auto-Create Invoice Items from Orders ✅ **Completed**

**Problem:** Lab orders, pharmacy dispensing, and imaging orders don't automatically generate billing line items. Staff must manually add items, risking revenue leakage.

**Current State:**
- ✅ `InvoiceItem` model links to `LabOrder`, `Dispensing`, `ImagingOrder`
- ✅ Django signals auto-create items when orders are placed
- ✅ `InvoiceItem.ItemType.IMAGING` added with `imaging_order` FK

**Implementation (Done):**

1. **Pharmacy signal** ([pharmacy/signals.py](../backend/hmis/apps/pharmacy/signals.py)):
   - `@receiver(post_save, sender=PrescriptionItem)` auto-creates `InvoiceItem`

2. **Imaging signal** ([imaging/signals.py](../backend/hmis/apps/imaging/signals.py)):
   - `@receiver(post_save, sender=ImagingOrderItem)` auto-creates `InvoiceItem`
   - Only adds to DRAFT invoices (finalized invoices not modified)

3. **Lab orders:** Handled via `LabOrder.add_test()` method

**Effort:** Completed | **Tests:** Passing

---

#### 3. Implement Patient SMS/Email Reminders ⚠️ **Partially Complete**

**Problem:** No automated patient-facing notifications for appointment reminders, follow-up dates, or medication refills. This leads to no-shows and treatment gaps.

**Current State:**
- ✅ `Notification` model exists for staff notifications
- ✅ `Appointment` model has `scheduled_start`
- ✅ SMS gateway implemented (`core/sms_gateway.py` with tests)
- ❌ No `reminder_sent` field on `Appointment` model
- ❌ No Celery Beat scheduled task for automated reminders

**Remaining Implementation:**

1. **Add `reminder_sent` field to Appointment model:**
   ```python
   # backend/hmis/apps/scheduling/models.py
   reminder_sent = models.BooleanField(default=False)
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

#### 7. Drug-Drug Interaction Checking ✅ **Completed**

**Problem:** No automated clinical decision support for drug interactions.

**Current State:**
- ✅ `CDSRule` model supports `DRUG_ALLERGY` and `DRUG_DRUG` rule categories via JSON Logic
- ✅ Frontend `enhanced-cds-panel.tsx` provides real-time rule evaluation during consultations
- ✅ Rules evaluated against patient context (current medications, allergies)

**Remaining consideration:** Population of the rule database with comprehensive drug interaction data (potentially from external sources like OpenFDA or First Databank).

---

#### 8. Complete Imaging Module ✅ **Completed**

**Current State:**
- ✅ `ImagingProcedure` catalog with RadLex and LOINC codes
- ✅ `ImagingOrder` with full status workflow (DRAFT → ORDERED → SCHEDULED → IN_PROGRESS → COMPLETED → REPORTED)
- ✅ `STATUS_TRANSITIONS` dictionary enforces valid workflows
- ✅ DICOM/PACS integration fields (`accession_number`, `study_instance_uid`)
- ✅ Auto-invoice signal for billing integration
- ✅ Frontend pages: Orders, Procedures, Studies, Worklist

---

### 🟢 LOW PRIORITY (Nice-to-Have)

#### 9. QR Code Patient Check-In ✅ **Completed**

**Current State:**
- ✅ Patient QR endpoint returns a unique QR per patient derived from MRN
- ✅ Patient detail page embeds the QR inline beside the MRN with expand, print, and download actions
- ✅ Check-in page includes QR scanner dialog for camera-based lookup
- ✅ Scanner decodes `VITORA:MRN:{mrn}` payloads and auto-populates the patient search field

**Notes:**
- QR codes are generated on demand, so existing patients do not require a backfill job as long as they already have an MRN.
- Remaining related work is limited to optional batch-print workflows for registration desks.

---

#### 10. Biometric Patient Identification

**Implementation:**
- Integrate fingerprint scanner SDK (e.g., SecuGen)
- Store biometric template in patient record
- Match on check-in

**Effort:** 20-40 hours (hardware-dependent)

---

#### 11. Real-Time Queue Display (WebSocket) ✅ **Completed**

**Current State:**
- ✅ Django Channels `ClinicQueueConsumer` for WebSocket
- ✅ Frontend `useClinicQueueSocket` hook for real-time queue updates
- ✅ Queue position changes pushed to connected clients

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
| **Mobile responsiveness** | Proper overlay sidebar with backdrop + Telegram-style bottom nav bar |
| **Breadcrumbs** | Auto-generated from path |
| **Dark mode** | Consistent theming |

#### ⚠️ Navigation Friction Points

| Issue | Location | Impact | Recommendation |
|-------|----------|--------|----------------|
| **Check-in placement** | Top-level nav | ✅ **Fixed** - Check-in is now top-level | N/A |
| **No patient context bar** | All pages | When in patient context, no persistent patient info | Add persistent patient header when viewing patient-related pages |
| **Encounters ≠ Clinics confusion** | Separate nav items | Staff unsure which to use | Consider merging or adding visual connection |
| **Triage → Encounter transition** | Triage route step | After triage, nurse is routed to `triage/assess/[id]/[encounter]/route` for final routing decisions | Consider auto-redirect to clinic queue after routing step |
| **No "active patient" indicator** | Sidebar | No way to quickly return to current patient | Add "Current Patient" quick-access in sidebar |
| **Missing scheduling pages** | Only backend exists | No frontend pages for appointment management | Build scheduling UI (`/scheduling/`) |

### Recommended UX Improvements

#### 1. Patient Context Header (High Value) ⚠ Partial

**Problem:** When working on a patient (encounter, labs, pharmacy), there's no persistent context showing which patient is active.

**Solution:** Add a sticky patient context bar below the header when in patient scope:

```tsx
// web-app/components/layout/patient-shell-header.tsx
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

#### 3. Auto-Redirect After Triage ⚠️ **Partially Implemented**

**Current State:** Triage completion redirects to `triage/assess/[id]/[encounter]/route` for final routing decisions (destination selection).

**Remaining:** After the routing step, auto-redirect to the destination clinic queue instead of leaving the nurse on the route page.

```tsx
// After routing step submission:
router.push(`/clinics/${destinationClinic}/queue`);
```

**Effort:** 1-2 hours

---

#### 4. Bottom Navigation Bar (Mobile) — Telegram-Style ✅ **Completed**

**Problem:** On mobile, common actions (check-in, new encounter, triage) require opening the sidebar hamburger menu. This adds friction to the most frequent clinical workflows.

**Implementation:** [web-app/components/layout/mobile-bottom-nav.tsx](../web-app/components/layout/mobile-bottom-nav.tsx)

A floating, rounded (28px radius) bottom navigation bar rendered inside the dashboard layout. Hidden on `xl+` where the sidebar is persistent, and also hidden when the mobile sidebar overlay is open to avoid visual conflicts.

```
┌──────────────────────────────────────────────────┐
│ Page content...                                  │
│                                                  │
│   ╭──────────────────────────────────────────╮   │
│   │  🏠       📋       🩺(↑)     📄        👤  │   │
│   │  Home   Check-in  Triage  Encounters Patients│
│   ╰──────────────────────────────────────────╯   │
└──────────────────────────────────────────────────┘
```

**Features implemented:**

| Feature | Details |
|---------|---------|
| **Floating rounded tray** | Inset 12px from edges, `rounded-[28px]`, frosted glass backdrop blur, subtle shadow and radial gradient |
| **Role-based center tab** | Center (3rd) tab is the user's primary workflow: Triage for nurses, Pharmacy for pharmacists, Encounters as fallback |
| **Live badges** | Check-in tab shows today's check-in count via `useTodayCheckins`; Triage tab shows queue size via `useTriageQueue` (auto-refreshes) |
| **Center tab emphasis** | Center tab scaled 1.05×, larger icon circle, stronger active styling (filled primary when active) |
| **Sidebar-aware** | Hidden while mobile sidebar is open (`hidden={mobileSidebarOpen}` prop) |
| **RBAC filtering** | Tabs only shown if user has the required `moduleKey` + `actionKey` via `usePermissions()` |
| **Active state** | Active tab gets `bg-primary/10`, ring, and bolder icon stroke |
| **Safe area** | Supports iOS notch via `env(safe-area-inset-bottom)` |
| **Content clearance** | Main content has `pb-24 xl:pb-8` to avoid overlap |

**Tab composition (up to 5 tabs):**

| Slot | Default | Condition |
|------|---------|-----------|
| 1 | Home | Always (if `dashboard` module access) |
| 2 | Check-in | If `checkin` module access |
| 3 (center) | Triage / Pharmacy / Encounters | Role-based: Triage if nurse, Pharmacy if pharmacist, Encounters otherwise |
| 4 | Encounters | If not already in center slot |
| 5 | Patients | If `patients` module access |

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
| **Overall structure** | ✅ Keep as-is | Logical grouping, 11+ top-level modules, no major issues |
| **Module organization** | ✅ Keep as-is | Clinics/Diagnostics/Finance/Surveillance separation is correct |
| **Add patient context bar** | 🔴 **YES - High Priority** | Reduces errors, improves continuity |
| **Add recent/current patient** | 🟡 **YES - Medium Priority** | Quick navigation to active work |
| **Workflow mode toggle** | 🟢 **Consider later** | Major change, needs user research |
| **Auto-redirect after triage routing** | 🟡 **YES - Quick win** | Partially done, finish last step |
| **Scheduling pages** | 🔴 **YES - High Priority** | Backend exists, no UI yet |

### Summary: No Major Refactor Needed

The navigation is well-structured. Focus on **additions** (patient context bar, current patient section) rather than restructuring. The sidebar grouping and collapse behavior are production-ready.

---

## Implementation Roadmap (Remaining Gaps)

| Week | Focus | Deliverables |
|------|-------|--------------|
| **Week 1** | Type Safety | 1. Fix COMPLETED/CLOSED frontend/backend mismatch |
| **Week 2** | UX Polish | 2. Patient context bar, 3. Current patient in sidebar |
| **Week 3** | Scheduling UI | 4. Build scheduling frontend pages |
| **Week 4** | Automated Reminders | 5. Celery Beat task + `reminder_sent` field on Appointment |
| **Week 5** | Chronic Care | 6. Longitudinal care plan model |
| **Week 6** | Data Integrity | 7. Persist clinical snapshot with encounter, 8. Insurance eligibility at check-in |

---

## Appendix: Gap Closure Checklist

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 1 | Clinical snapshot in encounter view | ✅ Done | Banner + endpoint implemented |
| 2 | Auto-invoice from orders | ✅ Done | Signals for pharmacy, imaging, lab |
| 3 | SMS/email reminders | ⚠️ Partial | SMS gateway exists; needs Celery task + `reminder_sent` field |
| 4 | Persist snapshot with encounter | ⬜ TODO | `clinical_snapshot_at_start` field not yet on Encounter model |
| 5 | Longitudinal care plan | ⬜ TODO | No `CarePlan` model exists |
| 6 | Insurance eligibility at check-in | ⬜ TODO | |
| 7 | Drug interaction checking | ✅ Done | CDS rules + enhanced-cds-panel.tsx |
| 8 | Imaging module completion | ✅ Done | Full workflow + frontend pages |
| 9 | QR code check-in | ✅ Done | Unique patient QR, inline display, scanner dialog, and auto-lookup implemented |
| 10 | Biometric integration | ⬜ TODO | |
| 11 | Real-time queue display | ✅ Done | 7 WebSocket consumers across clinics, triage, lab, surveillance, MCH, inpatient |
| 12 | ARCHIVED encounter state | ⬜ TODO | |
| 13 | Patient context bar (UX) | ⬜ TODO | |
| 14 | Current patient in sidebar (UX) | ⬜ TODO | |
| 15 | Auto-redirect after triage (UX) | ⚠️ Partial | Route step exists, needs final redirect |
| 16 | Fix COMPLETED/CLOSED type mismatch | ⬜ TODO | Frontend has COMPLETED; backend doesn't |
| 17 | Scheduling frontend pages | ⬜ TODO | Backend exists, no UI |
| 18 | Counselling/Social Work/Nutrition pages | ✅ Done | Frontend pages now under `/allied-health/` |
| 19 | Referrals module | ✅ Done | Backend + frontend page |
| 20 | MCH module | ✅ Done | Backend + frontend pages |
| 21 | Surveillance module | ✅ Done | Backend + frontend pages |
| 22 | Quality reporting | ✅ Done | Backend + frontend pages |
| 23 | Theatre / Surgical scheduling | ✅ Done | Frontend at `/theatre/`, backend via scheduling resources |
| 24 | Emergency dashboard | ✅ Done | Frontend at `/emergency/`, WebSocket via triage consumers |
| 25 | AI Assistant (TibaBot) | ✅ Done | Chat, care plans, CDS, lab interp, discharge, ICU risk |
| 26 | Allied health (Physio, OT) | ✅ Done | Backend + frontend pages |
| 27 | Wait-time breach monitoring | ✅ Done | WaitTimeBreach + Escalation models, WebSocket alerts |
| 28 | Lab queue automation | ✅ Done | Auto queue entry, specimen generation, status sync via signals |
| 29 | Mobile bottom navigation bar | ✅ Done | Floating rounded tray, role-based center tab, live badges, sidebar-aware visibility |

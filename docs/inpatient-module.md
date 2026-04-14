# Inpatient Module — Comprehensive Documentation

> **Vitora HMIS** · Inpatient Ward Management, Bed Allocation, Nursing, and Discharge
> **Last Updated**: March 22, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Data Models](#3-data-models)
4. [Bed Allocation Engine](#4-bed-allocation-engine)
5. [Ward Compatibility & Constraints](#5-ward-compatibility--constraints)
6. [Admission Workflow](#6-admission-workflow)
7. [Ward Rounds & Clinical Reviews](#7-ward-rounds--clinical-reviews)
8. [Nursing Kardex & Care Plans](#8-nursing-kardex--care-plans)
9. [Clinical Observation Charts](#9-clinical-observation-charts)
10. [Transfers](#10-transfers)
11. [Automated Discharge Clearance](#11-automated-discharge-clearance)
12. [Discharge Workflow](#12-discharge-workflow)
13. [Supervisor Alerts & Escalation](#13-supervisor-alerts--escalation)
14. [Real-Time WebSocket Events](#14-real-time-websocket-events)
15. [AI Integration](#15-ai-integration)
16. [API Reference](#16-api-reference)
17. [Frontend Pages & Components](#17-frontend-pages--components)
18. [Management Commands](#18-management-commands)
19. [Testing](#19-testing)
20. [Troubleshooting](#20-troubleshooting)

---

## 1. Overview

The Inpatient module manages the entire lifecycle of a patient's hospital stay — from OPD admission recommendation through bed assignment, daily clinical reviews, nursing care, observation charting, and ultimately discharge with automated cross-departmental clearance.

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Smart bed allocation** | Three-phase engine: auto-assign → rule-based scoring → predictive smart allocation |
| **Ward compatibility** | Real-time constraint checking (gender, age, isolation, oxygen, ventilator) with override escalation |
| **Nursing kardex** | ADPIE-structured care plans, shift notes, and handover documentation |
| **Observation charts** | TPR, BP, fluid balance, blood transfusion monitoring |
| **Automated clearance** | Live validation against billing, pharmacy, lab, and nursing before discharge |
| **Real-time updates** | WebSocket notifications for ward events and supervisor alerts |
| **AI integration** | ICU escalation risk prediction and discharge readiness assessment via TibaBot |
| **Maternity continuity** | Seamless postpartum care routing from discharge to PNC clinic |

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Inpatient Module                               │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────────┐   │
│  │   Frontend   │  │  WebSocket   │  │      REST API (DRF)        │   │
│  │  (Next.js)   │◀▶│  Channels    │  │  17 ViewSets, 30+ actions  │   │
│  │  8 pages     │  │  2 consumers │  └────────────┬───────────────┘   │
│  │  16 components│  └──────────────┘               │                  │
│  └─────────────┘                       ┌───────────▼────────────┐     │
│                                        │    Service Layer        │     │
│                                        │  ┌──────────────────┐  │     │
│                                        │  │ Compatibility    │  │     │
│                                        │  │ BedAssignment    │  │     │
│                                        │  │ SmartAllocation  │  │     │
│                                        │  │ RuleEvaluator    │  │     │
│                                        │  └──────────────────┘  │     │
│                                        └───────────┬────────────┘     │
│                                                    │                  │
│  ┌────────────────────────────────────────────────▼────────────────┐  │
│  │                      20+ Django Models                          │  │
│  │  Ward · Bed · Admission · Discharge · Transfer · WardRound      │  │
│  │  NursingKardex · CarePlan · ShiftHandover · TPR · FluidBalance  │  │
│  │  BloodTransfusion · BPMonitoring · MedicationAdministration     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  Cross-Module Integration:                                            │
│  Billing ← Invoice clearance    Pharmacy ← Prescription dispensing   │
│  Laboratory ← Lab order status  Encounters ← IPD encounter link      │
│  Clinics ← PNC queue routing    Scheduling ← PNC appointment         │
│  MCH ← Maternity registration   AI ← ICU risk + discharge readiness  │
└───────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
backend/hmis/apps/inpatient/
├── models.py             # 20+ models (Ward, Bed, Admission, Discharge, etc.)
├── serializers.py        # Serializers with clearance validation logic
├── views.py              # 17 ViewSets with 30+ custom actions
├── urls.py               # Router registration + supervisor alert paths
├── routing.py            # WebSocket URL patterns
├── consumers.py          # WardCompatibilityConsumer, SupervisorAlertConsumer
├── signals.py            # post_save handlers for constraint updates
├── tasks.py              # Celery task for critical violation email alerts
├── websockets.py         # Broadcast helpers for channel layer
├── admin.py              # Django admin registration
├── services/
│   ├── compatibility.py  # Ward constraint validation engine
│   ├── bed_assignment.py # Auto-assign + rule-based allocation
│   ├── bed_smart.py      # Predictive smart allocation with LOS forecasting
│   └── bed_rules.py      # DSL rule evaluator for bed scoring
└── management/commands/
    ├── generate_ward_beds.py       # Backfill bed records from capacity
    └── seed_bed_assignment_rules.py # Create default assignment rules

web-app/
├── app/(dashboard)/admissions/
│   ├── page.tsx                    # Admissions list + dashboard stats
│   ├── new/page.tsx                # New admission form
│   ├── supervisor-alerts/page.tsx  # Supervisor override dashboard
│   └── [id]/
│       ├── page.tsx                # Admission detail (central hub)
│       ├── ward-round/page.tsx     # Ward round documentation
│       ├── kardex/page.tsx         # Nursing kardex management
│       ├── transfer/page.tsx       # Transfer form
│       └── discharge/page.tsx      # Discharge workflow
├── components/inpatient/
│   ├── clearance-status-panel.tsx  # Automated clearance display
│   ├── discharge-readiness-panel.tsx # AI readiness assessment
│   ├── icu-risk-assessment-panel.tsx # AI ICU risk prediction
│   ├── bed-selection-grid.tsx      # Visual bed map for ward
│   ├── bed-recommendation-card.tsx # Smart allocation results
│   ├── compatibility-override-dialog.tsx # Constraint override form
│   ├── supervisor-alerts-panel.tsx # Real-time alerts
│   ├── admission-orders-tab.tsx    # Lab/Imaging/Pharmacy orders
│   ├── consumable-usage-panel.tsx  # Ward stock consumption
│   ├── tpr-chart.tsx               # Temperature/Pulse/Respiration chart
│   ├── bp-monitoring-chart.tsx     # Blood pressure chart
│   ├── fluid-balance-sheet.tsx     # I&O monitoring
│   ├── blood-transfusion-chart.tsx # Transfusion observation chart
│   ├── temperature-chart.tsx       # Standalone temperature chart
│   ├── constraint-override-metrics.tsx # Override statistics
│   └── admission-success-modal.tsx # Post-admission confirmation
└── lib/
    ├── types/inpatient.ts          # 40+ TypeScript interfaces
    ├── schemas/inpatient.schema.ts # Zod validation schemas
    ├── api/inpatient.ts            # API client methods
    └── hooks/use-inpatient.ts      # 60+ React Query hooks
```

---

## 3. Data Models

### 3.1 Ward

Hospital wards with capacity, typing, and clinical equipment constraints.

| Field | Type | Description |
|-------|------|-------------|
| `name` | CharField | Ward name (e.g., "Medical Ward 1") |
| `code` | CharField (unique) | Short code (e.g., "MW001") |
| `ward_type` | CharField | `MEDICAL`, `SURGICAL`, `PEDIATRIC`, `MATERNITY`, `ICU`, `ISOLATION` |
| `capacity` | PositiveIntegerField | Maximum bed count |
| `daily_rate` | DecimalField | Daily bed charge (KES) |
| `gender_restriction` | CharField | `ANY`, `MALE_ONLY`, `FEMALE_ONLY` |
| `min_age_years` / `max_age_years` | IntegerField (nullable) | Age restrictions |
| `isolation_capable` | BooleanField | Has isolation facilities |
| `oxygen_equipped` | BooleanField | Has oxygen supply |
| `ventilator_capable` | BooleanField | Has ventilator support |
| `maternity_designated` | BooleanField | Designated for maternity |
| `emergency_buffer_percent` | DecimalField | % beds reserved for emergencies |
| `is_active` | BooleanField | Ward is operational |

**Computed Properties:**
- `available_beds` — count of beds with status `AVAILABLE`
- `occupied_beds` — count of beds with status `OCCUPIED`
- `occupancy_rate` — `occupied_beds / capacity * 100`
- `total_beds` — total bed count regardless of status

**Auto-generation:** When a Ward is created with `capacity > 0`, beds are auto-generated (e.g., capacity=20 → beds B-001 through B-020).

### 3.2 Bed

Individual bed positions within a ward.

| Field | Type | Description |
|-------|------|-------------|
| `ward` | ForeignKey(Ward) | Parent ward |
| `bed_number` | CharField | Bed identifier (e.g., "B-001") |
| `status` | CharField | `AVAILABLE`, `OCCUPIED`, `CLEANING_IN_PROGRESS`, `MAINTENANCE`, `RESERVED` |
| `bed_type` | CharField | `STANDARD`, `ICU`, `ISOLATION`, `CRIB` (nullable) |
| `status_changed_by` | ForeignKey(User) | Last user who changed status |

**State Machine:**

```
AVAILABLE ──mark_occupied()──▶ OCCUPIED ──mark_cleaning()──▶ CLEANING_IN_PROGRESS
    ▲                                                                │
    └──────────────────── mark_available() ◀─────────────────────────┘

AVAILABLE ──mark_maintenance()──▶ MAINTENANCE ──mark_available()──▶ AVAILABLE
AVAILABLE ──mark_reserved()──▶ RESERVED ──mark_occupied()──▶ OCCUPIED
```

**Unique Constraint:** `(ward, bed_number)` — no duplicate bed numbers per ward.

### 3.3 AdmissionRecommendation

OPD/Emergency clinician's recommendation to admit a patient.

| Field | Type | Description |
|-------|------|-------------|
| `encounter` | ForeignKey(Encounter) | Source OPD/Emergency encounter |
| `recommended_by` | ForeignKey(User) | Recommending clinician |
| `reason` | TextField | Clinical justification |
| `provisional_diagnosis` | CharField | Working diagnosis text |
| `urgency` | CharField | `ROUTINE`, `URGENT`, `EMERGENCY` |
| `preferred_ward_type` | CharField (nullable) | Preferred ward type |
| `requires_isolation` | BooleanField | Isolation requirement |
| `requires_oxygen` | BooleanField | Oxygen requirement |
| `requires_ventilator` | BooleanField | Ventilator requirement |
| `status` | CharField | `PENDING`, `ACCEPTED`, `DECLINED`, `EXPIRED` |

**Workflow Methods:**
- `accept(user)` — sets status to `ACCEPTED`
- `decline(user, reason)` — sets status to `DECLINED` with documented reason
- `is_expired` — property checking if the recommendation has timed out

### 3.4 Admission

Core inpatient admission record linking patient to bed/ward.

| Field | Type | Description |
|-------|------|-------------|
| `patient` | ForeignKey(Patient) | Admitted patient |
| `opd_encounter` | ForeignKey(Encounter, nullable) | Source OPD encounter |
| `ipd_encounter` | OneToOneField(Encounter) | IPD encounter (auto-created) |
| `admission_number` | CharField (unique) | Format: `ADM-YYYYMMDD-XXXX` |
| `admission_date` | DateTimeField | Date/time of admission |
| `ward` | ForeignKey(Ward) | Assigned ward |
| `bed` | ForeignKey(Bed) | Assigned bed |
| `admitting_diagnosis` | CharField | ICD-10 code |
| `admitting_diagnosis_text` | CharField | Diagnosis free text |
| `admitting_officer` | ForeignKey(User) | Admitting clinician |
| `admission_status` | CharField | `ACTIVE`, `DISCHARGED`, `TRANSFERRED_OUT`, `DECEASED`, `ABSCONDED` |
| `payer_type` | CharField | `CASH`, `SHA`, `CORPORATE` |
| `constraint_override` | JSONField (nullable) | Override details if placed against constraints |
| `expected_discharge_date` | DateField (nullable) | Clinician estimate for smart allocation |
| `diet` | CharField (nullable) | Dietary orders |
| `special_instructions` | TextField (nullable) | Special care notes |
| `mch_registration` | ForeignKey (nullable) | Linked MCH registration for maternity |
| `discharge_date` | DateTimeField (nullable) | Set on discharge |

**Database Constraints:**
- Unique active admission per patient: `UniqueConstraint(fields=["patient"], condition=Q(admission_status="ACTIVE"))`
- Unique active bed assignment: `UniqueConstraint(fields=["bed"], condition=Q(admission_status="ACTIVE"))`

**Computed Properties:**
- `length_of_stay` — days from admission to now (or discharge date)

### 3.5 Discharge

Patient discharge record with clinical summary and clearance tracking.

| Field | Type | Description |
|-------|------|-------------|
| `admission` | OneToOneField(Admission) | Source admission |
| `discharge_type` | CharField | `NORMAL`, `AGAINST_ADVICE`, `TRANSFERRED`, `DECEASED`, `ABSCONDED` |
| `discharge_date` | DateTimeField | Date/time of discharge |
| `discharged_by` | ForeignKey(User) | Processing clinician |
| `admission_diagnosis` | CharField | ICD-10 code at admission |
| `final_diagnosis` | CharField | ICD-10 code at discharge |
| `final_diagnosis_text` | CharField | Final diagnosis text |
| `procedures_performed` | TextField | Procedures during stay |
| `treatment_summary` | TextField | Treatment narrative |
| `discharge_medications` | JSONField | List of take-home medications |
| `follow_up_date` | DateField (nullable) | Follow-up appointment date |
| `follow_up_instructions` | TextField | Follow-up care instructions |
| `patient_instructions` | TextField | Patient discharge instructions |
| `pharmacy_cleared` | BooleanField | Auto-set from live data |
| `billing_cleared` | BooleanField | Auto-set from live data |
| `lab_results_acknowledged` | BooleanField | Auto-set from live data |
| `maternity_continuity_action` | CharField | `NONE`, `SCHEDULE_EARLY_PNC`, `ROUTE_TO_PNC_QUEUE` |

**On Save:** Automatically updates `admission.admission_status` and triggers `bed.mark_cleaning()` for the housekeeping workflow.

### 3.6 DischargeDiagnosis

Multiple diagnoses per discharge with role assignment.

| Field | Type | Description |
|-------|------|-------------|
| `discharge` | ForeignKey(Discharge) | Parent discharge |
| `role` | CharField | `PRIMARY`, `SECONDARY`, `COMPLICATION` |
| `code` | CharField | ICD-10 code |
| `description` | CharField | Diagnosis text |

**Constraint:** Only one `PRIMARY` diagnosis per discharge.

### 3.7 Transfer

Intra-hospital ward-to-ward patient transfers.

| Field | Type | Description |
|-------|------|-------------|
| `admission` | ForeignKey(Admission) | Active admission |
| `source_ward` / `source_bed` | ForeignKey | Origin ward and bed |
| `destination_ward` / `destination_bed` | ForeignKey | Target ward and bed |
| `reason` | CharField | `STEP_UP`, `STEP_DOWN`, `SPECIALTY`, `BED_MANAGEMENT`, `PATIENT_REQUEST`, `OTHER` |
| `reason_details` | TextField | Detailed justification |
| `clinical_handover_notes` | TextField | Clinical handover documentation |
| `transferred_by` | ForeignKey(User) | Clinician processing transfer |

### 3.8 WardRound

Daily clinical reviews in SOAP format.

| Field | Type | Description |
|-------|------|-------------|
| `admission` | ForeignKey(Admission) | Active admission |
| `round_date` / `round_time` | Date/TimeField | When the round occurred |
| `conducted_by` | ForeignKey(User) | Clinician |
| `review_type` | CharField | `ROUTINE`, `CONSULTANT`, `SPECIALIST`, `EMERGENCY` |
| `subjective` | TextField | Patient's reported symptoms |
| `objective` | TextField | Clinical findings |
| `assessment` | TextField | Clinical assessment |
| `plan` | TextField | Treatment plan |
| `condition_status` | CharField | `STABLE`, `IMPROVING`, `DETERIORATING`, `CRITICAL`, `UNCHANGED` |
| `vital_signs` | JSONField | Embedded vitals snapshot |
| `diet_orders` | CharField (nullable) | Dietary changes |
| `requires_consultant_review` | BooleanField | Flag for escalation |

### 3.9 ReviewRequest

Urgent or consultant review requests.

| Field | Type | Description |
|-------|------|-------------|
| `admission` | ForeignKey(Admission) | Active admission |
| `review_type` | CharField | `CONSULTANT`, `SPECIALIST`, `URGENT`, `CODE_BLUE` |
| `urgency` | CharField | `ROUTINE`, `URGENT`, `EMERGENCY` |
| `status` | CharField | `PENDING`, `ACKNOWLEDGED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `requested_by` / `assigned_to` | ForeignKey(User) | Requester and assignee |
| `clinical_reason` | TextField | Reason for review |
| `response_notes` | TextField | Reviewer's response |

**Property:** `is_overdue` — True if pending past expected response time.

### 3.10 NursingKardex

Nursing care coordination hub (one per admission).

| Field | Type | Description |
|-------|------|-------------|
| `admission` | OneToOneField(Admission) | Linked admission |
| `fall_risk` | CharField | Risk level assessment |
| `pressure_sore_risk` | CharField | Pressure sore risk level |
| `mobility_status` | CharField | Patient mobility status |
| `diet` | CharField | Current diet orders |
| `fluid_restriction` | CharField (nullable) | Fluid restriction details |
| `isolation_precautions` | CharField (nullable) | Isolation requirements |
| `special_instructions` | TextField | Additional care notes |

**Related Models:**
- `NursingCarePlanEntry` — ADPIE-structured nursing problems/interventions
- `KardexShiftNote` — Per-shift nursing notes
- `KardexHandoverNote` — Shift handover documentation

### 3.11 NursingCarePlanEntry

Follows the ADPIE nursing process matching Kenyan physical forms.

| Field | Type | Description |
|-------|------|-------------|
| `kardex` | ForeignKey(NursingKardex) | Parent kardex |
| `recorded_at` | DateTimeField | When recorded |
| `recorded_by` | ForeignKey(User) | Recording nurse |
| `assessment` | TextField | Assessment findings / cluster of cues |
| `nursing_diagnosis` | TextField | Nursing diagnosis |
| `goal_and_outcome_criteria` | TextField | Expected goals and outcomes |
| `plan_of_action` | TextField | Planned interventions |
| `scientific_rationale` | TextField | Rationale for interventions |
| `implementation` | TextField (blank) | What was carried out |
| `evaluation` | TextField (blank) | Whether goals were met |
| `status` | CharField | `ACTIVE`, `RESOLVED`, `ONGOING` |

### 3.12 Clinical Observation Charts

#### TemperatureReading
Records temperature with automatic pyrexia/hypothermia flags.
- **Properties:** `is_febrile` (>37.5°C), `is_hypothermic` (<35.0°C)

#### FluidBalanceSheet (One per admission per day)
Tracks intake and output with computed balance.
- **Properties:** `total_intake_ml`, `total_output_ml`, `net_balance_ml` (with breakdowns by type)
- **Entry types:** `INTRAVENOUS`, `ALIMENTARY`, `OTHER_INTAKE`, `VOMIT`, `STOOL`, `NASOGASTRIC`, `URINE`, `OTHER_OUTPUT`
- **Constraint:** Unique `(admission, chart_date)`

#### BPMonitoringReading
Blood pressure readings with clinical interpretation.
- **Properties:** `mean_arterial_pressure`, `bp_display`, `is_hypertensive`, `is_hypotensive`

#### BloodTransfusionObservation
Tracks blood product transfusions with timed observation entries and adverse reaction detection.
- **Statuses:** `PENDING`, `IN_PROGRESS`, `COMPLETED`, `REACTION_STOPPED`

#### MedicationAdministration
Tracks individual medication doses given at the bedside.
- **Statuses:** `SCHEDULED`, `ADMINISTERED`, `MISSED`, `HELD`, `REFUSED`
- **Property:** `is_overdue` — flag for overdue scheduled doses

### 3.13 ShiftHandover

Structured nursing shift handover documentation.

| Field | Type | Description |
|-------|------|-------------|
| `ward` | ForeignKey(Ward) | Ward being handed over |
| `shift_date` | DateField | Date of the shift |
| `shift_ending` | CharField | `DAY`, `EVENING`, `NIGHT` |
| `outgoing_nurse` / `incoming_nurse` | ForeignKey(User) | Nurses involved |
| `patient_summaries` | JSONField | Per-patient summary data |
| `critical_alerts` | JSONField | Critical items to flag |
| `pending_tasks` | JSONField | Tasks carried forward |
| `acknowledged_at` | DateTimeField (nullable) | When incoming nurse signed off |

**Unique Constraint:** `(ward, shift_date, shift_ending)` — one handover per shift per ward.

### 3.14 InpatientConsumableUsage

Tracks pharmacy stock consumed at the bedside (outside pharmacy dispensing workflow).

| Field | Type | Description |
|-------|------|-------------|
| `admission` | ForeignKey(Admission) | Active admission |
| `drug` | ForeignKey(Drug) | Consumed drug |
| `quantity_used` | DecimalField | Amount used |
| `used_at` | DateTimeField | When consumed |
| `recorded_by` | ForeignKey(User) | Recording nurse |
| `is_reversed` | BooleanField | Whether usage was reversed |

---

## 4. Bed Allocation Engine

The inpatient module implements a three-phase bed allocation engine that progressively adds intelligence:

### Phase A — Auto-Assign (MVP)

```python
BedAssignmentService.auto_assign_bed(ward, user)
```

- Selects the **first available bed** by bed number
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent race conditions during concurrent admissions
- Records `bed_auto_assigned` audit log entry

### Phase B — Rule-Based Scoring

```python
BedAssignmentRuleEvaluator.evaluate_beds_for_patient(ward, patient, clinical_requirements)
```

- Evaluates each available bed against configurable DSL rules
- Rules are seeded via `seed_bed_assignment_rules` management command
- Produces a **ranked list** of beds with scores (0-100)
- Considers: ward type match, equipment proximity, isolation capability

### Phase C — Smart Allocation with Predictive Discharge

```python
SmartBedAllocationService.smart_assign_bed(ward, patient, clinical_requirements)
```

Extends rule-based with:

| Factor | Description |
|--------|-------------|
| **Predicted discharge** | Forecasts bed availability using `expected_discharge_date` or historical Average LOS per diagnosis |
| **Emergency buffer** | Reserves configurable % of beds for emergency admissions |
| **Affinity scoring** | Weights gender match, age-appropriateness, and "capability efficiency" (avoids wasting ICU beds on stable patients) |
| **Workload balancing** | Distributes patients across wards based on nursing workload |
| **Cohort grouping** | Groups patients with similar diagnoses together |

---

## 5. Ward Compatibility & Constraints

The `WardCompatibilityService` validates patient-ward fit before admission.

### Constraint Types

| Constraint | Check | Severity | Override Allowed |
|-----------|-------|----------|-----------------|
| **Gender** | Ward's `gender_restriction` vs patient gender | WARNING | Yes |
| **Age** | Ward's `min/max_age_years` vs patient age | WARNING | Yes |
| **Isolation** | `requires_isolation` vs `ward.isolation_capable` | CRITICAL | No |
| **Oxygen** | `requires_oxygen` vs `ward.oxygen_equipped` | CRITICAL | Yes |
| **Ventilator** | `requires_ventilator` vs `ward.ventilator_capable` | CRITICAL | No |
| **Ward type** | MATERNITY → Female only, PEDIATRIC → Age < 15 | WARNING | Yes |

### Override Flow

```
Compatibility Check Failed (WARNING severity)
    │
    ├──▶ Clinician provides override reason in UI
    │        └── Override recorded in admission.constraint_override (JSONField)
    │
    └──▶ If CRITICAL severity:
              ├── Supervisor alert broadcast via WebSocket
              ├── Email notification to users with receive_critical_alerts permission
              └── Logged in AuditLog with severity level
```

---

## 6. Admission Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                     Admission Workflow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. OPD/Emergency Encounter                                      │
│     └── Clinician creates AdmissionRecommendation                │
│         (urgency: ROUTINE / URGENT / EMERGENCY)                  │
│                                                                  │
│  2. Admissions Desk receives recommendation                      │
│     └── Reviews: provisional diagnosis, urgency, requirements    │
│                                                                  │
│  3. Ward & Bed Selection                                         │
│     ├── Ward compatibility check (constraints engine)            │
│     ├── Smart bed allocation (recommended beds list)             │
│     ├── Manual selection via bed grid (visual ward map)          │
│     └── Override dialog if constraints violated                  │
│                                                                  │
│  4. Admission Created                                            │
│     ├── Admission number generated: ADM-YYYYMMDD-XXXX           │
│     ├── IPD Encounter auto-created                               │
│     ├── Bed marked as OCCUPIED                                   │
│     ├── Billing agent auto-creates DRAFT invoice                 │
│     │   (admission fee + first bed night)                        │
│     ├── NursingKardex auto-created                               │
│     └── AdmissionRecommendation status → ACCEPTED                │
│                                                                  │
│  5. Inpatient Stay                                               │
│     ├── Daily ward rounds → SOAP documentation                   │
│     ├── Nursing kardex → Care plans, shift notes                 │
│     ├── Orders → Lab, imaging, pharmacy                          │
│     ├── Observation charts → TPR, BP, fluid balance              │
│     ├── Transfers → Ward-to-ward if needed                       │
│     └── Review requests → Consultant/specialist escalation       │
│                                                                  │
│  6. Discharge (see section 11-12)                                │
│     ├── Automated clearance checks                               │
│     ├── Clinical summary + discharge medications                 │
│     ├── Bed → CLEANING_IN_PROGRESS                               │
│     └── Billing agent finalizes invoice (DRAFT → PENDING)        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Ward Rounds & Clinical Reviews

### SOAP Documentation

Each ward round captures the standard **SOAP** format:

- **S** (Subjective): Patient's reported symptoms and complaints
- **O** (Objective): Clinical examination findings
- **A** (Assessment): Clinical assessment and diagnosis
- **P** (Plan): Treatment plan and next steps

### Condition Status Codes

| Status | Meaning | Clinical Action |
|--------|---------|-----------------|
| `STABLE` | No significant change | Continue current management |
| `IMPROVING` | Positive clinical trend | Consider step-down or discharge planning |
| `DETERIORATING` | Worsening condition | Escalate care, consider ICU review |
| `CRITICAL` | Life-threatening | Immediate intervention, code response |
| `UNCHANGED` | Static condition | Review treatment effectiveness |

### Review Request Types

| Type | Urgency | Expected Response |
|------|---------|-------------------|
| `CONSULTANT` | Routine | Within 24 hours |
| `SPECIALIST` | Varies | Within shift |
| `URGENT` | Urgent | Within 2 hours |
| `CODE_BLUE` | Emergency | Immediate |

---

## 8. Nursing Kardex & Care Plans

### ADPIE Nursing Process

Each `NursingCarePlanEntry` follows the Kenyan nursing care plan format:

```
Assessment → Nursing Diagnosis → Goal & Outcome Criteria →
Plan of Action → Scientific Rationale → Implementation → Evaluation
```

### Care Plan Entry Lifecycle

```
ACTIVE ──(intervention effective)──▶ RESOLVED
   │
   └──(continuing problem)──▶ ONGOING ──(resolved)──▶ RESOLVED
```

Active care plan entries block discharge clearance in the nursing department.

### Shift Documentation

| Type | Purpose | Frequency |
|------|---------|-----------|
| **Shift Note** | General nursing observations per shift | Per shift |
| **Handover Note** | Structured handover between shifts | At shift change |
| **Care Plan Entry** | Problem-based intervention tracking | As needed |

### Shift Handover

The `ShiftHandover` model provides a formal handover process:

1. Outgoing nurse documents patient summaries, critical alerts, pending tasks
2. `auto_populate` action pre-fills data from active care plans and recent observations
3. Incoming nurse signs off (`acknowledge` action) with timestamp

---

## 9. Clinical Observation Charts

### TPR Chart (Temperature, Pulse, Respiration)

Temperature readings are recorded at defined intervals with automatic clinical flags:

| Threshold | Flag | Alert |
|-----------|------|-------|
| > 37.5°C | `is_febrile` | Pyrexia alert |
| < 35.0°C | `is_hypothermic` | Hypothermia alert |

Frontend visualization: `<TPRChart>` component renders a time-series graph.

### Fluid Balance Chart

Daily intake/output monitoring with 8 entry types:

**Intake:** Intravenous, Alimentary, Other
**Output:** Urine, Vomit, Stool, Nasogastric, Other

Computed properties provide running totals and net balance:
- `total_intake_ml` = IV + Alimentary + Other
- `total_output_ml` = Urine + Vomit + Stool + NG + Other
- `net_balance_ml` = Intake - Output

### Blood Pressure Monitoring

| Computed Property | Formula / Threshold |
|-------------------|---------------------|
| `mean_arterial_pressure` | (Systolic + 2×Diastolic) / 3 |
| `is_hypertensive` | Systolic ≥ 140 or Diastolic ≥ 90 |
| `is_hypotensive` | Systolic < 90 or Diastolic < 60 |
| `bp_display` | "120/80 mmHg" format |

### Blood Transfusion Monitoring

Timed observations during blood product administration:

```
PENDING ──(start)──▶ IN_PROGRESS ──(complete)──▶ COMPLETED
                          │
                          └──(adverse reaction)──▶ REACTION_STOPPED
```

Observation entries recorded at standard intervals with vitals.

### Medication Administration

Tracks individual medication dose administration:

```
SCHEDULED ──(given)──▶ ADMINISTERED
    │
    ├──(not given)──▶ MISSED
    ├──(clinical hold)──▶ HELD
    └──(patient refuses)──▶ REFUSED
```

---

## 10. Transfers

Ward-to-ward transfers preserve clinical continuity:

### Transfer Reasons

| Reason | Description |
|--------|-------------|
| `STEP_UP` | Escalation to higher care (e.g., general → ICU) |
| `STEP_DOWN` | De-escalation to lower care (e.g., ICU → general) |
| `SPECIALTY` | Move to specialty ward (e.g., surgical) |
| `BED_MANAGEMENT` | Operational bed management |
| `PATIENT_REQUEST` | Patient or family request |
| `OTHER` | Other reason (requires details) |

### Transfer Process

1. Clinician initiates transfer with clinical handover notes
2. Destination ward compatibility is checked
3. New bed is assigned in destination ward
4. Source bed marked `CLEANING_IN_PROGRESS`
5. Admission record updated with new ward/bed
6. Billing agent adjusts bed charges for the new daily rate

---

## 11. Automated Discharge Clearance

The discharge form uses **automated cross-departmental clearance** instead of manual checkboxes. Each department's status is queried against live data.

### Clearance Checks

| Department | What's Checked | Cleared When |
|-----------|----------------|-------------|
| **Billing** | Invoices linked to the IPD encounter | All invoices are `PAID`, `CANCELLED`, or `WRITTEN_OFF` (outstanding balance ≤ 0) |
| **Pharmacy** | Prescriptions linked to the admission | All prescriptions are `DISPENSED` or `CANCELLED` |
| **Laboratory** | Lab orders linked to the admission | All lab orders are `COMPLETED` or `CANCELLED` |
| **Nursing** | Active care plan entries on the admission's kardex | No care plan entries with status `ACTIVE` |

### Clearance Status API

```
GET /api/inpatient/admissions/{id}/clearance-status/
```

**Response:**
```json
{
  "billing": {
    "cleared": false,
    "reason": "Outstanding balance: KES 12,500.00",
    "outstanding_amount": 12500.00,
    "invoice_count": 2
  },
  "pharmacy": {
    "cleared": true,
    "reason": "All prescriptions dispensed",
    "pending_count": 0
  },
  "laboratory": {
    "cleared": false,
    "reason": "2 lab order(s) with pending results",
    "pending_count": 2,
    "pending_tests": ["CBC", "Urinalysis"]
  },
  "nursing": {
    "cleared": true,
    "reason": "No active nursing care plan entries",
    "pending_count": 0
  },
  "all_cleared": false
}
```

### Enforcement Layers

1. **Frontend:** `ClearanceStatusPanel` polls every 30 seconds and disables the discharge button until `all_cleared` is true
2. **Serializer:** `DischargeSerializer.validate()` performs live data queries and returns specific error messages per department
3. **Model:** `Discharge.clean()` validates live clearance data as a safety net for non-API callers
4. **Bypass:** `AGAINST_ADVICE`, `ABSCONDED`, `DECEASED`, and `TRANSFERRED` discharge types skip all clearance checks

### Resolving Blockers

Each uncleared department in the UI includes a **"Resolve" link** that navigates to the relevant module:
- Billing → `/billing/invoices?admission={id}`
- Pharmacy → `/pharmacy/prescriptions?admission={id}`
- Laboratory → `/laboratory/orders?admission={id}`
- Nursing → `/admissions/{id}?tab=nursing`

---

## 12. Discharge Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                     Discharge Workflow                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Clinician opens discharge form                               │
│     └── ClearanceStatusPanel auto-checks all departments         │
│                                                                  │
│  2. Select discharge type                                        │
│     ├── NORMAL → all clearances required                         │
│     ├── AGAINST_ADVICE → clearances bypassed                     │
│     ├── TRANSFERRED → clearances bypassed                        │
│     ├── DECEASED → clearances bypassed                           │
│     └── ABSCONDED → clearances bypassed                          │
│                                                                  │
│  3. Complete discharge form                                      │
│     ├── Final diagnosis (ICD-10, multi-diagnosis with roles)     │
│     ├── Treatment summary (AI-generated draft available)         │
│     ├── Patient instructions (AI-generated draft available)      │
│     ├── Discharge medications                                    │
│     └── Follow-up date & instructions                            │
│                                                                  │
│  4. Maternity continuity (if MCH-linked admission)               │
│     ├── SCHEDULE_EARLY_PNC → creates appointment                 │
│     └── ROUTE_TO_PNC_QUEUE → creates immediate clinic visit      │
│                                                                  │
│  5. CDS safety check (if AI enabled)                             │
│     └── Validates discharge medications against diagnoses         │
│                                                                  │
│  6. Submit discharge                                             │
│     ├── Serializer validates live clearance data                 │
│     ├── Clearance booleans auto-populated (audit snapshot)       │
│     ├── Admission status → DISCHARGED                            │
│     ├── Bed → CLEANING_IN_PROGRESS (housekeeping workflow)       │
│     ├── Billing agent finalizes invoice (DRAFT → PENDING)        │
│     └── MCH registration transitions to postnatal (if maternity) │
│                                                                  │
│  7. Print discharge document                                     │
│     └── PDF includes clinical summary, medications, follow-up    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 13. Supervisor Alerts & Escalation

### When Alerts Fire

Supervisor alerts are triggered when a clinician **overrides a CRITICAL ward constraint** during bed assignment:

- Placing a patient requiring isolation into a non-isolation ward
- Placing a patient requiring ventilator support into a non-ventilator ward
- Other critical compatibility violations

### Alert Delivery

| Channel | Mechanism | Latency |
|---------|-----------|---------|
| **WebSocket** | `SupervisorAlertConsumer` broadcasts to `supervisor_alerts` group | Milliseconds |
| **Email** | Celery task `notify_supervisors_critical_violation` | Seconds |
| **Polling** | `GET /api/inpatient/supervisor/alerts/` fallback endpoint | On demand |

### Alert Lifecycle

```
Override Detected → Alert Created → Broadcast (WS + Email)
    → Supervisor Reviews → Acknowledge (with notes) → Recorded
```

### Required Permission

Users need the `inpatient.receive_critical_alerts` permission to:
- Receive alert emails
- View the supervisor alerts dashboard
- Acknowledge alerts

---

## 14. Real-Time WebSocket Events

### Connection Paths

| Path | Consumer | Purpose |
|------|----------|---------|
| `ws/inpatient/wards/{ward_id}/` | `WardCompatibilityConsumer` | Per-ward updates |
| `ws/inpatient/supervisor/alerts/` | `SupervisorAlertConsumer` | Critical alerts |

### Event Types

**Ward Events** (sent to `ward_{id}` group):

| Event | Trigger | Data |
|-------|---------|------|
| `constraints_updated` | Ward constraint fields changed | Ward ID, changed fields |
| `capacity_changed` | Bed status change affects occupancy | Ward ID, new occupancy stats |
| `compatibility_violation` | Override placed | Admission ID, violation details |

**Supervisor Events** (sent to `supervisor_alerts` group):

| Event | Trigger | Data |
|-------|---------|------|
| `critical_alert` | CRITICAL constraint override | Alert details, patient MRN, violation |

---

## 15. AI Integration

### ICU Escalation Risk (TibaBot)

The `ICURiskAssessmentPanel` component requests an AI prediction of ICU escalation risk based on:
- Current vitals (from latest ward round)
- Diagnosis and comorbidities
- Lab results and trends
- Length of stay

**API:** `POST /api/ai/icu-risk/` → Returns risk score, contributing factors, and recommendations.

### Discharge Readiness (TibaBot)

The `DischargeReadinessPanel` evaluates clinical readiness for discharge:
- Vital sign stability
- Lab result trends
- Medication completion
- Kenya-specific criteria (SHA/NHIF coverage checks)
- Follow-up arrangements

**Advisory only** — does not block or auto-approve discharge.

### AI-Generated Discharge Documents

Clinicians can generate drafts via TibaBot:
- **Discharge Summary:** Synthesizes ward round findings into a clinical narrative
- **Patient Instructions:** Patient-friendly instructions in simple language

Both are generated as markdown and editable before final submission.

### CDS Safety Checks

Before discharge submission (if AI enabled), the system evaluates:
- Discharge medications against diagnoses for contraindications
- Drug-drug interactions in the discharge medication list

Alerts are shown in a dialog requiring clinician acknowledgment before proceeding.

---

## 16. API Reference

Base path: `/api/inpatient/`

### Wards

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/wards/` | List wards (filter: `ward_type`, `is_active`) |
| `POST` | `/wards/` | Create ward |
| `GET` | `/wards/{id}/` | Ward detail |
| `PATCH` | `/wards/{id}/` | Update ward |
| `GET` | `/wards/{id}/beds/` | List beds in ward |
| `POST` | `/wards/{id}/generate_beds/` | Auto-generate missing bed records |
| `POST` | `/wards/{id}/check_compatibility/` | Check patient-ward compatibility |
| `POST` | `/wards/bulk_check_compatibility/` | Check multiple wards at once |
| `POST` | `/wards/{id}/recommend_bed/` | Rule-based bed recommendation |
| `POST` | `/wards/{id}/smart_recommend_bed/` | Smart allocation with predictions |
| `POST` | `/wards/recommend_ward/` | Recommend best ward for patient |
| `GET` | `/wards/{id}/bed_utilization/` | Bed utilization analytics |
| `GET` | `/wards/{id}/predicted_discharges/` | Predicted upcoming discharges |
| `GET` | `/wards/{id}/updates/` | Recent ward events (polling fallback) |

### Beds

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/beds/` | List beds (filter: `ward`, `status`) |
| `POST` | `/beds/{id}/mark_cleaning/` | Mark bed for cleaning |
| `POST` | `/beds/{id}/mark_available/` | Mark bed as available |

### Admission Recommendations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admission-recommendations/` | List (filter: `status`, `urgency`) |
| `POST` | `/admission-recommendations/` | Create recommendation |
| `POST` | `/admission-recommendations/{id}/accept/` | Accept recommendation |
| `POST` | `/admission-recommendations/{id}/decline/` | Decline with reason |

### Admissions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admissions/` | List (filter: `patient`, `ward`, `admission_status`, `payer_type`) |
| `POST` | `/admissions/` | Create admission |
| `GET` | `/admissions/{id}/` | Admission detail |
| `PATCH` | `/admissions/{id}/` | Update admission |
| `GET` | `/admissions/{id}/clearance-status/` | Live clearance check |
| `GET` | `/admissions/{id}/orders/` | Combined lab/imaging/pharmacy orders |
| `GET` | `/admissions/{id}/lab-orders/` | Lab orders only |
| `GET` | `/admissions/{id}/imaging-orders/` | Imaging orders only |
| `GET` | `/admissions/{id}/prescriptions/` | Prescriptions only |
| `POST` | `/admissions/{id}/override_bed/` | Override bed with justification |
| `POST` | `/admissions/{id}/set_expected_discharge/` | Set predicted discharge date |
| `GET` | `/admissions/{id}/consumable-usage/` | List consumable usage |
| `POST` | `/admissions/{id}/record-consumable-usage/` | Record stock consumption |
| `POST` | `/admissions/{id}/reverse-consumable-usage/{usage_id}/` | Reverse usage entry |

### Discharges

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/discharges/` | List (filter: `admission`, `discharge_type`, `discharged_by`) |
| `POST` | `/discharges/` | Create discharge (validates clearance) |
| `GET` | `/discharges/{id}/` | Discharge detail |
| `PATCH` | `/discharges/{id}/` | Update discharge |

### Transfers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/transfers/` | List (filter: `source_ward`, `destination_ward`, `reason`) |
| `POST` | `/transfers/` | Create transfer |
| `GET` | `/transfers/{id}/` | Transfer detail |

### Ward Rounds

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ward-rounds/` | List (filter: `admission`, `condition_status`, `conducted_by`) |
| `POST` | `/ward-rounds/` | Create ward round |
| `GET` | `/ward-rounds/{id}/` | Ward round detail |
| `PATCH` | `/ward-rounds/{id}/` | Update ward round |

### Review Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/review-requests/` | List (filter: `admission`, `review_type`, `urgency`, `status`) |
| `POST` | `/review-requests/` | Create review request |
| `POST` | `/review-requests/{id}/acknowledge/` | Acknowledge request |
| `POST` | `/review-requests/{id}/complete/` | Mark as completed |
| `POST` | `/review-requests/{id}/cancel/` | Cancel request |

### Nursing Kardex

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/kardex/` | List (filter: `admission`, `fall_risk`, `pressure_sore_risk`) |
| `GET` | `/kardex/{id}/` | Kardex detail (nested notes and care plans) |
| `PATCH` | `/kardex/{id}/` | Update kardex |
| `POST` | `/kardex/{id}/add-shift-note/` | Add nursing shift note |
| `POST` | `/kardex/{id}/add-handover-note/` | Add handover note |
| `POST` | `/kardex/{id}/add-care-plan-entry/` | Add ADPIE care plan entry |
| `PATCH` | `/kardex/{id}/update-care-plan-entry/{entry_id}/` | Update care plan entry |

### Shift Handovers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/shift-handovers/` | List (filter: `ward`, `shift_date`, `shift_ending`) |
| `POST` | `/shift-handovers/` | Create handover |
| `POST` | `/shift-handovers/{id}/acknowledge/` | Incoming nurse sign-off |
| `POST` | `/shift-handovers/{id}/auto-populate/` | Pre-fill from active data |

### Observation Charts

| Endpoint | Filter Fields | Description |
|----------|--------------|-------------|
| `/temperature-readings/` | `admission` | TPR readings |
| `/fluid-balance-sheets/` | `admission`, `chart_date` | Daily I&O sheets |
| `/fluid-balance-entries/` | `fluid_balance_sheet`, `entry_type` | Individual I&O entries |
| `/blood-transfusions/` | `admission`, `status` | Transfusion records |
| `/blood-transfusions/{id}/add-observation/` | — | Add timed observation |
| `/blood-transfusions/{id}/mark-reaction/` | — | Record adverse reaction |
| `/blood-transfusions/{id}/complete/` | — | Complete transfusion |
| `/bp-readings/` | `admission` | BP monitoring records |
| `/medication-administrations/` | `admission`, `status`, `prescription_item` | Med admin records |
| `/medication-administrations/{id}/record/` | — | Record administration |

### Supervisor Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/supervisor/alerts/` | List recent critical alerts |
| `POST` | `/supervisor/alerts/acknowledge/` | Acknowledge an alert |
| `GET` | `/supervisor/alerts/metrics/` | Override statistics |

---

## 17. Frontend Pages & Components

### Pages

| Page | Path | Purpose |
|------|------|---------|
| **Admissions List** | `/admissions` | Dashboard with stats, active admissions table, pending recommendations |
| **New Admission** | `/admissions/new` | Admission form with bed selection grid and compatibility checks |
| **Admission Detail** | `/admissions/{id}` | Central hub with tabs: Activity, Ward Rounds, Orders, Nursing, Fluid Balance, AI |
| **Ward Round** | `/admissions/{id}/ward-round` | SOAP documentation form |
| **Nursing Kardex** | `/admissions/{id}/kardex` | Nursing care plan management |
| **Transfer** | `/admissions/{id}/transfer` | Transfer form with destination ward selection |
| **Discharge** | `/admissions/{id}/discharge` | Discharge form with automated clearance and AI summaries |
| **Supervisor Alerts** | `/admissions/supervisor-alerts` | Critical override monitoring dashboard |

### Key Components

| Component | Purpose |
|-----------|---------|
| `ClearanceStatusPanel` | Real-time automated clearance display with resolve links (polls every 30s) |
| `DischargeReadinessPanel` | AI-powered discharge readiness assessment |
| `ICURiskAssessmentPanel` | AI-powered ICU escalation risk prediction |
| `BedSelectionGrid` | Interactive visual bed map for ward |
| `BedRecommendationCard` | Displays smart allocation results with scores |
| `CompatibilityOverrideDialog` | Override justification form for constraint violations |
| `SupervisorAlertsPanel` | Real-time critical alert notifications |
| `AdmissionOrdersTab` | Combined view of lab, imaging, and pharmacy orders |
| `ConsumableUsagePanel` | Ward pharmacy stock consumption tracking |
| `TPRChart` | Temperature/Pulse/Respiration time-series visualization |
| `BPMonitoringChart` | Blood pressure trend visualization |
| `FluidBalanceSheet` | Intake/output monitoring display |
| `BloodTransfusionChart` | Transfusion observation timeline |
| `TemperatureChart` | Standalone temperature trend chart |
| `ConstraintOverrideMetrics` | Statistical dashboard of override patterns |
| `AdmissionSuccessModal` | Post-admission confirmation with next-step links |

### React Query Hooks

60+ hooks exported from `use-inpatient.ts`. Key categories:

**Ward Management:** `useInpatientWards`, `useInpatientWard`, `useCreateWard`, `useUpdateWard`, `useGenerateWardBeds`

**Bed Management:** `useBeds`, `useWardBeds`, `useUpdateBed`, `useMarkBedCleaning`, `useMarkBedAvailable`, `useBedUtilization`, `usePredictedDischarges`

**Smart Allocation:** `useRecommendBed`, `useSmartRecommendBed`, `useCheckWardCompatibility`, `useBulkCompatibilityCheck`

**Recommendations:** `useAdmissionRecommendations`, `useCreateAdmissionRecommendation`, `useAcceptAdmissionRecommendation`, `useDeclineAdmissionRecommendation`

**Admissions:** `useAdmissions`, `useAdmission`, `useCreateAdmission`, `useUpdateAdmission`, `useOverrideBed`, `useSetExpectedDischarge`

**Discharges:** `useClearanceStatus` (30s polling), `useDischarges`, `useDischarge`, `useDischargeByAdmission`, `useCreateDischarge`, `useUpdateDischarge`

**Transfers:** `useTransfers`, `useCreateTransfer`

**Ward Rounds:** `useAdmissionWardRounds`, `useCreateWardRound`, `useUpdateWardRound`

**Review Requests:** `useReviewRequests`, `useCreateReviewRequest`, `useAcknowledgeReviewRequest`, `useCompleteReviewRequest`

**Nursing:** `useKardex`, `useKardexByAdmission`, `useAddShiftNote`, `useAddHandoverNote`, `useAddCarePlanEntry`, `useUpdateCarePlanEntry`

**Shift Handovers:** `useShiftHandovers`, `useCreateShiftHandover`, `useAcknowledgeShiftHandover`, `useAutoPopulateShiftHandover`

**Observation Charts:** `useTemperatureReadings`, `useFluidBalanceSheets`, `useFluidBalanceEntries`, `useBloodTransfusions`, `useBPReadings`, `useMedicationAdministrations`

---

## 18. Management Commands

### generate_ward_beds

Generate bed records for wards that have capacity but missing bed records.

```bash
cd backend

# Preview (dry run)
python manage.py generate_ward_beds --dry-run

# Generate for all wards
python manage.py generate_ward_beds

# Specific ward only
python manage.py generate_ward_beds --ward MW001
```

### seed_bed_assignment_rules

Create default bed assignment rules for common ward types (Phase B allocation).

```bash
python manage.py seed_bed_assignment_rules
```

---

## 19. Testing

### Test Files

| File | Scope | Tests |
|------|-------|-------|
| `test_inpatient_api.py` | Ward and bed CRUD | Model creation, API operations |
| `test_inpatient_admission.py` | Admission lifecycle | Creation, auto-MRN, bed assignment, status transitions |
| `test_inpatient_discharge.py` | Discharge flow | Creation, validation, bed cleanup, date validation |
| `test_discharge_clearance.py` | **Automated clearance** | 18 tests: clearance endpoint, serializer validation, bypass for non-normal discharge |
| `test_inpatient_transfer.py` | Transfers | Ward-to-ward transfer creation and validation |
| `test_inpatient_ward_round.py` | Ward rounds | SOAP documentation, condition status tracking |
| `test_inpatient_kardex.py` | Nursing kardex | Shift notes, handover notes, care plan entries |
| `test_nursing_care_plan_entry.py` | Care plan entries | ADPIE structure, status transitions |
| `test_inpatient_shift_handover.py` | Shift handovers | Creation, acknowledgment, auto-populate |
| `test_inpatient_temperature_chart.py` | TPR recordings | Temperature readings, febrile/hypothermic flags |
| `test_inpatient_fluid_balance.py` | Fluid balance | I&O entries, daily totals, net balance |
| `test_inpatient_blood_transfusion.py` | Blood transfusion | Observations, reactions, completion |
| `test_inpatient_bp_monitoring.py` | BP monitoring | Readings, hypertension/hypotension flags |
| `test_ward_compatibility.py` | Constraint engine | Gender, age, isolation, oxygen, ventilator checks |
| `test_smart_allocation.py` | Smart bed allocation | Scoring, emergency buffer, predicted discharge |
| `test_supervisor_alerts.py` | Alert lifecycle | WebSocket broadcasts, email notifications, acknowledgment |
| `test_ward_websockets.py` | WebSocket consumers | Connection, group membership, event delivery |
| `test_bed_assignment_service.py` | Concurrency | Race condition prevention with SELECT FOR UPDATE |

### Running Tests

```bash
cd backend

# All inpatient tests
poetry run pytest tests/inpatient/ --no-cov -v

# Specific test file
poetry run pytest tests/inpatient/test_discharge_clearance.py --no-cov -v

# Tests matching a pattern
poetry run pytest tests/inpatient/ -k "clearance" --no-cov -v
```

---

## 20. Troubleshooting

### Ward has capacity but no beds appear

```bash
# Generate missing bed records
python manage.py generate_ward_beds --ward WARD_CODE

# Or via API
POST /api/inpatient/wards/{id}/generate_beds/
```

### Discharge blocked despite clearances being met

1. Check the clearance status endpoint: `GET /api/inpatient/admissions/{id}/clearance-status/`
2. Common causes:
   - **DRAFT invoice** with line items (billing agent created with charges) — settle the invoice
   - **Active nursing care plan entries** — resolve or close them on the kardex
   - **Lab order in IN_PROGRESS** — wait for results or cancel the order
3. The frontend polls every 30 seconds — click the refresh button for immediate update

### Bed status stuck on OCCUPIED after discharge

The `Discharge.save()` method automatically calls `bed.mark_cleaning()`. If this didn't fire:
- Check if the discharge was created outside the normal workflow
- Manually update: `POST /api/inpatient/beds/{id}/mark_cleaning/`

### WebSocket not receiving updates

1. Verify the backend is running with ASGI (daphne): `make api`
2. Check Redis is running (required for channel layer): `docker ps | grep redis`
3. Verify WebSocket URL: `ws://localhost:9088/ws/inpatient/wards/{ward_id}/`
4. Use the polling fallback: `GET /api/inpatient/wards/{id}/updates/`

### Constraint override not triggering alerts

1. Verify the override severity is `CRITICAL` (WARNING overrides don't trigger alerts)
2. Check Celery worker is running: `celery -A hmis worker --loglevel=info`
3. Verify users have `inpatient.receive_critical_alerts` permission

---

*Last Updated: March 22, 2026*

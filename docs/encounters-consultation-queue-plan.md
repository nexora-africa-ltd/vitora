# Epic: Move "Awaiting Consultation" to Encounters Page

> **Status**: In Progress (Phase 1 Complete)  
> **Created**: January 4, 2026  
> **Updated**: January 4, 2026  
> **Epic Goal**: Separate triage nurse workflow from doctor/clinician workflow by moving consultation queue to encounters page

---

## Current State Analysis

| Page | Current Content | Issue |
|------|----------------|-------|
| `/patients/` | Patient list with search, filter, CRUD | ✅ Primary patient management |
| `/encounters/` | Patient list (or generic encounters) | ❌ Redundant - duplicates /patients/ |
| `/triage/` | Triage queue + awaiting consultation | Mixed concerns - triage nurse vs doctor |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ROLE-BASED WORKFLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  RECEPTION/REGISTRATION        TRIAGE NURSE          DOCTOR/CLINICIAN
│  ─────────────────────        ────────────          ─────────────────
│        │                           │                       │
│        ▼                           ▼                       ▼
│   /patients/                  /triage/               /encounters/
│   - Register new patient      - Waiting Queue        - Consultation Queue
│   - Search patients           - Perform Triage       - Call Patient
│   - View patient history      - Assign Category      - Start Consultation
│   - Create encounter          - Route to Area        - Document Encounter
│                                                      - Order Labs/Imaging
│                                                      - Prescribe
│                                                      - Discharge/Admit
│                                                     
└─────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

### Q1: Configurable & Context-Aware Triage Policy

**Decision**: ✅ Triage requirement determined by visit type + facility policy  

#### Default Triage Policy (Configurable per Facility)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TRIAGE REQUIREMENT MATRIX                       │
│              (Aligned with Kenya Healthcare Standards)              │
├───────────────────────┬─────────────────┬───────────────────────────┤
│ Visit Type            │ Triage Required │ Rationale                 │
├───────────────────────┼─────────────────┼───────────────────────────┤
│ EMERGENCY             │ MANDATORY       │ ETAT/WHO triage required  │
│ OPD (Walk-in)         │ MANDATORY       │ Unscheduled, unknown Hx   │
│ INPATIENT_ADMISSION   │ MANDATORY       │ Baseline vitals, risk Ax  │
│ ANC (Antenatal)       │ MANDATORY       │ High-risk clinic          │
│ PAEDIATRIC            │ MANDATORY       │ High-risk clinic (ETAT)   │
│ DIALYSIS              │ MANDATORY       │ High-risk clinic          │
│ ONCOLOGY              │ MANDATORY       │ High-risk clinic          │
├───────────────────────┼─────────────────┼───────────────────────────┤
│ SCHEDULED_OPD         │ OPTIONAL        │ Pre-booked, can bypass    │
│ FOLLOW_UP             │ OPTIONAL        │ Known patient, recent Hx  │
│ CONSULTANT_REVIEW     │ OPTIONAL        │ Referred by another Dr    │
│ CHRONIC_STABLE        │ OPTIONAL        │ HTN/DM routine visit      │
│ SPECIALIST_CLINIC     │ OPTIONAL        │ ENT, Ortho, etc.          │
├───────────────────────┼─────────────────┼───────────────────────────┤
│ PROCEDURE             │ NOT_REQUIRED    │ Pre-assessed              │
│ DAY_CASE              │ NOT_REQUIRED    │ Pre-assessed              │
│ WARD_ROUND            │ NOT_REQUIRED    │ Patient under care        │
│ DISCHARGE_REVIEW      │ NOT_REQUIRED    │ Already admitted          │
└───────────────────────┴─────────────────┴───────────────────────────┘
```

> **Kenya Compliance Notes:**
> - MANDATORY types align with Level 4-6 facility requirements
> - Emergency uses ETAT (Emergency Triage Assessment and Treatment)
> - High-risk clinics (ANC, Paediatrics, Dialysis, Oncology) are mandatory per MOH guidelines
> - OPTIONAL allows vitals to be taken during consultation if bypassed
> - Facility can override OPTIONAL → MANDATORY via settings

#### Triage Policy Logic

```python
def determine_triage_requirement(encounter):
    """
    Determine if triage is required based on visit type.
    Aligned with Kenya MOH guidelines and Level 4-6 facility standards.
    """
    # MANDATORY: Cannot proceed to consultation without triage
    # (Unless explicitly bypassed with documented reason)
    MANDATORY_TRIAGE = [
        'EMERGENCY',      # ETAT/WHO triage required
        'OPD',            # Walk-in, unknown history
        'IPD',            # Inpatient admission baseline
        'ANC',            # High-risk: Antenatal
        'PAEDIATRIC',     # High-risk: ETAT for children
        'DIALYSIS',       # High-risk: Dialysis unit
        'ONCOLOGY',       # High-risk: Oncology
    ]
    
    # OPTIONAL: Can bypass with reason, vitals taken in consultation
    OPTIONAL_TRIAGE = [
        'SCHEDULED_OPD',      # Pre-booked appointment
        'FOLLOW_UP',          # Return visit
        'CONSULTANT_REVIEW',  # Specialist referral
        'CHRONIC_STABLE',     # Routine HTN/DM visit
        'SPECIALIST_CLINIC',  # ENT, Ortho, etc.
    ]
    
    # NOT_REQUIRED: Patient already assessed or under continuous care
    NO_TRIAGE = [
        'PROCEDURE',          # Pre-operative assessment done
        'DAY_CASE',           # Pre-assessed
        'WARD_ROUND',         # Patient under care
        'DISCHARGE_REVIEW',   # Already admitted
    ]
    
    visit_type = encounter.encounter_type
    
    if visit_type in NO_TRIAGE:
        return TriageRequirement.NOT_REQUIRED
    elif visit_type in OPTIONAL_TRIAGE:
        return TriageRequirement.OPTIONAL
    else:
        return TriageRequirement.MANDATORY
```

### Q2: Encounter Triage Flags

Add the following fields to the Encounter model:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `triage_requirement` | Choice | Auto-set | `MANDATORY`, `OPTIONAL`, `NOT_REQUIRED` |
| `triage_status` | Choice | `PENDING` | Current triage state |
| `triage_bypass_reason` | Choice | null | Reason if bypassed |
| `triage_bypassed_by` | FK(User) | null | Who authorized bypass |
| `triage_bypassed_at` | DateTime | null | When bypass was authorized |

#### Triage Status Choices

| Status | Description | Can Enter Consultation? |
|--------|-------------|-------------------------|
| `PENDING` | Awaiting triage (for MANDATORY/OPTIONAL) | ❌ No (if MANDATORY) |
| `IN_PROGRESS` | Currently being triaged | ❌ No |
| `COMPLETED` | Triage assessment done | ✅ Yes |
| `BYPASSED` | Triage skipped with reason | ✅ Yes |
| `NOT_APPLICABLE` | Triage not required for this visit | ✅ Yes |

#### Triage Bypass Reasons (Selectable)

| Code | Display Name | Applicable When |
|------|--------------|-----------------|
| `FOLLOW_UP` | Follow-up visit | Scheduled return visit |
| `CONSULTANT_REVIEW` | Consultant review | Specialist referral |
| `STABLE_CHRONIC` | Stable chronic patient | Routine chronic care |
| `EMERGENCY_STABILIZED` | Emergency already stabilized | Post-resuscitation |
| `CLINICIAN_DISCRETION` | Clinician discretion | Clinical judgment |
| `SYSTEM_OVERRIDE` | System/Admin override | Administrative |

### Q3: Area Filtering & Multi-Clinician Queue

**Decision**: ✅ Facility-configurable setting  
**Implementation**: 
- Add facility settings for queue visibility
- Options: "All patients", "Assigned area only", "Assigned to me only"
- Default: All patients visible (small facility mode)

### Q4: Call Patient Notification

**Decision**: ✅ YES - Trigger notification/announcement  
**Implementation**:
- Update encounter status to "CALLED"
- Trigger real-time notification (WebSocket/polling)
- Display announcement on waiting room display (future)
- Log call time in patient journey

---

## Patient Flow Diagrams

### Flow A: Emergency/Walk-in OPD (Triage MANDATORY)

```
┌──────────┐    ┌────────────┐    ┌─────────┐    ┌─────────────┐    ┌──────────────┐
│ Register │───▶│ Waiting    │───▶│ Triage  │───▶│ Consultation│───▶│ Disposition  │
│ Patient  │    │ Queue      │    │ Assess  │    │ Queue       │    │ (Discharge/  │
│          │    │ (Pre-Triage)│   │         │    │ (Post-Triage)│   │  Admit/Lab)  │
└──────────┘    └────────────┘    └─────────┘    └─────────────┘    └──────────────┘
     │                                │                │
     │                                │                │
     ▼                                ▼                ▼
  Encounter                    triage_status      consultation_status
  created with                 = COMPLETED        = CALLED / IN_PROGRESS
  triage_requirement           triage_category    
  = MANDATORY                  = RED/ORANGE/etc
  triage_status
  = PENDING
```

### Flow B: Scheduled OPD / Follow-up (Triage OPTIONAL)

```
┌──────────┐    ┌─────────────────────────────────────┐    ┌──────────────┐
│ Register │───▶│ Decision Point                      │───▶│ Disposition  │
│ Patient  │    │                                     │    │              │
└──────────┘    │  ┌─────────────┐  ┌───────────────┐ │    └──────────────┘
                │  │ Go to Triage│  │ Bypass Triage │ │
                │  │ (optional)  │  │ (with reason) │ │
                │  └──────┬──────┘  └───────┬───────┘ │
                │         │                 │         │
                │         ▼                 ▼         │
                │  ┌─────────────┐  ┌───────────────┐ │
                │  │ Consultation│  │ Consultation  │ │
                │  │ Queue       │  │ Queue         │ │
                │  │ (triaged)   │  │ (bypassed)    │ │
                │  └─────────────┘  └───────────────┘ │
                └─────────────────────────────────────┘
```

### Flow C: Procedure/Day Case (Triage NOT_REQUIRED)

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐
│ Register │───▶│ Consultation│───▶│ Procedure    │
│ Patient  │    │ Queue       │    │              │
│          │    │ (direct)    │    │              │
└──────────┘    └─────────────┘    └──────────────┘
     │
     │
     ▼
  Encounter
  created with
  triage_requirement = NOT_REQUIRED
  triage_status = NOT_APPLICABLE
```

---

## Consultation Queue Logic

### Who Appears in Consultation Queue?

```python
def get_consultation_queue():
    """
    Returns encounters ready for consultation.
    """
    return Encounter.objects.filter(
        # Not yet completed consultation
        consultation_status__in=['WAITING', 'CALLED'],
        
        # AND one of these triage conditions:
        Q(triage_status='COMPLETED') |           # Triaged
        Q(triage_status='BYPASSED') |            # Bypassed with reason
        Q(triage_status='NOT_APPLICABLE')        # Not required
        
    ).exclude(
        # Exclude if triage is mandatory but not done
        triage_requirement='MANDATORY',
        triage_status='PENDING'
    ).order_by(
        # Priority order
        '-is_emergency',                          # Emergencies first
        'triage_category_priority',               # RED > ORANGE > YELLOW > GREEN > BLUE
        'arrival_time'                            # Then by wait time
    )
```

### Queue Display Badges

| Triage Status | Badge Display | Color |
|---------------|---------------|-------|
| COMPLETED (RED) | 🔴 RED | Red |
| COMPLETED (ORANGE) | 🟠 ORANGE | Orange |
| COMPLETED (YELLOW) | 🟡 YELLOW | Yellow |
| COMPLETED (GREEN) | 🟢 GREEN | Green |
| COMPLETED (BLUE) | 🔵 BLUE | Blue |
| BYPASSED | ⏭️ Bypassed: {reason} | Gray |
| NOT_APPLICABLE | ➡️ Direct | Gray |

---

## Implementation Checklist

### Phase 1: Backend Model Updates

#### 1.1 Encounter Type & Triage Requirement
- [x] **Extend existing `ENCOUNTER_TYPE_CHOICES`** in `hmis/apps/encounters/models.py`:
  ```python
  # Current choices (keep existing):
  # ("OPD", "Outpatient Department"),
  # ("IPD", "Inpatient Department"),
  # ("EMERGENCY", "Emergency"),
  
  # Add new choices:
  ENCOUNTER_TYPE_CHOICES = [
      # Existing (MANDATORY triage)
      ("OPD", "Outpatient Department"),
      ("IPD", "Inpatient Department"),
      ("EMERGENCY", "Emergency"),
      # High-risk clinics (MANDATORY triage)
      ("ANC", "Antenatal Clinic"),
      ("PAEDIATRIC", "Paediatric Clinic"),
      ("DIALYSIS", "Dialysis Unit"),
      ("ONCOLOGY", "Oncology Clinic"),
      # Scheduled visits (OPTIONAL triage)
      ("SCHEDULED_OPD", "Scheduled Outpatient"),
      ("FOLLOW_UP", "Follow-up Visit"),
      ("CONSULTANT_REVIEW", "Consultant Review"),
      ("CHRONIC_STABLE", "Stable Chronic Care"),
      ("SPECIALIST_CLINIC", "Specialist Clinic"),
      # Pre-assessed (NOT_REQUIRED triage)
      ("PROCEDURE", "Scheduled Procedure"),
      ("DAY_CASE", "Day Case"),
      ("WARD_ROUND", "Ward Round"),
      ("DISCHARGE_REVIEW", "Discharge Review"),
  ]
  ```
- [x] Add `TRIAGE_REQUIREMENT_CHOICES`: `MANDATORY`, `OPTIONAL`, `NOT_REQUIRED`
- [x] Add `TRIAGE_STATUS_CHOICES`: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `BYPASSED`, `NOT_APPLICABLE`
- [x] Add `TRIAGE_BYPASS_REASON_CHOICES`

#### 1.2 Encounter Model Fields
- [x] Add `triage_requirement` field (auto-set based on encounter_type)
- [x] Add `triage_status` field (default: computed from requirement)
- [x] Add `triage_bypass_reason` field (nullable)
- [x] Add `triage_bypassed_by` FK to User (nullable)
- [x] Add `triage_bypassed_at` DateTimeField (nullable)
- [x] Add `consultation_status` field: `WAITING`, `CALLED`, `IN_PROGRESS`, `COMPLETED`
- [x] Add `called_at` DateTimeField (nullable)
- [x] Add `consultation_started_at` DateTimeField (nullable)
- [x] Add model validation: bypass_reason required if status=BYPASSED
- [x] Add model method: `can_enter_consultation()` → bool
- [x] Add signal: Auto-set `triage_status=COMPLETED` when TriageAssessment created

#### 1.3 Migrations
- [x] Create migration for new fields
- [ ] Data migration: Set existing encounters' triage fields appropriately

### Phase 2: Backend API Updates

#### 2.1 Encounter Endpoints
- [x] Update Encounter serializer with new fields
- [x] Add `POST /api/encounters/{id}/bypass_triage/` endpoint
- [x] Add `POST /api/encounters/{id}/call/` endpoint
- [x] Add `POST /api/encounters/{id}/start_consultation/` endpoint
- [x] Add `GET /api/encounters/consultation_queue/` endpoint

#### 2.2 Consultation Queue Endpoint
- [x] Filter by triage eligibility (COMPLETED, BYPASSED, NOT_APPLICABLE)
- [x] Exclude MANDATORY + PENDING
- [x] Sort by priority, then wait time
- [x] Include patient info, triage info, wait time
- [x] Support filtering by triage_status, consultation_status

#### 2.3 Notification System
- [x] Create notification event for "Patient Called"
- [x] Add notification API endpoint
- [x] Frontend notification subscription (polling initially)

### Phase 3: Frontend - Encounters Page

#### 3.1 Consultation Queue Component
- [x] Create `components/encounters/consultation-queue.tsx`
- [x] Create `components/encounters/consultation-queue-item.tsx`
- [x] Fetch from `/api/encounters/consultation-queue/`
- [x] Display with appropriate badges based on triage_status
- [x] Show wait time calculation
- [x] Actions: Call, Start Consultation

#### 3.2 Bypass Triage Dialog
- [x] Create `components/encounters/bypass-triage-dialog.tsx`
- [x] Reason selector (required)
- [x] Confirmation step
- [x] API call to bypass-triage endpoint

#### 3.3 Call Patient Functionality
- [ ] "Call Patient" button
- [ ] Update consultation_status to CALLED
- [ ] Visual indicator for called patients
- [ ] Re-call option

#### 3.4 Start Consultation
- [ ] "Start Consultation" button
- [ ] Navigate to encounter documentation
- [ ] Update consultation_status to IN_PROGRESS
- [ ] Record timestamp

#### 3.5 Page Layout
- [ ] Redesign `app/(dashboard)/encounters/page.tsx`
- [ ] Tab: "Consultation Queue" (default)
- [ ] Tab: "My Active Consultations"
- [ ] Filters: Area, Triage Status, Wait Time
- [ ] Quick stats: Queue count by priority

### Phase 4: Frontend - Triage Page Updates

#### 4.1 Remove Awaiting Consultation
- [ ] Remove "Awaiting Consultation" section from `/triage/`
- [ ] Keep: Waiting Queue (pre-triage patients)
- [ ] Keep: Triage Assessment actions
- [ ] Update page description

#### 4.2 Pre-Triage Queue Logic
- [ ] Only show encounters with `triage_status=PENDING` AND `triage_requirement` in (MANDATORY, OPTIONAL)
- [ ] Sort by arrival time

### Phase 5: Patient Journey Store Integration

#### 5.1 Store Updates
- [ ] Add `triage_status` to patient journey state
- [ ] Add `consultation_status` to patient journey state
- [ ] Update on: triage completed, bypassed, called, consultation started

#### 5.2 Stage Mapping
- [ ] `triage_status=PENDING` → stage: `AWAITING_TRIAGE`
- [ ] `triage_status=IN_PROGRESS` → stage: `IN_TRIAGE`
- [ ] `triage_status=COMPLETED` + `consultation_status=WAITING` → stage: `AWAITING_CONSULTATION`
- [ ] `consultation_status=CALLED` → stage: `AWAITING_CONSULTATION` (sub-state)
- [ ] `consultation_status=IN_PROGRESS` → stage: `IN_CONSULTATION`

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/hmis/apps/encounters/models.py` | Modify | Add triage/consultation fields, choices, methods |
| `backend/hmis/apps/encounters/serializers.py` | Modify | Include new fields, validation |
| `backend/hmis/apps/encounters/views.py` | Modify | Add bypass-triage, call, start-consultation actions |
| `backend/hmis/apps/encounters/filters.py` | Create | Consultation queue filters |
| `backend/hmis/apps/triage/signals.py` | Modify | Auto-set triage_status on assessment create |
| `web-app/components/encounters/consultation-queue.tsx` | Create | Main queue component |
| `web-app/components/encounters/consultation-queue-item.tsx` | Create | Queue item with badges |
| `web-app/components/encounters/active-consultations.tsx` | Create | In-progress list |
| `web-app/components/encounters/bypass-triage-dialog.tsx` | Create | Bypass reason dialog |
| `web-app/app/(dashboard)/encounters/page.tsx` | Modify | New queue-focused layout |
| `web-app/lib/hooks/use-consultation-queue.ts` | Create | Query hook |
| `web-app/lib/api/encounters.ts` | Modify | Add new endpoints |
| `web-app/lib/types/encounters.ts` | Modify | Add new types |
| `web-app/lib/stores/patient-journey.ts` | Modify | Add triage/consultation status |
| `web-app/app/(dashboard)/triage/page.tsx` | Modify | Remove awaiting consultation |

---

## State Machine Summary

```
                    ┌─────────────────────────────────────────────────────┐
                    │              ENCOUNTER TRIAGE STATE                  │
                    └─────────────────────────────────────────────────────┘
                    
MANDATORY/OPTIONAL Encounter:
                    
    ┌─────────┐     ┌─────────────┐     ┌───────────┐
    │ PENDING │────▶│ IN_PROGRESS │────▶│ COMPLETED │
    └─────────┘     └─────────────┘     └───────────┘
         │                                    │
         │ (bypass)                           │
         ▼                                    │
    ┌──────────┐                              │
    │ BYPASSED │──────────────────────────────┤
    └──────────┘                              │
                                              ▼
                    ┌─────────────────────────────────────────────────────┐
                    │           CONSULTATION STATUS                        │
                    └─────────────────────────────────────────────────────┘

    ┌─────────┐     ┌────────┐     ┌─────────────┐     ┌───────────┐
    │ WAITING │────▶│ CALLED │────▶│ IN_PROGRESS │────▶│ COMPLETED │
    └─────────┘     └────────┘     └─────────────┘     └───────────┘
         ▲               │
         └───────────────┘
           (re-call)


NOT_REQUIRED Encounter:
    
    ┌────────────────┐
    │ NOT_APPLICABLE │─────▶ (enters consultation queue directly)
    └────────────────┘
```

---

## Acceptance Criteria

- [ ] Triage requirement auto-determined by encounter type
- [ ] Doctor can see consultation queue on `/encounters/`
- [ ] Queue includes: triaged, bypassed, and direct patients
- [ ] Queue sorted by: emergency flag, triage priority, wait time
- [ ] Bypassed patients show reason badge
- [ ] Direct patients show "Direct" badge
- [ ] Doctor can "Call" a patient from the queue
- [ ] Calling triggers a notification
- [ ] Doctor can "Start Consultation" (navigates to encounter form)
- [ ] MANDATORY triage encounters cannot bypass without explicit reason
- [ ] Triage page shows only pre-triage patients
- [ ] Patient journey store reflects all state changes
- [ ] No duplicate patient lists between pages

---

## Consistency Analysis ✅

| Aspect | Status | Notes |
|--------|--------|-------|
| Encounter types | ✅ Consistent | Extended to support all visit types |
| Triage flow | ✅ Consistent | Clear state machine with valid transitions |
| Queue eligibility | ✅ Consistent | Logic excludes incomplete mandatory triage |
| Bypass flow | ✅ Consistent | Requires reason, tracks who/when |
| Patient journey | ✅ Consistent | Maps to existing store stages |
| Page responsibilities | ✅ Consistent | Clear separation: Registration → Triage → Consultation |
| Badge display | ✅ Consistent | Covers all triage statuses |
| Notification | ✅ Consistent | Triggers on "Call" action |

---

## Future Enhancements ( # TODO: Not in current scope)

- [ ] Waiting room display showing called patients
- [ ] Real-time queue updates via WebSockets
- [ ] Audio announcement integration
- [ ] SMS notification to patient
- [ ] Estimated wait time display
- [ ] Queue analytics dashboard
- [ ] Facility settings UI for queue configuration
- [ ] Triage policy configuration per facility
- [ ] Auto-escalation for long wait times

---

## Dependencies

- Patient Journey Store (✅ Implemented)
- Triage Assessment API (✅ Implemented)
- Triage Queue API (✅ Implemented)
- Encounter Model (✅ Exists, needs extension)
- Notification system (🔄 To be implemented)

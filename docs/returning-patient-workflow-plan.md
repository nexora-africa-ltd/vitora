# Returning Patient Workflow Implementation Plan

> **Purpose**: Define the implementation strategy for a streamlined returning patient check-in flow in the Vitora HMIS web app, aligned with the [Returning Patient Flow Specification](../.tmp/returning-patient.md).

---

## 📋 Current State Analysis

### What Exists

| Component | Status | Location |
|-----------|--------|----------|
| `visit_type` field with `RETURN` option | ✅ Implemented | `backend/hmis/apps/clinics/models.py` |
| Visit type in add-to-queue dialog | ✅ Implemented | `web-app/components/clinics/add-to-queue-dialog.tsx` |
| New vs revisit reporting | ✅ Implemented | `backend/hmis/apps/clinics/services/reporting.py` |
| Patient search by MRN/name/phone | ✅ Implemented | `web-app/app/(dashboard)/patients/page.tsx` |
| Encounter model with basic status | ✅ Implemented | `backend/hmis/apps/encounters/models.py` |

### What's Missing

| Gap | Impact | Priority |
|-----|--------|----------|
| No dedicated check-in page | Front desk staff must navigate multiple pages | High |
| Default visit_type always `NEW` | Manual selection required even for returning patients | High |
| No quick check-in action | Extra clicks to add returning patient to queue | Medium |
| No visit history detection | System doesn't auto-detect returning patients | Medium |
| No clinical pre-encounter snapshot | Clinicians lack context before encounter starts | Medium |
| No encounter state machine | Cannot track encounter lifecycle properly | Medium |
| No encounter linking | Follow-ups not linked to prior encounters | Low |
| No skip-triage logic | All visits go through triage unnecessarily | Low |

---

## 🎯 Proposed Solution

### New Components

#### 1. Patient Check-in Page (`/patients/checkin`)

A dedicated page for front desk / reception staff to quickly check in returning patients.

**Features:**
- MRN/ID barcode scanner input (auto-focus)
- Quick search by MRN, National ID, or phone number
- Patient verification display (photo, name, DOB, last visit)
- **Clinical snapshot preview** (allergies, active conditions, alerts)
- One-click check-in to triage or direct to clinic
- **Smart skip-triage for specific visit types** (refill-only, lab review)
- Auto-detect `visit_type` based on patient history

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────┐
│  Patient Check-in                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 🔍 Scan or enter MRN / ID / Phone              │        │
│  └─────────────────────────────────────────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  👤 Jane Smith                    MRN: MRN-20250101  │    │
│  │  DOB: 1985-05-20 (40y)           Phone: 0712xxxxxx  │    │
│  │  Last Visit: 2025-12-15 - CCC Clinic                │    │
│  │                                                      │    │
│  │  ⚠️ Alerts: Allergy: Penicillin                     │    │
│  │  📋 Active: Hypertension, Type 2 DM                 │    │
│  │  💊 Meds: Metformin 500mg BD, Lisinopril 10mg OD    │    │
│  │                                                      │    │
│  │  Visit Reason: [Follow-up ▾]                        │    │
│  │                                                      │    │
│  │  [Check-in to Triage]  [Direct to Clinic ▾]         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Recent Check-ins Today:                                    │
│  • John Doe - 09:15 - Triage                               │
│  • Mary Jane - 09:02 - CCC Clinic (Refill Only)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 2. Quick Check-in Button on Patient Detail Page

Add a prominent "Check-in" action to `/patients/[id]` page header.

```tsx
<Button onClick={handleQuickCheckin}>
  <UserCheck className="mr-2 h-4 w-4" />
  Check-in Patient
</Button>
```

#### 3. Smart Visit Type & Reason Detection

Auto-set `visit_type` and suggest `visit_reason` based on patient's visit history:

```typescript
type VisitType = 'NEW' | 'RETURN' | 'FOLLOW_UP';

type VisitReason =
  | 'NEW_COMPLAINT'
  | 'FOLLOW_UP'           // Linked to prior encounter
  | 'CHRONIC_CARE'        // Ongoing condition management
  | 'PROCEDURE_REVIEW'    // Post-procedure check
  | 'REFILL_ONLY'         // Medication refill (skip triage)
  | 'LAB_REVIEW'          // Review pending results (skip triage)
  | 'REFERRAL_VISIT';     // From another facility

function determineVisitContext(patient: Patient): {
  visitType: VisitType;
  suggestedReason: VisitReason;
  skipTriage: boolean;
} {
  const hasRecentVisits = patient.last_encounter_date !== null;
  const lastVisitDays = hasRecentVisits
    ? daysSince(patient.last_encounter_date)
    : Infinity;
  const hasChronicConditions = patient.clinical_snapshot.active_conditions.length > 0;
  const hasPendingResults = patient.clinical_snapshot.pending_results.length > 0;

  if (!hasRecentVisits) {
    return { visitType: 'NEW', suggestedReason: 'NEW_COMPLAINT', skipTriage: false };
  }

  if (hasPendingResults) {
    return { visitType: 'RETURN', suggestedReason: 'LAB_REVIEW', skipTriage: true };
  }

  if (lastVisitDays <= 30) {
    return {
      visitType: 'FOLLOW_UP',
      suggestedReason: hasChronicConditions ? 'CHRONIC_CARE' : 'FOLLOW_UP',
      skipTriage: false
    };
  }

  return {
    visitType: 'RETURN',
    suggestedReason: hasChronicConditions ? 'CHRONIC_CARE' : 'NEW_COMPLAINT',
    skipTriage: false
  };
}
```

#### 4. Encounter State Machine

Implement proper encounter lifecycle tracking:

```typescript
type EncounterStatus =
  | 'CREATED'         // Encounter record created
  | 'CHECKED_IN'      // Patient arrived, identity confirmed
  | 'TRIAGED'         // Vitals taken (optional)
  | 'IN_PROGRESS'     // Clinician actively seeing patient
  | 'ON_HOLD'         // Awaiting info / interruption
  | 'ORDERS_PLACED'   // Lab/imaging/pharmacy orders created
  | 'RESULTS_PENDING' // Awaiting external results
  | 'READY_TO_CLOSE'  // All items complete, pending sign-off
  | 'CLOSED'          // Clinician signed off (immutable)
  | 'CANCELLED';      // Visit aborted

// State transition rules
const VALID_TRANSITIONS: Record<EncounterStatus, EncounterStatus[]> = {
  CREATED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['TRIAGED', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'ORDERS_PLACED', 'READY_TO_CLOSE', 'CANCELLED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  ORDERS_PLACED: ['RESULTS_PENDING', 'READY_TO_CLOSE'],
  RESULTS_PENDING: ['READY_TO_CLOSE'],
  READY_TO_CLOSE: ['CLOSED'],
  CLOSED: [], // Immutable
  CANCELLED: [], // Terminal
};
```

---

## 📁 File Structure

```
web-app/
├── app/(dashboard)/patients/
│   └── checkin/
│       ├── page.tsx              # Check-in page
│       └── loading.tsx           # Loading state
├── components/patients/
│   ├── patient-checkin-form.tsx  # Search & verify form
│   ├── patient-checkin-card.tsx  # Patient display card with clinical snapshot
│   ├── clinical-snapshot.tsx     # Read-only clinical summary component
│   ├── quick-checkin-dialog.tsx  # Dialog for patient detail page
│   └── recent-checkins-list.tsx  # Today's check-ins
└── lib/
    ├── api/
    │   └── checkin.ts            # Check-in API functions
    ├── hooks/
    │   └── use-checkin.ts        # Check-in React Query hooks
    └── utils/
        └── visit-context.ts      # determineVisitContext() utility

backend/
├── hmis/apps/patients/
│   └── views/
│       └── lookup.py             # PatientLookupView
├── hmis/apps/encounters/
│   ├── models.py                 # Add status state machine
│   └── services/
│       └── state_machine.py      # Encounter state transitions
└── hmis/apps/checkin/            # New app for check-in functionality
    ├── models.py                 # CheckIn model (daily tracking)
    ├── serializers.py
    ├── views.py                  # CheckinView, TodayCheckinsView
    └── urls.py
```

---

## 🔌 API Requirements

### Backend Endpoints Needed

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/lookup/` | GET | Quick lookup by MRN, ID, or phone with clinical snapshot |
| `/api/patients/{id}/checkin/` | POST | Check-in patient to triage/clinic |
| `/api/checkins/today/` | GET | List today's check-ins |
| `/api/encounters/{id}/transition/` | POST | Transition encounter state |

### Lookup Response Schema (Enhanced with Clinical Snapshot)

```python
# GET /api/patients/lookup/?q=MRN-20250101
{
  "id": 123,
  "mrn": "MRN-20250101-0001",
  "first_name": "Jane",
  "last_name": "Smith",
  "date_of_birth": "1985-05-20",
  "gender": "F",
  "phone_number": "0712******",  # Masked for privacy
  "photo_url": null,

  # Last visit info
  "last_visit": {
    "id": 456,
    "date": "2025-12-15",
    "clinic": "CCC Clinic",
    "encounter_type": "OPD"
  },

  # Smart suggestions
  "suggested_visit_type": "FOLLOW_UP",
  "suggested_visit_reason": "CHRONIC_CARE",
  "skip_triage_recommended": false,

  # Clinical snapshot (read-only pre-encounter context)
  "clinical_snapshot": {
    "active_conditions": [
      {"code": "I10", "name": "Hypertension", "onset": "2024-03-15"},
      {"code": "E11", "name": "Type 2 Diabetes", "onset": "2023-08-20"}
    ],
    "allergies": [
      {"substance": "Penicillin", "severity": "HIGH", "reaction": "Anaphylaxis"}
    ],
    "current_medications": [
      {"name": "Metformin", "dose": "500mg", "frequency": "BD", "prescriber": "Dr. Ochieng"},
      {"name": "Lisinopril", "dose": "10mg", "frequency": "OD", "prescriber": "Dr. Ochieng"}
    ],
    "last_vitals": {
      "date": "2025-12-15",
      "bp": "130/85",
      "pulse": 78,
      "spo2": 98,
      "temperature": 36.8
    },
    "pending_results": [
      {"type": "LAB", "name": "HbA1c", "ordered_date": "2025-12-15"}
    ],
    "open_referrals": []
  },

  # Enrollments and alerts
  "active_enrollments": ["CCC", "TB"],
  "alerts": [
    {"type": "ALLERGY", "message": "Penicillin - Anaphylaxis risk", "severity": "HIGH"},
    {"type": "CHRONIC", "message": "DM: Last HbA1c pending", "severity": "INFO"}
  ],

  # Financial status
  "has_unpaid_balance": false,
  "insurance_status": "ACTIVE"  # ACTIVE, EXPIRED, NONE
}
```

### Check-in Request Schema (Enhanced)

```python
# POST /api/patients/{id}/checkin/
{
  "destination": "TRIAGE",           # "TRIAGE" or clinic_id (int)
  "visit_type": "FOLLOW_UP",         # NEW, RETURN, FOLLOW_UP
  "visit_reason": "CHRONIC_CARE",    # Detailed reason
  "linked_encounter_id": 456,        # Optional: link to prior encounter
  "skip_triage": false,              # Override triage requirement
  "priority": "STANDARD",            # EMERGENCY, URGENT, STANDARD
  "notes": "Monthly DM/HTN review"
}

# Response
{
  "checkin_id": 789,
  "encounter_id": 1001,
  "encounter_status": "CHECKED_IN",
  "queue_position": 3,
  "estimated_wait_minutes": 15
}
```

### Encounter State Transition

```python
# POST /api/encounters/{id}/transition/
{
  "to_status": "IN_PROGRESS",
  "reason": "Triage complete"  # Optional audit note
}

# Response
{
  "id": 1001,
  "status": "IN_PROGRESS",
  "previous_status": "TRIAGED",
  "transitioned_at": "2026-02-07T09:30:00Z",
  "transitioned_by": "nurse_mary"
}
```

---

## 🔄 Implementation Phases

### Sprint 1: Core Check-in Flow (5-8 days) ✅ COMPLETED

#### Phase 1A: Backend API - Basic (1-2 days) ✅

- [x] Add `PatientLookupView` with quick search
- [x] Add `PatientCheckinView` action
- [x] Add `TodayCheckinsView` for front desk display
- [x] Add clinical snapshot to patient lookup response
- [x] Write tests for new endpoints (80% coverage) - 39 tests passing

#### Phase 1B: Check-in Page (2-3 days) ✅

- [x] Create `/patients/checkin` page layout
- [x] Implement patient search form with barcode support
- [x] Create patient verification card with clinical snapshot
- [x] Add check-in action handlers
- [x] Integrate with triage waiting queue

#### Phase 1C: Quick Check-in Dialog (1 day) ✅

- [x] Add check-in button to patient detail page header
- [x] Create `QuickCheckinDialog` component
- [x] Wire up to existing clinic queue / triage

#### Phase 1D: Smart Defaults & Testing (1-2 days) ✅

- [x] Implement `determineVisitContext()` utility (in backend services)
- [x] Visit reason detection with skip-triage for LAB_REVIEW and REFILL_ONLY
- [x] Add to navigation for Reception role
- [x] E2E tests for check-in flow (43 tests passing)

---

### Sprint 2: Advanced Features (3-5 days) ✅ COMPLETED

#### Phase 2A: Encounter State Machine (1-2 days) ✅

- [x] Add `status` field with choices to Encounter model
- [x] Create `EncounterStateMachine` service with transition validation
- [x] Add `/api/encounters/{id}/transition/` endpoint
- [x] Add state history audit table (`encounter_states`)
- [x] Update encounter list views to show current status

#### Phase 2B: Encounter Linking (1 day) ✅

- [x] Add `linked_encounter_id` FK to Encounter model
- [x] Update check-in to auto-suggest linkable encounters
- [x] Display encounter timeline with linked visits
- [x] Add "Related Visits" section to encounter detail

#### Phase 2C: Skip-Triage Logic (0.5 days) ✅

- [x] Add `require_triage` field to visit reason config
- [x] Implement skip-triage routing in check-in
- [x] Update UI to show triage-skip badge

#### Phase 2D: Visit Reason Taxonomy (0.5 days) ✅

- [x] Create `VisitReason` model/choices
- [x] Add `visit_reason` field to Encounter
- [x] Update check-in form with reason dropdown
- [x] Add reason to reporting filters

---

## 🧭 Navigation Integration

Add check-in to sidebar navigation:

```typescript
// lib/config/navigation.ts
{
  title: 'Check-in',
  href: '/patients/checkin',
  icon: UserCheck,
  roles: ['RECEPTIONIST', 'NURSE', 'ADMIN'],
  description: 'Check in returning patients',
}
```

---

## 💡 UX Considerations

### Barcode Scanner Support

```tsx
// Auto-focus input for barcode scanner
useEffect(() => {
  searchInputRef.current?.focus();
}, []);

// Handle rapid barcode input (scanner sends Enter key)
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    handleSearch();
  }
};
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Enter` | Search / Confirm check-in |
| `T` | Check-in to Triage |
| `C` | Check-in to Clinic (skip triage) |
| `Esc` | Clear search |

### Error States

- Patient not found → Prompt to register new patient
- Patient already checked in today → Show warning, allow re-check-in
- Patient has unpaid balance → Show alert, allow override
- Insurance expired → Show warning with SHA eligibility check option

### Clinical Snapshot Display Rules

- **Reception staff**: See alerts and basic info only
- **Nurses/Clinicians**: See full clinical snapshot
- **Allergies**: Always prominently displayed with severity badge
- **Pending results**: Highlight if relevant to visit reason

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Check-in time (returning patient) | < 30 seconds |
| Manual visit_type corrections | < 5% of check-ins |
| Encounter state accuracy | 100% valid transitions |
| Front desk satisfaction | Positive feedback |
| Triage skip compliance | 100% for eligible visit types |

---

## 🗄️ Database Schema Changes

### New/Modified Tables

```sql
-- Encounters table (modified)
ALTER TABLE encounters ADD COLUMN status VARCHAR(20) DEFAULT 'CREATED';
ALTER TABLE encounters ADD COLUMN linked_encounter_id BIGINT REFERENCES encounters(id);
ALTER TABLE encounters ADD COLUMN visit_reason VARCHAR(30);

-- Encounter state history (new, for audit)
CREATE TABLE encounter_states (
    id BIGSERIAL PRIMARY KEY,
    encounter_id BIGINT NOT NULL REFERENCES encounters(id),
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_at TIMESTAMP DEFAULT NOW(),
    changed_by BIGINT REFERENCES auth_user(id),
    reason TEXT
);

-- Daily check-ins (new)
CREATE TABLE checkins (
    id BIGSERIAL PRIMARY KEY,
    patient_id BIGINT NOT NULL REFERENCES patients(id),
    encounter_id BIGINT NOT NULL REFERENCES encounters(id),
    checked_in_at TIMESTAMP DEFAULT NOW(),
    checked_in_by BIGINT REFERENCES auth_user(id),
    destination VARCHAR(20) NOT NULL,  -- TRIAGE or clinic name
    visit_type VARCHAR(20) NOT NULL,
    visit_reason VARCHAR(30),
    skip_triage BOOLEAN DEFAULT FALSE,
    identity_method VARCHAR(20)  -- MRN, NATIONAL_ID, PHONE, BIOMETRIC
);
CREATE INDEX idx_checkins_date ON checkins(DATE(checked_in_at));
```

### FHIR Mapping Reference

| HMIS Concept | FHIR Resource |
|--------------|---------------|
| Check-in | `Encounter.status=arrived` |
| Encounter status | `Encounter.status` (mapped) |
| Linked encounter | `Encounter.partOf` |
| Clinical snapshot | `Composition` (read-only bundle) |
| Visit reason | `Encounter.reasonCode` |

---

## 🔗 Related Documents

- [Returning Patient Flow Specification](../.tmp/returning-patient.md) - Full clinical/regulatory requirements
- [Ideal Patient Flow](ideal-patient-flow.md)
- [Clinics Module Implementation Plan](clinics-module-implementation-plan.md)
- [Triage Module Documentation](../backend/hmis/apps/triage/README.md)

---

**Last Updated**: February 7, 2026
**Status**: Sprint 1 Complete, Sprint 2 Pending
**Priority**: High
**Estimated Effort**: Sprint 1: 5-8 days ✅ | Sprint 2: 3-5 days (Total: 8-13 days)

# Emergency Module Implementation Plan

> **Purpose**: Plan for implementing a dedicated Emergency Department module in Vitora HMIS
> **Created**: February 20, 2026
> **Updated**: March 4, 2026
> **Status**: Phase 4 Complete ✅

---

## Executive Summary

The current triage system handles emergency patients as filtered items in the unified triage queue. This plan proposes a dedicated Emergency Module with ER-specific workflows, real-time dashboards, and critical patient visibility.

---

## Current State Analysis

### What's Working ✅

| Feature | Status | Location |
|---------|--------|----------|
| KETA 5-level triage | ✅ Complete | `/triage/assess/` |
| Emergency area selection | ✅ 7 ER zones | `assigned_area` field |
| Vitals with KETA thresholds | ✅ Complete | Triage assessment |
| Unified queue with area filter | ✅ Complete | `/triage` |
| Referral tracking | ✅ Just added | `referring_facility_name` field |
| Clinic routing alternative | ✅ Complete | `assigned_clinic` field |

### Emergency Areas Defined

```typescript
EMERGENCY_AREA_OPTIONS = [
  { value: 'ER_RESUS', label: 'ER - Resuscitation (RED)', category: 'RED' },
  { value: 'ER_ACUTE', label: 'ER - Acute Care (ORANGE)', category: 'ORANGE' },
  { value: 'TRAUMA', label: 'Trauma Bay (RED)', category: 'RED' },
  { value: 'ER_FAST_TRACK', label: 'ER - Fast Track (GREEN/BLUE)', category: 'GREEN' },
  { value: 'OBSERVATION', label: 'Observation Unit', category: 'YELLOW' },
  { value: 'PEDIATRIC_ER', label: 'Pediatric ER', category: 'ORANGE' },
  { value: 'MATERNITY', label: 'Maternity/Labor', category: 'ORANGE' },
]
```

### What's Missing ❌

| Gap | Impact | Priority | Status |
|-----|--------|----------|--------|
| No dedicated ER dashboard | Staff must navigate to triage and filter | HIGH | ✅ **Done** |
| No zone-specific views | Cannot focus on single ER zone | MEDIUM | ✅ **Done** |
| No critical alert banner | RED patients not immediately visible | HIGH | ✅ **Done** |
| No ER bed board | No visual bed/bay status | MEDIUM | ✅ **Done** |
| No door-to-doctor metrics | Cannot measure ER efficiency | LOW | 📋 Planned |
| No EMS handoff workflow | No ambulance pre-arrival alerts | LOW | 📋 Future |
| No auto-escalation | No alerts when wait times breached | MEDIUM | ✅ **Done** |

---

## Proposed Architecture

### URL Structure

```
/emergency                          # ER Dashboard (landing page)
/emergency/resus                    # Resuscitation zone view
/emergency/acute                    # Acute care zone view
/emergency/trauma                   # Trauma bay view
/emergency/fast-track               # Fast track / minor injuries
/emergency/observation              # Observation unit
/emergency/pediatric                # Pediatric ER
/emergency/maternity                # Maternity emergencies
/emergency/bed-board                # Visual bed status grid
/emergency/metrics                  # ER performance metrics
```

### Component Hierarchy

```
app/(dashboard)/emergency/
├── page.tsx                        # ER Dashboard
├── layout.tsx                      # ER-specific layout with zone tabs
├── [zone]/
│   └── page.tsx                    # Zone-specific queue view
├── bed-board/
│   └── page.tsx                    # Visual bed status
└── metrics/
    └── page.tsx                    # Performance dashboard
```

---

## Implementation Phases

### Phase 1: ER Dashboard & Critical Alerts (HIGH PRIORITY) ✅ COMPLETE

**Estimated Effort**: 2-3 days | **Actual**: 1 day

#### 1.1 ER Dashboard Landing Page ✅

**Route**: `/emergency`

**Implementation**: `app/(dashboard)/emergency/page.tsx`

**Features**:
- [x] Zone summary cards with patient counts by category
- [x] Critical patient ticker (RED patients with wait time)
- [x] Quick navigation to zone views
- [x] Real-time updates via WebSocket with polling fallback
- [x] Live status indicator (shows "Live" when WebSocket connected)
- [x] Pull-to-refresh on mobile

**Wireframe**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🚨 EMERGENCY DEPARTMENT                              [🔄 Live] [⚙️]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ⚠️ CRITICAL ALERT: 2 RED patients waiting                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ John Doe (MRN-001) - Chest Pain - RESUS - Waiting 3 min [VIEW]  │  │
│  │ Jane Wanjiku (MRN-002) - Trauma - TRAUMA - Waiting 1 min [VIEW] │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ RESUS       │ │ ACUTE       │ │ TRAUMA      │ │ FAST TRACK  │       │
│  │ 🔴 2 pts    │ │ 🟠 5 pts    │ │ 🔴 1 pt     │ │ 🟢 8 pts    │       │
│  │ Cap: 4      │ │ Cap: 10     │ │ Cap: 2      │ │ Cap: 12     │       │
│  │ [Enter →]   │ │ [Enter →]   │ │ [Enter →]   │ │ [Enter →]   │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                       │
│  │ OBSERVATION │ │ PEDIATRIC   │ │ MATERNITY   │                       │
│  │ 🟡 3 pts    │ │ 🟠 2 pts    │ │ 🟠 1 pt     │                       │
│  │ Cap: 8      │ │ Cap: 6      │ │ Cap: 4      │                       │
│  │ [Enter →]   │ │ [Enter →]   │ │ [Enter →]   │                       │
│  └─────────────┘ └─────────────┘ └─────────────┘                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 1.2 Critical Alert Banner (Global Component) ✅

**Location**: `components/emergency/critical-alert-banner.tsx`

**Features**:
- [x] Shows when any RED patient is in ER queue
- [x] Displays on ER dashboard (sticky top)
- [x] Links directly to patient in triage queue
- [x] Visual pulsing alert animation (CSS `animate-pulse-slow`)
- [x] Auto-dismiss when no RED patients
- [ ] Audio alert (configurable) - *deferred to Phase 4*

**API Endpoint** (implemented):
```
GET /api/triage/queue/critical/
Response: {
  count: 2,
  patients: [
    { id: 1, patient_name: "John Doe", mrn: "MRN-001",
      chief_complaint: "Chest Pain", assigned_area: "ER_RESUS",
      assigned_area_display: "ER - Resuscitation",
      wait_minutes: 3, arrival_time: "2026-02-21T10:00:00Z",
      status: "WAITING" },
    ...
  ]
}
```

**WebSocket Endpoint** (implemented):
```
ws://localhost/ws/emergency/queue/

// Sends state_update events every 5 seconds with:
{
  type: "state_update",
  data: {
    critical: { count: 2, patients: [...] },
    zones: { zones: [...], total_patients: 15 },
    timestamp: "2026-02-21T10:00:05Z"
  }
}
```

#### 1.3 Sidebar Navigation Update ✅

**Implementation**: `lib/config/navigation.ts`

Added to sidebar:
```tsx
{ label: 'Emergency', href: '/emergency', icon: Siren },
```

*Note: Dynamic badge count deferred - requires global WebSocket context.*

---

### Phase 2: Zone-Specific Views (MEDIUM PRIORITY) ✅ COMPLETE

**Estimated Effort**: 2 days | **Actual**: 1 day

#### 2.1 Zone Queue Page ✅

**Route**: `/emergency/[zone]`

**Implementation**: `app/(dashboard)/emergency/[zone]/page.tsx`

**Features**:
- [x] Filtered queue for single zone only (uses `useTriageQueue({ area })` filter)
- [x] Zone-specific header with capacity info and category breakdown
- [x] Same actions as triage queue (call, mark with clinician, complete, LWBS)
- [x] Zone-specific KETA target wait times reference card
- [x] Search by patient name/MRN and filter by category/status
- [x] List/grid view toggle (leverages `ViewToggle` + `EntityCard`)
- [x] LWBS confirmation dialog with reason input
- [x] Pull-to-refresh on mobile
- [x] Empty states for no patients and no filter matches

**Zone Mapping** (implemented in `lib/config/emergency.ts`):
```typescript
export const ROUTE_TO_ZONE: Record<string, AssignedArea> = {
  'resus': 'ER_RESUS',
  'acute': 'ER_ACUTE',
  'trauma': 'TRAUMA',
  'fast-track': 'ER_FAST_TRACK',
  'observation': 'OBSERVATION',
  'pediatric': 'PEDIATRIC_ER',
  'maternity': 'MATERNITY',
};
```

#### 2.2 Zone Layout with Tabs ✅

**File**: `app/(dashboard)/emergency/layout.tsx`

**Features**:
- [x] Horizontal tabs for quick zone switching
- [x] Badge counts per zone (from WebSocket or polling fallback)
- [x] Highlight current zone with primary background
- [x] Mobile: horizontal scroll with short labels (e.g., "Resus", "Peds")
- [x] Overview tab linking back to dashboard with total patient count
- [x] Tabs only visible when on a zone sub-page (not on dashboard itself)

---

### Phase 3: ER Bed Board (MEDIUM PRIORITY) ✅ COMPLETE

**Estimated Effort**: 3 days | **Actual**: 1 day

#### 3.1 Visual Bed Grid ✅

**Route**: `/emergency/bed-board`

**Features**:
- [x] Visual grid of all ER bays/beds organized by zone
- [x] Color-coded by status (available, occupied, cleaning, out of service)
- [x] Patient info on hover (tooltip) and click (detail dialog)
- [x] Bed board summary panel on ER dashboard overview with per-zone occupancy bars
- [ ] Drag-and-drop patient assignment (stretch — deferred)

**Backend** (`ERBed` model in `hmis/apps/triage/models.py`):
- [x] New model: `ERBed` (separate from inpatient `Bed` — different workflow, zone-based)
- [x] Fields: `zone`, `bed_number`, `status`, `current_patient`, `current_triage_assessment`, `notes`, `status_changed_at/by`
- [x] State-transition methods: `assign_patient()`, `release()`, `mark_available()`, `mark_out_of_service()`
- [x] Computed properties: `is_available`, `patient_name`, `patient_mrn`, `triage_category`, `occupied_duration_minutes`
- [x] Admin with colored status badges
- [x] 34 tests (15 model + 19 API) — all passing

**API Endpoints** (registered under `/api/triage/er-beds/`):
- `GET  /api/triage/er-beds/` — List beds (paginated, filterable by zone/status)
- `POST /api/triage/er-beds/` — Create bed
- `GET  /api/triage/er-beds/{id}/` — Bed detail
- `POST /api/triage/er-beds/{id}/assign/` — Assign patient to bed
- `POST /api/triage/er-beds/{id}/release/` — Release patient (→ CLEANING or AVAILABLE)
- `POST /api/triage/er-beds/{id}/update-status/` — Mark available or out of service
- `GET  /api/triage/er-beds/summary/` — Per-zone occupancy stats
- `GET  /api/triage/er-beds/board/` — Beds grouped by zone for grid display

**Frontend**:
- [x] Types & Zod schemas in `lib/types/triage.ts` and `lib/schemas/triage.schema.ts`
- [x] API client methods with `parseResponse()` in `lib/api/triage.ts`
- [x] React Query hooks: `useERBedBoard()`, `useERBedSummary()`, `useERBedActions()`
- [x] Full bed board page at `/emergency/bed-board` with zone sections, bed cells, detail dialog
- [x] Bed board summary panel on ER dashboard overview with mini occupancy bars
- [x] Tab in emergency layout for quick navigation

**Wireframe**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🛏️ ER BED BOARD                                     [🔄 Live] [Legend]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  RESUSCITATION (2/4 occupied)                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │ R-01    │ │ R-02    │ │ R-03    │ │ R-04    │                       │
│  │ 🔴 John │ │ 🔴 Jane │ │ ⬜ FREE │ │ ⬜ FREE │                       │
│  │ 3 min   │ │ 1 min   │ │         │ │         │                       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                       │
│                                                                         │
│  ACUTE CARE (5/10 occupied)                                            │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ...          │
│  │ A-01│ │ A-02│ │ A-03│ │ A-04│ │ A-05│ │ A-06│ │ A-07│              │
│  │  🟠  │ │  🟠  │ │  🟠  │ │  🟠  │ │  🟠  │ │  ⬜  │ │ ⬜  │              │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 4: Auto-Escalation & Alerts (MEDIUM PRIORITY) ✅ COMPLETE

**Estimated Effort**: 2 days | **Actual**: 1 day

#### 4.1 Wait Time Breach Alerts ✅

**Backend** (`WaitTimeBreach` model in `hmis/apps/triage/models.py`):
- [x] Celery task `check_wait_time_breaches` scans queue every minute
- [x] Generates breach alert when wait time exceeds KETA target:
  - RED: > 0 min (severity: CRITICAL)
  - ORANGE: > 10 min (severity: URGENT)
  - YELLOW: > 60 min (severity: WARNING)
  - GREEN: > 120 min, BLUE: > 240 min (severity: INFO)
- [x] Severity levels: CRITICAL, URGENT, WARNING, INFO
- [x] Status workflow: ACTIVE → ACKNOWLEDGED → ESCALATED → RESOLVED
- [x] Auto-resolve task `auto_resolve_breaches` clears breaches for completed/LWBS patients
- [x] No duplicate breaches for the same patient

**API Endpoints** (registered under `/api/triage/breaches/`):
- `GET  /api/triage/breaches/` — List breaches (paginated, filterable by severity/status/active_only)
- `POST /api/triage/breaches/{id}/acknowledge/` — Acknowledge a breach with optional notes
- `POST /api/triage/breaches/{id}/resolve/` — Resolve a breach
- `GET  /api/triage/breaches/summary/` — Breach counts by severity

**Frontend**:
- [x] `WaitTimeBreachBanner` component on ER dashboard showing active breaches
- [x] Severity-coded items with acknowledge action
- [x] WebSocket push via `EmergencyAlertsProvider` for real-time breach notifications
- [x] Toast notifications with severity-appropriate styling
- [x] Audio alerts via Web Audio API (configurable via localStorage toggle)
  - CRITICAL: 3 rapid high beeps (880 Hz)
  - URGENT: 2 medium beeps (660 Hz)
  - WARNING: 1 low beep (440 Hz)
  - INFO: no sound
- [x] Zod schemas with `parseResponse()` validation

#### 4.2 Escalation Actions ✅

**Backend** (`Escalation` model in `hmis/apps/triage/models.py`):
- [x] Escalation types: CHARGE_NURSE, ADDITIONAL_STAFF, SUPERVISOR
- [x] Status workflow: PENDING → IN_PROGRESS → RESOLVED / DISMISSED
- [x] State-transition methods: `mark_in_progress()`, `resolve()`, `dismiss()`
- [x] Audit log entry on escalation creation

**API Endpoints** (registered under `/api/triage/escalations/`):
- `GET  /api/triage/escalations/` — List escalations (filterable by active_only/type)
- `POST /api/triage/queue/{id}/escalate/` — Escalate a queue entry
- `POST /api/triage/escalations/{id}/mark_in_progress/` — Mark escalation in progress
- `POST /api/triage/escalations/{id}/resolve_escalation/` — Resolve with notes
- `POST /api/triage/escalations/{id}/dismiss/` — Dismiss with reason

**Frontend**:
- [x] Self-contained `EscalationDialog` component with card-based type selection
- [x] Escalate button on every patient card in zone queue (list & grid views)
- [x] Internal mutation + toast notifications (parent just provides queueEntryId + onSuccess)
- [x] WebSocket event handling for `escalation_created` events

---

### Phase 5: ER Metrics Dashboard (LOW PRIORITY)

**Estimated Effort**: 2 days

**Route**: `/emergency/metrics`

**Metrics to Track**:
- [ ] Door-to-triage time (arrival → triage complete)
- [ ] Door-to-doctor time (arrival → first physician contact)
- [ ] Average wait time by category
- [ ] LWBS (Left Without Being Seen) rate
- [ ] Patient volume by hour/day
- [ ] Zone utilization rates

**Visualizations**:
- [ ] Line chart: hourly patient volume
- [ ] Bar chart: avg wait time by category
- [ ] Gauge: current occupancy vs capacity
- [ ] Table: LWBS reasons breakdown

---

### Phase 6: EMS Handoff (LOW PRIORITY - Future)

**Estimated Effort**: 3-4 days

**Features**:
- [ ] Pre-arrival notification (ambulance en route)
- [ ] Structured handoff form (MIST/SBAR format)
- [ ] Ambulance service integration (Kenya 999/112)
- [ ] Handoff acknowledgment workflow

---

## API Endpoints (New/Modified)

### New Endpoints

| Method | Endpoint | Purpose | Status |
|--------|----------|---------|--------|
| GET | `/api/triage/queue/critical/` | Get RED patients in ER zones | ✅ Done |
| GET | `/api/triage/queue/zones-summary/` | Zone counts and capacity | ✅ Done |
| WS | `ws://host/ws/emergency/queue/` | Real-time ER updates | ✅ Done |
| GET | `/api/triage/queue/by-zone/` | Get queue grouped by zone | 📋 Planned |
| GET | `/api/triage/er-beds/` | ER bed list (paginated, filterable) | ✅ Done |
| GET | `/api/triage/er-beds/board/` | Beds grouped by zone for grid | ✅ Done |
| GET | `/api/triage/er-beds/summary/` | Per-zone occupancy stats | ✅ Done |
| POST | `/api/triage/er-beds/{id}/assign/` | Assign patient to bed | ✅ Done |
| POST | `/api/triage/er-beds/{id}/release/` | Release patient from bed | ✅ Done |
| POST | `/api/triage/er-beds/{id}/update-status/` | Mark available/OOS | ✅ Done |
| POST | `/api/triage/queue/{id}/escalate/` | Escalate queue entry | ✅ Done |
| GET | `/api/triage/breaches/` | Wait time breaches (paginated) | ✅ Done |
| POST | `/api/triage/breaches/{id}/acknowledge/` | Acknowledge breach | ✅ Done |
| GET | `/api/triage/breaches/summary/` | Breach counts by severity | ✅ Done |
| GET | `/api/triage/escalations/` | Escalation records (filterable) | ✅ Done |
| POST | `/api/triage/escalations/{id}/resolve_escalation/` | Resolve escalation | ✅ Done |
| GET | `/api/triage/metrics/` | ER performance metrics | 📋 Phase 5 |

### Example: Zone Summary Response

```json
GET /api/triage/zones/summary/

{
  "zones": [
    {
      "code": "ER_RESUS",
      "label": "ER - Resuscitation",
      "patient_count": 2,
      "capacity": 4,
      "by_category": { "RED": 2, "ORANGE": 0, "YELLOW": 0, "GREEN": 0, "BLUE": 0 },
      "oldest_wait_minutes": 3,
      "has_breached": true
    },
    {
      "code": "ER_ACUTE",
      "label": "ER - Acute Care",
      "patient_count": 5,
      "capacity": 10,
      "by_category": { "RED": 0, "ORANGE": 4, "YELLOW": 1, "GREEN": 0, "BLUE": 0 },
      "oldest_wait_minutes": 8,
      "has_breached": false
    }
  ],
  "total_patients": 22,
  "critical_count": 3
}
```

---

## Database Changes

### Option A: Zone Capacity Configuration

Add to existing `TriageSettings` or new `ERZoneConfig` model:

```python
class ERZoneConfig(models.Model):
    zone_code = models.CharField(max_length=20, unique=True)  # e.g., "ER_RESUS"
    display_name = models.CharField(max_length=100)
    capacity = models.PositiveIntegerField(default=10)
    target_wait_red = models.PositiveIntegerField(default=0)  # minutes
    target_wait_orange = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "ER Zone Configuration"
```

### Option B: ER Beds (for Bed Board) ✅ IMPLEMENTED

See `hmis/apps/triage/models.py` — `ERBed` model with 7 zone choices, 4 status states,
state-transition methods, and computed properties. Migration: `triage/0009_add_er_bed_model.py`.

---

## Testing Requirements

### Unit Tests

- [x] Zone summary endpoint returns correct counts (`TestEmergencyModuleEndpoints`)
- [x] Critical patients endpoint filters RED only (`TestEmergencyModuleEndpoints`)
- [x] Critical patients endpoint requires authentication
- [x] Zones summary includes all 7 ER zones
- [x] ERBed model state transitions (assign, release, mark_available, mark_out_of_service) (`TestERBedModel`)
- [x] ERBed API CRUD and custom actions (assign, release, update-status, summary, board) (`TestERBedAPI`)
- [x] ERBed unique constraint on zone + bed_number
- [x] ERBed computed properties (patient_name, patient_mrn, triage_category, occupied_duration)
- [x] Escalation creates audit log entry (`TestEscalationAPI::test_escalate_creates_audit_log`)
- [x] Wait time breach detection logic (`TestWaitTimeBreachTask` — 5 tests)
- [x] Wait time breach model CRUD and workflow (`TestWaitTimeBreachModel` — 5 tests)
- [x] Escalation model state transitions (`TestEscalationModel` — 4 tests)
- [x] Auto-resolve breaches for completed/LWBS patients (`TestAutoResolveBreaches` — 3 tests)
- [x] Breach API endpoints and filtering (`TestWaitTimeBreachAPI` — 7 tests)
- [x] Escalation API endpoints and actions (`TestEscalationAPI` — 9 tests)

### E2E Tests (Playwright)

- [ ] Navigate to `/emergency` dashboard
- [ ] Click zone card → navigate to zone queue
- [ ] Critical alert banner appears for RED patients
- [ ] Complete patient from zone view

### Feature Files (Gherkin)

```gherkin
# features/emergency/emergency-dashboard.feature

Feature: Emergency Department Dashboard
  As an ER nurse
  I want to see all ER zones at a glance
  So I can quickly identify critical situations

  @smoke
  Scenario: View ER dashboard with zone summary
    Given I am logged in as an ER nurse
    And there are 2 patients in ER_RESUS with category RED
    And there are 5 patients in ER_ACUTE with category ORANGE
    When I navigate to "/emergency"
    Then I should see the RESUS zone card showing "2 pts"
    And I should see the ACUTE zone card showing "5 pts"
    And I should see a critical alert banner with "2 RED patients"

  @critical
  Scenario: Critical alert links to patient
    Given there is a RED patient "John Doe" in ER_RESUS
    When I click on the critical alert for "John Doe"
    Then I should be navigated to the patient's queue entry
```

---

## Implementation Order

| Order | Phase | Priority | Effort | Dependencies | Status |
|-------|-------|----------|--------|--------------|--------|
| 1 | ER Dashboard Landing | HIGH | 2 days | None | ✅ Complete |
| 2 | Critical Alert Banner | HIGH | 1 day | Zone summary endpoint | ✅ Complete |
| 3 | Sidebar Navigation | HIGH | 0.5 days | None | ✅ Complete |
| 4 | Zone-Specific Views | MEDIUM | 2 days | Phase 1 | 📋 Next |
| 5 | Zone Tabs Layout | MEDIUM | 0.5 days | Phase 4 | 📋 Planned |
| 6 | Auto-Escalation | MEDIUM | 2 days | Celery setup | ✅ Complete |
| 7 | ER Bed Board | MEDIUM | 1 day | ERBed model | ✅ Complete |
| 8 | Metrics Dashboard | LOW | 2 days | Historical data |
| 9 | EMS Handoff | LOW | 4 days | External integration |

**Total Estimated Effort**: ~15 days (Phase 1-7)

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| RED patient visibility | 100% | All RED patients visible in < 5 sec |
| Navigation to zone | < 2 clicks | From any page to specific zone |
| Page load time | < 1 sec | ER dashboard initial load |
| Real-time updates | < 3 sec lag | Queue changes reflected |
| User adoption | 80% | ER staff using new dashboard |

---

## Open Questions

1. ~~**Bed Board Priority**: Is visual bed assignment needed for MVP, or can we defer?~~ ✅ Implemented
2. **Zone Capacity Source**: Should capacity be configurable per facility or hardcoded?
3. ~~**Audio Alerts**: Should critical alerts have sound? User preference setting?~~ ✅ Implemented with Web Audio API, toggleable via localStorage
4. **Mobile ER View**: Dedicated mobile layout or responsive desktop?
5. **EMS Integration**: Any existing ambulance dispatch systems to integrate with?

---

## Next Steps

1. [x] ~~Review and approve this plan~~
2. [x] ~~Implement Zone Summary API endpoint~~
3. [x] ~~Implement Critical Patients API endpoint~~
4. [x] ~~Build ER Dashboard landing page~~
5. [x] ~~Add WebSocket support with polling fallback~~
6. [x] ~~Implement Zone-Specific Views (Phase 2)~~
7. [x] ~~Add Zone Tabs Layout~~
8. [x] ~~Implement ER Bed Board (Phase 3)~~
9. [x] ~~Implement Auto-Escalation & Alerts (Phase 4)~~
10. [ ] Create E2E tests for emergency dashboard

---

## Implementation Notes (February 21, 2026)

### Files Created/Modified

**Backend:**
- `hmis/apps/triage/views.py` - Added `critical` and `zones_summary` actions to TriageQueueViewSet
- `hmis/apps/triage/consumers.py` - **NEW** - WebSocket consumer for real-time ER updates
- `hmis/apps/triage/routing.py` - **NEW** - WebSocket routing for `/ws/emergency/queue/`
- `hmis/asgi.py` - Added triage WebSocket patterns
- `tests/test_triage_api.py` - Added `TestEmergencyModuleEndpoints` test class (6 tests)
- `tests/test_asgi.py` - Updated to include emergency WebSocket pattern

**Frontend:**
- `app/(dashboard)/emergency/page.tsx` - **NEW** - ER Dashboard with zone cards
- `components/emergency/critical-alert-banner.tsx` - **NEW** - Critical patient alert banner
- `components/emergency/index.ts` - **NEW** - Module exports
- `lib/hooks/use-websocket.ts` - Added `useEmergencySocket` hook
- `lib/hooks/use-triage.ts` - Added `useCriticalPatients` and `useZonesSummary` hooks
- `lib/api/triage.ts` - Added `getCriticalPatients` and `getZonesSummary` API methods
- `lib/config/navigation.ts` - Added Emergency nav item with Siren icon
- `app/globals.css` - Added `animate-pulse-slow` keyframes for alert animation

### Architecture Decisions

1. **WebSocket with Polling Fallback**: The ER dashboard uses WebSocket as primary data source with 5-second server-push updates. When WebSocket is unavailable (connection error, server down), it automatically falls back to React Query polling (10-15 second intervals).

2. **Unified Data Model**: Both WebSocket and REST API return the same data structure for critical patients and zone summaries, allowing seamless switching between data sources.

3. **No Refresh Button**: Per wireframe spec, the "Live" status indicator replaces the refresh button. Pull-to-refresh is still available on mobile. The live indicator shows connection state and last update time.

---

### Phase 3 Files (March 4, 2026)

**Backend:**
- `hmis/apps/triage/models.py` - Added `ERBed` model with state-transition methods
- `hmis/apps/triage/serializers.py` - Added 7 serializers (detail, list, create, assign, release, update-status, summary)
- `hmis/apps/triage/views.py` - Added `ERBedViewSet` with custom actions (assign, release, update-status, summary, board)
- `hmis/apps/triage/urls.py` - Registered `er-beds` router
- `hmis/apps/triage/admin.py` - **NEW** - Admin with colored status badges
- `hmis/apps/triage/migrations/0009_add_er_bed_model.py` - **NEW** - ERBed migration
- `tests/test_er_bed_board.py` - **NEW** - 34 tests (15 model + 19 API)

**Frontend:**
- `lib/types/triage.ts` - Added `ERBed`, `ERBedStatus`, `ERZone`, `ERBedZoneSummary`, `ER_BED_STATUS_CONFIG`
- `lib/schemas/triage.schema.ts` - Added Zod schemas for all ER bed types
- `lib/api/triage.ts` - Added 8 API client methods with `parseResponse()`
- `lib/hooks/use-triage.ts` - Added `useERBedBoard`, `useERBedSummary`, `useERBedActions` hooks
- `app/(dashboard)/emergency/bed-board/page.tsx` - **NEW** - Full bed board page
- `app/(dashboard)/emergency/page.tsx` - Added `BedBoardPanel` section below ER Zones
- `app/(dashboard)/emergency/layout.tsx` - Added Bed Board tab to zone navigation

---

### Phase 4 Files (March 4, 2026)

**Backend:**
- `hmis/apps/triage/models.py` - Added `WaitTimeBreach` and `Escalation` models with state-transition methods
- `hmis/apps/triage/serializers.py` - Added breach/escalation serializers (list, detail, action serializers)
- `hmis/apps/triage/views.py` - Added `WaitTimeBreachViewSet` and `EscalationViewSet` with custom actions
- `hmis/apps/triage/urls.py` - Registered `breaches` and `escalations` routers
- `hmis/apps/triage/admin.py` - Added admin classes with colored severity/status badges
- `hmis/apps/triage/tasks.py` - Added `check_wait_time_breaches` and `auto_resolve_breaches` Celery tasks
- `hmis/apps/triage/migrations/0010_waittimebreach_escalation.py` - **NEW** - Breach & escalation migration
- `tests/test_escalation_alerts.py` - **NEW** - 33 tests (5 model breach + 4 model escalation + 5 task + 3 auto-resolve + 7 breach API + 9 escalation API)

**Frontend:**
- `lib/types/triage.ts` - Added `BreachSeverity`, `BreachStatus`, `EscalationType`, `EscalationStatus`, config objects
- `lib/schemas/triage.schema.ts` - Added `WaitTimeBreachSchema`, `EscalationSchema`, `BreachSummarySchema`
- `lib/api/triage.ts` - Added 8 API client methods (breaches + escalations) with `parseResponse()`
- `lib/hooks/use-triage.ts` - Added `useWaitTimeBreaches`, `useBreachSummary`, `useBreachActions`, `useEscalatePatient`, `useEscalations`, `useEscalationActions` hooks
- `components/emergency/alerts-provider.tsx` - **NEW** - WebSocket context provider for breach/escalation events with audio alerts
- `components/emergency/escalation-dialog.tsx` - **NEW** - Self-contained escalation dialog with card-based type selection
- `components/emergency/breach-alert-banner.tsx` - Updated with acknowledge action wiring
- `components/emergency/index.ts` - Updated exports
- `app/(dashboard)/emergency/layout.tsx` - Wrapped children in `EmergencyAlertsProvider`
- `app/(dashboard)/emergency/page.tsx` - Added `WaitTimeBreachBanner` section
- `app/(dashboard)/emergency/[zone]/page.tsx` - Added escalate button + `EscalationDialog` to queue cards

**Document Version**: 1.3
**Last Updated**: March 4, 2026

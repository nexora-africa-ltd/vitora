# Emergency Module Implementation Plan

> **Purpose**: Plan for implementing a dedicated Emergency Department module in Vitora HMIS
> **Created**: February 20, 2026
> **Updated**: March 4, 2026
> **Status**: Phase 2 Complete ✅

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
| No ER bed board | No visual bed/bay status | MEDIUM | 📋 Planned |
| No door-to-doctor metrics | Cannot measure ER efficiency | LOW | 📋 Planned |
| No EMS handoff workflow | No ambulance pre-arrival alerts | LOW | 📋 Future |
| No auto-escalation | No alerts when wait times breached | MEDIUM | 📋 Planned |

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

### Phase 3: ER Bed Board (MEDIUM PRIORITY)

**Estimated Effort**: 3 days

#### 3.1 Visual Bed Grid

**Route**: `/emergency/bed-board`

**Features**:
- [ ] Visual grid of all ER bays/beds
- [ ] Color-coded by status (available, occupied, cleaning, out of service)
- [ ] Patient info on hover/click
- [ ] Drag-and-drop patient assignment (stretch)

**Backend Requirements**:
- [ ] New model: `ERBed` (or reuse inpatient `Bed` model)
- [ ] Fields: `zone`, `bed_number`, `status`, `current_patient`

**Wireframe**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🛏️ ER BED BOARD                                     [🔄 Live] [Legend] │
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

### Phase 4: Auto-Escalation & Alerts (MEDIUM PRIORITY)

**Estimated Effort**: 2 days

#### 4.1 Wait Time Breach Alerts

**Backend**:
- [ ] Celery task to check queue every minute
- [ ] Generate alert when wait time exceeds KETA target:
  - RED: > 0 min
  - ORANGE: > 10 min
  - YELLOW: > 60 min

**Frontend**:
- [ ] WebSocket push for real-time alerts
- [ ] Toast notification with link to patient
- [ ] Optional audio alert (configurable in settings)

#### 4.2 Escalation Actions

- [ ] Button to escalate to charge nurse
- [ ] Button to request additional staff
- [ ] Audit log entry for escalations

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
| GET | `/api/emergency/beds/` | ER bed status (if bed board implemented) | 📋 Phase 3 |
| PATCH | `/api/emergency/beds/{id}/` | Update bed status | 📋 Phase 3 |
| POST | `/api/triage/assessments/{id}/escalate/` | Escalate patient | 📋 Phase 4 |
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

### Option B: ER Beds (for Bed Board)

```python
class ERBed(models.Model):
    STATUS_CHOICES = [
        ("AVAILABLE", "Available"),
        ("OCCUPIED", "Occupied"),
        ("CLEANING", "Cleaning"),
        ("OUT_OF_SERVICE", "Out of Service"),
    ]
    
    zone = models.CharField(max_length=20, choices=ASSIGNED_AREA_CHOICES)
    bed_number = models.CharField(max_length=10)  # e.g., "R-01", "A-05"
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="AVAILABLE")
    current_patient = models.ForeignKey("triage.TriageQueue", null=True, blank=True, on_delete=models.SET_NULL)
    
    class Meta:
        unique_together = ("zone", "bed_number")
```

---

## Testing Requirements

### Unit Tests

- [x] Zone summary endpoint returns correct counts (`TestEmergencyModuleEndpoints`)
- [x] Critical patients endpoint filters RED only (`TestEmergencyModuleEndpoints`)
- [x] Critical patients endpoint requires authentication
- [x] Zones summary includes all 7 ER zones
- [ ] Escalation creates audit log entry
- [ ] Wait time breach detection logic

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
| 6 | Auto-Escalation | MEDIUM | 2 days | Celery setup | 📋 Planned |
| 7 | ER Bed Board | MEDIUM | 3 days | ERBed model | 📋 Planned |
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

1. **Bed Board Priority**: Is visual bed assignment needed for MVP, or can we defer?
2. **Zone Capacity Source**: Should capacity be configurable per facility or hardcoded?
3. **Audio Alerts**: Should critical alerts have sound? User preference setting?
4. **Mobile ER View**: Dedicated mobile layout or responsive desktop?
5. **EMS Integration**: Any existing ambulance dispatch systems to integrate with?

---

## Next Steps

1. [x] ~~Review and approve this plan~~
2. [x] ~~Implement Zone Summary API endpoint~~
3. [x] ~~Implement Critical Patients API endpoint~~
4. [x] ~~Build ER Dashboard landing page~~
5. [x] ~~Add WebSocket support with polling fallback~~
6. [ ] Implement Zone-Specific Views (Phase 2)
7. [ ] Add Zone Tabs Layout
8. [ ] Create E2E tests for emergency dashboard

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

**Document Version**: 1.1
**Last Updated**: February 21, 2026

# Emergency Module Implementation Plan

> **Purpose**: Plan for implementing a dedicated Emergency Department module in Vitora HMIS
> **Created**: February 20, 2026
> **Status**: Draft

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

| Gap | Impact | Priority |
|-----|--------|----------|
| No dedicated ER dashboard | Staff must navigate to triage and filter | HIGH |
| No zone-specific views | Cannot focus on single ER zone | MEDIUM |
| No critical alert banner | RED patients not immediately visible | HIGH |
| No ER bed board | No visual bed/bay status | MEDIUM |
| No door-to-doctor metrics | Cannot measure ER efficiency | LOW |
| No EMS handoff workflow | No ambulance pre-arrival alerts | LOW |
| No auto-escalation | No alerts when wait times breached | MEDIUM |

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

### Phase 1: ER Dashboard & Critical Alerts (HIGH PRIORITY)

**Estimated Effort**: 2-3 days

#### 1.1 ER Dashboard Landing Page

**Route**: `/emergency`

**Features**:
- [ ] Zone summary cards with patient counts by category
- [ ] Critical patient ticker (RED patients with wait time)
- [ ] Quick navigation to zone views
- [ ] Real-time refresh (WebSocket or polling)

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

#### 1.2 Critical Alert Banner (Global Component)

**Location**: `components/emergency/critical-alert-banner.tsx`

**Features**:
- [ ] Shows when any RED patient is in ER queue
- [ ] Displays on all ER pages (sticky top)
- [ ] Links directly to patient in queue
- [ ] Visual + audio alert (configurable)
- [ ] Auto-dismiss when no RED patients

**API Endpoint** (new):
```
GET /api/triage/queue/critical/
Response: {
  count: 2,
  patients: [
    { id: 1, patient_name: "John Doe", mrn: "MRN-001", 
      chief_complaint: "Chest Pain", assigned_area: "ER_RESUS",
      wait_minutes: 3 },
    ...
  ]
}
```

#### 1.3 Sidebar Navigation Update

Add to sidebar:
```tsx
{
  title: 'Emergency',
  icon: Siren,
  href: '/emergency',
  badge: criticalCount > 0 ? criticalCount : undefined,
  badgeVariant: 'destructive',
}
```

---

### Phase 2: Zone-Specific Views (MEDIUM PRIORITY)

**Estimated Effort**: 2 days

#### 2.1 Zone Queue Page

**Route**: `/emergency/[zone]`

**Features**:
- [ ] Filtered queue for single zone only
- [ ] Zone-specific header with capacity info
- [ ] Same actions as triage queue (call, mark with clinician, complete, LWBS)
- [ ] Zone-specific target wait times

**Zone Mapping**:
```typescript
const ZONE_ROUTES: Record<string, AssignedArea> = {
  'resus': 'ER_RESUS',
  'acute': 'ER_ACUTE',
  'trauma': 'TRAUMA',
  'fast-track': 'ER_FAST_TRACK',
  'observation': 'OBSERVATION',
  'pediatric': 'PEDIATRIC_ER',
  'maternity': 'MATERNITY',
};
```

#### 2.2 Zone Layout with Tabs

**File**: `app/(dashboard)/emergency/layout.tsx`

**Features**:
- [ ] Horizontal tabs for quick zone switching
- [ ] Badge counts per zone
- [ ] Highlight current zone
- [ ] Mobile: horizontal scroll or dropdown

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
│  │ 🟠  │ │ 🟠  │ │ 🟠  │ │ 🟠  │ │ 🟠  │ │ ⬜  │ │ ⬜  │              │
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

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/triage/queue/critical/` | Get RED patients in ER zones |
| GET | `/api/triage/queue/by-zone/` | Get queue grouped by zone |
| GET | `/api/triage/zones/summary/` | Zone counts and capacity |
| GET | `/api/emergency/beds/` | ER bed status (if bed board implemented) |
| PATCH | `/api/emergency/beds/{id}/` | Update bed status |
| POST | `/api/triage/assessments/{id}/escalate/` | Escalate patient |
| GET | `/api/triage/metrics/` | ER performance metrics |

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

- [ ] Zone summary endpoint returns correct counts
- [ ] Critical patients endpoint filters RED only
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

| Order | Phase | Priority | Effort | Dependencies |
|-------|-------|----------|--------|--------------|
| 1 | ER Dashboard Landing | HIGH | 2 days | None |
| 2 | Critical Alert Banner | HIGH | 1 day | Zone summary endpoint |
| 3 | Sidebar Navigation | HIGH | 0.5 days | None |
| 4 | Zone-Specific Views | MEDIUM | 2 days | Phase 1 |
| 5 | Zone Tabs Layout | MEDIUM | 0.5 days | Phase 4 |
| 6 | Auto-Escalation | MEDIUM | 2 days | Celery setup |
| 7 | ER Bed Board | MEDIUM | 3 days | ERBed model |
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

1. [ ] Review and approve this plan
2. [ ] Create GitHub issues for Phase 1 tasks
3. [ ] Design Figma mockups for ER dashboard
4. [ ] Implement Zone Summary API endpoint
5. [ ] Build ER Dashboard landing page

---

**Document Version**: 1.0
**Last Updated**: February 20, 2026

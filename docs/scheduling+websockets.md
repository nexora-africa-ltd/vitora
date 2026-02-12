# Scheduling & Real-Time (WebSockets) Roadmap
Vitora HMIS

## Purpose
This roadmap defines how **scheduling** and **real-time updates (WebSockets)** are introduced across the entire HMIS in a safe, scalable, and healthcare-appropriate manner.

Key principles:
- Scheduling is **authoritative business logic**
- WebSockets are **read-only, real-time projections**
- Automatic assignment is **rule-based and auditable**
- No module depends on WebSockets to function correctly

---

## Implementation Status Summary

| Phase | Status | Tests | Location |
|-------|--------|-------|----------|
| **Phase 1: Scheduling Foundation** | ✅ Complete | 70 | `hmis.apps.scheduling` |
| **Phase 2: Assignment Engine** | ✅ Complete | 47 | `hmis.apps.scheduling.services.assignment` |
| **Phase 3: Domain Events** | 📋 Planned | - | - |
| **Phase 4: Read Models** | 📋 Planned | - | - |
| **Phase 5: WebSocket Infrastructure** | ✅ Complete | 15 | `hmis.asgi`, `hmis.apps.clinics` |
| **Phase 6: Multi-Facility** | 📋 Planned | - | - |

### Module Real-Time Status

| Module | WebSocket | Endpoint | Events |
|--------|-----------|----------|--------|
| **Clinics/OPD** | ✅ Complete | `ws/clinics/{id}/queue/` | 6 event types |
| **Laboratory** | 📋 Planned | `ws/lab/{id}/queue/` | - |
| **Theatre** | 📋 Planned | `ws/theatre/{id}/board/` | - |
| **Inpatient** | 📋 Planned | `ws/wards/{id}/beds/` | - |
| **Pharmacy** | 📋 Planned | `ws/pharmacy/{id}/queue/` | - |

---

## Guiding Architecture Principles

1. **State First, Realtime Second**
   - All scheduling state changes occur via REST/HTTP or internal services
   - WebSockets only broadcast changes

2. **Deterministic Scheduling**
   - Given the same inputs, the system produces the same assignment
   - No randomness in clinical or financial workflows

3. **Graceful Degradation**
   - If WebSockets fail, the system remains fully usable via refresh/polling

4. **Auditability**
   - Every scheduling decision and automatic assignment is traceable

---

## Scope of Scheduling (App-Wide)

Scheduling applies to:
- Clinics & consultations
- Diagnostic services (lab, radiology)
- Theatre & procedures
- Inpatient resources (beds, wards)
- Pharmacy fulfillment windows
- Staff shifts & duty rosters
- Equipment & room usage
- Follow-ups & referrals

---

## Phase 1: Core Scheduling Foundation (No WebSockets) ✅ COMPLETE

> **Implemented**: February 7, 2026  
> **Test Coverage**: 70 tests passing (34 model + 36 API)  
> **Location**: `backend/hmis/apps/scheduling/`

### Objectives
Establish a single, authoritative scheduling engine.

### Deliverables ✅
- Central `Schedule` domain model ✅
- Time-slot abstraction (start, end, timezone-safe) ✅
- Resource abstraction: ✅
  - Person (doctor, nurse, lab tech)
  - Place (room, clinic, ward)
  - Asset (bed, machine, theatre)
- Appointment / booking lifecycle: ✅
  - CREATED
  - CONFIRMED
  - CHECKED_IN
  - IN_PROGRESS
  - COMPLETED
  - CANCELLED
  - NO_SHOW

### APIs ✅
- Create / update / cancel schedules ✅
- Query availability ✅
- Conflict detection & prevention ✅
- Manual override endpoints (admin only) ✅

### Implementation Details

#### Models Created
| Model | Purpose |
|-------|--------|
| `Resource` | PERSON/PLACE/ASSET abstraction with staff profile linking |
| `TimeSlot` | Timezone-safe (Africa/Nairobi) time range with overlap detection |
| `Schedule` | RECURRING (weekly) or ONE_TIME schedules with breaks |
| `ScheduleBreak` | Break periods within schedules |
| `Appointment` | Full lifecycle with state machine transitions |

#### API Endpoints
| Endpoint | Methods |
|----------|--------|
| `/api/scheduling/resources/` | GET, POST, PATCH, DELETE |
| `/api/scheduling/resources/{id}/availability/` | GET (daily slots) |
| `/api/scheduling/resources/{id}/availability/weekly/` | GET (week view) |
| `/api/scheduling/resources/{id}/availability/check/` | GET (slot check) |
| `/api/scheduling/schedules/` | GET, POST, PATCH, DELETE |
| `/api/scheduling/schedules/{id}/breaks/` | GET, POST |
| `/api/scheduling/appointments/` | GET, POST, PATCH, DELETE |
| `/api/scheduling/appointments/{id}/confirm/` | POST |
| `/api/scheduling/appointments/{id}/check-in/` | POST |
| `/api/scheduling/appointments/{id}/start/` | POST |
| `/api/scheduling/appointments/{id}/complete/` | POST |
| `/api/scheduling/appointments/{id}/cancel/` | POST |
| `/api/scheduling/appointments/{id}/no-show/` | POST |

#### Audit Tracking
All appointment lifecycle actions are logged to `AuditLog` with:
- User who performed action
- IP address
- Timestamp
- Action type (`appointment_create`, `appointment_confirm`, etc.)

### Non-Goals (Deferred to Phase 2+)
- No real-time push
- No live dashboards
- No background auto-assignment yet

---

## Phase 2: Automatic Assignment Engine ✅ COMPLETE

> **Implemented**: February 7, 2026  
> **Test Coverage**: 47 tests passing (27 model/service + 20 API)  
> **Location**: `backend/hmis/apps/scheduling/services/assignment.py`

### Objectives
Introduce deterministic, rule-based assignment.

### Assignment Types ✅
- Doctor to appointment ✅
- Nurse to clinic/ward shift ✅
- Bed to inpatient admission ✅
- Lab technician to test batch ✅
- Theatre slot to procedure ✅

### Rule Categories ✅
- Availability (time-based) ✅
- Qualification / specialization ✅
- Load balancing ✅
- Priority (emergency > routine) ✅
- Facility or department rules ✅

### Deliverables ✅
- Assignment rules engine ✅
- Assignment decision log ✅
- Fallback logic (unassigned state) ✅
- Manual reassignment with justification ✅

### Key Rule
> Automatic assignment suggests or assigns — humans can override.

### Implementation Details

#### Models Created
| Model | Purpose |
|-------|--------|
| `AssignmentRule` | Rule definitions with JSON DSL (constraints, scoring, fallback) |
| `AssignmentDecision` | Immutable decision log with full explainability (candidates, scores) |
| `AssignmentOverride` | Manual override tracking with justification and approval workflow |

#### Services Created
| Service | Purpose |
|---------|--------|
| `RuleEvaluator` | Evaluates rules against candidates, calculates scores, logs decisions |
| `AssignmentService` | High-level orchestration for auto-assign and manual override |

#### API Endpoints
| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/scheduling/assignment-rules/` | GET, POST, PATCH, DELETE | CRUD for assignment rules |
| `/api/scheduling/assignment-rules/{id}/activate/` | POST | Activate a rule |
| `/api/scheduling/assignment-rules/{id}/deactivate/` | POST | Deactivate a rule |
| `/api/scheduling/assignment-decisions/` | GET | Read-only decision log (audit trail) |
| `/api/scheduling/assignment-overrides/` | GET, POST | Create and list overrides |
| `/api/scheduling/assignment-overrides/{id}/approve/` | POST | Approve pending override |
| `/api/scheduling/assignment-overrides/{id}/reject/` | POST | Reject pending override |
| `/api/scheduling/assignments/auto-assign/` | POST | Trigger automatic assignment |
| `/api/scheduling/assignments/manual-override/` | POST | Manually override assignment |

#### Rule DSL Structure
```json
{
  "version": "1.0",
  "when": { "appointment_type": "CONSULTATION" },
  "constraints": [
    { "field": "metadata.status", "operator": "==", "value": "on_duty" },
    { "field": "metadata.specialty", "operator": "==", "value": "General Medicine" }
  ],
  "scoring": [
    { "field": "metadata.current_load", "weight": -2 },
    { "field": "metadata.experience_years", "weight": 1 }
  ],
  "fallback": { "action": "leave_unassigned", "notify": "supervisor" }
}
```

#### Decision Explainability
Every assignment decision logs:
- All candidates evaluated with scores
- Matched and failed constraints per candidate
- Scoring breakdown (field, weight, contribution)
- Evaluation time in milliseconds
- User who triggered the assignment

#### Override Workflow
- Override reasons: PATIENT_REQUEST, STAFF_UNAVAILABLE, EMERGENCY, SPECIALIZATION_NEEDED, LOAD_BALANCING, ADMINISTRATIVE, OTHER
- Justification required for all overrides
- Optional approval workflow (PENDING → APPROVED/REJECTED)
- Full audit trail with approver/rejector tracking

---

## Phase 3: Internal Domain Events (No WebSockets Yet)

### Objectives
Decouple scheduling logic from UI concerns.

### Events Emitted
- `schedule.created`
- `schedule.updated`
- `schedule.cancelled`
- `assignment.proposed`
- `assignment.confirmed`
- `assignment.overridden`
- `resource.unavailable`

### Characteristics
- Internal-only
- Durable (can be replayed)
- Source for audit trails

### Overlap with Phase 4
At the end of this phase (Sprint 9), build **one simple projection** (e.g., queue waiting count) as a "canary" to validate that event contracts are correct before committing to the full projection suite. This de-risks Phase 4 without merging the phases.

---

## Phase 4: Read Models & Projections

> **Note**: Sprint 9 overlaps with Phase 3 (canary projection only). Full work begins Sprint 10.

### Objectives
Prepare data for real-time consumption.

### Deliverables
- Queue views
- Timetable views
- Room/ward occupancy views
- Staff workload views
- Today/Now/Next projections

### Important Rule
Read models are **derived**, never authoritative.

### Implementation Approach
1. **Sprint 9 (overlap)**: Validate canary projection, freeze event contracts
2. **Sprints 10–11**: Build full projection suite with confidence

---

## Phase 5: WebSockets Introduction ✅ INFRASTRUCTURE COMPLETE

> **Infrastructure Implemented**: February 2026  
> **Test Coverage**: 15 tests passing  
> **Location**: `backend/hmis/apps/clinics/` (first module)

### Objectives
Enable live updates without impacting core logic.

### Infrastructure Status ✅

| Component | Status | Notes |
|-----------|--------|-------|
| Django Channels | ✅ Installed | `daphne` + `channels` in INSTALLED_APPS |
| ASGI Application | ✅ Configured | `hmis/asgi.py` with ProtocolTypeRouter |
| Channel Layers | ✅ Ready | InMemoryChannelLayer (dev), Redis-ready (prod) |
| WebSocket Routing | ✅ Implemented | Per-module routing pattern established |
| Auth Middleware | ✅ Configured | AuthMiddlewareStack wrapping URLRouter |

### WebSocket Responsibilities
- Push schedule changes to clients
- Update queues and boards
- Notify users of state transitions

### WebSocket Events
- `schedule.changed`
- `queue.updated`
- `assignment.changed`
- `resource.status.changed`

### Strict Constraints ✅ ENFORCED
- WebSockets DO NOT:
  - Create schedules
  - Assign resources
  - Resolve conflicts
  - Mutate state

---

## Phase 6: Module-Specific Real-Time Features

### Clinics & OPD ✅ COMPLETE

> **Implemented**: February 2026 | 15 tests | `hmis.apps.clinics`

**WebSocket Endpoint**: `ws://host/ws/clinics/{clinic_id}/queue/`

**Consumer**: `ClinicQueueConsumer` (AsyncJsonWebsocketConsumer)

**Events Broadcasted**:
| Event | Trigger | Payload |
|-------|---------|--------|
| `patient_added` | New patient joins queue | visit_id, patient_name, queue_number, priority |
| `patient_called` | Patient called to room | visit_id, called_at |
| `consultation_started` | Consultation begins | visit_id, encounter_id, consultation_start |
| `visit_completed` | Consultation ends | visit_id, consultation_end |
| `patient_removed` | Cancel/no-show | visit_id, status, reason |
| `stats_updated` | Queue stats change | waiting_count, avg_wait_time, etc. |

**Broadcast Helpers**:
```python
# Async (for consumers/async views)
from hmis.apps.clinics.websockets import broadcast_queue_event
await broadcast_queue_event(clinic_id, event_type, data)

# Sync (for views/signals)
from hmis.apps.clinics.websockets import broadcast_queue_event_sync
broadcast_queue_event_sync(clinic_id, event_type, data)

# Convenience functions
broadcast_patient_added(visit)
broadcast_patient_called(visit)
broadcast_consultation_started(visit)
broadcast_visit_completed(visit)
broadcast_patient_removed(visit, reason)
broadcast_queue_stats(clinic_id, stats)
```

### Diagnostics
- Sample queue updates
- Result-ready notifications

### Theatre
- Live procedure board
- Delays and overruns broadcast

### Inpatient & Wards
- Bed occupancy changes
- Transfer notifications

---

## Automatic Bed Assignment Implementation Plan

> **Purpose**: Define the phased approach for automatic bed assignment from MVP to smart allocation.

### Current Infrastructure (Already Complete)

| Component | Status | Location |
|-----------|--------|----------|
| Ward capacity tracking | ✅ | `Ward.available_beds`, `Ward.capacity` |
| Bed status management | ✅ | `Bed.status` (AVAILABLE/OCCUPIED/MAINTENANCE/RESERVED) |
| Ward compatibility service | ✅ | `inpatient/services/ward_compatibility.py` |
| Assignment rules DSL | ✅ | `scheduling/services/assignment.py` (supports `BED_ASSIGNMENT` type) |
| Bed-ward relationship | ✅ | `Bed.ward` FK with unique constraint |
| Row-level locking support | ✅ | Django `select_for_update()` |

---

### Phase A: MVP — First Available Bed (Est: 1-1.5 days)

> **Status**: 🟦 In Progress  
> **Target**: February 2026

#### Algorithm
```
1. Filter ward.beds where status = 'AVAILABLE'
2. Lock rows with select_for_update(skip_locked=True)
3. Order by bed_number (deterministic)
4. Return first() or raise NoBedAvailable
5. Mark bed as OCCUPIED
```

#### Deliverables
- [ ] `inpatient/services/bed_assignment.py` — core service
- [ ] `auto_assign_bed()` function with atomic locking
- [ ] `get_available_beds()` query helper
- [ ] API flag: `auto_assign_bed: bool` on admission create
- [ ] Tests: unit + concurrent access (race conditions)
- [ ] Audit logging for auto-assignments

#### API Changes
```python
# POST /api/inpatient/admissions/
{
    "patient": 123,
    "ward": 5,
    "bed": null,              # Optional when auto_assign_bed=true
    "auto_assign_bed": true,  # NEW: triggers automatic assignment
    ...
}
```

#### Service Interface
```python
# hmis/apps/inpatient/services/bed_assignment.py
@transaction.atomic
def auto_assign_bed(ward: Ward, user: User) -> Bed:
    """
    Assign the first available bed in the ward.
    Uses row-level locking to prevent race conditions.
    
    Raises:
        NoBedAvailableError: If no beds are available.
    """
```

---

### Phase B: Rules-Based Assignment (Est: 2-3 days)

> **Status**: 📋 Planned  
> **Target**: After MVP validation

#### Algorithm
```
1. Load active BED_ASSIGNMENT rules for facility
2. Evaluate candidates (available beds) against constraints:
   - Gender restriction match
   - Age range compatibility
   - Isolation capability (if required)
   - Equipment needs (oxygen, ventilator)
3. Score candidates based on:
   - Proximity to nursing station (for high-acuity)
   - Current ward load balancing
   - Patient preference (window/aisle)
4. Select highest-scoring bed
5. Log decision with full explanation
```

#### Rule DSL Example
```yaml
rule_id: assign_bed_general_ward
version: 1.0
applies_to: BED_ASSIGNMENT

when:
  ward_type: GENERAL
  admission_type: ELECTIVE

constraints:
  - bed.status == "AVAILABLE"
  - bed.ward.gender_restriction in [null, patient.gender]
  - patient.age >= bed.ward.min_age_years or bed.ward.min_age_years is null
  - patient.age <= bed.ward.max_age_years or bed.ward.max_age_years is null

scoring:
  - prefer: bed.proximity_to_nurses_station  # Lower is better
    weight: -2
  - prefer: ward.current_occupancy           # Lower is better for load balancing
    weight: -1
  - prefer: bed.has_window                   # Patient preference
    weight: 1

fallback:
  action: leave_unassigned
  notify: ward_nurse_in_charge
```

#### Deliverables
- [ ] Integrate with existing `AssignmentRule` model
- [ ] Create `BedAssignmentRuleEvaluator` class
- [ ] Seed default rules for common ward types
- [ ] Decision logging to `AssignmentDecision` table
- [ ] Admin UI for rule management
- [ ] Override workflow for manual bed selection

---

### Phase C: Smart Allocation (Est: 4-5 days)

> **Status**: 📋 Planned  
> **Target**: Phase 2+

#### Advanced Features

| Feature | Description |
|---------|-------------|
| **Predictive Discharge** | Reserve beds based on expected discharge times |
| **Cohort Grouping** | Keep patients with similar conditions together |
| **Infection Control** | Automatic isolation placement for infectious patients |
| **Staff Workload** | Balance assignments across nursing staff |
| **Length-of-Stay Prediction** | Optimize bed turnover |
| **Emergency Buffer** | Reserve percentage of beds for emergencies |

#### Algorithm Enhancements
```
1. Check predicted discharges in next 4 hours
2. If emergency admission, consider reserved buffer
3. Evaluate infection risk score
4. Apply cohort grouping rules (e.g., post-surgical together)
5. Factor in nursing staff workload per zone
6. Score and select optimal bed
7. Trigger notifications to housekeeping if bed needs preparation
```

#### Integration Points
- Laboratory: Infection markers for isolation decisions
- Nursing Kardex: Staff workload data
- Housekeeping: Bed turnover notifications
- SHA Claims: Bed-day tracking for billing

#### Deliverables
- [ ] Discharge prediction model integration
- [ ] Infection risk assessment rules
- [ ] Cohort grouping configuration
- [ ] Emergency buffer management
- [ ] Housekeeping notification service
- [ ] Analytics dashboard for bed utilization

---

### WebSocket Events (Phase 5+)

**Endpoint**: `ws://host/ws/wards/{ward_id}/beds/`

| Event | Trigger | Payload |
|-------|---------|---------|
| `bed_assigned` | Auto/manual assignment | bed_id, patient_id, admission_id |
| `bed_vacated` | Discharge/transfer | bed_id, previous_patient_id |
| `bed_status_changed` | Maintenance/cleaning | bed_id, old_status, new_status |
| `occupancy_updated` | Any bed change | ward_id, available, occupied, total |

---

### Finance & Billing
- Payment status updates
- Invoice state changes (view-only)

---

## Phase 7: Scaling & Reliability

### Scaling Strategies
- Namespace WebSocket channels per facility/module
- Throttle non-critical updates
- Snapshot + delta updates

### Failure Handling
- Automatic reconnect
- Client-side resync via REST
- WebSocket health monitoring

---

## Explicit Non-Goals

- WebSockets as a primary API
- Client-side scheduling decisions
- Real-time mutation of clinical data
- Hidden or unaudited auto-assignments

---

## Summary

- Scheduling is implemented **first**
- Automatic assignment follows with full auditability
- WebSockets are layered on last
- The system remains correct even without real-time features

> Real-time improves experience — it must never define correctness.

---

# Additional References

- [Scheduling Domain Model](docs/scheduling-domain-model.md)
- [Clinic Module Features](docs/clinic-module-features.md)
- [WebSocket Architecture Overview](docs/websocket-architecture.md)

# Scheduling & Real-Time System

**Gantt-Style Milestones, Assignment DSL, WebSocket Contracts, and Scaling Stress Test**

---

## 1️⃣ Gantt-Style Milestone Plan

> Time is indicative. Adjust weeks to sprints if you’re sprint-based.

### Phase Overview

```
Sprint 1        Sprint 2        Sprint 3        Sprint 4        Sprint 5
|--------------|--------------|--------------|--------------|--------------|
```

---

### ✅ Phase 1: Core Scheduling Foundation (Sprints 1–4) — COMPLETE

```
[Scheduling Models] ██████████ ✅
[Availability Engine] ████████ ✅
[Conflict Detection] ████████ ✅
[REST APIs] ██████████ ✅
[Audit Logging] ██████ ✅
```

**Exit criteria** ✅

* App fully usable without real-time ✅
* Scheduling is deterministic and authoritative ✅
* Conflicts are prevented, not detected late ✅

**Completed**: February 7, 2026 | 70 tests | `hmis.apps.scheduling`

---

### ✅ Phase 2: Automatic Assignment Engine (Sprints 5–7) — COMPLETE

```
[Assignment DSL] ██████████ ✅
[Rule Evaluator] ██████████ ✅
[Decision Logging] ██████████ ✅
[Manual Override APIs] ██████████ ✅
```

**Exit criteria** ✅

* Assignments are explainable ✅
* Overrides require justification ✅
* Zero hidden automation ✅

**Completed**: February 7, 2026 | 47 tests | `hmis.apps.scheduling.services.assignment`

---

### 🟦 Phase 3: Domain Events Layer (Sprints 8–9)

```
[Event Definitions] ██████████
[Event Emission] ██████████
[Event Persistence] ██████████
[Canary Projection] ████████   ← Overlap with Phase 4
```

**Exit criteria**

* Scheduling logic no longer talks to UI directly
* Events can be replayed
* One simple projection validates event contracts (canary)

**Overlap Strategy**

> Phases 3 and 4 have a deliberate 1-sprint overlap. A single lightweight 
> projection (e.g., queue waiting count) is built at the end of Sprint 9 
> to validate the event layer before committing to all projections.

**Why keep separate (not merge)?**

| Factor | Rationale |
|--------|-----------|
| **Dependency chain** | Read models *consume* domain events. Wrong event contracts → wrong projections. |
| **Debugging clarity** | Projection bugs need certainty that events are solid. Mixed sprints obscure root causes. |
| **Replay validation** | Exit criteria "events can be replayed" must be tested *before* building complex projections. |

---

### 🟦 Phase 4: Read Models & Projections (Sprints 9–11)

> **Note**: Sprint 9 overlaps with Phase 3 (canary projection only).
> Full projection work begins Sprint 10.

```
Sprint 9 (overlap)           Sprints 10–11 (full)
├── Canary projection        ├── Timetable views
├── Validate replay works    ├── Room/ward occupancy views
└── Event contract freeze    ├── Staff workload views
                             └── Performance tuning
```

```
[Canary Validation] ████████   (Sprint 9 overlap)
[Queues Projection] ██████████
[Timetables] ██████████
[Occupancy Views] ██████████
[Workload Views] ██████████
```

**Exit criteria**

* Fast, read-optimized views
* No writes to projections
* Event contracts frozen before full projection build

---

### ✅ Phase 5: WebSockets Infrastructure (Sprints 12–13) — COMPLETE

```
[WS Infrastructure] ██████████ ✅
[Channel Design] █████████ ✅
[Client Sync] ██████████ ✅
[Clinics Queue] ██████████ ✅
```

**Exit criteria** ✅

* Real-time UX without correctness dependency ✅
* REST fallback works ✅

**Completed**: February 2026 | 15 tests | Django Channels + Daphne

---

### 🟦 Phase 6: Multi-Facility Hardening (Sprints 14–16)

```
[Facility Partitioning] ██████
[Load & Failure Tests] ███████
[Operational Playbooks] █████
```

---

## 2️⃣ Automatic Assignment Rules DSL

### Design Goals

* Human-readable
* Deterministic
* Versioned
* Auditable

---

### DSL Structure (YAML-based)

```yaml
rule_id: assign_doctor_to_opd
version: 1.0
applies_to: appointment

when:
  service_type: consultation
  department: opd
  facility: "*"

constraints:
  - availability.overlaps(appointment.time)
  - staff.role == "doctor"
  - staff.specialty in appointment.required_specialties
  - staff.status == "on_duty"

scoring:
  - prefer: staff.current_load
    weight: -2
  - prefer: staff.last_assigned_at
    weight: 1
  - prefer: staff.experience_years
    weight: 1

fallback:
  action: leave_unassigned
  notify: supervisor

audit:
  explain: true
  log_inputs: true
```

---

### Rule Evaluation Output

```json
{
  "assignment": "staff_123",
  "score": 87,
  "alternatives": ["staff_456", "staff_789"],
  "rule_version": "1.0",
  "explanation": [
    "Matched specialty",
    "Available during slot",
    "Lowest current load"
  ]
}
```

---

### Key Safety Rules

* Rules never mutate data
* Rules only **suggest or assign**
* Overrides always win
* Every decision is logged

---

## 3️⃣ WebSocket Channels & Payload Contracts

### Naming Convention

```
/ws/{facility_id}/{module}/{resource}
```

---

### Core Channels

#### Scheduling

```
/ws/{facility}/scheduling/appointments
```

```json
{
  "event": "schedule.changed",
  "appointment_id": "apt_001",
  "status": "CHECKED_IN",
  "timestamp": "2026-01-03T09:42:00Z"
}
```

---

#### Assignment

```
/ws/{facility}/assignments
```

```json
{
  "event": "assignment.changed",
  "resource_type": "doctor",
  "resource_id": "staff_123",
  "appointment_id": "apt_001",
  "reason": "auto_assignment"
}
```

---

#### Queues

```
/ws/{facility}/queues/opd
```

```json
{
  "event": "queue.updated",
  "queue": "opd",
  "position": 3,
  "appointment_id": "apt_001"
}
```

---

#### Resource Status

```
/ws/{facility}/resources/beds
```

```json
{
  "event": "resource.status.changed",
  "resource_id": "bed_12",
  "status": "occupied"
}
```

---

### WebSocket Rules (Non-Negotiable)

❌ No create/update/delete
❌ No business logic
✅ Notify only
✅ Idempotent payloads

---

## 4️⃣ Multi-Facility Stress Test & Scaling Analysis

### Problem Dimensions

| Dimension  | Risk              |
| ---------- | ----------------- |
| Facilities | Data leakage      |
| Users      | Fan-out overload  |
| Events     | Storms            |
| Real-time  | Consistency drift |

---

### Scaling Strategies

#### 1. Facility Isolation

* Facility ID in:

  * DB partitions
  * Event streams
  * WS namespaces

✅ Prevents cross-facility leakage

---

#### 2. Event Fan-Out Control

* Aggregate low-priority events
* Throttle non-clinical updates
* Snapshot + delta updates

---

#### 3. Stateless WebSocket Nodes

* WS servers do not store state
* Rehydrate via REST on reconnect

---

#### 4. Failure Scenarios

| Failure                | Result                 |
| ---------------------- | ---------------------- |
| WS down                | App still works        |
| Event lag              | UI stale, data correct |
| Assignment engine down | Manual scheduling      |

---

### Load Test Targets (Realistic)

* 100 facilities
* 50 concurrent users per facility
* 10 events/sec/facility peak
* <200ms WS fan-out latency

---

## 5️⃣ Final Architectural Truth

> **Scheduling defines reality.
> Assignments explain reality.
> WebSockets only narrate reality.**

This design:

* Survives scale
* Passes audits
* Avoids real-time fragility
* Fits healthcare operational risk

---

# **HMIS Centralized Scheduling Engine Blueprint**

---

## **1️⃣ Core Architecture**

```
                 +----------------------+
                 |  Central Scheduling  |
                 |       Engine         |
                 |---------------------|
                 | REST API (CRUD)     |
                 | WS / Event Stream   |
                 | Assignment Engine   |
                 | Rules DSL           |
                 | Audit & Logging     |
                 +----------+-----------+
                            |
        +-------------------+-------------------+
        |                   |                   |
  +-----+-----+       +-----+-----+       +-----+-----+
  | OPD App   |       | Theatre   |       | Labs / Rx |
  | Frontend  |       | Frontend  |       | Frontend  |
  +-----------+       +-----------+       +-----------+
        |                   |                   |
        +-------------------+-------------------+
                            |
                 +----------+-----------+
                 | Mobile / Remote Apps |
                 +----------------------+
```

**Key Notes:**

* All apps **consume the same API** → no duplicate scheduling logic.
* All apps **listen to WS / Event Stream** → real-time updates.
* **Assignment Engine & Rules DSL** live inside the scheduling engine.
* **Audit logs** capture every creation, update, or cancellation.

---

## **2️⃣ Modules Integration**

### **A) OPD / Clinics**

* **Use case:** Schedule patient consultations with available doctors and nurses.
* **Integration:**

  * POST `/appointments` → create consultation encounters
  * GET `/appointments?facility={id}` → fetch schedule
  * WS `channel: /ws/{facility}/scheduling/appointments`
* **Automatic Assignment:** Assign clinician based on specialty, load, and availability.
* **Conflict Handling:** Prevent overlapping patient bookings or double-booking staff.

---

### **B) Theatre / Surgery**

* **Use case:** Schedule pre-op, intra-op, and post-op theatre cases.
* **Integration:**

  * POST `/theatre_cases` → link patient encounter to theatre slot
  * GET `/theatre_cases?date={YYYY-MM-DD}`
  * WS `channel: /ws/{facility}/scheduling/theatre`
* **Automatic Assignment:** Assign surgeon, anesthetist, nurse, and theatre room.
* **Extra Features:**

  * Capture preparation status (pre-op checklist)
  * Lock theatre resources during procedure

---

### **C) Laboratory / Diagnostics**

* **Use case:** Schedule lab tests, imaging appointments.
* **Integration:**

  * POST `/lab_appointments` → schedule tests
  * GET `/lab_appointments?patient_id={id}`
  * WS `channel: /ws/{facility}/scheduling/labs`
* **Automatic Assignment:** Assign lab staff, machines, and priority based on urgency.

---

### **D) Pharmacy**

* **Use case:** Reserve medication pickup slots to prevent overcrowding.
* **Integration:**

  * POST `/pharmacy_pickups`
  * WS `channel: /ws/{facility}/scheduling/pharmacy`
* **Automatic Assignment:** Assign pharmacist and pickup counter.

---

### **E) Mobile / Remote Apps**

* **Use case:** Display schedules, send reminders, allow rescheduling.
* **Integration:**

  * Subscribe to WS channels for real-time updates
  * Fetch schedule via API for offline support

---

## **3️⃣ Event Flow (Real-Time Updates)**

```
User creates / updates / cancels appointment
         │
         ▼
 Central Scheduling Engine
         │
         ├─ Validates conflicts
         ├─ Runs Automatic Assignment
         ├─ Logs audit
         ▼
 Push event via WebSocket
         │
         ├─ OPD App updates UI
         ├─ Theatre App blocks slot
         ├─ Lab App queues patient
         └─ Mobile app sends reminder
```

**Example WS Payload:**

```json
{
  "event": "appointment.updated",
  "appointment_id": "apt_123",
  "patient_id": "patient_001",
  "assigned_staff": ["doctor_101", "nurse_202"],
  "facility_id": "facility_01",
  "status": "CHECKED_IN",
  "timestamp": "2026-01-25T08:30:00Z"
}
```

---

## **4️⃣ Automatic Assignment Engine & Rules DSL**

* **DSL-driven rules:** Assign staff/resources based on:

  * Availability
  * Specialty
  * Load / number of concurrent appointments
  * Facility / department
* **Auditable outputs:** Every assignment includes:

  * Reason for selection
  * Rule version
  * Alternatives considered
* **Fallback:** Manual override or notifications to supervisor

---

## **5️⃣ Multi-Facility & Scaling Considerations**

* **Facility partitioning:** Each event and appointment tagged with `facility_id`
* **Horizontal scaling:** Scheduling engine stateless; persistent data in DB
* **Conflict resolution:** Centralized engine prevents cross-app double-booking
* **Event fan-out:** Aggregate updates for low-priority events to reduce WS load

---

## **6️⃣ Key Advantages of This Architecture**

1. Single source of truth → consistent scheduling
2. Real-time updates across all modules
3. Automatic assignment handled centrally
4. Audit-friendly → easy reporting to MOH/DHIS2 or insurers
5. Scalable across multiple facilities and high concurrency
6. Extensible → new modules (radiology, physiotherapy) can plug in

---

This blueprint provides a clear technical plan for implementing a centralized HMIS scheduling engine that integrates seamlessly with all relevant modules, ensuring efficient and real-time scheduling across the healthcare facility.
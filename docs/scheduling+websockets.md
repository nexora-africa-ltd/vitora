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

## Phase 1: Core Scheduling Foundation (No WebSockets)

### Objectives
Establish a single, authoritative scheduling engine.

### Deliverables
- Central `Schedule` domain model
- Time-slot abstraction (start, end, timezone-safe)
- Resource abstraction:
  - Person (doctor, nurse, lab tech)
  - Place (room, clinic, ward)
  - Asset (bed, machine, theatre)
- Appointment / booking lifecycle:
  - CREATED
  - CONFIRMED
  - CHECKED_IN
  - IN_PROGRESS
  - COMPLETED
  - CANCELLED
  - NO_SHOW

### APIs
- Create / update / cancel schedules
- Query availability
- Conflict detection & prevention
- Manual override endpoints (admin only)

### Non-Goals
- No real-time push
- No live dashboards
- No background auto-assignment yet

---

## Phase 2: Automatic Assignment Engine

### Objectives
Introduce deterministic, rule-based assignment.

### Assignment Types
- Doctor to appointment
- Nurse to clinic/ward shift
- Bed to inpatient admission
- Lab technician to test batch
- Theatre slot to procedure

### Rule Categories
- Availability (time-based)
- Qualification / specialization
- Load balancing
- Priority (emergency > routine)
- Insurance / payer constraints
- Facility or department rules

### Deliverables
- Assignment rules engine
- Assignment decision log
- Fallback logic (unassigned state)
- Manual reassignment with justification

### Key Rule
> Automatic assignment suggests or assigns — humans can override.

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

---

## Phase 4: Read Models & Projections

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

---

## Phase 5: WebSockets Introduction

### Objectives
Enable live updates without impacting core logic.

### WebSocket Responsibilities
- Push schedule changes to clients
- Update queues and boards
- Notify users of state transitions

### WebSocket Events
- `schedule.changed`
- `queue.updated`
- `assignment.changed`
- `resource.status.changed`

### Strict Constraints
- WebSockets DO NOT:
  - Create schedules
  - Assign resources
  - Resolve conflicts
  - Mutate state

---

## Phase 6: Module-Specific Real-Time Features

### Clinics & OPD
- Live patient queues
- Arrival notifications
- Doctor availability updates

### Diagnostics
- Sample queue updates
- Result-ready notifications

### Theatre
- Live procedure board
- Delays and overruns broadcast

### Inpatient & Wards
- Bed occupancy changes
- Transfer notifications

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

### 🟦 Phase 1: Core Scheduling Foundation (Sprints 1–4)

```
[Scheduling Models] ██████████
[Availability Engine] ████████
[Conflict Detection] ████████
[REST APIs] ██████████
[Audit Logging] ██████
```

**Exit criteria**

* App fully usable without real-time
* Scheduling is deterministic and authoritative
* Conflicts are prevented, not detected late

---

### 🟦 Phase 2: Automatic Assignment Engine (Sprints 5–7)

```
[Assignment DSL] ███████
[Rule Evaluator] ████████
[Decision Logging] ██████
[Manual Override APIs] █████
```

**Exit criteria**

* Assignments are explainable
* Overrides require justification
* Zero hidden automation

---

### 🟦 Phase 3: Domain Events Layer (Sprints 8–9)

```
[Event Definitions] █████
[Event Emission] ██████
[Event Persistence] ██████
```

**Exit criteria**

* Scheduling logic no longer talks to UI directly
* Events can be replayed

---

### 🟦 Phase 4: Read Models & Projections (Sprints 10–11)

```
[Queues Projection] ██████
[Timetables] ██████
[Occupancy Views] ██████
```

**Exit criteria**

* Fast, read-optimized views
* No writes to projections

---

### 🟦 Phase 5: WebSockets (Sprints 12–13)

```
[WS Infrastructure] ██████
[Channel Design] █████
[Client Sync] ██████
```

**Exit criteria**

* Real-time UX without correctness dependency
* REST fallback works

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

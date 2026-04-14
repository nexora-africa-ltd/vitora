# HL7v2 Full Implementation

> **Gap #28**: HL7v2 Full Implementation
> **Sprint**: 3.B — Advanced Interoperability
> **Priority**: P3 (Enhancement)
> **Status**: ✅ Complete
> **Completed**: March 13, 2026

---

## Overview

Vitora HMIS now provides **bidirectional HL7 v2.5.1 messaging** with a standalone `hl7` Django app. Building on the existing laboratory HL7 infrastructure (ORM^O01 order sending, ORU^R01 result parsing), this implementation adds:

- **ADT messages** — Patient admission, transfer, discharge, and update notifications
- **Message persistence** — All HL7 messages stored with full lifecycle tracking
- **Queuing with retry** — Automatic retry with exponential backoff for failed sends
- **Enabled by default** — HL7 integration no longer behind a feature flag (graceful no-op when no LIS configured)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HL7v2 Messaging Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Vitora HMIS                         External Systems            │
│  ┌──────────────────────────┐       ┌──────────────────────┐    │
│  │  Admission Created       │       │                      │    │
│  │  Patient Updated         │       │  LIS (Lab)           │    │
│  │  Patient Discharged      │       │  ┌────────────────┐  │    │
│  │  Lab Order Placed        │       │  │ ADT Receiver   │  │    │
│  └──────────┬───────────────┘       │  │ ORM Receiver   │  │    │
│             │ signals/tasks          │  └───────▲────────┘  │    │
│  ┌──────────▼──────────┐            │          │           │    │
│  │  ADTService         │            │  MLLP    │           │    │
│  │  build_adt_a01()    │            │  TCP/IP  │           │    │
│  │  build_adt_a02()    │──────┐     │          │           │    │
│  │  build_adt_a03()    │      │     │  ┌───────┴────────┐  │    │
│  │  build_adt_a08()    │      │     │  │ ORU Sender     │  │    │
│  └─────────────────────┘      │     │  └───────┬────────┘  │    │
│                               │     └──────────┼───────────┘    │
│  ┌──────────▼──────────┐      │                │               │
│  │  HL7Message Model   │      │     ┌──────────▼──────────┐    │
│  │  status: PENDING    │      │     │  Vitora ORU Parser  │    │
│  │  direction: OUTBOUND│      │     │  (Lab app - exists) │    │
│  └──────────┬──────────┘      │     └─────────────────────┘    │
│             │                 │                                  │
│  ┌──────────▼──────────┐      │                                  │
│  │  HL7QueueService    │──────┘                                  │
│  │  Celery beat: 30s   │   MLLP send                            │
│  │  Retry: 1m→5m→15m→1h│                                       │
│  │  Max retries: 5     │                                        │
│  └─────────────────────┘                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. HL7 App Structure

```
hmis/apps/hl7/
├── __init__.py
├── apps.py              # HL7Config
├── models.py            # HL7Message model
├── admin.py             # Admin interface with filters and actions
├── tasks.py             # Celery tasks for queue processing
├── services/
│   ├── __init__.py
│   ├── adt_service.py   # ADT message builder (A01, A02, A03, A08)
│   └── queue_service.py # Queue processing with retry logic
└── migrations/
    └── 0001_initial.py
```

### 2. HL7Message Model

**File**: `hmis/apps/hl7/models.py`

| Field | Type | Description |
|-------|------|-------------|
| `message_type` | CharField | `ADT_A01`, `ADT_A02`, `ADT_A03`, `ADT_A08`, `ORM_O01`, `ORU_R01`, `ACK` |
| `trigger_event` | CharField | HL7 trigger (e.g., `A01`, `O01`) |
| `direction` | CharField | `INBOUND` or `OUTBOUND` |
| `raw_message` | TextField | Full HL7 message content |
| `status` | CharField | `PENDING` → `SENT` → `ACKNOWLEDGED` / `FAILED` |
| `patient` | FK(Patient) | Related patient (nullable) |
| `encounter` | FK(Encounter) | Related encounter (nullable) |
| `retry_count` | IntegerField | Number of send attempts |
| `max_retries` | IntegerField | Max retries (default 5) |
| `next_retry_at` | DateTimeField | When to next attempt |
| `last_error` | TextField | Last error message |
| `sent_at` | DateTimeField | When successfully sent |
| `acknowledged_at` | DateTimeField | When ACK received |
| `control_id` | CharField | HL7 control ID (unique) |

### 3. ADT Service

**File**: `hmis/apps/hl7/services/adt_service.py`

```python
class ADTService:
    def build_adt_a01(patient, encounter, admission=None) -> str  # Admit
    def build_adt_a02(patient, encounter, transfer=None) -> str   # Transfer
    def build_adt_a03(patient, encounter, discharge=None) -> str  # Discharge
    def build_adt_a08(patient) -> str                              # Update info
```

**Segments generated**:

| Segment | Description | Fields |
|---------|-------------|--------|
| MSH | Message Header | sending app, encoding chars, message type, control ID, version |
| EVN | Event Type | event code, recorded timestamp |
| PID | Patient ID | MRN, name, DOB, gender, address, phone, national ID |
| PV1 | Patient Visit | patient class, admit date, attending doctor, ward/bed |

**Patient class mapping**:

| Encounter Type | HL7 Patient Class |
|---------------|------------------|
| `OPD` | `O` (Outpatient) |
| `IPD` | `I` (Inpatient) |
| `EMERGENCY` | `E` (Emergency) |

### 4. Queue Service

**File**: `hmis/apps/hl7/services/queue_service.py`

```python
class HL7QueueService:
    def enqueue(message_type, trigger_event, raw_message, patient, encounter) -> HL7Message
    def process_queue() -> dict   # Process all pending messages
    def _try_send(message) -> bool  # Send single message via MLLP
```

**Retry strategy**: Exponential backoff

| Attempt | Delay |
|:-------:|-------|
| 1 | 1 minute |
| 2 | 5 minutes |
| 3 | 15 minutes |
| 4 | 1 hour |
| 5 | 1 hour |
| 6+ | Marked FAILED (dead letter) |

### 5. Celery Tasks

**File**: `hmis/apps/hl7/tasks.py`

```python
@shared_task(name="hl7_process_outbound_queue")
def process_hl7_outbound_queue():
    """Process pending outbound HL7 messages. Run via Celery beat every 30s."""
```

Add to Celery beat schedule in `settings/base.py`:

```python
CELERY_BEAT_SCHEDULE = {
    # ...existing tasks...
    "hl7-process-outbound-queue": {
        "task": "hl7_process_outbound_queue",
        "schedule": 30.0,  # Every 30 seconds
    },
}
```

---

## Configuration

```python
# settings/base.py

# HL7 is now enabled by default (graceful no-op when no LIS configured)
HL7_INTEGRATION_ENABLED = os.getenv("HL7_INTEGRATION_ENABLED", "true").lower() == "true"

# MLLP destination for HL7 messages (set to LIS address)
HL7_MLLP_HOST = os.getenv("HL7_MLLP_HOST", "")    # Empty = no-op
HL7_MLLP_PORT = int(os.getenv("HL7_MLLP_PORT", "2575"))

# Existing lab-specific HL7 settings (unchanged)
HL7_LIS_HOST = os.getenv("HL7_LIS_HOST", "")
HL7_LIS_PORT = int(os.getenv("HL7_LIS_PORT", "2575"))
```

**Graceful degradation**: When `HL7_MLLP_HOST` is empty, the queue service logs a debug message and skips sending — no errors raised.

---

## Admin Interface

**File**: `hmis/apps/hl7/admin.py`

Features:
- Message list with color-coded status badges
- Filters: direction, message type, status, date
- Search by control ID
- Bulk action: "Retry selected messages" (resets status to PENDING)
- Read-only detail view of raw HL7 message content

---

## Integration with Existing Lab HL7

The new `hl7` app **complements** the existing laboratory HL7 implementation:

| Component | Lab App (existing) | HL7 App (new) |
|-----------|-------------------|---------------|
| **ORM^O01 building** | `hl7_service.py` | — (uses lab's) |
| **ORU^R01 parsing** | `hl7_service.py` | — (uses lab's) |
| **MLLP client** | `mllp_client.py` | Reuses lab's `MLLPClient` |
| **ADT messages** | — | `adt_service.py` |
| **Message persistence** | — (in-memory only) | `HL7Message` model |
| **Queue & retry** | — | `queue_service.py` |
| **Feature flag** | `HL7_INTEGRATION_ENABLED` | Same flag (now default `true`) |

---

## Message Type Summary

| Type | Direction | Trigger | Description |
|------|-----------|---------|-------------|
| ADT^A01 | Outbound | Admission created | Patient admitted |
| ADT^A02 | Outbound | Transfer | Patient transferred to new ward |
| ADT^A03 | Outbound | Discharge | Patient discharged |
| ADT^A08 | Outbound | Patient update | Demographics changed |
| ORM^O01 | Outbound | Lab order placed | Lab order to LIS |
| ORU^R01 | Inbound | Lab result received | Results from LIS |
| ACK | Both | Message receipt | Acknowledgment |

---

## Tests

**File**: `tests/core/test_hl7_full.py`
**Count**: 33 tests

| Test Class | Tests | Covers |
|------------|:-----:|--------|
| `TestHL7MessageModel` | 5 | Model CRUD, status choices, control_id uniqueness |
| `TestADTService` | 10 | A01/A02/A03/A08 building, PID/PV1 segments, encoding |
| `TestHL7QueueService` | 10 | Enqueueing, send success/failure, retry backoff, MLLP integration |
| `TestHL7Tasks` | 4 | Celery task execution, empty queue, error handling |
| `TestHL7Admin` | 4 | Admin list, retry action, filters |

---

## Migration

**File**: `hmis/apps/hl7/migrations/0001_initial.py`

Creates `HL7Message` table with indexes on `status`, `direction`, `next_retry_at`.

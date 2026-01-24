# Clinics Module

The Clinics module manages outpatient clinic operations, patient queues, staff assignments, and chronic care enrollment tracking for Vitora HMIS.

## Overview

This module provides functionality for:
- **Clinic Management** - Define clinic types (MCH, HIV, TB, Dental, etc.)
- **Session Management** - Daily clinic sessions with open/close workflows
- **Queue Management** - Patient queuing with priority-based ordering
- **Staff Assignments** - Assign doctors, nurses, and clerks to clinics
- **Schedule Management** - Weekly operating hours
- **Chronic Care Enrollment** - Track patients enrolled in long-term care programs

## Models

### Clinic
Core clinic definition with type, location, capacity, and integration codes.

| Field | Description |
|-------|-------------|
| `name` | Clinic display name |
| `clinic_type` | Type (GENERAL, MCH, HIV, TB, DENTAL, EYE, etc.) |
| `code` | Unique clinic code |
| `status` | ACTIVE, INACTIVE, TEMPORARILY_CLOSED |
| `is_sensitive` | Requires special permission to access |
| `sha_service_code` | SHA billing integration |
| `dhis2_org_unit_id` | KHIS/DHIS2 reporting |

### ClinicSession
Daily session tracking for clinic operations.

| Field | Description |
|-------|-------------|
| `clinic` | Parent clinic |
| `session_date` | Date of session |
| `status` | SCHEDULED, OPEN, CLOSED, CANCELLED |
| `opened_by` / `closed_by` | User who opened/closed |
| `patients_registered` | Count of registered patients |
| `patients_seen` | Count of completed visits |

### ClinicVisit
Individual patient visit/queue entry.

| Field | Description |
|-------|-------------|
| `session` | Parent session |
| `patient` | Patient being seen |
| `queue_number` | Auto-assigned queue position |
| `status` | REGISTERED → WAITING → CALLED → IN_CONSULTATION → COMPLETED |
| `priority` | 1 (Emergency) to 5 (Routine) |
| `visit_type` | NEW, FOLLOW_UP, REFERRAL, EMERGENCY |
| `encounter` | Linked clinical encounter |

### ClinicStaff
Staff assignments to clinics.

| Field | Description |
|-------|-------------|
| `clinic` | Assigned clinic |
| `user` | Staff member |
| `role` | DOCTOR, NURSE, CLERK, COUNSELOR, etc. |
| `is_primary` | Primary assignment flag |

### ClinicSchedule
Weekly operating hours.

| Field | Description |
|-------|-------------|
| `clinic` | Parent clinic |
| `day_of_week` | 0 (Monday) to 6 (Sunday) |
| `start_time` / `end_time` | Operating hours |
| `max_patients` | Capacity limit |

### ClinicEnrollment
Chronic care program enrollment (HIV, TB, NCDs).

| Field | Description |
|-------|-------------|
| `clinic` | Enrollment clinic |
| `patient` | Enrolled patient |
| `enrollment_number` | Unique enrollment ID |
| `status` | ACTIVE, COMPLETED, TRANSFERRED_OUT, LOST_TO_FOLLOW_UP, DECEASED |
| `next_appointment` | Next scheduled visit |
| `appointment_interval_days` | Days between appointments |

## API Endpoints

### Clinics
```
GET     /api/clinics/                    # List clinics (filter: clinic_type, status)
POST    /api/clinics/                    # Create clinic (admin only)
GET     /api/clinics/{id}/               # Get clinic details
PATCH   /api/clinics/{id}/               # Update clinic (admin only)
DELETE  /api/clinics/{id}/               # Delete clinic (admin only)
```

### Queue Management
```
GET     /api/clinics/{id}/queue/         # Get today's queue (ordered by priority)
POST    /api/clinics/{id}/queue/         # Add patient to queue
GET     /api/clinics/{id}/queue/stats/   # Get queue statistics
```

### Sessions (nested under clinics)
```
GET     /api/clinics/{id}/sessions/           # List clinic sessions
POST    /api/clinics/{id}/sessions/           # Create session
GET     /api/clinics/{id}/sessions/today/     # Get/create today's session
POST    /api/clinics/{id}/sessions/today/open/  # Open session
POST    /api/clinics/{id}/sessions/today/close/ # Close session
```

### Staff (nested under clinics)
```
GET     /api/clinics/{id}/staff/              # List assigned staff
POST    /api/clinics/{id}/staff/              # Assign staff member
DELETE  /api/clinics/{id}/staff/{staff_id}/   # Remove staff
```

### Schedule (nested under clinics)
```
GET     /api/clinics/{id}/schedule/           # Get weekly schedule
POST    /api/clinics/{id}/schedule/           # Add schedule entry
PATCH   /api/clinics/{id}/schedule/{id}/      # Update schedule
DELETE  /api/clinics/{id}/schedule/{id}/      # Delete schedule
```

### Clinic Visits
```
GET     /api/clinic-visits/              # List visits (filter: status, clinic, date)
POST    /api/clinic-visits/              # Create visit
GET     /api/clinic-visits/{id}/         # Get visit details
PATCH   /api/clinic-visits/{id}/         # Update visit
POST    /api/clinic-visits/{id}/call/    # Call patient for consultation
POST    /api/clinic-visits/{id}/start/   # Start consultation (creates Encounter)
POST    /api/clinic-visits/{id}/complete/# Complete visit
POST    /api/clinic-visits/{id}/refer/   # Refer to another clinic
```

### Clinic Enrollments
```
GET     /api/clinic-enrollments/                    # List enrollments
POST    /api/clinic-enrollments/                    # Create enrollment
GET     /api/clinic-enrollments/{id}/               # Get enrollment
PATCH   /api/clinic-enrollments/{id}/               # Update enrollment
GET     /api/clinic-enrollments/overdue/            # Get overdue patients
GET     /api/clinic-enrollments/defaulters/         # Get defaulters (2+ missed)
POST    /api/clinic-enrollments/{id}/record-visit/  # Record visit attendance
```

### WebSocket - Real-time Queue Updates
```
ws://localhost/ws/clinics/{clinic_id}/queue/    # Connect to clinic queue
```

**Events Received:**
| Event | Description |
|-------|-------------|
| `patient_added` | New patient added to queue |
| `patient_called` | Patient called for consultation |
| `consultation_started` | Consultation has started |
| `visit_completed` | Visit completed |
| `patient_removed` | Patient removed (cancelled/no-show) |
| `stats_updated` | Queue statistics updated |

**Example Event Payload:**
```json
{
    "event": "patient_added",
    "data": {
        "visit_id": 123,
        "patient_id": 456,
        "patient_name": "John Doe",
        "queue_number": "Q001",
        "priority": "STANDARD",
        "status": "WAITING",
        "chief_complaint": "Routine checkup",
        "registered_at": "2026-01-24T09:00:00Z"
    }
}
```

## Usage Examples

### Add Patient to Queue
```python
# POST /api/clinics/1/queue/
{
    "patient": 123,
    "priority": 3,
    "visit_type": "FOLLOW_UP",
    "chief_complaint": "Routine checkup"
}
```

### Start Consultation
```python
# POST /api/clinic-visits/456/start/
# Response includes created encounter
{
    "id": 456,
    "status": "IN_CONSULTATION",
    "encounter": 789,
    "consultation_started_at": "2026-01-24T09:30:00Z"
}
```

### Refer to Another Clinic
```python
# POST /api/clinic-visits/456/refer/
{
    "target_clinic": 5,
    "reason": "Requires ophthalmology evaluation"
}
```

### Create Enrollment
```python
# POST /api/clinic-enrollments/
{
    "clinic": 2,
    "patient": 123,
    "enrollment_date": "2026-01-24",
    "appointment_interval_days": 30,
    "next_appointment": "2026-02-24"
}
```

## Visit Workflow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  REGISTERED  │───►│   WAITING    │───►│    CALLED    │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   REFERRED   │◄───│IN_CONSULTATION│───►│  COMPLETED   │
└──────────────┘    └──────────────┘    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   NO_SHOW    │
                    └──────────────┘
```

## Permissions

| Action | Required Permission |
|--------|---------------------|
| View clinics | Authenticated |
| Create/Update/Delete clinics | `is_staff` |
| View sensitive clinics | `clinics.view_sensitive_clinic` |
| Manage staff | `clinics.manage_clinic_staff` |
| Manage schedule | `clinics.manage_clinic_schedule` |

## Testing

```bash
# Run clinic module tests
cd backend
poetry run pytest tests/test_clinic*.py -v

# Run specific test class
poetry run pytest tests/test_clinic_api.py::TestClinicVisitViewSet -v

# Run WebSocket tests
poetry run pytest tests/test_clinic_websockets.py -v
```

## WebSocket Integration

### Frontend Connection Example (JavaScript)
```javascript
const socket = new WebSocket(`ws://localhost/ws/clinics/${clinicId}/queue/`);

socket.onopen = () => {
    console.log('Connected to clinic queue');
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.event) {
        case 'patient_added':
            // Add patient to queue display
            addPatientToQueue(data.data);
            break;
        case 'patient_called':
            // Highlight called patient
            highlightPatient(data.data.visit_id);
            break;
        case 'stats_updated':
            // Update queue statistics
            updateStats(data.data);
            break;
    }
};

// Send ping to keep connection alive
socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
```

### Backend Broadcast Example (Python)
```python
from hmis.apps.clinics.websockets import broadcast_queue_event, broadcast_queue_stats

# Broadcast custom event
await broadcast_queue_event(
    clinic_id=1,
    event_type="stats_updated",
    data={
        "waiting_count": 5,
        "in_consultation_count": 2,
        "completed_count": 10,
        "avg_wait_minutes": 15
    }
)

# Or use sync version in views/signals
from hmis.apps.clinics.websockets import broadcast_queue_event_sync
broadcast_queue_event_sync(clinic_id=1, event_type="custom_event", data={...})
```

## Integration Points

- **Encounters Module** - `ClinicVisit.start_consultation()` creates an Encounter
- **Triage Module** - `ClinicVisit.triage_assessment` links to TriageAssessment
- **Billing Module** - `ClinicVisit.billing_line_item` for consultation fees
- **SHA Integration** - `Clinic.sha_service_code` for claims
- **KHIS/DHIS2** - `Clinic.dhis2_org_unit_id` for reporting
- **Django Channels** - Real-time WebSocket updates for queue changes

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

## Clinical Templates in the Clinic Flow

Clinical templates (from [backend/data/clinical_templates](backend/data/clinical_templates)) are used to pre-fill an encounter's structure when a clinician starts a consultation.

**Where it happens**
- When a `ClinicVisit` transitions to **IN_CONSULTATION**, the model method `ClinicVisit.start_consultation()` resolves a default template and creates/updates an `Encounter` with `clinical_template` set.

**Resolution order**
1. `Clinic.default_clinical_template` (explicit per-clinic configuration)
2. Code-based override (for seeded “special” clinics like `GBV-DEFAULT`)
3. Clinic-type routing best-fit mapping
4. If nothing matches, the encounter remains template-less

**Operational notes**
- Templates must be loaded into the DB (typically via `python manage.py load_clinical_templates`) for routing to return a `ClinicalTemplate`.
- To backfill existing clinics that lack defaults, use `python manage.py populate_clinic_default_templates`.

### Current Best-Fit Template Routing

| Clinic Type / Code | Default ClinicalTemplate.name |
|---|---|
| `GENERAL_OPD` | `General OPD Assessment` |
| `FILTER_CLINIC` | `Filter/Screening Assessment` |
| `ANC` | `Antenatal Care (ANC) Visit` |
| `CWC` | `Child Wellness Check` |
| `PNC` | `Postnatal Care (PNC) Visit` |
| `FP` | `Family Planning Visit` |
| `IMMUNIZATION` | `Immunization Visit` |
| `CCC` | `HIV Care and Treatment` |
| `TB` | `TB Assessment` |
| `DIABETIC` | `Chronic Disease Follow-up` |
| `HYPERTENSION` | `Chronic Disease Follow-up` |
| `DENTAL` | `Dental Clinic Assessment` |
| `EYE` | `Eye Clinic Assessment` |
| `ENT` | `ENT Clinic Assessment` |
| `SURGICAL` | `Surgical OPD Assessment` |
| `ORTHO` | `Orthopedic Clinic Assessment` |
| `PHYSIO` | `Physiotherapy Session Note` |
| `DERM` | `Dermatology Clinic Assessment` |
| `NUTRITION` | `Nutrition Assessment` |
| `MENTAL_HEALTH` | `Mental Health Assessment` |
| `ONCOLOGY` | `Oncology Follow-up` |
| `DIALYSIS` | `Dialysis Session Note` |
| `PROCEDURE` | `Procedure Note` |
| `DRESSING` | `Dressing/Wound Care Note` |
| `INJECTION` | `Injection Administration Note` |
| `OTHER` | `Other Clinic Assessment` |
| `EMERGENCY` | `Emergency Triage (ETAT)` |
| `GBV-DEFAULT` (clinic code override) | `Gender-Based Violence Assessment` |

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
Chronic care program enrollment (HIV/CCC, ANC, Diabetes, TB, NCDs).

#### Core Fields
| Field | Description |
|-------|-------------|
| `clinic` | Enrollment clinic |
| `patient` | Enrolled patient |
| `enrollment_number` | Unique enrollment ID (auto-generated) |
| `status` | ACTIVE, COMPLETED, TRANSFERRED_OUT, LOST_TO_FOLLOW_UP, DECEASED, SUSPENDED |
| `next_appointment` | Next scheduled visit |
| `appointment_interval_days` | Days between appointments (default: 30) |
| `enrollment_data` | JSON field for additional data |
| `last_visit_date` | Date of last clinic visit |
| `total_visits` | Count of completed visits |

#### CCC (HIV/AIDS) Specific Fields
| Field | Description |
|-------|-------------|
| `art_start_date` | Date ART was initiated |
| `current_art_regimen` | Current ART regimen (e.g., TDF/3TC/DTG) |
| `art_regimen_line` | Regimen line (FIRST_LINE, SECOND_LINE, THIRD_LINE) |
| `who_clinical_stage` | WHO stage at enrollment (1-4) |
| `baseline_cd4_count` | CD4 count at enrollment |
| `latest_cd4_count` | Most recent CD4 count |
| `latest_cd4_date` | Date of latest CD4 test |
| `latest_viral_load` | Most recent viral load (copies/mL) |
| `latest_viral_load_date` | Date of latest viral load test |
| `viral_load_suppressed` | Is VL < 1000 copies/mL |

#### ANC (Antenatal Care) Specific Fields
| Field | Description |
|-------|-------------|
| `gravida` | Number of pregnancies |
| `para` | Number of deliveries |
| `lmp` | Last Menstrual Period date |
| `edd` | Expected Date of Delivery (auto-calculated) |
| `height_cm` | Height in centimeters |
| `blood_group` | Blood group (A+, A-, B+, B-, AB+, AB-, O+, O-) |
| `rhesus_factor` | POSITIVE, NEGATIVE, UNKNOWN |
| `hiv_status` | Mother's HIV status |
| `partner_hiv_status` | Partner's HIV status |
| `previous_cesarean` | History of C-section |
| `high_risk_pregnancy` | Is high-risk pregnancy |
| `high_risk_factors` | Description of risk factors |

#### Diabetic Clinic Specific Fields
| Field | Description |
|-------|-------------|
| `diabetes_type` | TYPE_1, TYPE_2, GESTATIONAL, OTHER |
| `diabetes_diagnosis_date` | Date of diabetes diagnosis |
| `latest_hba1c` | Most recent HbA1c (%) |
| `latest_hba1c_date` | Date of latest HbA1c test |
| `latest_fbs` | Most recent fasting blood sugar (mmol/L) |
| `latest_fbs_date` | Date of latest FBS test |
| `on_insulin` | Is patient on insulin therapy |
| `diabetes_complications` | Description of complications |

#### Alert Tracking Fields
| Field | Description |
|-------|-------------|
| `last_reminder_sent` | Timestamp of last reminder notification |
| `missed_appointment_alerts` | Count of missed appointment alerts sent |

#### Helper Methods
```python
# CCC Methods
enrollment.update_viral_load(copies_ml)    # Update VL and suppression status
enrollment.update_cd4_count(count)         # Update CD4 count
enrollment.viral_load_due()                # True if > 6 months since last VL
enrollment.cd4_due()                       # True if > 6 months since last CD4
enrollment.is_virally_suppressed()         # True if VL < 1000
enrollment.days_on_art()                   # Days since ART initiation

# ANC Methods
enrollment.calculate_edd()                 # Calculate EDD from LMP (Naegele's rule)
enrollment.gestation_weeks()               # Current gestation in weeks
enrollment.gestation_display()             # "21 weeks 3 days" format
enrollment.trimester()                     # 1, 2, or 3
enrollment.is_term()                       # True if >= 37 weeks
enrollment.days_to_edd()                   # Days remaining to EDD

# Diabetic Methods
enrollment.update_hba1c(value)             # Update HbA1c value
enrollment.update_fbs(value)               # Update FBS value
enrollment.hba1c_controlled()              # True if HbA1c < 7%
enrollment.hba1c_due()                     # True if > 3 months since last test

# General Methods
enrollment.is_overdue()                    # True if past next_appointment
enrollment.is_defaulter()                  # True if 2+ appointment cycles missed
enrollment.days_overdue()                  # Days past scheduled appointment
enrollment.days_since_last_visit()         # Days since last clinic visit
enrollment.enrollment_type()               # "CCC", "ANC", "DIABETIC", etc.
enrollment.get_clinic_specific_summary()   # Dict of clinic-type-specific data
enrollment.record_visit()                  # Record attendance, update next_appointment
```

### MonthlyClinicReport
Monthly aggregate statistics for DHIS2/KHIS reporting and dashboard summaries.

| Field | Description |
|-------|-------------|
| `clinic` | Parent clinic |
| `year`, `month` | Reporting period (unique per clinic) |
| `total_visits`, `new_visits`, `revisits` | Visit volumes |
| `male_visits`, `female_visits` | Gender breakdown |
| `under_5_visits`, `under_18_visits`, `adult_visits`, `over_60_visits` | Age band breakdown |
| `total_revenue`, `sha_claims_amount`, `cash_amount` | Revenue breakdown |
| `dhis2_submitted`, `dhis2_submitted_at`, `dhis2_response` | Submission tracking |

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

### Monthly Reports
```
GET     /api/clinics/{id}/reports/monthly/                           # List available monthly reports
GET     /api/clinics/{id}/reports/monthly/{year}/{month}/            # Get (or generate) a specific report
POST    /api/clinics/{id}/reports/monthly/{year}/{month}/regenerate/ # Force regeneration
```

**Query Parameters:**
| Parameter | Description |
|-----------|-------------|
| `clinic` | Filter by clinic ID |
| `clinic_type` | Filter by clinic type (CCC, ANC, DIABETIC, etc.) |
| `patient` | Filter by patient ID |
| `status` | Filter by status (ACTIVE, COMPLETED, etc.) |
| `is_overdue` | Filter by overdue status (true/false) |
| `is_defaulter` | Filter by defaulter status (true/false) |
| `enrollment_type` | Filter by type (CCC, ANC, DIABETIC, HYPERTENSION, TB) |

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

### Create CCC (HIV) Enrollment
```python
# POST /api/clinic-enrollments/
{
    "clinic": 2,  # CCC clinic
    "patient": 123,
    "enrollment_date": "2026-01-24",
    "appointment_interval_days": 30,
    "next_appointment": "2026-02-24",
    "art_start_date": "2025-01-15",
    "current_art_regimen": "TDF/3TC/DTG",
    "art_regimen_line": "FIRST_LINE",
    "who_clinical_stage": 2,
    "baseline_cd4_count": 350
}
```

### Create ANC (Antenatal) Enrollment
```python
# POST /api/clinic-enrollments/
{
    "clinic": 3,  # ANC clinic
    "patient": 456,
    "enrollment_date": "2026-01-24",
    "appointment_interval_days": 28,
    "gravida": 2,
    "para": 1,
    "lmp": "2025-10-01",  # EDD auto-calculated: 2026-07-08
    "blood_group": "O+",
    "rhesus_factor": "POSITIVE",
    "hiv_status": "NEGATIVE"
}
```

### Create Diabetic Enrollment
```python
# POST /api/clinic-enrollments/
{
    "clinic": 4,  # Diabetic clinic
    "patient": 789,
    "enrollment_date": "2026-01-24",
    "appointment_interval_days": 90,
    "diabetes_type": "TYPE_2",
    "diabetes_diagnosis_date": "2020-06-15",
    "on_insulin": false,
    "latest_hba1c": 7.2
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
- **Celery Tasks** - Automated alerts for overdue/defaulter patients

## Celery Tasks (Automated Alerts)

The following Celery tasks run automatically to manage chronic care follow-up:

### `send_overdue_appointment_alerts`
Runs daily to send alerts for overdue clinic appointments.
- Checks for active enrollments past their `next_appointment` date
- Sends alerts (SMS/email/in-app) if no alert sent in last 7 days
- Tracks `last_reminder_sent` and `missed_appointment_alerts` count

### `send_upcoming_appointment_reminders`
Sends reminders 1-3 days before scheduled appointments.
- Helps improve appointment attendance
- Only sends if not reminded in last 3 days

### `generate_defaulter_list`
Generates a list of defaulters for community health follow-up.
- Identifies patients overdue by 2+ appointment cycles
- Can be filtered by clinic
- Returns patient contact details for outreach

## Celery Task (Monthly Clinic Reports)

### `generate_monthly_clinic_reports`
Generates monthly reports for all clinics.

- Scheduled via Celery Beat (see `hmis/celery.py`) to run on the **1st of every month at 01:00** (Africa/Nairobi).
- Defaults to generating reports for the **previous month** if `year`/`month` are not provided.
- Supports explicit `year` and `month` kwargs (useful for backfills).

# Disease Surveillance Module

> **MOH 502 Notifiable Disease Reporting & IHR Compliance for Kenya**
>
> Version: 3.0
> Created: February 22, 2026
> Updated: March 2, 2026
> Sprint: Phase 1, Sprint 1.B / Phase 2, Sprint 2.D

---

## Overview

The Disease Surveillance module implements Kenya's Ministry of Health (MOH) 502 notifiable disease reporting requirements and **WHO International Health Regulations (IHR, 2005) compliance**. It provides automated disease detection from clinical diagnoses, real-time alerts for immediate reportable diseases, reporting endpoints for county health offices, and an IHR notification pipeline for escalating public health events from facility level through County → MOH National → WHO.

### Key Features

- **Automatic Case Detection**: Diagnoses with ICD-10 codes matching notifiable diseases trigger automatic case creation
- **Real-time WebSocket Alerts**: Immediate notification to surveillance dashboard for critical diseases
- **Frontend WebSocket Integration**: Real-time updates with automatic polling fallback
- **IDSR Disease List**: Pre-seeded with 55 notifiable diseases (19 immediate, 21 weekly, 15 monthly)
- **Official IDSR Case Definitions**: Extracted from MOH "Standard Case Definitions for Priority Diseases in Kenya" and "IDSR Clinicians Handbook"
- **NCD Surveillance**: Includes non-communicable diseases (diabetes, hypertension, cancers, road traffic injuries)
- **Outbreak Thresholds**: Alert and action thresholds per IDSR guidelines for 28+ priority diseases
- **Structured Data**: JSON schema v2.2 with suspected/confirmed criteria and laboratory requirements
- **Outbreak Detection**: Configurable numeric thresholds for automatic outbreak alerts
- **County Reporting**: Reports endpoint for county health offices
- **Extensible JSON Data**: Easy maintenance and expansion via `data/notifiable_diseases.json`
- **DHIS2/KHIS Integration**: Hybrid mapping system (JSON + Django admin) for data element UIDs with multi-environment support (local/staging/production)
- **IHR Notification Pipeline**: Full WHO IHR 2005 compliance with 8-status escalation workflow (Draft → County → MOH → WHO → Acknowledged → Closed)
- **WHO Annex 2 Decision Instrument**: Structured assessment of public health events against IHR Annex 2 criteria
- **24-Hour Overdue Tracking**: Automatic detection of IHR notifications exceeding the 24-hour compliance deadline
- **IHR Dashboard**: Real-time statistics for IHR compliance monitoring with urgency/disease breakdowns

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Surveillance Architecture                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐                            │
│  │  Encounter App   │    │  Surveillance    │                            │
│  │  (Diagnosis)     │───▶│  Signal Handler  │                            │
│  └──────────────────┘    └────────┬─────────┘                            │
│                                   │                                      │
│                          ┌────────▼─────────┐                            │
│                          │ SurveillanceService│                           │
│                          │ - Check ICD-10   │                            │
│                          │ - Create Case    │                            │
│                          │ - Generate Alert │                            │
│                          └────────┬─────────┘                            │
│                                   │                                      │
│           ┌───────────────────────┼───────────────────────┐              │
│           │                       │                       │              │
│  ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────────┐      │
│  │   WebSocket     │    │    SMS/Email    │    │  Database       │      │
│  │   Broadcast     │    │    Alerts       │    │  (Cases)        │      │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘      │
│                                                          │               │
│                    ┌─────────────────────────────────────┘               │
│                    │                                                     │
│           ┌────────▼──────────────────────────────────────────┐          │
│           │            IHR Notification Pipeline              │          │
│           │                                                    │          │
│           │  DRAFT → COUNTY → MOH NATIONAL → WHO → CLOSED    │          │
│           │                                                    │          │
│           │  • WHO Annex 2 Decision Instrument                │          │
│           │  • 24-hour overdue tracking                       │          │
│           │  • State-transition methods on model              │          │
│           │  • Audit logging at every escalation step         │          │
│           └───────────────────────────────────────────────────┘          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Models

### NotifiableDisease

Reference model for MOH 502 notifiable diseases.

| Field | Type | Description |
|-------|------|-------------|
| `name` | CharField | Disease name (e.g., "Cholera") |
| `icd10_codes` | TextField | Comma-separated ICD-10 codes |
| `category` | CharField | IMMEDIATE / WEEKLY / MONTHLY |
| `reporting_hours` | PositiveIntegerField | Max hours to report (24 for immediate) |
| `description` | TextField | Clinical description |
| `case_definition` | TextField | WHO/MOH case definition |
| `laboratory_criteria` | TextField | Lab confirmation criteria |
| `is_ihr_notifiable` | BooleanField | Requires IHR notification |
| `is_active` | BooleanField | Currently on reportable list |

### NotifiableCase

Instance of a detected notifiable disease case.

| Field | Type | Description |
|-------|------|-------------|
| `disease` | ForeignKey | NotifiableDisease reference |
| `patient` | ForeignKey | Patient with condition |
| `encounter` | ForeignKey | Encounter where diagnosed |
| `diagnosis` | ForeignKey | Triggering Diagnosis record |
| `onset_date` | DateField | Symptom onset date |
| `severity` | CharField | MILD / MODERATE / SEVERE / CRITICAL |
| `outcome` | CharField | ACTIVE / RECOVERED / REFERRED / DECEASED |
| `laboratory_confirmed` | BooleanField | Lab-confirmed diagnosis |
| `notification_status` | CharField | PENDING / NOTIFIED / ACKNOWLEDGED / CLOSED |
| `notification_deadline` | DateTimeField | Auto-calculated deadline |
| `county` | ForeignKey | County for notification routing |

### SurveillanceAlert

Real-time alert for surveillance dashboard.

| Field | Type | Description |
|-------|------|-------------|
| `case` | ForeignKey | NotifiableCase that triggered alert |
| `alert_type` | CharField | NEW_CASE / OVERDUE / OUTBREAK |
| `message` | TextField | Alert message content |
| `is_acknowledged` | BooleanField | Alert acknowledged |
| `sent_via_websocket` | BooleanField | Broadcast via WebSocket |
| `sent_via_sms` | BooleanField | SMS sent |
| `sent_via_email` | BooleanField | Email sent |

### OutbreakThreshold

Configuration for outbreak detection.

| Field | Type | Description |
|-------|------|-------------|
| `disease` | ForeignKey | Disease to monitor |
| `county` | ForeignKey | Specific county (null = national) |
| `case_threshold` | PositiveIntegerField | Cases to trigger outbreak |
| `period_days` | PositiveIntegerField | Time period for counting |

### DHIS2DataElementMapping

Mapping between NotifiableDisease and DHIS2 Data Element UIDs.

| Field | Type | Description |
|-------|------|-------------|
| `disease` | ForeignKey | NotifiableDisease reference |
| `indicator_type` | CharField | cases_under_5 / cases_5_and_above / deaths_under_5 / deaths_5_and_above |
| `environment` | CharField | local / staging / production |
| `data_element_uid` | CharField | DHIS2 Data Element UID (11 chars) |
| `short_name` | CharField | DHIS2 short name (e.g., IDSR_CHOLERA_U5_CASES) |
| `is_active` | BooleanField | Whether mapping is active |
| `notes` | TextField | Additional notes or KHIS mapping references |

**Management**: Django Admin at `/admin/surveillance/dhis2dataelementmapping/`

**Usage**:
```python
from hmis.apps.surveillance.dhis2_mappings import get_data_element_uid
uid = get_data_element_uid("Cholera", "cases_under_5", "local")
```

See [IDSR Weekly Reporting](idsr-weekly-reporting.md#data-element-mapping-hybrid-system) for full documentation.

### IHRNotification

WHO International Health Regulations (2005) notification tracking with full escalation pipeline.

#### Enums

**IHRUrgency:**

| Value | Label | Description |
|-------|-------|-------------|
| `EMERGENCY` | Public Health Emergency (PHEIC) | Immediate notification required |
| `URGENT` | Urgent (within 24 hours) | Standard IHR 24h deadline |
| `ROUTINE` | Routine IHR Notification | Less time-critical |

**IHRNotificationStatus:**

| Value | Label |
|-------|-------|
| `DRAFT` | Draft |
| `PENDING_REVIEW` | Pending Review |
| `SUBMITTED_COUNTY` | Submitted to County |
| `ESCALATED_NATIONAL` | Escalated to MOH |
| `NOTIFIED_WHO` | Notified to WHO |
| `ACKNOWLEDGED` | Acknowledged by WHO |
| `CLOSED` | Closed |
| `REJECTED` | Rejected |

#### Fields

| Field | Type | Description |
|-------|------|-------------|
| `disease` | ForeignKey | NotifiableDisease (must have `is_ihr_notifiable=True`) |
| `case` | ForeignKey | Source NotifiableCase (optional) |
| `patient` | ForeignKey | Index patient (optional) |
| `event_description` | TextField | Description of the public health event |
| `event_date` | DateField | Date event was detected |
| `urgency` | CharField | EMERGENCY / URGENT / ROUTINE (default: URGENT) |
| `annex2_criteria` | JSONField | WHO Annex 2 decision instrument responses |
| `is_annex2_positive` | BooleanField | Whether event meets Annex 2 criteria |
| `cases_count` | PositiveIntegerField | Total number of cases (default: 1) |
| `deaths_count` | PositiveIntegerField | Number of deaths (default: 0) |
| `affected_area` | TextField | Affected geographic area |
| `county` | ForeignKey | Auto-populated from case/patient |
| `sub_county` | ForeignKey | Auto-populated from case/patient |
| `status` | CharField | Pipeline status (default: DRAFT) |
| `reported_by` | ForeignKey | Staff who initiated notification |
| `report_date` | DateTimeField | When first reported |
| `county_notified_at` | DateTimeField | When county was notified |
| `county_reviewed_by` | ForeignKey | County reviewer |
| `county_notes` | TextField | County review notes |
| `national_notified_at` | DateTimeField | When MOH was notified |
| `national_reviewed_by` | ForeignKey | MOH reviewer |
| `national_notes` | TextField | MOH review notes |
| `who_notified_at` | DateTimeField | When WHO was notified |
| `who_reference_number` | CharField | WHO reference/event ID |
| `who_acknowledged_at` | DateTimeField | When WHO acknowledged |
| `resolved_at` | DateTimeField | When resolved/closed |
| `resolution_notes` | TextField | Resolution summary |
| `risk_assessment` | TextField | Risk assessment summary |
| `response_measures` | TextField | Response measures taken |

#### Computed Properties

| Property | Return Type | Logic |
|----------|-------------|-------|
| `notification_reference` | `str` | `"IHR-{id:04d}"` or `"IHR-DRAFT"` |
| `is_escalated` | `bool` | True if status NOT in `{DRAFT, PENDING_REVIEW, REJECTED}` |
| `is_who_notified` | `bool` | True if status in `{NOTIFIED_WHO, ACKNOWLEDGED, CLOSED}` |
| `hours_since_detection` | `int \| None` | `(now - report_date)` in hours |
| `is_overdue` | `bool` | True if >24 hours since detection AND not WHO-notified/rejected/closed |

#### State-Transition Methods

| Method | Sets Status To | Updates Fields |
|--------|---------------|----------------|
| `submit_to_county(user, notes)` | `SUBMITTED_COUNTY` | `county_notified_at`, `county_reviewed_by`, `county_notes` |
| `escalate_to_national(user, notes)` | `ESCALATED_NATIONAL` | `national_notified_at`, `national_reviewed_by`, `national_notes` |
| `notify_who(reference_number)` | `NOTIFIED_WHO` | `who_notified_at`, `who_reference_number` |
| `acknowledge_who()` | `ACKNOWLEDGED` | `who_acknowledged_at` |
| `close(notes)` | `CLOSED` | `resolved_at`, `resolution_notes` |
| `reject(user, notes)` | `REJECTED` | `resolved_at`, `resolution_notes` |

#### Status Workflow

```
                ┌──────────┐
                │  DRAFT   │
                └────┬─────┘
                     │ submit_to_county()
                     ▼
           ┌─────────────────┐
           │ SUBMITTED_COUNTY│
           └────────┬────────┘
                    │ escalate_to_national()
                    ▼
          ┌──────────────────────┐
          │ ESCALATED_NATIONAL   │
          └─────────┬────────────┘
                    │ notify_who()
                    ▼
           ┌─────────────────┐
           │  NOTIFIED_WHO   │
           └────────┬────────┘
                    │ acknowledge_who()
                    ▼
           ┌────────────────┐
           │  ACKNOWLEDGED  │
           └────────┬───────┘
                    │ close()
                    ▼
           ┌────────────┐
           │   CLOSED   │
           └────────────┘

  At any non-terminal stage:
  close()  → CLOSED
  reject() → REJECTED (cannot reject NOTIFIED_WHO, ACKNOWLEDGED, CLOSED, REJECTED)
```

#### Custom Permissions

| Codename | Description |
|----------|-------------|
| `escalate_ihr_to_county` | Can escalate IHR notifications to county |
| `escalate_ihr_to_national` | Can escalate IHR notifications to MOH |
| `notify_ihr_to_who` | Can notify WHO of IHR events |

---

## API Endpoints

### Notifiable Diseases

```
GET    /api/surveillance/diseases/           # List all diseases
GET    /api/surveillance/diseases/{id}/      # Get disease details
GET    /api/surveillance/diseases/immediate/ # Immediate reportable only
POST   /api/surveillance/diseases/           # Create (admin only)
PATCH  /api/surveillance/diseases/{id}/      # Update (admin only)
```

### Notifiable Cases

```
GET    /api/surveillance/cases/              # List cases (filterable)
POST   /api/surveillance/cases/              # Create case manually
GET    /api/surveillance/cases/{id}/         # Get case details
PATCH  /api/surveillance/cases/{id}/         # Update case
POST   /api/surveillance/cases/{id}/notify_county/  # Mark as notified
GET    /api/surveillance/cases/pending/      # Pending notifications
GET    /api/surveillance/cases/overdue/      # Overdue notifications
GET    /api/surveillance/cases/immediate/    # Immediate cases pending
```

### Alerts

```
GET    /api/surveillance/alerts/             # List alerts
GET    /api/surveillance/alerts/{id}/        # Get alert details
POST   /api/surveillance/alerts/{id}/acknowledge/  # Acknowledge alert
GET    /api/surveillance/alerts/unacknowledged/    # Unacknowledged alerts
```

### Thresholds

```
GET    /api/surveillance/thresholds/         # List thresholds
POST   /api/surveillance/thresholds/         # Create threshold (admin)
GET    /api/surveillance/thresholds/{id}/check/  # Check if exceeded
GET    /api/surveillance/thresholds/exceeded/    # All exceeded thresholds
```

### Dashboard & Reports

```
GET    /api/surveillance/dashboard/          # Dashboard statistics
GET    /api/surveillance/reports/county/{id}/ # County disease report
```

### IHR Notifications

```
GET    /api/surveillance/ihr/                         # List IHR notifications (paginated, filterable)
POST   /api/surveillance/ihr/                         # Create IHR notification
GET    /api/surveillance/ihr/{id}/                    # Get notification detail
PATCH  /api/surveillance/ihr/{id}/                    # Update notification
DELETE /api/surveillance/ihr/{id}/                    # Delete notification
POST   /api/surveillance/ihr/{id}/submit_to_county/   # Submit to County DSC
POST   /api/surveillance/ihr/{id}/escalate_to_national/ # Escalate to MOH National
POST   /api/surveillance/ihr/{id}/notify_who/          # Mark WHO notified
POST   /api/surveillance/ihr/{id}/acknowledge_who/     # Record WHO acknowledgement
POST   /api/surveillance/ihr/{id}/close/               # Close notification
POST   /api/surveillance/ihr/{id}/reject/              # Reject notification
GET    /api/surveillance/ihr/overdue/                  # List overdue (>24h)
GET    /api/surveillance/ihr/dashboard/                # IHR dashboard statistics
```

#### IHR Filters & Search

| Filter | Description |
|--------|-------------|
| `disease` | Filter by NotifiableDisease ID |
| `status` | Filter by IHR status |
| `urgency` | Filter by urgency level |
| `county` | Filter by county |
| `reported_after` | Notifications reported after date |
| `reported_before` | Notifications reported before date |
| `is_annex2_positive` | Filter by Annex 2 assessment result |
| `search` | Search disease name, description, WHO reference, patient MRN/name |

#### IHR Dashboard Response

```json
{
  "total": 10,
  "pending": 3,
  "at_county": 2,
  "at_national": 1,
  "notified_who": 2,
  "closed": 1,
  "rejected": 1,
  "overdue": 2,
  "by_urgency": [{"urgency": "URGENT", "count": 5}],
  "by_disease": [{"disease": "Cholera", "count": 4}]
}
```

---

## WebSocket

Connect to receive real-time surveillance alerts:

```
ws://localhost/ws/surveillance/alerts/
```

### Events

| Event Type | Description |
|------------|-------------|
| `surveillance.new_case` | New non-immediate case detected |
| `surveillance.immediate_alert` | Immediate reportable disease detected |
| `surveillance.outbreak_alert` | Outbreak threshold exceeded |
| `surveillance.overdue_alert` | Notification deadline passed |
| `surveillance.stats_update` | Dashboard statistics refresh |

### Message Format

```json
{
  "type": "surveillance.immediate_alert",
  "data": {
    "alert_id": 1,
    "case_id": 42,
    "disease_name": "Cholera",
    "disease_category": "IMMEDIATE",
    "patient_mrn": "MRN-20260222-0001",
    "county": "Mombasa",
    "message": "⚠️ IMMEDIATE: New Immediate (within 24 hours) case: Cholera...",
    "is_immediate": true,
    "notification_deadline": "2026-02-23T14:30:00Z",
    "timestamp": "2026-02-22T14:30:00Z"
  }
}
```

---

## Automatic Case Detection

When a diagnosis is saved with an ICD-10 code that matches a notifiable disease, the system automatically:

1. **Detects Match**: Signal handler checks diagnosis ICD-10 against disease list
2. **Creates Case**: NotifiableCase record created with calculated deadline
3. **Generates Alert**: SurveillanceAlert created for immediate diseases
4. **Broadcasts**: Alert sent via WebSocket to connected dashboards
5. **Notifies**: SMS/email sent if configured (for immediate diseases)

### Signal Flow

```python
# When a Diagnosis is saved:
post_save.connect(check_diagnosis_for_surveillance, sender=Diagnosis)

# The signal handler:
1. Checks if ICD-10 code matches any NotifiableDisease
2. Calls SurveillanceService.create_case_from_diagnosis()
3. Service creates NotifiableCase with deadline
4. Service creates SurveillanceAlert for immediate diseases
5. Service broadcasts via WebSocket
6. Service sends SMS/email if configured
```

---

## Disease Categories

### Immediate (24 hours)

Must be reported to county health office within 24 hours:

- Cholera, Yellow Fever, Plague
- Viral Hemorrhagic Fevers (Ebola, Marburg, Lassa)
- Measles, Polio (AFP), Meningococcal Meningitis
- Rabies, Diphtheria, Neonatal Tetanus
- Pertussis, Anthrax, SARS/COVID-19
- Novel/Pandemic Influenza, Smallpox

### Weekly (IDSR)

Reported in weekly IDSR summary:

- Malaria, Typhoid, Dysentery
- Tuberculosis, ARI, Pneumonia
- Diarrhea, Leprosy, Brucellosis
- Hepatitis, Chikungunya, Dengue
- Rift Valley Fever, and more

### Monthly

Aggregated in monthly reports:

- Maternal Deaths, Perinatal Deaths
- Severe Acute Malnutrition
- Animal Bites, Snake Bites

---

## Configuration

### SMS Alerts

Configure SMS recipient for immediate disease alerts:

```python
# settings.py
SURVEILLANCE_SMS_RECIPIENT = "+254712345678"  # County health officer
SMS_ENABLED = True
AT_USERNAME = "your_africastalking_username"
AT_API_KEY = "your_api_key"
```

### Email Alerts

Configure email recipient for immediate disease alerts:

```python
# settings.py
SURVEILLANCE_EMAIL_RECIPIENT = "cho@county.health.go.ke"
DEFAULT_FROM_EMAIL = "noreply@facility.health.go.ke"
```

---

## Data Management

### JSON Data File

Disease data is stored in `backend/data/notifiable_diseases.json` with schema version 2.0:

```json
{
  "_metadata": {
    "version": "2.0.0",
    "source": "Kenya MOH 502 Notifiable Diseases List",
    "schema_version": "2.0"
  },
  "diseases": [
    {
      "name": "Cholera",
      "icd10_codes": "A00,A00.0,A00.1,A00.9",
      "category": "IMMEDIATE",
      "reporting_hours": 24,
      "case_definition": {
        "suspected": "Patient aged 2+ with acute watery diarrhea...",
        "confirmed": "Suspected case with lab confirmation...",
        "source": "MOH Standard Case Definitions"
      },
      "laboratory_criteria": {
        "specimen": "Stool sample",
        "test": "Culture for Vibrio cholerae O1/O139",
        "turnaround": "24-48 hours"
      },
      "is_ihr_notifiable": true
    }
  ]
}
```

### Management Commands

```bash
# Seed MOH 502 diseases (first time)
python manage.py seed_notifiable_diseases

# Preview what would be done (dry run)
python manage.py seed_notifiable_diseases --dry-run

# Update existing diseases from JSON
python manage.py seed_notifiable_diseases --update

# Clear and reseed
python manage.py seed_notifiable_diseases --clear

# Use custom JSON file
python manage.py seed_notifiable_diseases --file /path/to/custom.json
```

### Makefile Targets

```bash
make seed-diseases         # Fresh seed from JSON
make seed-diseases-update  # Update existing from JSON
```

---

## PDF Case Definition Extraction

The extraction helper script assists with extracting case definitions from the scanned MOH PDF:

```bash
cd backend/scripts

# Generate extraction template
python extract_case_definitions.py --template > template.json

# Generate AI prompt for a specific disease
python extract_case_definitions.py --ai-prompt "Cholera"

# Validate extracted JSON
python extract_case_definitions.py --validate extracted.json

# Process OCR output (best effort)
python extract_case_definitions.py --ocr ocr_output.txt

# Merge extracted data into main JSON
python extract_case_definitions.py --merge extracted.json
```

### Extraction Workflow

1. **Generate template**: Creates JSON with all 40 diseases for manual filling
2. **AI-assisted**: Use `--ai-prompt` to generate prompts for Claude/GPT to extract from PDF images
3. **OCR processing**: Parse OCR text output (low confidence, needs review)
4. **Validate**: Check extracted JSON for completeness
5. **Merge**: Combine extracted data into main `notifiable_diseases.json`

---

## Testing

```bash
# Run surveillance tests
poetry run pytest tests/test_surveillance.py -v

# Run with coverage
poetry run pytest tests/test_surveillance.py --cov=hmis.apps.surveillance
```

### Test Coverage

- 30+ unit tests covering:
  - NotifiableDisease CRUD and filtering
  - NotifiableCase creation, notification workflow
  - Automatic case detection from diagnoses
  - SurveillanceAlert creation and acknowledgment
  - OutbreakThreshold detection
  - Dashboard and county reporting endpoints
  - WebSocket alert broadcasting

### IHR Notification Tests

```bash
# Run IHR notification tests
poetry run pytest tests/test_ihr_notification.py -v
```

- ~40 tests across 4 test classes:
  - **TestIHRNotificationModel** (13 tests): Model creation, `notification_reference`, default status, auto-populate county, `is_escalated`, `is_who_notified`, `hours_since_detection`, `is_overdue` scenarios
  - **TestIHRWorkflow** (7 tests): All state transitions including full pipeline test (DRAFT → COUNTY → NATIONAL → WHO → ACKNOWLEDGED → CLOSED)
  - **TestIHRSerializerValidation** (4 tests): Non-IHR disease rejection, IHR disease acceptance, list/detail serializer field verification
  - **TestIHRNotificationAPI** (16 tests): CRUD, auth enforcement, all 6 action endpoints, invalid status transitions, overdue listing, dashboard, filtering, search

---

## Future Enhancements

- [x] IDSR Weekly Report generation ✅ (February 23, 2026)
- [x] DHIS2 submission integration ✅ (February 23, 2026)
- [x] Web app surveillance dashboard ✅ (February 23, 2026)
- [x] Frontend WebSocket real-time updates ✅ (February 23, 2026)
- [ ] Contact tracing workflow
- [ ] Outbreak investigation module
- [x] IHR notification workflow for international diseases ✅ (March 2, 2026)
- [ ] Mobile app push notifications
- [ ] Automated outbreak clustering detection

---

## Frontend Implementation

### Web App Dashboard

The surveillance dashboard is implemented in `web-app/app/(dashboard)/surveillance/`:

| Page | Route | Features |
|------|-------|----------|
| Dashboard | `/surveillance` | Stats cards, top diseases, cases by county, quick actions |
| Cases | `/surveillance/cases` | Case list with filters, pagination |
| Alerts | `/surveillance/alerts` | Alert list with acknowledge, tabs for all/unacknowledged |
| Thresholds | `/surveillance/thresholds` | Outbreak threshold configuration |
| IDSR Reports | `/surveillance/idsr` | Weekly report list, generation, DHIS2 submission |
| IHR Notifications | `/surveillance/ihr` | IHR notification list with dashboard stats, filters, overdue tracking |
| IHR Detail | `/surveillance/ihr/[id]` | Escalation pipeline, action buttons, history timeline |
| IHR Create | `/surveillance/ihr/new` | New IHR notification form with Annex 2 assessment |

### WebSocket Integration

The frontend uses a hybrid WebSocket + polling approach:

```typescript
// lib/hooks/surveillance-websocket/use-surveillance-websocket.ts
const { stats, isConnected, connectionState } = useSurveillanceWebSocket({
  showToastNotifications: true,
});
```

**Features:**
- **Primary**: WebSocket connection to `ws://*/ws/surveillance/alerts/`
- **Fallback**: Automatic polling (30s interval) when WebSocket unavailable
- **Toast notifications**: Destructive toasts for immediate/outbreak alerts
- **Query invalidation**: Auto-invalidates React Query cache on events
- **Status indicator**: `WebSocketStatus` component in page header

**Events Handled:**

| Event | Action |
|-------|--------|
| `surveillance.stats_update` | Updates dashboard stats |
| `surveillance.new_case` | Toast + invalidates cases query |
| `surveillance.immediate_alert` | Destructive toast + invalidates alerts |
| `surveillance.outbreak_alert` | Destructive toast + invalidates thresholds |
| `surveillance.overdue_alert` | Invalidates dashboard |
| `surveillance.case_notified` | Invalidates cases |

### API Response Schemas

All API responses are validated with Zod schemas:

```typescript
// lib/schemas/surveillance.schema.ts
export const SurveillanceDashboardSchema = z.object({ ... });
export const PaginatedNotifiableCaseSchema = z.object({ ... });
export const PaginatedSurveillanceAlertSchema = z.object({ ... });
export const SurveillanceAlertListArraySchema = z.array(...);
export const ExceededThresholdListSchema = z.array(...);

// IHR Notification schemas
export const IHRNotificationListSchema = z.object({ ... });
export const IHRNotificationDetailSchema = z.object({ ... });
export const PaginatedIHRNotificationSchema = z.object({ ... });
export const IHRDashboardSchema = z.object({ ... });
```

**Note**: The `/unacknowledged/` and `/exceeded/` endpoints return plain arrays (not paginated), matching backend implementation.

---

## Changelog

### Version 3.0 (March 2, 2026)
- **IHR Notification Pipeline** — Full WHO IHR 2005 compliance implementation (DHA compliance gap #24)
  - `IHRNotification` model with 30+ fields, 8-status escalation workflow, 6 state-transition methods, 4 computed properties
  - 7 serializers: detail, list, create, + 4 action serializers (submit, escalate, notify WHO, reject, close)
  - `IHRNotificationViewSet` with 8 custom actions and 14 total endpoints
  - `IHRNotificationFilter` with 7 filter fields + search across disease, description, WHO reference, patient MRN/name
  - Django Admin with colored urgency/status/overdue badges, 11 fieldsets
  - Migration `0004_add_ihr_notification.py` with custom permissions (`escalate_ihr_to_county`, `escalate_ihr_to_national`, `notify_ihr_to_who`)
  - ~40 backend tests across 4 test classes covering model, workflow, serializer validation, and API
- **IHR Frontend** — 3 full pages in `web-app/app/(dashboard)/surveillance/ihr/`
  - **List page**: Dashboard summary cards (total, pending, WHO notified, overdue), status/urgency filters, `ResponsiveTable`, pagination, `PullToRefresh`
  - **Detail page**: Visual escalation pipeline with step indicator, context-sensitive action buttons, escalation history timeline, action dialogs with notes input
  - **Create page**: Disease dropdown (IHR-only), urgency selector, WHO Annex 2 decision instrument (4 questions with auto-positive detection), county/sub-county cascading selects, risk assessment
- **Frontend schemas**: `IHRNotificationListSchema`, `IHRNotificationDetailSchema`, `PaginatedIHRNotificationSchema`, `IHRDashboardSchema` with Zod validation
- **Frontend API client**: 12 methods with `parseResponse()` validation
- **Navigation**: Added "IHR Compliance" under Surveillance sidebar group
- **24-hour overdue tracking**: Automatic detection of notifications exceeding IHR Article 6 deadline
- **Audit logging**: All mutating IHR operations logged to AuditLog

### Version 2.3 (February 23, 2026)
- **Frontend WebSocket integration** with polling fallback
  - Created `useSurveillanceWebSocket` hook in `lib/hooks/surveillance-websocket/`
  - Integrated WebSocket status indicator in dashboard and alerts pages
  - Toast notifications for immediate alerts, outbreak alerts
  - Auto query invalidation on WebSocket events
- **API schema fixes**:
  - Fixed `listExceededThresholds` - returns array, not paginated
  - Fixed `listUnacknowledgedAlerts` - returns array, not paginated
  - Added `ExceededThresholdSchema` and `SurveillanceAlertListArraySchema`
- **Dashboard refactor**: Using shared `StatsCard` component
- Updated test coverage for new schemas

### Version 2.2 (February 22, 2026)
- Integrated IDSR Clinicians Handbook (42+ priority diseases)
- **Added 12 new diseases from IDSR Clinicians Handbook:**
  - AEFI (Adverse Events Following Immunization) - IMMEDIATE
  - SARI (Severe Acute Respiratory Infections) - IMMEDIATE (cluster reporting)
  - Acute Jaundice - WEEKLY
  - Methanol Poisoning - IMMEDIATE
  - Smallpox (Variola) - IMMEDIATE (IHR 2005)
  - Diabetes Mellitus - MONTHLY (NCD)
  - Hypertension - MONTHLY (NCD)
  - Cancer (Breast, Cervical, Esophageal, Prostate) - MONTHLY (NCDs)
  - Road Traffic Injuries - MONTHLY
- **Total diseases: 55** (19 immediate, 21 weekly, 15 monthly)
- Added 10 new outbreak thresholds (Acute Jaundice, Brucellosis, Leishmaniasis, Rabies, Schistosomiasis, Influenza, MDR/XDR TB, RVF)
- Enhanced case definitions for Rabies (full symptoms) and Rift Valley Fever (detailed clinical criteria)
- Updated Dracunculiasis (Guinea Worm) with complete handbook case definition
- Schema bumped to v2.2

### Version 2.1 (February 22, 2026)
- Integrated official IDSR Clinicians Booklet case definitions
- Added 3 new diseases: Dracunculiasis (Guinea Worm), Sexually Transmitted Infections, HIV/AIDS
- Total diseases: 43 (16 immediate, 20 weekly, 7 monthly)
- Added `outbreak_thresholds` section with IDSR alert/action thresholds for 18 priority diseases
- Updated case definitions with exact IDSR wording for:
  - Cholera, Yellow Fever, Plague, VHF, Measles, AFP/Polio
  - Meningococcal Meningitis, Neonatal Tetanus, Dracunculiasis
  - Malaria (age-specific), Typhoid, Dysentery, TB
  - Pneumonia (with severe criteria), Diarrhea (dehydration grading)
  - HIV/AIDS (major/minor signs), STIs (syndromes)
- Schema bumped to v2.1

### Version 2.0 (February 22, 2026)
- Enhanced JSON schema with structured case definitions
- Added suspected/confirmed case definition fields
- Added laboratory criteria with specimen, test, turnaround details
- Created PDF extraction helper script (`scripts/extract_case_definitions.py`)
- Added `--dry-run` flag to seed command
- Added Makefile targets (`seed-diseases`, `seed-diseases-update`)
- Integrated into `render.yaml` deployment

### Version 1.0 (February 22, 2026)
- Initial implementation of surveillance module
- 40 MOH 502 diseases seeded
- WebSocket real-time alerts
- Auto-detection via Django signals

---

## Related Documents

- [DHA Compliance Roadmap](dha-compliance-roadmap.md) - Gap 5: Immediate Reportable Diseases, Gap 24: IHR Compliance Framework
- [DPIA](dpia.md) - Data Protection Impact Assessment
- [Disaster Recovery](disaster-recovery.md) - Backup & DR procedures
- [IDSR Weekly Reporting](idsr-weekly-reporting.md) - IDSR report generation and DHIS2 submission

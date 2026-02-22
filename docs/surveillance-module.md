# Disease Surveillance Module

> **MOH 502 Notifiable Disease Reporting for Kenya**
>
> Version: 1.0
> Created: February 22, 2026
> Sprint: Phase 1, Sprint 1.B

---

## Overview

The Disease Surveillance module implements Kenya's Ministry of Health (MOH) 502 notifiable disease reporting requirements. It provides automated disease detection from clinical diagnoses, real-time alerts for immediate reportable diseases, and reporting endpoints for county health offices.

### Key Features

- **Automatic Case Detection**: Diagnoses with ICD-10 codes matching notifiable diseases trigger automatic case creation
- **Real-time WebSocket Alerts**: Immediate notification to surveillance dashboard for critical diseases
- **MOH 502 Disease List**: Pre-seeded with 40 notifiable diseases (15 immediate, 20 weekly, 5 monthly)
- **Outbreak Detection**: Configurable thresholds for automatic outbreak alerts
- **County Reporting**: Reports endpoint for county health offices

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Surveillance Architecture                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  Encounter App   │    │  Surveillance    │                   │
│  │  (Diagnosis)     │───▶│  Signal Handler  │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
│                          ┌────────▼─────────┐                   │
│                          │ SurveillanceService│                  │
│                          │ - Check ICD-10   │                   │
│                          │ - Create Case    │                   │
│                          │ - Generate Alert │                   │
│                          └────────┬─────────┘                   │
│                                   │                              │
│           ┌───────────────────────┼───────────────────────┐     │
│           │                       │                       │     │
│  ┌────────▼────────┐    ┌────────▼────────┐    ┌────────▼────┐ │
│  │   WebSocket     │    │    SMS/Email    │    │  Database   │ │
│  │   Broadcast     │    │    Alerts       │    │  (Cases)    │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
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

## Management Commands

### Seed Notifiable Diseases

```bash
# Seed MOH 502 diseases (first time)
python manage.py seed_notifiable_diseases

# Update existing diseases
python manage.py seed_notifiable_diseases --update

# Clear and reseed
python manage.py seed_notifiable_diseases --clear
```

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

---

## Future Enhancements

- [ ] IDSR Weekly Report generation (Phase 1, Sprint 1.B continued)
- [ ] DHIS2 submission integration
- [ ] Contact tracing workflow
- [ ] Outbreak investigation module
- [ ] IHR notification workflow for international diseases
- [ ] Mobile app push notifications

---

## Related Documents

- [DHA Compliance Roadmap](dha-compliance-roadmap.md) - Gap 5: Immediate Reportable Diseases
- [DPIA](dpia.md) - Data Protection Impact Assessment
- [Disaster Recovery](disaster-recovery.md) - Backup & DR procedures

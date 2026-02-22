# IDSR Weekly Reporting

> **Integrated Disease Surveillance and Response (IDSR) Weekly Reporting Module**
>
> Version: 1.0
> Implemented: February 23, 2026
> Status: ✅ Complete

---

## Overview

The IDSR Weekly Reporting module automates the generation and submission of weekly disease surveillance reports to county health offices and DHIS2/KHIS. It aggregates notifiable disease cases by epidemiological week, following MOH 502 reporting requirements.

### Key Features

- **Automated weekly aggregation** via Celery task (runs Sunday midnight)
- **Epidemiological week calculation** using ISO 8601 standard
- **Per-disease summaries** with age group breakdown (under 5, 5+)
- **Outbreak detection** based on configured thresholds
- **DHIS2 submission** with payload preview and status tracking
- **Report workflow**: Draft → Pending Review → Approved → Submitted

---

## Data Models

### IDSRWeeklyReport

Main model for weekly surveillance reports.

| Field | Type | Description |
|-------|------|-------------|
| `epi_year` | Integer | Epidemiological year (ISO 8601) |
| `epi_week` | Integer | Week number (1-53) |
| `week_start_date` | Date | Monday of the week |
| `week_end_date` | Date | Sunday of the week |
| `facility_code` | String | MFL code or facility identifier |
| `facility_name` | String | Facility name |
| `county` | FK | County for reporting/routing |
| `sub_county` | FK | Sub-county (optional) |
| `total_cases` | Integer | Total notifiable cases this week |
| `total_deaths` | Integer | Total deaths from notifiable diseases |
| `immediate_cases` | Integer | Cases of immediate reportable diseases |
| `lab_confirmed_cases` | Integer | Laboratory confirmed cases |
| `outbreak_declared` | Boolean | Whether outbreak was declared |
| `outbreak_diseases` | Text | Comma-separated outbreak disease names |
| `status` | Choice | DRAFT, PENDING_REVIEW, APPROVED, SUBMITTED, FAILED |
| `dhis2_submitted_at` | DateTime | When submitted to DHIS2 |
| `dhis2_response` | JSON | DHIS2 API response |

### IDSRDiseaseSummary

Per-disease breakdown within a weekly report.

| Field | Type | Description |
|-------|------|-------------|
| `report` | FK | Parent IDSRWeeklyReport |
| `disease` | FK | NotifiableDisease reference |
| `cases_under_5` | Integer | Cases in children under 5 years |
| `cases_5_and_above` | Integer | Cases in patients 5+ years |
| `total_cases` | Integer | Auto-calculated total |
| `deaths_under_5` | Integer | Deaths under 5 |
| `deaths_5_and_above` | Integer | Deaths 5+ |
| `total_deaths` | Integer | Auto-calculated total |
| `lab_confirmed` | Integer | Lab-confirmed cases |
| `case_fatality_rate` | Decimal | CFR percentage (auto-calculated) |
| `is_outbreak` | Boolean | Whether this disease is in outbreak |

---

## API Endpoints

### List Reports
```
GET /api/surveillance/idsr/
```

Query parameters:
- `epi_year` - Filter by epidemiological year
- `epi_week` - Filter by epidemiological week
- `status` - Filter by status (DRAFT, PENDING_REVIEW, APPROVED, SUBMITTED, FAILED)
- `county` - Filter by county ID
- `outbreak` - Filter by outbreak status (true/false)
- `start_date` - Filter by week start date (gte)
- `end_date` - Filter by week end date (lte)

### Retrieve Report
```
GET /api/surveillance/idsr/{id}/
```

Returns full report with disease summaries.

### Generate Report
```
POST /api/surveillance/idsr/generate/
```

Body (optional):
```json
{
  "epi_year": 2026,
  "epi_week": 8
}
```

If year/week not provided, generates report for the previous week.

### Approve Report
```
POST /api/surveillance/idsr/{id}/approve/
```

Body:
```json
{
  "notes": "Reviewed and approved for submission"
}
```

### Submit to DHIS2
```
POST /api/surveillance/idsr/{id}/submit_to_dhis2/
```

Submits an approved report to DHIS2. Report must be in APPROVED status.

### Preview DHIS2 Payload
```
GET /api/surveillance/idsr/{id}/dhis2_preview/
```

Returns the DHIS2 DataValueSet payload without submitting.

### Dashboard Statistics
```
GET /api/surveillance/idsr/dashboard/
```

Returns:
```json
{
  "current_week": {
    "epi_year": 2026,
    "epi_week": 8,
    "week_start": "2026-02-16",
    "week_end": "2026-02-22",
    "has_report": true,
    "report_id": 5,
    "total_cases": 12,
    "status": "DRAFT"
  },
  "previous_weeks": [...],
  "total_reports_this_year": 8,
  "pending_submission": 2,
  "submitted_this_month": 3,
  "outbreak_weeks": 1
}
```

---

## Celery Tasks

### Weekly Report Generation

**Task**: `hmis.apps.surveillance.tasks.generate_idsr_weekly_report`

**Schedule**: Sunday at midnight (Kenya time)

**Configuration** (in `hmis/celery.py`):
```python
"generate-idsr-weekly-report": {
    "task": "hmis.apps.surveillance.tasks.generate_idsr_weekly_report",
    "schedule": crontab(minute=0, hour=0, day_of_week="sunday"),
},
```

### Manual Trigger

```python
from hmis.apps.surveillance.tasks import generate_idsr_weekly_report

# Generate for previous week
result = generate_idsr_weekly_report.delay()

# Generate for specific week
result = generate_idsr_weekly_report.delay(epi_year=2026, epi_week=5)
```

---

## Epidemiological Weeks

The module uses ISO 8601 week numbering:

- **Week 1** contains the first Thursday of the year
- **Weeks run Monday to Sunday**
- A year can have 52 or 53 weeks

Example for 2026:
- W01 2026: Dec 29, 2025 – Jan 4, 2026
- W08 2026: Feb 16, 2026 – Feb 22, 2026

---

## DHIS2 Integration

### Configuration

Add to Django settings:

```python
# DHIS2 API configuration
DHIS2_API_URL = os.getenv("DHIS2_API_URL")  # e.g., https://khis.health.go.ke
DHIS2_USERNAME = os.getenv("DHIS2_USERNAME")
DHIS2_PASSWORD = os.getenv("DHIS2_PASSWORD")
DHIS2_ORG_UNIT = os.getenv("DHIS2_ORG_UNIT")  # Facility org unit ID

# Facility identification
FACILITY_CODE = os.getenv("FACILITY_CODE")  # MFL code
FACILITY_NAME = os.getenv("FACILITY_NAME")
```

### Data Element Mapping

The DHIS2 payload uses data element IDs that must be configured per DHIS2 instance. The current implementation generates placeholder IDs:

```
IDSR_{DISEASE_NAME}_U5_CASES   - Cases under 5
IDSR_{DISEASE_NAME}_O5_CASES   - Cases 5 and above
IDSR_{DISEASE_NAME}_U5_DEATHS  - Deaths under 5
IDSR_{DISEASE_NAME}_O5_DEATHS  - Deaths 5 and above
```

**TODO**: Map to actual Kenya KHIS data element IDs before production deployment.

---

## Frontend UI Requirements

The following UI components are needed to complete the IDSR workflow:

### 1. IDSR Weekly Reports List Page

**Route**: `/surveillance/idsr`

**Features**:
- Table listing all IDSR reports with columns:
  - Week (e.g., "W08 2026")
  - Date Range
  - Total Cases
  - Total Deaths
  - Outbreak (badge)
  - Status (badge with color coding)
  - Actions (View, Approve, Submit)
- Filters: Year, Status, Outbreak
- "Generate Report" button to create new report

### 2. IDSR Report Detail Page

**Route**: `/surveillance/idsr/[id]`

**Features**:
- Report header: Week, facility, status, dates
- Summary cards: Total Cases, Deaths, Lab Confirmed, Outbreak status
- Disease breakdown table:
  - Disease Name
  - Cases <5
  - Cases 5+
  - Total
  - Deaths <5
  - Deaths 5+
  - Total Deaths
  - CFR
  - Outbreak flag
- Action buttons based on status:
  - DRAFT: "Approve" button
  - APPROVED: "Submit to DHIS2" button
  - SUBMITTED: "View DHIS2 Response" modal
- Notes textarea

### 3. IDSR Dashboard Widget

**Location**: Surveillance dashboard or main dashboard

**Features**:
- Current week status card
- Trend chart: Cases by week (last 12 weeks)
- Pending submissions count
- Outbreak weeks this year
- Quick link to generate current week report

### 4. Report Generation Modal/Dialog

**Trigger**: "Generate Report" button on list page

**Features**:
- Option to generate for:
  - Previous week (default)
  - Specific week (year/week picker)
- Show preview of week dates
- Generate button
- Progress indicator

### 5. DHIS2 Preview Modal

**Trigger**: "Preview DHIS2 Payload" button on detail page

**Features**:
- JSON viewer showing the payload
- Copy to clipboard button
- "Submit Now" button

---

## Testing

35 unit tests in `backend/tests/test_idsr_weekly_reporting.py`:

### Model Tests (12 tests)
- IDSRWeeklyReport creation, properties, methods
- IDSRDiseaseSummary auto-calculations
- Unique constraints

### Service Tests (8 tests)
- Epidemiological week calculation
- Report generation and aggregation
- DHIS2 payload preparation

### Celery Task Tests (2 tests)
- Weekly report generation task
- Overdue notification check

### API Endpoint Tests (10 tests)
- List, retrieve, filter reports
- Generate report endpoint
- Approve workflow
- Dashboard statistics

### Serializer Tests (3 tests)
- Report serialization
- Disease summary serialization
- Validation

---

## Migration

The following migration was created:

```
backend/hmis/apps/surveillance/migrations/0002_idsr_weekly_reporting.py
```

Creates:
- `IDSRWeeklyReport` table with indexes on (epi_year, epi_week), status, county
- `IDSRDiseaseSummary` table
- Unique constraint: one report per week per facility

---

## Audit Logging

All IDSR operations are logged to `AuditLog`:

| Action | Description |
|--------|-------------|
| `idsr_report_generate` | Report generated |
| `idsr_report_approve` | Report approved for submission |
| `idsr_report_submit_dhis2` | Report submitted to DHIS2 |

---

## Security Considerations

- All IDSR endpoints require authentication
- Report approval and DHIS2 submission should be restricted to surveillance officers
- DHIS2 credentials stored in environment variables, not in code
- Audit trail maintained for all operations

---

## Related Documentation

- [Surveillance Module](surveillance-module.md) - Disease surveillance overview
- [DHA Compliance Roadmap](dha-compliance-roadmap.md) - Compliance tracking
- [Celery Configuration](../backend/hmis/celery.py) - Task scheduling

---

**Last Updated**: February 23, 2026
**Author**: Backend Team

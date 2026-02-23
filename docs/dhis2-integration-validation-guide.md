# DHIS2 Integration Validation Guide

> **Validating IDSR/Surveillance Integration Before Production KHIS Deployment**
>
> Version: 1.0
> Created: February 23, 2026
> Status: Active

---

## Overview

This guide walks through the process of validating the Vitora HMIS ↔ DHIS2/KHIS integration using a **local DHIS2 instance** before connecting to production Kenya Health Information System (KHIS).

### Why Validate Locally First?

| Risk | Without Local Testing | With Local Testing |
|------|----------------------|-------------------|
| Authentication failures | Discovered in production | Caught early |
| Malformed payloads | Corrupt KHIS data | Fix before submission |
| Missing data elements | 500 errors in production | Create test mappings |
| Org unit mismatches | Reports fail silently | Validate structure |
| Rate limiting issues | Blocked by KHIS | Simulate and handle |

---

## Prerequisites

### System Requirements

- Docker Engine v24+ with Docker Compose v2
- 4 GB RAM minimum (8 GB recommended)
- 2 CPU cores
- 20 GB free disk space

### Verify Docker Installation

```bash
docker -v
docker compose version
```

### Required Knowledge

- Basic Docker operations
- Django management commands
- DHIS2 web interface navigation

---

## Step 1: Start Local DHIS2

### 1.1 Navigate to DHIS2 Directory

```bash
cd /home/thande/dev/vitora/dhis2
```

### 1.2 Create Environment File

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local testing).

### 1.3 Start Services

```bash
docker compose up -d
```

First startup takes **2-5 minutes** as DHIS2 initializes the database.

### 1.4 Monitor Startup

```bash
docker compose logs -f dhis2
```

Wait for: `Server startup in XXXXX ms`

### 1.5 Access DHIS2 Web Interface

- **URL**: http://localhost:8082
- **Username**: `admin`
- **Password**: `district`

> ⚠️ Change the default password immediately if exposing beyond localhost.

---

## Step 2: Configure DHIS2 Test Environment

### 2.1 Create Organisation Unit Hierarchy

Navigate to **Maintenance → Organisation Units** and create:

```
Kenya (Level 1)
└── Test County (Level 2)
    └── Test Sub-County (Level 3)
        └── Test Facility (Level 4)  ← Your test facility
```

**Note the UID** of your test facility (e.g., `Rp268JB6Ne4`).

### 2.2 Create Data Elements for IDSR

Navigate to **Maintenance → Data Elements** and create elements matching your IDSR diseases.

#### Required Data Elements (Test Set)

Create these 24 data elements matching actual IDSR diseases from `backend/data/notifiable_diseases.json`:

**IMMEDIATE Reportable (24-hour)**

| Name | Short Name | Domain | Value Type | Category |
|------|-----------|--------|------------|----------|
| IDSR Cholera Cases Under 5 | IDSR_CHOLERA_U5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR Cholera Cases 5 and Above | IDSR_CHOLERA_O5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR Cholera Deaths Under 5 | IDSR_CHOLERA_U5_DEATHS | Aggregate | Integer | IMMEDIATE |
| IDSR Cholera Deaths 5 and Above | IDSR_CHOLERA_O5_DEATHS | Aggregate | Integer | IMMEDIATE |
| IDSR Measles Cases Under 5 | IDSR_MEASLES_U5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR Measles Cases 5 and Above | IDSR_MEASLES_O5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR Measles Deaths Under 5 | IDSR_MEASLES_U5_DEATHS | Aggregate | Integer | IMMEDIATE |
| IDSR Measles Deaths 5 and Above | IDSR_MEASLES_O5_DEATHS | Aggregate | Integer | IMMEDIATE |
| IDSR AFP (Polio) Cases Under 5 | IDSR_AFP_U5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR AFP (Polio) Cases 5 and Above | IDSR_AFP_O5_CASES | Aggregate | Integer | IMMEDIATE |
| IDSR AFP (Polio) Deaths Under 5 | IDSR_AFP_U5_DEATHS | Aggregate | Integer | IMMEDIATE |
| IDSR AFP (Polio) Deaths 5 and Above | IDSR_AFP_O5_DEATHS | Aggregate | Integer | IMMEDIATE |

**WEEKLY Reportable (168-hour)**

| Name | Short Name | Domain | Value Type | Category |
|------|-----------|--------|------------|----------|
| IDSR Malaria Cases Under 5 | IDSR_MALARIA_U5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Malaria Cases 5 and Above | IDSR_MALARIA_O5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Malaria Deaths Under 5 | IDSR_MALARIA_U5_DEATHS | Aggregate | Integer | WEEKLY |
| IDSR Malaria Deaths 5 and Above | IDSR_MALARIA_O5_DEATHS | Aggregate | Integer | WEEKLY |
| IDSR Typhoid Fever Cases Under 5 | IDSR_TYPHOID_U5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Typhoid Fever Cases 5 and Above | IDSR_TYPHOID_O5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Typhoid Fever Deaths Under 5 | IDSR_TYPHOID_U5_DEATHS | Aggregate | Integer | WEEKLY |
| IDSR Typhoid Fever Deaths 5 and Above | IDSR_TYPHOID_O5_DEATHS | Aggregate | Integer | WEEKLY |
| IDSR Dysentery Cases Under 5 | IDSR_DYSENTERY_U5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Dysentery Cases 5 and Above | IDSR_DYSENTERY_O5_CASES | Aggregate | Integer | WEEKLY |
| IDSR Dysentery Deaths Under 5 | IDSR_DYSENTERY_U5_DEATHS | Aggregate | Integer | WEEKLY |
| IDSR Dysentery Deaths 5 and Above | IDSR_DYSENTERY_O5_DEATHS | Aggregate | Integer | WEEKLY |

> **Note**: This is a test subset. Production requires all 55 notifiable diseases (19 IMMEDIATE, 21 WEEKLY, 15 MONTHLY) from the diseases JSON.

**Pro Tip**: Create Data Element Groups:
- "IDSR Immediate Indicators" - Cholera, Measles, AFP/Polio
- "IDSR Weekly Indicators" - Malaria, Typhoid, Dysentery

### 2.3 Create Dataset for IDSR Weekly Reports

Navigate to **Maintenance → Data Sets**:

1. **Name**: IDSR Weekly Report
2. **Short Name**: IDSR Weekly
3. **Period Type**: Weekly
4. **Data Elements**: Add all IDSR data elements created above
5. **Organisation Units**: Assign to your test facility

### 2.4 Record UIDs for Mapping

After creating data elements, query their UIDs via API:

```bash
curl -u admin:district \
  "http://localhost:8082/api/dataElements.json?filter=name:ilike:IDSR&fields=id,name,shortName&paging=false"
```
Or use session-based API access - while logged into the browser at http://localhost:8082, navigate directly to:
`http://localhost:8082/api/dataElements.json?filter=name:ilike:IDSR&fields=id,name,shortName&paging=false`
Or export via UI: Maintenance → Data Elements → Export → JSON
**Actual UIDs from local DHIS2** (retrieved February 23, 2026):

| Element | UID | Short Name |
|---------|-----|------------|
| **Organisation Unit** | | |
| Test Facility | `lZtlGVzHnKF` | - |
| **IMMEDIATE - Cholera** | | |
| IDSR Cholera Cases Under 5 | `jOdkuwpQGKX` | IDSR_CHOLERA_U5_CASES |
| IDSR Cholera Cases 5 and Above | `sHSlCXKo0FA` | IDSR_CHOLERA_O5_CASES |
| IDSR Cholera Deaths Under 5 | `mMa4lFXGpUP` | IDSR_CHOLERA_U5_DEATHS |
| IDSR Cholera Deaths 5 and Above | `Px7MhFr80Sb` | IDSR_CHOLERA_O5_DEATHS |
| **IMMEDIATE - Measles** | | |
| IDSR Measles Cases Under 5 | `sfLYRMo5ahz` | IDSR_MEASLES_U5_CASES |
| IDSR Measles Cases 5 and Above | `In3T4jcHIdi` | IDSR_MEASLES_O5_CASES |
| IDSR Measles Deaths Under 5 | `x8ljy7lW0k6` | IDSR_MEASLES_U5_DEATHS |
| IDSR Measles Deaths 5 and Above | `eWJ7Rrik4ul` | IDSR_MEASLES_O5_DEATHS |
| **IMMEDIATE - AFP/Polio** | | |
| IDSR AFP Cases Under 5 | `aB4mpXe2PKg` | IDSR_AFP_U5_CASES |
| IDSR AFP Cases 5 and Above | `Skan0yaIMoW` | IDSR_AFP_O5_CASES |
| IDSR AFP Deaths Under 5 | `c4ANCB4y05s` | IDSR_AFP_U5_DEATHS |
| IDSR AFP Deaths 5 and Above | `ZE5keDly4gM` | IDSR_AFP_O5_DEATHS |
| **WEEKLY - Malaria** | | |
| IDSR Malaria Cases Under 5 | `Nk7e48O4DJF` | IDSR_MALARIA_U5_CASES |
| IDSR Malaria Cases 5 and Above | `OknnGNIlQJg` | IDSR_MALARIA_O5_CASES |
| IDSR Malaria Deaths Under 5 | `aR3Fj0vZ6mA` | IDSR_MALARIA_U5_DEATHS |
| IDSR Malaria Deaths 5 and Above | `oH5O2zkKIi9` | IDSR_MALARIA_O5_DEATHS |
| **WEEKLY - Typhoid** | | |
| IDSR Typhoid Cases Under 5 | `wdmX1DIQbBz` | IDSR_TYPHOID_U5_CASES |
| IDSR Typhoid Cases 5 and Above | `HrgJjgpv3Dc` | IDSR_TYPHOID_O5_CASES |
| IDSR Typhoid Deaths Under 5 | `Ft6oBCgoysd` | IDSR_TYPHOID_U5_DEATHS |
| IDSR Typhoid Deaths 5 and Above | `WaX8n6EB2qK` | IDSR_TYPHOID_O5_DEATHS |
| **WEEKLY - Dysentery** | | |
| IDSR Dysentery Cases Under 5 | `XzL71mHZg8Y` | IDSR_DYSENTERY_U5_CASES |
| IDSR Dysentery Cases 5 and Above | `Qe9SjNR5lAX` | IDSR_DYSENTERY_O5_CASES |
| IDSR Dysentery Deaths Under 5 | `hwNA81DRmCr` | IDSR_DYSENTERY_U5_DEATHS |
| IDSR Dysentery Deaths 5 and Above | `Vap87Ar0Nxi` | IDSR_DYSENTERY_O5_DEATHS |

> **Pro Tip**: Export this as CSV from DHIS2 Maintenance → Data Elements → Export.

---

## Step 3: Configure Backend

### 3.1 Update Backend Environment

Edit the **root** `.env` file (NOT `backend/.env` - Django loads from project root):

```env
# DHIS2 Integration (Local Testing)
DHIS2_API_URL=http://localhost:8082
DHIS2_USERNAME=admin
DHIS2_PASSWORD=district
DHIS2_ORG_UNIT=lZtlGVzHnKF

# Facility Identification
FACILITY_CODE=TEST001
FACILITY_NAME=Test Health Facility
```

### 3.2 Data Element Mapping (Hybrid Approach)

Vitora uses a **hybrid mapping system** for maximum flexibility:

| Source | Location | Use Case |
|--------|----------|----------|
| **JSON File** | `backend/data/dhis2_element_mappings.json` | Version-controlled defaults |
| **Database** | `DHIS2DataElementMapping` model | Runtime updates via admin |

**Lookup priority**: Database → JSON (database overrides JSON)

#### 3.2.1 JSON Mappings (Default)

The JSON file contains version-controlled mappings:

```bash
# View/edit mappings
cat backend/data/dhis2_element_mappings.json
```

```json
{
  "_metadata": {
    "environment": "local",
    "last_updated": "2026-02-23"
  },
  "org_unit": {
    "uid": "lZtlGVzHnKF",
    "name": "Test Facility"
  },
  "data_elements": {
    "cholera": {
      "cases_under_5": "jOdkuwpQGKX",
      "cases_5_and_above": "sHSlCXKo0FA",
      "deaths_under_5": "mMa4lFXGpUP",
      "deaths_5_and_above": "Px7MhFr80Sb"
    },
    "measles": {...},
    "malaria": {...}
  }
}
```

#### 3.2.2 Database Mappings (Admin UI)

Manage mappings via Django admin without code changes:

1. **Access Admin**: `http://localhost:9088/admin/surveillance/dhis2dataelementmapping/`
2. **Add Mapping**: Click "Add DHIS2 Data Element Mapping"
3. **Fields**:
   - **Disease**: Select from NotifiableDisease list
   - **Indicator Type**: cases_under_5, cases_5_and_above, etc.
   - **Environment**: local / staging / production
   - **Data Element UID**: 11-character DHIS2 UID
   - **Is Active**: Toggle to enable/disable

**Admin Features**:
- **List editable**: Edit UIDs directly in list view
- **Filter by**: Environment, indicator type, disease category
- **Bulk actions**: Duplicate to production, export as JSON

#### 3.2.3 Import JSON to Database

Populate database from JSON defaults:

```bash
cd backend
poetry shell

python manage.py shell -c "
from hmis.apps.surveillance.dhis2_mappings import sync_json_to_database
result = sync_json_to_database(environment='local')
print(f'Created: {result[\"created\"]}, Updated: {result[\"updated\"]}, Errors: {result[\"errors\"]}')
"
```

#### 3.2.4 Using Mappings in Code

```python
from hmis.apps.surveillance.dhis2_mappings import (
    get_data_element_uid,
    get_all_mappings,
    validate_mappings,
)

# Get single UID
uid = get_data_element_uid("Cholera", "cases_under_5", "local")
# Returns: "jOdkuwpQGKX"

# Get all mappings for payload generation
mappings = get_all_mappings("local")
# Returns: {"cholera": {"cases_under_5": "jOdkuwpQGKX", ...}, ...}

# Validate all diseases are mapped
result = validate_mappings("local")
if not result["valid"]:
    print(f"Missing: {result['missing']}")
```

### 3.3 Update DHIS2 Service to Use Mappings

Ensure your DHIS2 submission service uses the mapping module instead of placeholder IDs.

---

## Step 4: Run Integration Tests

### 4.1 Generate Test IDSR Report

```bash
cd backend
poetry shell

# Generate report for previous week
python manage.py shell -c "
from hmis.apps.surveillance.tasks import generate_idsr_weekly_report
result = generate_idsr_weekly_report()
print(f'Generated report: {result}')
"
```

### 4.2 Preview DHIS2 Payload

```bash
# Via Django shell
python manage.py shell -c "
from hmis.apps.surveillance.models import IDSRWeeklyReport
from hmis.apps.surveillance.services import generate_dhis2_payload

report = IDSRWeeklyReport.objects.latest('created_at')
payload = generate_dhis2_payload(report)
import json
print(json.dumps(payload, indent=2))
"
```

Or via API:

```bash
# Get the report ID first
curl -X GET http://localhost:9088/api/surveillance/idsr/ \
  -H "Authorization: Bearer <token>"

# Preview payload
curl -X GET http://localhost:9088/api/surveillance/idsr/{id}/dhis2_preview/ \
  -H "Authorization: Bearer <token>"
```

### 4.3 Submit to Local DHIS2

```bash
# Approve the report first
curl -X POST http://localhost:9088/api/surveillance/idsr/{id}/approve/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"notes": "Test approval"}'

# Submit to DHIS2
curl -X POST http://localhost:9088/api/surveillance/idsr/{id}/submit_to_dhis2/ \
  -H "Authorization: Bearer <token>"
```

### 4.4 Verify in DHIS2

1. Navigate to **Data Entry** in DHIS2
2. Select your test org unit, dataset (IDSR Weekly), and period
3. Verify values were imported correctly

Or via DHIS2 API:

```bash
curl -u admin:district \
  "http://localhost:8082/api/dataValueSets?orgUnit=Rp268JB6Ne4&period=2026W08&dataSet=<dataset_uid>"
```

---

## Step 5: Validation Checklist

### Authentication & Connectivity

- [ ] Backend can reach DHIS2 at configured URL
- [ ] Basic Auth credentials are accepted
- [ ] API version is compatible (v2.40)

### Payload Structure

- [ ] DataValueSet JSON is valid
- [ ] Period format is correct (`2026W08` for weekly)
- [ ] Org unit UID is valid
- [ ] All data element UIDs are valid
- [ ] Value types match (Integer for case counts)

### Data Integrity

- [ ] Case counts match local database
- [ ] Age group breakdowns are correct
- [ ] Death counts are included
- [ ] Lab-confirmed counts are accurate

### Error Handling

- [ ] Invalid credentials return 401
- [ ] Invalid org unit returns meaningful error
- [ ] Invalid data element returns meaningful error
- [ ] Network timeout is handled gracefully
- [ ] Partial failures are tracked

### Workflow

- [ ] Draft reports can be previewed
- [ ] Approval workflow enforces status
- [ ] Submitted reports record `dhis2_submitted_at`
- [ ] DHIS2 response is stored in `dhis2_response`
- [ ] Failed submissions can be retried

### Audit Trail

- [ ] Submission attempts are logged
- [ ] User who submitted is recorded
- [ ] Timestamps are accurate

---

## Step 6: Troubleshooting

### DHIS2 Won't Start

```bash
# Check container status
docker compose ps

# View detailed logs
docker compose logs dhis2 --tail 100

# Common fix: increase memory
docker compose down
# Edit compose.yml to add memory limits
docker compose up -d
```

### Connection Refused

```bash
# Verify DHIS2 is running
curl http://localhost:8082/api/system/info

# Check if port is bound
ss -tlnp | grep 8082
```

### Authentication Failures

```bash
# Test credentials directly
curl -u admin:district http://localhost:8082/api/me

# Common issues:
# - Wrong password (default is 'district', not 'admin')
# - Account locked after failed attempts
```

### Data Element Not Found

```bash
# List all data elements
curl -u admin:district \
  "http://localhost:8082/api/dataElements.json?fields=id,name&paging=false"

# Search for specific element
curl -u admin:district \
  "http://localhost:8082/api/dataElements.json?filter=name:ilike:cholera"
```

### Import Errors

```bash
# Get import summary
curl -u admin:district \
  "http://localhost:8082/api/system/tasks/DATAVALUE_IMPORT"

# Check data value conflicts
curl -u admin:district \
  "http://localhost:8082/api/dataValueSets?orgUnit=XXX&period=2026W08&dataSet=YYY"
```

---

## Step 7: Transition to Production KHIS

### 7.1 Obtain KHIS Credentials

Request access from county/MOH health records office:
- KHIS username and password
- Org unit UID for your facility
- Data element UIDs for MOH 505/IDSR indicators

### 7.2 Query KHIS Data Elements

```bash
# Replace credentials and URL with KHIS values
curl -u "$KHIS_USER:$KHIS_PASS" \
  "https://hiskenya.org/api/dataElements.json?filter=name:ilike:IDSR&fields=id,name&paging=false"
```

### 7.3 Update Production Mappings

Replace placeholder UIDs in `dhis2_mappings.py` with actual KHIS UIDs.

### 7.4 Update Production Environment

```env
DHIS2_API_URL=https://hiskenya.org
DHIS2_USERNAME=<facility_user>
DHIS2_PASSWORD=<facility_password>
DHIS2_ORG_UNIT=<facility_org_unit_uid>
```

### 7.5 Production Checklist

- [ ] All data element UIDs mapped to KHIS
- [ ] Org unit matches facility MFL code
- [ ] HTTPS connection verified
- [ ] Rate limiting understood and handled
- [ ] Backup submission mechanism documented
- [ ] County health office notified of go-live

---

## Appendix A: DHIS2 API Quick Reference

### System Information
```
GET /api/system/info
```

### Current User
```
GET /api/me
```

### Organisation Units
```
GET /api/organisationUnits?fields=id,name,level&paging=false
```

### Data Elements
```
GET /api/dataElements?fields=id,name,valueType&paging=false
```

### Submit Data Values
```
POST /api/dataValueSets
Content-Type: application/json

{
  "dataSet": "dataset_uid",
  "period": "2026W08",
  "orgUnit": "org_unit_uid",
  "dataValues": [
    {"dataElement": "de_uid", "value": "5"},
    ...
  ]
}
```

### Check Import Status
```
GET /api/system/tasks/DATAVALUE_IMPORT/{task_id}
```

---

## Appendix B: Common DHIS2 Period Formats

| Period Type | Format | Example |
|-------------|--------|---------|
| Daily | YYYYMMDD | 20260223 |
| Weekly | YYYYWn | 2026W08 |
| Monthly | YYYYMM | 202602 |
| Quarterly | YYYYQn | 2026Q1 |
| Yearly | YYYY | 2026 |

---

## Appendix C: Related Documentation

- [IDSR Weekly Reporting Module](idsr-weekly-reporting.md)
- [Surveillance Module](surveillance-module.md)
- [DHIS2 Local Setup README](../dhis2/readme.md)
- [DHIS2 Developer Documentation](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-240/introduction.html)
- [Kenya KHIS Portal](https://hiskenya.org)

---

**Maintainer**: Vitora Engineering Team  
**Last Updated**: February 23, 2026

# Business Intelligence Integration — Single Source of Truth

> **Status**: All 4 phases complete + permissions & multi-scope endpoints
> **Last Updated**: April 11, 2026

---

## Overview

The BI integration provides facility-level operational intelligence, automated Kenya MOH reporting (705/711/717), and embedded Metabase dashboards for ad-hoc exploration. Data flows from transactional tables through a nightly ETL pipeline into pre-aggregated analytics models, which are consumed by both the built-in dashboards and Metabase.

**Access Control**: All analytics endpoints require authentication plus `CanViewAnalytics` permission (ADMIN, MANAGEMENT, CLINICAL_SENIOR, DOC, DOCTOR, NURSING_MGR, HEAD_NURSE, MEDICAL_OFFICER, FACILITY_ADMIN roles). Platform-wide endpoints require superuser access (`IsSuperUser`). See `hmis/apps/analytics/permissions.py`.

**Architecture:**

```
Transactional Data                Analytics Data              Presentation
───────────────────────           ─────────────────           ─────────────────
Encounter, Diagnosis,     ETL     FacilityDailySummary        Built-in Charts
Patient, Invoice,     ─────────►  DepartmentMonthlySummary ──► (Recharts)
LabOrder, Admission,   Celery     DiagnosisTrend              
Prescription, Triage    nightly   PatientDemographicSnapshot   Metabase Embeds
                                                            ──► (iframe)
                        ETL
                    ─────────►  MOH705Report                  MOH Reports UI
                      Celery    MOH711Report               ──► (list/detail)
                      monthly   MOH717Report
```

---

## Phase Summary

| Phase | Name | Status | Key Deliverables |
|-------|------|--------|------------------|
| **A** | Analytics Schema & ETL Pipeline | ✅ Complete | 4 aggregate models, ETL services, Celery tasks, API |
| **B** | Enhanced Operational Dashboards | ✅ Complete | Analytics page with KPIs, charts, department table, demographics |
| **C** | MOH Automated Reporting | ✅ Complete | MOH 705/711/717 generators, DHIS2 preview, approve/submit workflow |
| **D** | Metabase Embedded Analytics | ✅ Complete | Signed JWT embedding, ACA deployment, Explore tab |
| **E** | Permissions & Multi-Scope Endpoints | ✅ Complete | `CanViewAnalytics`, org-level, platform-wide endpoints, enhanced demographics |

---

## Environment Variables

### Backend (Django)

| Env Var | Local Dev | Staging | Description |
|---------|-----------|---------|-------------|
| `METABASE_SITE_URL` | `http://localhost:3333` | `https://metabase.staging.vitora.digital` | Browser-accessible Metabase URL (becomes iframe `src`) |
| `METABASE_EMBEDDING_SECRET` | *(set in .env)* | *(set in ACA)* | Shared secret with Metabase for signing embed JWTs. Must match `MB_EMBEDDING_SECRET_KEY` |

### Metabase Container

| Env Var | Value | Description |
|---------|-------|-------------|
| `MB_DB_TYPE` | `postgres` (staging) / `h2` (local) | Metabase's own app database type |
| `MB_DB_HOST` | `ep-patient-cake-almonm9l.c-3.eu-central-1.aws.neon.tech` | Direct Neon endpoint (NOT pooler) |
| `MB_DB_DBNAME` | `metabase` | Separate database for Metabase internal state |
| `MB_DB_USER` | `neondb_owner` | Neon database user |
| `MB_DB_PORT` | `5432` | Standard Postgres port |
| `MB_EMBEDDING_SECRET_KEY` | *(same as METABASE_EMBEDDING_SECRET)* | Must match Django's signing secret |
| `MB_SITE_URL` | `https://metabase.staging.vitora.digital` | Metabase's own public URL |
| `MB_ENABLE_EMBEDDING` | `true` | Enables signed embedding feature |
| `JAVA_TIMEZONE` | `Africa/Nairobi` | Kenya timezone for correct date handling |

> **Important**: Metabase must use the **direct** Neon endpoint (no `-pooler` suffix) for its app DB, because PgBouncer (pooler) doesn't support the DDL operations Metabase needs for migrations.

---

## Azure Container Apps Deployment

| App Name | Image | Port | Resource Group | URL |
|----------|-------|------|----------------|-----|
| `vitora-api` | Custom Django | 9088 | `vitora-rg` | `vitora-api.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` |
| `vitora-metabase` | `metabase/metabase:latest` | 3000 | `vitora-rg` | `vitora-metabase.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` |

**Custom domain** (pending DNS setup): `metabase.staging.vitora.digital`

DNS records needed at your DNS provider:

| Type | Name | Value |
|------|------|-------|
| CNAME | `metabase.staging` | `vitora-metabase.agreeabledune-6cc420cc.eastus.azurecontainerapps.io` |
| TXT | `asuid.metabase.staging` | `A6D0BCEA58026FED3BA56DEBE763C5A2C001904BE6C6ACC2885ED58D3CFB4060` |

---

## Backend: Analytics App

### Permissions (`hmis/apps/analytics/permissions.py`)

| Class | Access Rule | Used By |
|-------|-------------|---------|
| `CanViewAnalytics` | Superusers, `is_staff`, or roles: ADMIN, MANAGEMENT, CLINICAL_SENIOR, DOC, DOCTOR, NURSING_MGR, HEAD_NURSE, MEDICAL_OFFICER, FACILITY_ADMIN (+ MANAGEMENT category) | All analytics & MOH reporting endpoints |
| `IsSuperUser` | Superusers only | Platform-wide cross-tenant endpoints |

### Models (`hmis/apps/analytics/models.py`)

| Model | Scope | Grain | Key Fields |
|-------|-------|-------|------------|
| `FacilityDailySummary` | Facility | 1 row/facility/day | encounters (OPD/IPD/Emergency), revenue (cash/mpesa/insurance), lab, pharmacy, triage, bed occupancy, return_patients, walk_ins, referral_ins, clinic_referrals, follow_up_encounters |
| `DepartmentMonthlySummary` | Facility | 1 row/facility/dept/month | visit_count, unique_patients, revenue, top_diagnoses (JSON), avg_length_of_stay_days |
| `DiagnosisTrend` | Facility | 1 row/ICD-10/period | icd10_code, case_count, age_band_breakdown (JSON), gender_breakdown (JSON) |
| `PatientDemographicSnapshot` | Facility | 1 row/facility/date | total_patients, age_distribution (JSON), gender_distribution (JSON), county_distribution (JSON), referral_source_distribution (JSON), new_vs_return (JSON), insurance_coverage (JSON) |

All models inherit `FacilityScopedModel` + `TimeStampedModel`.

### ETL Services (`hmis/apps/analytics/services.py`)

| Function | Input | Output | Called By |
|----------|-------|--------|-----------|
| `compute_daily_summary(facility, date)` | Facility + date | Creates/updates `FacilityDailySummary` (includes return patients, walk-ins, referrals, follow-ups) | `refresh_daily_analytics` task |
| `compute_department_monthly(facility, year, month)` | Facility + year/month | Creates/updates `DepartmentMonthlySummary` per dept | `refresh_monthly_analytics` task |
| `compute_diagnosis_trends(facility, start, end, granularity)` | Facility + date range | Creates/updates `DiagnosisTrend` per ICD-10 code | `refresh_monthly_analytics` task |
| `compute_demographics_snapshot(facility, date)` | Facility + date | Creates/updates `PatientDemographicSnapshot` (includes referral source, new vs return, insurance coverage) | `refresh_demographics_snapshot` task |

### Celery Tasks & Schedule

| Task | Schedule | Queue | Description |
|------|----------|-------|-------------|
| `refresh_daily_analytics` | Daily at 02:00 UTC | `reporting` | Aggregates previous day's data |
| `refresh_monthly_analytics` | 1st of month at 03:00 UTC | `reporting` | Department + diagnosis aggregation |
| `refresh_demographics_snapshot` | 1st of month at 04:00 UTC | `reporting` | Patient population snapshot |

**Backfill command**: `python manage.py backfill_analytics --start 2026-01-01 --end 2026-04-10`

### API Endpoints

All under `/api/analytics/`:

#### Facility-Level (Tenant-Scoped)

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `facility-summary/` | GET | `CanViewAnalytics` | List facility daily summaries (filterable: `date_from`, `date_to`) |
| `facility-summary/{id}/` | GET | `CanViewAnalytics` | Single summary detail |
| `department-performance/` | GET | `CanViewAnalytics` | List department monthly summaries (filterable: `year`, `month`, `department`) |
| `diagnosis-trends/` | GET | `CanViewAnalytics` | List diagnosis trends (filterable: `granularity`, `icd10_code`, `date_from`, `date_to`, `top_n`) |
| `demographics/` | GET | `CanViewAnalytics` | List demographic snapshots |
| `metabase-embed/` | GET | `CanViewAnalytics` | Generate signed Metabase embed URL (`?resource_type=dashboard&resource_id=1`) |

#### Organization-Level (Cross-Facility)

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `org/facility-summary/` | GET | `CanViewAnalytics` | Daily summaries across all org facilities |
| `org/department-performance/` | GET | `CanViewAnalytics` | Department performance across all org facilities |
| `org/diagnosis-trends/` | GET | `CanViewAnalytics` | Diagnosis trends across all org facilities |
| `org/demographics/` | GET | `CanViewAnalytics` | Demographics across all org facilities |

#### Platform-Wide (Nexora Superusers Only)

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `platform/facility-summary/` | GET | `IsSuperUser` | Daily summaries across all tenants |
| `platform/department-performance/` | GET | `IsSuperUser` | Department performance across all tenants |
| `platform/diagnosis-trends/` | GET | `IsSuperUser` | Diagnosis trends across all tenants |
| `platform/demographics/` | GET | `IsSuperUser` | Demographics across all tenants |

All endpoints require authentication. Facility-level endpoints use `TenantScopedViewMixin` with `X-Facility-Id` header. Organization-level uses `tenant_scope = "organization"`. Platform-wide has no tenant scoping.

### Metabase Embed Endpoint

`GET /api/analytics/metabase-embed/?resource_type=dashboard&resource_id=1`

- Signs a JWT (HS256, 10-min expiry) with `METABASE_EMBEDDING_SECRET`
- Automatically injects `facility_id` from user's staff profile for data sandboxing
- Returns `{ "embed_url": "https://metabase.../embed/dashboard/{token}#bordered=false&titled=true" }`
- Returns 503 if `METABASE_EMBEDDING_SECRET` is not configured

---

## Backend: MOH Reporting App

### Models (`hmis/apps/moh_reporting/models.py`)

| Model | Description |
|-------|-------------|
| `AbstractMOHReport` | Base: facility, period_start/end, status (DRAFT→APPROVED→SUBMITTED/FAILED), approved_by, notes |
| `MOH705Report` | Outpatient morbidity — total visits, under-5/5-and-above counts |
| `MOH705DiseaseRow` | Per-disease row: ICD-10 chapter, disease name, under-5/5-and-above case counts |
| `MOH711Report` | Integrated RH/HIV/Malaria — deliveries, malaria cases, HIV tests, family planning |
| `MOH717Report` | Workload summary — OPD, admissions, discharges, surgeries, emergency visits, lab tests, imaging, pharmacy |
| `MOHDataElementMapping` | Maps report fields to DHIS2 data element UIDs for submission |

### Report Generation Services

| Generator | Aggregates From |
|-----------|----------------|
| `MOH705Generator` | `Encounter` + `Diagnosis` → ICD-10 chapter grouping with age-band (<5, ≥5) |
| `MOH711Generator` | `Encounter` (deliveries, malaria dx), `Admission`, plus RH/HIV indicators |
| `MOH717Generator` | `Encounter`, `Admission`, `LabOrder`, `Prescription`, `Encounter` (imaging/surgery) |

### Celery Tasks

| Task | Schedule | Queue |
|------|----------|-------|
| `generate_moh705_monthly` | 2nd of month at 05:00 UTC | `reporting` |
| `generate_moh711_monthly` | 2nd of month at 05:30 UTC | `reporting` |
| `generate_moh717_monthly` | 2nd of month at 06:00 UTC | `reporting` |

### API Endpoints

All under `/api/moh-reports/`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `705/` | GET | List MOH 705 reports |
| `705/{id}/` | GET | Detail |
| `705/generate/` | POST | Generate new report (optional: `year`, `month`) |
| `705/{id}/approve/` | POST | Approve report (sets status=APPROVED) |
| `705/{id}/submit-to-dhis2/` | POST | Submit to DHIS2 |
| `705/{id}/dhis2-preview/` | GET | Preview DHIS2 payload |
| `711/`, `711/{id}/`, `711/generate/`, `711/{id}/approve/`, etc. | — | Same pattern |
| `717/`, `717/{id}/`, `717/generate/`, `717/{id}/approve/`, etc. | — | Same pattern |

---

## Frontend: File Reference

### Analytics Dashboard

| File | Purpose |
|------|---------|
| `lib/types/analytics.ts` | TypeScript interfaces: `FacilityDailySummary` (incl. return_patients, walk_ins, referral_ins, follow_up_encounters), `DepartmentMonthlySummary`, `DiagnosisTrend`, `PatientDemographicSnapshot` (incl. referral_source_distribution, new_vs_return, insurance_coverage), `MetabaseEmbedResponse` |
| `lib/schemas/analytics.schema.ts` | Zod validation schemas for all analytics API responses (matches TypeScript types) |
| `lib/api/analytics.ts` | API client: `getFacilitySummary`, `getDepartmentPerformance`, `getDiagnosisTrends`, `getDemographics`, `getMetabaseEmbedUrl` |
| `lib/hooks/use-analytics.ts` | React Query hooks: `useFacilitySummary`, `useDepartmentPerformance`, `useDiagnosisTrends`, `useDemographics`, `useMetabaseEmbedUrl` |
| `components/analytics/analytics-dashboard.tsx` | Main dashboard: KPI cards (encounters, revenue, labs, pharmacy, return rate, follow-ups, walk-ins, referrals), encounter volume line chart with 3-day projection, revenue stacked bar, top 10 diagnoses (bar/pie toggle), gender donut, referral source donut, new vs returning donut, insurance coverage donut, age distribution bar, department table |
| `components/analytics/analytics-page-content.tsx` | Tabbed wrapper: Dashboard tab + Explore (Metabase) tab |
| `components/analytics/metabase-embed.tsx` | Metabase iframe with loading/error states, 503 "not configured" handling |
| `app/(dashboard)/analytics/page.tsx` | Next.js page with PageHeader |

### MOH Reports

| File | Purpose |
|------|---------|
| `lib/types/moh-reporting.ts` | TypeScript interfaces: `MOH705Report`, `MOH711Report`, `MOH717Report`, etc. |
| `lib/schemas/moh-reporting.schema.ts` | Zod schemas for all MOH report API responses |
| `lib/api/moh-reports.ts` | API client: list/get/generate/approve/submit/preview for each report type |
| `lib/hooks/use-moh-reports.ts` | React Query hooks for all report operations |
| `components/moh-reports/moh-reports-dashboard.tsx` | Tabbed list (705/711/717) with generate buttons, status badges, row click → detail |
| `app/(dashboard)/reports/moh/page.tsx` | Dashboard page |
| `app/(dashboard)/reports/moh/[type]/page.tsx` | Redirect to dashboard (types are tabs, not separate routes) |
| `app/(dashboard)/reports/moh/[type]/[id]/page.tsx` | Report detail: data display, approve action, DHIS2 submit, payload preview |

### Navigation

| Sidebar Entry | Route | Module Key | Permission |
|---------------|-------|------------|------------|
| Analytics | `/analytics` | `analytics` | All authenticated users |
| MOH Reports | `/reports/moh` | `moh_reporting` | All authenticated users |

---

## Docker Compose (`backend/compose.yml`)

```yaml
metabase:
  image: metabase/metabase:latest
  container_name: vitora-metabase
  environment:
    MB_JETTY_PORT: "3000"
    MB_DB_TYPE: "${MB_DB_TYPE:-h2}"              # h2 for local, postgres for staging
    MB_DB_HOST: "${MB_DB_HOST:-}"                # Direct Neon endpoint (no pooler)
    MB_DB_DBNAME: "${MB_DB_DBNAME:-}"            # "metabase" database
    MB_EMBEDDING_SECRET_KEY: "${METABASE_EMBEDDING_SECRET:-changeme-in-production}"
    MB_SITE_URL: "${METABASE_SITE_URL:-http://localhost:3333}"
    MB_ENABLE_EMBEDDING: "true"
    JAVA_TIMEZONE: "Africa/Nairobi"
  ports:
    - "3333:3000"
  volumes:
    - metabase-data:/metabase-data
```

---

## Testing

### Backend Tests

| Test File | Count | Coverage |
|-----------|-------|----------|
| `tests/analytics/test_models.py` | 11 | Model CRUD, unique constraints, ordering |
| `tests/analytics/test_services.py` | 18 | ETL logic, age bands, all 4 compute functions |
| `tests/analytics/test_api.py` | — | Auth, filtering, tenant isolation |
| `tests/analytics/test_tasks.py` | 5 | Task execution, defaults |
| `tests/analytics/test_metabase_embed.py` | 10 | JWT signing, auth, validation, 503 handling |
| `tests/analytics/test_permissions.py` | 23 | CanViewAnalytics role checks, org-level access, platform superuser access |
| `tests/moh_reporting/test_models.py` | — | MOH report model tests |
| `tests/moh_reporting/test_services.py` | — | Generator logic tests |
| `tests/moh_reporting/test_api.py` | — | API endpoint tests |
| `tests/moh_reporting/test_tasks.py` | — | Celery task tests |

**Run**: `cd backend && poetry run pytest tests/analytics/ tests/moh_reporting/ --no-header -q`

### Frontend

TypeScript compilation: `cd web-app && npx tsc --noEmit` (0 errors)

---

## Troubleshooting

### Analytics data is empty

```bash
# Backfill historical data
cd backend
poetry run python manage.py backfill_analytics --start 2026-01-01 --end 2026-04-10

# Or trigger manually for a specific date
poetry run python -c "
from hmis.apps.analytics.tasks import refresh_daily_analytics
refresh_daily_analytics('2026-04-09')
"
```

### Metabase embed returns 503

- `METABASE_EMBEDDING_SECRET` is empty or not set
- Set it in `.env` (local) or ACA environment variables (staging)

### Metabase iframe shows "Message not allowed"

- `METABASE_SITE_URL` doesn't match the actual Metabase URL
- Embedding is not enabled in Metabase admin (should be auto-enabled via `MB_ENABLE_EMBEDDING=true`)

### Metabase iframe shows "localhost refused to connect"

- In VS Code remote development, port 3333 must be **forwarded** through the remote tunnel
- Open VS Code Ports panel (Ctrl+Shift+P → "Forward a Port") and forward port 3333
- Verify Metabase is running: `curl http://localhost:3333/api/health` on the server should return `{"status":"ok"}`
- In production, `METABASE_SITE_URL` must point to the browser-accessible URL (e.g., `https://metabase.staging.vitora.digital`)

### MOH reports show zero counts

- No encounters/diagnoses exist for the requested period
- Run: `poetry run python manage.py shell -c "from hmis.apps.encounters.models import Encounter; print(Encounter.objects.count())"`

### Celery tasks not running

- Redis must be running for Celery broker
- Start worker: `celery -A hmis worker -Q reporting --loglevel=info`
- Start beat: `celery -A hmis beat --loglevel=info`

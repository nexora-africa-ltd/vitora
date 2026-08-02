# ICU/HDU/NBU Phase 3 Rollout Runbook

> Scope: Production rollout hardening for ICU/HDU/NBU pathways
> Last Updated: August 2026

---

## 1. Rollout Strategy (Feature Flags)

Roll out by facility cohort in this order:

1. Pilot facilities (1-2 branches)
2. Regional facilities with ICU/HDU capacity
3. Full network rollout

Facility flags to enable per cohort:

- `has_icu`
- `has_hdu`
- `has_nbu`

Validation gates before promoting to next cohort:

- No transfer-validation error spike for `STEP_UP`/`STEP_DOWN`
- Critical-care workflow health endpoint returns expected metrics
- Ward provisioning and bed availability for ICU/HDU/NBU confirmed

---

## 2. Migration Runbook + Rollback

Apply migrations:

```bash
python manage.py migrate
```

Required migrations for ICU/HDU/NBU rollout:

- `backend/hmis/apps/core/migrations/0083_facility_hdu_nbu_flags.py`
- `backend/hmis/apps/inpatient/migrations/0053_add_hdu_nbu_ward_types.py`

Post-migration checks:

- Facility admin can view and edit `has_hdu` and `has_nbu`
- Ward create/edit supports `HDU` and `NBU`
- Transfer form shows ICU/HDU/NBU routes

Rollback guidance:

1. Disable feature flags (`has_hdu`, `has_nbu`) for affected facilities
2. Pause new critical-care transfers
3. Re-deploy last known-good app build
4. Use standard DB rollback process only if required by platform SRE policy

---

## 3. Monitoring Dashboard

Monitoring endpoint:

- `GET /api/inpatient/admissions/critical-care-workflow-health/?days=30`

Dashboard route:

- `/inpatient/critical-care`

Primary operational KPIs:

- `step_up_transfers`, `step_down_transfers`, `lateral_transfers`
- `review_requests_pending`, `review_requests_overdue`
- Current ICU/HDU/NBU load and occupancy pressure
- Transfer transition matrix (`from_ward_type` -> `to_ward_type`)

Alert thresholds (recommended initial values):

- Overdue review requests > 5 for more than 30 minutes
- Step-up transfers increase > 2x 7-day baseline
- ICU occupancy > 90% sustained for 6+ hours

---

## 4. Release Notes Template

Use this release note block for each environment promotion:

```
ICU/HDU/NBU Phase 3 hardening deployed.
- Added critical-care workflow dashboard and health metrics endpoint.
- Expanded transfer safety validation and escalation/de-escalation auditing.
- Extended timeline coverage (transfer + review-request lifecycle).
- Added E2E and regression coverage for ICU/HDU/NBU workflow visibility.
```

---

## 5. User Training Notes

Target roles:

- Inpatient nurses
- Duty doctors and consultants
- Bed managers
- Billing/claims officers

Training checklist:

- Choosing correct transfer reason (`STEP_UP`, `STEP_DOWN`, lateral)
- Documenting `reason_details` and handover notes
- Reading `/inpatient/critical-care` dashboard for operational decisions
- Interpreting pending/overdue review requests and escalation workflow

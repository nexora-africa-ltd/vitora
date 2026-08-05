# HealthCloud (Slade360) Exit Criteria Audit and Gap-Prep

## Audit Scope

- Reference plans audited:
  - `docs/healthcloud-slade360-private-insurance-migration-plan.md`
  - `docs/healthcloud-slade360-sprint-breakdown.md`
- Code and runtime artifacts checked across:
  - backend insurance services/models/views/tasks
  - web insurance API/hooks/pages
  - Celery beat schedule
  - available automated tests

## Executive Result

- Exit criteria are **not fully met**.
- Implementation status is strongest for Sprint 1-2 core scaffolding and Sprint 3-4 partial workflow/reporting.
- Major open gaps remain in: formal sign-off artifacts, staging/live validation evidence, and pilot cutover readiness.

Status totals (Sprint 0-5 exit criteria):

- Met: 9
- Partially met: 15
- Not met: 6

---

## Evidence Snapshot (Implemented)

- HealthCloud adapter/auth/client/model foundations are present:
  - `backend/hmis/apps/insurance/services/slade_auth.py`
  - `backend/hmis/apps/insurance/services/adapters.py`
  - `backend/hmis/apps/insurance/services/client.py`
  - `backend/hmis/apps/insurance/models.py`
  - `backend/hmis/apps/insurance/migrations/0005_insuranceproviderconfig_auth_base_url_and_more.py`
- HealthCloud workflow endpoints are present:
  - `backend/hmis/apps/insurance/views.py`
  - `backend/hmis/apps/insurance/urls.py`
- Async reconciliation and sweep tasks are present:
  - `backend/hmis/apps/insurance/tasks.py`
- HealthCloud operational alert rules + runbook artifacts are present:
  - `monitoring/prometheus/rules/healthcloud_alerts.yml`
  - `monitoring/grafana/dashboards/vitora-insurance-healthcloud.json`
  - `docs/healthcloud-operations-runbook.md`
  - `docs/healthcloud-incident-simulation-2026-08-05.md`
- Frontend integration for new actions exists:
  - `web-app/lib/api/insurance.ts`
  - `web-app/lib/hooks/use-insurance.ts`
  - `web-app/lib/types/insurance.ts`
  - `web-app/lib/schemas/insurance.schema.ts`
  - `web-app/app/(dashboard)/insurance/claims/[id]/page.tsx`
  - `web-app/app/(dashboard)/insurance/page.tsx`

Validation evidence available from this workspace:

- `python manage.py check` passes
- `pytest tests/insurance/test_api.py` passes (46/46)
- `pytest tests/contracts/test_insurance_contracts.py` passes (27/27)
- `npm run type-check` passes
- `pytest backend/tests/insurance/test_healthcloud_beat_schedule.py backend/tests/insurance/test_healthcloud_api.py backend/tests/insurance/test_healthcloud_security.py` passes (7/7)
- `npm test -- __tests__/app/insurance/claim-healthcloud-workflow.test.tsx` passes (3/3)

---

## Exit Criteria Matrix

### Sprint 0

- Signed mapping document for all in-scope endpoints and fields -> **Partial** (mapping doc exists, no formal sign-off artifact)
- Approved preauth handling approach documented -> **Met** (`docs/healthcloud-slade360-sprint0-artifacts.md`)
- Final ERD and API contract published -> **Partial** (API mapping exists; ERD artifact not found)
- UX flow signed off by product + operations -> **Not met** (no sign-off record)
- Sandbox credentials verified in non-local environment -> **Not met** (no stage verification artifact)
- QA test strategy approved (functional + NFR) -> **Partial** (plan text exists; no approval artifact)

### Sprint 1

- Token service works with real sandbox credentials and auto-refresh -> **Partial** (service implemented, no recorded live proof)
- New models/migrations applied cleanly in dev/stage -> **Partial** (dev evidence exists; no stage evidence)
- Adapter can authenticate and call at least 2 live sandbox endpoints -> **Partial** (code paths implemented; no live run evidence)
- No plaintext secret persistence introduced -> **Partial** (encrypted fields used; legacy `api_credentials` still exists)
- CI green for new unit and migration tests -> **Partial** (general tests green; HealthCloud-specific test coverage missing)

### Sprint 2

- End-to-end backend workflow runs in sandbox -> **Partial** (workflow code present; no full sandbox execution report)
- All new endpoints documented and versioned -> **Partial** (in-code endpoints exist; no API doc/version changelog update found)
- Duplicate submit attempts are safe -> **Partial** (`InsuranceExternalSync` idempotency added, not fully test-proven)
- External failures return actionable error payloads with correlation IDs -> **Partial** (correlation IDs in client; API errors mostly generic)
- Contract and negative-path tests pass in CI -> **Met** (HealthCloud negative-path/API coverage added in `backend/tests/insurance/test_healthcloud_api.py`)

### Sprint 3

- Claim clerk can execute full HealthCloud flow from UI without manual API calls -> **Partial** (UI supports flow but still requires heavy manual field entry)
- UI surfaces exact external status and actionable error states -> **Partial** (timeline/events exist; limited structured status/error rendering)
- Feature flags can toggle HealthCloud workflow by environment/facility -> **Met** (backend guards + frontend gating added)
- Frontend tests pass and key screens validated on desktop + tablet -> **Partial** (targeted workflow test added; no tablet/e2e validation evidence yet)

### Sprint 4

- Daily remittance sync job runs successfully in staging -> **Partial** (tasks wired into beat schedule; staging runtime evidence still pending)
- Alerts exist for auth failures, upstream 5xx spikes, and stale remittance lag -> **Met** (`monitoring/prometheus/rules/healthcloud_alerts.yml`)
- Audit trails contain no leaked secrets/PII -> **Met** (redaction assertions in `backend/tests/insurance/test_healthcloud_security.py`)
- Staging E2E pass rate >= 95% for HealthCloud scenarios -> **Not met** (no HealthCloud E2E suite evidence)
- Runbook validated in at least one incident simulation -> **Met** (`docs/healthcloud-operations-runbook.md`, `docs/healthcloud-incident-simulation-2026-08-05.md`)

### Sprint 5

- Pilot facilities transacting new private insurance claims through HealthCloud -> **Not met**
- Rollback tested and executable in <30 minutes -> **Not met**
- No Sev-1/Sev-2 open defects for pilot scope -> **Not met**
- Operations team trained and sign-off received -> **Not met**
- Legacy private-insurance path disabled for migrated payer/facility combinations -> **Not met**

---

## Cross-Sprint QA Gate Assessment

- Unit + integration test pass rate >=95% -> **Partial** (existing suites pass; HealthCloud-focused suites incomplete)
- No unresolved critical security findings -> **Unknown/Not evidenced**
- API schema/documentation updated for endpoint changes -> **Partial** (frontend schemas updated; backend API docs not updated)
- Feature flags documented with owner and rollback plan -> **Met** (`docs/healthcloud-operations-runbook.md`)
- Production telemetry available before user enablement -> **Met** (metrics, alert rules, and HealthCloud Grafana dashboard are now present)

---

## Implementation Prep for Unmet/Partial Criteria

## P0 (Must do before pilot)

- Add HealthCloud feature flags and enforcement:
  - backend settings + guard checks in workflow actions
  - frontend route/action gating per facility
- Wire insurance tasks into Celery beat in `backend/hmis/celery.py`:
  - `fetch_remittances`
  - `poll_claim_remittance_statuses`
  - `sweep_healthcloud_authorizations_and_reservations`
- Add HealthCloud API negative-path tests (401/429/5xx, idempotent replay)
- Add backend integration tests for full workflow service chain
- Publish API changelog/version notes for new insurance endpoints

## P1 (Required for operational readiness)

- [Done] Add alerting rules (Prometheus/Grafana or equivalent):
  - token acquisition failures
  - repeated 5xx error rate threshold
  - remittance lag threshold
- [Done] Create HealthCloud operations runbook:
  - incident triage
  - token outage playbook
  - rollback switch steps
- [Done] Add PII leakage tests/assertions for `InsuranceOutboundCall` persistence paths
- Improve UI status model to show external workflow step states from API payloads

## P2 (Pilot cutover and decommission)

- Seed scripts for provider/facility HealthCloud config population
- Pilot cohort toggles and communications banner in UI
- Execute staged UAT pack and defect triage cadence
- Add and validate rollback drill (<30 min target)

---

## Ready-to-Implement Ticket Set (Next Actionable Batch)

- HC-GAP-001: Add HealthCloud runtime flags (backend+frontend) with owner docs
- HC-GAP-002: Add insurance HealthCloud Celery beat entries and smoke tests
- HC-GAP-003: Build HealthCloud API contract+negative-path pytest suite
- HC-GAP-004: Build frontend integration tests for claim workflow stepper
- HC-GAP-005: Add alert rules and dashboard panels for HC metrics (**done**)
- HC-GAP-006: Publish HealthCloud operations/rollback runbook and drill evidence (**done**)
- HC-GAP-007: Add provider/facility seeding command and pilot enablement script
- HC-GAP-008: Add endpoint docs/version update in API reference docs

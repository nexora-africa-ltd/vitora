# HealthCloud (Slade360) Migration - Execution Sprint Breakdown

## Planning Baseline

- Sprint length: 2 weeks
- Team model: 2 Backend, 2 Frontend, 1 QA, 0.5 DevOps, 1 PM/BA
- Estimation: story points (SP) with rough effort mapping
  - 1 SP ~= 0.5 day
  - 2 SP ~= 1 day
  - 3 SP ~= 1.5 days
  - 5 SP ~= 2-3 days
  - 8 SP ~= 4-5 days
  - 13 SP ~= 6-8 days
- Planned velocity target per sprint:
  - Backend: 30-36 SP
  - Frontend: 24-30 SP
  - QA: 14-18 SP
  - DevOps: 8-12 SP

---

## Sprint 0 - Contract Freeze and Solution Design

Goal: eliminate integration ambiguity and lock a build-ready technical design.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-BE-000 | Backend | Finalize endpoint/payload mapping (Vitora <-> HealthCloud) | 5 | BE Lead | None |
| HC-BE-001 | Backend | Define preauth gap strategy and approved fallback flow | 5 | BE Lead + BA | HC-BE-000 |
| HC-BE-002 | Backend | Produce migration ERD for auth/reservation/external sync entities | 3 | Backend | HC-BE-000 |
| HC-FE-000 | Frontend | UX wireframes for eligibility -> OTP -> visit -> reserve -> submit | 5 | FE Lead | HC-BE-000 |
| HC-DO-000 | DevOps | Provision sandbox secrets and environment matrix (dev/stage) | 3 | DevOps | None |
| HC-QA-000 | QA | Create traceability matrix from API spec to test scenarios | 3 | QA | HC-BE-000 |
| HC-QA-001 | QA | Define NFR test plan (rate limits, token expiry, retries) | 2 | QA | HC-BE-000 |

### Exit Criteria

- Signed mapping document for all in-scope endpoints and fields
- Approved preauth handling approach documented
- Final ERD and API contract published
- UX flow signed off by product + operations
- Sandbox credentials verified in non-local environment
- QA test strategy approved (functional + NFR)

---

## Sprint 1 - Backend Foundation (Auth, Adapter, Data Model)

Goal: implement core integration plumbing and persistence model.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-BE-010 | Backend | Implement Slade OAuth token service (cache + refresh + lock) | 8 | Backend | HC-BE-000 |
| HC-BE-011 | Backend | Extend HTTP client for multi-host routing + retry policy | 8 | Backend | HC-BE-010 |
| HC-BE-012 | Backend | Add `Slade360Adapter` skeleton + endpoint clients | 8 | Backend | HC-BE-011 |
| HC-BE-013 | Backend | Add models: VisitAuthorization, BalanceReservation, ExternalSync | 8 | Backend | HC-BE-002 |
| HC-BE-014 | Backend | Add migrations + indexes + constraints for new models | 5 | Backend | HC-BE-013 |
| HC-BE-015 | Backend | Add provider config extensions (`payer_slade_code`, flags) | 3 | Backend | HC-BE-013 |
| HC-DO-010 | DevOps | Add env var templates and secret references for HealthCloud | 3 | DevOps | HC-DO-000 |
| HC-QA-010 | QA | Unit-test harness for adapter/service mocking | 3 | QA | HC-BE-012 |
| HC-QA-011 | QA | CI smoke tests for migrations + schema checks | 2 | QA | HC-BE-014 |

### Exit Criteria

- Token service works with real sandbox credentials and auto-refresh
- New models/migrations applied cleanly in dev/stage
- Adapter can authenticate and call at least 2 live sandbox endpoints
- No plaintext secret persistence introduced
- CI green for new unit and migration tests

---

## Sprint 2 - Backend Domain and API Workflow

Goal: expose complete server-side workflow and make operations idempotent.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-BE-020 | Backend | Implement eligibility + OTP + start visit service methods | 8 | Backend | HC-BE-012 |
| HC-BE-021 | Backend | Implement authorization validation + reservation services | 8 | Backend | HC-BE-020 |
| HC-BE-022 | Backend | Implement claim submit + claim attachment sync | 8 | Backend | HC-BE-021 |
| HC-BE-023 | Backend | Implement invoice submit + invoice attachment sync | 8 | Backend | HC-BE-022 |
| HC-BE-024 | Backend | Implement credit note submit via invoices endpoint | 5 | Backend | HC-BE-023 |
| HC-BE-025 | Backend | Add DRF actions/endpoints for full HealthCloud flow | 8 | Backend | HC-BE-024 |
| HC-BE-026 | Backend | Add idempotency keys + duplicate prevention guards | 5 | Backend | HC-BE-022 |
| HC-QA-020 | QA | API contract tests for all new endpoints/actions | 8 | QA | HC-BE-025 |
| HC-QA-021 | QA | Negative-path tests (401/429/500, duplicate requests) | 5 | QA | HC-BE-026 |
| HC-DO-020 | DevOps | Add rate-limit safe retry defaults and app config tuning | 2 | DevOps | HC-BE-011 |

### Exit Criteria

- End-to-end backend workflow runs in sandbox (eligibility -> OTP -> visit -> reserve -> claim -> invoice)
- All new endpoints documented and versioned
- Duplicate submit attempts are safe (no duplicate external resources)
- External failures return actionable error payloads with correlation IDs
- Contract and negative-path tests pass in CI

---

## Sprint 3 - Frontend Workflow and UX Integration

Goal: operational UI flow for billing and claims teams.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-FE-030 | Frontend | Extend `insuranceApi` client for new HealthCloud actions | 5 | Frontend | HC-BE-025 |
| HC-FE-031 | Frontend | Extend `use-insurance` hooks/query keys for new workflow | 5 | Frontend | HC-FE-030 |
| HC-FE-032 | Frontend | Build eligibility and OTP step UI with contact selection | 8 | Frontend | HC-FE-031 |
| HC-FE-033 | Frontend | Build start-visit + auth validation step UI | 8 | Frontend | HC-FE-032 |
| HC-FE-034 | Frontend | Build reservation panel with amount/invoice controls | 5 | Frontend | HC-FE-033 |
| HC-FE-035 | Frontend | Build claim/invoice submission progress timeline component | 8 | Frontend | HC-FE-034 |
| HC-FE-036 | Frontend | Add retry/error UX and correlation ID display | 5 | Frontend | HC-FE-035 |
| HC-FE-037 | Frontend | Add feature flags in UI route guards and navigation | 3 | Frontend | HC-FE-031 |
| HC-QA-030 | QA | Component and integration test coverage for stepper flow | 8 | QA | HC-FE-035 |
| HC-QA-031 | QA | Accessibility and responsive verification for new screens | 3 | QA | HC-FE-035 |

### Exit Criteria

- Claim clerk can execute full HealthCloud flow from UI without manual API calls
- UI surfaces exact external status and actionable error states
- Feature flags can toggle HealthCloud workflow by environment/facility
- Frontend tests pass and key screens validated on desktop + tablet

---

## Sprint 4 - Reconciliation, Observability, and Hardening

Goal: production safety, reporting, and operational readiness.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-BE-040 | Backend | Implement remittance list sync + persistence mapping | 8 | Backend | HC-BE-025 |
| HC-BE-041 | Backend | Implement per-claim remittance lookup polling | 5 | Backend | HC-BE-040 |
| HC-BE-042 | Backend | Add reservation/auth expiry background tasks | 5 | Backend | HC-BE-021 |
| HC-BE-043 | Backend | Add operational metrics events (success/failure/latency) | 5 | Backend | HC-BE-025 |
| HC-BE-044 | Backend | Enhance audit redaction for HealthCloud-specific sensitive fields | 3 | Backend | HC-BE-012 |
| HC-FE-040 | Frontend | Build reconciliation dashboards/status filters in insurance pages | 8 | Frontend | HC-BE-040 |
| HC-DO-040 | DevOps | Dashboards + alerts (error rate, auth failures, remittance lag) | 8 | DevOps | HC-BE-043 |
| HC-DO-041 | DevOps | Add runbook automation hooks and on-call alert routing | 3 | DevOps | HC-DO-040 |
| HC-QA-040 | QA | E2E suite in staging with sandbox test data pack | 8 | QA | HC-FE-040 |
| HC-QA-041 | QA | NFR validation: resilience, retry, and timeout behavior | 5 | QA | HC-DO-040 |

### Exit Criteria

- Daily remittance sync job runs successfully in staging
- Alerts exist for auth failures, upstream 5xx spikes, and stale remittance lag
- Audit trails contain no leaked secrets/PII
- Staging E2E pass rate >= 95% for HealthCloud scenarios
- Runbook validated in at least one incident simulation

---

## Sprint 5 - Pilot Cutover and Legacy Decommission Start

Goal: controlled production rollout and transition off legacy private insurance logic.

### Tickets

| ID | Track | Ticket | SP | Owner | Dependencies |
|---|---|---|---:|---|---|
| HC-BE-050 | Backend | Add migration scripts for provider/facility HealthCloud config seeding | 5 | Backend | HC-BE-015 |
| HC-BE-051 | Backend | Implement cutover rules (new claims HealthCloud only by flag) | 5 | Backend | HC-BE-050 |
| HC-BE-052 | Backend | Legacy path guardrails and fallback routing logic | 5 | Backend | HC-BE-051 |
| HC-FE-050 | Frontend | Pilot facility toggles + user communication banners in UI | 3 | Frontend | HC-FE-037 |
| HC-DO-050 | DevOps | Production rollout pipeline gates and rollback switchbook | 5 | DevOps | HC-DO-041 |
| HC-QA-050 | QA | Pilot UAT execution pack + defect triage matrix | 8 | QA | HC-BE-051 |
| HC-QA-051 | QA | Post-go-live verification checklist automation | 3 | QA | HC-DO-050 |
| HC-PM-050 | PM/BA | Training and SOP handover for billing/claims operations | 3 | PM/BA | HC-FE-050 |

### Exit Criteria

- Pilot facilities transacting new private insurance claims through HealthCloud
- Rollback tested and executable in < 30 minutes
- No Sev-1/Sev-2 open defects for pilot scope
- Operations team trained and sign-off received
- Legacy private-insurance path disabled for migrated payer/facility combinations

---

## Cross-Sprint QA Gates (must pass each sprint)

- Unit + integration test pass rate >= 95%
- No unresolved critical security findings
- API schema/documentation updated for any endpoint changes
- Feature flags documented with owner and rollback plan
- Production telemetry available before enabling user-facing features

---

## Overall Program Exit Criteria (Done Definition)

- HealthCloud flow is default for configured private-insurance providers
- End-to-end flow is stable in production:
  - eligibility
  - OTP/auth start visit
  - reservation
  - claim + invoice + attachments
  - remittance reconciliation
- 2 consecutive remittance cycles reconcile within agreed finance tolerance
- Legacy execution path is decommissioned for migrated cohorts
- Runbooks, dashboards, SOPs, and on-call ownership finalized

---

## Suggested Jira Epic Structure

- EPIC HC-AUTH: OAuth, token lifecycle, secure config
- EPIC HC-VISIT: eligibility, OTP, authorization, reservation
- EPIC HC-CLAIMS: claim/invoice/attachments/credit notes
- EPIC HC-REMIT: remittance sync and reconciliation
- EPIC HC-UX: frontend guided workflow and status surfaces
- EPIC HC-OPS: observability, rollout, rollback, runbooks
- EPIC HC-QA: contract, E2E, NFR, pilot UAT

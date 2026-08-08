# HealthCloud (Slade360) Mandatory Session Flow Plan

## Objective

Make the HealthCloud insurance workflow mandatory and session-based for all HealthCloud claims, mirroring the SHA visit flow pattern:

1. eligibility
2. contact selection + OTP request
3. start visit authorization
4. authorization validation
5. balance reservation
6. claim/invoice continuation

This plan replaces the current partially manual flow on claim pages with a strict sequenced workflow where downstream steps are derived from eligibility data.

## Scope and Non-Goals

### In Scope

- Backend session orchestration and sequencing enforcement.
- Eligibility snapshot persistence and reuse across steps.
- Frontend stepper UX aligned with SHA flow semantics.
- Full rendering of HealthCloud eligibility payload (structured + raw JSON).
- Mandatory rollout for all HealthCloud claims (no gradual feature-flag rollout).

### Out of Scope

- Changes to non-HealthCloud insurance providers.
- New payer onboarding beyond existing `payer_slade_code` mappings.
- Re-architecture of legacy preauth domain outside current HealthCloud workflow.

## Current State Summary

- Eligibility exists via `verify-via-healthcloud` and `verify-via-healthcloud-preview`.
- OTP/start-visit/validate steps exist but can be driven manually from claim page fields.
- HealthCloud claim UI currently asks users to type values that should come from eligibility response.
- Rich eligibility response is returned in `raw_response` but not fully modeled or rendered in workflow UX.

## Target State

- A single session object tracks the lifecycle from eligibility through authorization and claim readiness.
- Enrollment-level payer membership state (SHA-style) is persisted and refreshed on each eligibility run.
- Eligibility is always step 1 and is required before OTP/start-visit.
- Contact and benefit choices must come from the latest eligibility snapshot for that session.
- Frontend stepper mirrors SHA behavior: guided progression, locked/unlocked steps, response timeline.
- UI renders complete HealthCloud eligibility data:
  - member details
  - cover details
  - contacts list
  - benefits table
  - raw JSON payload

## Implementation Phases

## Phase 1 - Session Contract and Data Persistence

### Changes

- Introduce a session-centric API contract for HealthCloud workflow.
- Add SHA-like payer membership snapshot persistence linked to enrollment (latest eligibility state).
- Extend `InsuranceVisitAuthorization` (or add a companion session model) to persist:
  - eligibility payload snapshot
  - selected contact id/value
  - selected benefit code/type
  - selected cover/policy fields used to start visit
  - latest workflow step/status
- Keep existing `raw_payload` for step responses; add explicit eligibility snapshot field to avoid overwrite.
- Persist latest enrollment-level fields from eligibility (e.g. member/cover statuses, checked timestamp) for fast reuse across visits.
- Add migration(s), indexes, and serializer updates for new persisted fields.

### Primary Files

- `backend/hmis/apps/insurance/models.py`
- `backend/hmis/apps/insurance/migrations/*`
- `backend/hmis/apps/insurance/serializers.py`

### Exit Criteria

- Migration applies cleanly in dev/test without data loss.
- Session record stores eligibility payload and selected downstream fields.
- API serialization returns new fields consistently.
- Existing list/detail authorization endpoints continue to work.

## Phase 2 - Backend Workflow Orchestration and Enforcement

### Changes

- Add session endpoints under enrollments/healthcloud path (or equivalent namespaced actions):
  - session start (runs eligibility + persists snapshot)
  - request OTP (requires session + selected contact)
  - start visit (requires OTP + selected benefit/contact + policy fields)
  - validate authorization (requires started visit)
- Refactor existing actions to either:
  - proxy to new session service, or
  - reject non-session usage for HealthCloud claims.
- Enforce strict sequencing in service layer.
- Ensure idempotency keys remain stable per step.
- Ensure claim submission path can consume session-derived authorization context without manual re-entry.

### Primary Files

- `backend/hmis/apps/insurance/views.py`
- `backend/hmis/apps/insurance/urls.py`
- `backend/hmis/apps/insurance/services/insurance_services.py`
- `backend/hmis/apps/insurance/services/adapters.py`

### Exit Criteria

- HealthCloud flow cannot request OTP/start visit/validate without a valid session state.
- Session start endpoint returns normalized eligibility summary and raw payload.
- Existing claims can submit using session-derived authorization data.
- All backend tests for sequence validation and idempotency pass.

## Phase 3 - Frontend Session Stepper (SHA-Mirror UX)

### Changes

- Replace manual HealthCloud claim workflow inputs with guided stepper in:
  - claim detail workflow area
  - enrollment entry points where relevant
- Use session endpoints and store session id in page state.
- Auto-fill start-visit fields from eligibility snapshot:
  - beneficiary id
  - policy number
  - scheme name/code
  - available contacts
  - available benefits
- Disable downstream actions until prerequisites complete.
- Add step timeline and retry affordances consistent with SHA patterns.

### Primary Files

- `web-app/app/(dashboard)/insurance/claims/[id]/page.tsx`
- `web-app/lib/api/insurance.ts`
- `web-app/lib/hooks/use-insurance.ts`

### Exit Criteria

- User can complete HealthCloud workflow without manually typing eligibility-derived fields.
- Stepper enforces sequence in UI and reflects backend step status.
- Session restart/retry behavior is deterministic after refresh/navigation.
- Existing claim lifecycle actions outside HealthCloud remain unaffected.

## Phase 4 - Rich Eligibility Data Modeling and Rendering

### Changes

- Add typed structures for eligibility payload in frontend types/schemas:
  - member
  - contacts
  - benefits
  - cover
- Render full payload in structured cards/tables plus expandable raw JSON.
- Surface key values in visual summary:
  - member active/enrolled
  - cover validity
  - benefit balances/limits
  - copay type/value/applicability

### Primary Files

- `web-app/lib/types/insurance.ts`
- `web-app/lib/schemas/insurance.schema.ts`
- `web-app/app/(dashboard)/insurance/claims/[id]/page.tsx`
- `web-app/app/(dashboard)/insurance/enrollments/new/page.tsx`

### Exit Criteria

- UI displays all top-level eligibility data returned by HealthCloud.
- Contacts and benefits are selectable from rendered payload lists.
- Raw JSON view is available for troubleshooting and support.
- Type/schema validation passes with real sandbox payloads.

## Phase 5 - Mandatory Cutover and Compatibility Cleanup

### Changes

- Make session flow mandatory for all HealthCloud claims immediately.
- Remove or hard-block legacy manual direct-step paths for HealthCloud.
- Keep compatibility wrappers only where needed for API consumers, but enforce session checks.
- Update runbooks and internal docs to single approved workflow.

### Primary Files

- `backend/hmis/apps/insurance/views.py`
- `backend/hmis/apps/insurance/services/insurance_services.py`
- `docs/healthcloud-operations-runbook.md`
- `docs/healthcloud-slade360-private-insurance-migration-plan.md`

### Exit Criteria

- No HealthCloud claim can proceed outside session flow in backend.
- UI exposes only session-driven HealthCloud path.
- Operations/support docs reflect new mandatory flow.
- Regression suite passes for insurance and HealthCloud workflow tests.

## Phase 6 - Validation, Observability, and Production Readiness

### Changes

- Extend tests:
  - backend: sequence enforcement, payload persistence, idempotency, failure handling
  - frontend: stepper progression, auto-fill behavior, rich rendering snapshots
- Add/verify telemetry for each step success/failure/latency.
- Run sandbox end-to-end script for canonical scenarios:
  - eligible + normal flow
  - eligible + invalid OTP
  - ineligible member
  - benefit unavailable

### Primary Files

- `backend/tests/insurance/*`
- `web-app/__tests__/app/insurance/*`
- `monitoring/prometheus/rules/healthcloud_alerts.yml`
- `monitoring/grafana/dashboards/vitora-insurance-healthcloud.json`

### Exit Criteria

- End-to-end sandbox scenarios pass without manual payload entry.
- Alerts and dashboards show per-step workflow health.
- Zero critical regressions in adjacent insurance flows.
- Team sign-off from Backend, Frontend, QA, and Operations.

## Delivery Notes

- Rollout mode: mandatory from first release for HealthCloud claims.
- Backward compatibility: non-HealthCloud providers continue existing paths unchanged.
- Data safety: additive migrations first; no destructive schema changes in initial cutover.

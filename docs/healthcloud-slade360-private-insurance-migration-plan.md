# HealthCloud (Slade360) Private Insurance Migration Plan

## 1) Objective

Replace the current private-insurance execution path (manual + generic smart claims adapter logic) with a first-class HealthCloud by Slade360 integration for eligibility, member authentication, visit authorization, claim/invoice submission, attachments, credit notes, and remittance reconciliation.

This plan is full stack: backend domain/services, APIs, async workers, frontend UX/state, data migration, observability, security, rollout, and QA.

---

## 2) Source Systems and API Capabilities Reviewed

### Current Vitora private insurance implementation (key touchpoints)

- Backend models and lifecycle logic: `backend/hmis/apps/insurance/models.py`
- Adapter abstraction and HTTP client:
  - `backend/hmis/apps/insurance/services/base_adapter.py`
  - `backend/hmis/apps/insurance/services/adapters.py`
  - `backend/hmis/apps/insurance/services/client.py`
  - `backend/hmis/apps/insurance/services/insurance_services.py`
- Insurance REST API surface:
  - `backend/hmis/apps/insurance/views.py`
  - `backend/hmis/apps/insurance/urls.py`
- Scheduled jobs:
  - `backend/hmis/apps/insurance/tasks.py`
- Frontend API/types/hooks:
  - `web-app/lib/api/insurance.ts`
  - `web-app/lib/hooks/use-insurance.ts`
  - `web-app/lib/types/insurance.ts`
  - `web-app/lib/schemas/insurance.schema.ts`
- Insurance UI routes:
  - `web-app/app/(dashboard)/insurance/**`

### HealthCloud docs reviewed

- Root OAS: `https://web.healthcloud.sh/oas_docs/openapi.yaml`
- OAuth/user APIs: `pre_visit_apis/authorization.yaml`
- Eligibility API: `pre_visit_apis/eligibility.yaml`
- OTP API: `pre_visit_apis/authentication.yaml`
- Start visit and auth validation APIs: `visit_apis/start_visit.yaml`
- Balance reservation API: `visit_apis/balance_reservation.yaml`
- Claims APIs: `submit_visit_apis/claim.yaml`
- Invoices APIs: `submit_visit_apis/invoice.yaml`
- Credit note API: `submit_visit_apis/credit_note.yaml`
- Remittance APIs: `post_visit_apis/remittance.yaml`

---

## 3) Migration Principles

- Keep internal canonical insurance domain models in Vitora; treat HealthCloud as the external execution channel.
- Introduce provider-specific adapter (`slade360`) behind existing adapter contract to reduce UI/API churn.
- Add missing visit authorization and reservation concepts without breaking existing claim/preauth records.
- Prefer additive migrations and dual-run flags; avoid big-bang cutover.
- Enforce idempotency and outbound auditability for every external call.

---

## 4) Capability Mapping (Vitora -> HealthCloud)

| Vitora capability | HealthCloud endpoint(s) | Implementation note |
|---|---|---|
| Access token | `POST /oauth2/token/` | Build token manager with caching and refresh. |
| Member eligibility | `GET /beneficiaries/member_eligibility/` | Map `member_number` + `payer_slade_code`; persist benefit/coplay snapshot. |
| OTP request | `POST /beneficiaries/beneficiary_contacts/{contact_id}/send_otp/` | Add OTP request flow in UI and API. |
| Start visit (authorization) | `POST /authorizations/start_visit/` | Add new visit-auth domain model; capture `edi_auth_guid` + `auth_token`. |
| Validate authorization token | `POST /authorizations/validate_authorization_token/` | Use for token-based workflows and reconciliation checks. |
| Reserve balance | `POST /balances/reservations/reserve_from_authorization/` | Add reservation records and release/expiry handling strategy. |
| Submit claim | `POST /claims/` | Map claim header + ICD10 list; persist external claim UUID/id/workflow state. |
| Claim attachments | `POST /claim_attachments/upload_attachment/` | Move from generic `attachments_meta` into typed external attachment sync rows. |
| Submit invoice | `POST /invoices/` | Submit invoice lines/coplay under claim UUID. |
| Invoice attachments | `POST /invoice_attachments/upload_attachment/` | Attach invoice docs after invoice creation. |
| Credit notes | `POST /invoices` with `invoice_type=CREDIT_NOTE` | Add explicit credit-note submission action and status tracking. |
| List remittances | `GET /remittances/` | Extend remittance fetch task to parse EDI/non-EDI aggregates. |
| Claim remittance lookup | `GET /remittances/claim_remittance/?claim_id=` | Add per-claim settlement polling endpoint/task. |

### Known gap to resolve early

- Existing Vitora preauth domain (`InsurancePreauth`) has no direct preauth endpoint in the current HealthCloud OAS set reviewed.
- Decision required in design phase:
  1. represent preauth via payer workflow outside HealthCloud APIs,
  2. use claim/invoice + reservation controls as operational equivalent,
  3. or integrate additional non-public Slade APIs if available.

---

## 5) Target Architecture

### Backend

- Add `Slade360Adapter` implementing `InsuranceApiAdapter` in `backend/hmis/apps/insurance/services/adapters.py`.
- Add `Slade360AuthService` for OAuth token retrieval/refresh and tenant-safe cache.
- Add `Slade360Client` wrapper (or extend `InsuranceHttpClient`) to support multi-host routing:
  - accounts host (`/oauth2/token/`)
  - provider-edi host
  - is-api host
- Add idempotency key strategy per operation (`claim_number`, `invoice_number`, `correlation_id`).
- Add persistence for external references not currently modeled.

### Data model additions

Create new models (or extend existing) for missing HealthCloud lifecycle artifacts:

- `InsuranceVisitAuthorization`
  - enrollment/member/payer references
  - factors, contact_id, `edi_auth_guid`, `auth_token`, expiry, status
- `InsuranceBalanceReservation`
  - authorization FK, amount, invoice number, reservation guid, released amount/date
- `InsuranceExternalSync`
  - generic operation log (`operation`, `request_hash`, `external_id`, `state`, `last_error`)
- Extend existing records with HealthCloud identifiers:
  - `InsuranceClaim`: external UUID, workflow state, authorization code used
  - `InsuranceRemittanceLine`: external claim id linkage where available

### API layer

Expose backend actions aligned to frontend workflows:

- `POST /api/insurance/enrollments/{id}/verify-via-healthcloud/`
- `POST /api/insurance/enrollments/{id}/request-otp/`
- `POST /api/insurance/enrollments/{id}/start-visit/`
- `POST /api/insurance/authorizations/{id}/validate-token/`
- `POST /api/insurance/claims/{id}/reserve-balance/`
- `POST /api/insurance/claims/{id}/submit-to-healthcloud/`
- `POST /api/insurance/claims/{id}/upload-attachment/`
- `POST /api/insurance/claims/{id}/submit-invoice/`
- `POST /api/insurance/claims/{id}/submit-credit-note/`
- `GET /api/insurance/remittances/healthcloud-sync-status/`

### Frontend

- Add visit-auth stepper in insurance claim flow:
  1) eligibility
  2) OTP
  3) start visit
  4) reserve balance
  5) claim header
  6) invoice lines
  7) attachments
  8) submit
- Update React Query hooks in `web-app/lib/hooks/use-insurance.ts` for new actions.
- Add dedicated status timeline chips for external workflow states (PENDING, AUTHORIZED, SUBMITTED, etc.).
- Add retry UX for transient failures and conflict-safe resubmission.

---

## 6) Phased Implementation Plan

## Phase 0 - Discovery and Contract Freeze (3-5 days)

- Confirm per-environment hosts, client credentials issuance, and payer slade codes.
- Confirm file upload expectations (`multipart/form-data` vs JSON file pointer examples in docs).
- Resolve preauth strategy gap with Slade/ops team.
- Deliverable: signed integration contract and field mapping sheet.

## Phase 1 - Core Backend Plumbing (1 sprint)

- Implement OAuth token service with cache and refresh guard (single-flight lock).
- Implement `Slade360Adapter` methods for:
  - eligibility
  - OTP
  - start visit
  - authorization validation
  - balance reservation
  - claim submit
  - invoice submit
  - attachments upload
  - credit note submit
  - remittance fetch
- Add robust exception mapping and retry policies for 429/5xx.
- Add/extend models and migrations for visit auth + reservations + external sync states.

## Phase 2 - Insurance API and Domain Workflow (1 sprint)

- Add DRF actions/endpoints for the new HealthCloud workflow.
- Refactor existing submit endpoints to route through service layer (`InsuranceClaimsService` / `InsurancePreauthService`) instead of direct model state-only transitions.
- Add idempotent guards:
  - duplicate claim submit prevention
  - duplicate invoice number handling
  - duplicate attachment fingerprints
- Persist full outbound audit with PII redaction (reuse `InsuranceOutboundCall`).

## Phase 3 - Frontend UX Integration (1 sprint)

- Update insurance pages under `web-app/app/(dashboard)/insurance/**` with guided workflow states.
- Add OTP contact selection UI from eligibility response contacts.
- Add authorization token capture/validation forms.
- Add balance reservation panel tied to invoice estimate.
- Add submission progress drawer with per-step server responses.
- Add optimistic refresh and conflict-safe retries in hooks/API client.

## Phase 4 - Async Jobs, Reconciliation, and Reporting (0.5-1 sprint)

- Extend Celery tasks:
  - remittance sync and claim-level remittance lookup
  - authorization expiry sweeper
  - stale reservation release alerts
- Add dashboards/metrics:
  - eligibility success rate
  - OTP delivery/request success
  - claim submit success
  - invoice submit success
  - remittance lag
- Add finance reconciliation report views for EDI vs non-EDI amounts.

## Phase 5 - Data Migration and Cutover (0.5 sprint + monitored release)

- Seed/create `InsuranceProvider` + `InsuranceProviderConfig` entries for Slade360 (`code=slade360`).
- Backfill existing active enrollments with `payer_slade_code` mapping table.
- Migrate in-flight draft claims:
  - keep legacy claims in legacy path
  - route only new claims to Slade via feature flag.
- Feature flags:
  - `INSURANCE_HEALTHCLOUD_ENABLED`
  - `INSURANCE_HEALTHCLOUD_VISIT_AUTH_REQUIRED`
  - `INSURANCE_HEALTHCLOUD_CREDIT_NOTE_ENABLED`

## Phase 6 - Hardening and Decommission Legacy Logic (1 sprint)

- Remove dependency on generic private insurer submit flows for target providers.
- Archive/disable manual adapter for migrated payer-facility combinations.
- Update docs/runbooks and support SOPs.

---

## 7) Detailed Data Mapping Requirements

### Eligibility and enrollment

- Internal `PatientInsurance.member_number` -> `member_number`
- New config field: `payer_slade_code` per provider/facility
- Persist from response:
  - member activity/enrollment flags
  - cover status/validity dates
  - benefits array (status, balances, copay type/value, visit limit)

### Authorization and visit

- Persist `edi_auth_guid` and `auth_token` on `InsuranceVisitAuthorization`.
- Persist selected benefit code/type used to start visit.
- Tie authorization to claims and balance reservations via FK.

### Claim and invoice

- Claim header:
  - payer details, member/auth token, scheme, visit number/date range, icd10 list
- Invoice payload:
  - claim UUID, invoice number/date, copays, line items (item code/name, qty, unit price, discounts)
- Attachments:
  - upload metadata and returned attachment id per artifact.

### Remittance

- Remittance aggregate -> `InsuranceRemittance`
- Claim remittance details -> `InsuranceRemittanceLine` plus claim external-id crosswalk.

---

## 8) Security, Compliance, and Reliability

- Keep OAuth client secrets in encrypted config fields (already supported by `InsuranceProviderConfig` encrypted properties).
- Extend PII redaction list to include HealthCloud-specific fields (`beneficiaryCode`, `auth_token`, contacts).
- Add correlation IDs to every outbound call and surface in UI error payloads for support.
- Enforce outbound timeout budgets and circuit-breaker behavior for repeated upstream failures.
- Add replay-safe idempotency keys for write endpoints.

---

## 9) QA and Test Strategy

### Backend tests

- Unit tests for adapter payload mapping and response parsing.
- Contract tests with mocked OpenAPI examples for each endpoint.
- Service tests for lifecycle transitions and idempotency handling.
- Task tests for remittance sync and stale authorization/reservation jobs.

### Frontend tests

- Hook tests for new mutations/queries.
- Component tests for OTP/start-visit/submit flow states.
- E2E happy-path and failure-path insurance journeys.

### Non-functional tests

- Load test: burst claim/invoice submission.
- Chaos test: token expiry, 429 throttling, intermittent 500s.
- Security test: verify no secrets/PII leakage in logs and audits.

---

## 10) Rollout Plan

- Stage 1: sandbox integration against demo members and payer code set.
- Stage 2: pilot 1-2 facilities with private-insurance cohort only.
- Stage 3: expand by payer/facility matrix after 2 full remittance cycles.
- Stage 4: deprecate legacy private-insurance execution path.

Rollback path:

- Per-facility/payer feature-flag rollback to legacy/manual adapter.
- Preserve all external IDs and audit history for resumed sync.

---

## 11) Delivery Checklist

- [ ] HealthCloud provider config model extensions merged.
- [ ] Slade360 adapter + auth client merged.
- [ ] Visit auth + reservation models/migrations merged.
- [ ] Insurance API actions for OTP/start-visit/reservation/submit merged.
- [ ] Frontend workflow UI merged.
- [ ] Remittance reconciliation and dashboards merged.
- [ ] Runbooks, on-call SOPs, and support docs updated.
- [ ] Production cutover sign-off complete.

---

## 12) Open Questions to Resolve Before Build Starts

- Is there an official HealthCloud preauthorization API outside the published OAS set?
- What is the required attachment upload transport (multipart binary vs encoded blob reference)?
- What is the authoritative claim-status polling endpoint and status vocabulary for post-submit updates?
- Are there reservation release/cancel APIs we should integrate, or is release fully automatic on invoice/expiry?
- What are production rate limits and retry-after guarantees per endpoint group?

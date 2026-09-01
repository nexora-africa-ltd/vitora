# SHA/DHA Eligibility + Preauth Compliance Audit

Date: 2026-07-26
Project: Vitora HMIS (`backend/hmis`, `web-app`)
Reference docs reviewed:

- `https://hie-docs.dha.go.ke/eclaims/eligibility`
- `https://hie-docs.dha.go.ke/eclaims/preauths`
- `docs/sha-guides/eligibility.md`
- `docs/dha/hie-claims-preauths.md`

## Executive Findings

Vitora is materially advanced on DHA HIE eligibility/preauth integration and already supports both legacy SHA endpoints (`/v1`, `/v2`) and ILM middleware (`/api/v1`) paths. Core eligibility, preauth submit/cancel/fetch, doctor consent, emergency, lifecycle OTP/discharge, and POMSF balances are implemented across backend and frontend.

Overall status: **Partially compliant with strong coverage**.

High-confidence coverage exists for most required workflows; remaining gaps are primarily around consistency, governance, and safety rails rather than missing core transaction plumbing.

## Scope and Method

This audit compared documented DHA behavior against:

- Backend route maps, views, services, models, tasks, and tests.
- Frontend API clients, schemas, hooks, and preauth/claim workflow UI surfaces.
- Legacy SHA path set and ILM middleware path set running in parallel.

## Compliance Matrix

| Area | DHA Expectation | Vitora Status | Evidence |
| --- | --- | --- | --- |
| Eligibility (legacy) | `GET /v2/eligibility` using identification parameters | **Implemented** | `backend/hmis/settings/base.py:879`, `backend/hmis/apps/billing/services/sha_eligibility.py:856`, `backend/hmis/apps/billing/sha_views.py:4452` |
| Eligibility (ILM) | `GET /api/v1/patients/eligibility` | **Implemented** | `backend/hmis/settings/base.py:880`, `backend/hmis/apps/billing/sha_urls.py:168`, `web-app/lib/api/sha.ts:1560` |
| Eligibility APIs exposed locally | Facility API endpoints for check/direct | **Implemented** | `backend/hmis/apps/billing/urls.py:84`, `backend/hmis/apps/billing/urls.py:85`, `web-app/lib/api/sha.ts:350`, `web-app/lib/api/sha.ts:505` |
| Legacy preauth submit/status | `POST /v1/preauth/request`, `GET /v1/preauth/{ref}/status` | **Implemented** | `backend/hmis/settings/base.py:900`, `backend/hmis/settings/base.py:901`, `backend/hmis/apps/billing/services/sha_preauth.py:6` |
| Legacy preauth API surface | Local submit/status APIs | **Implemented** | `backend/hmis/apps/billing/sha_urls.py:141`, `backend/hmis/apps/billing/sha_views.py:6044`, `backend/hmis/apps/billing/sha_views.py:6159`, `web-app/lib/api/sha.ts:1275` |
| ILM preauth fetch/create/cancel | `/api/v1/preauths*` operations | **Implemented** | `backend/hmis/apps/billing/services/ilm_preauth_service.py:49`, `backend/hmis/apps/billing/services/ilm_preauth_service.py:269`, `backend/hmis/apps/billing/sha_urls.py:183`, `web-app/lib/api/sha.ts:1641`, `web-app/lib/api/sha.ts:1679`, `web-app/lib/api/sha.ts:1690` |
| ILM preauth diagnosis/doctor removal | `DELETE /preauths/diagnoses/{code}`, `DELETE /preauths/doctors` | **Implemented** | `backend/hmis/apps/billing/services/ilm_preauth_service.py:53`, `backend/hmis/apps/billing/services/ilm_preauth_service.py:54`, `backend/hmis/apps/billing/sha_urls.py:187`, `backend/hmis/apps/billing/sha_urls.py:192`, `web-app/lib/api/sha.ts:1701`, `web-app/lib/api/sha.ts:1714` |
| Doctor consent | Request + poll state updates | **Implemented** | `backend/hmis/apps/billing/sha_urls.py:197`, `backend/hmis/apps/billing/sha_urls.py:202`, `backend/hmis/apps/billing/sha_ilm_preauth_views.py:403`, `web-app/lib/api/sha.ts:1727`, `web-app/lib/api/sha.ts:1738` |
| Emergency/EMT preauth paths | Emergency claim + protocols + EMT | **Implemented** | `backend/hmis/apps/billing/sha_urls.py:208`, `backend/hmis/apps/billing/sha_urls.py:219`, `backend/hmis/apps/billing/services/ilm_preauth_service.py:58`, `backend/hmis/apps/billing/services/ilm_preauth_service.py:59`, `web-app/lib/api/sha.ts:1756`, `web-app/lib/api/sha.ts:1800` |
| Lifecycle OTP/discharge | Visit OTP, discharge OTP, discharge finalize | **Implemented** | `backend/hmis/apps/billing/sha_urls.py:226`, `backend/hmis/apps/billing/sha_urls.py:232`, `backend/hmis/apps/billing/services/ilm_lifecycle_service.py:8`, `backend/hmis/apps/billing/services/ilm_lifecycle_service.py:10`, `web-app/lib/api/sha.ts:1836`, `web-app/lib/api/sha.ts:1862` |
| POMSF balances | `GET /api/v1/patients/pomsf-balances` | **Implemented** | `backend/hmis/apps/billing/sha_urls.py:269`, `backend/hmis/apps/billing/sha_ilm_lifecycle_views.py:696`, `backend/hmis/apps/billing/services/ilm_lifecycle_service.py:18`, `web-app/lib/api/sha.ts:1927` |
| Preauth background polling | Periodic status reconciliation | **Implemented** | `backend/hmis/apps/billing/tasks.py:50`, `backend/hmis/apps/billing/tasks.py:77` |
| Bed occupancy in SHA eligibility/preauth flow | DHA-linked occupancy endpoint in SHA integration | **Not found in SHA integration** | No matching implementation under `backend/hmis/apps/billing` for SHA/DHA occupancy paths |

## Key Gaps and Risks

### 1) Dual preauth domain models increase drift risk

There are two different preauth persistence models and state machines:

- Legacy: `PreauthRequest` with `PENDING/APPROVED/DENIED/EXPIRED` (`backend/hmis/apps/billing/models.py:4405`).
- ILM: `SHAPreauth` with `draft/submitted/approved/denied/cancelled` and transition guards (`backend/hmis/apps/billing/models.py:4699`, `backend/hmis/apps/billing/models.py:4785`).

Risk: divergent status semantics and workflow decisions across screens/services unless normalization is enforced everywhere.

Severity: **High**.

### 2) Eligibility fallback can over-permit in some client paths

Frontend fallback logic can mark a dependent as eligible when direct check errors out, and also has permissive fallback when strict schema parsing fails:

- Dependent fallback behavior: `web-app/lib/api/sha.ts:455`.
- Eligibility schema fallback behavior: `web-app/lib/api/sha.ts:485`.

Risk: local UX may proceed with SHA-covered pathways in ambiguous/error states.

Severity: **High**.

### 3) API namespace inconsistency (`/api/billing` vs `/api/sha`) complicates governance

Eligibility endpoints are consumed under `/api/billing/...` while preauth submit/status are under `/api/sha/...` in frontend client usage.

Risk: policy enforcement, auditing, and integrator understanding become harder; easy to miss controls when rules are namespace-based.

Severity: **Medium**.

### 4) Bed occupancy requirement appears out-of-band for current SHA stack

No SHA/DHA-specific occupancy endpoint implementation was found in billing SHA integration modules, despite occupancy artifacts elsewhere in inpatient UI.

Severity: **Medium** if DHA compliance scope mandates occupancy exchange; **Low** if it is optional/non-applicable for this facility profile.

### 5) External spec signal is split between parameter conventions

Internal docs and code comments mention both `doc_type/doc_value` and `identification_type/identification_number` conventions. Runtime logic handles both depending on auth mode, but this increases integration ambiguity.

Evidence: `backend/hmis/apps/billing/services/sha_eligibility.py:359`, `backend/hmis/apps/billing/services/sha_eligibility.py:867`.

Severity: **Medium**.

## What Is Working Well

- Broad ILM surface already integrated end-to-end, including doctor consent polling and emergency/protocol flow.
- Local persistence/audit strategy is strong (`request_payload`, `response_payload`, snapshots, local list/detail APIs).
- Background reconciliation jobs exist for both legacy and ILM preauth statuses.
- Runtime schema validation exists on frontend for many SHA/ILM payloads.
- Targeted tests are present for eligibility and ILM preauth service/view behavior.

## Prioritized Remediation Plan

### P0 (Immediate)

1. Enforce a single normalized internal preauth status contract across legacy and ILM models (adapter or canonical enum layer).
2. Tighten frontend fallback behavior for eligibility errors so downstream SHA-covered actions require explicit confidence states.
3. Add explicit decision telemetry for fallback paths (who, when, why fallback permitted).

### P1 (Near-term)

1. Publish an internal API contract note mapping parameter names by mode (`legacy` vs `ilm`) and accepted aliases.
2. Harmonize route strategy or add a compatibility facade so all SHA workflows have one discoverable namespace.
3. Add contract tests that assert field-level equivalence between legacy and ILM preauth decisions presented to UI.

### P2 (Backlog / conditional)

1. Confirm with DHA whether occupancy exchange is mandatory for your enrolled workflows.
2. If mandatory, implement SHA-scoped occupancy endpoint/service with full audit and test coverage.

## Suggested Test Additions

- End-to-end dependent eligibility negative-path tests where upstream eligibility is unavailable.
- Contract tests for status mapping parity between `PreauthRequest` and `SHAPreauth`.
- Error-injection tests for `doctor_consent_state` poll loops and transition guards.
- Namespace-level permission tests covering `/api/billing` and `/api/sha` SHA endpoints.

## Notes / Limitations

- DHA web docs were partially truncated during retrieval in this session; this report uses available extracts plus local offline docs. Re-validate endpoint optional fields against full API catalog before production sign-off.

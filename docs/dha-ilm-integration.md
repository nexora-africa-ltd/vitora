# DHA HIE Middleware (ILM) Integration

> **Status**: Phases 0–3 complete. Phase 4 (lifecycle polish) and Phase 5 (M&E reports) planned.
>
> **Scope**: This document is the implementation-side SSOT for Vitora's
> integration with the **Digital Health Authority (DHA) Health Information
> Exchange Middleware (ILM)** — the gateway used by SHA / SHIF for claims,
> registries, preauth, and emergency care coordination.
>
> For the wire-protocol contracts see [`docs/dha/hie-docs/`](dha/hie-docs/).
> For domain events emitted by these flows see [`domain-events.md`](domain-events.md).

---

## 1. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Vitora HMIS (web-app + backend)                  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Web UI (Next.js)                                                      │
│  ├─ PreVisitChecksPanel   ── eligibility / benefits / registries       │
│  └─ ClaimILMPanel         ── visit / preview / submit / close          │
│        │                                                               │
│        ▼ (JWT cookie auth)                                             │
│  Django REST API (/api/sha/ilm/...  +  /api/sha/claims/{id}/ilm/...)   │
│        │                                                               │
│        ▼                                                               │
│  Service layer (billing/services/)                                     │
│  ├─ IlmRegistriesService  ── 8 GET ops  (Phase 2)                      │
│  ├─ IlmClaimService       ── 15 ops     (Phase 1+1b)                   │
│  └─ IlmPreauthService     ── 10 ops     (Phase 3)                      │
│        │                                                               │
│        ▼                                                               │
│  IlmClient  ── auth via SHAAuthService, retries, audit, PII redaction  │
│        │                                                               │
│        ▼ HTTPS                                                         │
│  https://ilm-dev.dha.go.ke/uat-middleware/api/v1/...                   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Key invariants

- **Single client**: every outbound call goes through `IlmClient` so we get
  uniform retry, timeout, audit, and PII-redaction behaviour. Services
  never call `requests` directly.
- **Auth reuse**: `IlmClient` calls `SHAAuthService.get_auth_headers()`.
  We do **not** maintain a parallel token cache.
- **Audit row per call**: every request writes a `core.DHAOutboundCall`
  row (request method, path, status, correlation id, latency, redacted
  request/response, FK → org/facility/user). Insert-only. 7-year retention.
- **Snapshots are insert-only**: `SHACoverageSnapshot` rows are never
  updated; every fetch creates a new row so the audit trail is reconstructible.
- **Persistence failures must not break API calls**: the `_publish_safe`
  helper in services and `contextlib.suppress(Exception)` in views ensure
  audit/event/snapshot writes never raise out of the request path.
- **DHAError → HTTP**: services raise typed `DHAError` subclasses;
  ViewSets translate them via a single `_ilm_handle_*_error()` helper:
  `400 / 401 / 404 / 429 / 502 / 500`.

### Settings (already wired across `.env`, Azure env-vars script, GH workflow)

| Setting | Purpose |
|---|---|
| `ILM_BASE_URL` | DHA HIE Middleware base, e.g. `https://ilm-dev.dha.go.ke/uat-middleware` |
| `ILM_REQUEST_TIMEOUT` | per-call timeout (s) |
| `ILM_MAX_RETRIES` | retry budget for transport / 5xx |
| `ILM_BACKOFF_SECONDS` | exponential base |
| `SHA_FACILITY_FR_CODE` | facility-level fallback when not on the active facility |

---

## 2. Module map

| Layer | File | Phase |
|---|---|---|
| Errors | `backend/hmis/apps/billing/services/dha_errors.py` | 0 |
| HTTP client | `backend/hmis/apps/billing/services/ilm_client.py` | 0 |
| Multipart | `backend/hmis/apps/billing/services/multipart_builder.py` | 0 |
| Consent | `backend/hmis/apps/billing/services/consent_token_resolver.py` | 0 |
| Audit row | `backend/hmis/apps/core/models.py` (`DHAOutboundCall`) | 0 |
| Claim service | `backend/hmis/apps/billing/services/ilm_claim_service.py` | 1 |
| Claim ViewSet actions | `backend/hmis/apps/billing/sha_views.py` (`SHAClaimViewSet` ILM @actions) | 1b |
| Registries service | `backend/hmis/apps/billing/services/ilm_registries_service.py` | 2 |
| Registry/eligibility APIViews | `backend/hmis/apps/billing/sha_ilm_registry_views.py` | 2 |
| Coverage snapshot model | `backend/hmis/apps/billing/models.py` (`SHACoverageSnapshot`) | 2 |
| Patient contact model | `backend/hmis/apps/billing/models.py` (`PatientContact`) | 2 |
| Preauth service | `backend/hmis/apps/billing/services/ilm_preauth_service.py` | 3 |
| Preauth/Emergency APIViews | `backend/hmis/apps/billing/sha_ilm_preauth_views.py` | 3 |
| Frontend Zod schemas | `web-app/lib/schemas/sha.schema.ts` | 1b/2/3 |
| Frontend API client | `web-app/lib/api/sha.ts` | 1b/2/3 |
| Frontend panels | `web-app/components/billing/sha/{ClaimILMPanel,PreVisitChecksPanel}.tsx` | 1b/2 |

---

## 3. Phase 0 — Foundation ✅

Establishes the substrate every later phase reuses.

- `DHAError` hierarchy (`ValidationError`, `Unauthorized`, `NotFound`,
  `RateLimited`, `ClientError`, `Server`, `Timeout`, `Transport`, `Unknown`)
  + `DHAError.from_status(status, payload)` factory.
- `IlmClient(get|post|put|patch|delete|post_multipart)`:
  - injects auth headers from `SHAAuthService`
  - retries transport / 5xx up to `ILM_MAX_RETRIES` with exponential backoff
  - writes `DHAOutboundCall` rows (success and failure) with PII redaction
  - returns parsed JSON + raw response so callers can read headers
- `MultipartFile` / `build_multipart()` — streams from any Django storage
  backend, 10 MB cap.
- `consent_token_resolver` — looks up consent tokens on encounters /
  claims / patients for `claims/otp` and OTP-whitelist flows.
- `core.DHAOutboundCall` — admin-readable audit row.

**Tests**: `tests/billing/test_ilm_client.py` (10 tests).

---

## 4. Phase 1 + 1b — Claim build, dispatch & lifecycle ✅

Wraps the **15 claim-lifecycle operations** behind `IlmClaimService`,
exposes them as ViewSet actions on `SHAClaimViewSet`, and surfaces them
in the `ClaimILMPanel` UI on the SHA Claim detail page.

| Operation | DHA endpoint | Service method | Action |
|---|---|---|---|
| Start visit | `POST /claims/visit` | `start_visit` | `POST /api/sha/claims/{id}/ilm/start-visit/` |
| Add intervention | `POST /claims/interventions` | `add_intervention` | `POST .../ilm/intervention/add/` |
| Switch intervention | `POST /claims/interventions/switch` | `switch_intervention` | `.../ilm/intervention/switch/` |
| Retire intervention | `POST /claims/interventions/retire` | `retire_intervention` | `.../ilm/intervention/retire/` |
| Restore intervention | `POST /claims/interventions/restore` | `restore_intervention` | `.../ilm/intervention/restore/` |
| Add diagnosis | `POST /claims/diagnoses` | `add_diagnosis` | `.../ilm/diagnosis/add/` |
| Update diagnosis | `PATCH /claims/diagnoses` | `update_diagnosis` | `.../ilm/diagnosis/update/` |
| Add line | `POST /claims/lines` | `add_line` | `.../ilm/line/add/` |
| Update line | `PATCH /claims/lines` | `update_line` | `.../ilm/line/update/` |
| Edit line | `PATCH /claims/lines/edit` | `edit_line` | `.../ilm/line/edit/` |
| Resubmit line | `POST /claims/lines/resubmit` | `resubmit_line` | `.../ilm/line/resubmit/` |
| Add attachment | `POST /claims/attachments` | `add_attachment` | `.../ilm/attachment/add/` |
| Preview claim | `POST /claims/preview` | `preview` | `.../ilm/preview/` |
| Submit claim | `POST /claims/submit` | `submit` | `.../ilm/submit/` |
| Close claim | `POST /claims/close` | `close` | `.../ilm/close/` |

**SHAClaim tracking fields** (added in Phase 1, exposed read-only in
`SHAClaimSerializer`): `dha_external_id`, `dha_correlation_id`,
`last_dha_status`, `last_dha_payload`, `last_dha_called_at`.

**Domain events** (9): `DHA_CLAIM_VISIT_STARTED`,
`DHA_CLAIM_INTERVENTION_CHANGED`, `DHA_CLAIM_DIAGNOSIS_CHANGED`,
`DHA_CLAIM_LINE_CHANGED`, `DHA_CLAIM_ATTACHMENT_CHANGED`,
`DHA_CLAIM_PREVIEWED`, `DHA_CLAIM_SUBMITTED`, `DHA_CLAIM_CLOSED`,
`DHA_CLAIM_CALL_FAILED`.

**Tests**: 21 service + 21 ViewSet = 42 passing.

**Frontend**: `ClaimILMPanel.tsx` renders the lifecycle as a series of
guarded buttons; calls 15 `shaApi.ilm*` methods that all parse responses
through Zod schemas in `sha.schema.ts`.

---

## 5. Phase 2 — Pre-visit registries & eligibility ✅

`IlmRegistriesService` wraps the **8 read-only operations** needed
*before* a clinical visit can be costed against SHIF. Two new tenant-
scoped models persist the results:

- **`PatientContact`** — phone / email / next-of-kin contacts fetched
  from DHA's patient registry (insert-only audit; `dha_contact_id` for
  dedupe; `raw_payload` JSON).
- **`SHACoverageSnapshot`** — every eligibility / benefits family fetch
  records a row keyed by `(patient, snapshot_type, fetched_at desc)`.
  `snapshot_type ∈ {eligibility, benefits, sub_benefits, benefits_interventions, utilization}`.
  Includes `payload`, `request_params`, `http_status`, `correlation_id`,
  `fetched_by` user FK.

| Operation | DHA endpoint | Service method | API |
|---|---|---|---|
| Facility search | `GET /facilities/search` | `search_facility` | `GET /api/sha/ilm/registries/facility-search/` |
| Patient lookup | `GET /patients` | `lookup_patient` | `.../registries/patient-lookup/` |
| Professional search | `GET /professionals` | `search_professional` | `.../registries/professional-search/` |
| Eligibility | `GET /patients/eligibility` | `check_eligibility` | `.../eligibility/` |
| Benefits | `GET /patients/benefits` | `fetch_benefits` | `.../benefits/` |
| Sub-benefits | `GET /patients/sub-benefits` | `fetch_sub_benefits` | `.../sub-benefits/` |
| Benefit interventions | `GET /patients/benefits/interventions` | `fetch_benefit_interventions` | `.../benefit-interventions/` |
| Utilization | `GET /patients/benefits/utilization` | `fetch_utilization` | `.../utilization/` |

Plus a 9th endpoint: `GET|POST /api/sha/ilm/patient-contacts/` for the
local `PatientContact` cache.

**Domain events** (8): `DHA_REGISTRY_FACILITY_QUERIED`,
`DHA_REGISTRY_PATIENT_QUERIED`, `DHA_REGISTRY_PROFESSIONAL_QUERIED`,
`DHA_ELIGIBILITY_CHECKED`, `DHA_COVERAGE_SNAPSHOT_REFRESHED`,
`DHA_PATIENT_CONTACT_FETCHED`, `DHA_PATIENT_CONTACT_CREATED`,
`DHA_REGISTRY_CALL_FAILED`.

**Tests**: 12 service + 21 ViewSet = 33 passing.

**Frontend**: `PreVisitChecksPanel.tsx` — tabbed (Eligibility /
Benefits / Registries) panel embedded above `ClaimILMPanel` on the SHA
Claim detail page when `claim.claim_flow === 'shif'`. Auto-records
snapshots when `patient_pk` is known.

---

## 6. Phase 3 — Preauth & Emergency ✅

Wraps the **10 operations** that govern preauthorisation requests,
emergency-room admissions, and EMT transport claims.

| Cluster | Endpoint | Notes |
|---|---|---|
| Preauths | `GET /preauths` | List preauths for a claim / patient |
| Preauths | `POST /preauths` | Create preauth request (multipart) |
| Preauths | `POST /preauth/cancel` | Plural-vs-singular path conflict; we use **singular** per OpenAPI, with **plural fallback** on 404 |
| Preauths | `DELETE /preauths/diagnoses/{icd_code}` | Remove diagnosis from preauth (icd_code in path AND body) |
| Preauths | `DELETE /preauths/doctors` | Remove doctor from preauth |
| Doctor consent | `POST /claims/doctor-consent` | Async doctor approval request |
| Emergency | `POST /claims/emergency` | Open an emergency claim |
| Emergency | `GET /claims/emergency/protocols` | List active emergency protocols |
| Emergency | `POST /claims/emergency/protocols` | Apply a protocol to a claim (multipart) |
| EMT | `POST /claims/emt` | Emergency medical transport claim |

**New models**:
- **`SHAPreauth`** (`FacilityScopedModel`): tracks `dha_external_id`,
  `status` (DRAFT/SUBMITTED/APPROVED/DENIED/CANCELLED), `request_payload`,
  `response_payload`, `correlation_id`, `claim` FK, `patient` FK,
  `consent_token` + `intervention_code` (UniqueConstraint as natural key),
  `diagnoses` JSON, `doctor_consent_state`, plus `requested_by` /
  `decided_by` / `submitted_at` / `decided_at` / `cancelled_at`.
- **`SHAEmergencyClaim`** (`FacilityScopedModel`, insert-only audit):
  `kind` (EMERGENCY/EMT), `status`, `consent_token`, `reference_number`,
  `case_number`, `beneficiary_cr_id`, `brought_by`, `mode_of_arrival`,
  `interventions` JSON, `diagnoses` JSON, `dha_external_id`,
  `correlation_id`, `opened_by`. Patient FK is nullable to support the
  unidentified-patient case.

**New events (11)**: `DHA_PREAUTH_CREATED`, `DHA_PREAUTH_FETCHED`,
`DHA_PREAUTH_CANCELLED`, `DHA_PREAUTH_DIAGNOSIS_REMOVED`,
`DHA_PREAUTH_DOCTOR_REMOVED`, `DHA_PREAUTH_DOCTOR_CONSENT_REQUESTED`,
`DHA_EMERGENCY_OPENED`, `DHA_EMERGENCY_PROTOCOL_LISTED`,
`DHA_EMERGENCY_PROTOCOL_APPLIED`, `DHA_EMT_CLAIM_CREATED`,
`DHA_PREAUTH_CALL_FAILED`.

**URLs**: 12 paths under `/api/sha/ilm/preauth/...`,
`/api/sha/ilm/emergency/...`, `/api/sha/ilm/emt/`. The `/protocols/`
list (GET) and `/protocols/apply/` apply (POST) are split paths since
they are separate APIView classes.

**Tests**: 12 service tests + 28 view tests = **40 new tests**, all
green. Full billing suite: 1431 passing.

**Frontend**: 12 new `shaApi` methods (`ilmPreauthFetch`,
`ilmPreauthCreate`, `ilmPreauthCancel`, `ilmPreauthRemoveDiagnosis`,
`ilmPreauthRemoveDoctor`, `ilmDoctorConsent`, `ilmEmergencyOpen`,
`ilmEmergencyProtocolsList`, `ilmEmergencyProtocolApply`,
`ilmEmtCreate`, `listLocalPreauths`, `listLocalEmergencyClaims`) backed
by Zod schemas (`IlmPreauthResponseSchema`, `SHAPreauthSchema`,
`SHAEmergencyClaimSchema` plus 8 input schemas).

---

## 7. Phase 4–5 — planned (not yet started)

- **Phase 4 — Lifecycle polish (10 ops)**: OTP flows
  (`POST /claims/otp`, `POST /claims/otp/discharge`,
  `POST /patients/otp-whitelists`,
  `GET /patients/otp-whitelists/callback`), discharge
  (`POST /claims/discharge`), POMSF balances, uploads,
  `claims/doctors` add/remove, `next-of-kin/contacts`.
- **Phase 5 — ePrescriptions (4 ops, new Django app)**:
  prescriptions list / create / dispense / cancel.

---

## 8. Conventions for adding a new ILM op

1. **Service method** in the appropriate `Ilm*Service` class. Always
   route through `self.client.<verb>(path, ...)`. Catch nothing — let
   `DHAError` propagate.
2. **Result dataclass** with `payload`, `status_code`, optional
   `snapshot_id` / `external_id`. Publish events via `_publish_safe`.
3. **APIView (or @action)** that:
   - Resolves tenant / patient / claim from request data.
   - Calls the service.
   - Wraps errors with the module's `_ilm_handle_*_error()` helper.
   - Wraps event/audit best-effort calls in `contextlib.suppress(Exception)`.
4. **URL** under `/api/sha/...` (per-claim → `claims/{id}/ilm/...`,
   standalone → `/api/sha/ilm/...`).
5. **Permissions**: `[IsAuthenticated]` for standalone APIViews;
   `SHAPermission` only on ViewSets that have model-bound actions.
6. **Tests**:
   - Service test in `tests/billing/test_ilm_*_service.py`
     (mock `IlmClient`).
   - View test in `tests/billing/test_api/test_sha_ilm_*_views.py`
     (use the shared `sha_client` fixture; `# ruff: noqa: F811` for
     the cross-file fixture imports).
7. **Events**: add constants to `core/events/types.py::BillingEvents`,
   wire in service, register in `docs/domain-events.md`.
8. **Frontend**:
   - Zod schema in `web-app/lib/schemas/sha.schema.ts`.
   - API method in `web-app/lib/api/sha.ts` using `parseResponse()`.
   - UI in the relevant panel component.
9. **Docs**: update this file's phase tables + domain-events.md.

---

**Last updated**: April 30, 2026 — Phase 3 complete.

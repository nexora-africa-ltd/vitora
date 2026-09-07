<!--
Purpose: Implementation plan for DHA HIE claim, preauthorisation, and authorisation status callbacks.
Usage: Use this document to scope, implement, test, and roll out callback-driven DHA status updates.
Inputs: DHA callback payload/schema, status vocabulary, authentication contract, tenant identifiers, and facility FR codes.
-->

# DHA Status Callbacks Implementation Plan

## Implementation Direction

Replace periodic DHA claim and preauthorisation polling with callback-driven state reconciliation. Retain DHA read calls, but invoke them once after a received status-change notification when the full authoritative record is needed. Use polling only as a temporary rollout fallback, then remove its Celery schedules after callback delivery is proven reliable.

The app already has a starting point at `backend/hmis/apps/billing/sha_views_utility.py:1022` (`SHAWebhookView`) and public routes at `backend/hmis/apps/billing/sha_urls.py:150-156`. It is insufficient for the new contract because it:

- Handles only claim-shaped FHIR/simple payloads, not `claim`, `preauth`, and `authorization` callbacks.
- Does not persist deliveries or deduplicate retries.
- Uses an unscoped claim lookup at `sha_views_utility.py:1155`, creating cross-facility risk.
- Accepts missing signatures even when a webhook secret is configured.
- Logs the full incoming payload, which could expose patient or claim data.

## Required DHA Clarifications

Obtain these before implementation, because the provided documentation does not define them:

1. Exact callback JSON schema for each entity type, including field names for `entity_type`, `subject_guid`, `from_state`, `to_state`, provider claim number, consent token, facility FR code or tenant code, callback event/delivery ID, and emitted timestamp.
2. Complete status vocabularies and terminal states for claims, preauthorisations, and authorisations.
3. Delivery authentication details: header names and formats for `bearer_static`, `api_key`, `basic_auth`, `bearer_login`, and OAuth client credentials; whether DHA supports HMAC signing; and, if it does, the signature header, algorithm, and canonical body rules.
4. The read endpoint to call after each entity callback and the identifier expected by that endpoint.
5. Sandbox tenant ID/tenant code, whether endpoints are facility-specific, and the HIE process for provisioning `secret_ref` values.

Do not assume the current `X-SHA-Signature` HMAC scheme is supported by the new DHA callbacks.

## Target Design

Create a callback subsystem in `billing`, with three responsibilities:

| Component | Responsibility |
| --- | --- |
| `DHACallbackRegistration` | Tracks DHA endpoint and operation IDs per facility and entity type. |
| `DHAStatusCallbackDelivery` | Immutable, idempotent inbound-delivery journal and processing state. |
| `DHAStatusCallbackService` | Validates, resolves tenant/entity, reconciles state, audits, and publishes events. |

Each facility needs up to three remote DHA registrations:

| DHA entity type | Vitora target | Callback path |
| --- | --- | --- |
| `claim` | `SHAClaim` | `/api/sha/webhook/status/claim/` |
| `preauth` | `SHAPreauth`, with a transitional adapter for legacy `PreauthRequest` | `/api/sha/webhook/status/preauth/` |
| `authorization` | The persistent biometric/visit authorisation record | `/api/sha/webhook/status/authorization/` |

A single generic route such as `/api/sha/webhook/status/` is also acceptable if the documented payload reliably contains `entity_type`. Separate paths are preferable because they make registration, diagnostics, and ingress policy clearer.

All three routes should remain unauthenticated at Django/DRF level because DHA initiates the request, but must enforce DHA delivery authentication before parsing or processing the payload.

## Data Model

Add a facility-scoped `DHACallbackRegistration` model. One record per `(facility, entity_type, environment)` should store:

- `entity_type`: `claim`, `preauth`, or `authorization`.
- DHA tenant ID or tenant code used at endpoint creation.
- Facility FR code.
- `endpoint_id` and `operation_id`.
- Base URL, operation path, environment, auth type, and secret reference.
- Remote active state for the endpoint and operation.
- Last registration/verification result, timestamp, and a redacted remote response.
- A unique constraint on facility, entity type, and environment.

Add a facility-scoped `DHAStatusCallbackDelivery` model for durable handling:

- Remote event/delivery ID, if DHA provides one.
- `entity_type`, `subject_guid`, external reference, consent token, `from_state`, and `to_state`.
- Callback timestamp and received timestamp.
- SHA-256 body digest for retry deduplication.
- Allowlisted/redacted payload and selected headers.
- Signature/authentication outcome.
- Processing status: `received`, `processing`, `processed`, `failed`, or `quarantined`.
- Resolved facility, target model/object ID, processed timestamp, retry/error metadata.
- Uniqueness on DHA delivery ID when available.
- Fallback uniqueness based on a body digest when no provider delivery ID exists.

Do not store unrestricted raw headers or payloads in logs. Callback payloads can carry patient and financial context; persist only required fields plus a redacted evidence payload and body digest.

## Inbound Processing Flow

1. DHA sends `POST` to the registered status callback path.
2. The view validates content type, body size, JSON shape, and configured authentication.
3. Resolve the facility before touching a tenant record.
4. Prefer callback facility FR code; otherwise use an existing local correlation/reference mapping. Never resolve a claim globally by reference alone.
5. Persist `DHAStatusCallbackDelivery` inside a transaction.
6. If it is a duplicate already processed delivery, return `200` or `202` without publishing another notification.
7. On commit, enqueue `process_dha_status_callback(delivery_id)`.
8. Return `202 Accepted` only after durable storage succeeds. DHA receives a successful 2xx response and does not retry; Vitora owns subsequent task retries.
9. The Celery task locks the delivery and target record, validates that `from_state` is compatible with the local state, and applies the entity-specific transition.
10. If detailed adjudication, rejection, payment, doctor-consent, or authorisation metadata is required, make one DHA read request using the identifier DHA specifies for that entity.
11. Save the authoritative response, mark the delivery processed, audit it, publish the relevant domain event, and issue WebSocket/activity notifications only when the state actually changed.

A `from_state` mismatch must not silently overwrite local data. Store it as a reconciliation divergence, fetch the authoritative entity record, and surface an operations alert. This preserves DHA's intended benefit of detecting missed or out-of-order transitions.

## State Reconciliation

Keep one authoritative reconciliation service per entity. Both callbacks and any remaining manual refresh path must call that service rather than directly assigning status fields.

| Entity | Current implementation | Callback change |
| --- | --- | --- |
| Claims | `BillingAgentService._apply_status_update()` and `poll_sha_claim_statuses()` | Move callback reconciliation into a shared claim transition service and reuse existing adjudication/payment mapping. |
| ILM preauths | `poll_ilm_preauth_statuses()` directly updates `SHAPreauth.status` and `doctor_consent_state`. | Centralize transition and doctor-consent reconciliation in the model/service layer. |
| Legacy preauths | `SHAPreauthService.poll_status()` updates `PreauthRequest`. | Keep a temporary adapter only while legacy preauth remains supported. |
| Authorisations | `BiometricAuthorizeStatusView` directly reads DHA status on demand. | Persist DHA subject GUID/correlation data when authorisation starts, then process callbacks through the same status service. |

There are two active preauthorisation implementations:

- Legacy `PreauthRequest` with `PENDING`, `APPROVED`, `DENIED`, and `EXPIRED`.
- ILM `SHAPreauth` with `draft`, `submitted`, `approved`, `denied`, and `cancelled`.

Do not share a status mapper across them. Dispatch first on `entity_type`, then map into the target model's explicitly allowed vocabulary.

## DHA Registration Client

Implement a typed DHA callback-registration client, likely beside `IlmClient`, rather than registering endpoints manually in production.

The client should support:

- `GET /tenants/{tenant_id}/endpoints?entity_type=...`
- `POST /tenants/{tenant_id}/endpoints`
- `POST /tenants/{facility_fr_code}/endpoints/{endpoint_id}/operations`
- `PATCH /tenants/endpoints/{endpoint_id}`
- `PATCH /tenants/endpoints/operations/{operation_id}`
- Explicit pause/resume actions.
- A health/verification operation that checks stored DHA IDs and active state.

Registration rules to encode:

- Create exactly one endpoint per facility and entity type.
- Always populate `facility_fr_code` in the endpoint creation request.
- Use `production` or `sandbox`, never `prod`.
- Use the DHA tenant ID or tenant code only for endpoint creation.
- Use the facility FR code, not tenant code or a placeholder, in the operation-registration URL.
- Always create the operation with `action: "status_changed"` and `method: "POST"`.
- Store and use DHA's `endpoint_id` and `operation_id`, never internal DHA numeric IDs.
- Use tenant ID or facility FR code, not tenant code, when listing registrations.
- Treat an empty list carefully because DHA omits paused records from list responses.

Deliver the first operational interface as a privileged Django management command:

```bash
python manage.py configure_dha_callbacks --facility <id> --environment sandbox --verify
```

It should support `--dry-run`, `--entity-type`, `--pause`, `--resume`, and `--verify`. This is safer than exposing first-run remote registration through the general web UI. A facility-admin settings surface can follow once the workflow is stable.

## Authentication and Configuration

Add callback-specific configuration separate from outbound DHA credentials:

- Public callback base URL, required HTTPS outside development.
- Callback environment.
- Delivery authentication mode.
- DHA-issued `secret_ref` for registration.
- The locally stored verification secret or credential required to validate incoming delivery.
- Allowed DHA source-network controls if DHA provides stable egress ranges.
- Maximum payload size and replay/deduplication retention period.

For production:

- Reject requests when delivery authentication is absent, malformed, or invalid.
- Do not keep the current permissive behavior in `SHAWebhookView._verify_signature()`.
- Do not place credentials in DHA `headers`; DHA explicitly treats that configuration as non-secret.
- Keep all new environment variables synchronized across the project's required development, staging, production, Azure script, and GitHub Actions surfaces.

## Polling Migration

Current recurring polling is configured in `backend/hmis/celery.py`:

- Claims every 15 minutes: `poll_sha_claim_statuses`.
- Legacy preauth every 5 minutes: `poll_preauth_statuses`.
- ILM preauth every 5 minutes: `poll_ilm_preauth_statuses`.

Roll out in stages:

1. Keep existing polling active during sandbox and production shadow mode.
2. Register callbacks and confirm successful deliveries, tenant resolution, deduplication, and end-to-end UI notification behavior.
3. Switch callback processing to authoritative state updates.
4. Reduce polling to a temporary low-frequency reconciliation job, restricted to records without a recent callback or failed callback processing.
5. After agreed DHA reliability criteria are met, remove the three periodic status-polling schedules.
6. Retain explicit user-triggered refresh and the one post-callback read call where extra details are required.
7. Replace the frontend's 10-second doctor-consent polling with callback/WebSocket-driven query invalidation. Keep a manual refresh action for recovery.

Do not remove biometric authorisation polling until DHA confirms that the `authorization` callback covers the exact asynchronous authorisation states used by `BiometricAuthorizeStatusView`.

## Frontend Impact

The main frontend change is operational visibility rather than a new workflow:

- Add callback health to the SHA/DHA section of `web-app/app/(dashboard)/finance/payments-config/page.tsx`.
- Display registration health per entity type: registered, active, paused, unconfigured, last delivery, and last failure.
- Provide read-only endpoint/operation IDs and a privileged "verify configuration" action.
- Update claim and preauth views through existing WebSocket/domain-event mechanisms, with React Query invalidation as fallback.
- Remove language in `web-app/lib/api/sha.ts` that represents local cached status reads as DHA polling.
- Validate all new backend responses with Zod schemas and `parseResponse()`.

## Tests First

Add tests before implementation under `backend/tests/billing/`.

1. Registration client tests:
   - Correct endpoint and operation URLs.
   - Facility FR code is used in the operation route.
   - Correct handling of active-list filtering and paused registrations.
   - Remote IDs persisted and reused.
   - DHA's unusual validation failures returned as `500` are surfaced with actionable context.
2. Callback authentication tests:
   - Valid credential/signature accepted.
   - Missing or invalid authentication rejected in production.
   - No sensitive payload is emitted to logs.
3. Delivery durability tests:
   - Duplicate DHA delivery produces one state change, one event, and one notification.
   - Callback task is queued only after transaction commit.
   - Failed processing is retryable without losing the original delivery.
   - Unknown, ambiguous, or cross-facility references never update another facility's records.
4. Entity reconciliation tests:
   - Claim callback updates state and applies fetched adjudication data.
   - Preauth callback updates ILM state and doctor-consent state through the shared transition service.
   - Authorisation callback maps only its own state vocabulary.
   - Invalid entity-state combinations are quarantined.
   - `from_state` divergences create a reconciliation result instead of silently overwriting local state.
5. Integration tests:
   - Full remote registration sequence for claim, preauth, and authorisation.
   - Inbound callback through final public routes.
   - EventStore, audit log, activity feed, and facility WebSocket notification behavior.
   - Legacy FHIR/simple webhook compatibility during migration, followed by its planned removal.

## Recommended Delivery Sequence

1. Confirm DHA payload/authentication contracts and status vocabularies.
2. Build callback models, migrations, registration client, and management command.
3. Replace the current webhook internals with the durable authenticated callback-ingestion flow while retaining the existing route as the canonical address.
4. Implement claim callbacks first, because the current claim webhook and `BillingAgentService` give the shortest migration path.
5. Add ILM preauth callbacks and eliminate duplicate direct-update logic between the task and doctor-consent poll view.
6. Add authorisation callbacks after confirming the local persistence model and DHA correlation identifier.
7. Run sandbox shadow mode with polling enabled.
8. Production-enable callbacks facility by facility.
9. Reduce then retire periodic polling after delivery and reconciliation metrics meet the agreed threshold.

The most important implementation choices are durable idempotent receipt before `2xx`, facility resolution before record lookup, entity-specific state mapping, and treating callbacks as notifications that trigger one authoritative read when details are needed.

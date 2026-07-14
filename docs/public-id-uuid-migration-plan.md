# Public UUID Plan for Externally Exposed Entities

## Goal

Introduce a stable `public_id` UUID for entities exposed through APIs, links, QR codes, and sync payloads while retaining existing integer primary keys (`BigAutoField`) internally.

This is a boundary hardening and interoperability change, not a full primary-key migration.

## Kickoff Status (2026-07-14)

Completed in initial implementation pass:

- Added `public_id` UUID fields to Wave 1 models:
  - `patients.Patient` (+ `HistoricalPatient`)
  - `encounters.Encounter` (+ `HistoricalEncounter`)
  - `billing.Invoice`
  - `inpatient.Admission`
  - `pharmacy.Prescription` (+ `HistoricalPrescription`)
  - `pharmacy.Dispensing`
- Added migrations for all above models with phased DB-safe flow per app:
  - add nullable field
  - backfill existing rows via `RunPython`
  - enforce final constraints/defaults (`unique=True` on live tables)
- Added UUID read support for Patient retrieve in `PatientViewSet` while preserving integer ID compatibility.
- Added `public_id` to `PatientSerializer` response payload.
- Added API test coverage for patient retrieval by UUID and kept legacy integer retrieval test passing.

Next recommended step:

- Apply the same dual-lookup + serializer exposure pattern to Encounter and Invoice endpoints, then move to Admission and Pharmacy routes.

## Why This Approach

- Keeps internal joins and foreign keys unchanged (low migration risk).
- Reduces identifier enumeration risk in external surfaces.
- Makes IDs globally unique for offline/mobile sync and third-party integrations.
- Enables future storage/topology changes without breaking API contracts.

## Scope

### In Scope

- Add `public_id` to selected models currently exposed externally.
- Backfill existing rows.
- Expose/read by `public_id` in API serializers/routes.
- Update mobile/web clients to use `public_id` for navigation and API lookups.
- Add indexing, uniqueness constraints, tests, and observability.

### Out of Scope

- Replacing internal integer PKs.
- Rewriting internal FK graphs to UUID.
- One-shot breaking API version cutover.

## Candidate Entities (Initial Wave)

Start with high-exposure entities used in routes and external links:

- Patient
- Encounter
- Invoice
- Admission
- Prescription / Dispense artifacts

Finalize exact list from endpoint inventory before implementation.

## Design Standard

For each selected model:

- New field: `public_id = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True, editable=False)`
- Keep `id` as `BigAutoField` primary key.
- API representation returns `public_id` (string) as canonical external identifier.
- Server lookup uses `public_id` for external read/write endpoints.
- Internal service-layer logic may continue using integer `id`.

## Phased Rollout

## Phase 0 - Discovery and Contract Mapping

- Inventory endpoints that expose integer IDs in path/query/response.
- Inventory mobile/web route params currently parsed via `Number(...)`.
- Identify external docs/integrations depending on integer IDs.
- Define API compatibility strategy per endpoint (dual support vs versioned path).

Deliverable: endpoint matrix with migration status and owner.

## Phase 1 - Schema Introduction

- Add nullable `public_id` fields to Wave 1 models.
- Generate/apply migrations with indexes.
- Backfill all existing rows in batches.
- Add `NOT NULL` + `UNIQUE` constraints after successful backfill.

Safety notes:

- Use chunked backfill management command to avoid long locks.
- Add progress logging and restart-safe cursoring.

Deliverable: all target rows have unique non-null `public_id`.

## Phase 2 - Read Path Dual Support

- Update DRF serializers to include `public_id`.
- Update viewsets/lookups to accept UUID on external endpoints.
- Keep existing integer lookup temporarily where needed for compatibility.
- Prefer emitting URLs with `public_id`.

Deliverable: clients can read resources by `public_id`; responses include it everywhere.

## Phase 3 - Client Adoption (Mobile/Web/Desktop)

- Update route params from numeric to string UUID where applicable.
- Remove `Number(params.id)` assumptions in screens using migrated entities.
- Update query hooks/API clients to pass UUID identifiers.
- Verify deep links, QR flows, and cached/offline references.

Deliverable: first-party clients operate on `public_id` end-to-end.

## Phase 4 - Write Path and External Surface Switch

- Update create/update payloads and nested references to use `public_id`.
- Add explicit translation layer where internal integer FK is still required.
- Update public docs and integration guides.
- Emit deprecation warnings for integer-based external usage.

Deliverable: external write operations accept/expect `public_id`.

## Phase 5 - Deprecation and Cleanup

- Remove integer ID acceptance from public endpoints after deprecation window.
- Remove temporary dual-lookup branches.
- Keep admin/internal endpoints free to use integer IDs as needed.

Deliverable: stable external UUID-only contract for migrated entities.

## API Compatibility Strategy

Use a per-endpoint strategy:

- Prefer non-breaking dual support first:
  - Path form: accept both `<int:pk>` and `<uuid:public_id>` routes or a UUID-only new route.
  - Query/body refs: accept both during deprecation window, prioritize UUID.
- Return both during transition:
  - `id` (legacy) and `public_id` (canonical)
  - mark `id` deprecated in docs/changelog.

Recommended deprecation window: 2-3 release cycles.

## Data Migration Details

- Migration A: add nullable `public_id` fields + index.
- Job: backfill in chunks (for example, 5k rows per batch).
- Migration B: enforce `NOT NULL` and `UNIQUE`.
- Add integrity check command:
  - null count per table
  - duplicate count per table
  - missing references in serialized payloads

## Testing Plan

- Unit tests for model defaults/uniqueness.
- API tests for UUID lookup, integer fallback (during transition), and serializer outputs.
- Contract tests for mobile/web API clients.
- Regression tests for permissions/object-level access with UUID lookups.
- Load tests on UUID-indexed lookups for high-traffic endpoints.

## Observability and Guardrails

- Log identifier type used per endpoint (`int` vs `uuid`).
- Dashboard migration progress by endpoint/client version.
- Alert on spikes in 404/400 after route changes.
- Track remaining legacy integer traffic to drive cutoff date.

## Risks and Mitigations

- Breaking client routes expecting numeric IDs.
  - Mitigation: dual read support + staged client rollout.
- Hidden integer assumptions in scripts/integrations.
  - Mitigation: endpoint inventory + integration communication + deprecation logs.
- Slow backfill on large tables.
  - Mitigation: chunked jobs, off-peak execution, resumable backfill.

## Definition of Done

- All Wave 1 models have non-null unique indexed `public_id`.
- External APIs for Wave 1 entities are UUID-first.
- First-party clients no longer require integer IDs for Wave 1 flows.
- Documentation updated with UUID-based examples.
- Legacy integer paths removed or explicitly scoped to internal-only APIs.

## Suggested Execution Order

1. Patient
2. Encounter
3. Invoice/Billing
4. Admission/Inpatient
5. Pharmacy artifacts

This order minimizes blast radius by migrating foundational entities first.

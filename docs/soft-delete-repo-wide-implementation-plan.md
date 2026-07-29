# Soft Delete Repo-wide Implementation Plan

## Objective

Introduce a consistent, auditable soft-delete strategy across backend domains, with safe API behavior, sync/offline correctness, and phased rollout to reduce risk.

## Why This Matters

- Prevent accidental destructive deletes for clinical and financial data.
- Enable restore/undo workflows.
- Preserve audit/compliance trail (who deleted, when, why).
- Support controlled retention and eventual purge policy.

## Scope

In scope:

- Django model soft-delete framework (mixin, manager, queryset).
- API delete/restore semantics.
- Query filtering conventions across services/views/serializers.
- Sync/offline tombstone behavior.
- Testing, migration strategy, and operational playbooks.

Out of scope (initially):

- Full conversion of every model in one release.
- Changing immutable audit logs to soft-deletable records.

---

## Phase 0 - Discovery and Prioritization (1 week)

### Goals

- Classify models by business criticality and delete risk.
- Identify unique constraints, high-write tables, and sync-sensitive tables.
- Define rollout order and acceptance criteria.

### Tasks

1. Inventory models by app and classify:
   - Critical transactional: billing, claims, prescriptions, referrals, admissions.
   - Clinical records with legal/audit implications.
   - Reference/config tables (likely no soft delete needed).
2. Map current delete paths:
   - DRF `destroy` actions.
   - Service-level `.delete()` calls.
   - Background jobs/management commands.
3. Identify uniqueness constraints that require conditional uniqueness (`deleted_at IS NULL`).
4. Identify sync materializer and client flows requiring tombstones.

### Deliverables

- Model inventory spreadsheet/list.
- Prioritized rollout cohorts (Wave 1/2/3).
- Risk register for high-impact models.

---

## Phase 1 - Core Soft Delete Framework (1 week)

### Goals

Create reusable primitives in `core` to avoid per-model reinvention.

### Tasks

1. Add reusable abstractions in `backend/hmis/apps/core/`:
   - `SoftDeleteQuerySet` with `.alive()`, `.deleted()`, `.with_deleted()`.
   - `SoftDeleteManager` defaulting to alive records.
   - `SoftDeleteModel` abstract mixin with:
     - `deleted_at`
     - `deleted_by`
     - `delete_reason`
     - methods: `soft_delete(user, reason)`, `restore()`, `hard_delete()`
2. Define conventions:
   - `objects` = alive-only manager.
   - `all_objects` = unrestricted manager.
3. Add coding standards section for soft delete usage.

### Deliverables

- Core soft-delete module + unit tests.
- Developer guideline snippet in docs/coding standards.

---

## Phase 2 - API and Service Semantics (1 week)

### Goals

Ensure all delete flows become soft-delete by default and remain explicit/consistent.

### Tasks

1. Introduce DRF mixin/pattern for soft-destroy behavior.
2. Add optional restore endpoints where needed:
   - `POST /<resource>/<id>/restore/`
3. Standardize list/retrieve behavior:
   - Hide deleted by default.
   - Optional `include_deleted=true` for privileged roles.
4. Update service-layer calls from `.delete()` to `.soft_delete(...)` where explicit actor context exists.
5. Add audit logging for soft delete and restore events.

### Deliverables

- API behavior contract documented.
- Shared DRF helper for soft delete.

---

## Phase 3 - Database Migration Pattern (1-2 weeks, ongoing per wave)

### Goals

Add soft-delete fields safely and preserve uniqueness/business invariants.

### Tasks

1. For each target model, add migration for:
   - `deleted_at` (indexed)
   - `deleted_by` (nullable FK)
   - `delete_reason` (optional)
2. Convert uniqueness constraints to active-row constraints:
   - Use conditional `UniqueConstraint(..., condition=Q(deleted_at__isnull=True))`.
3. Backward compatibility checks for old queries and existing data.
4. Add DB-level indexes to avoid query regressions.

### Deliverables

- Migration templates/playbook.
- Per-wave migration PRs.

---

## Phase 4 - Wave-based Model Adoption (4-8 weeks)

### Wave 1 (High value, lower coupling)

- Start with modules where delete risk is high but relationships are manageable.
- Candidate examples:
  - referrals
  - selected billing artifacts with straightforward ownership

### Wave 2 (Core transactional models)

- Billing invoice/payment/receipt/credit-note surfaces.
- SHA claim-related entities where deletion should be reversible and auditable.

### Wave 3 (Complex relationship graphs)

- Models with deep child trees, aggregate reports, or sync-heavy behavior.
- Any domain where soft-delete propagation rules are non-trivial.

### Tasks per model

1. Convert model to `SoftDeleteModel`.
2. Update managers/querysets and all app queries.
3. Update DRF viewset destroy/restore behavior.
4. Add unit/integration tests.
5. Validate reporting and dashboards exclude deleted rows unless requested.

### Deliverables

- Completion checklist per model.
- Release notes by wave.

---

## Phase 5 - Sync/Offline and Frontend Alignment (parallel with Waves 1-3)

### Goals

Ensure deleted records do not reappear and clients react predictably.

### Tasks

1. Emit tombstone semantics in sync payloads.
2. Update materializer logic to treat `deleted_at` as authoritative deletion state.
3. Ensure client caches/query layers drop or mark deleted records.
4. Update any UI lists/details/actions to handle deleted status when included.

### Deliverables

- Sync contract update.
- End-to-end tests for online/offline delete + restore.

---

## Phase 6 - Operations, Retention, and Purge (1 week)

### Goals

Close lifecycle with policy-based hard purge and observability.

### Tasks

1. Add management command:
   - `purge_soft_deleted --older-than-days N --apps ... --dry-run`
2. Add safety guardrails:
   - dry-run default
   - audit log of purge batches
3. Define retention by domain (clinical vs financial vs operational).
4. Add dashboards/alerts:
   - soft-deleted row growth
   - restore rates
   - purge job outcomes

### Deliverables

- Retention policy doc.
- Purge runbook.

---

## Testing Strategy

For each converted model:

- Unit tests:
  - `delete()` performs soft-delete.
  - default manager excludes deleted.
  - `all_objects` includes deleted.
  - `restore()` reactivates record.
- API tests:
  - `DELETE` hides record from normal list.
  - privileged include-deleted behavior.
  - restore endpoint permissions.
- Integration tests:
  - related-object behavior (children, aggregates).
  - sync tombstone and restore round-trips.
- Regression tests:
  - uniqueness after soft delete.
  - reporting totals unaffected by deleted rows.

## Risks and Mitigations

- Query regressions from missed filters.
  - Mitigation: enforce manager conventions + grep checks + code review checklist.
- Unique constraint collisions after soft delete.
  - Mitigation: conditional unique constraints in same migration wave.
- Sync/client resurrection bugs.
  - Mitigation: explicit tombstone tests before wave rollout.
- Performance overhead.
  - Mitigation: `deleted_at` indexing and query plan checks on high-traffic endpoints.

## Success Criteria

- No hard deletes on in-scope transactional models via normal APIs.
- Restore path available for all wave-converted models.
- Reporting and dashboards remain accurate.
- Sync/offline clients correctly honor deletion state.
- Operational purge mechanism in place and audited.

## Suggested Timeline (High-level)

- Weeks 1-2: Phases 0-2 complete.
- Weeks 3-8: Phases 3-5 in wave rollout.
- Week 9: Phase 6 hardening and operationalization.

## First PR Recommendation

Implement a foundational PR that includes:

1. Core soft-delete abstractions in `core`.
2. One pilot model conversion (low coupling, meaningful usage).
3. DRF soft-delete mixin + restore endpoint pattern.
4. End-to-end tests for pilot model.

This creates a repeatable template for all follow-on waves.

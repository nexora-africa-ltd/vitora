# Organization/Facility Public UUID Migration Checklist

## Goal

Introduce `public_id` UUID identifiers for `Organization` and `Facility` as external IDs, while keeping internal integer PKs unchanged.

## Scope

- In scope: backend schema + dual lookup + tenant context compatibility + first-party client adoption.
- Out of scope: internal PK replacement, one-shot breaking API cutover.

## Rollout Strategy

- UUID-first, compatibility-preserving rollout.
- Dual support (`int` + `uuid`) during migration window.
- Cutover only after telemetry shows near-zero legacy int usage.

---

## PR Checklist (PR-sized tasks)

### PR 1 - Schema: add `public_id` fields and backfill

- [ ] Add `public_id = UUIDField(default=uuid.uuid4, unique=True, db_index=True, editable=False)` to:
  - `core.Organization`
  - `core.Facility`
- [ ] Add migration sequence (safe pattern):
  - add nullable field
  - `RunPython` backfill
  - enforce `NOT NULL` + `UNIQUE`
- [ ] Add/confirm DB indexes.

Acceptance:

- [ ] Existing rows have unique non-null `public_id`.
- [ ] `python manage.py makemigrations --check` is clean.
- [ ] Migration applies/rolls back in local/staging.

---

### PR 2 - Backend lookup support for org/facility endpoints

- [ ] Add UUID/int dual-lookup to `OrganizationViewSet` and `FacilityViewSet` (reuse `PublicIdLookupMixin`/resolver pattern).
- [ ] Keep legacy int lookup compatibility.
- [ ] Return `public_id` in org/facility serializers.

Acceptance:

- [ ] `GET /api/organizations/{int|uuid}/` works.
- [ ] `GET /api/facilities/{int|uuid}/` works.
- [ ] Existing int-based tests still pass.

---

### PR 3 - Tenant context compatibility (`X-Facility-Id`)

- [ ] Update facility resolution in middleware/mixins/dashboard views to accept either int or UUID in `X-Facility-Id`.
- [ ] Keep current access-control semantics unchanged.
- [ ] Add explicit warnings/logging when legacy int header is used.

Acceptance:

- [ ] Requests with UUID header resolve facility correctly.
- [ ] Requests with int header still resolve.
- [ ] Invalid IDs fail safely (no tenant leakage).

---

### PR 4 - WebSocket + realtime route compatibility

- [ ] Update websocket route patterns to accept UUID-shaped facility IDs (not only `\d+`).
- [ ] Update websocket middleware resolution to int/UUID.
- [ ] Keep existing clients working.

Acceptance:

- [ ] `ws/dashboard/{facility_uuid}/` connects.
- [ ] `ws/sync/{facility_uuid}/` connects.
- [ ] Existing numeric path clients still connect.

---

### PR 5 - Auth/session payload additions

- [ ] Include `public_id` for facility/organization in login/session payloads (`/api/auth/login/`, `/api/staff/me/` responses where applicable).
- [ ] Preserve existing numeric `id` fields during transition.

Acceptance:

- [ ] Web/mobile/desktop clients can read `public_id` without breakage.
- [ ] Backward compatibility maintained (`id` still present).

---

### PR 6 - Web app API/types/schema updates (org/facility)

- [ ] Update `web-app/lib/api/facilities.ts` and `web-app/lib/api/organizations.ts` ID params to `string | number`.
- [ ] Update related types/schemas to include `public_id`.
- [ ] Remove route-param numeric coercion in affected admin/org/facility pages.

Acceptance:

- [ ] UUID URLs render for organization/facility admin pages.
- [ ] `npm run type-check` passes.
- [ ] Authenticated Playwright smoke passes for org/facility UUID routes.

---

### PR 7 - Web app tenant header + context migration

- [ ] Update facility context/client header plumbing to prefer `public_id` for `X-Facility-Id`.
- [ ] Keep fallback to numeric IDs until cutoff.

Acceptance:

- [ ] Scoped requests succeed with UUID facility context.
- [ ] No regression in module visibility/tenant scoping behavior.

---

### PR 8 - RBAC/membership/onboarding compatibility

- [ ] Update onboarding/invitation/join/membership endpoints to accept org/facility references as int or UUID.
- [ ] Update web admin forms and request payloads to send UUID where available.
- [ ] Keep legacy payload support.

Acceptance:

- [ ] Staff invite and membership updates work using UUID references.
- [ ] Existing numeric flows continue to work.

---

### PR 9 - Mobile + desktop adoption

- [ ] Mobile auth/facility types updated to carry `public_id` and tolerate string IDs where needed.
- [ ] Desktop bridge/hub sync pathing validated for UUID facility IDs end-to-end.
- [ ] Keep int compatibility during migration window.

Acceptance:

- [ ] Mobile login + scoped calls work with UUID context.
- [ ] Desktop sync/websocket works with UUID facility IDs.

---

### PR 10 - Telemetry, dashboards, and cutoff policy

- [ ] Emit deprecation telemetry for org/facility legacy int lookups (same pattern as `public_id_lookup_deprecation_int`).
- [ ] Add Grafana panels for org/facility int-vs-uuid adoption.
- [ ] Define and document cutoff thresholds and date.

Acceptance:

- [ ] Dashboard shows int usage trend by route/viewset.
- [ ] Cutoff criteria documented and agreed.

---

### PR 11 - Deprecation and cleanup (post-threshold)

- [ ] Remove public int lookup acceptance for org/facility external endpoints.
- [ ] Remove temporary dual-lookup branches where no longer needed.
- [ ] Update docs/examples to UUID-only external contract.

Acceptance:

- [ ] External org/facility APIs are UUID-only.
- [ ] No active first-party client depends on int path IDs.

---

## Verification Matrix (run each PR)

- [ ] Backend targeted tests pass (`core`, `auth`, `rbac`, `onboarding`, `websocket/sync` as touched).
- [ ] `python manage.py check` passes.
- [ ] Web `npm run type-check` passes.
- [ ] Playwright authenticated UUID smoke passes for touched routes.
- [ ] No new 4xx/5xx spikes in staging logs for org/facility endpoints.

## Rollback Notes

- Schema PR uses additive changes first; rollback safe before int removal.
- Keep dual lookup until telemetry confirms readiness.
- Never remove int compatibility and header fallback in same PR as initial UUID adoption.

## Suggested Ownership

- Backend core/API: PR 1-5
- Web app: PR 6-8
- Mobile/desktop: PR 9
- Platform/observability: PR 10-11

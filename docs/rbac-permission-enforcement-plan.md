# RBAC Permission Enforcement Plan

## Goal
Enforce permissions consistently across backend APIs, frontend routes, and action controls so deep links and direct API calls cannot bypass RBAC.

## Operating Rule (Always)
- Every backend view/viewset/action must be RBAC-scoped (not auth-only), with create/read/update/delete access tied to explicit Django permissions and/or approved custom permission classes.
- Frontend affordances (routes, buttons, forms, links) must match backend permission requirements exactly; UI should not advertise actions a user cannot perform.
- Backend remains the source of truth; frontend parity is required UX hardening, not a substitute for API enforcement.

## Why
- Several endpoints currently use `permission_classes = [IsAuthenticated]` only.
- Some frontend pages rely on nav/action visibility but do not hard-guard route access.
- Result: users can sometimes open deep links they should not access.

## Places To Touch

### Backend (API enforcement)
Add/upgrade endpoint permission classes from authentication-only to permission-aware checks.

Priority modules with known `IsAuthenticated`-only surfaces:
- `backend/hmis/apps/cds/views.py`
- `backend/hmis/apps/scheduling/views.py` (read/detail and settings surfaces not already custom-gated)
- `backend/hmis/apps/clinics/views.py`
- `backend/hmis/apps/surveillance/views.py`
- `backend/hmis/apps/quality/views.py`
- `backend/hmis/apps/comments/views.py`
- `backend/hmis/apps/sick_notes/views.py`
- `backend/hmis/apps/ai/views.py` and related AI view modules

### Frontend (route guards + UX)
Add route-level checks using `hasPermission(...)` or `canAccessModule(...)` for pages that can be deep-linked.

Priority pages:
- `web-app/app/(dashboard)/cds/**`
- `web-app/app/(dashboard)/admin/**`
- `web-app/app/(dashboard)/scheduling/**` (settings/rules-heavy pages)
- additional modules above where API hardening is added

### Cross-cutting
- Keep centralized 401/403 handling in `web-app/lib/api/client.ts`.
- Add `required_permission` to backend deny responses where practical for better UX copy.

## Rollout Strategy

### Phase 1 (Kickoff)
- CDS end-to-end hardening:
  - backend permissions for rules/alerts
  - frontend route guards for rules list/detail

### Phase 2
- Scheduling read/detail/settings surfaces
- Admin and role/staff management pages

### Phase 3
- Clinics, surveillance, quality, comments, sick notes, AI

### Phase 4
- Consistency sweep:
  - standardize deny payload shape (`code`, `detail`, optional `required_permission`)
  - add targeted integration tests for unauthorized deep-link + API access

## Validation Checklist
- API returns 403 for unauthorized user on list/detail/action endpoints.
- Deep-linking to protected routes shows access denied (or redirects) without data fetch.
- Action buttons hidden/disabled where relevant; backend still authoritative.
- `npm run type-check` and `python manage.py check` pass.

## Kickoff Status
- Implemented: Phase 1 CDS hardening (backend + frontend rules route guards).

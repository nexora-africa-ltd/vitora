# React Admin Integration Plan

**Status**: Proposed
**Priority**: Medium
**Created**: March 7, 2026
**Target Surface**: Internal admin and back-office workflows only

---

## Executive Summary

This document outlines a safe, incremental plan to integrate React Admin into Vitora as a separate internal administration surface.

React Admin should **not** replace the main Next.js HMIS application. Vitora's core product is a workflow-heavy clinical system with offline-aware behavior, custom navigation, role-sensitive flows, and domain-specific state transitions. React Admin is a better fit for operational CRUD screens such as staff administration, roles, departments, audit logs, reference catalogs, and selected back-office review tools.

The recommended approach is to:

1. Keep the existing custom Next.js dashboard as the primary clinical application.
2. Introduce a dedicated admin console inside the web app under a clearly isolated route group.
3. Reuse existing authentication, API clients, and backend endpoints where practical.
4. Limit React Admin to modules where its list/filter/edit/show model provides actual leverage.

---

## Goals

1. Reduce implementation time for admin-heavy CRUD screens.
2. Improve consistency for internal data management tools.
3. Reuse backend APIs already exposed by Django REST Framework.
4. Avoid disrupting clinician-facing workflows and existing custom UX.
5. Preserve auditability, permissions, and privacy requirements.

## Non-Goals

1. Rebuilding the entire Vitora frontend in React Admin.
2. Moving patient care workflows into React Admin.
3. Replacing the current app shell, layout, or navigation for core HMIS users.
4. Storing or managing offline-first clinical workflows through React Admin abstractions.

---

## Why This Boundary

Vitora already has a custom frontend architecture optimized for clinical workflows:

1. App-wide providers and query behavior in `web-app/app/providers.tsx`.
2. A custom authenticated dashboard shell in `web-app/app/(dashboard)/layout.tsx`.
3. Centralized navigation in `web-app/lib/config/navigation.ts`.
4. A typed API layer under `web-app/lib/api/`.
5. Runtime schema validation under `web-app/lib/schemas/`.
6. Offline-aware query and sync concepts in `web-app/lib/query-client.ts` and `web-app/lib/context/sync-context.tsx`.

React Admin would duplicate or conflict with much of that if applied broadly. Its value is highest where pages are mostly:

1. List
2. Filter
3. Sort
4. Show
5. Edit
6. Bulk action

That matches admin modules much better than encounters, triage, admissions, pharmacy dispensing, lab workflows, or imaging operations.

---

## Recommended Scope

## In Scope For React Admin

### Phase 1 Candidates

1. Staff management
2. Roles and permissions
3. Departments
4. Audit logs

These already have an admin-oriented shape in the current app and are strong first candidates.

### Phase 2 Candidates

1. Clinical templates
2. Drug catalog and reference medication data
3. CDS rule administration
4. Feature flags and system settings
5. Lookup and reference tables

### Phase 3 Candidates

1. Finance review lists
2. Claims review queues
3. Operational exception handling dashboards with simple CRUD behavior

## Out Of Scope For React Admin

1. Patients
2. Check-in
3. Triage
4. Encounters
5. Emergency workflows
6. Inpatient admission and ward workflows
7. MCH care flows
8. Dispensing workflows
9. Laboratory workflows
10. Imaging viewing and reporting flows
11. Allied health care workflows
12. AI-assisted clinical workflows

These remain custom Next.js screens.

---

## Integration Model

## Recommended Option

Use React Admin as an isolated route group within the existing web app.

Example route structure:

```text
web-app/app/
  (dashboard)/...
  (admin-console)/
    admin/
      page.tsx
      layout.tsx
      staff/page.tsx
      roles/page.tsx
      departments/page.tsx
      audit-logs/page.tsx
```

### Why This Option

1. Keeps a single deployment unit.
2. Reuses the current auth token model.
3. Reuses existing backend APIs.
4. Avoids a separate repo or frontend deployment early.
5. Makes rollout and rollback easier.

## Alternative Option

Create a separate React Admin app only if:

1. The admin console needs a very different release cadence.
2. Internal operations users are clearly distinct from clinical users.
3. The admin surface grows large enough to justify independent ownership.

For now, that adds operational complexity without enough benefit.

---

## Technical Architecture

## Frontend Structure

Introduce a small adapter layer instead of wiring React Admin directly to raw endpoints everywhere.

Recommended folders:

```text
web-app/
  app/
    (admin-console)/admin/
  lib/
    react-admin/
      auth-provider.ts
      data-provider.ts
      permissions.ts
      resources.ts
      transforms.ts
  components/
    admin-console/
      admin-shell.tsx
      admin-dashboard.tsx
      fields/
      inputs/
```

## Auth Strategy

Use the existing JWT token storage and refresh behavior from the current API client.

Implementation principle:

1. React Admin `authProvider` should delegate to the same token source already used by `apiClient`.
2. Do not build a second authentication system.
3. Permission checks should continue to map to backend permissions.

## Data Provider Strategy

Build a custom React Admin `dataProvider` backed by Vitora's existing API conventions.

Key responsibilities:

1. Map React Admin resource operations to DRF endpoints.
2. Support paginated responses with `results` and `count`.
3. Normalize record `id` fields where needed.
4. Reuse existing transform logic where the frontend already adapts API payloads.
5. Handle DRF filters, search params, and sort translation.

## UI Strategy

Do not attempt to visually merge React Admin into the clinical dashboard at first.

Instead:

1. Use a distinct admin console shell.
2. Keep branding consistent enough to feel related.
3. Accept that React Admin has different interaction patterns.
4. Avoid deep theming work until the value is proven.

This is a pragmatic choice. Over-customizing React Admin early destroys most of its speed advantage.

---

## Backend Prerequisites

Before wiring React Admin screens, verify backend readiness for each target resource.

## Required API Characteristics

1. Stable list endpoints with pagination.
2. Stable detail endpoints.
3. Create and update endpoints where editing is allowed.
4. Filter and search support for high-volume resources.
5. Consistent permission enforcement.
6. Audit logging for mutation operations.

## Resource Readiness Checklist

Each candidate module should be checked for:

1. Serializer completeness
2. Query performance
3. Pagination behavior
4. Filtering support
5. Search behavior
6. Permission rules
7. Contract stability

If an endpoint is not already clean for generic CRUD, fix the endpoint first rather than forcing the complexity into React Admin.

---

## Delivery Phases

## Phase 0: Discovery And Guardrails

### Objectives

1. Confirm the exact modules that belong in the admin console.
2. Define what will never move into React Admin.
3. Validate backend readiness of first-wave resources.

### Tasks

1. Inventory current admin-like routes and API endpoints.
2. Confirm role model for admin-console access.
3. Define route prefix and naming convention.
4. Document resource inclusion criteria.
5. Define acceptance criteria for pilot success.

### Deliverables

1. Approved resource list
2. Admin-console route map
3. API readiness checklist per resource

---

## Phase 1: Pilot Foundation

### Objectives

Build the minimum viable React Admin foundation with one or two low-risk resources.

### Recommended Pilot Resources

1. Departments
2. Roles

These are low-risk, admin-oriented, and easy to validate.

### Tasks

1. Install React Admin and required peer dependencies.
2. Create `authProvider` using existing JWT token handling.
3. Create `dataProvider` for DRF list/get/create/update/delete patterns.
4. Create isolated admin layout and mount point.
5. Add resource definitions for departments and roles.
6. Add permission gate for admin-console entry.
7. Validate create, edit, list, and delete behavior.

### Success Criteria

1. Admin console loads without affecting the main app.
2. Departments and roles can be listed and edited successfully.
3. Permission boundaries are enforced correctly.
4. No new auth divergence is introduced.

---

## Phase 2: Core Admin Expansion

### Objectives

Expand to the most obvious admin resources after the pilot is stable.

### Target Resources

1. Staff
2. Audit logs
3. Departments
4. Roles and permissions

### Tasks

1. Add server-side filters for high-volume lists.
2. Add reusable field renderers for status, badges, and related entities.
3. Add read-only detail views where direct edits are unsafe.
4. Add export support where appropriate.
5. Add bulk actions only for operationally safe resources.

### Notes

Audit logs should likely be read-only.

Staff and roles may require custom forms if there are nested relationships or derived permission views.

---

## Phase 3: Reference Data And Configuration

### Objectives

Capture the parts of the platform that behave like managed catalogs or controlled configuration.

### Candidate Resources

1. Clinical templates
2. Drug catalog
3. Feature flags
4. Settings
5. Reference lists and lookup tables
6. CDS rule administration

### Tasks

1. Add richer filtering and search.
2. Add custom form sections for configuration-heavy resources.
3. Separate editable and read-only fields clearly.
4. Add audit trail visibility where useful.

---

## Phase 4: Selective Back-Office Operations

### Objectives

Use React Admin only for list-heavy, review-heavy operational areas where it clearly reduces delivery time.

### Candidate Resources

1. Claims review queues
2. Billing exception lists
3. Reconciliation worklists
4. Operational reporting control panels

### Guardrail

If a page starts needing complex workflow orchestration, stepped transitions, or embedded operational widgets, keep it in the custom app instead.

---

## Resource Selection Rubric

Use React Admin for a resource only if most of the following are true:

1. The page is mostly CRUD.
2. Users need sorting, filtering, and bulk actions.
3. The record lifecycle is simple.
4. The backend already exposes stable endpoints.
5. The page does not need offline-first behavior.
6. The page does not depend on complex step-based flow.
7. The page is primarily used by admins or back-office staff.

Do not use React Admin if most of the following are true:

1. The workflow is clinician-facing.
2. The page is step-based or task-sequenced.
3. The form depends on domain logic across multiple screens.
4. The screen requires custom real-time or sync-aware behavior.
5. The UI is operational, not editorial or administrative.

---

## Risks And Mitigations

## Risk 1: Second UX System In The App

React Admin introduces a different visual and interaction model.

### Mitigation

1. Keep it isolated to admin routes.
2. Avoid deep theming in the first iteration.
3. Position it as an internal console, not the main product shell.

## Risk 2: Auth Divergence

Running a second auth stack will create bugs.

### Mitigation

1. Reuse the existing token storage and refresh logic.
2. Build the React Admin `authProvider` as a thin adapter only.

## Risk 3: Data Provider Complexity

DRF endpoints and React Admin expectations may not align perfectly.

### Mitigation

1. Start with a small number of clean resources.
2. Add adapter utilities for pagination, filtering, and sorting.
3. Fix backend inconsistencies at the API layer when necessary.

## Risk 4: Scope Creep

The team may try to migrate increasingly complex modules into React Admin.

### Mitigation

1. Enforce the out-of-scope list.
2. Review every new candidate against the rubric.
3. Stop using React Admin where customization starts outweighing speed.

## Risk 5: Compliance Blind Spots

Admin tooling can accidentally loosen controls around sensitive data.

### Mitigation

1. Keep sensitive patient workflows out of React Admin.
2. Preserve backend permission checks.
3. Maintain audit logging for all admin mutations.

---

## Testing Strategy

## Frontend Tests

1. Admin route access control tests
2. Resource list rendering tests
3. Form submission tests
4. Data provider transformation tests
5. Permission-based visibility tests

## Backend Validation

1. Verify admin endpoints require authentication.
2. Verify permission boundaries for each resource.
3. Verify audit logs for create, update, and delete actions.
4. Verify pagination and filtering behavior on list endpoints.

## Manual Validation

1. Log in as an admin and access the console.
2. Log in as a non-admin and verify denial.
3. Create and edit pilot resources.
4. Confirm no clinical routes were affected.

---

## Implementation Checklist

## Foundation

- [ ] Approve resource scope for React Admin
- [ ] Confirm route strategy
- [ ] Confirm admin-only role and permission requirements
- [ ] Install React Admin dependencies
- [ ] Create isolated admin console layout

## Adapters

- [ ] Implement React Admin `authProvider`
- [ ] Implement React Admin `dataProvider`
- [ ] Add DRF pagination and filter adapters
- [ ] Add shared transformation utilities

## Pilot

- [ ] Add departments resource
- [ ] Add roles resource
- [ ] Validate create, edit, list, and detail flows
- [ ] Add route protection
- [ ] Add tests for access control and resource loading

## Expansion

- [ ] Add staff resource
- [ ] Add audit log resource
- [ ] Add selected reference data resources
- [ ] Add documentation for future resource inclusion

---

## Recommendation

Proceed only with a **small pilot**.

The correct success condition is not "Vitora now uses React Admin." The correct success condition is "Vitora gained a faster way to build internal admin CRUD screens without compromising the clinical product."

If the pilot shows that:

1. CRUD delivery gets faster,
2. Auth and permissions remain clean,
3. Backend adapters stay simple,
4. The UX split remains acceptable,

then continue expanding React Admin only across admin-oriented resources.

If the pilot requires heavy theming, complex endpoint exceptions, or workflow-style customizations, stop at the pilot and continue using the existing custom stack.

---

## Initial Recommendation For Vitora

Start with this exact pilot set:

1. Departments
2. Roles
3. Staff
4. Audit Logs

Do not move these into the pilot:

1. Patients
2. Encounters
3. Triage
4. Emergency
5. Inpatient workflows
6. Pharmacy dispensing
7. Laboratory workflows
8. Imaging workflows

This keeps the integration defensible, low-risk, and aligned with the product architecture.
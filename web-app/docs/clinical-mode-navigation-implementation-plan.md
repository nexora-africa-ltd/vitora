# Clinical Mode Navigation Implementation Plan

> Scope: Web frontend only
> Status: Proposed
> Last Updated: March 10, 2026

## Objective

Introduce a user-selectable navigation mode that lets clinical staff switch between:

- Standard Mode: the current module-based sidebar
- Clinical Mode: a workflow-oriented navigation model organized around patient journey steps

The mode switch will live under the Appearance tab on the Settings page.

Clinical Mode must remain fully compatible with the existing two-dimensional access model:

- RBAC: user role and action permissions
- Capability: facility module availability

Clinical Mode is a navigation and workflow presentation layer. It must not introduce a separate authorization model.

## Current Baseline

The current web app already has the required building blocks:

- Module-based navigation configuration in `lib/config/navigation.ts`
- Sidebar filtering by RBAC module access, action access, and facility module capability in `components/layout/sidebar.tsx`
- RBAC checks in `lib/hooks/use-permissions.ts`
- Facility capability checks in `lib/context/facility-context.tsx`
- Route-based RBAC guard in `lib/auth/guard.tsx`
- Patient journey state in `lib/stores/patient-journey.ts`
- Queue-oriented pages for triage and clinics
- An existing Appearance tab placeholder in `app/(dashboard)/settings/page.tsx`

## Guiding Principles

1. Clinical Mode must be an alternate view of existing workflows, not a replacement permission system.
2. A user should never gain access through Clinical Mode that they do not already have in Standard Mode.
3. Workflow labels should map to clinical worklists and state-based views, not department dashboards by default.
4. The toggle must be reversible, immediate, and persisted per user on the frontend.
5. The initial implementation should bias toward reuse of current pages and filters before creating new route surfaces.

## Expected UX

### Standard Mode

No behavioral change. This remains the default mode and preserves the current sidebar.

### Clinical Mode

The sidebar switches from module groups to workflow-oriented items for eligible users.

Proposed first-pass workflow items:

- Today's Queue
- Waiting for Triage
- Waiting for Consult
- In Progress
- Pending Results
- Ready to Close
- Completed Today

These labels should open either:

- an existing filtered page, or
- a thin workflow hub/worklist page that aggregates and links to existing queues

## Recommended Rollout Strategy

Implement this in two phases.

### Phase 1: Introduce Navigation Mode and Workflow Hub

Add the mode toggle and one new workflow landing page without replacing the entire sidebar behavior for every item.

This phase reduces risk by validating the concept before fully restructuring navigation.

### Phase 2: Sidebar Projection Swap

Once workflow mappings are validated, allow the sidebar to render either Standard or Clinical configuration from the same underlying permission and capability model.

## Architecture Plan

### 1. Add a Navigation Mode Preference Context

Create a lightweight client-side preference context, for example:

- `standard`
- `clinical`

Responsibilities:

- expose `navigationMode`
- expose `setNavigationMode()`
- persist to `localStorage`
- default to `standard`
- optionally constrain visibility so only relevant users can enable Clinical Mode

Recommended file:

- `lib/context/navigation-mode-context.tsx`

Wire it into the top-level provider stack in:

- `app/providers.tsx`

Reasoning:

- this keeps the setting globally available to the sidebar, header, and settings page
- it follows the same client-side preference pattern already used for sidebar collapse and dev facility override

### 2. Implement the Settings Toggle in Appearance

Replace the placeholder content in the Appearance tab with a real preference card.

Recommended UI:

- Card title: Navigation Mode
- Description: choose between module-based and workflow-based navigation
- Control: segmented control, radio group, or switcher with explicit labels
- Explanatory copy:
  - Standard Mode: organized by modules and departments
  - Clinical Mode: organized by patient workflow stages

Recommended file:

- `app/(dashboard)/settings/page.tsx`

Optional extraction:

- `components/settings/appearance-settings.tsx`

### 3. Keep Standard Nav as the Source of Truth for Permissions

Do not duplicate permission rules in a separate ad hoc workflow menu.

Instead, define workflow items as derived navigation items with explicit visibility predicates that reuse:

- `canAccessModule()`
- `canPerformAction()`
- `hasModule()`

Recommended new config file:

- `lib/config/clinical-navigation.ts`

Recommended shape:

```ts
type ClinicalNavItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
  isVisible: (ctx: ClinicalNavContext) => boolean;
  badgeCountKey?: string;
};
```

`ClinicalNavContext` should be built from existing permission and facility hooks.

### 4. Add a Navigation Resolver Layer

Update the sidebar to render navigation based on the current mode.

Recommended approach:

- preserve the existing `mainNavItems` for Standard Mode
- add `clinicalNavItems` for Clinical Mode
- centralize mode selection in a small resolver hook

Recommended file changes:

- `components/layout/sidebar.tsx`
- optional helper: `lib/hooks/use-navigation-items.ts`

The resolver should:

- return Standard items when mode is `standard`
- return Clinical items when mode is `clinical`
- apply the same permission and facility filtering pipeline in both cases

### 5. Fix Route Guard Drift Before Launching Clinical Mode

Current behavior and documented behavior are slightly out of sync.

Today, route guard logic checks module RBAC by path, but not facility capability. Since Clinical Mode will expose more direct workflow entry points, fix this first.

Recommended enhancement:

- extend route metadata so routes can declare both `moduleKey` and `facilityModule`
- have `RouteGuard` validate both when applicable

Recommended file:

- `lib/auth/guard.tsx`

This is a prerequisite for consistent behavior between sidebar visibility and direct URL access.

### 6. Use Workflow Pages and Filters, Not Department Dashboards

Clinical Mode should not send users to module dashboards unless the destination genuinely matches the workflow job they are trying to do.

Recommended first mappings:

| Clinical Item | First Route Target | Notes |
|---|---|---|
| Today's Queue | `/workflow/clinical` or a clinic queue overview | Better as a workflow hub than a single clinic page |
| Waiting for Triage | `/triage` | Existing queue-oriented destination |
| Waiting for Consult | `/clinics` or a new consult worklist | Should represent consult-ready patients, not clinic admin pages |
| In Progress | `/encounters?status=IN_PROGRESS` | May require encounter list filter support |
| Pending Results | `/encounters?status=RESULTS_PENDING` | Better than linking directly to lab dashboard |
| Ready to Close | `/encounters?status=READY_TO_CLOSE` | State-based clinician worklist |
| Completed Today | `/encounters?status=CLOSED&date=today` | State + date filter |

If current pages do not support these filters cleanly, build a dedicated workflow hub page first:

- `app/(dashboard)/workflow/clinical/page.tsx`

That page can surface cards and counts for each workflow bucket and defer deeper page specialization until later.

### 7. Use Patient Journey State as the Domain Model

Clinical Mode should align with the existing patient journey store instead of inventing a new state taxonomy.

Key stages already exist for:

- triage waiting
- consultation waiting/in progress
- lab and imaging readiness
- pharmacy readiness
- discharge completion

Use this model to drive labels, filters, and future badge counts.

This does not mean the sidebar itself should depend directly on client-only transient store data for authorization. It means the workflow categories should be semantically aligned to the same stage model.

### 8. Limit Clinical Mode Availability Initially

Recommended first release policy:

- enable Clinical Mode only for users in clinical role categories or explicitly allowed roles
- keep Standard Mode for administrative, billing, and operations-heavy users

This avoids forcing a workflow abstraction on users whose job is department-based rather than patient-journey-based.

Suggested initial eligible roles:

- DOCTOR
- CLINICAL_OFFICER
- NURSE
- possibly RECEPTIONIST for triage-heavy facilities

Suggested initial eligible role categories:

- `CLINICAL`

This can be enforced in the Appearance tab and in the sidebar resolver.

## Detailed Implementation Phases

### Phase 0: Foundation and Guard Alignment

Goal:

- align route protection with documented RBAC + capability behavior
- introduce the global navigation mode preference

Tasks:

1. Create `NavigationModeProvider` and hook.
2. Register it in `app/providers.tsx`.
3. Extend route guard metadata to support facility capability checks.
4. Update `RouteGuard` to evaluate both RBAC and facility capability.
5. Add tests for:
   - module denied
   - facility module denied
   - both allowed
   - superuser bypass

Success criteria:

- direct URLs behave consistently with sidebar visibility
- navigation mode can be read and updated anywhere in the dashboard

### Phase 1: Settings UI

Goal:

- make the mode discoverable and user-controlled under Appearance

Tasks:

1. Replace Appearance placeholder with a real settings card.
2. Add mode selector with clear labels and help text.
3. Persist the preference immediately on selection.
4. Add a disabled or hidden state for ineligible roles if rollout is limited.

Success criteria:

- users can switch modes from Settings
- selection persists after refresh
- ineligible users do not see a broken or misleading control

### Phase 2: Workflow Hub

Goal:

- validate workflow-oriented navigation with minimal disruption

Tasks:

1. Build `/workflow/clinical` dashboard/worklist page.
2. Add cards or list entries for the core workflow buckets.
3. Reuse current APIs and queues wherever possible.
4. Add fallback empty states for facilities that do not support certain modules.
5. Add role-based visibility rules to each workflow card.

Success criteria:

- Clinical Mode has a meaningful landing page
- users can complete common patient-flow tasks without module hunting

### Phase 3: Sidebar Clinical Projection

Goal:

- allow full sidebar switching between Standard and Clinical views

Tasks:

1. Create `clinical-navigation.ts` config.
2. Add a navigation resolver hook used by the sidebar.
3. Render clinical workflow items when mode is `clinical`.
4. Keep bottom nav items unchanged unless there is a strong reason to diverge.
5. Ensure mobile and desktop sidebar behavior remains identical aside from item set.

Success criteria:

- sidebar reflects the selected mode
- hidden items remain hidden under the same RBAC and facility rules
- no direct navigation regressions

### Phase 4: Worklist Refinement

Goal:

- improve accuracy and usefulness of workflow buckets

Tasks:

1. Add encounter list filtering where needed.
2. Add badge counts for each workflow item.
3. Use real-time updates where queue data already supports WebSockets.
4. Tune labels based on clinical feedback.

Success criteria:

- workflow items feel like operational queues, not static shortcuts
- counts and statuses stay current enough to support daily use

## Proposed File Map

### New Files

- `web-app/lib/context/navigation-mode-context.tsx`
- `web-app/lib/config/clinical-navigation.ts`
- `web-app/components/settings/appearance-settings.tsx` optional
- `web-app/lib/hooks/use-navigation-items.ts` optional
- `web-app/app/(dashboard)/workflow/clinical/page.tsx` recommended

### Existing Files to Update

- `web-app/app/providers.tsx`
- `web-app/app/(dashboard)/settings/page.tsx`
- `web-app/components/layout/sidebar.tsx`
- `web-app/lib/auth/guard.tsx`
- `web-app/components/layout/header.tsx` optional if mode indicator is added
- `web-app/lib/config/navigation.ts` only if shared types/helpers need extraction

## Data and State Decisions

### Preference Persistence

Initial recommendation:

- persist in `localStorage`

Reasoning:

- matches current frontend preference patterns
- avoids backend changes for first release
- fast to implement and sufficient for a UI preference

Possible later upgrade:

- store as a user profile preference on the backend for cross-device persistence

### Badge Counts

Do not block the initial release on live counts everywhere.

Recommended order:

1. ship static navigation and working destinations first
2. add counts using existing query hooks where cheap
3. add real-time counts only where existing websocket invalidation already exists

## Testing Plan

### Unit Tests

- navigation mode provider default and persistence
- settings toggle behavior
- navigation resolver returns correct item sets
- route guard capability + RBAC enforcement
- clinical item visibility predicates

### Integration Tests

- switching to Clinical Mode updates sidebar items
- refresh preserves selected mode
- denied module/facility routes still show access denied
- clinical users see the toggle and non-clinical users do not, if rollout is restricted

### E2E Coverage

- user enables Clinical Mode in Settings > Appearance
- sidebar changes immediately
- user opens Waiting for Triage and lands on the expected page
- direct URL to capability-denied route remains blocked

## Risks and Mitigations

### Risk 1: Authorization Drift

Problem:

- workflow nav exposes destinations inconsistently with Standard Mode

Mitigation:

- one filtering pipeline reused by both modes
- route guard checks both module RBAC and facility capability

### Risk 2: Wrong Workflow-to-Module Mapping

Problem:

- workflow labels may send users to department dashboards instead of actual work queues

Mitigation:

- use workflow hub or filtered encounter/queue pages first
- validate with clinicians before broad rollout

### Risk 3: Overloading Non-Clinical Users

Problem:

- the workflow mental model does not fit every role

Mitigation:

- gate initial availability by role category or role allowlist
- keep Standard Mode as default

### Risk 4: Duplicate Configuration Drift

Problem:

- two navigation configs become inconsistent over time

Mitigation:

- centralize shared types and filtering
- keep workflow item visibility declarative and derived from existing permission hooks

## Acceptance Criteria

The implementation is complete when all of the following are true:

1. Settings > Appearance contains a working Navigation Mode toggle.
2. Standard Mode preserves current behavior.
3. Clinical Mode presents workflow-oriented navigation for eligible users.
4. Sidebar visibility in both modes respects RBAC and facility capability rules.
5. Direct route access is blocked consistently when module or facility access is denied.
6. The selected mode persists across refreshes.
7. Core workflow items navigate to meaningful worklist destinations.
8. Mobile and desktop sidebar behavior remain stable.

## Recommended Delivery Order

If implemented across multiple PRs, use this order:

1. PR 1: Route guard alignment + navigation mode provider
2. PR 2: Settings Appearance UI for the mode toggle
3. PR 3: Workflow hub page and initial clinical nav config
4. PR 4: Sidebar mode switching
5. PR 5: Counts, refinements, and clinician feedback adjustments

## Final Recommendation

Do not begin by replacing the sidebar outright.

Begin with the guard fix, the preference toggle, and a workflow hub page. That gives the team a safe first release that proves the concept while preserving the current module navigation as a fallback.

Once the workflow destinations feel correct in real clinical use, switch the sidebar projection based on the Appearance setting.
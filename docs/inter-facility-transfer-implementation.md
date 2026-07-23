# Inter-Facility Transfer Implementation

## Purpose

This document captures the implemented backend workflow, current frontend integration, and the UX decision for discharge `TRANSFERRED` handling.

## Backend Implementation (Completed)

### Core Models

- `InterFacilityTransfer`
  - Workflow envelope for cross-facility transfer operations.
  - Tracks source admission/discharge, source/destination facility, status lifecycle, handover metadata, transport metadata, and actor timestamps.
- `InterFacilityTransferEvent`
  - Timeline event stream for transfer lifecycle.
  - Supports: `CREATED`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `DISPATCHED`, `ARRIVED`, `AUTO_ADMITTED`, `CANCELLED`.

### Workflow Actions

- `POST /api/inpatient/inter-facility-transfers/{id}/submit/`
- `POST /api/inpatient/inter-facility-transfers/{id}/accept/`
- `POST /api/inpatient/inter-facility-transfers/{id}/reject/`
- `POST /api/inpatient/inter-facility-transfers/{id}/dispatch/`
- `POST /api/inpatient/inter-facility-transfers/{id}/arrive/`
- `POST /api/inpatient/inter-facility-transfers/{id}/arrive-and-admit/` (alias)
- `POST /api/inpatient/inter-facility-transfers/{id}/cancel/`

### Destination Queue + Timeline

- `GET /api/inpatient/inter-facility-transfers/destination-queue/`
  - Destination-side queue for incoming workflow states.
- `GET /api/inpatient/inter-facility-transfers/{id}/timeline/`
  - Chronological transfer event feed.

### Arrival Auto-Admit

Implemented on both:

- `POST /arrive/` with `auto_admit=true`
- `POST /arrive-and-admit/` alias (forces auto-admit)

Behavior:

- Marks transfer as `ARRIVED`.
- Creates destination `Admission` (and IPD `Encounter`) using existing admission serializer logic.
- Records `AUTO_ADMITTED` timeline event and audit log.
- Returns destination admission/encounter identifiers in response payload.

### Permission + Actor Enforcement

- Action codenames enforced per endpoint:
  - `submit_interfacility_transfer`
  - `accept_interfacility_transfer`
  - `reject_interfacility_transfer`
  - `dispatch_interfacility_transfer`
  - `arrive_interfacility_transfer`
  - `cancel_interfacility_transfer`
- Source/destination actor-side checks enforced server-side.

## Frontend Implementation (Current)

### Types, API, Hooks

- Added inter-facility transfer types in `web-app/lib/types/inpatient.ts`.
- Added inter-facility endpoints in `web-app/lib/api/inpatient.ts`:
  - CRUD/list/detail, queue, timeline, all transition actions, and `arrive-and-admit` alias.
- Added React Query keys/hooks in `web-app/lib/hooks/use-inpatient.ts`.

### Pages

- `web-app/app/(dashboard)/admissions/[id]/inter-facility-transfer/page.tsx`
  - Creates transfer draft, optionally submits immediately.
- `web-app/app/(dashboard)/admissions/inter-facility-transfers/destination-queue/page.tsx`
  - Destination queue operations: accept/reject, arrive-and-admit.

### Navigation

- Added admission action button for inter-facility transfer creation.
- Added admissions header shortcut to destination queue.
- Added sidebar/nav item under Inpatient:
  - `Inter-Facility Queue` -> `/admissions/inter-facility-transfers/destination-queue`

## UX Decision: Discharge Type `TRANSFERRED`

### Question

When user selects discharge type `TRANSFERRED`, should we show a transfer sheet if no transfer exists for that admission?

### Decision

Yes, but keep it lightweight.

### Rationale

- A `TRANSFERRED` discharge without a workflow record drops operational context (destination acceptance, transit status, arrival, destination auto-admit).
- Forcing users into a full standalone transfer form at discharge time is too heavy and creates friction.
- Best UX is a focused inline transfer sheet (minimal required fields) only when no open transfer exists.

### Recommended Discharge Behavior

If discharge type is `TRANSFERRED`:

1. Check for existing open transfer workflow for the admission.
2. If found, link and continue discharge normally.
3. If not found, open a compact transfer sheet in the discharge flow with:
   - destination facility (or name)
   - reason
   - clinical summary
   - handover notes
4. Create transfer record and then proceed with discharge finalization.

This adds guardrails without introducing unnecessary complexity.

## Remaining Frontend Enhancements (Next)

- Transfer detail page with timeline panel and action history view.
- Destination ward/bed picker filtered to destination facility only.
- Better error surface for arrival auto-admit preconditions (e.g., source still ACTIVE).
- Discharge integration behavior above for `TRANSFERRED` when no workflow exists.

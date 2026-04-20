# Shift Swap Module

> **Status**: Implemented (Sprint 0.8)
> **Last Updated**: April 20, 2026

## Overview

The Shift Swap module allows staff members to exchange scheduled shifts with colleagues. It supports **open swaps** (any eligible staff can accept), **directed swaps** (targeting a specific colleague), and **partial swaps** (swapping only a portion of a shift). An optional manager-approval workflow ensures organizational oversight.

---

## Features

| Feature | Description |
|---------|-------------|
| **Open Swaps** | Post a swap request visible to all eligible staff in the facility |
| **Directed Swaps** | Target a specific colleague or shift |
| **Partial Swaps** | Swap a time segment within a shift (e.g., 08:00–12:00 of a full day shift) |
| **Manager Approval** | Configurable per-facility flag; when enabled, accepted swaps require manager sign-off |
| **Auto-Expiry** | Unanswered requests expire after 48 hours (or 48 hours before shift start, whichever is sooner) |
| **Constraint Checking** | Validates swaps against staff scheduling constraints (NO_NIGHTS, NO_WEEKENDS, LIGHT_DUTY, NO_OVERTIME) |
| **Real-time Notifications** | WebSocket events for all swap state transitions |
| **Audit Logging** | Every action (create, accept, reject, approve, cancel) is logged |

---

## Status Flow

```
PENDING  →  ACCEPTED  →  APPROVED  →  COMPLETED
   │            │            │
   ▼            ▼            ▼
CANCELLED    REJECTED     REJECTED
   │
   ▼
EXPIRED
```

When `require_swap_approval` is **disabled** on `SchedulingSettings`, the `APPROVED` step is skipped — an accepted swap moves directly to `COMPLETED` and the shift reassignment executes immediately.

---

## Data Model

### ShiftSwapRequest

| Field | Type | Description |
|-------|------|-------------|
| `requesting_shift` | FK → Shift | The shift the requester wants to give up |
| `target_shift` | FK → Shift (nullable) | Specific shift to swap with (null = open) |
| `requester` | FK → User | Staff member initiating the swap |
| `target_staff` | FK → Resource (nullable) | Specific colleague targeted (null = open to anyone) |
| `is_partial` | Boolean | Whether this is a partial swap |
| `partial_start_time` | Time (nullable) | Start of the partial segment |
| `partial_end_time` | Time (nullable) | End of the partial segment |
| `status` | Enum | PENDING / ACCEPTED / APPROVED / COMPLETED / REJECTED / CANCELLED / EXPIRED |
| `reason` | Text | Why the swap is needed |
| `rejection_reason` | Text | Reason for rejection |
| `accepted_by` | FK → User (nullable) | User who accepted |
| `accepted_shift` | FK → Shift (nullable) | Shift offered in exchange (for open swaps) |
| `accepted_at` | DateTime (nullable) | When it was accepted |
| `reviewed_by` | FK → User (nullable) | Manager who reviewed |
| `reviewed_at` | DateTime (nullable) | When it was reviewed |
| `expires_at` | DateTime | Auto-expire deadline |
| `facility` | FK → Facility | Inherited from `FacilityScopedModel` |
| `organization` | FK → Organization | Inherited from `FacilityScopedModel` |

### SchedulingSettings Addition

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `require_swap_approval` | Boolean | `True` | When true, accepted swaps need manager approval before execution |

---

## API Endpoints

All endpoints are scoped to the user's active facility via `TenantScopedViewMixin`.

### CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scheduling/shift-swaps/` | List swap requests (filterable by status, requester, shift, is_partial) |
| `POST` | `/api/scheduling/shift-swaps/` | Create a new swap request |
| `GET` | `/api/scheduling/shift-swaps/{id}/` | Get swap request detail |
| `DELETE` | `/api/scheduling/shift-swaps/{id}/` | Delete a swap request (only PENDING/CANCELLED/EXPIRED/REJECTED) |

### Actions

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| `POST` | `/api/scheduling/shift-swaps/{id}/accept/` | Accept a swap request | Any authenticated staff |
| `POST` | `/api/scheduling/shift-swaps/{id}/reject/` | Reject a swap request | Any authenticated staff |
| `POST` | `/api/scheduling/shift-swaps/{id}/approve/` | Approve an accepted swap | `scheduling.manage_schedules` |
| `POST` | `/api/scheduling/shift-swaps/{id}/cancel/` | Cancel own swap request | Request owner |

### Custom Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scheduling/shift-swaps/available/` | Open PENDING swaps not created by current user |
| `GET` | `/api/scheduling/shift-swaps/my_requests/` | Current user's own swap requests |

### Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (e.g., `?status=PENDING`) |
| `requester` | integer | Filter by requester user ID |
| `requesting_shift` | integer | Filter by requesting shift ID |
| `target_staff` | integer | Filter by target staff resource ID |
| `is_partial` | boolean | Filter partial vs full swaps |

### Create Payload

```json
{
  "requesting_shift": 42,
  "target_shift": null,
  "target_staff": null,
  "is_partial": false,
  "partial_start_time": null,
  "partial_end_time": null,
  "reason": "Family commitment on that day"
}
```

**Validation rules:**
- `requesting_shift` must be in `SCHEDULED` status
- If `is_partial` is true, `partial_start_time` and `partial_end_time` are required and must fall within the shift's time range
- `expires_at` is auto-set to the earlier of: 48 hours from now, or 48 hours before the shift starts

### Accept Payload

```json
{
  "offered_shift": 55
}
```

The `offered_shift` is optional — if omitted, the acceptor takes the requester's shift without offering one in return (one-way swap).

### Reject Payload

```json
{
  "reason": "I'm not available that week"
}
```

### Approve Payload

```json
{
  "notes": "Approved — both staff have adequate rest periods"
}
```

---

## Swap Execution

When a swap reaches `COMPLETED` status (either via approval or auto-approval), the system physically modifies the underlying Shift records:

### Full Swap

- **Two-way**: Exchanges `staff_resource` between the requesting shift and the accepted/target shift.
- **One-way** (open swap, no offered shift): Reassigns the requesting shift to the acceptor's resource.

### Partial Swap

The original shift is split:

1. A **new Shift** is created for the swapped time segment, assigned to the acceptor.
2. The **original shift's times are adjusted** to cover the remaining portion(s).
3. If the swapped segment is in the middle of the shift, the original is split into **two remaining shifts**.

**Example**: Staff A has a 07:00–19:00 DAY shift. They swap 07:00–12:00 to Staff B.
- Staff B gets a new shift: 07:00–12:00
- Staff A's shift is adjusted to: 12:00–19:00

---

## Constraint Checking

Before presenting swap details, the system checks both parties' scheduling constraints:

| Constraint | Check |
|------------|-------|
| `NO_NIGHTS` | Warns if the target shift is a NIGHT shift |
| `NO_WEEKENDS` | Warns if the target shift falls on a weekend |
| `NO_OVERTIME` | Warns if the target shift is an OVERTIME shift |
| `LIGHT_DUTY` | Warns if the target shift is not DAY or MORNING |

Constraint warnings are **advisory** — they appear on the detail page but do not block the swap. Managers can use them to make informed approval decisions.

---

## Auto-Expiry

A Celery beat task (`expire_pending_swap_requests`) runs every **15 minutes** and transitions all PENDING requests whose `expires_at` has passed to EXPIRED status.

The expiry deadline is calculated at creation time:

```python
expires_at = min(
    now + timedelta(hours=48),                    # 48h from creation
    shift_start - timedelta(hours=48)             # 48h before shift starts
)
```

This ensures swap requests don't linger past the point where they'd be useful.

---

## Domain Events

All swap state transitions publish domain events via `publish_event()`:

| Event Type | Trigger |
|------------|---------|
| `scheduling.swap.requested` | New swap request created |
| `scheduling.swap.accepted` | Peer accepts the request |
| `scheduling.swap.approved` | Manager approves the swap |
| `scheduling.swap.completed` | Swap executed (shifts reassigned) |
| `scheduling.swap.rejected` | Peer or manager rejects |
| `scheduling.swap.cancelled` | Requester cancels |
| `scheduling.swap.expired` | Auto-expired by Celery task |

### WebSocket Delivery

The `SchedulingConsumer` (at `ws/scheduling/{facility_id}/appointments/`) broadcasts swap events to connected clients. The frontend `useSchedulingSocket` hook invalidates React Query caches for `shift-swaps`, `shift-swaps-available`, `shift-swaps-my`, and `scheduling-shifts` on any swap event.

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| **List** | `/scheduling/shift-swaps` | Tabs for "My Swaps" and "Available Swaps", stats cards, sortable tables |
| **Detail** | `/scheduling/shift-swaps/{id}` | Shift summary cards, constraint warnings, action buttons (accept/reject/approve/cancel) |
| **Create** | `/scheduling/shift-swaps/new` | Shift selector, optional target, partial swap toggle, reason field |

Navigation entry: **Scheduling → Shift Swaps** (visible to users with `scheduling.view_appointments` permission).

---

## File Reference

### Backend

| File | Purpose |
|------|---------|
| `backend/hmis/apps/scheduling/models.py` | `ShiftSwapRequest` model with state machine, swap execution, constraint checking |
| `backend/hmis/apps/scheduling/serializers.py` | 6 serializers: Read, List, Create, Accept, Reject, Approve |
| `backend/hmis/apps/scheduling/views.py` | `ShiftSwapViewSet` with actions and custom endpoints |
| `backend/hmis/apps/scheduling/urls.py` | `shift-swaps` route registration |
| `backend/hmis/apps/scheduling/admin.py` | `ShiftSwapRequestAdmin` with colored status badges |
| `backend/hmis/apps/scheduling/signals.py` | Domain event publishing on post_save |
| `backend/hmis/apps/scheduling/tasks.py` | `expire_pending_swap_requests` Celery task |
| `backend/hmis/apps/scheduling/consumers.py` | WebSocket event handlers for swap notifications |
| `backend/hmis/apps/core/events/types.py` | `SchedulingEvents.SWAP_*` constants |
| `backend/hmis/celery.py` | Beat schedule entry (every 15 min) |
| `backend/hmis/apps/scheduling/migrations/0018_shift_swap_request.py` | Migration |
| `backend/tests/test_shift_swap.py` | 23 tests (model, API, events, Celery task) |

### Frontend

| File | Purpose |
|------|---------|
| `web-app/lib/types/scheduling.ts` | TypeScript interfaces (`ShiftSwapRequest`, `ShiftSwapListItem`, etc.) |
| `web-app/lib/schemas/scheduling.schema.ts` | Zod validation schemas |
| `web-app/lib/api/scheduling.ts` | `shiftSwapsApi` client (10 methods) |
| `web-app/app/(dashboard)/scheduling/shift-swaps/page.tsx` | List page |
| `web-app/app/(dashboard)/scheduling/shift-swaps/[id]/page.tsx` | Detail page |
| `web-app/app/(dashboard)/scheduling/shift-swaps/new/page.tsx` | Create page |
| `web-app/lib/config/navigation.ts` | Sidebar navigation entry |
| `web-app/lib/hooks/use-websocket.ts` | WebSocket swap event handling + `SchedulingEventType` |

---

## Testing

23 tests across 5 test classes:

| Class | Tests | Coverage |
|-------|-------|----------|
| `TestShiftSwapRequestModel` | 8 | State machine transitions, auto-approval, invalid transitions |
| `TestPartialSwap` | 1 | Shift splitting for partial swaps |
| `TestConstraintChecking` | 1 | NO_NIGHTS constraint warning |
| `TestShiftSwapAPI` | 9 | CRUD, accept, reject, cancel, approve permission, available/my-requests endpoints |
| `TestExpireSwapTask` | 2 | Celery task expires PENDING, skips non-PENDING |
| `TestShiftSwapEvents` | 2 | Domain event publishing on create and accept |

```bash
# Run shift swap tests
cd backend && poetry run pytest tests/test_shift_swap.py -v --no-cov
```

---

## Configuration

### Per-Facility Setting

Toggle manager approval via the Scheduling Settings API:

```
PATCH /api/scheduling/settings/
{ "require_swap_approval": false }
```

When set to `false`, accepted swaps complete immediately without waiting for manager approval.

### Celery Beat Schedule

```python
# hmis/celery.py
"scheduling-expire-pending-swaps": {
    "task": "hmis.apps.scheduling.tasks.expire_pending_swap_requests",
    "schedule": crontab(minute="*/15"),  # Every 15 minutes
}
```

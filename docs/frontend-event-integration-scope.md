# Frontend Domain Event Integration — Scope Document

> **Created**: July 2, 2026
> **Context**: Backend domain events infrastructure is mature with 70 event type constants (49 wired via signals). This document scopes the frontend work needed to consume those events.

---

## Current State

### What Exists (Frontend WebSocket Infra)

| Layer | File | Status |
|-------|------|--------|
| Base hook | `lib/hooks/use-websocket.ts` | ✅ Stable — reconnection, state machine, generic `onMessage` |
| Clinic queues | `useClinicQueueSocket` (same file) | ✅ Wired — invalidates React Query on `patient_added`, `patient_called`, etc. |
| Laboratory | `lib/hooks/use-lab-websocket.ts` | ✅ Wired — encounter, order, clinician (critical alerts), queue sockets |
| Emergency/Triage | `lib/hooks/use-triage-websocket.ts` | ✅ Wired — state updates, critical patient counts, zone occupancy |
| Inpatient | `lib/hooks/inpatient-websocket/use-ward-websocket.ts` | ✅ Wired — bed occupancy, compatibility violations |
| Surveillance | `lib/hooks/use-surveillance-websocket.ts` | ✅ Wired — notifiable disease alerts, outbreak notifications |
| MCH/Labour | `lib/hooks/use-labour-websocket.ts` | ✅ Wired — partograph observation updates |
| Scheduling | — | ❌ **Missing** |
| Pharmacy | — | ❌ **Missing** |
| Billing | — | ❌ **Missing** |
| Dashboard projections | — | ❌ **Missing** (stats poll every 5 min) |

### Backend Events Available but Not Consumed by Frontend

| Event Class | Constants | Backend Consumer Exists | Frontend Hook Exists |
|-------------|-----------|------------------------|---------------------|
| `SchedulingEvents` | 15 | ❌ No consumer yet | ❌ No hook |
| `PharmacyEvents` | 7 | ✅ `pharmacy/consumers.py` | ❌ No hook |
| `BillingEvents` | 11 | ✅ `billing/consumers.py` | ❌ No hook |
| `ImagingEvents` | 3 | ❌ No consumer yet | ❌ No hook |
| `ImmunizationEvents` | 3 | ❌ No consumer yet | ❌ No hook |
| `MCHEvents` | 4 | ✅ `mch/consumers.py` | ✅ Partial (partograph only) |
| `CoreEvents` | 5 | ❌ N/A (auth events) | ❌ N/A |

---

## Work Items

### Stream A: Scheduling WebSocket (High Priority)

**Why**: Scheduling has 15 backend events and a full UI (appointments, schedules, resources) but zero real-time updates. Users must manually refresh to see appointment status changes.

**Deliverables**:

1. **`lib/hooks/use-scheduling-websocket.ts`** — New hook wrapping `useWebSocket`
   - `useAppointmentSocket(appointmentId)` — detail page real-time status
   - `useSchedulingQueueSocket(facilityId)` — list page / dashboard real-time updates
   - Events to handle: `appointment.checked_in`, `appointment.started`, `appointment.completed`, `appointment.cancelled`, `appointment.no_show`
   - React Query invalidation: `['scheduling', 'appointments']`, `['scheduling', 'appointments', id]`

2. **Backend consumer**: `hmis/apps/scheduling/consumers.py` — WebSocket consumer that broadcasts `SchedulingEvents` to channel groups
   - Group naming: `scheduling_facility_{facility_id}`, `scheduling_appointment_{appointment_id}`

3. **Backend routing**: Add scheduling WebSocket URL pattern to `hmis/routing.py`

4. **Frontend wiring**:
   - `app/(dashboard)/scheduling/appointments/page.tsx` — use `useSchedulingQueueSocket` for live appointment list
   - `app/(dashboard)/scheduling/appointments/[id]/page.tsx` — use `useAppointmentSocket` for detail updates
   - `app/(dashboard)/scheduling/page.tsx` — dashboard overview, real-time today's appointment counts

**Estimated scope**: ~6 files (1 backend consumer, 1 backend routing, 1 frontend hook, 3 page integrations)

---

### Stream B: Pharmacy WebSocket (High Priority)

**Why**: Pharmacy has 7 backend events and a consumer, but no frontend hook. New prescriptions and stock alerts are invisible until manual refresh.

**Deliverables**:

1. **`lib/hooks/use-pharmacy-websocket.ts`** — New hook
   - `usePharmacyQueueSocket(facilityId)` — prescription queue updates
   - `usePharmacyStockSocket(facilityId)` — stock critical/low alerts
   - Events: `prescription.created`, `dispensing.completed`, `stock.critical`, `stock.low_warning`
   - React Query invalidation: `['pharmacy', 'prescriptions']`, `['pharmacy', 'stock']`

2. **Frontend wiring**:
   - `app/(dashboard)/pharmacy/page.tsx` — live prescription queue
   - `app/(dashboard)/pharmacy/stock/page.tsx` — stock alert badges/toasts
   - Toast notifications for `STOCK_CRITICAL` events (red) and `STOCK_LOW_WARNING` (amber)

**Estimated scope**: ~4 files (1 hook, 3 page integrations); backend consumer already exists

---

### Stream C: Billing WebSocket (High Priority)

**Why**: Billing has 11 backend events and a consumer, but no frontend hook. Payment confirmations and SHA claim status changes require manual refresh.

**Deliverables**:

1. **`lib/hooks/use-billing-websocket.ts`** — New hook
   - `useBillingSocket(facilityId)` — invoice/payment real-time updates
   - `useSHAClaimSocket(facilityId)` — SHA claim status notifications
   - Events: `payment.received`, `invoice.finalized`, `sha_claim.status_changed`
   - React Query invalidation: `['billing', 'invoices']`, `['billing', 'payments']`, `['billing', 'sha-claims']`

2. **Frontend wiring**:
   - `app/(dashboard)/billing/page.tsx` — live invoice list
   - `app/(dashboard)/billing/invoices/[id]/page.tsx` — real-time payment updates on detail page
   - Toast notification for `PAYMENT_RECEIVED` (success) and `SHA_CLAIM_STATUS_CHANGED`

**Estimated scope**: ~4 files (1 hook, 3 page integrations); backend consumer already exists

---

### Stream D: Dashboard Projection Consumption (Medium Priority)

**Why**: Dashboard stats poll every 5 minutes via `GET /api/core/dashboard/stats/`. Three projection models (`ClinicQueueStats`, `WardOccupancyStats`, `PharmacyQueueStats`) are maintained by domain events but not consumed in real-time on the dashboard.

**Deliverables**:

1. **`lib/hooks/use-dashboard-websocket.ts`** — New hook
   - `useDashboardSocket(facilityId)` — listens for `stats_updated` broadcasts
   - Invalidates `['dashboard', 'stats']` query key on any projection update

2. **Backend**: Add a `DashboardConsumer` that joins a `dashboard_{facility_id}` group
   - Receives forwarded events from clinic/ward/pharmacy projections and broadcasts a generic `stats_updated` message

3. **Frontend wiring**:
   - `app/(dashboard)/dashboard/page.tsx` — connect socket, remove or increase `refetchInterval`
   - `lib/hooks/use-dashboard-stats.ts` — integrate with WebSocket invalidation

**Estimated scope**: ~4 files (1 backend consumer, 1 frontend hook, 2 file updates)

---

### Stream E: MCH Event Gaps (Medium Priority)

**Why**: MCH has 4 events (`REGISTRATION_CREATED`, `DELIVERY_COMPLETED`, `ANC_VISIT_CREATED`, `BABY_PATIENT_CREATED`) but only partograph events are consumed on the frontend.

**Deliverables**:

1. Extend existing `useLabourPartographSocket` or create `useMCHSocket`:
   - Handle `registration.created` — update MCH patient list
   - Handle `delivery.completed` — update delivery status on active labour page
   - Handle `anc_visit.created` — update visit timeline

2. **Frontend wiring**:
   - `app/(dashboard)/mch/` pages — integrate new event handlers

**Estimated scope**: ~3 files (1 hook update, 2 page integrations)

---

### Stream F: Imaging Events (Low Priority)

**Why**: Imaging has 3 events (`ORDER_CREATED`, `ORDER_ITEM_CREATED`, `RESULT_COMPLETED`) but no backend consumer or frontend hook.

**Deliverables**:

1. **Backend**: `hmis/apps/imaging/consumers.py` — WebSocket consumer
2. **Backend routing**: Add imaging WebSocket URL pattern
3. **`lib/hooks/use-imaging-websocket.ts`** — New hook
4. **Frontend wiring**: Imaging order list & detail pages

**Estimated scope**: ~5 files (2 backend, 1 hook, 2 page integrations)

---

### Stream G: Immunization Events (Low Priority)

**Why**: Immunization has 3 events (`RECORD_ADMINISTERED`, `AEFI_REPORTED`, `SCHEDULE_GENERATED`) but no consumer or frontend hook.

**Deliverables**:

1. **Backend**: `hmis/apps/immunization/consumers.py`
2. **`lib/hooks/use-immunization-websocket.ts`**
3. **Frontend wiring**: Immunization pages

**Estimated scope**: ~4 files

---

## Implementation Priority Order

```
1. Stream A — Scheduling WebSocket       (High)   ~6 files
2. Stream B — Pharmacy WebSocket          (High)   ~4 files
3. Stream C — Billing WebSocket           (High)   ~4 files
4. Stream D — Dashboard Projections       (Medium) ~4 files
5. Stream E — MCH Event Gaps              (Medium) ~3 files
6. Stream F — Imaging Events              (Low)    ~5 files
7. Stream G — Immunization Events         (Low)    ~4 files
```

**Total**: ~30 files across 7 streams

---

## Patterns to Follow

### Frontend WebSocket Hook Pattern (Established)

```typescript
// lib/hooks/use-{module}-websocket.ts
import { useWebSocket } from '@/lib/hooks/use-websocket';
import { useQueryClient } from '@tanstack/react-query';

export function useModuleSocket(facilityId: number | null) {
  const queryClient = useQueryClient();
  const url = facilityId
    ? `${WS_BASE}/ws/{module}/facility/${facilityId}/`
    : null;

  return useWebSocket(url, {
    onMessage: (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'item.created':
        case 'item.updated':
          queryClient.invalidateQueries({ queryKey: ['{module}', 'items'] });
          break;
        case 'critical_alert':
          // Show toast notification
          break;
      }
    },
  });
}
```

### Backend Consumer Pattern (Established)

```python
# hmis/apps/{module}/consumers.py
import json
from channels.generic.websocket import AsyncJsonWebSocketConsumer

class ModuleConsumer(AsyncJsonWebSocketConsumer):
    async def connect(self):
        self.facility_id = self.scope["url_route"]["kwargs"]["facility_id"]
        self.group_name = f"module_{self.facility_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def module_event(self, event):
        await self.send_json(event["data"])
```

---

## Non-Goals (Out of Scope)

- **EventStore frontend viewer** — Admin-only debugging tool, not needed for clinician UX
- **PowerSync event integration** — PowerSync handles offline sync separately from domain events
- **Mobile app events** — Mobile app (React Native) is a separate phase
- **SSE fallback** — WebSocket is sufficient; SSE fallback adds complexity without benefit for this use case

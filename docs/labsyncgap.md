# Laboratory Real-Time Sync Gap Analysis & Implementation Plan

> **Created**: February 11, 2026
> **Status**: Phase 2 Complete ✅
> **Priority**: High (Clinical workflow impact)

---

## Current State Assessment

### ✅ What Exists

| Layer | Component | Status |
|-------|-----------|--------|
| **Backend** | `laboratory/signals.py` | ✅ Broadcasts events on result verification |
| **Backend** | `laboratory/websockets.py` | ✅ Broadcast utilities (`broadcast_result_verified`, `broadcast_critical_alert`, `broadcast_order_completed`) |
| **Backend** | `laboratory/consumers.py` | ✅ WebSocket consumers for encounters/orders/clinician channels |
| **Backend** | `laboratory/routing.py` | ✅ URL patterns: `/ws/lab/encounters/{id}/`, `/ws/lab/orders/{id}/`, `/ws/lab/clinician/` |
| **Backend** | `asgi.py` | ✅ Combined clinic + lab WebSocket routing |
| **Frontend** | `use-websocket.ts` | ✅ Generic hook + `useClinicQueueSocket` + Lab hooks |
| **Frontend** | Lab WebSocket hooks | ✅ `useLabEncounterSocket`, `useLabOrderSocket`, `useLabClinicianSocket`, `useLabQueueSocket` |
| **Frontend** | Lab event types | ✅ TypeScript types for lab WebSocket events |
| **Frontend** | Lab component integration | ✅ WebSocket integrated in lab views |
| **Frontend** | `lab-results-badge.tsx` | ✅ Static badge component |
| **Frontend** | `lab-results-badge-live.tsx` | ✅ Real-time badge wrapper with WebSocket |

### ❌ What's Missing

| Layer | Component | Gap |
|-------|-----------|-----|
| **Offline** | PowerSync | Not implemented (documented only - Phase 3) |

---

## Implementation Plan

### Phase 1: Lab WebSocket Frontend Integration ✅ COMPLETE

#### 1.1 Add Lab Event Types to `use-websocket.ts`

```typescript
// Lab WebSocket event types (from backend laboratory/consumers.py)
export type LabEventType =
  | 'result_entered'
  | 'result_verified'
  | 'critical_alert'
  | 'order_completed'
  | 'queue_updated';

export interface LabResultVerifiedEvent {
  result_id: number;
  order_id: number;
  order_number: string;
  test_name: string;
  test_code: string;
  patient_id: number;
  patient_name: string;
  patient_mrn: string;
  encounter_id: number | null;
  is_critical: boolean;
  result_flag: string;
  verified_by: string;
  verified_at: string;
}

export interface LabCriticalAlertEvent extends LabResultVerifiedEvent {
  critical_value: string;
  reference_range: string;
}

export interface LabOrderCompletedEvent {
  order_id: number;
  order_number: string;
  patient_id: number;
  patient_name: string;
  total_tests: number;
  verified_count: number;
  completed_at: string;
}
```

#### 1.2 Create Lab-Specific Socket Hooks

```typescript
// In use-websocket.ts or new use-lab-websocket.ts

export function useLabEncounterSocket(encounterId: number | null) {
  const queryClient = useQueryClient();

  return useWebSocket(
    encounterId ? `${WS_BASE_URL}/ws/lab/encounters/${encounterId}/` : null,
    {
      onMessage: (message) => {
        // Invalidate lab queries on events
        queryClient.invalidateQueries({ queryKey: ['lab-orders', { encounter_id: encounterId }] });
        queryClient.invalidateQueries({ queryKey: ['lab-results'] });
      },
    }
  );
}

export function useLabOrderSocket(orderId: number | null) {
  const queryClient = useQueryClient();

  return useWebSocket(
    orderId ? `${WS_BASE_URL}/ws/lab/orders/${orderId}/` : null,
    {
      onMessage: (message) => {
        queryClient.invalidateQueries({ queryKey: ['lab-orders', orderId] });
      },
    }
  );
}

export function useLabClinicianSocket() {
  const queryClient = useQueryClient();

  return useWebSocket(
    `${WS_BASE_URL}/ws/lab/clinician/`,
    {
      onMessage: (message) => {
        if (message.event === 'critical_alert') {
          // Show toast notification for critical results
          toast.error(`Critical Lab Result: ${message.data.test_name}`, {
            description: `Patient: ${message.data.patient_name}`,
            duration: 10000,
          });
        }
        // Invalidate dashboard/pending results
        queryClient.invalidateQueries({ queryKey: ['lab-orders'] });
      },
    }
  );
}
```

#### 1.3 Integrate into Lab Components

**Target Components:**
- `lab-queue-view.tsx` - Add `useLabEncounterSocket` for queue updates
- `lab-order-detail.tsx` - Add `useLabOrderSocket` for order status
- `lab-results-entry.tsx` - Add socket for multi-user awareness
- Layout component - Add `useLabClinicianSocket` for critical alerts

### Phase 2: Lab Badge Real-Time Updates ✅ COMPLETE

#### 2.1 Create Real-Time Wrapper Component

```typescript
// components/laboratory/lab-results-badge-live.tsx

export function LabResultsBadgeLive({
  orderId,
  orderNumber,
  encounterId,
  initialResult,
  showValue = false,
}: {
  orderId: number;
  orderNumber?: string;
  encounterId?: number;
  initialResult?: LabResult;
  showValue?: boolean;
}) {
  const [result, setResult] = useState(initialResult);

  const handleMessage = useCallback((message: unknown) => {
    const labMessage = message as LabWebSocketMessage;
    if (labMessage.event === 'result_verified') {
      setResult(prev => ({ ...prev, ...labMessage.data }));
    }
  }, []);

  useLabOrderSocket(orderId, {
    orderNumber,
    encounterId,
    onMessage: handleMessage,
  });

  return <LabResultsBadge hasResult={!!result} result={result} showValue={showValue} />;
}
```

### Phase 3: PowerSync Implementation (Future Sprint)

> **Note**: PowerSync requires significant infrastructure changes and should be a dedicated sprint.

#### 3.1 Prerequisites
- [ ] Set up PowerSync backend service (or use hosted)
- [ ] Define sync rules for laboratory data
- [ ] Create SQLite schema for client-side storage

#### 3.2 Implementation Steps
1. Install PowerSync SDK: `@powersync/react-native` or `@powersync/web`
2. Define sync schema matching Django models
3. Replace REST API calls with PowerSync queries
4. Implement conflict resolution for offline edits
5. Test offline scenarios

---

## File Changes Summary

### New Files
| Path | Purpose | Status |
|------|---------|--------|
| `web-app/components/laboratory/lab-clinician-socket-provider.tsx` | Client wrapper for clinician alerts | ✅ Created |
| `web-app/components/laboratory/lab-results-badge-live.tsx` | Real-time badge wrapper with WebSocket | ✅ Created |

### Modified Files
| Path | Changes | Status |
|------|---------|--------|
| `web-app/lib/hooks/use-websocket.ts` | Added lab event types + 4 lab WebSocket hooks | ✅ Done |
| `web-app/lib/hooks/index.ts` | Export lab hooks and types | ✅ Done |
| `web-app/components/laboratory/lab-queue-view.tsx` | Add `useLabQueueSocket` subscription | ✅ Done |
| `web-app/components/laboratory/lab-order-detail.tsx` | Add `useLabOrderSocket` subscription | ✅ Done |
| `web-app/components/laboratory/lab-results-entry.tsx` | Add `useLabOrderSocket` for multi-user awareness | ✅ Done |
| `web-app/app/(dashboard)/laboratory/layout.tsx` | Wrap with `LabClinicianSocketProvider` for critical alerts | ✅ Done |
| `web-app/components/laboratory/index.ts` | Export `LabResultsBadgeLive` component | ✅ Done |

---

## Testing Checklist

### Unit Tests
- [ ] `use-lab-websocket.test.tsx` - Hook behavior tests
- [ ] Lab event type validation

### Integration Tests
- [ ] WebSocket connection to backend
- [ ] React Query cache invalidation on events
- [ ] Critical alert toast display

### E2E Tests
- [ ] Result verification updates badge in real-time
- [ ] Critical result shows instant notification
- [ ] Multi-user scenario (verify on one screen, updates on another)

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| Already installed | - | `@tanstack/react-query`, WebSocket native API |
| Future (PowerSync) | TBD | `@powersync/web` or `@powersync/react-native` |

---

## Estimated Effort

| Phase | Effort | Priority | Status |
|-------|--------|----------|--------|
| Phase 1: Lab WebSocket Integration | 2-3 hours | 🔴 High | ✅ Complete |
| Phase 2: Badge Real-Time | 1 hour | 🔴 High | ✅ Complete |
| Phase 3: PowerSync | 2-3 days | 🟡 Medium (future sprint) | 📋 Pending |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | Prioritize WebSocket over PowerSync | WebSocket infrastructure already exists; PowerSync requires new infra |
| 2026-02-11 | Use existing `use-websocket.ts` pattern | Consistency with clinic queue implementation |
| 2026-02-11 | React Query invalidation over direct state | Leverages existing cache, simpler than custom stores |

# WebSocket & Store Integration Implementation Summary

## What Was Implemented

### A) Frontend WebSocket Client (`lib/hooks/use-websocket.ts`)

**New hook exports:**
- `useWebSocket` - Low-level WebSocket hook with auto-reconnection
- `useClinicQueueSocket` - High-level hook for clinic queue real-time updates
- `getConnectionStatusText` / `getConnectionStatusColor` - UI helpers

**Features:**
1. **Auto-reconnection** with configurable delay and max attempts
2. **React Query integration** - Automatically invalidates cache on events
3. **Zustand store integration** - Updates patient-journey store on:
   - `patient_added` → `registerPatient()` + `addToWaitingQueue()`
   - `patient_called` → `callPatient()`
   - `consultation_started` → `startConsultation()` + `setEncounter()`
   - `visit_completed` → `endConsultation()`
   - `patient_removed` → `removePatient()` or `markLeftWithoutBeingSeen()`

4. **Graceful degradation** - Falls back to polling (existing 15-30s refetchInterval)

**Usage Example:**
```tsx
function ClinicQueuePage({ clinicId }: { clinicId: number }) {
  const { isConnected, connectionState } = useClinicQueueSocket(clinicId);
  const { data: queue } = useClinicQueue(clinicId); // Still use React Query
  
  return (
    <div>
      <WebSocketStatus connectionState={connectionState} />
      <QueueList items={queue?.results} />
    </div>
  );
}
```

### B) Patient Schema (`lib/schemas/patient.schema.ts`)

**Fully implemented schemas matching `lib/types/patient.ts`:**
- `PatientSchema` - Full patient detail
- `PatientListItemSchema` - Compact list view
- `EmergencyContactSchema` - Emergency contact
- `PatientEncounterSchema` - Patient encounter history
- `PatientCreateDataSchema` - Form validation for creation
- `PatientUpdateDataSchema` - Form validation for updates
- `PaginatedPatientSchema` - Paginated list response

### C) Supporting Components

1. **`components/ui/websocket-status.tsx`** - Connection status indicator
2. **`__tests__/lib/hooks/use-websocket.test.ts`** - Unit tests

---

## Remaining Gaps for Full Functionality

### 1. Query Key Standardization (HIGH PRIORITY)

**Problem:** `PatientProvider` uses `['patient-context', patientId]` instead of standard `['patients', 'detail', patientId]`

**Fix needed in `lib/context/patient-context.tsx`:**
```tsx
// Change from:
queryKey: ['patient-context', patientId],

// To:
queryKey: patientKeys.detail(patientId!),
```

**Where to add `patientKeys`:**
```typescript
// In lib/hooks/use-patients.ts
export const patientKeys = {
  all: ['patients'] as const,
  lists: () => [...patientKeys.all, 'list'] as const,
  list: (params?: PatientListParams) => [...patientKeys.lists(), params] as const,
  details: () => [...patientKeys.all, 'detail'] as const,
  detail: (id: number) => [...patientKeys.details(), id] as const,
};
```

### 2. API Response Validation (MEDIUM PRIORITY)

**Current state:** `patientsApi` doesn't use Zod validation

**Fix needed in `lib/api/patients.ts`:**
```typescript
import { parseResponse } from '@/lib/schemas/validation';
import { PatientSchema, PaginatedPatientSchema } from '@/lib/schemas/patient.schema';

export const patientsApi = {
  async getPatient(id: number): Promise<Patient> {
    const response = await apiClient.get(`/api/patients/${id}/`);
    return parseResponse(PatientSchema, response.data, { context: 'patientsApi.getPatient' });
  },
  
  async getPatients(params: PatientListParams = {}): Promise<PaginatedResponse<Patient>> {
    // ... build searchParams ...
    const response = await apiClient.get<PaginatedResponse<Patient>>(`/api/patients/?${searchParams.toString()}`);
    return parseResponse(PaginatedPatientSchema, response.data, { context: 'patientsApi.getPatients' });
  },
};
```

### 3. Clinics Module → Patient Journey Store Integration (MEDIUM PRIORITY)

**Current state:** Clinics module doesn't sync to patient-journey store on user actions

**Where to add:**
- `useAddToQueue` mutation `onSuccess` → call `journeyStore.addToWaitingQueue()`
- `useCallPatient` mutation `onSuccess` → call `journeyStore.callPatient()`
- `useStartConsultation` mutation `onSuccess` → call `journeyStore.startConsultation()`

**Example fix in `lib/hooks/use-clinics.ts`:**
```typescript
export function useCallPatient() {
  const queryClient = useQueryClient();
  const journeyStore = usePatientJourneyStore();

  return useMutation({
    mutationFn: (visitId: number) => clinicsApi.callPatient(visitId),
    onSuccess: (data, _visitId) => {
      // Existing invalidation
      queryClient.invalidateQueries({ queryKey: clinicKeys.queue(data.session) });
      
      // NEW: Sync to journey store
      journeyStore.callPatient(data.patient.id);
    },
  });
}
```

### 4. Other Module WebSocket Events (FUTURE)

Backend has WebSocket infrastructure but only clinic queue broadcasts are implemented.

**Future WebSocket events to add:**
| Module | Event | Backend Status | Frontend Hook Needed |
|--------|-------|----------------|---------------------|
| Laboratory | `sample_collected`, `results_ready` | 📋 Not implemented | `useLabQueueSocket` |
| Pharmacy | `prescription_ready`, `dispensed` | 📋 Not implemented | `usePharmacySocket` |
| Inpatient | `bed_assigned`, `patient_admitted` | 📋 Not implemented | `useInpatientSocket` |
| Billing | `payment_received`, `invoice_created` | 📋 Not implemented | `useBillingSocket` |

### 5. Environment Configuration

**Add to `.env.local`:**
```env
# WebSocket URL (optional - defaults to deriving from NEXT_PUBLIC_API_URL)
NEXT_PUBLIC_WS_URL=ws://localhost:9088
```

### 6. Missing Schema Implementations (LOW PRIORITY)

Other placeholder schemas in `lib/schemas/`:
- `encounter.schema.ts`
- `pharmacy.schema.ts`
- `laboratory.schema.ts`
- `billing.schema.ts`
- `triage.schema.ts`
- `inpatient.schema.ts`
- `rbac.schema.ts`
- `sha.schema.ts`
- `core.schema.ts`

---

## Files Changed

| File | Change |
|------|--------|
| `lib/hooks/use-websocket.ts` | **NEW** - WebSocket hooks |
| `lib/hooks/index.ts` | Added WebSocket hook exports |
| `lib/schemas/patient.schema.ts` | **REPLACED** placeholder with full implementation |
| `components/ui/websocket-status.tsx` | **NEW** - Status indicator component |
| `__tests__/lib/hooks/use-websocket.test.ts` | **NEW** - Unit tests |

## Testing

```bash
# Run WebSocket hook tests
cd web-app && npm test -- use-websocket

# Type check
npx tsc --noEmit --skipLibCheck
```

## Architecture Notes

From `docs/scheduling+websockets.md`:
> - WebSockets are **read-only, real-time projections**
> - All state changes occur via REST/HTTP
> - **Graceful Degradation** - If WebSockets fail, system remains usable via polling

The implementation follows these principles:
1. WebSocket events only trigger React Query invalidations (data refetched via REST)
2. Store updates are optimistic but REST remains authoritative
3. Polling fallback (15-30s) continues to work if WebSocket fails

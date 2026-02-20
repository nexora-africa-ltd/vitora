# Triage Module Architecture Advisory

> **Date**: February 21, 2026  
> **Status**: Implemented (Updated to reflect current state)  
> **Scope**: `web-app/app/(dashboard)/triage/**`, `web-app/lib/stores/triage-assess-store.ts`

---

## Table of Contents

1. [Idempotency Key Usage](#1-idempotency-key-usage)
2. [Patient/Encounter Context Usage](#2-patientencounter-context-usage)
3. [Triage Detail View with Tabs](#3-triage-detail-view-with-tabs) ✅ **IMPLEMENTED**
4. [Arrival Mode Conditional Fields](#4-arrival-mode-conditional-fields) ✅ **IMPLEMENTED**

---

## 1. Idempotency Key Usage

### Current State

**Idempotency is NOT employed in triage assessment creation** - but duplicates are prevented by other mechanisms.

| Module | Idempotency Status |
|--------|-------------------|
| Patient Registration | ✅ Uses `X-Idempotency-Key` header |
| Triage Assessment | ❌ No idempotency key (not needed - see below) |

### How Duplicate Triage is Currently Prevented

1. **Database-level constraint**: `TriageAssessment` has a `OneToOneField` to `Encounter`:
   ```python
   encounter = models.OneToOneField(
       "encounters.Encounter", on_delete=models.CASCADE, related_name="triage_assessment"
   )
   ```
   A second POST for the same encounter fails with `IntegrityError` (HTTP 400).

2. **Encounter `triage_status` field**: The `Encounter` model tracks `triage_status` (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `BYPASSED`, `NOT_APPLICABLE`).

3. ✅ **Frontend pre-check** (IMPLEMENTED): The `AlreadyTriagedWarning` component is displayed when navigating to an already-triaged encounter.

### Already-Triaged Encounter Scenario ✅ RESOLVED

| Check | Status |
|-------|--------|
| Pre-fetch encounter triage status before showing form | ✅ `AlreadyTriagedWarning` component |
| Display existing triage assessment | ✅ Warning with link to view assessment |
| Frontend validation before POST | ✅ Guard prevents duplicate submission |

### Is `useIdempotencyKey` Relevant?

| Scenario | `useIdempotencyKey` Helps? | Current Solution |
|----------|---------------------------|-----------------|
| User double-clicks submit button | ✅ Yes | ✅ Mutation `isPending` state prevents this |
| Network retry creates duplicate | ✅ Yes | ✅ OneToOne constraint prevents DB duplicate |
| User refreshes page mid-submission | ✅ Yes | ✅ Multi-tab store preserves state |
| User navigates to new triage for already-triaged encounter | ❌ No | ✅ `AlreadyTriagedWarning` displayed |

### Status: No Action Required

The current implementation adequately prevents duplicate triage assessments without requiring idempotency keys.

---

## 2. Patient/Encounter Context Usage

### Current State ✅ IMPLEMENTED

**Both `PatientProvider` and `EncounterProvider` are now used in the triage module.**

| Triage Page | Patient/Encounter Data Source |
|-------------|-------------------------------|
| `/triage` (queue) | `useWaitingQueue()` hook - returns flattened patient info |
| `/triage/new` | `usePatient(id)` + `useEncounter(id)` React Query hooks directly |
| `/triage/assess/[patientId]/[encounterId]/*` | ✅ **`PatientProvider` + `EncounterProvider`** via layout |
| `/triage/[id]` | `useTriageAssessment(id)` - contains nested patient/encounter refs |

### Context Provider Implementation

The assess layout wraps all child routes with both providers:

```tsx
// app/(dashboard)/triage/assess/[patientId]/[encounterId]/layout.tsx
export default function TriageAssessLayout({ children }) {
  const { patientId, encounterId } = useParams();

  return (
    <PatientProvider patientId={parseInt(patientId, 10)}>
      <EncounterProvider encounterId={parseInt(encounterId, 10)}>
        <TriageLayoutContent>{children}</TriageLayoutContent>
      </EncounterProvider>
    </PatientProvider>
  );
}
```

### Architecture Pattern Alignment

The triage module now aligns with the Patient Shell pattern:

```
Triage Assess Pattern (NEW):
┌─────────────────────────────────────────┐
│ PatientProvider                         │
│ ┌─────────────────────────────────────┐ │
│ │ EncounterProvider                   │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ PatientShellHeader (compact)    │ │ │
│ │ │ (MRN, badges, triage status)    │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ TriageAssessTabs                │ │ │
│ │ │ ┌─────┬─────────┬─────────┬───┐ │ │ │
│ │ │ │Vital│ History │ Assess  │Rte│ │ │ │
│ │ │ └─────┴─────────┴─────────┴───┘ │ │ │
│ │ └─────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Tab Content (child route)       │ │ │
│ │ │                                 │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Benefits Realized

| Benefit | Description |
|---------|-------------|
| **Consistent UX** | Matches patient shell pattern used elsewhere |
| **Shared patient header** | MRN, badges, SHA status visible throughout assessment |
| **Journey store sync** | Automatic via `EncounterProvider` effect |
| **Derived values available** | `canPlaceOrders`, `triageStatus`, `isActiveEncounter` |
| **Patient-encounter validation** | Provider validates relationship automatically |

---

## 3. Triage Detail View with Tabs ✅ IMPLEMENTED

### Implementation Status

**The tabbed triage view has been fully implemented.**

**Route**: `/triage/assess/[patientId]/[encounterId]/*`

### Tab Structure

| Tab | Route | Purpose | Icon |
|-----|-------|---------|------|
| **Vitals** | `/triage/assess/[pid]/[eid]/vitals` | Record temperature, BP, HR, SpO2, RR, weight, height | Activity |
| **History** | `/triage/assess/[pid]/[eid]/history` | Review allergies, medications, past medical history | History |
| **Assessment** | `/triage/assess/[pid]/[eid]/assessment` | KETA category calculation, arrival mode, chief complaint | ClipboardCheck |
| **Route** | `/triage/assess/[pid]/[eid]/route` | Route to clinic or emergency area, complete triage | ArrowRightCircle |

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `TriageAssessLayout` | `app/(dashboard)/triage/assess/[patientId]/[encounterId]/layout.tsx` | Wraps routes with providers |
| `TriageAssessTabs` | `components/triage/triage-assess-tabs.tsx` | Tab navigation UI |
| `TriageAssessStore` | `lib/stores/triage-assess-store.ts` | Zustand store for cross-tab state |

### State Management

Data persists across tabs via the `TriageAssessStore` Zustand store:

```typescript
interface TriageAssessSession {
  encounterId: number;
  patientId: number;
  vitals: TriageVitals;           // From Vitals tab
  history: TriageHistory;          // From History tab
  assessment: TriageAssessmentData; // From Assessment tab
  routing: TriageRouting;          // From Route tab
  startedAt: Date;
  lastUpdatedAt: Date;
}
```

### Workflow

```
1. Nurse selects patient from queue
   ↓
2. Redirected to /triage/assess/[pid]/[eid]/vitals
   ↓
3. Records vitals → Next tab
   ↓
4. Reviews/updates history → Next tab
   ↓
5. Completes assessment (category, arrival mode, complaint) → Next tab
   ↓
6. Routes to clinic or ER area → Submit
   ↓
7. Assessment saved, patient added to destination queue
   ↓
8. Store cleared, redirected to triage queue
```

### Responsive Design

| Breakpoint | Tab Display |
|------------|-------------|
| Mobile (<640px) | Short labels ("Vitals", "History", "Assess", "Route") |
| Desktop (≥640px) | Step numbers + full labels + icons |

---

## 4. Arrival Mode Conditional Fields ✅ MVP IMPLEMENTED

### Context

When a patient arrives via specific modes (referral, ambulance, police), additional documentation is required for:
- SHA claims validation
- KHIS/DHIS2 reporting
- Legal/medico-legal documentation
- Continuity of care

### Implementation Status

#### MVP (IMPLEMENTED ✅)

**Scope**: Referral → Referring Facility Name (required)

| Component | Status | Details |
|-----------|--------|---------|
| Backend Model | ✅ | `referring_facility_name` CharField added to `TriageAssessment` |
| Migration | ✅ | `0008_add_referring_facility_name` applied |
| Serializer | ✅ | Conditional validation: required if `arrival_mode == 'REFERRAL'` |
| Frontend Form | ✅ | Assessment tab shows conditional text input |
| Zod Validation | ✅ | Frontend validation matches backend rules |
| Store | ✅ | `TriageAssessmentData.referring_facility_name` in Zustand store |

### Current Conditional Logic

```tsx
// In Assessment tab form
{isReferral && (
  <div className="space-y-2 p-4 rounded-lg border-2 border-blue-200 ...">
    <Label htmlFor="referring_facility_name">
      <Ambulance className="h-4 w-4" />
      Referring Facility Name *
    </Label>
    <Input
      id="referring_facility_name"
      placeholder="Enter the name of the referring facility"
      {...register('referring_facility_name')}
    />
  </div>
)}
```

### Fields by Arrival Mode

| Arrival Mode | Field | MVP Status | Post-Pilot |
|--------------|-------|------------|------------|
| **REFERRAL** | `referring_facility_name` | ✅ Required | - |
| **REFERRAL** | `referring_clinician` | ❌ | Optional |
| **REFERRAL** | `referral_reason` | ❌ | Optional |
| **REFERRAL** | `referral_letter` (file) | ❌ | Optional |
| **AMBULANCE** | `ambulance_provider` | ❌ | Optional |
| **AMBULANCE** | `prehospital_interventions` | ❌ | Optional |
| **AMBULANCE** | `paramedic_notes` | ❌ | Optional |
| **POLICE** | `police_station` | ❌ | Optional |
| **POLICE** | `ob_number` | ❌ | Optional |
| **POLICE** | `incident_type` | ❌ | Optional |
| **POLICE** | `is_medicolegal` | ❌ | Workflow trigger |
| **OTHER** | `arrival_mode_details` | ❌ | Optional |

### Post-Pilot Phase 2 (Remaining Work)

| Task | Effort | Priority |
|------|--------|----------|
| Add remaining REFERRAL fields | 1 hr | Low |
| Add AMBULANCE fields | 1 hr | Low |
| Add POLICE fields + medicolegal flag | 1.5 hrs | Medium |
| Add OTHER details field | 15 min | Low |
| File upload for referral letter | 1.5 hrs | Low |
| Kenya MFL dropdown for referring facility | 2 hrs | Deferred |
| Medicolegal workflow trigger | 2-3 hrs | Deferred |

**Total Post-Pilot Effort**: ~8-10 hours

### Integration Points (Future)

| Feature | Integration |
|---------|-------------|
| Referring Facility | Kenya Master Facility List (MFL) dropdown |
| Ambulance Provider | Configured list per facility |
| Medicolegal Flag | Triggers P3 form workflow, special billing |
| KHIS Reporting | Referral source is a reportable indicator |

---

## Summary: Implementation Status

| Section | Status | Notes |
|---------|--------|-------|
| 1. Idempotency | ✅ Not needed | OneToOne + frontend guards sufficient |
| 2. Patient/Encounter Context | ✅ Implemented | Providers wrap assess routes |
| 3. Tabbed Triage View | ✅ Implemented | 4 tabs with Zustand state |
| 4. Arrival Mode Fields | ✅ MVP Done | `referring_facility_name` for referrals |

---

## Action Items

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| ✅ Done | Add `referring_facility_name` conditional field (MVP) | 3 hrs | **Implemented** |
| ✅ Done | Add pre-check for already-triaged encounters | 1 hour | **Implemented** (`AlreadyTriagedWarning`) |
| ✅ Done | Implement tabbed triage view with providers | 8 hrs | **Implemented** |
| ✅ Done | Add Zustand store for cross-tab state | 2 hrs | **Implemented** (`TriageAssessStore`) |
| Low | Consider adding idempotency to triage POST | 2 hours | Not needed |
| Post-Pilot | Add remaining arrival mode conditional fields | 8-10 hrs | Pending |

---

*Last Updated: February 21, 2026*

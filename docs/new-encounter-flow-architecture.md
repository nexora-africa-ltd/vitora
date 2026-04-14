# New Encounter Flow Architecture

> **Version**: 1.0
> **Last Updated**: February 27, 2026

## Overview

The new encounter creation functionality uses a **flow-based architecture** with URL-based navigation between steps. This mirrors the encounter edit and triage assessment workflow patterns, providing a consistent user experience across clinical workflows.

## URL Structure

```
/encounters/new          → Redirects to /patient
/encounters/new/patient  → Step 1: Select patient
/encounters/new/details  → Step 2: Encounter type, date, chief complaint
/encounters/new/history  → Step 3: Medical history (optional)
/encounters/new/notes    → Step 4: Clinical notes (optional)
/encounters/new/diagnosis → Step 5: ICD-10 diagnoses (optional)
/encounters/new/review   → Step 6: Summary and create
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  New Encounter Layout (new/layout.tsx)           │
│  • Session initialization from store                             │
│  • Draft recovery banner                                         │
│  • PageHeader with patient context                               │
│  • NewEncounterTabs (step navigation)                            │
├─────────────────────────────────────────────────────────────────┤
│                  Step Pages (new/*/page.tsx)                     │
│  • Individual step content                                       │
│  • Navigation buttons (Back/Next)                                │
│  • Store updates on field changes                                │
└─────────────────────────────────────────────────────────────────┘
```

## State Management

### NewEncounterStore (Zustand with localStorage persistence)

Located at `lib/stores/new-encounter-store.ts`, this store persists new encounter data across steps and browser sessions.

```typescript
interface NewEncounterSession {
  sessionId: string;
  patientId: number | null;
  patientData: Patient | null;

  // Core fields
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;

  // Section data
  vitals: NewEncounterVitals;
  history: NewEncounterHistory;
  notes: NewEncounterNotes;
  diagnoses: DiagnosisFormData[];

  // Tracking
  startedAt: Date;
  lastUpdatedAt: Date;
  isDirty: boolean;
  completedSections: {
    patient: boolean;
    details: boolean;
    history: boolean;
    notes: boolean;
    diagnosis: boolean;
  };
}
```

### Data Flow

```
1. Layout mounts → Initialize or recover session from store
2. User navigates to step → Step page reads from store
3. User edits → Store updated immediately (persisted to localStorage)
4. User clicks Next → Mark section complete, navigate to next step
5. Review step → Show summary of all sections
6. Create → POST to API, clear store, redirect to encounter or triage
```

## Step Details

| Step | Route | Components | Status |
|------|-------|------------|--------|
| 1 | `/patient` | `PatientSelector` | Required |
| 2 | `/details` | Encounter type, chief complaint | Required |
| 3 | `/history` | `MedicalHistoryFormContent` | Optional |
| 4 | `/notes` | `ClinicalNotesFormContent` | Optional |
| 5 | `/diagnosis` | `DiagnosisFormContent` | Optional |
| 6 | `/review` | Summary sections, create buttons | N/A |

## Tab Navigation

The `NewEncounterTabs` component provides:
- Visual step numbers with completion indicators (✓)
- Active step highlighting
- Required field indicators (*)
- Short labels on mobile, full labels on desktop
- Unsaved changes badge

## Draft Recovery

Data is automatically persisted to localStorage via Zustand's `persist` middleware:
- Session survives page refresh and browser close
- Draft recovery banner shown if previous session exists
- User can recover or discard draft
- Session cleared on successful encounter creation

## Post-Creation Flow

After creating an encounter:

1. **For OPD encounters**: Show triage modal prompting to record vitals
2. **For EMERGENCY/IPD encounters**: Skip triage, redirect to encounter view
3. **Save as Draft**: Creates encounter with `status: 'CREATED'`, redirects to list

## Browser Navigation

The URL-based approach enables:
- Browser back/forward navigation between steps
- Bookmarkable step URLs
- Refresh without losing current step (data in localStorage)
- Deep linking to specific steps

## Related Files

| File | Purpose |
|------|---------|
| `lib/stores/new-encounter-store.ts` | Zustand store with localStorage persistence |
| `lib/stores/index.ts` | Store exports |
| `components/encounters/new-encounter-tabs.tsx` | Tab navigation |
| `app/(dashboard)/encounters/new/layout.tsx` | Flow layout |
| `app/(dashboard)/encounters/new/page.tsx` | Redirect to patient step |
| `app/(dashboard)/encounters/new/*/page.tsx` | Step pages |

## Comparison: Old (Single Page) vs New (Flow)

| Aspect | Old (Single Page) | New (Flow) |
|--------|-------------------|------------|
| Navigation | Client-side tabs | URL-based steps |
| Browser history | No history entries | Full history support |
| Code organization | Single 661-line file | 6 focused ~150-line files |
| Mobile UX | All sections loaded | Only current step loaded |
| Deep linking | Not supported | Supported |
| Crash recovery | localStorage draft | Zustand + localStorage |
| State management | useState | Zustand store |

## Key Differences from Encounter Edit Flow

| Aspect | New Encounter | Edit Encounter |
|--------|---------------|----------------|
| Patient selection | Dedicated step | Pre-selected (from URL) |
| Vitals step | Not included (via Triage) | Included |
| Orders step | Not included | Included |
| Referrals step | Not included | Included |
| Required fields | Patient + Chief complaint | Varies by step |
| API operation | POST (create) | PATCH (update) |
| Auto-save | To localStorage only | To localStorage + API |

## Future Enhancements

1. **Pre-fill history** — Load patient's previous encounter history
2. **Step validation** — Enforce required fields before allowing next step
3. **Progress indicator** — Show overall completion percentage
4. **Keyboard shortcuts** — Alt+Left/Right for step navigation
5. **Template selection** — Choose from encounter templates

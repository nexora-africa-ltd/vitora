# Encounter Edit Flow Architecture

> **Version**: 1.0  
> **Last Updated**: February 27, 2026

## Overview

The encounter edit functionality uses a **flow-based architecture** with URL-based navigation between steps. This mirrors the triage assessment workflow pattern, providing a consistent user experience across clinical workflows.

## URL Structure

```
/encounters/[id]/edit          → Redirects to /vitals
/encounters/[id]/edit/vitals   → Step 1: Vital signs
/encounters/[id]/edit/history  → Step 2: Medical history
/encounters/[id]/edit/notes    → Step 3: Clinical notes & templates
/encounters/[id]/edit/diagnosis → Step 4: ICD-10 diagnoses
/encounters/[id]/edit/orders   → Step 5: Lab, imaging, pharmacy orders
/encounters/[id]/edit/referrals → Step 6: Referrals & allied health
/encounters/[id]/edit/review   → Step 7: SOAP summary & finalization
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Parent Layout (encounters/[id]/layout.tsx)      │
│  • PatientProvider (patient context)                             │
│  • EncounterProvider (encounter context)                         │
│  • PatientShellHeader (compact patient info)                     │
├─────────────────────────────────────────────────────────────────┤
│                  Edit Layout (edit/layout.tsx)                   │
│  • Initializes EncounterEditStore session                        │
│  • EncounterEditTabs (step navigation)                           │
├─────────────────────────────────────────────────────────────────┤
│                  Step Pages (edit/*/page.tsx)                    │
│  • Individual step content                                       │
│  • Auto-save with useAutoSave hook                               │
│  • Navigation buttons (Back/Next)                                │
└─────────────────────────────────────────────────────────────────┘
```

## State Management

### EncounterEditStore (Zustand)

Located at `lib/stores/encounter-edit-store.ts`, this store persists encounter edit data across steps.

```typescript
interface EncounterEditSession {
  encounterId: number;
  patientId: number;
  encounter_type: EncounterType;
  encounter_date: string;
  chief_complaint: string;
  status: string;
  
  // Section data
  vitals: EncounterVitals;
  history: EncounterHistory;
  notes: EncounterNotes;
  diagnoses: DiagnosisFormData[];
  
  // Tracking
  startedAt: Date;
  lastUpdatedAt: Date;
  isDirty: boolean;
  completedSections: {
    vitals: boolean;
    history: boolean;
    notes: boolean;
    diagnosis: boolean;
    orders: boolean;
    referrals: boolean;
  };
}
```

### Data Flow

```
1. Layout mounts → Load encounter from API
2. Layout initializes store session with encounter data
3. User navigates to step → Step page reads from store
4. User edits → Store updated immediately
5. Auto-save hook → Debounced PATCH to API (2s)
6. User clicks Next → Mark section complete, navigate
7. Review step → Show SOAP summary
8. Finalize → Submit all, clear store, redirect
```

## Step Details

| Step | Route | Components | Save Behavior |
|------|-------|------------|---------------|
| 1 | `/vitals` | `VitalsForm` | Auto-save (2s debounce) |
| 2 | `/history` | `MedicalHistoryFormContent` | Auto-save (2s debounce) |
| 3 | `/notes` | `ClinicalNotesFormContent`, `ClinicalTemplateFormContent` | Auto-save (2s debounce) |
| 4 | `/diagnosis` | `DiagnosisFormContent` | Immediate (API mutation) |
| 5 | `/orders` | Lab/Imaging/Pharmacy tabs | Immediate (API mutation) |
| 6 | `/referrals` | Referrals, Allied Health | Immediate (API mutation) |
| 7 | `/review` | `SOAPNoteSummary` | Manual save or finalize |

## Tab Navigation

The `EncounterEditTabs` component provides:
- Visual step numbers with completion indicators (✓)
- Active step highlighting
- Short labels on mobile, full labels on desktop
- Read-only badge for closed encounters

## Auto-Save Pattern

Each step uses the `useAutoSave` hook:

```typescript
const autoSave = useAutoSave({
  data: autoSaveData,           // Data to save
  onSave: async (data) => {     // Save function
    await updateEncounter.mutateAsync({ id: encounterId, data });
  },
  debounceMs: 2000,             // Debounce delay
  enabled: isEditable,          // Condition
  onSuccess: () => {
    setDirty(encounterId, false);
  },
});
```

The `AutoSaveStatusIndicator` shows:
- "Saving..." during save
- "Saved X seconds ago" after success
- Error state if save fails

## Read-Only Mode

When `encounter.status === 'CLOSED' || 'CANCELLED'`:
- All form fields are disabled
- Alert banner explains read-only state
- Finalize button is hidden

## Browser Navigation

The URL-based approach enables:
- Browser back/forward navigation between steps
- Bookmarkable step URLs
- Refresh without losing current step
- Deep linking to specific steps

## Related Files

| File | Purpose |
|------|---------|
| `lib/stores/encounter-edit-store.ts` | Zustand store |
| `lib/stores/index.ts` | Store exports |
| `components/encounters/encounter-edit-tabs.tsx` | Tab navigation |
| `app/(dashboard)/encounters/[id]/edit/layout.tsx` | Edit flow layout |
| `app/(dashboard)/encounters/[id]/edit/page.tsx` | Redirect to vitals |
| `app/(dashboard)/encounters/[id]/edit/*/page.tsx` | Step pages |

## Comparison: Accordion vs Flow

| Aspect | Accordion (Legacy) | Flow (Current) |
|--------|-------------------|----------------|
| Navigation | Expand/collapse sections | URL-based tabs |
| Browser history | No history entries | Full history support |
| Code organization | Single 1080-line file | 7 focused ~200-line files |
| Mobile UX | All sections loaded | Only current step loaded |
| Deep linking | Not supported | Supported |

## Future Enhancements

1. **localStorage persistence** — Backup store to localStorage for crash recovery
2. **Conflict detection** — Warn if another user modified the encounter
3. **Step validation** — Require fields before allowing next step
4. **Progress indicator** — Show overall completion percentage
5. **Keyboard shortcuts** — Alt+Left/Right for step navigation

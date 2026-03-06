# AI Widget → Panel Integration (Phase 5)

> Architecture and implementation reference for routing AI quick actions from the chat widget to dedicated Phase 5 clinical panels.

---

## Overview

Phase 5 introduced specialised AI panels (discharge readiness, care plan, CDS evaluation, lab interpretation, structured notes) that perform domain-specific clinical analysis. Rather than routing every AI interaction through the general-purpose chat, the widget now detects **panel actions** and delegates to the appropriate in-page panel — giving clinicians richer, structured output with tables, badges, and export options.

### Before vs After

| Before (Chat-only) | After (Panel Routing) |
|--------------------|-----------------------|
| Quick action sends natural language query to TibaBot `/clinical/assist` | Quick action triggers a dedicated panel component |
| Response is free-text in the chat bubble | Response is structured UI: scores, criteria tables, action items |
| Clinician must read prose and extract intent | Clinician sees at-a-glance readiness levels, flagged values, care plan items |
| No export capability | FHIR export, print-friendly views |

---

## Architecture

### Context-Mediated Routing Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. User clicks quick action button in AI Chat Widget              │
│     e.g. "Discharge readiness"                                     │
│                                                                     │
│  2. Widget checks action.panelAction                               │
│     ├── If undefined → standard chat mutation (existing flow)      │
│     └── If defined  → triggerPanelAction(action.panelAction)       │
│                        + minimizeWidget()                          │
│                        + brief confirmation message in chat        │
│                                                                     │
│  3. AIChatContext.activePanelAction = 'discharge-readiness'        │
│                                                                     │
│  4. Page component's useEffect detects activePanelAction match     │
│     → sets local autoTrigger state = true                          │
│     → calls clearPanelAction()                                     │
│                                                                     │
│  5. Panel component receives autoTrigger={true}                    │
│     → fires its AI hook mutation (e.g. useAIDischargeAssess)       │
│     → calls onAutoTriggerConsumed() to reset state                 │
│                                                                     │
│  6. Panel renders structured result inline on the page             │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
Widget                  Context                 Page                    Panel
──────                  ───────                 ────                    ─────
click(qa)
  │
  ├─ panelAction? ──►  triggerPanelAction(id)
  │                         │
  ├─ minimizeWidget()       │
  │                         │
  │                    activePanelAction = id
  │                         │
  │                     useEffect() ──────►  setAutoTrigger(true)
  │                         │                clearPanelAction()
  │                         │
  │                    activePanelAction = null
  │                                              │
  │                                         autoTrigger={true} ────►  mutate(...)
  │                                                                   onAutoTriggerConsumed()
  │                                         autoTrigger={false}
  │                                                                   render result
```

---

## Modified Files

### Infrastructure

| File | Change |
|------|--------|
| `lib/types/ai.ts` | Added `panelAction?: string` to `AIQuickAction` |
| `lib/context/ai-chat-context.tsx` | Added `activePanelAction`, `triggerPanelAction()`, `clearPanelAction()` to context value |
| `components/shared/ai-chat-widget.tsx` | Widget handler checks `action.panelAction`; if present, triggers panel instead of chat mutation |

### Panel Components (autoTrigger added)

| Component | Panel Action ID | AI Hook |
|-----------|----------------|---------|
| `components/inpatient/discharge-readiness-panel.tsx` | `discharge-readiness` | `useAIDischargeAssess` |
| `components/encounters/care-plan-panel.tsx` | `care-plan` | `useAICarePlanGenerate` |
| `components/encounters/enhanced-cds-panel.tsx` | `cds-evaluate` | `useAICDSEvaluate` |
| `components/encounters/lab-interpret-panel.tsx` | `lab-interpret` | `useAILabInterpret` |
| `components/encounters/structure-note-button.tsx` | *(button, not panel-routed)* | `useAIClerkingStructure` |

### Page Wiring

| Page | Quick Actions | Panels Rendered |
|------|--------------|-----------------|
| `admissions/[id]` | Discharge readiness → panel, Suggest care plan → panel, ICU risk → chat, Complications → chat | `DischargeReadinessPanel`, `CarePlanPanel` |
| `encounters/[id]` | DDx → chat, Care plan → panel, Safety check → panel, Workup → chat | `EnhancedCDSPanel`, `CarePlanPanel` |
| `laboratory/results/[id]` | Interpret → panel, Clinical significance → chat, Follow-up → chat | `LabInterpretPanel` |
| `encounters/[id]/edit/notes` | *(no quick actions)* | `StructureNoteButton` (direct button in card header) |

---

## Quick Action Definitions

### Admission Detail (`INPATIENT_QUICK_ACTIONS`)

```typescript
{
  id: 'inpatient-discharge-readiness',
  label: 'Discharge readiness',
  query: '',                           // empty — panel handles the request
  userMessage: '🏠 Evaluating discharge readiness...',
  panelAction: 'discharge-readiness',  // routes to DischargeReadinessPanel
}
```

```typescript
{
  id: 'inpatient-care-plan',
  label: 'Suggest care plan',
  query: '',
  userMessage: '📋 Generating care plan suggestions...',
  panelAction: 'care-plan',            // routes to CarePlanPanel
}
```

### Encounter Detail (`ENCOUNTER_QUICK_ACTIONS`)

```typescript
{
  id: 'encounter-cds-check',
  label: 'Safety check',
  query: '',
  userMessage: '🛡️ Running clinical safety checks...',
  panelAction: 'cds-evaluate',         // routes to EnhancedCDSPanel
}
```

```typescript
{
  id: 'encounter-care-plan',
  label: 'Suggest care plan',
  query: '',
  userMessage: '📋 Generating care plan...',
  panelAction: 'care-plan',            // routes to CarePlanPanel
}
```

### Lab Result Detail (`LAB_QUICK_ACTIONS`)

```typescript
{
  id: 'lab-interpret',
  label: 'Interpret results',
  query: '',
  userMessage: '🧪 Interpreting lab results...',
  panelAction: 'lab-interpret',        // routes to LabInterpretPanel
}
```

---

## How to Add a New Panel Action

### Step 1: Create or Update Your Panel Component

Add `autoTrigger` and `onAutoTriggerConsumed` props:

```typescript
export interface MyPanelProps {
  // ... existing props ...
  autoTrigger?: boolean;
  onAutoTriggerConsumed?: () => void;
}

export function MyPanel({ autoTrigger, onAutoTriggerConsumed, ...props }: MyPanelProps) {
  const { mutate, data: result, isPending } = useMyAIHook();

  // IMPORTANT: Place this useEffect BEFORE any early returns
  React.useEffect(() => {
    if (autoTrigger && !isPending && !result) {
      mutate({ /* request params */ });
      onAutoTriggerConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  // Early returns go here
  if (!isAIEnabled) return null;

  // ... render ...
}
```

### Step 2: Define the Quick Action

In your page file, add the action with `panelAction`:

```typescript
const MY_QUICK_ACTIONS: AIQuickAction[] = [
  {
    id: 'my-panel-action',
    label: 'Run My Analysis',
    query: '',                    // empty string — panel handles everything
    userMessage: '✨ Running analysis...',
    panelAction: 'my-panel-id',   // unique identifier
  },
];
```

### Step 3: Wire the Page

Subscribe to `activePanelAction` and create local autoTrigger state:

```typescript
export default function MyPage() {
  const chatCtx = useOptionalAIChatContext();
  const activePanelAction = chatCtx?.activePanelAction ?? null;
  const clearPanelAction = chatCtx?.clearPanelAction;

  const [autoTrigger, setAutoTrigger] = useState(false);

  useEffect(() => {
    if (activePanelAction === 'my-panel-id' && clearPanelAction) {
      setAutoTrigger(true);
      clearPanelAction();
    }
  }, [activePanelAction, clearPanelAction]);

  // Register quick actions
  const setQuickActions = chatCtx?.setQuickActions;
  useEffect(() => {
    if (!setQuickActions) return;
    setQuickActions(MY_QUICK_ACTIONS);
    return () => { setQuickActions([]); };
  }, [setQuickActions]);

  return (
    <>
      {/* ... page content ... */}
      <MyPanel
        autoTrigger={autoTrigger}
        onAutoTriggerConsumed={() => setAutoTrigger(false)}
      />
    </>
  );
}
```

---

## Rules of Hooks Compliance

All hooks (`useEffect`, `useMemo`, `useCallback`) **must** be called before any early returns like `if (!isAIEnabled) return null`. The `autoTrigger` `useEffect` follows this rule:

```typescript
// ✅ CORRECT — hook before early return
export function MyPanel({ autoTrigger, onAutoTriggerConsumed }: Props) {
  const isAIEnabled = useAIEnabled();
  const { mutate, isPending, data } = useMyHook();

  React.useEffect(() => {                  // ← hook BEFORE early return
    if (autoTrigger && isAIEnabled) { ... }
  }, [autoTrigger]);

  if (!isAIEnabled) return null;            // ← early return AFTER hooks
  // ...
}
```

```typescript
// ❌ WRONG — hook after early return
export function MyPanel({ autoTrigger }: Props) {
  const isAIEnabled = useAIEnabled();

  if (!isAIEnabled) return null;            // ← early return BEFORE hook

  React.useEffect(() => { ... }, []);       // ← VIOLATION: rules-of-hooks
}
```

---

## Panel Action ID Registry

To prevent collisions, all panel action IDs are listed here:

| ID | Panel Component | Used On |
|----|----------------|---------|
| `discharge-readiness` | `DischargeReadinessPanel` | Admissions detail |
| `care-plan` | `CarePlanPanel` | Admissions detail, Encounter detail |
| `cds-evaluate` | `EnhancedCDSPanel` | Encounter detail |
| `lab-interpret` | `LabInterpretPanel` | Lab result detail |

When adding a new panel action, register it in this table.

---

## StructureNoteButton (Direct Integration)

The clerking assist (`StructureNoteButton`) does not use the panel routing pattern. It is rendered directly in the encounter edit notes page header as a button. When clicked, it:

1. Sends the concatenated free-text notes to `useAIClerkingStructure`
2. Shows a preview dialog with the structured SOAP sections
3. On accept, writes sections back to the encounter edit store via `onAccept` callback

```typescript
<StructureNoteButton
  freeText={combinedNotes}
  onAccept={(sections) => {
    if (sections.subjective) setNotes(id, { history_of_present_illness: sections.subjective });
    if (sections.objective) setNotes(id, { physical_examination: sections.objective });
    if (sections.assessment) setNotes(id, { assessment: sections.assessment });
    if (sections.plan) setNotes(id, { notes: sections.plan });
  }}
/>
```

---

*Last Updated: March 7, 2026*
*Phase: 5 — AI Clinical Panels Integration*

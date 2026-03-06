# Smart Autopopulate — CDS & AI Automation

> **Status**: Implemented (feature-gated, disabled by default)
> **Feature Flag**: `smart_autopopulate`
> **Sprint**: 2.6+

---

## Overview

Smart Autopopulate promotes CDS (Clinical Decision Support) and AI from **advisory-only** to **automation with confirmation**. When enabled, the system actively suggests field values during encounter creation — diagnoses, assessments, medical history entries — and the clinician confirms or rejects each suggestion before it's applied.

**Key principle**: No auto-apply without confirmation. Every autopopulated field requires explicit user acceptance. This is a hard UX requirement for clinical safety.

### Before vs After

| Capability | Before (Advisory) | After (Smart Autopopulate) |
|---|---|---|
| ICD-10 diagnosis | Click "AI Suggest" → browse chips → click one | Auto-triggered on typing; top high-confidence result shown inline with Accept/Reject |
| CDS vitals alerts | Text banner: "SpO2 is critically low" | Banner + structured action: "Escalate to Emergency" with Accept button |
| Medical history | Clinician types everything manually | AI analyzes chief complaint → suggests allergies, chronic conditions inline |
| Encounter review | Manual review of all fields | "AI Autopopulate" button → batch review dialog with per-field Accept/Reject |
| CDS alert acceptance | Marks alert as "acknowledged" | Emits structured actions to parent form for field auto-fill |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Smart Autopopulate Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────────┐                     │
│  │ Feature Flag │ ◄────│  Django Admin    │                     │
│  │ (DB model)   │      │  Toggle ON/OFF   │                     │
│  └──────┬───────┘      └──────────────────┘                     │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────-─────┐       │
│  │              Backend (Django REST API)                │       │
│  │                                                       │       │
│  │  ┌────────────────-─┐    ┌─────────────────────┐      │       │
│  │  │ CDS Engine       │    │ AI Autopopulate     │      │       │
│  │  │ evaluate_rule()  │    │ POST /autopopulate/ │      │       │
│  │  │ + suggested_     │    │ + TibaBot client    │      │       │
│  │  │   actions[]      │    │ + ICD-10 suggest    │      │       │
│  │  └────────┬─────────┘    └────────┬────────────┘      │       │
│  │           │                       │                    │       │
│  │           │  CDSAlertSerializer   │                    │       │
│  │           │  gates actions behind │                    │       │
│  │           │  feature flag         │                    │       │
│  │           ▼                       ▼                    │       │
│  │  ┌──────────────────────────────────────┐             │       │
│  │  │        API Responses                  │             │       │
│  │  │  • CDS alerts + suggested_actions[]   │             │       │
│  │  │  • AI suggested_fields[] + ICD-10     │             │       │
│  │  └──────────────────┬───────────────────┘             │       │
│  └─────────────────────┼─────────────────────────────────┘       │
│                        │                                         │
│                        ▼                                         │
│  ┌──────────────────────────────────────────────────────┐       │
│  │              Frontend (Next.js)                       │       │
│  │                                                       │       │
│  │  ┌──────────────┐  ┌──────────────┐                  │       │
│  │  │useFeatureFlag│  │useSmartSug-  │                  │       │
│  │  │("smart_auto- │  │gestions()    │                  │       │
│  │  │ populate")   │  │              │                  │       │
│  │  └──────┬───────┘  └──────┬───────┘                  │       │
│  │         │                 │                           │       │
│  │         ▼                 ▼                           │       │
│  │  ┌────────────────────────────────────┐              │       │
│  │  │       Smart Suggestion UX          │              │       │
│  │  │  • SmartSuggestion (inline/banner) │              │       │
│  │  │  • SmartSuggestionBatch (dialog)   │              │       │
│  │  │  • Accept / Modify / Reject        │              │       │
│  │  └────────────────────────────────────┘              │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Flag System

### Backend Model

The `FeatureFlag` model in `hmis.apps.core` provides runtime-togglable feature flags without redeployment:

```python
from hmis.apps.core.models import FeatureFlag

# Check programmatically
if FeatureFlag.is_flag_enabled("smart_autopopulate"):
    # Include suggested_actions in response
    ...
```

| Field | Type | Description |
|---|---|---|
| `name` | `CharField(unique)` | Flag identifier (e.g., `smart_autopopulate`) |
| `is_enabled` | `BooleanField` | Toggle state (default: `False`) |
| `description` | `TextField` | Human-readable explanation |
| `created_at` | `DateTimeField` | Auto-set on creation |
| `updated_at` | `DateTimeField` | Auto-set on update |

### Enabling the Feature

Toggle via **Django Admin** (`/admin/core/featureflag/`):

1. Navigate to **Core → Feature Flags** in Django Admin
2. Find `smart_autopopulate`
3. Check **Is enabled** and save

Or via Django shell:

```python
from hmis.apps.core.models import FeatureFlag
FeatureFlag.objects.update_or_create(
    name="smart_autopopulate",
    defaults={"is_enabled": True, "description": "Enable CDS & AI smart autopopulation with confirmation"}
)
```

### API

```
GET /api/core/features/          # List all flags (authenticated)
GET /api/core/features/check/?name=smart_autopopulate  # Check one flag
```

Response:
```json
{
  "name": "smart_autopopulate",
  "is_enabled": true,
  "description": "Enable CDS & AI smart autopopulation with confirmation"
}
```

Unknown flags return `{ "is_enabled": false }` — safe default.

### Frontend Hook

```typescript
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';

function MyComponent() {
  const isSmartAutopopulate = useFeatureFlag('smart_autopopulate');

  if (!isSmartAutopopulate) {
    return null; // Feature disabled — render nothing
  }
  // ... render smart suggestions
}
```

The hook fetches from `/api/core/features/check/` with a **5-minute stale time** to avoid excessive API calls.

---

## Backend Changes

### CDS Engine — Structured Actions

The `EvaluationResult` dataclass now includes `suggested_actions`:

```python
@dataclass
class EvaluationResult:
    triggered: bool
    rule_id: int
    rule_code: str
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)
    suggested_actions: list[dict[str, Any]] = field(default_factory=list)  # NEW
```

When a CDS rule triggers, the engine extracts `suggested_actions` from the rule's `metadata` JSON field:

```python
# In evaluate_rule(), after the evaluator runs:
if result.triggered:
    metadata = getattr(rule, "metadata", None) or {}
    result.suggested_actions = metadata.get("suggested_actions", [])
```

### CDS Rule Metadata Format

Rules define their suggested actions in the `metadata` field (`cds_rules.json`):

```json
{
  "code": "VITALS-SPO2-LOW",
  "metadata": {
    "suggested_actions": [
      {
        "action_type": "ESCALATE_PRIORITY",
        "target_field": "encounter_type",
        "value": "EMERGENCY",
        "confidence": 0.95,
        "reason": "SpO2 < 95% indicates hypoxemia — escalation recommended per Kenya Clinical Guidelines"
      },
      {
        "action_type": "ORDER_TEST",
        "target_field": "orders",
        "value": { "test_name": "Arterial Blood Gas", "urgency": "STAT" },
        "confidence": 0.90,
        "reason": "ABG recommended to assess severity of hypoxemia"
      }
    ]
  }
}
```

**Supported action types:**

| Action Type | Description | Target Fields |
|---|---|---|
| `ADD_DIAGNOSIS` | Suggest a diagnosis code | `diagnoses` |
| `ADD_MEDICATION` | Suggest a medication | `current_medications`, prescriptions |
| `REMOVE_MEDICATION` | Flag a medication for removal | `current_medications` |
| `ORDER_TEST` | Suggest a lab/imaging order | `orders` |
| `SET_FIELD` | Set a specific form field | Any encounter field |
| `ESCALATE_PRIORITY` | Change encounter priority/type | `encounter_type`, `priority` |

### CDS Serializer — Feature Flag Gating

The `CDSAlertSerializer` gates `suggested_actions` behind the feature flag:

```python
class CDSAlertSerializer(serializers.ModelSerializer):
    suggested_actions = serializers.SerializerMethodField()

    def get_suggested_actions(self, obj):
        if not FeatureFlag.is_flag_enabled("smart_autopopulate"):
            return []  # Advisory-only mode — no actions
        details = obj.details or {}
        return details.get("suggested_actions", [])
```

- **Flag OFF**: CDS alerts return `suggested_actions: []` — pure advisory mode, identical to pre-feature behavior
- **Flag ON**: CDS alerts include the structured actions from the rule metadata

### AI Autopopulate Endpoint

```
POST /api/ai/autopopulate/
```

**Double-gated**: requires both `TIBABOT_ENABLED` (settings) AND `smart_autopopulate` (feature flag).

**Request:**

```json
{
  "chief_complaint": "Patient presents with severe headache and fever for 3 days",
  "vitals": {
    "temperature": 39.2,
    "pulse": 110,
    "spo2": 94,
    "blood_pressure": "140/90"
  },
  "patient_age": 45,
  "patient_sex": "M",
  "allergies": ["Penicillin"],
  "current_medications": ["Metformin 500mg"],
  "clinical_notes": "History of Type 2 Diabetes. No recent travel.",
  "encounter_type": "OPD"
}
```

**Response:**

```json
{
  "suggested_fields": [
    {
      "field_name": "primary_diagnosis",
      "value": {
        "icd10_code": "R51",
        "description": "Headache",
        "diagnosis_type": "PROVISIONAL"
      },
      "confidence": 0.88,
      "reason": "AI suggests R51 — Headache (confidence: 88%)",
      "source": "ai"
    },
    {
      "field_name": "assessment",
      "value": "45-year-old male with Type 2 DM presenting with ...",
      "confidence": 0.75,
      "reason": "AI-generated clinical assessment based on encounter context",
      "source": "ai"
    }
  ],
  "icd10_suggestions": [
    { "code": "R51", "description": "Headache", "confidence": 0.88 },
    { "code": "R50.9", "description": "Fever, unspecified", "confidence": 0.82 }
  ],
  "error": null
}
```

**Logic:**
1. Sends chief complaint to TibaBot for ICD-10 suggestions
2. If top suggestion confidence ≥ 0.85, adds it as a `primary_diagnosis` field suggestion
3. Builds a clinical assist prompt from all encounter context
4. Returns AI-generated assessment as a field suggestion
5. Gracefully degrades if TibaBot is unavailable (returns empty suggestions + error message)

---

## Frontend Components

### SmartSuggestion

Reusable component for displaying a single AI/CDS suggestion next to a form field:

```tsx
import { SmartSuggestion } from '@/components/shared/smart-suggestion';

<SmartSuggestion
  suggestion={{
    id: 'diag-1',
    field: 'primary_diagnosis',
    value: 'R51 — Headache',
    confidence: 0.88,
    reason: 'AI suggests R51 based on chief complaint',
    source: 'ai',
  }}
  variant="inline"     // or "banner"
  onAccept={(s) => applyToDiagnosisField(s)}
  onReject={(s) => dismissSuggestion(s)}
/>
```

**Variants:**
- `inline` — Compact row with Accept/Reject icons, shown adjacent to a form field
- `banner` — Prominent card for workflow-level suggestions (e.g., "Escalate to Emergency")

**Confidence indicator:**
- ≥ 80%: Green badge
- 50–79%: Yellow badge
- < 50%: Gray badge

### SmartSuggestionBatch

Dialog for bulk-reviewing multiple suggestions at once:

```tsx
import { SmartSuggestionBatch } from '@/components/shared/smart-suggestion-batch';

<SmartSuggestionBatch
  suggestions={allSuggestions}
  open={showBatchDialog}
  onOpenChange={setShowBatchDialog}
  onApply={(accepted) => applyAcceptedSuggestions(accepted)}
  title="AI Autopopulate"
/>
```

Features:
- Per-field Accept/Reject toggles
- "Select All" / "Deselect All" toggle
- Confidence indicators per suggestion
- "Apply Selected" button applies only accepted suggestions
- Summary count of accepted vs total

### useSmartSuggestions Hook

Unified hook combining CDS and AI suggestions:

```typescript
import { useSmartSuggestions } from '@/lib/hooks/use-smart-suggestions';

const {
  suggestions,           // All suggestions (pending + accepted + rejected)
  pendingSuggestions,     // Only unresolved suggestions
  getFieldSuggestions,    // Filter by field name
  accept,                // Accept a suggestion by ID
  reject,                // Reject a suggestion by ID
  fetchSuggestions,       // Trigger AI autopopulate
  isAvailable,           // Feature flag is ON
  isLoading,             // Fetching in progress
} = useSmartSuggestions({ cdsActions: alertActions });
```

Returns empty state when `smart_autopopulate` is disabled — zero impact on existing flows.

---

## Form Integrations

### 1. Diagnosis Form

**Auto-trigger**: When `smart_autopopulate` is enabled and the clinician types ≥ 3 characters in the free-text diagnosis field, AI suggestion is triggered automatically after an 800ms debounce (no need to click "AI Suggest" button).

**High-confidence inline suggestion**: If the top ICD-10 suggestion has confidence ≥ 0.85, it appears as a `SmartSuggestion` inline component above the search results. Clicking Accept auto-fills `icd10_code`, `icd10_display`, and `diagnosis_type`.

Lower-confidence suggestions continue to appear as clickable chips (existing behavior preserved).

### 2. CDS Alerts Panel

When `smart_autopopulate` is enabled, the CDS alerts panel's "Accept" action now emits structured `suggested_actions` via an `onSuggestedAction` callback to the parent form. The parent form can then apply those actions (e.g., change encounter type, add an order).

When the feature is disabled, "Accept" continues to simply mark the alert as acknowledged (existing behavior).

### 3. Medical History Form

An "AI Suggest History" button appears in the medical history card header (only when feature is enabled). It analyzes the chief complaint text and suggests entries for:

- **Allergies** — detected allergy mentions
- **Chronic conditions** — detected condition mentions (e.g., "diabetic" → "Type 2 Diabetes")
- **Current medications** — detected medication mentions

Suggestions appear as `SmartSuggestion` inline components directly below the relevant textarea fields.

### 4. Encounter Review Page

A prominent "AI Autopopulate" button with sparkle icon appears in the encounter review card header. Clicking it:

1. Calls `POST /api/ai/autopopulate/` with the full encounter context (chief complaint, vitals, patient info, history)
2. Opens the `SmartSuggestionBatch` dialog showing all AI-recommended field values
3. Clinician reviews each suggestion and toggles Accept/Reject
4. "Apply Selected" applies only accepted values to the encounter store

---

## Audit & Compliance

All smart autopopulate interactions are audit-logged for Kenya DPA 2019 compliance:

| Event | Audit Action | Details |
|---|---|---|
| AI autopopulate request | `ai_autopopulate_request` | What context was sent (no PII) |
| Suggestion accepted | Logged by parent form | Field name, accepted value, source |
| Suggestion rejected | Logged by parent form | Field name, reason for rejection |
| CDS alert with action accepted | `cds_alert_accepted` | Alert ID, suggested actions emitted |

PII is sanitized before sending to TibaBot via the existing `PIISanitizer` — MRN, phone, and national ID are stripped from all AI requests.

---

## Offline Behavior

| Source | Online | Offline |
|---|---|---|
| **CDS rule-based suggestions** | ✅ Full functionality | ✅ Works — rules are evaluated locally |
| **AI autopopulate** | ✅ Full functionality | ❌ Unavailable — requires TibaBot API |
| **AI ICD-10 suggestions** | ✅ Full functionality | ❌ Unavailable |

When offline, AI-powered features gracefully degrade — the `SmartSuggestion` components simply don't render, and the forms revert to standard manual entry (identical to `smart_autopopulate` being disabled).

---

## Testing

### Backend Tests

| Test File | Tests | Coverage |
|---|---|---|
| `tests/test_feature_flags.py` | 13 tests | FeatureFlag model, API, `is_flag_enabled`, read-only enforcement |
| `tests/test_cds_autopopulate.py` | 6 tests | CDS engine `suggested_actions`, serializer feature-flag gating |
| `tests/test_ai_autopopulate.py` | 9 tests | Autopopulate endpoint, double-gating, TibaBot error handling, audit logging |

```bash
# Run all smart autopopulate tests
cd backend
poetry run pytest tests/test_feature_flags.py tests/test_cds_autopopulate.py tests/test_ai_autopopulate.py -v
```

### Frontend Type Safety

```bash
cd web-app
npx tsc --noEmit  # Zero errors
```

---

## Files Modified / Created

### Backend — Modified

| File | Change |
|---|---|
| `hmis/apps/core/models.py` | Added `FeatureFlag` model |
| `hmis/apps/core/views.py` | Added `FeatureFlagViewSet` with `check` action |
| `hmis/apps/core/serializers.py` | Added `FeatureFlagSerializer` |
| `hmis/apps/core/admin.py` | Registered `FeatureFlagAdmin` |
| `hmis/apps/core/urls.py` | Registered `/features/` route |
| `hmis/apps/cds/engine.py` | Added `suggested_actions` to `EvaluationResult`, extraction from rule metadata |
| `hmis/apps/cds/signals.py` | Included `suggested_actions` in CDSAlert `details` on creation |
| `hmis/apps/cds/serializers.py` | Added `get_suggested_actions` with feature-flag gating |
| `hmis/apps/ai/views.py` | Added `AutopopulateView` |
| `hmis/apps/ai/serializers.py` | Added `AutopopulateRequestSerializer`, `AutopopulateResponseSerializer` |
| `hmis/apps/ai/urls.py` | Registered `/autopopulate/` route |

### Backend — Created

| File | Purpose |
|---|---|
| `tests/test_feature_flags.py` | 13 tests for FeatureFlag model and API |
| `tests/test_cds_autopopulate.py` | 6 tests for CDS suggested_actions |
| `tests/test_ai_autopopulate.py` | 9 tests for AI autopopulate endpoint |

### Frontend — Modified

| File | Change |
|---|---|
| `lib/types/cds.ts` | Added `CDSSuggestedAction` interface |
| `lib/types/ai.ts` | Added `AutopopulateRequest`, `AutopopulateResponse`, `AutopopulateSuggestedField` |
| `lib/schemas/cds.schema.ts` | Added `CDSSuggestedActionSchema`, extended alert schemas |
| `lib/schemas/ai.schema.ts` | Added `AutopopulateSuggestedFieldSchema`, `AutopopulateResponseSchema` |
| `lib/api/ai.ts` | Added `autopopulate()` method to `aiApi` |
| `lib/api/cds.ts` | Extended types to include `suggested_actions` |
| `components/encounters/diagnosis-form.tsx` | Auto-trigger AI suggest, SmartSuggestion inline |
| `components/encounters/medical-history-form.tsx` | AI history suggestion button + inline suggestions |
| `components/encounters/cds-alerts-panel.tsx` | `onSuggestedAction` callback on accept |
| `app/(dashboard)/encounters/new/review/page.tsx` | "AI Autopopulate" button + SmartSuggestionBatch |

### Frontend — Created

| File | Purpose |
|---|---|
| `lib/hooks/use-feature-flags.ts` | `useFeatureFlag` hook — queries backend flag API |
| `lib/hooks/use-smart-suggestions.ts` | `useSmartSuggestions` hook — unified suggestion management |
| `components/shared/smart-suggestion.tsx` | Inline/banner suggestion component with Accept/Reject |
| `components/shared/smart-suggestion-batch.tsx` | Batch review dialog for multiple suggestions |

---

## Configuration Reference

| Setting | Location | Default | Description |
|---|---|---|---|
| `smart_autopopulate` | Django Admin → Feature Flags | `false` | Master toggle for all smart autopopulate features |
| `TIBABOT_ENABLED` | `settings/base.py` (env var) | `false` | Must also be `true` for AI autopopulate endpoint |
| ICD-10 confidence threshold | `AutopopulateView` | `0.85` | Minimum confidence for auto-suggest primary diagnosis |
| Feature flag cache | `useFeatureFlag` hook | 5 min stale | How long frontend caches the flag state |
| Diagnosis auto-trigger debounce | `diagnosis-form.tsx` | 800ms | Delay before auto-triggering AI suggestion |

---

## Adding New Autopopulate Rules

To add a new CDS rule with suggested actions:

1. **Add to `cds_rules.json`** with `suggested_actions` in the `metadata` field
2. **Run**: `python manage.py seed_cds_rules` to load the updated rules
3. The CDS engine automatically extracts and returns the actions when the rule triggers
4. The frontend `SmartSuggestion` components render them automatically

No frontend code changes needed — the structured action format is generic.

---

**Last Updated**: March 6, 2026
**Feature Owner**: Engineering Lead

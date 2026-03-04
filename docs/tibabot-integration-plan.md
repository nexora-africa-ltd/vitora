# TibaBot AI Integration Plan for Vitora HMIS

> **Status**: 🔧 In Progress (Phase 1 complete, Phase 2 complete, Phase 3 complete)
> **Target**: Web App (`web-app/`) + Backend (`backend/`)  
> **Dependency**: Existing CDS Module (DHA Gap #25 — ✅ Complete)  
> **External Service**: TibaBot API (`https://tibabot.hmis.nexora.africa`)

---

## Current State

| Aspect | Status |
|--------|--------|
| TibaBot client code (backend) | ✅ `hmis/apps/ai/client.py` — `TibaBotClient` with retry, timeout, circuit-breaker |
| TibaBot client code (frontend) | ✅ `lib/api/ai.ts` — `aiApi.suggestICD10()`, `aiApi.getStatus()`, `aiApi.clinicalChat()`, `aiApi.clinicalAssist()`, `aiApi.listChatSessions()`, `aiApi.getChatSession()`, `aiApi.deleteChatSession()` |
| TibaBot env vars | ✅ `TIBABOT_ENABLED`, `TIBABOT_API_URL`, `TIBABOT_API_KEY`, `TIBABOT_TIMEOUT` in settings + `.env.example` |
| CDS engine (backend) | ✅ Rule-based, 662-line engine, no AI |
| CDS frontend (types/schemas/hooks/components) | ✅ Fully implemented, integrated into encounters |
| CDS pages (dashboard/rules/alerts) | ✅ Complete |
| ICD-10 backend model + API | ✅ `ICD10Code` model + read-only viewset |
| ICD-10 frontend search | ✅ Manual search via `useICD10Search` hook |
| ICD-11 frontend search | ✅ Via `ICD11Select` component (DHA proxy) |
| AI-powered ICD-10 auto-coding | ✅ Implemented — backend proxy + frontend chips in diagnosis form (25 tests) |
| AI feature flags | ✅ `TIBABOT_ENABLED` (backend) + `NEXT_PUBLIC_ENABLE_AI` / `ENABLE_AI` (frontend) |
| AI feature gate mixin | ✅ `AIFeatureGatedMixin` — returns 404 when disabled |
| PII sanitizer | ✅ `hmis/apps/ai/sanitizer.py` — strips MRN, phone, national ID |
| AI audit logging | ✅ `ai_icd10_suggest` action logged to `AuditLog` |
| Frontend AI hooks | ✅ `useAIEnabled()`, `useAIICD10Suggest()`, `useAIStatus()`, `useAIClinicalChat()`, `useAIClinicalAssist()`, `useAIChatSessions()`, `useAIChatSession()`, `useDeleteAIChatSession()` |
| Frontend Zod schemas | ✅ `lib/schemas/ai.schema.ts` — ICD-10 + status + chat + assist + session validation |
| TibaBot floating widget | ✅ `components/shared/ai-chat-widget.tsx` — minimized (56×56px) + expanded (~400px panel) |
| TibaBot chat panel | ✅ `components/shared/ai-chat-panel.tsx` — shared between widget and full-page |
| TibaBot status indicator | ✅ `components/shared/tibabot-status-indicator.tsx` — 3-state icon (available/unread/unavailable) |
| AI chat context provider | ✅ `lib/context/ai-chat-context.tsx` — widget state, sessions, encounter awareness |
| Full-page AI chat view | ✅ `app/(dashboard)/ai/page.tsx` — session sidebar + chat panel |
| TibaBot nav entry | ✅ "AI Assistant" in sidebar (feature-gated by `ENABLE_AI`) |
| Widget mounted in layout | ✅ `app/(dashboard)/layout.tsx` — `<AIChatProvider>` + `<AIChatWidget />` |
| Phase 2 backend views | ✅ `ClinicalChatView`, `ClinicalAssistView`, `ClinicalChatSessionListView`, `ClinicalChatSessionDetailView` in `views.py` |
| Phase 2 backend URLs | ✅ `/api/ai/clinical/chat/`, `/api/ai/clinical/assist/`, `/api/ai/clinical/chat/sessions/`, `/api/ai/clinical/chat/session/{id}/` registered |
| Phase 2 backend serializers | ✅ `ClinicalChatRequestSerializer`, `ClinicalAssistRequestSerializer`, `AIPageContextSerializer`, response serializers, session serializers |
| Phase 2 backend models | ✅ `ChatSession`, `ChatMessage` in `models.py` — local session persistence |
| Phase 2 backend context enrichment | ✅ `context.py` — `build_user_context()`, `build_facility_context()` auto-injected server-side |
| Page context (frontend → backend → TibaBot) | ✅ `AIPageContext` type, `usePageContextForAI` hook auto-syncs route/title/module to chat context |
| Encounter-aware context wiring | ✅ `encounters/[id]/layout.tsx` calls `setEncounterAwareContext()` with patient age/sex/allergies + vitals |
| System instruction for page awareness | ✅ Backend `ClinicalChatView` injects page-aware or no-visibility system instruction based on context |
| Verbosity levels aligned to TibaBot | ✅ 3 levels: `concise`, `standard`, `educational` — frontend type, UI buttons, backend serializers, views, and tests all updated (March 4, 2026) |

---

## Design Principles

1. **Advisory-only** — Match the CDS principle. AI suggestions never auto-apply; clinician confirms every action.
2. **Audit everything** — Every TibaBot call logged to `AuditLog` with user, timestamp, request summary, and response metadata.
3. **Feature-flagged from day one** — Every AI capability is gated behind `TIBABOT_ENABLED` (backend) / `NEXT_PUBLIC_ENABLE_AI` (frontend). When disabled: backend returns `404` on all `/api/ai/*` routes (via `AIFeatureGatedMixin`), frontend conditionally omits all AI components from the render tree (via `useAIEnabled()` hook). Facilities without connectivity or API keys get a completely clean experience with zero AI surface area.
4. **Graceful degradation** — If TibaBot is down but the flag is enabled, the system works normally. Show "AI suggestions unavailable" inline, never break the workflow.
5. **No patient PII to TibaBot** — Send only: age, sex, vitals, medication names, allergy substances, clinical text. Never send: name, MRN, national_id, phone_number.
6. **Backend proxy pattern** — All TibaBot calls routed through Django backend to keep API keys server-side, log interactions, and rate-limit at the facility level.

---

## Architecture

### Backend Proxy Pattern

All TibaBot calls are routed through the Django backend. **The frontend never calls TibaBot directly.**

```
Frontend (Next.js)
    │
    ▼
Django backend: /api/ai/{endpoint}/    ← thin proxy
    │                                     logs to AuditLog
    ▼                                     adds facility context
TibaBot API: POST /{endpoint}             strips PII
```

**Rationale:**
- Keep the API key server-side (Kenya DPA 2019 compliance)
- Log all AI interactions in `AuditLog` (7-year retention)
- Rate-limit at the facility level, not per browser tab
- Enable graceful degradation when TibaBot is unavailable
- Sanitize requests to ensure no PII leaks

### New Django App: `hmis/apps/ai/`

```
hmis/apps/ai/
├── __init__.py
├── apps.py
├── client.py             # TibaBotClient class (retry/timeout/circuit-breaker)
├── feature_flags.py      # Feature flag checks (TIBABOT_ENABLED gate)
├── views.py              # Proxy viewsets (validate input → call TibaBot → log → return)
├── serializers.py        # Request/response validation
├── urls.py               # /api/ai/ namespace
└── sanitizer.py          # PII stripping utility
```

> **Feature Flag Gate**: All AI views inherit from `AIFeatureGatedMixin` (defined in `feature_flags.py`). This mixin checks `settings.TIBABOT_ENABLED` and returns `404` immediately when disabled — no endpoint discovery or partial behavior. On the frontend, the `useAIEnabled()` hook reads `NEXT_PUBLIC_ENABLE_AI` and **conditionally skips** mounting all AI components (widget, ICD-10 suggestions, predictor panels). Components are not rendered at all when the flag is off, not just hidden with CSS.

### Frontend: `web-app/lib/api/ai.ts`

API client with Zod-validated responses calling Django proxy endpoints:

```typescript
aiApi.suggestICD10(clinicalText)         // ICD-10 auto-coding
aiApi.clinicalAssist(context)            // Clinical recommendations
aiApi.clinicalChat(message, sessionId)   // Multi-turn clinical chat
aiApi.predictCondition(features)         // Condition prediction
aiApi.predictICU(vitals, labs)           // ICU prediction
aiApi.triage(symptoms, age, sex)         // Symptom triage
```

### Environment Variables

```bash
# Backend .env
TIBABOT_API_URL=https://tibabot.hmis.nexora.africa
TIBABOT_API_KEY=<key>
TIBABOT_TIMEOUT=30
TIBABOT_ENABLED=true   # Feature flag for graceful disable

# Frontend .env
NEXT_PUBLIC_ENABLE_AI=true   # Feature flag for UI visibility
```

---

## Priority Integration Points

### 1. ICD-10 Auto-Coding in Diagnosis Form

**Status**: ✅ **Complete** (March 2, 2026)  
**Priority**: Highest value, lowest risk  
**Where**: `components/encounters/diagnosis-form.tsx`, Step 5 of encounter edit  
**TibaBot endpoints**: `POST /icd10/code`, `GET /icd10/suggest`

**What**: When a clinician types a chief complaint or clinical notes, call TibaBot to suggest ICD-10 codes with confidence scores. Wire `GET /icd10/suggest` as a typeahead enhancer alongside the existing `useICD10Search` hook.

**Why first**: No clinical risk (advisory only), replaces tedious manual code searching, and the existing diagnosis form already has the dual ICD-10/ICD-11 toggle pattern to extend.

**Flow:**

```
Clinician types "patient presenting with malaria symptoms and fever"
        │
        ▼
Frontend calls Django: POST /api/ai/icd10-suggest/
        │
        ▼
Django calls TibaBot: POST /icd10/code { clinical_text: "..." }
        │
        ▼
Returns ranked codes: B50.9 (confidence 0.92), R50.9 (0.78), ...
        │
        ▼
Display as "AI Suggested" chips above manual search
Clinician confirms/rejects each suggestion
```

**Files to create/modify:**
- Backend: `hmis/apps/ai/views.py` — `ICD10SuggestView` ✅
- Backend: `hmis/apps/ai/client.py` — `TibaBotClient` ✅
- Backend: `hmis/apps/ai/sanitizer.py` — PII stripping ✅
- Backend: `hmis/apps/ai/feature_flags.py` — `AIFeatureGatedMixin` ✅
- Backend: `hmis/apps/ai/serializers.py` — request/response validation ✅
- Backend: `hmis/apps/ai/urls.py` — `/api/ai/` namespace ✅
- Backend: `tests/test_ai.py` — 25 tests (feature gating, auth, validation, PII, audit) ✅
- Frontend: `lib/types/ai.ts` — `AIICD10Suggestion`, `AIICD10SuggestResponse`, `AIStatus` ✅
- Frontend: `lib/schemas/ai.schema.ts` — Zod validation schemas ✅
- Frontend: `lib/api/ai.ts` — `aiApi.suggestICD10()`, `aiApi.getStatus()` ✅
- Frontend: `lib/hooks/use-ai.ts` — `useAIICD10Suggest()`, `useAIEnabled()`, `useAIStatus()` ✅
- Frontend: `components/encounters/diagnosis-form.tsx` — "AI Suggested" section ✅
- Frontend: `lib/utils/constants.ts` — `ENABLE_AI` feature flag ✅

---

### 2. TibaBot Floating Widget + Clinical Assistant

**Status**: ✅ **Complete** (March 3, 2026)
**Priority**: High value, high visibility — the "face" of TibaBot in the app  
**Where**: Global floating widget (all dashboard pages) + optional `/ai` full-page view  
**TibaBot endpoints**: `POST /clinical/chat`, `POST /clinical/assist`, session management

**What**: A persistent floating widget that provides multi-turn clinical chat and encounter-aware Clinical Assist — all without leaving the current page. This replaces the original plan of a standalone Clinical Assistant sidebar + a separate Phase 6 chat widget. **One unified AI surface, not two.**

**Why a widget over a dedicated page or standalone sidebar:**

| Factor | Widget (floating) | Dedicated Page / Sidebar |
|--------|-------------------|---------------------------|
| Context preservation | Clinician stays on the encounter | Navigates away or needs encounter-specific component |
| Multi-tasking | Ask a question while reviewing vitals/labs | Must switch tabs or lose workflow position |
| Adoption | Low friction — always visible, one click | High friction — navigate or find the right button |
| Clinical workflow | Matches how clinicians consult — quick questions mid-encounter | Forces tool-switching mental model |
| EHR precedent | Epic CDS Sidebar, Cerner MPage panels | Rarely used |
| Reuse | Single component serves chat + clinical assist + ICD-10 shortcuts | Separate components for each capability |

**Widget states:**

```
┌──────────────────────────────────────────────────┬──────────────┐
│                                                  │  🤖 TibaBot  │
│  Encounter Detail Page                           │              │
│                                                  │  You: What   │
│  Patient: Jane D. | MRN-20260302-0001            │  are the DDx │
│                                                  │  for this    │
│  Vitals: SpO2 92% | Pulse 110 | Temp 38.5°C     │  patient?    │
│  ┌─────────────────────────────────────┐         │              │
│  │ 🛡 CDS: SpO2 below 95% (CRITICAL) │         │  TibaBot:    │
│  └─────────────────────────────────────┘         │  Given the   │
│                                                  │  vitals and  │
│  SOAP | Diagnoses | Treatment | Lab | ...        │  history...  │
│                                                  │              │
│                                                  │  [Send ▶]    │
└──────────────────────────────────────────────────┴──────────────┘
                                              [🤖] ← minimized state
```

| State | Appearance | Behavior |
|-------|------------|----------|
| **Minimized** | Small floating button (bottom-right), `56×56px` with unread badge | Single click expands |
| **Expanded** | ~400px wide sidebar panel, right-aligned, resizable | Chat input, history, session tabs |
| **Full-page** | `/ai` route with full-width chat + session management | Link from widget header "Open full view" |

**Widget capabilities:**

| Capability | TibaBot Endpoint | Trigger |
|------------|-------------------|---------|
| **Clinical Chat** | `POST /clinical/chat` | Default — free-form multi-turn with SSE streaming |
| **Clinical Assist** | `POST /clinical/assist` | Auto-populates patient context when on an encounter page; clinician clicks "Ask about this patient" |
| **Quick ICD-10 lookup** | `POST /icd10/code` | Slash command: `/code fever with chills after travel` → suggested codes |
| **Session management** | `GET/DELETE /clinical/chat/session/{id}` | List, switch, delete past sessions |

**Clinical Assist — encounter-aware mode:**

When the clinician is on an encounter page (`/encounters/[id]` or `/encounters/[id]/edit/*`), the widget detects this via `AIChatContext` and offers a "Ask about this patient" button that auto-populates the request with (no PII):

```json
{
  "query": "Differential diagnosis for this presentation",
  "patient_context": {
    "patient_age": 45,
    "patient_sex": "M",
    "facility_level": 4,
    "allergies": ["penicillin"],
    "comorbidities": ["COPD", "Hypertension"],
    "current_medications": ["Lisinopril 10mg", "Salbutamol inhaler"]
  },
  "encounter_context": {
    "chief_complaint": "Shortness of breath and productive cough x 3 days",
    "vitals": { "spo2": 92, "pulse": 110, "temperature": 38.5, "rr": 28 }
  },
  "verbosity": "standard"
}
```

**How it complements CDS**: The existing CDS engine fires binary threshold alerts ("SpO2 < 95%"). The widget's Clinical Assist mode provides *contextual reasoning* ("Given this patient's COPD history, SpO2 of 92% with tachypnea suggests acute exacerbation — consider nebulized salbutamol per MOH Protocol 4.2"). They serve different cognitive needs — CDS alerts *what*, TibaBot explains *why* and *what to do*.

**What the widget does NOT replace:**
- Inline CDS alerts panel (Tiers 1–3 remain encounter-embedded)
- ICD-10 suggestions in the diagnosis form (Phase 1 — those stay inline in the form)
- Condition/ICU predictor results (Phases 4–5 — those stay in their respective pages)

**Access control**: Restricted to authenticated clinicians only. Hidden for non-clinical roles. Gated by `NEXT_PUBLIC_ENABLE_AI` feature flag (component not rendered when off), `TIBABOT_ENABLED` backend flag (returns 404 when off), and `ai.use_clinical_chat` permission.

**Why Phase 2 (not later):**
1. **Eliminates duplicate UI** — no separate `ai-clinical-assistant.tsx` sidebar; the widget handles Clinical Assist as a mode
2. **Foundational infrastructure** — widget's context provider, SSE streaming, and chat panel become reusable for Phases 3–4 (e.g., slash commands: `/predict-risk`)
3. **Highest visibility feature** — the widget is the "face" of TibaBot; deploying early maximizes adoption and feedback
4. **Low risk** — advisory only, no clinical automation, permission-gated

**Files created/modified:**
- Backend: `hmis/apps/ai/views.py` — `ClinicalChatView`, `ClinicalAssistView`, `ClinicalChatSessionListView`, `ClinicalChatSessionDetailView` ✅
- Backend: `hmis/apps/ai/serializers.py` — `ClinicalChatRequestSerializer`, `ClinicalAssistRequestSerializer`, `AIPageContextSerializer`, response serializers ✅
- Backend: `hmis/apps/ai/models.py` — `ChatSession`, `ChatMessage` ✅
- Backend: `hmis/apps/ai/context.py` — `build_user_context()`, `build_facility_context()` ✅
- Backend: `hmis/apps/ai/urls.py` — register `/clinical/chat/`, `/clinical/assist/`, `/clinical/chat/sessions/`, `/clinical/chat/session/<id>/` ✅
- Frontend: `lib/api/ai.ts` — `aiApi.clinicalAssist()`, `aiApi.clinicalChat()`, `aiApi.getChatSession()`, `aiApi.deleteChatSession()` ✅
- Frontend: `lib/types/ai.ts` — `AIClinicalChatRequest`, `AIClinicalChatResponse`, `AIClinicalAssistRequest`, `AIClinicalAssistResponse`, `AIChatSession`, `AIChatMessage`, `AIPageContext` ✅
- Frontend: `lib/schemas/ai.schema.ts` — `AIClinicalChatResponseSchema`, `AIClinicalAssistResponseSchema`, `AIChatSessionSchema`, `AIChatMessageSchema` ✅
- Frontend: `lib/hooks/use-ai.ts` — `useAIClinicalAssist()`, `useAIClinicalChat()`, `useAIChatSessions()`, `useAIChatSession()`, `useDeleteAIChatSession()` ✅
- Frontend: `lib/hooks/use-page-context-for-ai.ts` — `usePageContextForAI()` auto-syncs current route/title/module into AI chat context ✅
- Frontend: `components/shared/ai-chat-widget.tsx` — floating widget (minimized + expanded states), sends `page_context` ✅
- Frontend: `components/shared/ai-chat-panel.tsx` — chat UI (shared between widget and full-page) ✅
- Frontend: `components/shared/tibabot-status-indicator.tsx` — 3-state status icon (available/unread/unavailable) ✅
- Frontend: `lib/context/ai-chat-context.tsx` — global state: widget open/closed, active session, encounter context, page context ✅
- Frontend: `app/(dashboard)/ai/page.tsx` — full-page chat view with session management ✅
- Frontend: `app/(dashboard)/layout.tsx` — mount `<AIChatProvider>` + `<AIChatWidget />` + `<AIPageContextSync />` globally ✅
- Frontend: `app/(dashboard)/encounters/[id]/layout.tsx` — wires `setEncounterAwareContext()` with patient/encounter data ✅
- Frontend: `lib/config/navigation.ts` — "AI Assistant" nav entry (links to `/ai` full-page view) ✅
- Frontend: `components/shared/index.ts` — export new shared components ✅
- Frontend: `lib/context/index.ts` — export `AIChatProvider`, `useAIChatContext`, `useOptionalAIChatContext` ✅

**Schema alignment audit** (March 3, 2026):
- Phase 1 (`icd10-suggest`, `status`): ✅ Frontend types, Zod schemas, and API URLs are **perfectly aligned** with backend serializers and URL routes
- Phase 2 (`clinical/chat`, `clinical/assist`, `clinical/chat/sessions`, `clinical/chat/session/{id}`): ✅ Frontend types and Zod schemas are **aligned** with backend serializers and URL routes
- `AIChatMessage.isStreaming` is a frontend-only field (client-side UI state), correctly marked as `z.boolean().optional()` in the Zod schema so it won't break when the backend omits it
- `AIPageContext` (`route`, `page_title`, `module`) is sent from frontend → backend and included in the system instruction to TibaBot

---

### 3. Condition Predictor in Triage

**Status**: ✅ **Complete** (March 4, 2026)
**Priority**: High value, medium risk  
**Where**: Triage assessment form  
**TibaBot endpoint**: `POST /predict/condition`

**What**: During triage, submit patient features (age, gender, vitals, chief complaint, clinical assessment) to flag high-risk patients early. Display primary condition with confidence score, risk factors, differential conditions, and recommendations.

**Files created/modified:**
- Backend: `hmis/apps/ai/views.py` — `ConditionPredictView` (auth, PII sanitization, context enrichment, audit logging, graceful degradation) ✅
- Backend: `hmis/apps/ai/client.py` — `TibaBotClient.predict_condition()` ✅
- Backend: `hmis/apps/ai/serializers.py` — `ConditionPredictRequestSerializer`, `ConditionPredictPatientFeaturesSerializer`, `ConditionPredictResponseSerializer`, `ConditionRiskFactorSerializer`, `DifferentialConditionSerializer` ✅
- Backend: `hmis/apps/ai/urls.py` — `predict/condition/` route ✅
- Backend: `tests/test_ai_condition_predict.py` — feature gating, auth, validation, response, graceful degradation, audit logging, PII sanitization tests ✅
- Frontend: `lib/types/ai.ts` — `AIConditionPredictFeatures`, `AIConditionPredictRequest`, `AIConditionPredictResponse`, `AIConditionRiskFactor`, `AIDifferentialCondition` ✅
- Frontend: `lib/schemas/ai.schema.ts` — `AIConditionPredictResponseSchema`, `AIConditionRiskFactorSchema`, `AIDifferentialConditionSchema` ✅
- Frontend: `lib/api/ai.ts` — `aiApi.predictCondition()` with Zod-validated response ✅
- Frontend: `lib/hooks/use-ai.ts` — `useAIConditionPredict()` React Query mutation hook ✅
- Frontend: `components/triage/ai-risk-assessment-panel.tsx` — 444-line "AI Risk Assessment" panel with risk level banner, risk factors, differentials, recommendations, expandable details, re-run, retry on error ✅
- Frontend: `components/triage/triage-assessment-form.tsx` — `<AIRiskAssessmentPanel>` wired with patient vitals/demographics ✅
- Frontend: `components/triage/index.ts` — exports `AIRiskAssessmentPanel` + props type ✅

---

### 4. ICU Predictor in Inpatient + CDS `ml_model` Rule Type

**Status**: ✅ **Complete** (March 5, 2026)
**Priority**: High clinical value, medium-high risk  
**Where**: Inpatient admission detail view (overview tab). Also accessible via widget slash command: `/icu-risk`  
**TibaBot endpoints**: `POST /predict/icu/predict`, `POST /predict/icu/risk-stratify`

**What**: For admitted patients, run sepsis/AKI early warning predictions. Display SOFA and qSOFA scores, critical alerts, and escalation recommendations.

**CDS synergy**: TibaBot predictions feed into the CDS engine as a new rule type `"type": "ml_model"` — the CDS doc's AI Evolution Roadmap (Layer 2) already designed for this exact pattern. Predictions generate `CDSAlert` records, maintaining the same audit trail and clinician-action workflow.

**New CDS condition type:**

```json
{
  "type": "ml_model",
  "model_name": "sepsis_risk_v2",
  "threshold": 0.75,
  "input_features": ["temperature", "pulse", "respiratory_rate", "spo2", "wbc"],
  "score_field": "sepsis_probability"
}
```

**Files created/modified:**
- Backend: `hmis/apps/ai/serializers.py` — `ICUPredictRequestSerializer`, `ICUPredictPatientDataSerializer`, `ICUPredictResponseSerializer`, `SOFAScoreBreakdownSerializer`, `ICUCriticalAlertSerializer`, `ICUEscalationSerializer` ✅
- Backend: `hmis/apps/ai/views.py` — `ICUPredictView` (auth, PII sanitization, context enrichment, audit logging, graceful degradation) ✅
- Backend: `hmis/apps/ai/client.py` — `TibaBotClient.predict_icu()`, `TibaBotClient.predict_icu_risk_stratify()` ✅
- Backend: `hmis/apps/ai/urls.py` — `predict/icu/` route ✅
- Backend: `hmis/apps/cds/engine.py` — new `_evaluate_ml_model()` evaluator type registered in `_EVALUATORS` dict ✅
- Backend: `hmis/apps/inpatient/serializers.py` — `AdmissionSerializer` now includes `patient_age` and `patient_gender` computed fields ✅
- Backend: `tests/test_ai_icu_predict.py` — 25 tests covering feature gating, auth, validation, response structure, SOFA/qSOFA, risk-stratify, graceful degradation, audit logging, PII sanitization ✅
- Backend: `tests/test_cds_ml_model.py` — 11 tests covering ml_model evaluator: threshold triggers, missing predictions, custom score_field, metadata details, message rendering ✅
- Frontend: `lib/types/ai.ts` — `AIICUPredictPatientData`, `AIICUPredictRequest`, `AIICUPredictResponse`, `AISOFAScoreBreakdown`, `AIICUCriticalAlert`, `AIICUEscalation`, `AIICUPredictionType` ✅
- Frontend: `lib/schemas/ai.schema.ts` — `AIICUPredictResponseSchema`, `AISOFAScoreBreakdownSchema`, `AIICUCriticalAlertSchema`, `AIICUEscalationSchema` ✅
- Frontend: `lib/api/ai.ts` — `aiApi.predictICU()` with Zod-validated response ✅
- Frontend: `lib/hooks/use-ai.ts` — `useAIICUPredict()` React Query mutation hook ✅
- Frontend: `components/inpatient/icu-risk-assessment-panel.tsx` — ICU Risk Assessment panel with risk level banner, SOFA breakdown chart, qSOFA criteria, critical alerts, escalation banner, risk probability bars, recommendations, re-run/retry, advisory disclaimer ✅
- Frontend: `components/inpatient/index.ts` — exports `ICURiskAssessmentPanel` + props type ✅
- Frontend: `app/(dashboard)/admissions/[id]/page.tsx` — wired `<ICURiskAssessmentPanel>` in overview tab for active admissions ✅

### 5. Symptom Checker (Patient Portal — Future)

**Priority**: Future scope  
**Where**: Patient-facing portal (not yet built)  
**TibaBot endpoints**: `POST /symptom-checker/conversation/*`

**What**: Guided multi-turn symptom assessment for patients before arrival at the facility. Low priority since the patient portal is not part of current roadmap.

---

## CDS + TibaBot Synergy Matrix

| CDS Rule Engine (existing) | TibaBot AI (new) | Integration Point |
|---|---|---|
| Binary vital threshold alerts | Contextual clinical reasoning about *why* vitals matter | Clinical Assistant panel shows AI context alongside CDS alerts |
| Manual ICD-10 search | AI auto-coding from clinical text | Suggested codes appear above manual search in diagnosis form |
| Rule-based drug-allergy checks | Multi-drug interaction reasoning with patient context | TibaBot enriches CDS override info with clinical rationale |
| Static risk thresholds | ML condition/ICU prediction | TibaBot predictions feed `CDSAlert` via `"type": "ml_model"` rules |
| Override/accept audit trail | Training data for alert suppression (Layer 2) | Override patterns train TibaBot to reduce alert fatigue |

### AI Evolution Roadmap Alignment

The CDS module documents a 4-layer AI evolution. TibaBot integration maps directly:

| CDS Layer | TibaBot Integration |
|-----------|---------------------|
| **Layer 1**: AI-assisted rule authoring | Not needed — TibaBot doesn't create CDS rules. But `POST /clinical/assist` can *suggest* thresholds for new rules. |
| **Layer 2**: ML-enhanced alerting | `POST /predict/condition` + `POST /predict/icu/predict` scores feed into CDS as `ml_model` rule type. `override_rate` data from existing alerts trains suppression. |
| **Layer 3**: Composite risk scoring | `POST /predict/icu/risk-stratify` provides sepsis/deterioration composite scores — directly plugs into `CDSAlert` pipeline. |
| **Layer 4**: Diagnostic/treatment suggestions | `POST /clinical/assist` with patient context → ranked differentials and Kenya Clinical Guidelines recommendations. Advisory sidebar, never auto-applied. |

---

## Implementation Timeline

| Phase | Scope | Effort | Risk | Depends On |
|-------|-------|--------|------|------------|
| **Phase 1** ✅ | Backend proxy app (`hmis/apps/ai/`) + ICD-10 auto-coding in diagnosis form | 2–3 days | Low | API key from Nexora |
| **Phase 2** ✅ | TibaBot floating widget + Clinical Assistant (chat, encounter-aware assist, page context, session management) | 3–4 days | Low | Phase 1 |
| **Phase 3** ✅ | Condition predictor in triage + AI feedback | 2 days | Medium | Phase 1 |
| **Phase 4** ✅ | ICU predictor in inpatient + CDS `ml_model` rule type (+ widget `/icu-risk` command) | 3–4 days | Medium | Phase 1, CDS engine update |
| **Phase 5** | Symptom Checker patient portal | 3–4 days | Low | Patient portal (future) |

**Total estimated effort**: ~13–16 days of implementation across all phases.

---

## File Inventory

### Backend (New)

| File | Description |
|------|-------------|
| `hmis/apps/ai/__init__.py` | App init |
| `hmis/apps/ai/apps.py` | Django app config |
| `hmis/apps/ai/client.py` | `TibaBotClient` class with retry, timeout, circuit-breaker |
| `hmis/apps/ai/views.py` | Proxy views: `ICD10SuggestView`, `AIStatusView`, `ClinicalChatView`, `ClinicalAssistView`, `ClinicalChatSessionListView`, `ClinicalChatSessionDetailView`, `ConditionPredictView`, `AIFeedbackView`, `AIFeedbackStatsView` |
| `hmis/apps/ai/serializers.py` | Request/response DRF serializers incl. `AIPageContextSerializer`, `ConditionPredictRequestSerializer`, `AIFeedbackRequestSerializer` |
| `hmis/apps/ai/models.py` | `ChatSession`, `ChatMessage` for local session persistence |
| `hmis/apps/ai/context.py` | `build_user_context()`, `build_facility_context()` server-side enrichment |
| `hmis/apps/ai/feature_flags.py` | `AIFeatureGatedMixin` — checks `settings.TIBABOT_ENABLED`, returns 404 when off |
| `hmis/apps/ai/urls.py` | `/api/ai/` route namespace |
| `hmis/apps/ai/sanitizer.py` | PII stripping utility (ensures no name/MRN/ID sent) |
| `tests/test_ai.py` | Unit tests for proxy views, sanitizer, and feature flag gating |
| `tests/test_ai_condition_predict.py` | Condition predictor tests: feature gating, auth, validation, response, degradation, audit, PII |

### Backend (Modified)

| File | Change |
|------|--------|
| `hmis/settings/base.py` | Add `TIBABOT_*` settings from env vars, add `hmis.apps.ai` to `INSTALLED_APPS` |
| `hmis/urls.py` | Include `ai.urls` at `/api/ai/` |
| `hmis/apps/cds/engine.py` | Add `ml_model` evaluator type (Phase 4) |
| `.env.example` | Add `TIBABOT_API_URL`, `TIBABOT_API_KEY`, `TIBABOT_TIMEOUT`, `TIBABOT_ENABLED` |

### Frontend (New)

| File | Description |
|------|-------------|
| `lib/types/ai.ts` | TypeScript interfaces for all TibaBot responses incl. `AIPageContext` |
| `lib/schemas/ai.schema.ts` | Zod validation schemas (Phase 1 + Phase 2 + Phase 3) |
| `lib/api/ai.ts` | API client with `parseResponse()` calling `/api/ai/*` (Phase 1 + Phase 2 + Phase 3) |
| `lib/hooks/use-ai.ts` | React Query hooks for all AI features + `useAIEnabled()` feature flag hook |
| `lib/hooks/use-page-context-for-ai.ts` | `usePageContextForAI()` — auto-resolves route → page title/module, syncs to AI chat context |
| `components/encounters/ai-icd10-suggestions.tsx` | ICD-10 auto-coding chips in diagnosis form |
| `components/triage/ai-risk-assessment-panel.tsx` | AI Risk Assessment panel for triage (condition predictor + risk factors + differentials) |
| `components/shared/ai-chat-widget.tsx` | Floating chat widget (minimized + expanded states) |
| `components/shared/ai-chat-panel.tsx` | Chat UI panel (shared between widget and full-page) |
| `components/shared/tibabot-status-indicator.tsx` | Reusable 3-state status icon: green `Bot` (available), green `BotMessageSquare` + dot (unread), red `BotOff` + dot (unavailable) |
| `lib/context/ai-chat-context.tsx` | Global state: widget open/closed, active session, encounter context, page context |
| `app/(dashboard)/ai/page.tsx` | Full-page chat view with session management |

### Frontend (Modified)

| File | Change |
|------|--------|
| `components/encounters/diagnosis-form.tsx` | Add "AI Suggested" section above manual ICD search |
| `components/triage/triage-assessment-form.tsx` | Wire `<AIRiskAssessmentPanel>` with patient features during triage assessment |
| `app/(dashboard)/layout.tsx` | Mount `<AIChatProvider>` + `<AIChatWidget />` + `<AIPageContextSync />` when `useAIEnabled()` returns true |
| `app/(dashboard)/encounters/[id]/layout.tsx` | Wire `setEncounterAwareContext()` with patient/encounter data for encounter-aware AI assistance |
| `lib/config/navigation.ts` | Add "AI Assistant" nav entry (feature-gated by `ENABLE_AI`, links to `/ai`) |
| `components/shared/index.ts` | Export `TibaBotStatusIndicator`, `AIChatPanel`, `AIChatWidget` |
| `lib/context/index.ts` | Export `AIChatProvider`, `useAIChatContext`, `useOptionalAIChatContext` |
| `.env.example` | Add `NEXT_PUBLIC_ENABLE_AI` |

---

## Error Handling & Degradation

| Scenario | Backend Behavior | Frontend Behavior |
|----------|------------------|-------------------|
| TibaBot unreachable | Return `503` with `{ "error": "AI service unavailable" }` | Show "AI suggestions unavailable" muted text |
| Rate limited (429) | Return `429` with retry-after header | Show "Try again in X seconds" |
| Invalid API key | Return `502` with generic error | Hide AI features, log error |
| `TIBABOT_ENABLED=false` | `AIFeatureGatedMixin` returns `404` on all `/api/ai/*` routes | `useAIEnabled()` returns `false`; all AI components omitted from render tree |
| TibaBot returns low-confidence results | Pass through with confidence scores | Show results with amber "low confidence" badge |
| Network timeout (>30s) | Cancel request, return `504` | Show "Request timed out, try again" |

---

## Security & Compliance

### PII Sanitization Rules

Before sending any data to TibaBot, the `sanitizer.py` module strips:

| Field | Action |
|-------|--------|
| Patient name (first, last) | **Strip** — never sent |
| MRN | **Strip** — never sent |
| National ID | **Strip** — never sent |
| Phone number | **Strip** — never sent |
| Date of birth | **Convert to age** — send `patient_age: 45`, not DOB |
| Address/location | **Strip** — never sent |
| Emergency contacts | **Strip** — never sent |

**Allowed fields** (clinical context only):
- Age (derived), sex/gender
- Vital signs (temperature, pulse, BP, SpO2, RR, weight, height)
- Medication names (generic names only)
- Allergy substances
- Chief complaint / clinical notes text
- ICD-10/11 codes
- Lab test names and values (no patient identifiers)

### Audit Logging

Every TibaBot call creates an `AuditLog` entry:

```python
AuditLog.log(
    action='ai_icd10_suggest',    # or ai_clinical_assist, ai_predict, etc.
    user=request.user,
    resource_type='Encounter',     # or 'Patient', 'Triage', etc.
    resource_id=encounter.id,
    details={
        'tibabot_endpoint': '/icd10/code',
        'request_summary': 'clinical_text length: 156 chars',
        'response_summary': '3 codes suggested, top confidence: 0.92',
        'latency_ms': 1250,
    }
)
```

### Kenya DPA 2019 Compliance

- **Data minimization**: Only clinical context sent, no PII
- **Purpose limitation**: AI calls logged with purpose in audit trail
- **Consent**: Facility-level consent for AI features (not per-patient, since no PII is shared)
- **Accountability**: Full audit trail on every AI interaction
- **Right to explanation**: AI suggestions include confidence scores and source citations

---

## Testing Strategy

### Backend Tests (`tests/test_ai.py`)

| Test Area | Coverage |
|-----------|----------|
| `TibaBotClient` connection, retry, timeout | Unit tests with mocked HTTP |
| PII sanitizer (ensure no name/MRN/ID leaks) | Unit tests with sample patient data |
| Proxy views — valid requests | Integration tests with mocked TibaBot responses |
| Proxy views — error handling (429, 500, timeout) | Unit tests |
| Audit logging on every AI call | Integration tests checking AuditLog records |
| Feature flag (`TIBABOT_ENABLED=false`) | `AIFeatureGatedMixin` returns 404 on all `/api/ai/*` endpoints |
| Authentication required on all `/api/ai/*` | 401 without token |

### Frontend Tests

| Test Area | Coverage |
|-----------|----------|
| `aiApi` methods — request formatting | Unit tests with MSW |
| Zod schema validation — response parsing | Unit tests |
| `useAIICD10Suggest` hook — loading/error/success states | Hook tests |
| ICD-10 suggestions component — render, select, dismiss | Component tests |
| Feature flag — AI components not rendered when `NEXT_PUBLIC_ENABLE_AI=false` (`useAIEnabled()` hook) | Component tests |
| Graceful degradation — "unavailable" state rendering | Component tests |

---

*Last updated: March 4, 2026*

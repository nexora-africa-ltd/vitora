# Proactive AI Insights — Feasibility Assessment

> **Date**: March 7, 2026  
> **Status**: Advisory / Pre-implementation Analysis  
> **Component**: TibaBot AI Assistant (web-app)

---

## Summary

**Automatically generating insights before the user requests them is feasible.** The current architecture already has most of the building blocks. However, there are important design trade-offs around alert fatigue, cost, and clinical liability that should guide the implementation approach.

---

## What Already Exists

The current architecture is well-positioned for proactive insights:

1. **Context awareness** — `AIChatProvider` already tracks `patientContext`, `encounterContext`, and `pageContext` in real-time. The encounter layout wires live data automatically.
2. **Context sufficiency scoring** — `assessContextSufficiency()` already evaluates whether enough data exists to produce a useful response. This is the exact "enough context?" gate needed.
3. **Precedent** — ICD-10 auto-coding already provides proactive suggestions as the clinician types a chief complaint. The `SmartSuggestion` component renders inline AI/CDS alerts with confidence scores and accept/dismiss actions.

---

## Proposed Data Flow

```
Context Change (vitals entered, diagnosis added, labs returned)
  → Debounced trigger (e.g., 2-5s after last input)
  → Context sufficiency check (already exists)
  → If sufficient: call backend → generate insight
  → Render as a dismissible card/notification in the widget
    (NOT as a chat message)
```

---

## Key Technical Decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| **Trigger mechanism** | Debounced `useEffect` on context changes | Prevents spamming on every keystroke |
| **Where insights appear** | Separate "Insights" section above the chat input, or inline cards on the page | Mixing with chat history creates confusion — the user didn't ask for it |
| **Backend endpoint** | New `POST /api/ai/clinical/insights/` | Distinct from `chat/` and `assist/` — different prompt engineering, lighter responses |
| **Caching/dedup** | Hash the context and skip if unchanged | Avoid re-generating the same insight when context hasn't meaningfully changed |
| **Rate limiting** | Max 1 proactive call per 30–60s per session | Cost control + avoid overwhelming clinicians |

---

## Risks & Concerns

### 1. Alert Fatigue (Highest Risk)

Clinicians already face notification overload. Unsolicited AI suggestions that aren't consistently high-quality will be ignored or the feature will be disabled entirely. The ICD-10 auto-coding works because it's tightly scoped and directly actionable. General "insights" are harder to make consistently useful.

### 2. Cost / Latency

Each proactive insight = an LLM API call. If 50 clinicians are entering data simultaneously, hundreds of background requests per minute could be generated. Mitigations:

- Only trigger on *meaningful* context thresholds (e.g., vitals + chief complaint + at least one diagnosis present).
- Use a lighter/cheaper model for proactive insights vs. the full chat model.
- Client-side rule-based pre-filtering before calling the LLM at all.

### 3. Clinical Liability

Unsolicited medical suggestions carry higher liability than responses to explicit questions. An unprompted "Consider ruling out pulmonary embolism" that goes unread could become a legal issue. Mitigations:

- Always include confidence scores.
- Never phrase as directives.
- Include prominent disclaimers.

### 4. Privacy / Audit Complexity

Every proactive call sends patient context to the AI service. Requirements:

- Audit-log these as `ai_proactive_insight` events separately from user-initiated queries.
- Ensure the PII sanitizer handles the increased volume.

---

## Recommended Approach: Tiered Proactive Insights

Rather than general free-form insights, scope to **high-value, rule-triggered categories**:

| Tier | Trigger | Example Insight | LLM Needed? |
|------|---------|----------------|-------------|
| **1. Rule-based alerts** | SpO2 < 95%, BP > 180/120 | "Critical: Hypoxemia detected — consider supplemental O₂" | No (deterministic CDS) |
| **2. Pattern-based nudges** | Vitals + complaint entered | "Drug interaction alert: Metformin + contrast dye" | No (rules engine) |
| **3. LLM-powered insights** | Full encounter context available | "Based on presentation, consider TB workup given Kenya prevalence" | Yes |

Start with Tier 1 and 2 (which partially exist via `has_critical_vitals()` and CDS rules) before investing in Tier 3. This delivers the "proactive intelligence" UX without the cost/liability of unconstrained LLM calls.

---

## Feasibility Summary

| Aspect | Verdict |
|--------|---------|
| **Technically feasible?** | Yes — architecture supports it today |
| **Architecturally sound?** | Yes, with a dedicated endpoint + debounced triggers |
| **Clinically advisable?** | Proceed cautiously — start with rule-based alerts, graduate to LLM |
| **Cost-effective?** | Only with aggressive gating (sufficiency check + rate limit + dedup) |
| **Recommended priority** | Medium — solidify the existing explicit-query experience first, then layer in proactive insights as a Phase 2+ enhancement |

---

## Existing Building Blocks

| Component | File | Role |
|-----------|------|------|
| `AIChatProvider` | `web-app/lib/context/ai-chat-context.tsx` | Global state: patient, encounter, page context |
| `assessContextSufficiency()` | `web-app/lib/utils/ai-context-sufficiency.ts` | Gates whether enough data exists for a useful response |
| `SmartSuggestion` | `web-app/components/shared/smart-suggestion.tsx` | Inline AI/CDS alert cards with confidence + accept/dismiss |
| `AIContextEnrichmentForm` | `web-app/components/shared/ai-context-enrichment.tsx` | Prompts clinician for missing context |
| ICD-10 auto-coding | `POST /api/ai/icd10-suggest/` | Existing proactive suggestion pattern |
| Backend AI proxy | `backend/hmis/apps/ai/views.py` | PII sanitization, audit logging, feature gating |

---

## New Work Required

1. **Trigger / debounce logic** — `useEffect` watcher on context changes with dedup hashing.
2. **Dedicated backend endpoint** — `POST /api/ai/clinical/insights/` with lighter prompts and a distinct audit action.
3. **Insight cards UI** — Dismissible cards distinct from chat messages, rendered in the widget or inline on the page.
4. **Rate limiter** — Client-side throttle + server-side per-session rate limiting.
5. **User preference** — Toggle to enable/disable proactive insights per user.

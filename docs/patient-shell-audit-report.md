# 🔍 Vitora HMIS Scaffold Audit Report

**Date:** January 15, 2026  
**Auditor:** AI Architect Review  
**Branch:** `feature/patient-shell-pattern`  
**Status:** Ready for Implementation

---

## 1. Executive Summary

| Finding | Status |
|---------|--------|
| No single authoritative Patient Context Provider | ❌ CRITICAL |
| No persistent Encounter Context | ❌ CRITICAL |
| Patient identity editing is unrestricted | ⚠️ MEDIUM |
| Encounter is required for clinical orders | ✅ GOOD |
| Patient Journey Store exists but is underutilized | ⚠️ MEDIUM |
| Module boundaries are reasonable but not enforced | ⚠️ MEDIUM |
| No Patient Shell pattern | ❌ CRITICAL |

**Key Insight:** Patient data is fetched independently by each route/component using hooks (`usePatient(id)`), not shared via a context provider. This creates clinical safety risks.

---

## 2. Findings by Area

### 🧑‍⚕️ Patient Context

| Checklist Item | Status | Evidence |
|----------------|--------|----------|
| Single authoritative patient context provider exists | ❌ NO | No `PatientContext` or `PatientProvider` found |
| Patient identity fetched once per session | ❌ NO | Each route calls `usePatient(patientId)` independently |
| Patient context passed via provider, not props drilling | ❌ NO | Props drilling observed throughout |
| Modules do not independently fetch patient data | ❌ NO | Each module fetches independently |
| UI prevents multiple active patients simultaneously | ⚠️ PARTIAL | No explicit prevention |

**Files Affected:**
- `app/(dashboard)/patients/[id]/page.tsx` - Line 43
- `app/(dashboard)/encounters/[id]/page.tsx` - Line 42
- `components/laboratory/lab-order-form.tsx`
- `components/billing/InvoiceForm.tsx`

---

### 🏥 Encounter Modeling

| Checklist Item | Status | Evidence |
|----------------|--------|----------|
| Explicit `Encounter` entity exists | ✅ YES | `lib/types/encounter.ts` |
| One active encounter enforced at a time | ❌ NO | No enforcement |
| Orders require an encounter ID | ✅ YES | `lab-order-form.tsx` Line 34 |
| Medications require an encounter ID | ✅ YES | `useEncounterPrescriptions(encounterId)` |
| Billing actions blocked without encounter | ⚠️ PARTIAL | Invoices can be created without encounter |
| Encounter switcher exists and is deliberate | ❌ NO | Navigation is URL-based |

---

### 🔐 Identity Safety

| Checklist Item | Status | Evidence |
|----------------|--------|----------|
| Patient demographics read-only by default | ❌ NO | Edit button visible to all |
| Identity editing restricted to a single screen | ✅ YES | Only `/patients/[id]/edit` |
| Clinical users cannot edit administrative identity | ❌ NO | No role check in frontend |
| Audit trail exists for identity edits | ✅ YES | Backend `AuditLog` |
| No inline demographic editing in clinical views | ✅ YES | Read-only in clinical screens |

---

### 🧭 Routing & Layout

| Checklist Item | Status | Evidence |
|----------------|--------|----------|
| Patient workflows wrapped in a persistent layout | ❌ NO | Generic sidebar/header only |
| Layout persists across clinical/billing routes | ⚠️ PARTIAL | Dashboard layout persists |
| Routing is not used as patient context | ❌ VIOLATED | 20+ instances of `params.id` extraction |
| Patient ID not parsed repeatedly from URL | ❌ VIOLATED | Every [id] route parses |
| No mega "Records" or "Chart" route | ✅ YES | Separate routes |

---

### 🧩 Module Boundaries

| Checklist Item | Status | Evidence |
|----------------|--------|----------|
| Clinical, billing, pharmacy, admin are isolated | ✅ YES | Separate route groups |
| Modules consume context, not fetch identity | ❌ NO | Each module fetches independently |
| No cross-module state mutation | ✅ YES | No billing→clinical mutation |
| Clear ownership per module | ✅ YES | Separate hooks per module |
| Lazy-loading used for patient modules | ⚠️ PARTIAL | Next.js route-level splitting |

---

## 3. Risk Matrix

| Risk Category | Severity | Description |
|---------------|----------|-------------|
| **Clinical Safety** | 🔴 HIGH | No patient context provider; possible multi-patient confusion |
| **Billing / Claims** | 🔴 HIGH | Invoices can be created without encounter; SHA rejection risk |
| **Regulatory / Audit** | 🟡 MEDIUM | Identity editing not role-gated in frontend |
| **Engineering Scalability** | 🔴 HIGH | URL-based ID parsing on every route; high refactor cost |

---

## 4. Risk Flags (Auto-Fail Checklist)

| Flag | Status |
|------|--------|
| Clinicians can treat without encounter context | ⚠️ PARTIAL |
| Billing edits clinical data | ✅ SAFE |
| Multiple patients active in UI | ⚠️ NOT PREVENTED |
| SHA intervention selected manually by clinician | ⚠️ REVIEW NEEDED |
| Identity editable in clinical screens | ✅ SAFE |

---

## 5. Patient Shell Fit Assessment

### Verdict: ⚠️ Patient Shell Requires Refactor

**Justification:**
1. The scaffold has good module separation but no shared patient/encounter context
2. `patient-journey.ts` store (2077 lines) provides a foundation but isn't wired as authoritative source
3. Routing structure is compatible — `(dashboard)` layout can be extended
4. No architectural blockers — hooks can be refactored to consume context
5. Effort is moderate: primarily wiring context providers, not rewriting business logic

---

## 6. Implementation Plan

### Files to CREATE:

| File | Purpose |
|------|---------|
| `lib/context/patient-context.tsx` | PatientProvider wrapping patient identity + encounter |
| `lib/context/encounter-context.tsx` | EncounterProvider for active encounter state |
| `app/(dashboard)/patients/[id]/layout.tsx` | Patient Shell layout with identity header |
| `app/(dashboard)/encounters/[id]/layout.tsx` | Encounter Shell inheriting patient context |
| `components/layout/patient-shell-header.tsx` | Read-only identity banner |

### Files to MODIFY:

| File | Change |
|------|--------|
| `lib/stores/patient-journey.ts` | Wire as authoritative store consumed by contexts |
| `app/providers.tsx` | Add PatientProvider (lazy/conditional) |

### Files to LEAVE UNTOUCHED:

| File | Reason |
|------|--------|
| `app/(dashboard)/layout.tsx` | Generic dashboard layout remains |
| `lib/hooks/use-patients-enhanced.ts` | Keep as data-fetching |
| `lib/hooks/use-encounters.ts` | Keep as data-fetching |
| `components/billing/*` | Consume context later |
| `components/pharmacy/*` | Consume context later |
| `components/laboratory/*` | Consume context later |

---

## 7. Safe Refactor Order

```
Step 1: Create PatientContext and PatientProvider (no breaking changes)
Step 2: Create PatientShellHeader component
Step 3: Create patients/[id]/layout.tsx wrapping patient routes
Step 4: Migrate patients/[id]/page.tsx to consume context
Step 5: Create EncounterContext and encounters/[id]/layout.tsx
Step 6: Progressively migrate encounter pages to consume context
Step 7: Wire patient-journey.ts store as authoritative backend sync
```

---

## 8. Estimated Effort

| Task | Engineer-Days |
|------|---------------|
| Patient/Encounter Context Providers | 1 day |
| Patient Shell Header Component | 0.5 days |
| Route Layout Wrappers | 1 day |
| Migrate Core Patient/Encounter Pages | 1.5 days |
| Testing & QA | 1 day |
| **Total** | **5 engineer-days** |

---

## 9. Final Verdict

### ✅ Recommendation: Refactor Now

The scaffold is at an ideal inflection point:
- Module boundaries are clean
- Clinical order enforcement exists
- The major gap is **context plumbing**, not architectural redesign

The existing `patient-journey.ts` Zustand store provides a sophisticated foundation that's currently underutilized. Delaying this refactor increases technical debt as more features are built on the fragile URL-param pattern.

Given Kenya DPA compliance requirements, SHA integration requirements, and future ClinicalBERT integration, establishing patient identity safety now is a **regulatory and clinical imperative**.

---

## 10. Acceptance Criteria

- [ ] `PatientContext` provides single source of truth for active patient
- [ ] `EncounterContext` provides single source of truth for active encounter
- [ ] Patient Shell Header displays read-only identity on all patient routes
- [ ] Patient ID is NOT parsed from URL in components (consumed from context)
- [ ] Encounter ID is NOT parsed from URL in components (consumed from context)
- [ ] No clinical actions possible without explicit patient/encounter context
- [ ] Unit tests for context providers
- [ ] E2E test: Cannot confuse patients when switching tabs

---

> **Guiding Rule:** *If patient context is not explicit and persistent, everything downstream becomes unsafe.*

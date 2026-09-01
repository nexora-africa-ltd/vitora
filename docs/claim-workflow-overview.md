# Vitora HMIS — SHA Claim Workflow Overview

This document describes the end-to-end SHA (Social Health Authority) claim workflow implemented in Vitora HMIS, covering the data model, the three DHA HIE routing flows, the automation triggers, the ILM submission lifecycle, and the frontend orchestration.

---

## 1. Context

Vitora integrates with the **Kenya DHA HIE** (Digital Health Authority Health Information Exchange) to submit insurance claims to SHA. The system supports two parallel integration paths:

| Path | Service | Status |
|------|---------|--------|
| **Legacy FHIR** (`/v1/shr-med/bundle`) | `SHAClaimsService` | Being phased out |
| **ILM Middleware** (`/api/v1/claims/*`) | `IlmClaimService` | Active / target architecture |

The ILM path is the focus of this overview. It implements the 15 `/api/v1/claims/*` operations defined in the DHA HIE UAT Postman collection.

---

## 2. Core Data Model

All models live in `backend/hmis/apps/billing/models.py` and are facility-scoped (`FacilityScopedModel`).

### 2.1 `SHAClaim` — the central record

The claim tracks the full lifecycle:

```
Draft → Validated → Pending Submission → Submitted → Acknowledged
  → Under Review → Query → Approved / Partially Approved / Rejected
  → Appealed → Paid / Written Off / Cancelled
```

Key fields:

- **Identification**: `claim_number` (internal, `CLM-YYYYMMDD-XXXX`), `sha_claim_reference` (SHA-assigned)
- **Linkage**: `patient`, `sha_member`, `encounter`, `invoice`
- **Routing**: `claim_flow` (phc / shif / eccif), `is_emergency_claim`
- **Diagnosis**: `primary_diagnosis_code` (ICD-10/11), `secondary_diagnosis_codes`
- **Amounts**: `claimed_amount`, `approved_amount`, `paid_amount`, `patient_copay`
- **DHA HIE tracking**: `dha_external_id`, `dha_correlation_id`, `last_dha_status`, `dha_visit_started_at`, `previewed_at`
- **Preauth**: `preauth_number`, `preauth_date`, `preauth_valid_until`
- **Versioning**: `version`, `parent_claim` (for appeals/resubmissions)

### 2.2 Supporting models

| Model | Purpose |
|-------|---------|
| `SHAMember` | Patient's SHA membership (national ID, scheme, eligibility status) |
| `SHATariff` | SHA tariff catalog (intervention codes, per-KEPH-level pricing, preauth flags) |
| `SHAClaimIntervention` | Per-intervention metadata on a claim (document types, routing flags, per-diem tariffs) |
| `SHAClaimItem` | Individual billable line items on a claim (tariff, qty, unit price, coverage) |
| `SHAClaimAttachment` | Required documents (clinical notes, invoices, lab reports) |
| `SHACoverageSnapshot` | Cached eligibility/coverage data at claim time |
| `SHAPreauth` | Pre-authorization requests (draft → submitted → approved/denied/expired) |
| `SHAEmergencyClaim` | ECCIF emergency claim tracking (open → admitted → discharged) |
| `ConsentToken` | OTP/biometric consent tokens (sent → validated → expired/failed) |
| `SHARemittance` / `SHARemittanceLine` | Payment remittance advice from SHA |
| `SHAEligibilityCheck` | Eligibility verification log |

---

## 3. Claim Flow Routing

`services/sha_flow_router.py` determines which DHA HIE flow a claim uses, based on encounter type, eligibility scheme, and facility KEPH level:

```
                    ┌─────────────────────┐
                    │  New Encounter      │
                    └──────────┬──────────┘
                               │
                   ┌───────────▼───────────┐
                   │ Encounter type =      │
                   │ EMERGENCY?            │
                   └─────┬──────────┬──────┘
                    Yes  │          │ No
               ┌────────▼────┐  ┌──▼───────────────┐
               │  ECCIF flow  │  │ Scheme = UHC?    │
               │ (bundled,    │  │ & Level 2-3?     │
               │  no consent │  └──┬──────────┬─────┘
               │  upfront)    │  Yes│          │ No
               └──────────────┘ ┌───▼────┐  ┌──▼──────────┐
                                │ PHC    │  │ SHIF flow   │
                                │ flow   │  │ (OTP/bio    │
                                │ (Level │  │  consent,   │
                                │  2-3,  │  │  preauth)   │
                                │  no    │  └─────────────┘
                                │ preauth│
                                └────────┘
```

| Flow | When | Consent | Preauth | Tariffs |
|------|------|---------|---------|---------|
| **PHC** | UHC scheme, Level 2-3 facility | Simplified | Not required | Capitation / fee-for-service |
| **SHIF** | SHIF scheme, Level 3+ facility | OTP or biometric | Required for restricted services | Fee-for-service |
| **ECCIF** | Emergency encounter | Not upfront (deferred) | Bundled | Bundled emergency tariffs |

Fallback heuristics: UHC at a Level 4+ facility routes to SHIF; SHIF at a Level 2 dispensary routes to PHC.

---

## 4. Automation Triggers (Proactive Workflow)

`signals.py` and `tasks.py` implement a proactive workflow that begins the moment a patient is registered or encounters are created, rather than waiting for manual billing staff action.

### 4.1 Trigger chain

```
Patient registered (with National ID)
  └─► cache_patient_eligibility (async)        — pre-check & cache SHA eligibility

Patient added to clinic queue
  ├─► trigger_phc_claim_on_queue               — ensure PHC draft claim exists
  └─► trigger_sha_consent_on_queue (async)     — auto-trigger OTP consent

Encounter created (OPD/EMERGENCY, Level 2-3)
  ├─► create_invoice_for_encounter             — auto-create draft invoice
  ├─► _maybe_create_phc_claim                  — auto-create PHC draft claim
  └─► trigger_sha_automation_on_encounter
       └─► auto_start_visit (async, 30s delay) — auto-start DHA visit if consent ready

Encounter created (Inpatient)
  └─► handle_admission_billing                 — auto-bill admission fee + bed night

Discharge created
  └─► handle_discharge_billing                 — finalize invoice, create SHA claim

Immunization administered
  └─► handle_immunization_billing              — auto-bill vaccine administration

Lab results verified / documents finalized
  └─► trigger_sha_document_attachment (async)  — auto-attach documents to claim
```

### 4.2 Key automation services (`sha_automation.py`)

The `SHAAutomationService` class provides 10+ class methods:

1. `auto_create_claim_from_encounter` — draft claim creation
2. `auto_start_visit` — DHA visit start when consent is validated
3. `auto_suggest_interventions` — infer interventions from clinical data
4. `auto_attach_documents` — attach lab reports / clinical notes
5. `auto_validate_claim` — pre-submission validation
6. `auto_submit_claim` — queued submission
7. `auto_submit_preauth` — preauth for routine procedures (delivery, imaging, labs)
8. `check_eligibility_pre_visit` — proactive eligibility check
9. `generate_daily_digest` — end-of-day claims summary with time-bar alerts

---

## 5. ILM Submission Lifecycle

`services/ilm_claim_service.py` (`IlmClaimService`) wraps the 15 DHA HIE `/api/v1/claims/*` endpoints. Each method resolves the consent token, calls the ILM client (with retries, audit, PII redaction), persists DHA identifiers back onto the claim, and publishes domain events.

### 5.1 The full ILM claim lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ILM CLAIM LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Start Visit          POST /api/v1/claims/visit                  │
│     (OTP or biometric)   → returns authorization_code (consent)     │
│                           → stores dha_external_id                  │
│                                                                     │
│  2. Add Intervention(s)  POST /api/v1/claims/interventions          │
│     (per intervention)   → persists SHAClaimIntervention            │
│                           → captures document_types, tariffs       │
│                                                                     │
│     ┌─ Switch intervention  POST /claims/interventions/switch       │
│     ├─ Restore intervention POST /claims/interventions/restore     │
│     └─ Retire intervention  POST /claims/interventions/retire      │
│                                                                     │
│  3. PHC Virtual Line     POST /api/v1/claims/add_virtual_claim_line │
│     (Level 2-3 only)     → capitation / fee-for-service             │
│                                                                     │
│  4. Add Diagnosis        POST /api/v1/claims/diagnoses              │
│     (ICD code + intervention)                                       │
│                                                                     │
│  5. Add Line(s)          POST /api/v1/claims/lines                  │
│     (service, price, qty, scheme)                                   │
│     ┌─ Edit line   PATCH /claims/lines/edit                         │
│     └─ Remove line PATCH /claims/lines                              │
│                                                                     │
│  6. Add Attachment(s)    POST /api/v1/claims/attachments            │
│     (multipart: clinical notes, invoices, lab reports)             │
│     └─ Remove attachment PATCH /claims/attachments                  │
│                                                                     │
│  7. Preview              POST /api/v1/claims/preview                 │
│     (REQUIRED before submit) → stamps previewed_at                  │
│                                                                     │
│  7b. Preview Payer       POST /adapter/facade/edi/v1/claims/claims  │
│     (payer adjudication view) → updates last_dha_status             │
│                                                                     │
│  8. Submit               POST /api/v1/claims/submit                 │
│     (invoice_number + discharge OTP/biometric)                      │
│     → status = "submitted", stores sha_claim_reference              │
│                                                                     │
│  9. Close / Cancel       POST /api/v1/claims/close                  │
│     (cancel_reason_type)  → status = "written_off"                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Pre-authorization (SHIF flow only)

For restricted services (surgery, renal, oncology, imaging, optical), `IlmPreauthService` manages a separate preauth lifecycle:

```
Draft → Submitted → Approved / Denied / Expired
```

All preauths must be **approved** before a claim can be submitted (enforced in `validate_for_submission`).

---

## 6. Submission Validation Gate

`SHAClaim.validate_for_submission()` enforces a strict checklist before allowing submission:

1. ✅ Status is `draft`, `validated`, or `pending_submission`
2. ✅ SHA member is eligible
3. ✅ Has at least one claim item
4. ✅ All items have tariff codes
5. ✅ Required attachments present (`clinical_notes`, `invoice`)
6. ✅ Intervention-specific document types present (DHA spec)
7. ✅ Per-diem interventions have a tariff for the facility's KEPH level
8. ✅ SHIF claims have a validated consent token (or `dha_visit_started_at`)
9. ✅ Claimed amount > 0
10. ✅ Claim has been previewed at least once (`previewed_at` set)
11. ✅ All preauths on the claim are approved (not draft/submitted)
12. ✅ Pre-authorization for restricted services is approved and not expired

---

## 7. Time-Barring Compliance

The system tracks DHA time-barring deadlines:

| Scenario | Deadline |
|----------|----------|
| Emergency claims (ECCIF) | 24 hours from service date |
| Claims with QUERY status | 14 days from query raised |
| Other draft/validated claims | No hard deadline |

Properties: `time_barring_deadline`, `is_time_barred`, `hours_until_time_barred`. The daily digest flags claims at risk (< 24h remaining).

---

## 8. Appeals & Resubmissions

Rejected or partially approved claims can be appealed via `SHAClaim.create_appeal()`:

- Creates a new `SHAClaim` with `version = parent.version + 1` and `parent_claim` FK
- Copies all line items from the original claim
- Sets original claim status to `appealed`
- Appeal reason stored in `adjudication_notes`

---

## 9. Frontend Orchestration

`web-app/components/billing/sha/ClaimWorkflowTab.tsx` renders the proactive workflow UI, showing only panels relevant to the claim's flow and state:

```
┌─────────────────────────────────────────────────┐
│ ClaimWorkflowTab                                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  Step 0: PreVisitChecksPanel                     │
│    (eligibility, member verification)            │
│                                                  │
│  Missing Documents Advisory                      │
│    (per-intervention required docs + auto-attach)│
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ ConsentPanel  │  │ PreauthPanel  │            │
│  │ (OTP/bio)     │  │ (if required) │            │
│  └──────┬───────┘  └──────────────┘            │
│         │ consent token threaded down            │
│         ▼                                        │
│  InterventionSuggestionsPanel (draft only)       │
│                                                  │
│  ClaimILMPanel                                   │
│    (start visit → interventions → diagnoses      │
│     → lines → attachments → preview → submit)    │
│                                                  │
│  DischargePanel (inpatient only)                 │
│                                                  │
└─────────────────────────────────────────────────┘
```

The consent credential (OTP/biometric GUID) is captured once and threaded through all downstream ILM calls so the user is never re-prompted. Terminal states (`paid`, `partial`, `cancelled`, `written_off`) disable all workflow actions.

---

## 10. Event-Driven Architecture

Every lifecycle transition publishes domain events via `hmis.apps.core.events`:

| Event | Trigger |
|-------|---------|
| `SHA_CLAIM_CREATED` | Draft claim auto-created |
| `CONSENT_OTP_SENT` / `CONSENT_VALIDATED` / `CONSENT_EXPIRED` | Consent token state changes |
| `PREAUTH_SUBMITTED` / `PREAUTH_APPROVED` / `PREAUTH_DENIED` | Preauth lifecycle |
| `DHA_CLAIM_VISIT_STARTED` | `start_visit` success |
| `DHA_CLAIM_INTERVENTION_CHANGED` | Add/switch/restore/retire intervention |
| `DHA_CLAIM_DIAGNOSIS_CHANGED` | Add/remove diagnosis |
| `DHA_CLAIM_LINE_CHANGED` | Add/edit/remove line |
| `DHA_CLAIM_ATTACHMENT_CHANGED` | Add/remove attachment |
| `DHA_CLAIM_PREVIEWED` | Preview call |
| `DHA_CLAIM_SUBMITTED` | Submit call |
| `DHA_CLAIM_CLOSED` | Close/cancel call |

WebSocket broadcasts also fire for invoice and payment changes, enabling real-time UI updates.

---

## 11. Key Files Reference

| Layer | File |
|-------|------|
| **Models** | `backend/hmis/apps/billing/models.py` |
| **Flow router** | `backend/hmis/apps/billing/services/sha_flow_router.py` |
| **ILM claim service** | `backend/hmis/apps/billing/services/ilm_claim_service.py` |
| **ILM preauth service** | `backend/hmis/apps/billing/services/ilm_preauth_service.py` |
| **ILM client** | `backend/hmis/apps/billing/services/ilm_client.py` |
| **Consent resolver** | `backend/hmis/apps/billing/services/consent_token_resolver.py` |
| **Eligibility** | `backend/hmis/apps/billing/services/sha_eligibility.py` |
| **Legacy FHIR claims** | `backend/hmis/apps/billing/services/sha_claims.py` |
| **Automation** | `backend/hmis/apps/billing/sha_automation.py` |
| **Signals/triggers** | `backend/hmis/apps/billing/signals.py` |
| **Async tasks** | `backend/hmis/apps/billing/tasks.py` |
| **Views** | `backend/hmis/apps/billing/sha_views.py`, `sha_automation_views.py`, `sha_ilm_lifecycle_views.py` |
| **Frontend workflow** | `web-app/components/billing/sha/ClaimWorkflowTab.tsx` |
| **Frontend ILM panel** | `web-app/components/billing/sha/ClaimILMPanel.tsx` |
| **DHA HIE docs** | `docs/dha/`, `docs/dha-ilm-integration.md`, `docs/sha-implementation-summary.md` |

---

## 12. Summary

The Vitora SHA claim workflow is a **proactive, event-driven, multi-flow** system:

- **Proactive**: Claims are auto-created at encounter registration; consent and preauth are auto-triggered from clinic queues; documents auto-attach when lab results verify.
- **Multi-flow**: Three DHA HIE routing paths (PHC, SHIF, ECCIF) handle the full spectrum of Kenya's UHC, SHIF, and emergency care scenarios.
- **Compliance-gated**: A 12-point validation gate enforces DHA spec requirements (consent, preauth, documents, preview) before submission.
- **ILM-native**: The target architecture uses the DHA ILM middleware's 15-operation claim lifecycle, with legacy FHIR as a coexisting fallback.
- **Observable**: Every transition publishes domain events and WebSocket broadcasts for real-time monitoring and UI updates.

# DHA HIE Claims & Preauths — Implementation Guide

> **Status**: All 4 phases complete (May 2026)
> **Audit Source**: `docs/dha/hie-claims-preauths.md`
> **Backend Root**: `backend/hmis/apps/billing/`
> **Frontend Root**: `web-app/app/(dashboard)/transactions/sha-claims/`, `web-app/lib/api/sha.ts`

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1 — Critical / Compliance Blockers](#phase-1--critical--compliance-blockers)
3. [Phase 2 — High Severity (Workflow Completeness)](#phase-2--high-severity-workflow-completeness)
4. [Phase 3 — Medium Severity (UX Completeness)](#phase-3--medium-severity-ux-completeness)
5. [Phase 4 — Low Severity (Polish)](#phase-4--low-severity-polish)
6. [Domain Events Catalog](#domain-events-catalog)
7. [API Endpoints Reference](#api-endpoints-reference)
8. [Known Gaps & Future Work](#known-gaps--future-work)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DHA HIE Integration Flow                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐        ┌──────────────┐        ┌───────────────┐   │
│  │  Next.js    │  REST   │  Django API  │  HTTPS  │  DHA HIE      │   │
│  │  Frontend   │ ──────► │  (ILM Proxy) │ ──────► │  hie.sha.    │   │
│  │             │ ◄────── │              │ ◄────── │  go.ke        │   │
│  └─────────────┘        └──────────────┘        └───────────────┘   │
│        │                       │                                     │
│        │                       │ Celery Tasks                        │
│        │                       ▼                                     │
│        │              ┌──────────────────┐                           │
│        │              │  Time-barring    │                           │
│        │              │  flag_time_bar.. │                           │
│        │              └──────────────────┘                           │
│        │                       │                                     │
│        │ WebSocket             │ Domain Events                       │
│        ▼                       ▼                                     │
│  ┌─────────────┐      ┌──────────────────┐                          │
│  │  Toasts /   │      │  EventStore /    │                          │
│  │  Alerts     │      │  AuditLog        │                          │
│  └─────────────┘      └──────────────────┘                          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Design Principles**:
- Django acts as an **ILM proxy** — all DHA HIE calls route through the backend (never direct from browser)
- Every state transition publishes a **domain event** (see catalog below)
- Frontend validates API responses with **Zod schemas** (`parseResponse()`)
- All new models use **FacilityScopedModel** for tenant isolation
- Offline support: claim submission queues when DHA is unreachable

---

## Phase 1 — Critical / Compliance Blockers

### 1.1 Document-Type Enforcement per Intervention

**Problem**: SHA interventions require specific document types (e.g., medical reports, lab results). Without enforcement, claims are rejected post-submission.

**Solution**: Block claim submission when required documents are missing; surface missing docs on the UI.

#### Backend

| File | Key Addition |
|------|-------------|
| `billing/models.py` | `SHAClaim.missing_document_types` property — walks each intervention's `required_document_types`, compares against attached `SHAClaimAttachment` records |
| `billing/models.py` | `SHAClaim.validate_for_submission()` — comprehensive pre-submit validation (status, eligibility, items, attachments, consent, **document types**) |
| `billing/sha_views.py` | `SHAClaimViewSet.validate_claim()` — `POST /api/sha/claims/{id}/validate/` returns `{is_valid, errors}` |
| `billing/sha_views.py` | `SHAClaimViewSet.submit()` — blocks with `400 {error}` when validation fails |

**`missing_document_types` response shape:**
```json
[
  {
    "intervention_code": "SHA-07-001",
    "intervention_name": "General Surgery",
    "missing": ["MEDICAL_REPORT", "CONSENT_FORM"]
  }
]
```

#### Frontend

| File | Component |
|------|-----------|
| `components/billing/sha/InterventionsList.tsx` | `InterventionsList` — shows `required_document_types` per intervention row, indicates missing uploads |
| `transactions/sha-claims/[id]/page.tsx` | Claim detail — Submit button disabled when docs missing; validation banner |

---

### 1.2 Start Visit OTP Enforcement (SHIF Flow)

**Problem**: SHA requires patient consent (OTP-validated) before starting a non-emergency SHIF visit. Without enforcement, claims are rejected for missing consent tokens.

**Solution**: Multi-step consent flow integrated into patient check-in and claim creation.

#### Flow

```
Patient Check-in                    Claim Detail Page
      │                                    │
      ▼                                    ▼
┌─────────────────┐              ┌──────────────────┐
│ SHAConsentStep  │              │  ConsentPanel    │
│ (inline OTP)    │              │  (full OTP UI)   │
└────────┬────────┘              └────────┬─────────┘
         │                                │
         ▼                                ▼
   Send OTP ──► /api/sha/consent/send-otp/
   Validate ──► /api/sha/consent/validate-otp/
   Start Visit ► /api/sha/consent/start-visit/
         │                                │
         ▼                                ▼
   consent_token persisted to claim payload
```

#### Backend Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `POST /api/sha/consent/send-otp/` | `ConsentSendOTPView` | Sends OTP to patient via DHA `/api/v1/claims/otp` |
| `POST /api/sha/consent/validate-otp/` | `ConsentValidateOTPView` | Validates OTP, returns consent token |
| `POST /api/sha/consent/start-visit/` | `StartVisitView` | Registers visit with DHA using OTP + intervention codes |

#### Frontend Components

| File | Component | Context |
|------|-----------|---------|
| `components/patients/sha-consent-step.tsx` | `SHAConsentStep` | Inline during patient check-in |
| `components/billing/sha/ConsentPanel.tsx` | `ConsentPanel` | Full OTP validation on claim detail |
| `components/billing/sha/ClaimILMPanel.tsx` | `ClaimILMPanel` | Start Visit section with OTP + patient_id |

**Logic**: Skipped for ECCIF (emergency) flow — required for SHIF.

---

### 1.3 Biometrics Consent Path

**Problem**: SHA supports biometric patient consent as an alternative to OTP. Facilities with fingerprint hardware should offer this path.

**Solution**: Hardware detection → biometric authorization → polling → consent token extraction.

#### State Machine

```
detecting → ready → authorizing → polling → authorized
                                         ↘ failed (fallback to OTP)
```

#### Frontend

| File | Component | Details |
|------|-----------|---------|
| `components/billing/sha/BiometricsConsent.tsx` | `BiometricsConsent` | Full biometric flow component |

**Configuration**:
- Hardware detection: `GET https://localhost:18065/status` (5s timeout)
- Poll interval: **2 seconds**
- Poll timeout: **120 seconds**
- On hardware failure: calls `onHardwareNotDetected()` → parent switches to OTP tab

#### Backend Endpoints

| Endpoint | View | Purpose |
|----------|------|---------|
| `POST /api/sha/consent/authorize/` | `BiometricAuthorizeView` | Initiates biometric auth → returns `{auth_guid, iframe_url}` |
| `GET /api/sha/consent/authorize/{guid}/status/` | `BiometricAuthorizeStatusView` | Polls until `AUTHORIZED` / `FAILED` / `EXPIRED` |

**Service**: `SHAConsentService.authorize_biometric()` and `SHAConsentService.get_authorization_status()`

---

### 1.4 Remittance Module

**Problem**: SHA pays facilities via remittances (batched bank transfers). Without tracking, facilities cannot reconcile payments against submitted claims.

**Solution**: Pull remittances from DHA, auto-match to local claims, track reconciliation status.

#### Backend Models

**`SHARemittance`** (FacilityScopedModel):

| Field | Type | Description |
|-------|------|-------------|
| `bank_reference` | CharField(100), unique | Bank transfer reference |
| `payment_date` | DateField | SHA payment date |
| `total_amount` | Decimal(12,2) | Total remittance amount |
| `claims_count` | IntegerField | Number of claims in batch |
| `status` | TextChoices | `received` → `reconciling` → `reconciled` / `partial` |
| `dha_payload` | JSONField | Raw DHA response for audit |

**`SHARemittanceLine`**:

| Field | Type | Description |
|-------|------|-------------|
| `remittance` | FK → SHARemittance | Parent remittance |
| `claim` | FK → SHAClaim (nullable) | Matched local claim |
| `dha_claim_id` | CharField(100) | DHA-side claim ID |
| `paid_amount` | Decimal(12,2) | Amount paid for this claim |
| `is_reconciled` | BooleanField | Whether matched to local claim |

#### Service

**File**: `backend/hmis/apps/billing/services/sha_remittance.py`

| Method | DHA Endpoint | Purpose |
|--------|-------------|---------|
| `fetch_remittances(facility_code, facility)` | `GET /api/v1/claims/remittances` | Creates/updates `SHARemittance` records |
| `fetch_claims_paid(remittance, facility_code)` | `GET /api/v1/claims/remittances/{ref}/claims` | Creates `SHARemittanceLine` + auto-reconciles |

**Auto-reconciliation**: Matches `dha_claim_id` → local `SHAClaim.sha_claim_reference`; marks `is_reconciled=True`.

#### API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sha/remittances/` | GET | List remittances (facility-scoped) |
| `/api/sha/remittances/{id}/` | GET | Remittance detail |
| `/api/sha/remittances/{id}/claims/` | GET | Claims paid in this remittance |
| `/api/sha/remittances/fetch/` | POST | Trigger DHA fetch (manual) |

#### Frontend (API Client + Schemas)

| File | Contents |
|------|----------|
| `lib/api/sha.ts` | `shaApi.getRemittances()`, `getRemittance(id)`, `getRemittanceClaims(id)`, `fetchRemittances()` |
| `lib/schemas/sha.schema.ts` | `SHARemittanceSchema`, `SHARemittanceLineSchema`, `PaginatedRemittancesSchema` |

---

## Phase 2 — High Severity (Workflow Completeness)

### 2.1 Preauth Doctor-Consent UI

**Problem**: Some preauthorizations require doctor approval via Practice360. The system must show polling state and handle async approval/rejection.

**Solution**: `DoctorConsentCard` component that polls every 10s and reacts to terminal states.

#### Frontend

| File | Component | Behavior |
|------|-----------|----------|
| `components/billing/sha/DoctorConsentCard.tsx` | `DoctorConsentCard` | Polls `shaApi.pollDoctorConsent(preauthId)` every **10 seconds** |

**Terminal states** (stops polling): `APPROVED`, `REJECTED`, `FAILED`, `CANCELLED`
**User feedback**: Toast notification on state transitions; "Resend" button on errors.

#### Backend

| Endpoint | View | Purpose |
|----------|------|---------|
| `POST /api/sha/ilm/preauth/doctor-consent/` | `IlmDoctorConsentView` | Send consent request to Practice360 |
| `GET /api/sha/ilm/preauth/doctor-consent/poll/` | `IlmDoctorConsentPollView` | Check current consent state |

---

### 2.2 Preauth Request Wizard

**Problem**: SHA supports 7 preauth types, each with different required fields (clinical indications, doctors, imaging details, etc.).

**Solution**: Multi-step wizard with type-driven dynamic form validation.

#### Preauth Types

| Code | Type | Special Fields |
|------|------|----------------|
| 1 | Normal | Standard clinical notes |
| 2 | Surgical | Procedure details, surgeon |
| 3 | Elective | Scheduled date, clinical justification |
| 4 | Oncology | Staging, treatment protocol |
| 5 | Renal | Dialysis frequency, access type |
| 6 | Imaging | Modality, body region |
| 7 | Optical | Prescription details |

#### Wizard Steps (4 steps)

1. **Select preauth type** — type selector with descriptions
2. **Fill details** — consent token, intervention codes, diagnoses, items, doctors, clinical notes (fields vary by type)
3. **Attach documents** — upload supporting files
4. **Review and submit** — summary + final submission

#### Frontend Pages

| File | Component | Purpose |
|------|-----------|---------|
| `transactions/preauths/new/page.tsx` | `NewPreauthPage` | 4-step creation wizard |
| `transactions/preauths/page.tsx` | Preauth list | Status filtering, search, ResponsiveTable, PullToRefresh |

#### Backend Views

| View | Endpoint |
|------|----------|
| `IlmPreauthCreateView` | `POST /api/sha/ilm/preauth/create/` |
| `PreauthSubmitView` | `POST /api/sha/preauth/submit/` |
| `IlmPreauthCancelView` | `POST /api/sha/ilm/preauth/cancel/` |
| `IlmPreauthFetchView` | `GET /api/sha/ilm/preauth/fetch/` |
| `SHAPreauthListView` | `GET /api/sha/preauths/` |

---

### 2.3 Time-Barring Alerts

**Problem**: SHA enforces strict deadlines — emergency claims must be submitted within **24 hours**, QUERY-status claims must be resolved within **14 days**. Missing these deadlines permanently bars the claim.

**Solution**: Celery beat task scans every 30 minutes; domain events drive WebSocket alerts; frontend shows countdown badges.

#### Backend

**Model properties** (`SHAClaim`):

| Property | Returns | Logic |
|----------|---------|-------|
| `time_barring_deadline` | `datetime | None` | Emergency: 24h from `service_date`; QUERY: 14d from `updated_at` |
| `is_time_barred` | `bool` | `now() > deadline` |
| `hours_until_time_barred` | `float | None` | Hours remaining |

**Celery Task**: `flag_time_barring_claims`

| Condition | Event Emitted |
|-----------|---------------|
| `remaining_hours <= 0` | `BillingEvents.SHA_CLAIM_TIME_BARRED` |
| `remaining_hours <= 6` (25% of 24h) | `BillingEvents.SHA_CLAIM_TIME_BAR_WARNING` |

**Schedule**: Every 30 minutes via Celery beat.

#### Frontend

| Component | Location | Behavior |
|-----------|----------|----------|
| `TimeBarBadge` | Claim detail page | Inline countdown showing hours/minutes remaining |

---

## Phase 3 — Medium Severity (UX Completeness)

### 3.1 Intervention Combination Rules

**Problem**: SHA benefit packages have combination restrictions (some packages are "ALONE" — cannot be combined). Submitting invalid combinations wastes time and gets rejected.

**Solution**: Client-side validation module warns before submission; DHA server validates authoritatively.

#### ALONE Packages (cannot combine with anything)

| Code | Package |
|------|---------|
| SHA-01 | Ambulance & Emergency |
| SHA-05 | Optical |
| SHA-06 | Haematology & Oncology |
| SHA-09 | Medical Imaging |
| SHA-10 | Mental Wellness |
| SHA-12 | Outpatient |
| SHA-18 | Essential Diagnostic Lab NCDs |

#### Special Renal Rules

- `SHA-16-001`, `SHA-16-002`, `SHA-16-004` → must be ALONE
- Other SHA-16 subcodes → can combine with SHA-03, SHA-07

#### Frontend

| File | Export | Purpose |
|------|--------|---------|
| `lib/sha/combination-rules.ts` | `INTERVENTION_COMBINATION_RULES` | Full combination matrix |
| `lib/sha/combination-rules.ts` | `validateInterventionCombination(existing, new)` | Returns `{valid, reason?}` |
| `lib/sha/combination-rules.ts` | `getBenefitCode(code)` | Extracts package (e.g., `"SHA-07-001"` → `"SHA-07"`) |

**Integration**: `ClaimILMPanel` runs client validation on add-intervention; shows warning alert if invalid but still allows server-side submission.

---

### 3.2 Retire / Restore Intervention Controls

**Problem**: Interventions may need to be retired (removed from active billing) and later restored. UI must support this lifecycle.

**Solution**: Per-intervention action buttons with confirm dialogs.

#### API Methods

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `shaApi.ilmRetireIntervention(claimId, {intervention_code})` | `POST /api/sha/claims/{id}/ilm/interventions/retire/` | Retire intervention |
| `shaApi.ilmRestoreIntervention(claimId, {intervention_code})` | `POST /api/sha/claims/{id}/ilm/interventions/restore/` | Restore intervention |

#### Frontend

**Component**: `InterventionsList` (`components/billing/sha/InterventionsList.tsx`)
- Separates active vs retired interventions
- Retire button on each active row
- Restore button on each retired row
- Toast notification on success/failure

---

### 3.3 Payer Claim Adjudication Preview

**Problem**: After submission, SHA processes claims through multiple internal states (clinical review, automatic checks, sent back for clarification). Facilities need visibility into this payer-side processing.

**Solution**: "Payer View" component on claim detail showing DHA's processing state, notes, and flags.

#### Frontend

**Component**: `PayerClaimPreview` (`components/billing/sha/PayerClaimPreview.tsx`)

**Visibility**: Only shown for claims with status in `['submitted', 'processing', 'approved', 'rejected', 'paid', 'query']`

**Data displayed**:
- Payer workflow state (14 possible states, color-coded badges)
- Processing notes / claim notes from SHA reviewers
- Invoice flags array
- Clarification reasons (highlighted for `CLARIFICATION_AFTER_AUTOMATIC_CHECKS` / `SENT_BACK`)

**API**: `shaApi.ilmPreviewPayerClaim(claimId)` → `POST /api/sha/claims/{id}/ilm/preview-payer/`

---

## Phase 4 — Low Severity (Polish)

### 4.1 Payer-Side Adjudication Simulation

**Status**: Skipped — DHA HIE does not expose a dry-run/simulation endpoint for pre-submit validation.

---

### 4.2 PFMS / Vulnerable Coverage Flagging

**Problem**: Patients eligible for PFMS (Public Medical Fund Scheme — indigent, vulnerable, elderly, disabled, orphans) should use government-subsidized tariffs. Billing staff need clear visual indicators.

**Solution**: Surface PFMS eligibility badges on the eligibility banner and include PFMS fields in the eligibility API response.

#### Backend

**Scheme Matrix** (`services/sha_eligibility.py`):

```python
BILLABLE_SCHEMES_BY_LEVEL = {
    "1": {"UHC"},
    "2": {"UHC"},
    "3": {"UHC", "SHIF", "PMF"},    # ← PMF added
    "4": {"SHIF", "PMF"},            # ← PMF added
    "5": {"SHIF", "PMF"},            # ← PMF added
    "6": {"SHIF", "PMF"},            # ← PMF added
}
```

**Eligibility Response** (`sha_views.py` — `EligibilityCheckView`):

```json
{
  "status": "eligible",
  "member": { ... },
  "is_pfms_eligible": true,
  "pfms_category": "vulnerable",
  "pfms_category_display": "Vulnerable",
  "pfms_verified": true
}
```

**PFMS Categories** (TextChoices on `SHAMember`):

| Value | Display |
|-------|---------|
| `vulnerable` | Vulnerable |
| `elderly` | Elderly |
| `disabled` | Disabled |
| `orphan` | Orphan |
| `indigent` | Indigent |

#### Frontend

PFMS badges appear in **3 locations** within `EligibilityBanner.tsx`:

| Location | When Shown | Display |
|----------|-----------|---------|
| Compact banner | `member?.is_pfms_eligible` | Violet badge: `{category_display}` |
| `eligible_with_caveats` section | `member?.is_pfms_eligible` | Violet badge + "Government subsidy may apply — use PFMS tariffs" |
| Full eligible section | `member?.is_pfms_eligible` | Existing PFMS info badge |

---

## Domain Events Catalog

All DHA HIE-related events published via `publish_event()`:

| Event Type | Phase | Trigger |
|------------|-------|---------|
| `billing.consent.otp_sent` | 1.2 | OTP dispatched to patient |
| `billing.consent.validated` | 1.2 | OTP validated successfully |
| `billing.consent.expired` | 1.2 | Consent token expired |
| `billing.consent.failed` | 1.2 | Consent validation failed |
| `billing.dha_visit.otp_sent` | 1.2 | Visit start OTP sent |
| `billing.sha_claim.visit_started` | 1.2 | Visit registered with DHA |
| `billing.sha_claim.intervention_changed` | 3.2 | Intervention retired/restored |
| `billing.sha_claim.submitted` | 1.1 | Claim submitted to DHA |
| `billing.sha_claim.closed` | 1.1 | Claim closed |
| `billing.sha_claim.time_bar_warning` | 2.3 | ≤6 hours until time-bar |
| `billing.sha_claim.time_barred` | 2.3 | Claim past deadline |
| `billing.preauth.submitted` | 2.2 | Preauth submitted |
| `billing.preauth.approved` | 2.2 | Preauth approved |
| `billing.preauth.denied` | 2.2 | Preauth denied |
| `billing.dha_preauth.created` | 2.2 | Preauth created in DHA |
| `billing.dha_preauth.cancelled` | 2.2 | Preauth cancelled |
| `billing.dha_preauth.doctor_consent_requested` | 2.1 | Doctor consent sent to Practice360 |
| `billing.dha_file.uploaded` | 1.1 | Document uploaded to DHA |

---

## API Endpoints Reference

### Consent & Visit

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sha/consent/send-otp/` | Send consent OTP |
| POST | `/api/sha/consent/validate-otp/` | Validate OTP |
| POST | `/api/sha/consent/start-visit/` | Start visit with DHA |
| POST | `/api/sha/consent/authorize/` | Initiate biometric auth |
| GET | `/api/sha/consent/authorize/{guid}/status/` | Poll biometric status |

### Claims

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sha/claims/{id}/validate/` | Pre-submit validation |
| POST | `/api/sha/claims/{id}/submit/` | Submit claim to DHA |
| POST | `/api/sha/claims/{id}/ilm/interventions/retire/` | Retire intervention |
| POST | `/api/sha/claims/{id}/ilm/interventions/restore/` | Restore intervention |
| POST | `/api/sha/claims/{id}/ilm/preview-payer/` | Fetch payer-side view |

### Preauthorizations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sha/ilm/preauth/create/` | Create preauth |
| POST | `/api/sha/preauth/submit/` | Submit preauth |
| POST | `/api/sha/ilm/preauth/cancel/` | Cancel preauth |
| GET | `/api/sha/ilm/preauth/fetch/` | Fetch preauth status |
| POST | `/api/sha/ilm/preauth/doctor-consent/` | Request doctor consent |
| GET | `/api/sha/ilm/preauth/doctor-consent/poll/` | Poll consent status |
| GET | `/api/sha/preauths/` | List preauths |

### Remittances

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/sha/remittances/` | List remittances |
| GET | `/api/sha/remittances/{id}/` | Remittance detail |
| GET | `/api/sha/remittances/{id}/claims/` | Claims in remittance |
| POST | `/api/sha/remittances/fetch/` | Trigger DHA fetch |

### Eligibility

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/sha/eligibility/check/` | Check patient eligibility (includes PFMS fields) |

---

## Known Gaps & Future Work

| Area | Gap | Severity | Notes |
|------|-----|----------|-------|
| Remittances | No automated Celery beat task | Low | Currently manual-trigger only via `POST /fetch/`; add nightly `pull_sha_remittances` task |
| Remittances | No frontend list/detail pages | Medium | API client + schemas ready; pages not yet built |
| Time-Barring | WebSocket toast for time-bar warnings | Low | Events published; WebSocket consumer subscription not confirmed |
| Payer Preview | Per-line price diff (approved vs billed) | Low | Overall status shown; line-item granularity not yet rendered |
| Start Visit | No standalone wizard component | N/A | Logic split across `SHAConsentStep`, `ConsentPanel`, `ClaimILMPanel` — works but isn't a single reusable wizard |
| PFMS | Tariff catalog integration | Future | Badge shown but actual PFMS tariff lookup/application not automated |

---

## File Index

### Backend

| File | Contents |
|------|----------|
| `billing/models.py` | `SHAClaim` (validate_for_submission, missing_document_types, time_barring_deadline), `SHARemittance`, `SHARemittanceLine`, `SHAClaimIntervention` |
| `billing/sha_views.py` | All claim/preauth/consent/remittance/eligibility views |
| `billing/sha_urls.py` | URL routing for SHA endpoints |
| `billing/sha_serializers.py` | Request/response serializers |
| `billing/services/sha_eligibility.py` | Eligibility checking + BILLABLE_SCHEMES_BY_LEVEL matrix |
| `billing/services/sha_remittance.py` | `SHARemittanceService` (fetch + reconcile) |
| `billing/tasks.py` | `flag_time_barring_claims` Celery task |
| `core/events/types.py` | `BillingEvents` enum with all domain event constants |

### Frontend

| File | Contents |
|------|----------|
| `lib/api/sha.ts` | Full SHA API client (consent, claims, preauths, remittances) |
| `lib/schemas/sha.schema.ts` | Zod schemas for all SHA responses |
| `lib/sha/combination-rules.ts` | Intervention combination validation module |
| `lib/types/sha.ts` | TypeScript interfaces (`EligibilityState`, `SHAMember`, `PFMSCategory`) |
| `components/billing/sha/EligibilityBanner.tsx` | Eligibility display (compact + full) with PFMS badges |
| `components/billing/sha/BiometricsConsent.tsx` | Biometric consent flow |
| `components/billing/sha/ConsentPanel.tsx` | OTP consent panel |
| `components/billing/sha/ClaimILMPanel.tsx` | Start Visit + intervention management |
| `components/billing/sha/InterventionsList.tsx` | Intervention list with retire/restore |
| `components/billing/sha/PayerClaimPreview.tsx` | Payer-side adjudication view |
| `components/billing/sha/DoctorConsentCard.tsx` | Practice360 doctor consent polling |
| `components/patients/sha-consent-step.tsx` | Inline consent during check-in |
| `transactions/sha-claims/[id]/page.tsx` | Claim detail page |
| `transactions/preauths/new/page.tsx` | Preauth creation wizard |
| `transactions/preauths/page.tsx` | Preauth list page |

---

*Last updated: May 2026*

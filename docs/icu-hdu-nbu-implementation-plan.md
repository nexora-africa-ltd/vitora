# ICU/HDU/NBU Implementation Plan

> Owner: Product + Clinical Engineering
> Status: Proposed
> Scope: Extend existing inpatient architecture (no new standalone app)

---

## 1. Goal

Implement ICU, HDU, and NBU clinical workflows as first-class capabilities inside existing inpatient modules, with safe roll-out, strong auditability, and billing/reporting compatibility.

## 2. Decision Summary

- Do not create a separate `icu` app now.
- Extend `inpatient` domain (wards, beds, transfers, care plans, observations).
- Treat ICU/HDU/NBU as specialized inpatient pathways with shared core objects.
- Add dedicated UI flows where needed, but keep routing under existing admissions/inpatient areas.

## 3. Current-State Gaps

- ICU exists partially via ward types and AI risk tooling.
- HDU and NBU are not first-class ward types/workflows.
- Critical-care specific charting bundles are limited.
- Capability flags and billing linkage are inconsistent across ICU/HDU/NBU.

## 4. Scope

### In Scope

- Ward/bed taxonomy updates for ICU, HDU, NBU.
- Admission, transfer, and discharge workflows for step-up/step-down critical care.
- Critical care observations, nursing checkpoints, and escalation events.
- Capability flags, RBAC, navigation gates, and audit events.
- Billing integration for ICU/HDU/NBU stay attribution.
- Validation, migration, tests, rollout docs.

### Out of Scope (Phase 1)

- Device-native ICU monitor ingestion.
- Full neonatal ventilator protocol engine.
- Separate microservice or standalone critical care app.

---

## 5. Implementation Workstreams

## A. Data Model and Migrations

1. Add ward types:
   - `HDU` (High Dependency Unit)
   - `NBU` (Newborn Unit)
2. Extend bed constraints:
   - Optional neonatal bed attributes (warming, incubator, phototherapy support).
3. Add critical-care encounter metadata:
   - `care_level` (`GENERAL`, `HDU`, `ICU`, `NBU`)
   - `escalation_reason`, `escalation_timestamp`
4. Ensure transfer semantics support explicit step-up/step-down across all levels.
5. Add migration/backfill strategy for existing ICU records and transfer history consistency.

## B. Capability Flags and Subscription

1. Add facility flags:
   - `has_hdu`
   - `has_nbu`
2. Map to subscription features (same pattern as existing `has_icu`).
3. Add serializer validation and tier enforcement for new flags.
4. Ensure standalone operating modes force-disable incompatible critical-care flags where applicable.

## C. Backend APIs

1. Extend inpatient endpoints to filter and aggregate by care level (`ICU/HDU/NBU`).
2. Add readiness/preflight endpoint parity for HDU/NBU where needed.
3. Add explicit transfer validation:
   - general -> HDU
   - HDU -> ICU
   - ICU -> HDU/general
   - postnatal/maternity -> NBU
4. Add critical-care event endpoints (or extend existing timelines) for:
   - escalation
   - consultant review
   - handover checkpoints
5. Ensure API responses expose new flags in `modules` and `enabled_module_names` consistently.

## D. Frontend UX (Web)

1. Facility settings:
   - add toggles for HDU and NBU.
2. Admin facility pages:
   - display critical-care capabilities clearly.
3. Admissions and ward pages:
   - filter chips and badges for ICU/HDU/NBU.
   - transfer UI with safe step-up/step-down affordances.
4. Inpatient detail:
   - show current care level and history timeline.
5. Route guards/navigation:
   - keep inpatient routes, but gate views/actions by facility capability.

## E. Billing and Claims

1. Confirm per-diem mapping for ICU/HDU/NBU stays.
2. Ensure admission attachments include HDU/NBU equivalent evidence where required.
3. Validate intervention switching logic for ward-level billing transitions.
4. Add tests for mixed-stay scenarios (General -> HDU -> ICU -> General).

## F. AI and Decision Support

1. Preserve existing ICU risk integration.
2. Extend context payloads with HDU/NBU capability indicators when useful.
3. Keep AI recommendations capability-aware (do not recommend unavailable levels of care).

## G. Security, Audit, and Compliance

1. Emit audit events for capability changes (`has_icu/has_hdu/has_nbu`).
2. Emit audit events for escalation/de-escalation transfers.
3. Verify minimum-role checks for critical care actions (step-up approvals, discharge from ICU/HDU/NBU).

## H. QA and Rollout

1. Unit tests: models, serializers, transfer validators, billing mappings.
2. Integration tests: admission lifecycle across care levels.
3. E2E tests: facility capability toggle -> visible workflows -> successful transfer/discharge.
4. Seed/demo updates: add representative ICU/HDU/NBU data.
5. Rollout by feature flag + migration guard + release note.

---

## 6. Delivery Phases

## Phase 1 - Foundations (1 sprint)

- Data model updates (ward types, flags).
- Serializer/tier enforcement.
- Basic API and UI visibility updates.

## Phase 2 - Workflow Completeness (1 sprint)

- Transfer workflows and validation hardening.
- Timeline/event coverage.
- Billing integration completion.

## Phase 3 - Hardening (0.5-1 sprint)

- End-to-end test expansion.
- Documentation and analytics dashboards.
- Production rollout + monitoring.

---

## 7. Acceptance Criteria

- Facilities can enable/disable ICU/HDU/NBU through settings (tier-permitted).
- Wards and beds can be provisioned for ICU/HDU/NBU with correct constraints.
- Transfer flows enforce valid step-up/step-down transitions.
- Billing reflects care-level transitions without duplicate active interventions.
- Audit trail captures capability changes and care-level escalations.
- Existing inpatient and ICU features remain backward-compatible.

---

## 8. Detailed Checklist

## Planning

- [ ] Confirm clinical definitions and SOPs for ICU, HDU, NBU.
- [ ] Confirm payer and claims requirements per care level.
- [ ] Finalize data dictionary updates.

## Backend

- [ ] Add `HDU` and `NBU` to ward type choices.
- [ ] Add facility flags `has_hdu`, `has_nbu`.
- [ ] Add module-to-feature mapping for `hdu`, `nbu`.
- [ ] Add migration scripts and backfill safeguards.
- [ ] Update serializers and validation logic.
- [ ] Update API filters and response capability maps.
- [ ] Implement/extend transfer validation rules.
- [ ] Extend critical-care timeline event capture.

## Frontend

- [ ] Add HDU/NBU toggles in facility settings.
- [ ] Update facility detail/edit pages with new capabilities.
- [ ] Add ICU/HDU/NBU labels and filters in admissions/wards UI.
- [ ] Add transfer UI support for new pathways.
- [ ] Add capability-based visibility for critical-care controls.

## Billing + Claims

- [ ] Map ICU/HDU/NBU care levels to billing interventions.
- [ ] Validate intervention switch logic for level transitions.
- [ ] Update attachment generation for critical-care cases.

## Testing

- [ ] Unit tests for model/serializer changes.
- [ ] Integration tests for admission/transfer/discharge pathways.
- [ ] E2E tests for toggle-to-workflow behavior.
- [ ] Regression tests for existing ICU and inpatient flows.

## Operations

- [ ] Feature flag rollout plan per environment.
- [ ] Migration runbook and rollback plan.
- [ ] Monitoring dashboard for transfer and critical-care workflow health.
- [ ] Release notes and user training notes.

---

## 9. Risks and Mitigations

- Workflow complexity in transfers:
  - Mitigation: strict state-machine validation + exhaustive tests.
- Billing mismatch during mixed-level stays:
  - Mitigation: explicit intervention switching and reconciliation checks.
- Role/permission ambiguity:
  - Mitigation: codify action-level RBAC and audit all overrides.

---

## 10. Suggested Implementation Order (Technical)

1. Core model + migration updates.
2. Serializer and subscription enforcement.
3. API response and transfer validation updates.
4. UI toggles and visibility.
5. Billing/claims linkage.
6. Test expansion and rollout.

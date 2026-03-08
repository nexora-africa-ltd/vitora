# MCH and Clinics Flow Unification Plan

## Goal

Unify ANC and PNC workflows across MCH, Clinics, and Clinic Enrollments without breaking:

- existing MCH clinical records
- clinic queue/session operations
- encounter creation from clinic consultations
- billing automation on ANC and PNC visit creation
- ANC follow-up appointment creation
- current reporting during rollout

This plan assumes a low-risk migration strategy: preserve current data models first, add links and dual-write safeguards second, backfill incrementally, and only then tighten invariants.

## Current Problem Summary

The current implementation splits one real-world visit across multiple models:

- `MCHRegistration` links to `ClinicEnrollment` for ANC program state.
- `ANCVisit` and `PNCVisit` store rich MCH clinical content.
- `ClinicVisit` stores operational queue/session attendance and consultation workflow.
- `ClinicEnrollment.record_visit()` separately increments `last_visit_date`, `total_visits`, and `next_appointment`.

This creates three failure modes:

1. An ANC or PNC visit can be recorded in MCH without a corresponding `ClinicVisit`.
2. `ClinicEnrollment.total_visits` can drift from real attended visits.
3. UI screens that depend on clinic operational data do not reflect MCH history consistently.

## Target Architecture

### Canonical Roles

- `ClinicVisit`: operational source of truth for attendance and consultation workflow.
- `ANCVisit` and `PNCVisit`: MCH clinical payload attached to a completed or active clinic visit.
- `ClinicEnrollment`: longitudinal program summary derived from attended visits and scheduling state.

### Target Invariants

For ANC:

1. Every attended ANC consultation has exactly one `ClinicVisit`.
2. Every `ANCVisit` is linked to exactly one `ClinicVisit`.
3. Every ANC `ClinicVisit` points to the same patient and encounter as the linked `ANCVisit`.
4. `ClinicEnrollment.last_visit_date`, `total_visits`, and `next_appointment` are updated from the canonical visit event, not by ad hoc manual updates.

For PNC:

1. Every attended PNC consultation has exactly one `ClinicVisit`.
2. Every `PNCVisit` is linked to exactly one `ClinicVisit`.
3. If the facility uses PNC as an enrolled program, the same derived-summary rule applies to `ClinicEnrollment`.
4. If PNC remains non-enrollment-based, the canonical attendance source is still `ClinicVisit`.

## Recommended Data Model Changes

### Phase 1: Add Non-Breaking Link Fields

Add nullable fields first:

- `ANCVisit.clinic_visit -> OneToOneField(ClinicVisit, null=True, blank=True)`
- `PNCVisit.clinic_visit -> OneToOneField(ClinicVisit, null=True, blank=True)`

Reasons:

- preserves all existing MCH records
- allows staged backfill
- keeps current APIs working while link coverage grows

Do not make these required initially.

### Phase 2: Add Provenance and Reconciliation Metadata

Add the following optional fields to support safe backfill and auditing:

- `ClinicVisit.source_module` with values like `TRIAGE`, `DIRECT`, `MCH_ANC`, `MCH_PNC`, `REFERRAL`, `APPOINTMENT`
- `ClinicVisit.source_record_id` nullable integer for transitional traceability
- optional `backfilled_at` timestamp and `backfill_batch_id` on `ClinicVisit` or in a separate audit table

This makes backfilled records distinguishable from live operational records.

### Phase 3: Derive Enrollment Summary from Canonical Attendance

Introduce a service layer for enrollment updates, for example:

- `record_program_attendance_from_clinic_visit(clinic_visit, next_appointment_date=None)`

This service should:

- identify the relevant enrollment for the patient and clinic type
- update `last_visit_date`
- increment `total_visits`
- update `next_appointment` from the clinical payload if provided
- avoid double-counting when rerun

`ClinicEnrollment.record_visit()` should become an internal helper or be deprecated in favor of the canonical event path.

## Workflow Design

### Unified ANC Flow

Target flow for live traffic:

1. MCH registration creates or links ANC `ClinicEnrollment`.
2. Patient is routed to ANC queue through `ClinicVisit`.
3. Clinic workflow starts consultation and creates `Encounter` from `ClinicVisit.start_consultation()`.
4. ANC clinical form saves `ANCVisit` linked to:
   - `registration`
   - `encounter`
   - `clinic_visit`
5. On ANC visit finalization:
   - mark `ClinicVisit` completed if not already completed
   - update ANC enrollment summary from canonical attendance
   - create follow-up appointment from `next_visit_date`
   - run billing automation once

### Unified PNC Flow

Target flow for live traffic:

1. Add `route_to_pnc` action equivalent to ANC routing.
2. Route patient into a PNC clinic session via `ClinicVisit`.
3. Start consultation through the standard Clinics workflow to create an `Encounter`.
4. Save `PNCVisit` linked to:
   - `registration`
   - `encounter`
   - `clinic_visit`
5. On PNC visit finalization:
   - mark `ClinicVisit` completed
   - optionally update a PNC enrollment summary if the facility models PNC as enrolled care
   - preserve PNC billing behavior

## Rollout Strategy

### Stage 0: Readiness and Observability

Before behavior changes:

- add metrics for counts of:
  - `ANCVisit` without `clinic_visit`
  - `PNCVisit` without `clinic_visit`
  - `ClinicVisit` in ANC/PNC with no MCH clinical payload after completion
  - enrollment totals that differ from canonical visit counts
- add admin/report queries for reconciliation
- add feature flags:
  - `MCH_LINK_CLINIC_VISITS`
  - `MCH_DERIVE_ENROLLMENT_FROM_CLINIC_VISITS`
  - `MCH_ENFORCE_LINKED_VISITS`

This stage is zero-risk and should ship first.

### Stage 1: Link New Writes Only

Under `MCH_LINK_CLINIC_VISITS`:

- ANC save path requires or creates a `ClinicVisit` link.
- PNC save path requires or creates a `ClinicVisit` link.
- No existing data is mutated yet.
- Old MCH records remain valid with null links.

Implementation preference:

- if the user comes through queue flow, reuse the existing `ClinicVisit`
- if the user enters a legacy direct MCH form path, create a synthetic same-day `ClinicVisit` in the correct clinic session and mark it clearly as `source_module=MCH_ANC` or `MCH_PNC`

### Stage 2: Enrollment Dual-Write with Idempotency

Under `MCH_DERIVE_ENROLLMENT_FROM_CLINIC_VISITS`:

- when an ANC clinic visit is finalized, update `ClinicEnrollment` via the new service
- keep legacy `record_visit()` paths functional but idempotent
- add duplicate guards so the same visit cannot increment `total_visits` twice

Recommended duplicate guard:

- create a small attendance ledger table keyed by `clinic_visit_id`
- or store `last_counted_clinic_visit_id`/many-to-one relation in a dedicated audit model

Do not rely only on date-based deduplication.

### Stage 3: Backfill Existing Records

Backfill historical MCH visits into linked clinic visits and enrollment summaries in batches.

Do not enforce non-null links before this stage completes.

### Stage 4: Tighten Constraints

Only after successful backfill and stable production metrics:

- make `ANCVisit.clinic_visit` non-null for new records at serializer/service level
- consider database non-null and uniqueness enforcement later
- update reports and dashboards to use canonical attendance sources
- deprecate legacy direct counting paths

## Backfill Plan

### Principles

- backfill must be idempotent
- backfill must be reversible
- backfill must not trigger live billing or appointment signals
- backfill must preserve historical dates rather than stamping current timestamps

### Backfill Scope

Backfill these record families:

1. `ANCVisit` records with null `clinic_visit`
2. `PNCVisit` records with null `clinic_visit`
3. `ClinicEnrollment` attendance counters that do not match canonical linked visits

### Backfill Execution Unit

Use a management command, for example:

- `python manage.py backfill_mch_clinic_visits --module anc --dry-run`
- `python manage.py backfill_mch_clinic_visits --module pnc --from-date 2024-01-01`
- `python manage.py reconcile_clinic_enrollment_attendance --clinic-type ANC --dry-run`

Each command should support:

- dry run
- date range filters
- clinic filters
- limit/batch size
- resume cursor
- CSV/JSON report output

### Backfill Algorithm: ANCVisit to ClinicVisit

For each `ANCVisit` with null `clinic_visit`:

1. Identify patient, visit date, registration, and encounter.
2. Find ANC clinic in this order:
   - registration-linked `anc_enrollment.clinic`
   - active ANC clinic for the facility
   - explicit override map if multiple ANC clinics exist historically
3. Find or create `ClinicSession` for `visit_date` and clinic.
4. Look for an existing candidate `ClinicVisit` matching:
   - same patient
   - same session date
   - same clinic type `ANC`
   - same encounter if present, preferred
   - same source record already linked, preferred
5. If exactly one confident match exists, link it.
6. If no match exists, create a synthetic completed `ClinicVisit` with:
   - `session`
   - `patient`
   - `encounter` if present
   - `status="COMPLETED"`
   - `source="DIRECT"` or transitional `source_module="MCH_ANC"`
   - `visit_type="FOLLOW_UP"` unless visit number is 1, then `NEW`
   - `chief_complaint` derived from MCH context
   - `registered_at`, `consultation_started_at`, and `completed_at` synthesized from `visit_date`
7. Link `ANCVisit.clinic_visit`.
8. Emit reconciliation log entry.

### Backfill Algorithm: PNCVisit to ClinicVisit

For each `PNCVisit` with null `clinic_visit`:

1. Identify patient, visit date, registration, and encounter.
2. Find PNC clinic using a PNC-specific clinic resolver.
3. Find or create `ClinicSession` for `visit_date`.
4. Reuse an existing `ClinicVisit` only if confidence is high.
5. Otherwise create a synthetic completed `ClinicVisit` marked `source_module="MCH_PNC"`.
6. Link `PNCVisit.clinic_visit`.

### Timestamp Policy for Synthetic Visits

Backfill should not fake exact historical workflow timing if the source data does not contain it.

Recommended default:

- `registered_at = visit_date at 08:00 Africa/Nairobi`
- `consultation_started_at = visit_date at 08:15`
- `completed_at = visit_date at 08:30`

Also set a clear provenance note:

- `notes="Backfilled from ANCVisit {id} on 2026-03-08; timestamps synthetic"`

This prevents misleading downstream analytics.

### Enrollment Reconciliation Algorithm

For each ANC enrollment:

1. Count canonical attended visits:
   - linked `ClinicVisit` records for the same patient and ANC clinic with `status="COMPLETED"`
   - optionally constrain to visits linked from `ANCVisit` during transitional period
2. Compare against `total_visits`.
3. Set:
   - `total_visits = canonical_count`
   - `last_visit_date = max(completed_visit_date)`
   - `next_appointment = latest ANC clinical next visit date or existing future appointment logic`
4. Write only when there is a difference.
5. Log before/after values.

Do not increment counters during backfill; recompute them from canonical attendance.

## Signal and Automation Safety

### Do Not Trigger on Backfill

Backfill must bypass or explicitly disable:

- `auto_create_anc_visit_invoice`
- `auto_create_pnc_visit_invoice`
- `auto_create_anc_appointment`

Otherwise the backfill will create duplicate invoices and appointments.

Recommended approach:

- move signal logic into explicit domain services
- keep signals as thin wrappers for live writes only
- pass `skip_side_effects=True` in backfill services

### Target Service Split

Create explicit services such as:

- `create_anc_visit_live(...)`
- `create_pnc_visit_live(...)`
- `link_or_create_clinic_visit_for_mch_visit(...)`
- `finalize_program_attendance_from_clinic_visit(...)`

Signals should become wrappers around live service calls or be reduced where practical.

## UI and API Alignment Changes

### Clinic Dashboard

Current clinic dashboard logic is based on the queue endpoint for today only. It should be split:

- queue tab: today active queue only
- consultation tab: today `IN_CONSULTATION` visits from either dedicated endpoint or expanded queue endpoint
- completed tab: today completed clinic visits from a dedicated visit query

Do not use the active queue endpoint as the data source for completed-history tabs.

### MCH UI

MCH forms should stop bypassing clinic attendance for live consultations.

Preferred UX:

1. route to ANC/PNC queue
2. start consultation through clinic workflow
3. open linked ANC/PNC form in the encounter context
4. finalize clinical payload and complete operational visit

Legacy direct-entry forms may remain temporarily, but they should auto-create and link a synthetic `ClinicVisit`.

## Testing Plan

### Backend Tests

Add tests for:

- new ANC visit creates or links a `ClinicVisit`
- new PNC visit creates or links a `ClinicVisit`
- linked visit and encounter consistency
- enrollment counters derived exactly once from canonical attendance
- backfill is idempotent on rerun
- backfill does not create billing or appointments
- rollback command removes only backfilled links/records created by the batch

### Frontend Tests

Add tests for:

- clinic completed tab uses completed-visit query, not active queue query
- MCH ANC and PNC form flows carry linked `clinic_visit` identifiers
- queue routing into ANC and PNC opens the correct clinical form

### Data Validation Scripts

Ship read-only validators before enforcing constraints:

- `validate_mch_clinic_links`
- `validate_enrollment_attendance_counts`
- `validate_mch_encounter_consistency`

## Rollback Strategy

Every backfill batch must be reversible.

Store for each created synthetic `ClinicVisit`:

- batch id
- source module
- source record id
- created timestamp

Rollback command should:

1. unlink `ANCVisit.clinic_visit` and `PNCVisit.clinic_visit` created by that batch
2. delete only synthetic `ClinicVisit` rows created by that batch
3. recompute enrollment counters from remaining canonical data

Do not delete organically created live `ClinicVisit` rows during rollback.

## Proposed Delivery Phases

### Sprint 1: Observability and Link Fields

- add nullable `clinic_visit` links to ANC and PNC visits
- add provenance fields
- add reconciliation queries and dashboards
- no behavior changes yet

### Sprint 2: Live ANC Flow Unification

- require/link `ClinicVisit` on new ANC visit writes
- derive enrollment attendance from canonical ANC completion
- preserve existing billing and appointment services
- enable behind feature flag

### Sprint 3: Live PNC Flow Unification

- add `route_to_pnc`
- require/link `ClinicVisit` on new PNC visit writes
- preserve PNC billing behavior
- feature-flagged rollout

### Sprint 4: Historical Backfill

- dry run on staging snapshot
- reconcile ambiguous matches manually
- run production batch in date windows
- compare pre/post metrics

### Sprint 5: Constraint Tightening and UI Cleanup

- move clinic dashboards to canonical visit queries
- deprecate duplicate counting paths
- enforce stronger serializer and database constraints for new records

## Recommended Sequencing Decision

The safest sequence is:

1. unify live ANC writes first
2. then unify live PNC writes
3. then backfill history
4. then enforce constraints

This avoids mixing behavior changes and historical repair in the same release.

## Open Decisions

These must be settled before implementation:

1. Whether PNC should have its own `ClinicEnrollment` model usage or remain visit-only operationally.
2. How to resolve historical clinic selection when multiple ANC or PNC clinics existed.
3. Whether synthetic backfilled timestamps should be standardized or left null where analytics tolerates nulls.
4. Whether `ClinicVisit.source` should be extended or a separate provenance field should be added to avoid enum churn.

## Success Criteria

The unification is complete when:

- 100% of new ANC and PNC visits link to a `ClinicVisit`
- enrollment attendance counters match canonical completed visits
- clinic dashboards show accurate active and completed visits
- no duplicate billing or follow-up appointments are created
- historical backfill can be rerun safely without data drift

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
What this file is for:
- Actionable roadmap/checklist to harden cloud↔hub sync against FK, ordering, and schema-drift failures.

How to use it:
- Track implementation progress using the checklist items and acceptance criteria.

Supported inputs/args:
- N/A (documentation).
-->

# Sync Hardening Roadmap

This checklist turns recent hub sync failures into a repeatable hardening plan with clear acceptance criteria.

## 0) Stabilize Current Incident Window

- [ ] Deploy latest sync fixes to staging and hub hosts
  - Files: `backend/hmis/apps/core/sync_views.py`, `backend/hmis/apps/core/sync_materializer_core.py`, `backend/hmis/apps/core/sync_materializer_resolvers.py`, `backend/hmis/apps/core/sync_registry.py`
- [ ] Run clean pull + retry on hub
  - `python manage.py hub_sync --pull-only --full-pull`
  - `python manage.py hub_sync --retry-failed`
- [ ] Capture post-run metrics (required)
  - `pushed`, `pulled`, `pending`, `failed`
  - top 20 failure reasons (if any)

Acceptance criteria:
- No repeating FK storms for `Invoice`, `InvoiceItem`, `Payment`, `Diagnosis`, `LabOrder`, `ImagingOrder`, `Admission` after one retry cycle.

## 1) Sync Payload Contract Governance

- [ ] Define model-by-model required natural-key hints for every FK dependency
- [ ] Keep payload backward-compatible for at least two schema versions
- [ ] Add explicit policy: remote numeric PKs are advisory; natural keys are authoritative
- [ ] Document required hints in `docs/domain-events.md` or dedicated sync-contract appendix

Acceptance criteria:
- Any new sync model PR includes payload contract updates and tests for missing/partial hints.

## 2) Dependency Ordering and Scope Guarantees

- [ ] Maintain explicit full-pull dependency graph (`FULL_PULL_DEPENDENCIES`) for all strict FK models
- [ ] Ensure global reference models are always included in full pull scope
  - `encounters.ICD10Code`, `pharmacy.Drug`, `billing.ServiceCategory`, `billing.Service`, `clinical_templates.ClinicalTemplate`
- [ ] Add CI test for newly added model labels to assert dependency ordering coverage

Acceptance criteria:
- New registry labels cannot merge without passing dependency-order tests.

## 3) Materializer Resilience Rules

- [ ] Standardize nullable-FK fallback policy
  - Only nullable FKs may be nulled
  - Requires natural-key hints proving parent intent
  - Works for both `field` and `field_id` payload shapes
- [ ] Standardize deferred error code mapping
  - Use `DEPENDENCY_MISSING` for retryable dependency order issues
- [ ] Keep natural-key remappers tolerant to truncated descriptive hints (e.g., chief complaint)

Acceptance criteria:
- Retryable dependency failures become pending/deferred, not terminal failed, and recover after parent arrival.

## 4) CI Harness and Regression Net

- [ ] Run dedicated sync harness in CI (manual + nightly)
- [ ] Include these critical suites in harness:
  - `tests/core/test_sync_materializer.py`
  - `tests/core/test_sync_api.py::TestFullPullOrdering`
  - `tests/core/test_cloud_downward_sync.py`
- [ ] Add at least one fixture scenario with intentionally mismatched cloud/local PKs and expected natural-key remap

Acceptance criteria:
- Harness passes on `develop` and reports deterministic failures when a FK/remap regression is introduced.

## 5) Observability and Runbook Hardening

- [ ] Add structured per-table apply counters to sync logs
  - applied, deferred, failed (with reason buckets)
- [ ] Add runbook section for incident triage:
  - stale cursor reset
  - full pull restart
  - retry-failed cycle
  - scoped table pull for diagnosis
- [ ] Add dashboard panel / status endpoint fields for dependency-deferred counts

Acceptance criteria:
- Operators can identify top failing dependency chain within one run without deep log scraping.

## 6) Release Gate for Hub Tags

- [ ] Before each `hub-v*` tag, require:
  - targeted sync harness green
  - no unexplained increase in deferred/failed counts in staging full pull
- [ ] Keep release note template with:
  - changed dependency graph entries
  - remapper/fallback changes
  - migration/compatibility notes

Acceptance criteria:
- Every hub release has traceable sync-hardening validation evidence.

## Suggested Owners

- Backend lead: payload contract + materializer policy
- Platform/DevOps: CI harness + nightly run + artifacts
- QA: staged mismatched-PK scenarios + replay validation
- Release manager: enforce hub release gate checklist

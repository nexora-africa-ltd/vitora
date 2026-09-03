# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
<!--
What this file is for:
- Actionable implementation plan to fully support LIS standalone mode within Vitora HMIS.

How to use it:
- Use as the execution checklist for product, backend, frontend, QA, and DevOps teams.

Supported inputs/args:
- None (planning document).
-->

# LIS Standalone Mode Implementation Plan

## 1) Goal and Scope

### Goal
Deliver a production-ready **LIS Standalone Mode** inside the existing Vitora platform (no separate product/codebase), so laboratories can operate end-to-end without requiring full HMIS workflows.

### Non-goals
- Building a separate LIS application/repository.
- Replacing full HMIS workflows for integrated hospital deployments.

### Success Criteria (Release Gate)
- New deployments can choose `lis_standalone` profile and complete onboarding without manual DB intervention.
- Lab-only users can execute complete flow: registration -> order -> specimen -> analyzer/result entry -> verification -> release -> invoice/payment.
- External interoperability works for at least one inbound order channel and one outbound results channel.
- Analyzer operations include channel health, replay, and actionable failure diagnostics.
- Regression and contract tests pass for standalone APIs and UX-critical workflows.

---

## 2) Delivery Timeline (6 Weeks)

## Week 1: Profile + UX Foundation
- Define `lis_standalone` deployment profile and capability matrix.
- Add module gating and LIS-first navigation/layout.
- Implement standalone route guards and role presets.

## Week 2: Onboarding + Master Data
- Build LIS standalone setup wizard.
- Add CSV importers (test catalog, specimen types, analyzer mappings, reference ranges).
- Enforce setup completion checks before operational use.

## Week 3: External Interop (Inbound)
- Add inbound order ingestion (priority: API/HL7 adapter path used by target customers).
- Build patient/member ID crosswalk and dedupe safeguards.
- Add failed-message queue, retries, and audit trail.

## Week 4: External Interop (Outbound) + Reporting
- Add outbound result delivery (PDF/API/webhook baseline).
- Add report templates and release distribution rules.
- Add delivery status and reconciliation view.

## Week 5: Analyzer Operations Hardening
- Expand analyzer driver-template UX + custom profile editor.
- Add parser diagnostics, raw message inspector, and replay tool.
- Add channel monitoring, alerting, and runbook links.

## Week 6: Billing/Claims + UAT + Release Readiness
- Finalize LIS-only billing/payment workflows.
- Execute standalone UAT script + performance checks.
- Complete docs, training materials, and go-live checklist.

---

## 3) Workstreams and Actionable Backlog

## WS1: Deployment Profile and Capability Gating

### Tasks
- Add `lis_standalone` deployment mode in backend config/bootstrap.
- Enforce module availability matrix:
  - Enabled: laboratory, inventory/pharmacy hooks needed by lab billing, billing core.
  - Disabled/hidden: non-lab clinical modules unless explicitly toggled.
- Add frontend gate wrappers for LIS-only route tree.
- Add post-login redirect to LIS dashboard in standalone mode.

### Deliverables
- Config profile docs + env examples.
- Working LIS-only shell with clean navigation and no dead links.

### Acceptance Criteria
- User in standalone mode cannot access hidden modules via direct URL.
- Sidebar/top nav only contains standalone-relevant entries.
- Profile can be switched by environment/config without code edits.

---

## WS2: LIS Standalone Onboarding Wizard

### Tasks
- Build wizard steps:
  1. Facility/lab identity and licensing checks
  2. Test catalog setup (manual + CSV)
  3. Specimen and workflow setup
  4. Instrument/channel setup
  5. Price list and payer basics
  6. Team invitations + permissions
- Add completion guard middleware/banner similar to org onboarding enforcement.
- Add seeded defaults for small/medium/reference lab archetypes.

### Deliverables
- `/onboarding/lis-standalone` wizard flow.
- Import templates and validation feedback UI.

### Acceptance Criteria
- Fresh deployment reaches operational-ready status in <= 30 minutes using sample data.
- Wizard blocks go-live actions until required steps pass validation.

---

## WS3: External Interoperability (Inbound/Outbound)

### Tasks (Inbound)
- Implement/standardize inbound order intake endpoint(s) with idempotency key support.
- Support external patient identifiers and crosswalk table.
- Implement dead-letter queue + replay endpoint for failed inbound messages.

### Tasks (Outbound)
- Implement result push channels:
  - API callback/webhook
  - Downloadable PDF result package
  - Optional HL7/FHIR adapter path
- Add result delivery audit log and status tracking.

### Deliverables
- Inbound/outbound API contracts + examples.
- Message mapping config and validation tooling.

### Acceptance Criteria
- External order ingested -> appears in LIS queue with trace ID.
- Released result can be delivered through configured channel with observable status.
- Failed integrations are diagnosable and replayable without DB edits.

---

## WS4: Analyzer Integration and Diagnostics

### Tasks
- Extend driver template catalog management UI.
- Add custom analyzer profile wizard:
  - protocol
  - connection params
  - field mapping
  - unit/flag mapping
- Add raw message viewer + parser error explanation + replay harness.
- Add channel health dashboard cards (connected/disconnected, queue depth, error rate).

### Deliverables
- Analyzer operations page with diagnostics and replay actions.
- Improved runbook links from UI to troubleshooting docs.

### Acceptance Criteria
- Lab admin can configure a non-seeded analyzer without code changes.
- Failed parse events show clear root cause and next action.
- Replay tool can reprocess historical raw payloads safely.

---

## WS5: LIS-Only Billing and Commercial Workflows

### Tasks
- Ensure lab order -> invoice item creation works without full encounter dependency.
- Add payer and package rules focused on diagnostics.
- Add remittance/payment reconciliation views for lab context.
- Add printable receipts/invoices suitable for standalone labs.

### Deliverables
- LIS billing flow doc and UI updates.

### Acceptance Criteria
- Walk-in and referred patients both bill correctly in standalone mode.
- Financial reports reconcile released tests vs collected payments.

---

## WS6: QA, Compliance, and Release Readiness

### Tasks
- Add/extend automated tests:
  - standalone capability gating
  - onboarding completion enforcement
  - interop contract tests
  - analyzer diagnostics/replay behavior
- Add UAT script for LIS-only journeys.
- Add performance checks for message ingestion and result release SLA.
- Prepare release notes, admin guide, and training deck.

### Deliverables
- Test evidence pack.
- Go-live checklist and rollback plan.

### Acceptance Criteria
- All critical-path tests pass in CI.
- UAT sign-off by product + implementation leads.
- Operational runbook approved before rollout.

---

## 4) API and Data Model Enhancements

## Required Enhancements
- Add/confirm `deployment_mode` and module-capability payloads for frontend gating.
- Add external identifier crosswalk model for patient/order mapping.
- Add ingestion event model with status (`RECEIVED`, `MAPPED`, `FAILED`, `REPLAYED`).
- Add delivery log model for outbound results.
- Add analyzer parser event detail fields for troubleshooting context.

## Data Safety Requirements
- Tenant scoping mandatory (`FacilityScopedModel`/`OrganizationScopedModel`) for new operational data models.
- Audit logging on create/update/delete and result release actions.
- No encrypted PII fields in PowerSync streams.

---

## 5) Team Plan (Suggested Ownership)

## Product
- Finalize standalone capability matrix and priority interop channels.
- Approve onboarding flow and go-live criteria.

## Backend
- Profile gating, ingestion/delivery APIs, analyzer diagnostics/replay, billing adjustments.

## Frontend (web-app)
- LIS standalone shell/navigation, onboarding wizard, diagnostics UX, billing/reporting UX.

## QA
- Automated regression coverage and standalone UAT execution.

## DevOps
- Deployment presets, env templates, observability/alerts, rollback packaging.

---

## 6) Dependencies and Risks

## Key Dependencies
- Access to vendor interface docs/sample payloads for analyzer-specific onboarding.
- Client-side confirmation of required inbound/outbound channels.
- Environment/config readiness for standalone profile.

## Top Risks and Mitigations
- **Risk:** Scope creep into full HMIS features.
  - **Mitigation:** Strict backlog gate to LIS-only critical path.
- **Risk:** Integration variance by analyzer firmware/vendor implementations.
  - **Mitigation:** Replay tooling + configurable field mapping + pilot validation.
- **Risk:** Data quality mismatch from external systems.
  - **Mitigation:** Crosswalk mapping, idempotency, dead-letter queue + replay.

---

## 7) Go-Live Checklist

- Standalone profile enabled and validated in staging.
- Onboarding wizard completed for target facility.
- At least one analyzer channel tested end-to-end.
- Inbound/outbound interop smoke tests passed.
- Billing/reconciliation smoke tests passed.
- Monitoring alerts active (channel down, backlog spikes, delivery failures).
- Support runbook shared with implementation and support teams.

---

## 8) Immediate Next Actions (This Week)

- Finalize scope and lock WS1 + WS2 ticket breakdown.
- Create implementation tickets for each task above with owners and estimates.
- Start profile gating + navigation shell in parallel with onboarding wizard scaffolding.
- Confirm first pilot integration channel (API vs HL7) with commercial/implementation team.

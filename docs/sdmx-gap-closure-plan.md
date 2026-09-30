<!--
Purpose: Plan the work needed to close Vitora's SDMX interoperability gaps.
Use: Follow the phases in order after DHA/KHIS supplies its authoritative SDMX contract and sandbox access.
Inputs: DHA/KHIS dataflow, DSD, codelists, endpoint, authentication, and UAT fixtures.
-->
# SDMX Gap Closure Plan

**Status:** Proposed

## Goal

Evolve Vitora's current SDMX-ML 2.1 export/import support into a production-grade DHA/KHIS integration. The result must use an authoritative external dataflow and Data Structure Definition (DSD), validate payloads before delivery, retain submission evidence, and safely automate delivery where DHA/KHIS supports it.

This work applies to aggregate reporting only. It must not transmit patient-level data through SDMX.

## Current Position

Vitora currently supports:

- SDMX-ML 2.1 Structure-Specific Data export for quarterly, annual, and IDSR reports.
- Import of structure-specific and generic SDMX-ML benchmark data.
- User-triggered XML downloads and inbound benchmark imports.

The current implementation uses Vitora-owned identifiers and hard-coded defaults in `hmis/apps/quality/services/sdmx_service.py`. It does not yet consume an authoritative DHA/KHIS DSD and codelists, validate all values against that contract, submit to a national endpoint, or reconcile acknowledgements.

## Preconditions

Obtain and version-control the following DHA/KHIS integration artefacts before implementation:

1. SDMX REST endpoint and sandbox/base URLs.
2. Dataflow, agency, and version identifiers.
3. DSDs, content constraints, concept schemes, and codelists.
4. Indicator, facility, geography, disease, age, sex, frequency, and unit mappings.
5. Submission semantics for new, replacement, correction, and deletion payloads.
6. Authentication method, certificate/signature requirements, rate limits, and retry rules.
7. Sample accepted and rejected payloads plus UAT acceptance criteria.

Do not infer national codes or signing rules from the current local export format.

## Target Architecture

### Contract Configuration

Create organization-independent, platform-managed configuration models:

- `SDMXContract`: DHA/KHIS endpoint, dataflow ID, agency ID, DSD ID, version, receiver ID, authentication reference, enabled state, and effective dates.
- `SDMXCodelist`: cached authoritative codelist metadata with source URI, version, retrieved timestamp, and checksum.
- `SDMXCodeMapping`: mapping from Vitora indicator/facility/geography/disease values to authoritative SDMX codes.
- `SDMXSubmission`: immutable submission journal with payload digest, report reference, contract version, idempotency key, delivery state, remote acknowledgement, response body, timestamps, and retry count.

Store secrets only through the existing secret-management mechanism. Configuration records must contain secret references, never raw credentials, private keys, or bearer tokens.

### Payload Generation and Validation

Replace hard-coded `VITORA` agency and local DSD constants with the active `SDMXContract`. Use official codes rather than display names:

- Facility MFL code, not clinic name.
- Official geography code, not county display name.
- DHA/KHIS-approved disease and indicator codes, not internal labels.
- Contract-prescribed frequency, period, unit, and observation attributes.

Validate every outbound payload in this order:

1. Verify report completeness and local reporting rules.
2. Validate XML against the SDMX 2.1 XSD.
3. Validate dimensions, attributes, and values against the active DSD, codelists, and constraints.
4. Persist the payload and SHA-256 digest before attempting delivery.
5. Submit only if all validation stages pass.

### Delivery and Reconciliation

Use an outbox-backed Celery task for delivery. It must:

1. Submit an immutable generated payload with the contract-prescribed authentication.
2. Use an idempotency key derived from the report, contract version, revision, and payload digest.
3. Persist request metadata, remote acknowledgement/reference, and normalized rejection details.
4. Retry only transient failures with bounded exponential backoff.
5. Require an explicit new revision for corrected/replaced reports; never silently overwrite a previously accepted submission.
6. Publish domain events and audit all generation, validation, submission, retry, acceptance, rejection, and correction actions.

## Nexora Platform UI

Yes. Provide a dedicated UI for Nexora platform staff who are Django superusers. Tenant organization administrators must not be able to alter national integration contracts, endpoints, mappings, or credentials.

### Access Control

- Route: `/admin/platform/sdmx-contracts` in the web application.
- Backend: platform-superuser-only permission, independent of tenant role permissions.
- Django `/admin/` remains restricted to Nexora superusers under the existing admin-access middleware.
- Every read and write action is audit logged with the contract ID and affected version.

### Screens

1. **Contracts list**
   - Active/inactive status, partner, dataflow, DSD version, endpoint environment, last successful delivery, and health status.
   - No secrets or raw authentication material displayed.

2. **Contract detail and editor**
   - Dataflow/DSD identifiers, base URL, receiver, effective dates, delivery policy, and secret reference.
   - Draft, validated, active, retired lifecycle. Only one active contract per partner/dataflow/environment.
   - "Validate against sandbox" action that performs a non-destructive contract connectivity check.

3. **Codelists and mappings**
   - Import/refresh approved codelists from DHA/KHIS.
   - Searchable mapping tables with unmapped and obsolete-value warnings.
   - CSV review/export is allowed; bulk import requires dry-run validation and a confirmation step.

4. **Submission monitor**
   - Filter by contract, facility, report type, period, status, and remote reference.
   - Show validation failures and remote rejection details without exposing protected health information.
   - Allow authorized retry of transient failures and generation of correction revisions; never allow editing an immutable delivered payload.

5. **Readiness dashboard**
   - Contract validity, codelist freshness, unmapped value count, pending/rejected submissions, recent delivery success rate, and sandbox/UAT status.

### Facility-Level Enablement

Nexora staff configure the national contract globally, then explicitly enable it per facility after mapping readiness is confirmed. The facility UI is read-only for contract details and shows:

- Reporting dataflow and DSD version in use.
- Whether the facility has required MFL and geography mappings.
- Submission readiness and recent delivery status.
- A link to request support, rather than an ability to change the national contract.

## Phased Delivery

### Phase 0: Contract Discovery

- Obtain DHA/KHIS artefacts and sandbox credentials.
- Confirm whether the target accepts SDMX Structure-Specific Data, Generic Data, or another SDMX representation.
- Agree delivery acknowledgement, correction, and operational-support workflows.
- Record the acceptance criteria in this document and automated test fixtures.

### Phase 1: Configuration and Mapping

- Add platform-scoped models, migrations, serializers, and platform-superuser API endpoints.
- Build the Nexora contract, codelist, mapping, and readiness UI.
- Add mapping completeness checks and controlled codelist refresh.
- Keep existing file-download exports unchanged during this phase.

### Phase 2: Contract-Aware Generation

- Refactor the export service to resolve a versioned active contract.
- Generate code-based dimensions and attributes from approved mappings.
- Add XSD and DSD/codelist validation.
- Add fixture-based tests for DHA/KHIS accepted and rejected payloads.

### Phase 3: Automated Delivery

- Add the immutable submission journal, outbox task, idempotency, retries, and acknowledgement parsing.
- Gate automated delivery behind per-facility enablement and a feature flag.
- Add submission monitoring, alerting, reconciliation, and audit/event wiring.

### Phase 4: UAT and Production Rollout

- Run DHA/KHIS sandbox UAT using real facility mapping data.
- Enable one pilot facility first and reconcile each delivery.
- Expand by facility only after acceptance, operational sign-off, and support-runbook validation.

## Testing and Acceptance

Minimum automated coverage:

- Contract lifecycle and superuser-only authorization.
- Mapping uniqueness, effective-date rules, and unmapped-value blocking.
- XML/XSD validation and DSD/codelist constraint failures.
- Payload golden tests supplied by DHA/KHIS.
- Idempotent delivery, transient retry, permanent rejection, and correction workflow tests.
- Tenant/facility scoping tests for submission visibility.
- Audit-log and domain-event publication tests.

Production acceptance requires DHA/KHIS UAT evidence for the configured dataflow, not only local unit tests.

## Documentation Corrections

Update `docs/sdmx-implementation.md` to consistently describe the current output as SDMX-ML 2.1 Structure-Specific Data. The service emits `StructureSpecificData`; it is not currently a generic-data exporter. Update `docs/dha-compliance.md` to reflect the completed base SDMX capability and this remaining national-contract integration work.

## Estimated Effort

| Workstream | Estimate |
|---|---:|
| Contract discovery and UAT artefact collection | External dependency |
| Platform configuration, codelists, mappings, and UI | 1-2 weeks |
| Contract-aware generation and validation | 1-2 weeks |
| Delivery outbox, reconciliation, monitoring, and alerts | 2-3 weeks |
| DHA/KHIS sandbox UAT and phased rollout | External dependency |

Expected engineering effort is 4-7 weeks after DHA/KHIS supplies the authoritative contract and sandbox access. The rollout is non-breaking because the existing downloadable SDMX export remains available until automated delivery is enabled per facility.

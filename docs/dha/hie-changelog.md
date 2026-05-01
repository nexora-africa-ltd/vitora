# DHA HIE: Changelog

> **Source**: [DHA Health Information Exchange](https://hie-docs.dha.go.ke)
> **Scraped**: 2026-05-01 21:01 UTC
> **Purpose**: Offline reference for Vitora HMIS SHA integration

---

## API Changelog

> Source: [https://hie-docs.dha.go.ke/changelog](https://hie-docs.dha.go.ke/changelog)

# API Changelog


All notable changes to the HIE API will be documented in this file.


The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased] - 2026-04-24 (2)


### Changed


- `POST /api/v1/claims/visit` — now documents two distinct visit creation strategies: **OTP** (provide `otp` along with `intervention_codes`, `patient_id`, and `service_type`) and **Biometrics** (provide `auth_guid` — the authorization identifier from a preceding biometric authorization — in place of `otp`).


## [Unreleased] - 2026-04-24


### Changed


- `POST /api/v1/claims/authorize` — now documents two distinct authorization strategies: **OTP** (phone-based one-time password, requires `patient_id`, `service_type`, `otp`, and `interventions`) and **Biometrics** (eKYC or fingerprint via a registered hardware agent, requires device and agent context fields). Select the appropriate strategy based on the patient's consent method.
- `GET /api/v1/claims/authorizations` — lookup parameters (`token`, `beneficiary_code`, `guid`) are now passed as **query parameters** instead of a request body.


## [Unreleased] - 2026-04-23


### Changed


- `GET /api/v1/patients/benefits` — now accepts two optional query parameters: `fields` (comma-separated list of fields to include in the response, e.g. `parent_benefit,parent_benefit_code`) and `is_unique_benefit` (boolean to filter to unique benefits only).
- `GET /api/v1/patients/benefits/interventions` — now requires a `sub_benefit_code` query parameter alongside `patient_id`; the endpoint returns the interventions for the given sub-benefit instead of all interventions across benefits.
- `POST /api/v1/patients/otp-whitelists` — request body accepts new optional `facility_fr_code` and `facility_fr_type` identifiers for the facility raising the whitelist request.
- `POST /api/v1/patients/otp` (Send OTP) — request body accepts an optional `contact_id` to target a specific patient contact for OTP delivery.
- `POST /api/v1/claims/visit` — request body extended with device/biometrics context (`auth_guid`, `device_id`, `device_name`, `is_biometrics`, `request_user_national_id`, `workstation_id`). The inpatient-only `admission_date` and `estimated_days_of_admission` fields have been removed; only `intervention_codes`, `patient_id`, and `service_type` are now required.
- `POST /api/v1/claims/doctor-consent` — request body now accepts `practitioner_registration_number`; only `intervention_code` and `request_type` remain required.
- `POST /api/v1/claims/lines/edit` and `POST /api/v1/claims/lines/resubmit` — the line identifier is now `line_id` (previously `claim_line_id`).
- `GET /api/v1/patients/benefits` response — the top-level object is now a paginated envelope (`count`, `currentPage`, `endIndex`, `next`, `pageSize`, `previous`, `results[]`, `startIndex`, `totalPages`) wrapping an array of benefit records. Existing consumers reading benefits directly off the response root must now read them from `results[]`.
- `GET /api/v1/claims/preview/payer` response — restructured to a paginated envelope (`pageSize`, `results[]`) wrapping payer-claim previews.
- `GET /api/v1/patients/eligibility` response — coverage shape changed: added `age`, `dateOfBirth`, `gender`, `schemes`, `statusCode`, `statusDesc`, `whitelistedForOTP`; removed legacy coverage fields (`contributionHistory`, `coverageEndDate`, `coverageStartDate`, `coverageType`, `dependants`, `employerDetails`, `memberType`, `primaryContributor`, and related status/reason fields).
- Preauth request payloads (`POST /api/v1/preauths` and related) — now accept detailed clinical context fields for specialised preauths (anaesthesia, carcinoma staging, chief complaint, clinical indications, comorbidity, HPI, investigations, optical lens/frame details, oncology metastases, renal session scheduling, replacement flags, treatment setting, vital signs).
- Interventions response across claims and patients endpoints — tariff fields renamed from snake_case (`level_2_tariff`, `fallBackLevel_2_tariff`) to camelCase (`level2Tariff`, `fallBackLevel2Tariff`); additional document-type fields (`applicableDocumentTypes`, `optionalPreauthDocumentTypes`, `requiredPreauthDocumentTypes`) added.
- Claim previews and interventions — now expose `authorization_code`, `workflow_state`, and preauth-requirement flags (`requires_oncology_preauth`, `requires_optical_preauth`, `requires_radiology_preauth`, `requires_renal_preauth`, `needs_preauth`, and associated document-type lists).
- Invoices — added `edi_invoice_guid`; removed the legacy `invoice_copays` collection.
- Preauth responses — the legacy internal `replicated` flag has been removed from preauth-related resources (Contact, Preauth, PreauthAttachment, PreauthDiagnosis, PreauthDoctor, PreauthItem, PreauthNote).
- Preauth authorization details — removed internal SHR push-tracking fields (`lastSuccessfulPushToShr`, `lastSuccessfulResponseFromShr`, `lastUnsuccessfulPushToShr`, `lastUnsuccessfulResponseFromShr`, `sentToShr`, `shrPushRetryCount`, `replicated`, `beneficiaryJoinDate`, `authAttachments`, `authorizationNotes`, `payerAuthorization`). Doctor profiles in preauth responses now expose `currencyCode`, `nationalIdentifier`, `suspended`, and `suspensionReason` in place of the legacy operational/institutional fields.


## [Unreleased] - 2026-04-07


### Added


- `GET /api/v1/patients/contacts` — Retrieve contacts associated with a patient
- `GET /api/v1/claims/authorizations` — Retrieve authorizations for a claim
- `POST /api/v1/claims/authorize` — Authorize a claim
- `POST /api/v1/claims/interventions/switch` — Switch an active intervention to a different one
- `GET /api/v1/patients/benefits/utilization` — Retrieve fund utilization details for a beneficiary
- `GET /api/v1/patients/sub-benefits` — Retrieve sub-benefits for a beneficiary
- `GET /api/v1/patients/pomsf-balances` — Retrieve POMSF balances for a beneficiary
- `POST /api/v1/uploads` — Upload a file attachment
- `GET /api/v1/uploads/{file_id}` — Retrieve a previously uploaded file
- `GET /clinical/document-bundles/{id}` — Retrieve a clinical document bundle
- `POST /clinical/document-bundles/{id}/pdf` — Generate a PDF rendition of a document bundle
- `GET /clinical/document-bundles/{id}/render` — Render a document bundle for display
- `GET /clinical/document-references` — List document references
- `GET /clinical/document-references/{id}` — Retrieve a document reference by ID
- `GET /clinical/encounters/{id}/$everything` — Retrieve all clinical resources associated with an encounter
- `POST /clinical/fhir/bundle` — Submit a FHIR bundle for processing
- `POST /clinical/html-to-pdf` — Convert an HTML document to PDF
- `GET /clinical/icd11/search` — Search ICD-11 diagnosis codes
- `POST /clinical/lab/expand-panel` — Expand a lab panel into its component tests
- `GET /clinical/loinc/search` — Search LOINC clinical terminology codes
- `POST /clinical/medication-dispenses` — Record a medication dispense event
- `GET /clinical/medication-request` — List medication requests
- `PATCH /clinical/medication-request/{id}` — Partially update a medication request
- `GET /clinical/ocl/orgs/{org}/collections/{collection}/concepts/search` — Search concepts within an OCL collection
- `GET /clinical/ocl/orgs/{org}/sources/{source}/concepts` — List concepts from an OCL source
- `GET /clinical/questionnaire/{id}` — Retrieve a questionnaire by ID
- `POST /clinical/questionnaire-response/bulk` — Submit multiple questionnaire responses in a single request
- `POST /clinical/questionnaire-response/submit` — Submit a completed questionnaire response
- `PUT /clinical/questionnaire-response/{id}` — Replace a questionnaire response
- `POST /clinical/questionnaire-response/{id}/finalize` — Finalize a submitted questionnaire response
- `POST /clinical/questionnaire-response/{id}/preview` — Preview a questionnaire response before submission
- `GET /clinical/service-requests` — List service requests
- `POST /clinical/service-requests` — Create a new service request
- `GET /clinical/service-requests/{id}` — Retrieve a service request by ID
- `PUT /clinical/service-requests/{id}` — Replace a service request
- `DELETE /clinical/service-requests/{id}` — Delete a service request
- `PATCH /clinical/service-requests/{id}` — Partially update a service request


### Changed


- `POST /api/v1/claims/attachments` — Now accepts file uploads via multipart form instead of JSON
- `POST /api/v1/claims/emergency/protocols` — Now accepts file uploads via multipart form instead of JSON
- `POST /api/v1/claims/lines` — Now accepts file uploads via multipart form instead of JSON
- `PATCH /clinical/allergyintolerance/{id}` — Now supports partial updates via PATCH
- `PATCH /clinical/appointments/{id}` — Now supports partial updates via PATCH
- `PATCH /clinical/observations/{id}` — Now supports partial updates via PATCH


## [1.1.0] - 2026-01-30


### Added


- **Preauth Polymorphism**: Enabled polymorphic request support for `POST /api/v1/preauths`, allowing submission of various preauthorization types (Normal, Surgical, Renal, Oncology, Optical, Imaging, Dental) via `multipart/form-data`.
- **Preauth Schemas**: Added specialized request schemas for all preauthorization types.


### Changed


- **Metadata Harmonization**: Updated summaries, descriptions, and tags for over 25 endpoints in Claims, Emergency, Interventions, and Patients services to align with legacy API documentation standards.
- **Tag Alignment**: Standardized tags across the eClaims and Preauth API (e.g., `Billing`, `Claim Dispatch`, `Emergency`, `Preauths`, `Eligibility`) to match the `openapi.json` definitions.
- **Parameter Preservation**: Harmonized metadata while explicitly preserving the new API's parameter structure, ensuring no breaking changes to request signatures.


### Fixed


- **API Validation**: Fixed a missing path parameter definition in `api_v1_preauths_diagnoses_{icd_code}.json`.
- **Tag Inconsistencies**: Corrected generic `Claims` tags to more specific functional categories (e.g., `Start Visit Consent`, `Claim Dispatch`, `Billing`).


## [1.0.0] - 2025-12-11


### Added


- **New Endpoints**:

/api/v1/patients/eligibility (Check Eligibility)
/api/v1/patients/benefits (Get Benefits)
/api/v1/claims/otp-discharge (Discharge OTP)
/api/v1/claims/discharge (Discharge Patient)
- **Metadata Restoration**: Restored legacy descriptions, tags, and parameters for 19 endpoints to ensure backward compatibility.


### Changed


- **Directory Structure**:

Migrated all OAS components to apis/components.
Updated all $ref paths to point to the new shared components location.
- **Endpoint Updates**:

/api/v1/patients/sub-benefits: Restored legacy parameters (beneficiary_cr_id, applicable_schemes, facility_id, search).


### Fixed


- **Bundling**: Fixed schema resolution errors during the bundling process by restoring missing legacy schemas.
- **Schema References**: Corrected broken `$ref` paths in multiple endpoint files.


### Removed


- **Unused Schemas**: Deleted 113 unused schema files to clean up the codebase.
- **Temporary Directories**: Removed `HIE-Middlewar-OAS` directory after migration.

Last modified on
April 30, 2026

---

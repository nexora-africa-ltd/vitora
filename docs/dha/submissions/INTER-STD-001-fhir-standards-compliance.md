<!-- Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: Controlled DHA laboratory procedure and evidence checklist for INTER-STD-001 FHIR standards compliance.
Use: Run after deployment with DHA-only synthetic resources in staging facility 13; attach only sanitized captures and validator reports.
Inputs: DHA reader JWT, patient 402 resource IDs, and HAPI_FHIR_BASE_URL available inside the staging API container.
-->

# INTER-STD-001 — FHIR R4 Standards Compliance

## Submission endpoint

| Item | Value |
| --- | --- |
| Endpoint title | Retrieve DHA synthetic FHIR DiagnosticReport |
| Method | `GET` |
| URL | `https://staging-api.vitora.digital/fhir/DiagnosticReport/<DIAGNOSTIC_REPORT_ID>` |
| Headers | `Authorization: Bearer <DHA reader JWT>`, `X-Facility-ID: 13`, `Accept: application/fhir+json` |
| Expected response | `200 OK`, `application/fhir+json`, FHIR R4 `DiagnosticReport` |

The submitted DiagnosticReport must reference only DHA synthetic data for patient `402` in facility `13`. It must include a LOINC-coded report `code` and reference LOINC-coded Observation results.

## Validation authority

Vitora's `FHIRValidator` is a local **R4B structural screening** layer only. The authoritative validation for this DHA test is the configured **HAPI FHIR R4 (4.0.1)** container application's `$validate` operation. This prevents the R4B Python models from being represented as R4 4.0.1 profile validation.

HAPI's validator must be reachable from the staging API container through `HAPI_FHIR_BASE_URL` and return a FHIR `OperationOutcome`. Do not include HAPI credentials, internal addresses, or non-synthetic content in the evidence package.

## Lab procedure

1. Seed DHA-only patient `402`, one encounter, one LOINC-mapped laboratory test/result, and its final DiagnosticReport in facility `13`. Select and persist the LOINC code using the configured terminology workflow before producing the result.
2. Retrieve and save sanitized FHIR JSON for:
   - `/fhir/Patient/402`
   - `/fhir/Encounter/<ENCOUNTER_ID>`
   - `/fhir/Observation/<OBSERVATION_ID>`
   - `/fhir/DiagnosticReport/<DIAGNOSTIC_REPORT_ID>`
3. Confirm the DiagnosticReport contains:
   - `resourceType: "DiagnosticReport"`
   - a valid FHIR report `status`
   - `code.coding` with `system: "http://loinc.org"` and the persisted LOINC code
   - `subject.reference` to patient `402`
   - `result` references to its Observation resources.
4. From the staging API container, validate each saved resource against HAPI FHIR R4:

   ```bash
   curl --silent --show-error --fail \
     --header 'Content-Type: application/fhir+json' \
     --header 'Accept: application/fhir+json' \
     --request POST "${HAPI_FHIR_BASE_URL}/DiagnosticReport/\$validate" \
     --data-binary @diagnostic-report-<ID>.json | jq .
   ```

   Use the matching resource type in the `$validate` URL for Patient, Encounter, and Observation. Retain each returned `OperationOutcome`; none may contain an `error` or `fatal` issue.
5. Demonstrate malformed-resource handling with a DHA synthetic request that omits required DiagnosticReport data. Retain the `400` FHIR `OperationOutcome`, with no patient data beyond the synthetic identifier.
6. Retest the submitted GET endpoint externally with the DHA reader account. It must return `200` within 30 seconds.

## CapabilityStatement

`GET /fhir/metadata` declares FHIR R4 `4.0.1` and only advertises FHIR interactions that Vitora implements. Update and delete are intentionally not advertised for the DHA export scope. Their absence is not an INTER-STD-001 blocker.

## Evidence package checklist

- [ ] Sanitized FHIR R4 Patient response.
- [ ] Sanitized FHIR R4 Encounter response.
- [ ] Sanitized FHIR R4 Observation response with LOINC coding.
- [ ] Sanitized FHIR R4 DiagnosticReport response with LOINC coding and linked Observation references.
- [ ] HAPI R4 `$validate` OperationOutcome for all four resources.
- [ ] Malformed DiagnosticReport `400` OperationOutcome capture.
- [ ] Automated test report covering DiagnosticReport structural validation, coded export, read/search, and malformed input handling.
- [ ] Sanitized CapabilityStatement capture from `/fhir/metadata`.
- [ ] SHA256 manifest generated only after the final artifacts and approvals are complete.

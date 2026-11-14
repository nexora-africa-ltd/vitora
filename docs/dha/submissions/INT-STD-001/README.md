<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: Controlled DHA INTER-STD-001 FHIR R4 evidence package.
Use: Attach the listed artifacts to the DHA portal after approval; all resources use DHA synthetic patient 402 in facility 13.
Inputs: None. Files are captured output from the staging validation run and local automated test run.
-->

# INTER-STD-001 — FHIR R4 Standards Compliance Evidence

## Submitted endpoint

```text
GET https://staging-api.vitora.digital/fhir/DiagnosticReport/402
```

Use the DHA reader JWT, `X-Facility-ID: 13`, and `Accept: application/fhir+json`.

## Evidence index

| Artifact | Purpose |
| --- | --- |
| `patient.json` | Synthetic FHIR R4 Patient export. |
| `encounter.json` | Synthetic FHIR R4 Encounter export. |
| `observation.json` | Synthetic FHIR R4 laboratory Observation export with LOINC `58410-2`. |
| `diagnostic-report.json` | Synthetic FHIR R4 DiagnosticReport export linked to Observation `402`. |
| `*-operation-outcome.json` | HAPI FHIR R4 `4.0.1` `$validate` results for each export. |
| `validation-report.json` | Controlled validation summary; `passed: true`. |
| `malformed-diagnostic-report-operation-outcome.json` | Staging application malformed-resource capture: missing `DiagnosticReport.code` returns `400` FHIR OperationOutcome. |
| `capability-statement.json` | Staging CapabilityStatement capture declaring FHIR R4 `4.0.1`. |
| `automated-test-report.txt` | Targeted automated test execution report: 215 passed. |

## Validation result

The validation command completed successfully against the private HAPI FHIR R4 `4.0.1` validator. Informational and best-practice warnings are retained verbatim in the HAPI artifacts; no resource has an `error` or `fatal` validation issue.

Do not add checksum manifests until the package receives its required review and approval.

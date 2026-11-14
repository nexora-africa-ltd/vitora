<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for INTER-TERM-001 Standard Terminology Usage.
Use: Attach the referenced synthetic staging evidence to the DHA portal after confirming the endpoint remains available.
Inputs: Facility 13 and the artifacts in inter-term-001/.
-->

# INTER-TERM-001 — Standard Terminology Usage

**Priority:** High
**Test method:** Live System Test
**Status:** **Ready for portal submission** — Facility 13 terminology verification captured on 14 November 2026.

## Capability statement

Vitora provides searchable, coded clinical terminology at point of care and validates the DHA-required standards through one authenticated, facility-contextualized endpoint:

| Use case | Standard | Demonstrated code |
| --- | --- | --- |
| Diagnosis entry and clinical export | ICD-11 MMS | `BA00` — Essential hypertension |
| Clinical-term search and diagnosis support | SNOMED CT | `38341003` — Hypertensive disorder |
| Laboratory test assignment and lab exchange | LOINC | `57021-8` — CBC W Auto Differential panel - Blood |

The diagnosis entry control presents ICD-11 and SNOMED CT search. The laboratory catalogue stores LOINC code, system, owner, source, retrieval timestamp, version, and checksum for each selected lab test mapping.

## DHA portal endpoint submission

| Portal field | Value |
| --- | --- |
| Endpoint title | `Verify DHA standard terminology usage — INTER-TERM-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/terminology/standard-usage/` |
| Authentication | Bearer JWT via DHA clinician pre-request script |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK`, `passed: true`, and valid ICD-11, SNOMED CT, and LOINC entries |

The endpoint is fail-closed: if any required terminology cannot be resolved, it returns `503` and `passed: false`.

## Live Facility 13 result

```json
{
  "passed": true,
  "facility": { "id": 13, "name": "DHA Certification Test Facility" },
  "standards": {
    "icd11": { "code": "BA00", "version": "2026-01", "valid": true },
    "snomed_ct": { "code": "38341003", "version": "20261030", "valid": true },
    "loinc": { "code": "57021-8", "version": "2.83", "valid": true }
  }
}
```

## Pre-test checklist mapping

| DHA requirement | Evidence |
| --- | --- |
| ICD-11 lookup functional on diagnosis entry | `DiagnosisCodeInput` uses `ICD11Select`; the endpoint verifies ICD-11 `BA00` and its description. |
| SNOMED CT search functional | `DiagnosisCodeInput` exposes SNOMED CT search; the staging verification resolves `38341003`. |
| LOINC lab assignment demonstrable | Active Facility 13 test `DHA-TERM-CBC` is assigned LOINC `57021-8`. |
| Current code-set versions | ICD-11 `2026-01`, SNOMED CT `20261030`, and LOINC `2.83` are captured in the response. |
| Codes and descriptions map correctly | `standard-usage-response.json` records all three exact code/display pairs. |

## Captured attachments

| Attachment | Evidence |
| --- | --- |
| `inter-term-001/standard-usage-response.json` | Successful Facility 13 live terminology endpoint response. |
| `inter-term-001/facility-13-loinc-assignment.json` | Active synthetic Facility 13 lab test and its LOINC assignment. |
| `inter-term-001/automated-test-report.txt` | Targeted terminology endpoint, SNOMED, and source-binding tests. |
| `inter-term-001/README.md` | Evidence-package usage and standard/source summary. |
| `inter-term-001/SHA256SUMS.txt` | Integrity hashes for the frozen package. |

## Final portal checklist

1. Immediately before submission, verify the endpoint returns `200 OK` and `passed: true` with `X-Facility-ID: 13`.
2. Upload the listed evidence artifacts and `SHA256SUMS.txt`.
3. Use the DHA clinician pre-request script; do not upload a token or any real patient data.

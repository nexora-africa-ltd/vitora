<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for INTER-SEM-001 Semantic Interoperability.
Use: Attach the referenced synthetic staging evidence to the DHA portal after confirming the endpoint remains available.
Inputs: Facility 13, Patient 402, Encounter 402, and the artifacts in inter-sem-001/.
-->

# INTER-SEM-001 — Semantic Interoperability

**Priority:** High
**Test method:** API / integration
**Status:** **Ready for portal submission** — synthetic facility-scoped exchange and independent HAPI peer read-back captured on 14 November 2026.

## Capability statement

Vitora accepts facility-scoped FHIR R4 clinical data and preserves coded semantics across inbound persistence, outbound export, and an independent HAPI FHIR R4 peer exchange:

| Clinical domain | Standard preserved | Synthetic evidence |
| --- | --- | --- |
| Diagnosis | ICD-11 MMS `BA00` | Condition `220` |
| Procedure | ICHI `LZZ.JG.AH` | Procedure `4` |
| Laboratory result | LOINC `58410-2`, UCUM `g/dL`, interpretation `H` | Observation `96` |

All evidence uses DHA-only synthetic data for Patient `402`, Encounter `402`, and Facility `13`.

## DHA portal endpoint submission

| Portal field | Value |
| --- | --- |
| Endpoint title | `Retrieve DHA synthetic ICHI-coded procedure — INTER-SEM-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/fhir/Procedure/4` |
| Authentication | Bearer JWT via DHA clinician pre-request script |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK` with ICHI `LZZ.JG.AH`, Patient `402`, and Facility-scoped authorization |

Supporting bidirectional exchange endpoints:

```text
POST /fhir/Condition/     ICD-11 inbound
POST /fhir/Procedure/     ICHI inbound
POST /fhir/Observation/   LOINC/UCUM/interpretation inbound
GET  /fhir/Condition/220
GET  /fhir/Procedure/4
GET  /fhir/Observation/96
```

## External-system validation

Vitora sent the synthetic Patient, Encounter, Condition, Procedure, and Observation to the independent private HAPI FHIR R4 `4.0.1` peer. The peer accepted each resource (`201 Created`), returned each clinical resource on read-back, and preserved the ICD-11, ICHI, and LOINC coding arrays exactly.

## Captured attachments

| Attachment | Evidence |
| --- | --- |
| `inter-sem-001/inbound-exchange-capture.json` | Successful facility-scoped FHIR writes into Vitora. |
| `inter-sem-001/condition.json` | Returned ICD-11 Condition export. |
| `inter-sem-001/procedure.json` | Returned ICHI Procedure export. |
| `inter-sem-001/observation.json` | Returned LOINC, UCUM, and interpretation Observation export. |
| `inter-sem-001/*-operation-outcome.json` | HAPI R4 `$validate` results for each export. |
| `inter-sem-001/validation-report.json` | Authoritative HAPI validation summary: passed. |
| `inter-sem-001/hapi-peer-exchange.json` | HAPI peer create/read-back comparison: semantic codings preserved. |
| `inter-sem-001/capability-statement.json` | Live staging FHIR R4 `4.0.1` CapabilityStatement. |
| `inter-sem-001/automated-test-report.txt` | Targeted backend and semantic exchange tests: 127 passed. |
| `inter-sem-001/SHA256SUMS.txt` | Integrity checksums for the frozen attachment set. |

## Final portal checklist

1. Verify the submitted Procedure endpoint returns `200 OK` with `X-Facility-ID: 13` immediately before submission.
2. Upload the listed evidence artifacts and checksum manifest.
3. Attach a contemporaneous screenshot of the Procedure catalogue showing the approved ICHI mapping if the portal requires visual evidence.
4. Use the DHA clinician pre-request script; never submit a live token or any real patient data.

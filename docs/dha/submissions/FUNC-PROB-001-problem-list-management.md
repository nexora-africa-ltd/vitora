<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for FUNC-PROB-001 Problem List Management and terminology compliance.
Use: attach this document and the required live screenshots to the DHA portal row.
Inputs: DHA clinician pre-request script, X-Facility-ID 13, synthetic encounter 402, and diagnosis 219.
-->

# FUNC-PROB-001 — Problem List Management

**Priority:** High
**Test method:** Live System Test
**Status:** Endpoint validated on DHA staging

## Endpoint submission

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic coded patient problem list — FUNC-PROB-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/encounters/402/diagnoses/` |
| Authentication type | Bearer JWT |
| Authentication token field | `{{vitora_dha_clinician_access_token}}` |
| Pre-request behavior | The attached clinician pre-request script obtains, caches, and refreshes this variable. |
| Tenant header | `X-Facility-ID: 13` |
| Expected result | `200 OK`, paginated JSON diagnosis/problem-list payload |
| Verified response time | `2.64 seconds` on 04 November 2026; DHA requirement is under 30 seconds |

## Sanitized sample response

```json
{
  "id": 219,
  "encounter": 402,
  "icd11_code": "1F40",
  "icd11_display": "Malaria",
  "snomed_code": "6142004",
  "snomed_display": "Malaria",
  "diagnosis_type": "PRIMARY",
  "is_confirmed": true,
  "certainty": "confirmed"
}
```

## Capability demonstrated

The endpoint proves that Vitora stores and retrieves a patient problem/diagnosis with:

- Encounter linkage and history context
- ICD-11 code and display text
- SNOMED CT code and display text
- Primary/problem classification and confirmed status

## Supporting evidence to attach

1. This document.
2. OpenAPI schema: `https://staging-api.vitora.digital/api/schema/`.
3. Swagger UI: `https://staging-api.vitora.digital/api/docs/`.
4. Screenshot of diagnosis entry showing the malaria code lookup and selected standard terminology.
5. Screenshot showing status update from active/working to resolved, with problem history visible.
6. Automated regression coverage for diagnosis creation, validation, and retrieval.

## Live demonstration script

1. Sign in as `dha_lab_clinician`.
2. Open the synthetic patient and encounter `402`.
3. Add Malaria using ICD-11 `1F40`.
4. Show the mapped SNOMED CT entry and description.
5. Update the problem status as required by the lab scenario.
6. Search by code and description.
7. Show the persisted diagnosis in the patient/encounter problem history and through the GET endpoint.

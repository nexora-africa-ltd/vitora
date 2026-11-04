<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for FUNC-MED-001 Medication Management and HPT Registry integration.
Use: resolve the documented HPT search failure, then attach this document and supporting evidence to the DHA portal row.
Inputs: DHA administrator pre-request script, X-Facility-ID 13, and DHA synthetic patient 402.
-->

# FUNC-MED-001 — Medication Management & HPT Registry

**Priority:** High
**Test method:** Live System Test
**Submission status:** Medication, allergy, and HPT lookup evidence is ready. Complete the live allergy-warning prescription demonstration before submission.

## Validated medication and allergy evidence

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic active medication list — FUNC-MED-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/patients/402/current-medications/` |
| Authentication type | Bearer JWT |
| Authentication token field | `{{vitora_dha_admin_access_token}}` |
| Pre-request behavior | The attached administrator pre-request script obtains, caches, and refreshes this variable. |
| Tenant header | `X-Facility-ID: 13` |
| Verified result | `200 OK` in `1.76 seconds` on 04 November 2026 |

The synthetic patient has three active HPT-backed medications:

- Artemether-Lumefantrine — 20/120 mg
- Paracetamol — 500 mg
- Oral Rehydration Salts — 1 sachet

Each current-medication record now links to a local Drug catalog item with an HPT code:

| Medication | Local Drug ID | HPT concept code |
|---|---:|---|
| Artemether-Lumefantrine | `5111` | `PH671` |
| Paracetamol | `5112` | `PH7813` |
| Oral Rehydration Salts | `5113` | `PH4685` |

Allergy evidence endpoint:

```text
GET https://staging-api.vitora.digital/api/patients/402/allergies/
```

The patient has a confirmed active, high-risk Penicillin allergy with rash reaction and SNOMED coding.

## HPT registry evidence

The required registry-search endpoint was tested:

```text
GET https://staging-api.vitora.digital/api/pharmacy/drugs/hpt-search/?q=Penicillin
```

Validated response:

```text
200 OK in 2.33 seconds
```

The response returns DHA KNHTS Clinical Concepts with the provenance:

```json
{
  "code": "PH7813",
  "display": "Paracetamol",
  "owner": "MOH-PPB",
  "source": "HPT",
  "system": "https://ilm-dev.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/"
}
```

## Required supporting evidence after unblock

1. This document.
2. Screenshot of active medication list and medication history.
3. Screenshot of Penicillin allergy entry.
4. Screenshot showing the allergy warning when prescribing Penicillin or an HPT-mapped equivalent.
5. HPT search sample response with product/code mapping.
6. OpenAPI schema and Swagger documentation.

## Live demonstration script

1. Open patient `MRN-20261104-0001`.
2. Show the three active medications and medication history.
3. Show confirmed Penicillin allergy.
4. Perform HPT medication search after the integration is restored.
5. Prescribe the allergy-triggering medication and demonstrate the warning.
6. Show the completed prescription and status.

<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for FUNC-CPOE-001 Computerized Provider Order Entry.
Use: complete the outstanding synthetic medication, lab, imaging, and billing evidence before attaching this document to the DHA portal row.
Inputs: DHA staging bearer token, X-Facility-ID 13, synthetic patient 402, and synthetic encounter 402.
-->

# FUNC-CPOE-001 — Computerized Provider Order Entry

**Priority:** Critical
**Test method:** Live System Test
**Submission status:** **Not ready to submit** — encounter and vital-sign evidence are ready; medication, laboratory, radiology, and billing-order evidence remains to be seeded.

## Proposed endpoint submission

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic CPOE encounter and vital signs — FUNC-CPOE-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/encounters/402/` |
| Authentication type | Bearer JWT |
| Authentication token field | `{{vitora_dha_access_token}}` |
| Tenant header | `X-Facility-ID: 13` |
| Expected result | `200 OK`, JSON encounter with patient context and vital signs |
| Verified response time | `4.31 seconds` on 04 November 2026; DHA requirement is under 30 seconds |

## Current validated evidence

The synthetic DHA encounter contains:

```json
{
  "id": 402,
  "patient_mrn": "MRN-20261104-0001",
  "encounter_type": "OPD",
  "chief_complaint": "DHA CPOE synthetic test encounter",
  "vitals_summary": "Temp: 38.5°C | Pulse: 104 bpm | BP: 130/85 mmHg | RR: 22/min | SpO2: 94.00% | Weight: 70.0 kg | Height: 170.0 cm | BMI: 24.2 (Normal)",
  "facility_name": "DHA Certification Test Facility",
  "status": "CREATED"
}
```

## Required completion evidence before portal submission

The DHA test requires all of the following against the same synthetic encounter:

| Requirement | GET evidence endpoint | Required supporting evidence |
|---|---|---|
| Medication order | `/api/pharmacy/prescriptions/?encounter=402` | Prescription creation screenshot and resulting prescription response. |
| Laboratory order | `/api/encounters/402/lab-orders/` | Lab order creation/routing screenshot and order response. |
| Radiology order | `/api/imaging/orders/?encounter=402` | Imaging order creation/routing screenshot and order response. |
| Vital signs | `/api/encounters/402/` | Encounter response and vitals-entry screenshot. |
| Billing entry | `/api/billing/invoices/?encounter=402` | Invoice/line-item screenshot and invoice response. |

## Live demonstration script

1. Sign in as `dha_lab_clinician`.
2. Open patient `MRN-20261104-0001` and encounter `402`.
3. Record BP, temperature, pulse, respiratory rate, SpO2, weight, and height.
4. Create a medication order, laboratory order, and radiology order.
5. Open the relevant pharmacy, laboratory, and imaging queues to show routing.
6. Show generated billing entries.
7. Retrieve the encounter and each order through the listed GET endpoints.

## Supporting evidence to attach

1. This completed document.
2. OpenAPI schema: `https://staging-api.vitora.digital/api/schema/`.
3. Swagger UI: `https://staging-api.vitora.digital/api/docs/`.
4. Screenshots showing order creation, routing, order history, vitals, and invoice generation.
5. Sanitized responses from each GET evidence endpoint.

> Do not submit this test-case row until every completion-evidence endpoint returns `200` with DHA-only synthetic data.

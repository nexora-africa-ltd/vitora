<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for FUNC-EPRES-001 Electronic Prescribing.
Use: create and transmit a DHA-only synthetic prescription to a configured in-network test pharmacy, then attach live evidence.
Inputs: staging JWT, X-Facility-ID, patient 402, encounter 402, Amoxicillin 500 mg catalog item, and recipient pharmacy facility ID.
-->

# FUNC-EPRES-001 — Electronic Prescribing

**Priority:** High
**Test method:** Live System Test
**Submission status:** **Not ready to submit** — complete the staging fixture, recipient pharmacy configuration, live transmission, and evidence capture below first.

## Workflow

1. Create the prescription with `POST /api/pharmacy/prescriptions/`, including medication, dose, frequency, duration, and the linked encounter.
2. Select an in-network pharmacy and call `POST /api/pharmacy/prescriptions/{id}/transmit/` with `recipient_facility`.
3. Vitora persists a `PrescriptionTransmission` and a real `ExternalPrescriptionRequest` in the recipient facility's pharmacy queue.
4. Recipient acceptance or rejection propagates back to the originating transmission.
5. The receiving pharmacy dispenses through its normal workflow; the original prescription retains its dispensing status.

## Required staging configuration

Configure a **second standard Vitora facility** in the same organization as the DHA test facility:

| Requirement | Required value |
|---|---|
| Facility type | Standard facility, not standalone-pharmacy mode |
| Pharmacy module | `has_pharmacy=true` |
| Organization | Same organization as DHA test facility `13` |
| Recipient facility | `14` — DHA Certification Test Pharmacy (`DHA-PHARM-002`) |
| Recipient staff | At least one pharmacy user who can view and accept external prescription requests |
| Drug catalogue | Recipient has a local Amoxicillin 500 mg record mapped to the same HPT concept as the origin catalogue record |

The receiving facility is the DHA **test pharmacy**. It must receive a persisted request in its real pharmacy queue; do not use a mocked request, screenshot-only fixture, or manually-created recipient record.

## DHA synthetic prescription fixture

Create prescription primary key `402` only if it is unused. It must be linked to patient `402` and encounter `402`.

```json
{
  "id": 402,
  "patient": 402,
  "encounter": 402,
  "items": [{
    "drug": "<LOCAL_AMOXICILLIN_500MG_DRUG_ID>",
    "quantity": 21,
    "dosage": "500 mg",
    "frequency": "Three times daily",
    "duration": "7 days",
    "route": "Oral"
  }]
}
```

The current staging catalogue has local Amoxicillin 500 mg candidates including `316` (`DRG-AMOXIC-0005`) and `5091` (`AMX500`). Select one active catalog record, then ensure its `hpt_code` is populated and matches the receiving facility's mapped Amoxicillin record. Do not send a hard-coded local drug ID as interoperability evidence.

## DHA portal endpoint submission

Submit this read endpoint to the portal after the live workflow is complete:

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic electronic prescription and dispensing status — FUNC-EPRES-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/pharmacy/prescriptions/402/` |
| Authentication | Bearer JWT via DHA pre-request script |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK` in under 30 seconds, with patient/encounter, Amoxicillin item, dosage, frequency, duration, and status |

Use the following authenticated endpoints during the live demonstration; attach their sanitized responses as supporting evidence:

```text
POST /api/pharmacy/prescriptions/
POST /api/pharmacy/prescriptions/{id}/transmit/
GET  /api/pharmacy/prescriptions/{id}/
GET  /api/pharmacy/standalone/external-prescriptions/
```

## Live DHA demonstration procedure

1. Sign in as the DHA synthetic prescriber at facility `13`.
2. Create prescription `402` for patient `402`, encounter `402`, using Amoxicillin 500 mg, TID, for seven days.
3. Show the saved item fields: medication, dosage, frequency, duration, route, and quantity `21`.
4. Where diagnostic tests are clinically applicable, create the laboratory or imaging order against encounter `402` and show the shared encounter context. Do not represent an unrelated order as a prescription item.
5. Select the configured receiving test pharmacy and transmit the prescription through `POST /api/pharmacy/prescriptions/402/transmit/`:

```json
{ "recipient_facility": 14 }
```

6. Sign in at the recipient facility, open **External Prescription Requests**, and show the newly received request with the Amoxicillin details. Accept it through the normal pharmacy workflow.
7. Dispense the receiving prescription through the normal dispensing workflow and show the resulting status.
8. Return to the origin facility, retrieve `GET /api/pharmacy/prescriptions/402/`, and capture the current prescription status.

## Required DHA attachments

1. Sanitized `200 OK` origin prescription response (`GET /api/pharmacy/prescriptions/402/`).
2. Sanitized `201 Created` prescription-create and transmission responses.
3. Screenshot of the prescription form showing Amoxicillin, 500 mg, TID, seven days, and quantity 21.
4. Screenshot of the selected recipient pharmacy and successful transmission state.
5. Screenshot from the recipient facility showing the real received request and acceptance.
6. Screenshot of recipient dispensing and the tracked prescription status.
7. If a diagnostic order is used, its encounter-linked lab/imaging response and screenshot.
8. Evidence that both Amoxicillin catalogue records use the same HPT concept code.
9. Automated backend test report: `tests/pharmacy/test_prescription_transmissions.py`.
10. OpenAPI/Swagger excerpt for the prescription and transmission operations.

Send `Authorization: Bearer <token>` and the correct origin or recipient `X-Facility-ID` for every API call. The evidence must be generated in staging with a real configured recipient facility, not a mocked queue.

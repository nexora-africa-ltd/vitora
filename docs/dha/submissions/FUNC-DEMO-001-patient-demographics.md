<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA portal submission evidence for FUNC-DEMO-001 Patient Demographics Capture.
Use: attach this document and its referenced evidence to the DHA portal test-case row.
Inputs: DHA staging bearer token, X-Facility-ID 13, and synthetic patient ID 402.
-->

# FUNC-DEMO-001 — Patient Demographics Capture

**Priority:** Critical
**Test method:** Live System Test
**Status:** Endpoint validated on DHA staging

## Endpoint submission

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic patient demographics — FUNC-DEMO-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/patients/402/` |
| Authentication type | Bearer JWT |
| Authentication token field | `{{vitora_dha_access_token}}` |
| Pre-request behavior | The attached portal pre-request script obtains, caches, and refreshes this variable before the GET request. |
| Tenant header | `X-Facility-ID: 13` |
| Expected result | `200 OK`, JSON patient-demographic payload |
| Verified response time | `12.64 seconds` on 04 November 2026; DHA requirement is under 30 seconds |
| Test data | Synthetic DHA patient only — `MRN-20261104-0001` |

## Capability demonstrated

The endpoint retrieves a persisted patient record containing standardized demographic data:

- Patient identity: names, MRN, stable public ID, date of birth, and gender
- Identification: identification type and number
- Contact information: phone number, email, and address
- Kenya location hierarchy: county, sub-county, ward, and village
- Next of kin: name, phone number, and relationship
- Consent and registration metadata

## Sanitized sample response

```json
{
  "id": 402,
  "public_id": "82845de7-0378-479e-ae2c-dd638f974a53",
  "mrn": "MRN-20261104-0001",
  "first_name": "John",
  "last_name": "Doe DHA TEST",
  "date_of_birth": "1990-01-15",
  "gender": "M",
  "identification_type": "national_id",
  "identification_number": "DHA-TEST-NID-0001",
  "phone_number": "0700000001",
  "email": "dha-test-nid-0001@example.invalid",
  "address": "Synthetic DHA certification data — not a real address",
  "county": 30,
  "county_name": "Baringo",
  "sub_county": 157,
  "sub_county_name": "Baringo Central",
  "village": "DHA Test Village 1",
  "emergency_contact_name": "Jane Doe DHA TEST",
  "emergency_contact_phone": "0799000099",
  "emergency_contact_relationship": "sibling",
  "consent_given": true
}
```

## Supporting documentation/evidence

Attach or link the following to the DHA portal row:

1. This document.
2. OpenAPI schema: `https://staging-api.vitora.digital/api/schema/`.
3. Swagger UI: `https://staging-api.vitora.digital/api/docs/`.
4. Screenshot of the Patient Registration screen showing the required demographic, identification, residence, and next-of-kin fields.
5. Screenshot of the saved patient detail screen for synthetic patient `MRN-20261104-0001`.
6. Screenshot of the validation error for a future date of birth (`2099-01-01`). The API returns HTTP `400` with `Date of birth cannot be in the future.`
7. Automated regression coverage: `backend/tests/patients/test_patient_api.py` and `backend/tests/patients/test_emergency_contact.py`.

## Live demonstration script

1. Sign in as `dha_lab_clinician`.
2. Open **Patients → Register Patient**.
3. Attempt a future date of birth (`2099-01-01`) and show the rejection.
4. Create a new synthetic patient using the DHA scenario: John Doe, male, DOB `1990-01-15`, with a unique test identifier.
5. Enter residence, contact, and next-of-kin details.
6. Save and show the generated MRN.
7. Search for and reopen the patient record; verify all submitted data persisted.

> Do not use this pre-seeded record as the live-create demonstration. It is the stable retrieval/API-evidence record; create a fresh synthetic patient during the lab session.

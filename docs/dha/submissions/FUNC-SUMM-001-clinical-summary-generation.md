<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for FUNC-SUMM-001 Clinical Summary Generation.
Use: Seed DHA-only clinical-summary records for patient 402, retrieve the authenticated IPS Bundle, validate it, and attach the listed evidence to the DHA portal.
Inputs: staging API base URL, DHA reader JWT pre-request script, X-Facility-ID 13, and DHA synthetic patient 402.
-->

# FUNC-SUMM-001 — Clinical Summary Generation

**Priority:** High
**Test method:** Live System Test
**Submission status:** Ready after the DHA-only prescription and care-plan fixture is seeded and the regenerated Bundle is validated.

## Capability statement

Vitora generates an International Patient Summary (IPS) as a FHIR R4 document Bundle for an authenticated, authorized patient request. The Bundle is human-readable through XHTML narratives and exchangeable through the IPS Bundle and Composition profiles. It assembles patient biodata, clinical problems, allergies, medication statements generated from dispensed prescriptions, and care plans generated from active treatment plans.

## DHA evidence endpoint

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve DHA synthetic FHIR clinical summary — FUNC-SUMM-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/fhir/Patient/402/$summary` |
| Authentication | Bearer JWT from the DHA pre-request script |
| Required headers | `Accept: application/fhir+json`, `X-Facility-ID: 13` |
| Expected response | `200 OK` FHIR R4 IPS document Bundle in under 30 seconds |

The endpoint requires authenticated patient-read access and preserves tenant and patient access checks. Do not make it public or replace it with a static JSON artifact.

## DHA synthetic fixture

Patient `402` (`MRN-20261104-0001`) must contain the following DHA-only records on its synthetic encounter `402`:

| Required lab content | Source record | Expected FHIR evidence |
|---|---|---|
| Biodata | Patient `402` | `Patient` entry with name, DOB, sex, MRN, contact, and Kenya address |
| Clinical information | Coded malaria diagnosis and Penicillin allergy | `Condition` and `AllergyIntolerance` entries, referenced by the Composition |
| Medication and prescription | Fully dispensed synthetic Artemether-Lumefantrine prescription item | `MedicationStatement` entry and populated **Medication Summary** section |
| Care plan | Active synthetic malaria follow-up treatment plan | `CarePlan` entry and populated **Plan of Care** section |

The seed must use only DHA synthetic data and must not overwrite or attach to a real patient, facility, clinician, or encounter.

## Required response assertions

Before submission, verify the regenerated response has all of the following:

```text
Bundle.resourceType = "Bundle"
Bundle.type = "document"
Bundle.meta.profile includes Bundle-uv-ips
Bundle.entry[0].resource.resourceType = "Composition"
Composition.meta.profile includes Composition-uv-ips
Composition.section includes Allergies and Intolerances, Medication Summary, Problem List, and Plan of Care
Bundle.entry includes Patient, Condition, AllergyIntolerance, MedicationStatement, and CarePlan resources
```

The XHTML in `Composition.text.div` and each populated Composition section is the human-readable clinical summary evidence. Capture it in a rendered FHIR viewer or Vitora UI screenshot; the raw JSON alone does not demonstrate readability.

## Live validation

```bash
curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer $DHA_ACCESS_TOKEN" \
  --header 'X-Facility-ID: 13' \
  --header 'Accept: application/fhir+json' \
  'https://staging-api.vitora.digital/fhir/Patient/402/$summary' \
  | tee func-summ-001-ips-402.json \
  | jq '{resourceType, type, profiles: .meta.profile, resource_types: [.entry[].resource.resourceType], section_titles: [.entry[0].resource.section[].title]}'
```

Validate `func-summ-001-ips-402.json` against FHIR R4 with the IPS profiles enabled, and retain the validator report. A structural inspection is not a substitute for the validator report required by the lab procedure.

## Evidence attachments

1. Sanitized `200 OK` response for `/fhir/Patient/402/$summary` after the fixture is seeded.
2. Screenshot showing the human-readable Composition narrative and its allergies, medications, problems, and plan-of-care sections.
3. FHIR R4 / IPS validator success report for the exported Bundle.
4. Automated test report for `backend/tests/core/test_fhir_ips.py`.
5. Swagger/OpenAPI excerpt showing the authenticated patient-summary operation.

## DHA lab demonstration script

1. Use only DHA synthetic patient `402` and synthetic encounter `402`.
2. Generate the summary with the endpoint above.
3. Render the Composition narrative and verify biodata, clinical problem, allergy, medication, prescription-derived medication statement, and care plan are visible.
4. Export the response as `application/fhir+json`.
5. Run and retain FHIR R4 IPS validation results.
6. Submit only when the endpoint returns `200 OK` in under 30 seconds and the exported Bundle includes both `MedicationStatement` and `CarePlan`.

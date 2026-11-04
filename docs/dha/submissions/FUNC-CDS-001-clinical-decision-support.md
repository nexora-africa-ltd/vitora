<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for FUNC-CDS-001 Clinical Decision Support System.
Use: Seed only DHA synthetic CDS alerts, call the authenticated GET endpoint, and attach the response and UI screenshot in the DHA portal.
Inputs: staging API base URL, DHA reader JWT pre-request script, X-Facility-ID, and a synthetic encounter ID.
-->

# FUNC-CDS-001 — Clinical Decision Support System

**Priority:** High
**Test method:** Live System Test
**Status:** Ready after synthetic CDS alert is seeded on staging.

## Capability statement

Vitora evaluates active clinical rules against encounter context and persists the resulting clinical decision-support alerts. Each alert records the clinical trigger, recommended intervention, rule evidence level, and guideline references. The evidence endpoint is read-only and does not execute a rule or alter the encounter.

## DHA evidence endpoint

```text
GET /api/cds/alerts/evidence/?encounter_id=<ENCOUNTER_ID>
Authorization: Bearer {{vitora_dha_clinician_access_token}}
X-Facility-ID: 13
```

The request requires a DHA synthetic encounter ID and `cds.view_cdsalert`. It returns only alerts scoped to the requesting facility or organization. The dedicated `dha_lab_api` account must receive this **read-only** Django permission; do not relax the endpoint to all authenticated users.

Grant the permission once on staging after deployment:

```bash
cd backend
poetry run python manage.py grant_cds_evidence_access --username dha_lab_api
```

## Required synthetic scenario

Use patient `402` and its DHA synthetic encounter. Create or evaluate one active CDS rule with:

- Evidence level `A`, `B`, or `C`
- At least one cited clinical guideline/reference
- A persisted CDS alert with an intervention/recommendation
- A clinical trigger such as a critical vital, lab result, drug allergy, or drug-drug interaction

Do not use real patient, clinician, or facility data in screenshots or submitted payloads.

For the standard DHA field-lab fixture, seed the controlled synthetic alert after deployment:

```bash
cd backend
poetry run python manage.py seed_dha_cds_evidence \
  --encounter-id 402 \
  --confirm-synthetic
```

This command is idempotent and creates only `DHA-SYNTHETIC-CDS-FEVER-001` and its alert for the supplied encounter. The mandatory confirmation flag prevents accidental use against non-test data.

## Expected response evidence

```json
{
  "capability": "FUNC-CDS-001",
  "encounter_id": 402,
  "intervention_count": 1,
  "evidence_based_intervention_count": 1,
  "interventions": [
    {
      "rule_code": "DHA-SYNTHETIC-FEVER-001",
      "category": "VITAL_SIGN",
      "evidence_level": "A",
      "evidence_based": true,
      "references": [
        {
          "title": "Synthetic DHA test guideline reference",
          "url": "https://example.invalid/dha-test-guideline"
        }
      ],
      "trigger": {
        "message": "Synthetic high-temperature trigger",
        "details": { "vital": "temperature", "value": 39.5 }
      },
      "intervention": {
        "action_type": "SUGGEST",
        "recommendation": "Assess the synthetic patient for infection."
      },
      "status": "PENDING"
    }
  ]
}
```

## Evidence attachments

1. Screenshot of the CDS alert showing the trigger and recommended intervention.
2. Sanitized `200 OK` endpoint response showing `evidence_level`, `references`, and `evidence_based: true`.
3. Automated test report for `tests/cds/test_cds.py::TestCDSAlertAPI`.
4. OpenAPI endpoint excerpt from `https://staging-api.vitora.digital/api/schema/`.

## Validation command

```bash
curl --silent --show-error --fail --max-time 30 \
  --header "Authorization: Bearer $DHA_ACCESS_TOKEN" \
  --header 'X-Facility-ID: 13' \
  'https://staging-api.vitora.digital/api/cds/alerts/evidence/?encounter_id=<ENCOUNTER_ID>' | jq .
```

Submit only after the endpoint returns `200` in under 30 seconds and the returned intervention has an evidence level of `A`, `B`, or `C` with a clinical reference.

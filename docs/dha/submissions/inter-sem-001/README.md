<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: Controlled DHA INTER-SEM-001 semantic interoperability evidence package.
Use: Run the referenced management command only against approved synthetic records, then attach its exports and HAPI outcomes after review.
Inputs: Synthetic Condition, ProcedureOrder, LabResult, and facility IDs; HAPI_FHIR_BASE_URL must identify FHIR R4 4.0.1.
-->

# INTER-SEM-001 — Semantic Interoperability Evidence

## Demonstrated exchange

Vitora receives facility-scoped FHIR R4 resources and returns standard coded FHIR R4 exports:

| Semantic domain | Inbound resource | Persisted record | Returned FHIR resource | Standard |
| --- | --- | --- | --- | --- |
| Diagnosis | `Condition` | `Diagnosis` | `Condition` | ICD-11 MMS |
| Procedure | `Procedure` | `ProcedureOrder` | `Procedure` | ICHI |
| Laboratory result | `Observation` | `LabOrder` → `LabResult` | `Observation` | LOINC, UCUM, HL7 interpretation |

The inbound create endpoints are authenticated and facility-scoped. An inbound code must map to an active facility catalogue entry; unknown codes are rejected rather than silently converted to local free text.

## Submission endpoints

```text
POST /fhir/Condition/
POST /fhir/Procedure/
POST /fhir/Observation/

GET /fhir/Condition/{id}
GET /fhir/Procedure/{id}
GET /fhir/Observation/{id}
```

Use an access token bound to the active facility and the facility-selection header required by the deployment. Never use production patient data for DHA evidence.

## Controlled validation

After creating or seeding one synthetic, single-facility record set, run:

```bash
python manage.py validate_fhir_semantic_evidence \
  --condition-id <ID> \
  --procedure-id <ID> \
  --observation-id <ID> \
  --facility-id <ID> \
  --output-dir /tmp/dha-inter-sem-001
```

The command validates all three exports through HAPI FHIR R4 `4.0.1` `$validate`, writes each export and its OperationOutcome, and exits non-zero unless every result is authoritatively valid.

Do not add generated artifacts or checksum manifests until the evidence run, review, and approval are complete.

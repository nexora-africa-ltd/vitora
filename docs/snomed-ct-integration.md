# SNOMED CT Integration

> **Gap #30**: SNOMED CT Active Usage
> **Sprint**: 3.B — Advanced Interoperability
> **Priority**: P3 (Enhancement)
> **Status**: ✅ Complete
> **Completed**: March 13, 2026

---

## Overview

SNOMED CT (Systematized Nomenclature of Medicine — Clinical Terms) has been integrated as a **supplementary coding system** alongside ICD-10 and ICD-11 for diagnoses. This enables richer FHIR interoperability without disrupting existing clinical workflows — ICD-10 remains the primary local classification, and ICD-11 is required for SHA claims.

### Why SNOMED CT?

| Standard | Primary Use in Vitora | Mandatory? |
|----------|----------------------|:----------:|
| **ICD-10** | Local classification, legacy reporting | Yes |
| **ICD-11** | SHA claims, WHO reporting | Yes (SHA) |
| **SNOMED CT** | FHIR interoperability, clinical precision | No (enhances) |

SNOMED CT is the richest clinical terminology system available (350,000+ concepts). It provides:
- Granular clinical findings that ICD-10/11 cannot express
- Standard coding for FHIR Condition, AllergyIntolerance, and Procedure resources
- Cross-border interoperability for international patient summaries (IPS)
- Free licensing for Kenya as an LMIC (Low and Middle Income Country)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SNOMED CT Integration Flow                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Clinician                                                       │
│  ┌──────────────────────────────────────┐                        │
│  │ Diagnosis Form                       │                        │
│  │  ICD-10: ✅ A09 (Diarrhoea)         │                        │
│  │  ICD-11: ✅ 1A00 (Cholera)          │                        │
│  │  SNOMED: 🔍 "cholera"              │ ← Optional enrichment   │
│  │          → 63650001 | Cholera        │                        │
│  └──────────┬───────────────────────────┘                        │
│             │                                                    │
│  ┌──────────▼──────────┐   ┌────────────────────┐               │
│  │  SNOMEDSearchView   │──▶│  SNOMEDService     │               │
│  │  GET /api/encounters│   │  ┌──────────────┐  │               │
│  │  /snomed/search/    │   │  │ Snowstorm API│  │ ← Remote      │
│  └─────────────────────┘   │  └──────┬───────┘  │               │
│                            │         │ fallback  │               │
│                            │  ┌──────▼───────┐  │               │
│                            │  │SNOMEDConcept │  │ ← Local cache │
│                            │  │  (core app)  │  │               │
│                            │  └──────────────┘  │               │
│                            └────────────────────┘               │
│                                                                  │
│  ┌────────────────────────────────────────────┐                  │
│  │  FHIR Condition Resource                   │                  │
│  │  code.coding: [                            │                  │
│  │    { system: "icd-10",    code: "A09" },   │                  │
│  │    { system: "icd-11",    code: "1A00" },  │                  │
│  │    { system: "snomed-ct", code: "63650001"}│ ← New            │
│  │  ]                                         │                  │
│  └────────────────────────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Diagnosis Model Fields

**File**: `hmis/apps/encounters/models.py`

Two new optional fields added to the `Diagnosis` model:

| Field | Type | Description |
|-------|------|-------------|
| `snomed_code` | CharField(20) | SNOMED CT concept ID (e.g., `38341003`) |
| `snomed_display` | CharField(500) | Preferred term (e.g., `Hypertensive disorder`) |

Both fields are optional — clinicians can set any combination of ICD-10, ICD-11, SNOMED CT, or free text. The model validation requires at least one to be provided.

### 2. SNOMEDConcept Cache Model

**File**: `hmis/apps/core/models.py`

Local cache table for offline search:

| Field | Type | Description |
|-------|------|-------------|
| `concept_id` | CharField(20), unique | SNOMED CT concept ID |
| `display` | CharField(500) | Preferred term |
| `semantic_tag` | CharField(50) | FSN tag (disorder, finding, procedure) |
| `is_active` | BooleanField | Whether active in SNOMED CT |

Pre-populated with ~500 common clinical concepts via `seed_snomed_common` management command.

### 3. SNOMEDService

**File**: `hmis/apps/core/services/snomed_service.py`

```python
class SNOMEDService:
    def search(query, semantic_tag="", limit=20) -> list[SNOMEDSearchResult]
    def lookup(concept_id) -> SNOMEDSearchResult | None
```

**Search strategy**:
1. Try SNOMED International Snowstorm API (remote)
2. Cache results locally in `SNOMEDConcept`
3. Fall back to local cache if Snowstorm is unavailable

**Snowstorm API**: `https://browser.ihtsdotools.org/snowstorm/snomed-ct`
**Edition**: `MAIN` (International)
**License**: Free for LMICs including Kenya

### 4. Search API Endpoint

```
GET /api/encounters/snomed/search/?q={term}&semantic_tag={tag}&limit={n}
```

**Parameters**:

| Param | Required | Description |
|-------|:--------:|-------------|
| `q` | Yes | Search term (min 2 chars) |
| `semantic_tag` | No | Filter: `disorder`, `finding`, `procedure`, `substance` |
| `limit` | No | Max results (default 20, max 50) |

**Response**:
```json
{
  "results": [
    {
      "concept_id": "38341003",
      "display": "Hypertensive disorder",
      "semantic_tag": "disorder"
    }
  ],
  "count": 1
}
```

### 5. FHIR Condition Mapping

**File**: `hmis/apps/core/fhir/views.py`

The `_to_fhir_condition()` method now produces multi-coding Condition resources:

```json
{
  "resourceType": "Condition",
  "code": {
    "coding": [
      {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "code": "I10",
        "display": "Essential (primary) hypertension"
      },
      {
        "system": "http://snomed.info/sct",
        "code": "38341003",
        "display": "Hypertensive disorder"
      }
    ],
    "text": "Essential (primary) hypertension"
  }
}
```

SNOMED CT coding is added when `diagnosis.snomed_code` is populated. ICD-11 coding is added when `diagnosis.icd11_code` is populated.

---

## Configuration

```python
# settings/base.py (optional overrides)
SNOMED_SNOWSTORM_URL = "https://browser.ihtsdotools.org/snowstorm/snomed-ct"
SNOMED_EDITION = "MAIN"        # International edition
SNOMED_VERSION = ""              # Latest (or pin to specific version)
```

---

## Management Commands

### Seed Common Concepts

```bash
cd backend
poetry run python manage.py seed_snomed_common
```

Pre-populates ~500 frequently used clinical concepts for offline search. Covers:
- Common disorders (hypertension, diabetes, malaria, etc.)
- Clinical findings (fever, cough, headache, etc.)
- Procedures (blood pressure measurement, X-ray, etc.)

---

## Frontend Updates

### Types

`web-app/lib/types/encounter.ts` and `mobile/lib/types/encounter.ts`:
```typescript
export interface Diagnosis {
  // ...existing fields...
  snomed_code?: string | null;
  snomed_display?: string | null;
}
```

### Schema

`web-app/lib/schemas/encounter.schema.ts`:
```typescript
export const DiagnosisSchema = z.object({
  // ...existing fields...
  snomed_code: z.string().optional().nullable(),
  snomed_display: z.string().optional().nullable(),
});
```

---

## Tests

**File**: `tests/core/test_snomed.py`
**Count**: 26 tests

| Test Class | Tests | Covers |
|------------|:-----:|--------|
| `TestSNOMEDConceptModel` | 4 | Model CRUD, unique constraint, str repr |
| `TestSNOMEDService` | 7 | Remote search, local fallback, caching, lookup |
| `TestSNOMEDSearchEndpoint` | 5 | API validation, auth, search params |
| `TestDiagnosisWithSNOMED` | 5 | Model fields, serializer, validation |
| `TestFHIRConditionSNOMED` | 5 | FHIR coding with/without SNOMED |

---

## Migration

**File**: `hmis/apps/encounters/migrations/0024_add_snomed_fields.py`

Adds `snomed_code` and `snomed_display` to `Diagnosis` and `HistoricalDiagnosis`.

**File**: `hmis/apps/core/migrations/` (auto-generated)

Adds `SNOMEDConcept` model.

# HPT Registry Integration (DHA Gap #26)

> **Purpose**: Integration of Kenya DHA Health Products & Technologies (HPT) Registry with Vitora HMIS pharmacy module.
>
> **Created**: March 13, 2026
> **Owner**: Backend Team
> **Status**: ✅ Complete
> **DHA Compliance Gap**: #26

---

## Overview

The HPT Registry integration connects Vitora's pharmacy `Drug` model to the Kenya Digital Health Agency (DHA) Terminology API endpoints for drug products and active components. This enables:

1. **Standardized drug identification** — Each drug can carry a KNHTS concept ID (`hpt_code`) and DHA product ID (`hpt_product_id`) from the national registry
2. **Deterministic allergy matching** — Active component ATC codes from the DHA API replace text-based substring matching in the CDS engine
3. **Regulatory code tracking** — PPB registration codes from the DHA product registry stored alongside KEML/NHIF codes
4. **Bulk mapping tooling** — Management command to auto-map existing drugs to HPT registry entries

---

## Architecture

The integration reuses the existing `TerminologyService` in `hmis/apps/billing/services/terminology.py` — no new API client was created. The service already handled DHA authentication via `SHAAuthService` and had endpoints for product and active-component search. This integration:

- Fixed `DrugProduct` and `ActiveComponent` dataclass fields to match real DHA API responses
- Fixed response unwrapping to handle the `{ IsSuccess, Data: { ... } }` envelope
- Added HPT code fields to the `Drug` model
- Wired product/component search into pharmacy and allergy workflows
- Enhanced CDS engine to prefer ATC/HPT code matching over text matching

```
┌─────────────────────────────────────────────────────────────────┐
│                  HPT Integration Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐       ┌──────────────────────────────┐    │
│  │  Drug Model       │       │  TerminologyService         │    │
│  │  (pharmacy app)   │       │  (billing/services/)        │    │
│  │                   │       │                              │    │
│  │  hpt_code ────────┼──←──  │  search_drug_products()     │    │
│  │  hpt_product_id   │       │  get_drug_product()         │    │
│  │  ppb_code         │       │  search_active_components() │    │
│  │  hpt_last_synced  │       │                              │    │
│  └──────┬───────────┘       └──────────┬───────────────────┘    │
│         │                              │                        │
│         │                              │ DHA Terminology API    │
│         │                              ▼                        │
│  ┌──────▼───────────┐       ┌──────────────────────────────┐    │
│  │  CDS Engine       │       │  DHA (uat.dha.go.ke)        │    │
│  │  (cds/engine.py)  │       │                              │    │
│  │                   │       │  /terminology/v1/product     │    │
│  │  ATC code match   │       │  /terminology/v1/active-     │    │
│  │  (deterministic)  │       │    component                 │    │
│  │  Text fallback    │       │                              │    │
│  └───────────────────┘       └──────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## DHA Terminology API Endpoints

### Product Search

```
GET https://uat.dha.go.ke/terminology/v1/product
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | String | No | Search by brand name, generic name, route, form, PPB code, ETCD, or KNHTS concept ID |
| `product_id` | Integer | No | Get specific product by DHA ID |
| `generic_concept_id` | Integer | No | Filter by generic concept group |
| `form_id` | Integer | No | Filter by dosage form |
| `route_id` | Integer | No | Filter by administration route |

**Response format:**
```json
{
  "IsSuccess": true,
  "Message": "Success",
  "Errors": [],
  "Data": {
    "products": [
      {
        "product_id": 4855,
        "generic_concept_id": 2,
        "brand_display_name": "Glucodeal 500 mg Oral Tablet",
        "generic_display_name": "Metformin 500 mg Oral Tablet",
        "brand_name": "Glucodeal",
        "generic_name": "Metformin",
        "strength_amount": "500",
        "strength_unit": "mg",
        "route_description": "Oral",
        "form_description": "Tablet",
        "ppb_registration_code": "77",
        "etcd": "3913",
        "knhts_concept_id": "10-03913-01",
        "updation_date": "2024-12-21T04:56:04.243Z"
      }
    ],
    "count": 1
  }
}
```

### Active Component Search

```
GET https://uat.dha.go.ke/terminology/v1/active-component
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | String | No | Search by component description (e.g., "Metformin") |
| `exact_match` | Boolean | No | If `true`, return only exact matches |
| `active_component_id` | Integer | No | Get specific component by ID |

**Response format:**
```json
{
  "IsSuccess": true,
  "Message": "Success",
  "Errors": [],
  "Data": {
    "ac": [
      {
        "active_component_id": 1,
        "component_description": "Metformin",
        "component_links": [
          {
            "active_component_link_id": 1,
            "active_component_line": 1,
            "active_component_id": 1,
            "component_name": "Metformin",
            "component_atc_code": "A10BA02"
          }
        ]
      }
    ],
    "count": 1
  }
}
```

### Authentication

All DHA Terminology API requests require:
- **Basic Auth** credentials from Kenya Digital Superhighway
- **Bearer JWT token** from the DHA auth endpoint

Handled by the existing `SHAAuthService` in `hmis/apps/billing/services/sha_auth.py`.

---

## Drug Model Fields

Four new fields added to `Drug` model in `hmis/apps/pharmacy/models.py`:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `hpt_code` | CharField(50) | KNHTS concept ID — primary HPT identifier | `"10-03913-01"` |
| `hpt_product_id` | IntegerField | DHA product ID for API lookups | `4855` |
| `hpt_last_synced` | DateTimeField | Timestamp of last HPT sync | `2026-03-13T10:00:00Z` |
| `ppb_code` | CharField(20) | Kenya Pharmacy & Poisons Board code | `"77"` |

All fields are optional (blank/null) — HPT mapping is opt-in. Drugs without HPT codes continue to work normally with text-based matching.

---

## API Endpoints

### Pharmacy HPT Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pharmacy/drugs/hpt_search/?q={query}` | GET | Proxy search to DHA product registry (delegates to `TerminologyService.search_drug_products()`) |
| `/api/pharmacy/drugs/{id}/map_hpt/` | POST | Map a specific drug to an HPT code. Body: `{ "hpt_code": "10-03913-01", "hpt_product_id": 4855, "ppb_code": "77" }` |

### Allergy HPT Substance Lookup

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patients/{patient_id}/allergies/hpt_substance_search/?q={query}` | GET | Search DHA active components for allergy substance selection. Returns ATC codes for deterministic matching. |

### Existing Terminology Endpoints (unchanged)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/billing/terminology/drugs/?search={query}` | GET | Generic terminology search (via `TerminologySearchView`) |
| `/api/billing/terminology/active-components/?search={query}` | GET | Active component terminology search |

---

## Management Command

### `map_drugs_to_hpt`

Bulk-maps drugs in the local database to DHA HPT registry entries.

```bash
# Preview mappings (no changes)
python manage.py map_drugs_to_hpt --dry-run

# Auto-map all unmapped drugs
python manage.py map_drugs_to_hpt

# Re-map all drugs (including already-mapped)
python manage.py map_drugs_to_hpt --force

# Map drugs matching a query
python manage.py map_drugs_to_hpt --query "Metformin"
```

**Mapping logic:**
1. For each `Drug` without an `hpt_code` (or all drugs if `--force`):
   - Search DHA API: `search_drug_products(drug.generic_name)`
   - If exactly **1 match**: auto-map (`hpt_code`, `hpt_product_id`, `ppb_code`, `hpt_last_synced`)
   - If **multiple matches**: log as ambiguous for manual review
   - If **0 matches**: log as unmapped
2. Report: mapped count, ambiguous count, unmapped count, error count

---

## CDS Engine Integration

The CDS engine (`hmis/apps/cds/engine.py`) was enhanced to prefer HPT/ATC-based matching:

### Drug-Allergy Matching

```
Priority order:
1. ATC code match (deterministic) — if allergy has substance_code with
   system "http://www.whocc.no/atc" and drug has hpt_code, look up drug's
   active components via TerminologyService and match ATC codes
2. Text substring match (existing fallback) — match allergy substance
   name against drug generic_name
```

### Drug-Drug Interaction Matching

```
Priority order:
1. HPT code match (deterministic) — if both drugs have hpt_code values,
   compare generic_concept_id grouping (same generic = potential interaction)
2. Text match (existing fallback) — match drug names against CDS rule
   condition values
```

All HPT-based matching gracefully falls back to text matching when HPT codes are unavailable. No DHA interaction API exists — interaction rules remain locally defined in CDS `seed_cds_rules`.

---

## Field Mapping Reference

### DHA Product → Vitora Drug

| DHA API Field | Vitora Drug Field | Notes |
|---------------|-------------------|-------|
| `knhts_concept_id` | `hpt_code` | Primary HPT identifier (e.g., `"10-03913-01"`) |
| `product_id` | `hpt_product_id` | Integer DHA ID for API lookups |
| `generic_name` | `generic_name` | Used for auto-mapping search |
| `brand_name` | `brand_names` (JSONField) | Can enrich brand list |
| `strength_amount` + `strength_unit` | `strength` + `unit` | Validation/reconciliation |
| `form_description` | `form` | Map "Tablet" → "TABLET" etc. |
| `ppb_registration_code` | `ppb_code` | Kenya PPB regulatory code |
| `etcd` | — | Deferred (no current consumer) |

### DHA Active Component → Vitora Allergy

| DHA API Field | Vitora Allergy Field | Notes |
|---------------|---------------------|-------|
| `component_description` | `substance` | Active ingredient name |
| `component_atc_code` | `substance_code` | ATC code for deterministic matching |
| — | `substance_code_system` | Set to `"http://www.whocc.no/atc"` |

---

## Testing

39 tests in `tests/test_hpt_integration.py` covering:

| Category | Count | Description |
|----------|:-----:|-------------|
| Dataclass parsing | 6 | Real DHA response format, unwrapping, error handling |
| Drug model | 2 | HPT field existence, serializer inclusion |
| HPT search/map endpoints | 5 | Search delegation, mapping, authentication |
| Allergy HPT | 3 | Substance search, ATC substance codes |
| CDS integration | 5 | ATC matching, HPT matching, text fallback, prescription check |
| Management command | 4 | Dry-run, auto-mapping, ambiguous results, API failure |
| Query parameter support | 3 | Product search params, active component params, exact match |
| InterventionCode parsing | 3 | Real DHA SHA intervention response format |
| ICD-11/LOINC parsing | 4 | Real DHA response format for other terminologies |
| Edge cases | 4 | Empty responses, error wrapping, search limit params |

---

## Configuration

No new settings required. The integration uses existing configuration:

| Setting | Value | File |
|---------|-------|------|
| `SHA_API_BASE_URL` | `https://uat.dha.go.ke` | `hmis/settings/base.py` |
| `SHA_API_TIMEOUT` | `30` (seconds) | `hmis/settings/base.py` |
| `SHA_ENDPOINTS['drug_products']` | `/terminology/v1/product` | `terminology.py` |
| `SHA_ENDPOINTS['active_components']` | `/terminology/v1/active-component` | `terminology.py` |

---

## Files Modified

| File | Change |
|------|--------|
| `hmis/apps/billing/services/terminology.py` | Fixed `DrugProduct`, `ActiveComponent`, `InterventionCode`, `ICD11Code`, `RemoteLOINCCode`, `ICHICode` dataclasses; added `_unwrap_dha_response()`; added query param support |
| `hmis/apps/pharmacy/models.py` | Added `hpt_code`, `hpt_product_id`, `hpt_last_synced`, `ppb_code` to `Drug` |
| `hmis/apps/pharmacy/serializers.py` | Added HPT fields to `DrugSerializer`; enhanced `PrescriptionItemSerializer` drug-allergy check |
| `hmis/apps/pharmacy/views.py` | Added `hpt_search`, `map_hpt` actions to `DrugViewSet` |
| `hmis/apps/pharmacy/admin.py` | Added HPT fields to `DrugAdmin` |
| `hmis/apps/pharmacy/management/commands/map_drugs_to_hpt.py` | **New** — Bulk HPT mapping command |
| `hmis/apps/patients/views.py` | Added `hpt_substance_search` action to `AllergyViewSet` |
| `hmis/apps/cds/engine.py` | Enhanced `_evaluate_drug_allergy` and `_evaluate_drug_drug` with ATC/HPT matching |
| `tests/test_hpt_integration.py` | **New** — 39 integration tests |
| `web-app/lib/types/pharmacy.ts` | Added HPT fields to `Drug` interface |
| `web-app/lib/schemas/pharmacy.schema.ts` | Added HPT fields to `DrugSchema` |
| `mobile/lib/types/pharmacy.ts` | Added HPT fields to `DrugProduct` interface |
| `mobile/lib/schemas/pharmacy.schema.ts` | Added HPT fields to `DrugProductSchema` |

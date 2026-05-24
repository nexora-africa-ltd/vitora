# Drug Formulary API Integration Guide

A developer guide for integrating with TibaBot's Drug Formulary — a unified search interface across Kenya's pharmaceutical data sources.

## Overview

The Drug Formulary provides a single API to query three authoritative Kenyan pharmaceutical data sources:

| Source | Description | Records | Key Fields |
|--------|-------------|---------|------------|
| **SmPC** | Summary of Product Characteristics (PPB) | 1,819 | Full clinical monograph: indications, posology, contraindications, interactions, adverse effects |
| **PPB Products** | Pharmacy & Poisons Board retention register | 2,652 | Registration status, manufacturer, active ingredient, dosage form, validity |
| **KEML** | Kenya Essential Medicines List (2023) | 366 | Formulary level (H1–H5), dose forms, subcategory |

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://tibabot.vitora.nexora.africa` |
| Local Dev | `http://localhost:8000` |

## Authentication

All endpoints require a facility API key:

```bash
curl -H "X-API-Key: tb_your-key" \
  "https://tibabot.vitora.nexora.africa/drugs/search?q=amoxicillin"
```

See [Facility Auth Guide](facility-auth-guide.md) for key provisioning.

---

## Endpoints

### 1. Search Drugs

```
GET /drugs/search?q={query}&limit={n}
```

Searches across all three sources simultaneously. Returns matches ranked by relevance.

#### Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Drug name, ingredient, or partial name (min 2 chars, max 200) |
| `limit` | int | No | 10 | Max results per source (1–50) |

#### Matching Logic

- **Exact token match** — query tokens matched against indexed name tokens (score: 1.0)
- **Prefix match** — partial tokens (≥3 chars) match if they're a prefix of an entry token (score: proportional to length ratio)
- Results ranked by cumulative score, highest first

#### Example Request

```bash
curl -H "X-API-Key: tb_your-key" \
  "https://tibabot.vitora.nexora.africa/drugs/search?q=metformin&limit=5"
```

#### Example Response

```json
{
  "query": "metformin",
  "total_results": 8,
  "smpc": [
    {
      "id": "smpc_metformin_500mg_tablets",
      "product_name": "METFORMIN 500MG TABLETS SmPC",
      "title": "Summary of Product Characteristics",
      "filename": "METFORMIN_500MG_TABLETS.pdf",
      "source_url": "https://web.pharmacyboardkenya.org/smpc/METFORMIN_500MG_TABLETS.pdf",
      "pharmaceutical_form": "Film-coated tablets",
      "active_ingredients": ["metformin hydrochloride"],
      "indications": "Treatment of type 2 diabetes mellitus, particularly in overweight patients...",
      "posology": "Adults: Initially 500mg or 850mg 2-3 times daily...",
      "contraindications": "Hypersensitivity to metformin. Diabetic ketoacidosis...",
      "warnings": "Lactic acidosis is a rare but serious metabolic complication...",
      "interactions": "Alcohol: increased risk of lactic acidosis...",
      "pregnancy_lactation": "Limited data. Should not be used during pregnancy unless...",
      "adverse_effects": "Very common: gastrointestinal symptoms (nausea, vomiting, diarrhoea...)",
      "overdose": "Hypoglycaemia has not been seen with metformin doses up to 85g...",
      "storage": "Store below 25°C. Keep in the original package.",
      "shelf_life": "36 months"
    }
  ],
  "ppb_products": [
    {
      "registration_no": "PPB-001234",
      "trade_name": "GLUCOPHAGE 500MG",
      "active_ingredient": "Metformin Hydrochloride",
      "dosage_form": "Tablet",
      "manufacturer": "Merck Santé S.A.S.",
      "country_of_origin": "France",
      "date_registered": "2018-03-15",
      "date_expiry": "2028-03-14",
      "is_valid": true,
      "category": "POM"
    }
  ],
  "keml": [
    {
      "code": "18.1",
      "name": "Metformin",
      "dose_forms": [
        { "form": "Tablet", "strengths": ["500mg", "850mg"] }
      ],
      "subcategory": "Insulins and other antidiabetic agents",
      "sub_subcategory": "Oral hypoglycaemic agents",
      "level_of_use": 3,
      "level_description": "H3 (County Referral Hospital)",
      "footnotes": ""
    }
  ]
}
```

---

### 2. Get SmPC Detail

```
GET /drugs/smpc/{doc_id}
```

Retrieves the full SmPC monograph for a specific product.

#### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `doc_id` | string (path) | Yes | SmPC document ID (slug from PDF filename) |

#### Example

```bash
curl -H "X-API-Key: tb_your-key" \
  "https://tibabot.vitora.nexora.africa/drugs/smpc/smpc_amoxicillin_500mg_capsules"
```

#### Response

Returns the full `SmpcSummary` object (same schema as search results). Returns `404` if the document ID is not found.

---

### 3. Service Statistics

```
GET /drugs/stats
```

Health check and data statistics.

#### Example Response

```json
{
  "loaded": true,
  "smpc_count": 1819,
  "ppb_products_count": 2652,
  "keml_count": 366
}
```

---

## Data Models

### SmpcSummary

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (slug from PDF filename) |
| `product_name` | string | Product trade name |
| `title` | string | Document title |
| `filename` | string | Source PDF filename |
| `source_url` | string | URL to original PDF on PPB website |
| `pharmaceutical_form` | string | Dosage form (tablet, capsule, injection, etc.) |
| `active_ingredients` | string[] | List of active pharmaceutical ingredients |
| `indications` | string | Approved therapeutic indications |
| `posology` | string | Dosage and administration instructions |
| `contraindications` | string | When the drug must NOT be used |
| `warnings` | string | Special warnings and precautions |
| `interactions` | string | Drug-drug and drug-food interactions |
| `pregnancy_lactation` | string | Pregnancy/breastfeeding safety information |
| `adverse_effects` | string | Known side effects by frequency |
| `overdose` | string | Overdose symptoms and management |
| `storage` | string | Storage conditions |
| `shelf_life` | string | Product shelf life |

### PpbProduct

| Field | Type | Description |
|-------|------|-------------|
| `registration_no` | string | PPB registration number |
| `trade_name` | string | Registered trade name |
| `active_ingredient` | string | Active pharmaceutical ingredient |
| `dosage_form` | string | Dosage form |
| `manufacturer` | string | Manufacturer name |
| `country_of_origin` | string | Manufacturing country |
| `date_registered` | string | Registration date |
| `date_expiry` | string | Registration expiry date |
| `is_valid` | boolean | Whether registration is currently valid |
| `category` | string | Scheduling category (POM, OTC, etc.) |
| `keml_reference` | object \| null | Cross-reference to KEML entry if matched |

### KemlEntry

| Field | Type | Description |
|-------|------|-------------|
| `code` | string | KEML code (e.g. "6.2.1") |
| `name` | string | Generic medicine name |
| `dose_forms` | object[] | Available dose forms and strengths |
| `subcategory` | string | Therapeutic subcategory |
| `sub_subcategory` | string | More specific grouping |
| `level_of_use` | int | Facility level (1=H1 dispensary, 5=H5 national referral) |
| `level_description` | string | Human-readable level name |
| `footnotes` | string | Additional prescribing notes |

---

## Integration Patterns

### Pattern 1: Clinical Decision Support (Prescribing)

Use the formulary to validate a prescription against KEML availability at a facility level:

```javascript
// Check if drug is available at facility level
const response = await fetch('/drugs/search?q=artesunate&limit=5', {
  headers: { 'X-API-Key': apiKey }
});
const data = await response.json();

// Check KEML level
const kemlMatch = data.keml.find(k => k.level_of_use <= facilityLevel);
if (!kemlMatch) {
  showWarning('Drug not on KEML at your facility level');
}

// Cross-reference SmPC for contraindications
const smpcMatch = data.smpc[0];
if (smpcMatch) {
  checkContraindications(smpcMatch.contraindications, patientHistory);
}
```

### Pattern 2: Drug Interaction Checking

```javascript
// Search for both drugs, check interactions in SmPC
const drugA = await fetch('/drugs/search?q=metformin');
const drugB = await fetch('/drugs/search?q=alcohol');

const interactionsA = drugA.smpc[0]?.interactions || '';
if (interactionsA.toLowerCase().includes('alcohol')) {
  showInteractionWarning(interactionsA);
}
```

### Pattern 3: Registration Verification

```javascript
// Verify a product's PPB registration is current
const result = await fetch(`/drugs/search?q=${tradeName}`);
const product = result.ppb_products[0];

if (!product?.is_valid) {
  showAlert('Product registration has expired');
}
if (new Date(product.date_expiry) < new Date()) {
  showAlert('Registration expired on ' + product.date_expiry);
}
```

### Pattern 4: Patient Education (Linking from Reminders)

The Drug Formulary can be linked from medication reminders to provide patients with information about their prescriptions:

```javascript
// In the reminders page, link to formulary for more info
const searchUrl = `/formulary?q=${encodeURIComponent(medicationName)}`;
// or fetch SmPC directly
const smpc = await fetch(`/drugs/smpc/${docId}`);
showPatientInfo({
  whatItDoes: smpc.indications,
  howToTake: smpc.posology,
  sideEffects: smpc.adverse_effects,
  storage: smpc.storage
});
```

---

## Frontend Integration (Svelte UI)

The formulary is available at `/formulary` in the TibaBot UI with:

- **Debounced search** (300ms) with prefix matching
- **Color-coded results** by source: Blue (SmPC), Emerald (PPB Products), Purple (KEML)
- **Detail modals** for each source type with full clinical monograph view
- **KEML level badges** showing facility availability (H1–H5)
- **PPB validity indicators** (green check / red expired)

### API Client (from ui/src/lib/utils/api.js)

```javascript
import { api } from '$lib/utils/api.js';

// Search all sources
const results = await api('/drugs/search?q=paracetamol&limit=10');

// Get full SmPC
const smpc = await api(`/drugs/smpc/${docId}`);

// Stats
const stats = await api('/drugs/stats');
```

---

## Data Sources & Freshness

| Source | Origin | Update Frequency | Parser |
|--------|--------|------------------|--------|
| SmPC | [PPB SmPC Portal](https://web.pharmacyboardkenya.org/smpc/) | Scraped periodically | `scripts/scrape_ppb_smpc.py` → `scripts/parse_ppb_smpc.py` |
| PPB Products | PPB retention register export | Annual | Pre-processed JSON |
| KEML | Kenya Essential Medicines List 2023 (PDF → JSON) | Edition-based | Pre-processed JSON |

### Updating SmPC Data

```bash
# 1. Scrape PDFs from PPB portal
python scripts/scrape_ppb_smpc.py

# 2. Parse PDFs into structured JSON
python scripts/parse_ppb_smpc.py --workers 8

# 3. Output: data/kenya_clinical/ppb_smpc.json (35MB, 1819 docs)
# Coverage: indications 96%, contraindications 98%, adverse_effects 97%, posology 95%
```

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Cold start (first request) | ~2s (loads 35MB JSON into memory) |
| Subsequent searches | <10ms |
| Memory footprint | ~150MB (all three indexes) |
| Prefix matching threshold | 3+ characters |

The service is **stateless** and does **not** require a vector database — it uses in-memory token indexing for fast lookup.

---

## Error Responses

| Status | Meaning |
|--------|---------|
| `400` | Invalid query (too short/long) or invalid limit |
| `404` | SmPC document ID not found |
| `429` | Rate limit exceeded |
| `503` | Service not ready (data files not loaded) |

All errors follow the standard TibaBot error format:

```json
{
  "detail": "SmPC document 'invalid_id' not found"
}
```

---

## RAG Integration

SmPC data is also indexed in the Kenya Clinical RAG store for natural language queries via `/chat`. When a user asks about a drug (e.g., "What are the side effects of metformin?"), the RAG pipeline retrieves relevant SmPC sections alongside other Kenya clinical guidelines.

To index SmPC into the RAG vector store:

```python
# In notebooks/index_all_stores.ipynb, Mode 5 (Kenya Clinical)
# SmPC documents are chunked and indexed alongside MOH protocols
```

---

## KEML Facility Levels

The KEML `level_of_use` field maps to Kenya's tiered health system:

| Level | Code | Facility Type | Example |
|-------|------|---------------|---------|
| 1 | H1 | Community health units / dispensaries | Village health post |
| 2 | H2 | Health centres | Sub-county health centre |
| 3 | H3 | County referral hospitals | County hospital |
| 4 | H4 | National referral hospitals | Kenyatta National Hospital |
| 5 | H5 | Specialized institutions | Kenya Medical Research Institute |

A drug with `level_of_use: 3` means it should be available from H3 facilities and above.

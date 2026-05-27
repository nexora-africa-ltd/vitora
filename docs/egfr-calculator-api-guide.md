# TibaBot eGFR Calculator API Guide

> Estimated Glomerular Filtration Rate (eGFR) calculation with CKD staging and renal dose adjustment guidance for healthcare providers.

For general API authentication and setup, see [api-guide.md](api-guide.md).

---

## Overview

The eGFR Calculator provides:
- **CKD-EPI 2021** (race-free) equation — KDIGO/NKF recommended for CKD staging
- **Cockcroft-Gault** equation — standard for drug dosing adjustments
- **CKD staging** (G1–G5) with clinical interpretation
- **Dose adjustment bands** for renal prescribing
- **Clinical action flags** (nephrology referral, drug avoidance, monitoring)

## Base URL

| Environment | URL |
|-------------|-----|
| Production | `https://tibabot.vitora.nexora.africa/clinical/egfr` |
| Local Dev | `http://localhost:8000/clinical/egfr` |

## Authentication

Requires facility API key via `X-API-Key` header. See [facility-auth-guide.md](facility-auth-guide.md).

## Feature Flag

| Variable | Default | Description |
|----------|---------|-------------|
| `TIBABOT_ENABLE_EGFR` | `true` | Enable/disable the eGFR calculator endpoint |

---

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/clinical/egfr/health` | GET | No | Service health check |
| `/clinical/egfr/calculate` | POST | Yes | Calculate eGFR with staging |

---

## 1. Health Check

```
GET /clinical/egfr/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "equations": ["CKD-EPI 2021 (race-free)", "Cockcroft-Gault"]
}
```

---

## 2. Calculate eGFR

```
POST /clinical/egfr/calculate
```

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `creatinine` | float | Yes | — | Serum creatinine value (>0) |
| `creatinine_unit` | string | No | `"mg/dL"` | `"mg/dL"` or `"umol/L"` |
| `age` | int | Yes | — | Patient age in years (18–120) |
| `sex` | string | Yes | — | `"male"` or `"female"` |
| `weight_kg` | float | No | — | Body weight in kg (needed for Cockcroft-Gault) |
| `height_cm` | float | No | — | Height in cm (future BSA adjustment) |

> **Kenya labs** typically report creatinine in µmol/L. Set `creatinine_unit: "umol/L"`.

### Example Request (Kenya, µmol/L)

```json
{
  "creatinine": 150,
  "creatinine_unit": "umol/L",
  "age": 55,
  "sex": "male",
  "weight_kg": 70
}
```

### Example Request (US, mg/dL)

```json
{
  "creatinine": 1.7,
  "creatinine_unit": "mg/dL",
  "age": 55,
  "sex": "male",
  "weight_kg": 70
}
```

### Response

```json
{
  "egfr_ckd_epi": 47.1,
  "egfr_cockcroft_gault": 48.7,
  "ckd_stage": "G3a",
  "category": "Mildly to moderately decreased",
  "dose_adjustment_band": "mild",
  "flags": [
    "monitor_egfr_quarterly",
    "check_urine_acr"
  ],
  "interpretation": "eGFR 47.1 mL/min/1.73m² — CKD Stage G3a (Mildly to moderately decreased). Mild impairment — check renally-cleared drugs for dose adjustment.",
  "creatinine_used_mg_dl": 1.697
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `egfr_ckd_epi` | float | eGFR by CKD-EPI 2021 (mL/min/1.73m²) |
| `egfr_cockcroft_gault` | float \| null | CrCl by Cockcroft-Gault (mL/min). Null if weight not provided. |
| `ckd_stage` | string | KDIGO stage: G1, G2, G3a, G3b, G4, G5 |
| `category` | string | Human-readable kidney function category |
| `dose_adjustment_band` | string | Renal dosing band (see table below) |
| `flags` | string[] | Clinical action flags |
| `interpretation` | string | Provider-facing summary text |
| `creatinine_used_mg_dl` | float | Creatinine value used (converted to mg/dL) |

---

## CKD Staging (KDIGO 2012)

| Stage | eGFR (mL/min/1.73m²) | Category | Action |
|-------|----------------------|----------|--------|
| G1 | ≥ 90 | Normal or high | Monitor if risk factors present |
| G2 | 60–89 | Mildly decreased | Estimate progression |
| G3a | 45–59 | Mildly to moderately decreased | Monitor quarterly |
| G3b | 30–44 | Moderately to severely decreased | Avoid nephrotoxins, dose adjust |
| G4 | 15–29 | Severely decreased | Refer nephrology, prepare for RRT |
| G5 | < 15 | Kidney failure | Dialysis / transplant evaluation |

## Dose Adjustment Bands

| Band | eGFR Range | Prescribing Action |
|------|------------|-------------------|
| `normal` | ≥ 60 | No adjustment needed |
| `mild` | 45–59 | Check labels for renally-cleared drugs |
| `moderate` | 30–44 | Dose reduce renally-cleared medications |
| `severe` | 15–29 | Significant dose reduction or avoidance |
| `dialysis` | < 15 | Use dialysis-dosed regimens |

## Clinical Flags

| Flag | Triggered When | Clinical Action |
|------|---------------|-----------------|
| `refer_nephrology` | G4, G5 | Urgent nephrology referral |
| `avoid_nsaids` | G3b, G4, G5 | Contraindicate NSAIDs |
| `avoid_nephrotoxins` | G3b, G4, G5 | Avoid aminoglycosides, contrast |
| `check_potassium` | G4, G5 | Monitor for hyperkalaemia |
| `check_phosphate` | G4, G5 | Monitor for CKD-MBD |
| `check_pth` | G4, G5 | PTH for secondary hyperparathyroidism |
| `discuss_rrt_options` | G5 | Renal replacement therapy planning |
| `monitor_egfr_quarterly` | G3a+ | Repeat eGFR every 3 months |
| `check_urine_acr` | G3a+ | Urine albumin-to-creatinine ratio |
| `adjust_metformin_dose` | G3b, G4, G5 | Reduce or stop metformin |
| `avoid_gadolinium_contrast` | eGFR < 30 | NSF risk |
| `caution_iv_contrast` | eGFR < 45 | Contrast-induced AKI risk |

---

## Equations Used

### CKD-EPI 2021 (Race-Free)

Reference: Inker LA et al. *N Engl J Med* 2021;385:1737-49.

```
Female, Cr ≤ 0.7:  142 × (Cr/0.7)^(-0.241)  × 0.9938^age × 1.012
Female, Cr > 0.7:  142 × (Cr/0.7)^(-1.200)  × 0.9938^age × 1.012
Male,   Cr ≤ 0.9:  142 × (Cr/0.9)^(-0.302)  × 0.9938^age
Male,   Cr > 0.9:  142 × (Cr/0.9)^(-1.200)  × 0.9938^age
```

### Cockcroft-Gault

Reference: Cockcroft DW, Gault MH. *Nephron* 1976;16:31-41.

```
CrCl (mL/min) = [(140 − age) × weight(kg)] / [72 × Cr(mg/dL)]
                 × 0.85 if female
```

---

## Integration Examples

### cURL

```bash
curl -X POST https://tibabot.vitora.nexora.africa/clinical/egfr/calculate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_KEY" \
  -d '{
    "creatinine": 150,
    "creatinine_unit": "umol/L",
    "age": 55,
    "sex": "male",
    "weight_kg": 70
  }'
```

### JavaScript (Vitora HMIS)

```javascript
const result = await fetch('/clinical/egfr/calculate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey
  },
  body: JSON.stringify({
    creatinine: 150,
    creatinine_unit: 'umol/L',
    age: 55,
    sex: 'male',
    weight_kg: 70
  })
}).then(r => r.json());

if (result.dose_adjustment_band !== 'normal') {
  showDoseWarning(result.flags, result.interpretation);
}
```

### Python

```python
import httpx

resp = httpx.post(
    "http://localhost:8000/clinical/egfr/calculate",
    headers={"X-API-Key": "your-key"},
    json={
        "creatinine": 150,
        "creatinine_unit": "umol/L",
        "age": 55,
        "sex": "male",
        "weight_kg": 70,
    },
)
result = resp.json()
print(f"CKD Stage: {result['ckd_stage']} — {result['interpretation']}")
```

---

## Error Responses

| Status | Cause | Example |
|--------|-------|---------|
| 401 | Missing/invalid API key | `{"detail": "Invalid or missing API key"}` |
| 422 | Validation error | `{"detail": [{"loc": ["body","age"], "msg": "ensure this value is greater than or equal to 18"}]}` |
| 500 | Calculation error | `{"detail": "eGFR calculation failed"}` |
| 503 | Service unavailable | `{"detail": "eGFR calculator service not available"}` |

---

## Integration with Other TibaBot Features

The eGFR calculator is designed to feed into:

1. **Drug Formulary** — `dose_adjustment_band` informs renal dosing alerts
2. **CDS Rules** — replaces crude creatinine > 2.0 checks with proper staging
3. **Lab Interpreter** — enriches renal panel interpretation with CKD context
4. **ICU Predictor** — baseline eGFR provides context for AKI staging
5. **Care Plans** — CKD-stage-appropriate monitoring schedules

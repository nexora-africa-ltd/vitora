# TibaBot ECG Interpreter API Guide

API guide for the AI ECG/EKG Interpreter — structured interpretation, serial comparison, file upload (image & machine formats), clinical risk scores (CHA₂DS₂-VASc, HAS-BLED), pattern catalog, and PDF report generation. These endpoints extend the core TibaBot API documented in [api-guide.md](api-guide.md).

## Base URL

| Environment | URL |
|-------------|-----|
| **Production** | `https://tibabot.vitora.nexora.africa` |
| **Local Dev** | `http://localhost:8000` |

## Authentication

Same as the core API — see [api-guide.md](api-guide.md#authentication). All endpoints except `/clinical/ecg/patterns` require facility API key authentication via `X-API-Key` header.

---

## Feature Flag

| Flag | Default | Description |
|------|---------|-------------|
| `TIBABOT_ENABLE_ECG_INTERPRETER` | `true` | Enable all `/clinical/ecg/*` endpoints |

> When disabled, all ECG endpoints return `404`. The flag is checked at router registration time.

---

## Endpoints Overview

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/clinical/ecg/interpret` | POST | **Yes** | Interpret ECG findings (structured or free-text) |
| `/clinical/ecg/compare` | POST | **Yes** | Compare two ECGs for serial change detection |
| `/clinical/ecg/upload` | POST | **Yes** | Upload ECG image/file for auto-interpretation |
| `/clinical/ecg/report` | POST | **Yes** | Generate downloadable PDF report |
| `/clinical/ecg/scores/cha2ds2-vasc` | POST | **Yes** | Calculate CHA₂DS₂-VASc stroke risk score |
| `/clinical/ecg/scores/has-bled` | POST | **Yes** | Calculate HAS-BLED bleeding risk score |
| `/clinical/ecg/patterns` | GET | No | List all supported ECG patterns/diagnoses |

---

## 1. Interpret ECG

Accepts structured ECG parameters (intervals, morphology) or free-text findings. Returns structured interpretation with urgency level, differentials, and recommended actions.

Supports two input modes:
- **Structured**: Provide individual fields (heart rate, intervals, morphology)
- **Free-text**: Provide machine-generated ECG report text via `raw_findings`

### Request

```http
POST /clinical/ecg/interpret
Content-Type: application/json
X-API-Key: your-facility-key
```

```json
{
  "heart_rate": 142,
  "rhythm": "irregularly irregular",
  "axis": "normal",
  "pr_interval": null,
  "qrs_duration": 88,
  "qtc_interval": 480,
  "p_wave": "absent",
  "st_segment": "depression_lateral",
  "t_wave": "inverted_lateral",
  "q_waves": null,
  "bundle_branch": null,
  "raw_findings": null,
  "clinical_context": "68yo female, chest pain, known hypertension",
  "medications": ["metoprolol", "aspirin"],
  "age": 68,
  "sex": "female",
  "include_fhir": false,
  "verbosity": "standard",
  "provider_role": "clinical_officer",
  "facility_level": "H3"
}
```

#### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `heart_rate` | int | No | Ventricular rate (bpm) |
| `rhythm` | string | No | `"regular"`, `"irregularly irregular"`, `"regularly irregular"` |
| `axis` | string | No | `"normal"`, `"LAD"`, `"RAD"`, `"extreme"` |
| `pr_interval` | int | No | PR interval in milliseconds |
| `qrs_duration` | int | No | QRS duration in milliseconds |
| `qtc_interval` | int | No | Corrected QT (Bazett formula) in ms |
| `p_wave` | string | No | P-wave morphology (e.g., `"absent"`, `"peaked"`, `"bifid"`) |
| `st_segment` | string | No | ST changes (e.g., `"elevation_anterior"`, `"depression_lateral"`) |
| `t_wave` | string | No | T-wave changes (e.g., `"inverted_anterior"`, `"peaked"`) |
| `q_waves` | string | No | Q-wave description (e.g., `"pathological_inferior"`) |
| `bundle_branch` | string | No | `"RBBB"`, `"LBBB"`, `"LAFB"`, `"LPFB"` |
| `raw_findings` | string | No | Free-text ECG report (alternative to structured fields) |
| `clinical_context` | string | No | Brief clinical history |
| `medications` | string[] | No | Current medications (drug interaction checks) |
| `age` | int | No | Patient age in years |
| `sex` | string | No | `"male"` or `"female"` |
| `include_fhir` | bool | No | Include FHIR DiagnosticReport in response (default: `false`) |
| `verbosity` | string | No | `"concise"`, `"standard"` (default), `"detailed"` |
| `provider_role` | string | No | Provider role for content adaptation |
| `facility_level` | string | No | Kenya MOH facility level (`"H1"`–`"H5"`) |

> **Note**: At minimum, provide either structured fields OR `raw_findings`. Providing both prioritizes structured data.

### Response

```json
{
  "interpretation": "Atrial fibrillation with rapid ventricular response. Lateral ST depression and T-wave inversion suggest ischaemia or rate-related changes.",
  "rhythm_diagnosis": "Atrial fibrillation",
  "rate_category": "tachycardia",
  "findings": [
    {
      "component": "rhythm",
      "value": "irregularly irregular",
      "interpretation": "Atrial fibrillation — absent P waves with irregularly irregular ventricular response",
      "severity": "abnormal"
    },
    {
      "component": "rate",
      "value": "142",
      "interpretation": "Rapid ventricular response (target <110 bpm at rest)",
      "severity": "abnormal"
    },
    {
      "component": "qtc",
      "value": "480",
      "interpretation": "Prolonged QTc — monitor for Torsades risk",
      "severity": "borderline"
    },
    {
      "component": "st_segment",
      "value": "depression_lateral",
      "interpretation": "Lateral ST depression — consider ischaemia, LVH, or rate-related",
      "severity": "abnormal"
    }
  ],
  "clinical_significance": "New-onset atrial fibrillation with rapid rate and possible ischaemia. Requires rate control and anticoagulation assessment.",
  "differentials": [
    {
      "condition": "Atrial fibrillation with RVR",
      "probability": "high",
      "supporting_evidence": ["absent P waves", "irregularly irregular rhythm", "rate 142"],
      "icd10": "I48.0"
    },
    {
      "condition": "Acute coronary syndrome",
      "probability": "moderate",
      "supporting_evidence": ["lateral ST depression", "T-wave inversion", "chest pain"],
      "icd10": "I21.4"
    }
  ],
  "urgency": "urgent",
  "action_required": [
    "Rate control: IV metoprolol or diltiazem (target HR <110)",
    "12-lead ECG serial monitoring (repeat in 1 hour)",
    "Troponin I/T to rule out ACS",
    "Calculate CHA₂DS₂-VASc for anticoagulation decision",
    "Cardiology review within 4 hours"
  ],
  "sgarbossa_score": null,
  "wellens_criteria": null,
  "brugada_pattern": null,
  "fhir_diagnostic_report": null,
  "loinc_codes": ["8601-7"],
  "icd10_codes": ["I48.0"],
  "confidence": 0.85,
  "sources": ["rules_engine", "pattern_matching"],
  "disclaimer": "This is a clinical decision support tool and does not replace expert clinical judgement. Always correlate with clinical context."
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `interpretation` | string | Natural language summary of findings |
| `rhythm_diagnosis` | string | Primary rhythm diagnosis |
| `rate_category` | string | `"bradycardia"` / `"normal"` / `"tachycardia"` |
| `findings` | ECGFinding[] | Structured findings by component |
| `clinical_significance` | string | Clinical implications summary |
| `differentials` | Differential[] | Ranked differential diagnoses with evidence |
| `urgency` | string | `"emergent"` / `"urgent"` / `"routine"` |
| `action_required` | string[] | Recommended clinical actions |
| `sgarbossa_score` | int \| null | Modified Sgarbossa score (with LBBB/paced) |
| `wellens_criteria` | bool \| null | Wellens syndrome pattern detected |
| `brugada_pattern` | bool \| null | Brugada ECG pattern detected |
| `fhir_diagnostic_report` | object \| null | FHIR R4 DiagnosticReport (when `include_fhir: true`) |
| `loinc_codes` | string[] | Applicable LOINC codes |
| `icd10_codes` | string[] | ICD-10 codes for detected conditions |
| `confidence` | float | Interpretation confidence (0.0–1.0) |
| `sources` | string[] | Interpretation source tags |
| `disclaimer` | string | Clinical disclaimer text |

---

## 2. Compare ECGs (Serial Change Detection)

Identifies interval changes, new findings, and clinical progression between a baseline and current ECG.

### Request

```http
POST /clinical/ecg/compare
Content-Type: application/json
X-API-Key: your-facility-key
```

```json
{
  "baseline": {
    "heart_rate": 72,
    "rhythm": "regular",
    "pr_interval": 180,
    "qrs_duration": 90,
    "qtc_interval": 420,
    "st_segment": "normal",
    "t_wave": "normal"
  },
  "current": {
    "heart_rate": 68,
    "rhythm": "regular",
    "pr_interval": 220,
    "qrs_duration": 130,
    "qtc_interval": 450,
    "st_segment": "normal",
    "t_wave": "normal",
    "bundle_branch": "LBBB"
  },
  "interval_hours": 48,
  "clinical_context": "Post cardiac catheterization"
}
```

### Response

```json
{
  "changes": [
    {
      "component": "pr_interval",
      "baseline_value": "180 ms",
      "current_value": "220 ms",
      "interpretation": "Interval prolongation — developing first-degree AV block",
      "significance": "notable"
    },
    {
      "component": "qrs_duration",
      "baseline_value": "90 ms",
      "current_value": "130 ms",
      "interpretation": "New QRS widening with LBBB morphology",
      "significance": "critical"
    }
  ],
  "clinical_significance": "New LBBB with PR prolongation post-catheterization. May indicate procedural complication (septal branch occlusion or conduction system injury).",
  "progression": "worsened",
  "action_required": [
    "Urgent cardiology review",
    "Consider troponin for peri-procedural MI",
    "Continuous telemetry monitoring",
    "Assess for complete heart block progression"
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `changes` | ECGChange[] | Detected changes between recordings |
| `clinical_significance` | string | Summary of change implications |
| `progression` | string | `"improved"` / `"stable"` / `"worsened"` / `"new_findings"` |
| `action_required` | string[] | Recommended actions based on changes |

Each `ECGChange` contains:

| Field | Type | Description |
|-------|------|-------------|
| `component` | string | ECG component that changed |
| `baseline_value` | string | Value on baseline ECG |
| `current_value` | string | Value on current ECG |
| `interpretation` | string | Clinical interpretation of the change |
| `significance` | string | `"insignificant"` / `"notable"` / `"critical"` |

---

## 3. Upload ECG File

Upload an ECG image (photo of printed strip) or machine format file. The system automatically detects the format, parses/digitizes the file, extracts parameters, and runs interpretation.

### Supported Formats

| Format | Extensions | Description |
|--------|-----------|-------------|
| **Images** | `.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif`, `.bmp` | Photo of a printed 12-lead ECG strip |
| **DICOM** | `.dcm` | DICOM waveform (standard medical imaging) |
| **GE MUSE XML** | `.xml` | GE Healthcare MUSE ECG export |
| **HL7 aECG** | `.xml` | HL7 Annotated ECG (FDA format) |
| **SCP-ECG** | `.scp` | Standard Communication Protocol for ECG |

### Request

```http
POST /clinical/ecg/upload
Content-Type: multipart/form-data
X-API-Key: your-facility-key
```

```
file: <binary ECG file, max 10 MB>
```

#### cURL Example

```bash
curl -X POST https://tibabot.vitora.nexora.africa/clinical/ecg/upload \
  -H "X-API-Key: your-facility-key" \
  -F "file=@/path/to/ecg_strip.jpg"
```

#### JavaScript (fetch)

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/clinical/ecg/upload', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey },
  body: formData
});
const result = await response.json();
```

### Response

```json
{
  "interpretation": {
    "interpretation": "Sinus tachycardia at 110 bpm...",
    "rhythm_diagnosis": "Sinus tachycardia",
    "rate_category": "tachycardia",
    "findings": [...],
    "urgency": "routine",
    "...": "same structure as /interpret response"
  },
  "source_format": "image",
  "extracted_parameters": {
    "heart_rate": 110,
    "rhythm": "regular",
    "qrs_duration": 88
  },
  "quality_score": 0.82,
  "warnings": [
    "Grid detection confidence low — ensure image has standard ECG grid"
  ]
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `interpretation` | ECGInterpretResponse | Full interpretation (same as `/interpret` response) |
| `source_format` | string | `"image"`, `"dicom"`, `"muse_xml"`, `"hl7_aecg"`, `"scp_ecg"` |
| `extracted_parameters` | object | Parameters extracted from the file |
| `quality_score` | float \| null | Image quality (0.0–1.0), only for image uploads |
| `warnings` | string[] | Processing warnings (low quality, missing leads, etc.) |

#### Image Upload Tips

- Use a well-lit, flat photo with the full 12-lead visible
- Standard ECG paper grid (25 mm/s, 10 mm/mV) improves accuracy
- Crop to just the ECG strip (avoid patient stickers, headers)
- Minimum resolution: 800×600 pixels recommended

---

## 4. Generate PDF Report

Generate a downloadable PDF clinical report from interpretation results. Suitable for printing and filing in patient records.

### Request

```http
POST /clinical/ecg/report
Content-Type: application/json
X-API-Key: your-facility-key
```

```json
{
  "interpretation": {
    "interpretation": "Atrial fibrillation with rapid ventricular response...",
    "rhythm_diagnosis": "Atrial fibrillation",
    "rate_category": "tachycardia",
    "findings": [...],
    "urgency": "urgent",
    "action_required": [...]
  },
  "patient_context": {
    "name": "Jane Wanjiku",
    "age": 68,
    "sex": "female",
    "id": "MRN-12345"
  },
  "facility_name": "Kenyatta National Hospital",
  "provider_name": "Dr. Ochieng"
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `interpretation` | object | **Yes** | Full interpretation result (from `/interpret` or `/upload`) |
| `patient_context` | object | No | Patient demographics for the report header |
| `facility_name` | string | No | Facility name printed on report |
| `provider_name` | string | No | Ordering/interpreting provider name |

### Response

Returns raw PDF bytes with appropriate headers:

```
Content-Type: application/pdf
Content-Disposition: attachment; filename=ecg_report.pdf
```

#### JavaScript Download Example

```javascript
const response = await fetch('/clinical/ecg/report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey
  },
  body: JSON.stringify(reportRequest)
});

const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'ecg_report.pdf';
a.click();
```

---

## 5. CHA₂DS₂-VASc Stroke Risk Score

Calculate stroke risk in atrial fibrillation patients. Used to determine anticoagulation indication.

### Request

```http
POST /clinical/ecg/scores/cha2ds2-vasc
Content-Type: application/json
X-API-Key: your-facility-key
```

```json
{
  "age": 72,
  "sex": "female",
  "congestive_heart_failure": false,
  "hypertension": true,
  "stroke_tia_thromboembolism": false,
  "vascular_disease": true,
  "diabetes": true
}
```

#### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `age` | int | **Yes** | Patient age (65–74 = 1pt, ≥75 = 2pt) |
| `sex` | string | **Yes** | `"male"` or `"female"` (female = 1pt) |
| `congestive_heart_failure` | bool | No | CHF or LVEF ≤40% (1pt) |
| `hypertension` | bool | No | Treated or BP >140/90 (1pt) |
| `stroke_tia_thromboembolism` | bool | No | Prior stroke/TIA/VTE (2pt) |
| `vascular_disease` | bool | No | Prior MI, PAD, aortic plaque (1pt) |
| `diabetes` | bool | No | Diabetes mellitus (1pt) |

### Response

```json
{
  "score": 5,
  "max_score": 9,
  "risk_category": "high",
  "annual_stroke_risk_percent": 6.7,
  "recommendation": "Oral anticoagulation strongly recommended (warfarin INR 2-3 or DOAC). In Kenya, rivaroxaban or apixaban preferred if available; warfarin with INR monitoring otherwise.",
  "components": {
    "C_heart_failure": 0,
    "H_hypertension": 1,
    "A2_age_75": 0,
    "D_diabetes": 1,
    "S2_stroke": 0,
    "V_vascular": 1,
    "A_age_65_74": 1,
    "Sc_sex_female": 1
  },
  "anticoagulation_indicated": true,
  "sources": [
    "ESC 2020 AF Guidelines",
    "AHA/ACC/HRS 2019 AF Focused Update"
  ]
}
```

---

## 6. HAS-BLED Bleeding Risk Score

Assess bleeding risk for patients on anticoagulation. Used alongside CHA₂DS₂-VASc — a high HAS-BLED score does **not** contraindicate anticoagulation but indicates need for closer monitoring.

### Request

```http
POST /clinical/ecg/scores/has-bled
Content-Type: application/json
X-API-Key: your-facility-key
```

```json
{
  "hypertension_uncontrolled": true,
  "renal_disease": false,
  "liver_disease": false,
  "stroke_history": false,
  "bleeding_history": true,
  "labile_inr": true,
  "age_over_65": true,
  "drugs_predisposing": true,
  "alcohol_excess": false
}
```

#### Input Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hypertension_uncontrolled` | bool | No | SBP > 160 mmHg (1pt) |
| `renal_disease` | bool | No | Dialysis, transplant, Cr > 2.26 mg/dL (1pt) |
| `liver_disease` | bool | No | Cirrhosis, bilirubin >2×, AST/ALT >3× (1pt) |
| `stroke_history` | bool | No | Prior stroke (1pt) |
| `bleeding_history` | bool | No | Prior major bleed or predisposition (1pt) |
| `labile_inr` | bool | No | Time in therapeutic range < 60% (1pt) |
| `age_over_65` | bool | No | Age > 65 years (1pt) |
| `drugs_predisposing` | bool | No | NSAIDs, antiplatelets (1pt) |
| `alcohol_excess` | bool | No | ≥8 drinks/week (1pt) |

### Response

```json
{
  "score": 5,
  "max_score": 9,
  "risk_category": "high",
  "annual_bleed_risk_percent": 12.5,
  "recommendation": "High bleeding risk. Anticoagulation still indicated if CHA₂DS₂-VASc ≥2 but ensure: BP control, medication review (stop NSAIDs), frequent INR checks (if warfarin), and patient education on bleeding signs. Consider DOAC over warfarin.",
  "components": {
    "H_hypertension": 1,
    "A_abnormal_renal": 0,
    "A_abnormal_liver": 0,
    "S_stroke": 0,
    "B_bleeding": 1,
    "L_labile_inr": 1,
    "E_elderly": 1,
    "D_drugs": 1,
    "D_alcohol": 0
  },
  "sources": [
    "ESC 2020 AF Guidelines",
    "Pisters et al. Chest 2010"
  ]
}
```

---

## 7. List ECG Patterns

Returns the catalog of all ECG patterns and diagnoses the system can identify.

### Request

```http
GET /clinical/ecg/patterns
```

No authentication required.

### Response

```json
[
  {
    "id": "stemi_anterior",
    "name": "Anterior STEMI",
    "category": "Acute Coronary Syndrome",
    "criteria": "ST elevation ≥2mm in V1-V4 with reciprocal depression",
    "icd10": "I21.0"
  },
  {
    "id": "afib",
    "name": "Atrial Fibrillation",
    "category": "Arrhythmia",
    "criteria": "Absent P waves, irregularly irregular RR intervals",
    "icd10": "I48.0"
  },
  {
    "id": "lbbb",
    "name": "Left Bundle Branch Block",
    "category": "Conduction",
    "criteria": "QRS ≥120ms, broad R in I/V5-V6, absence of Q in V5-V6",
    "icd10": "I44.7"
  }
]
```

---

## Integration Patterns

### Workflow: HMIS ECG Order → Interpretation → Report Filing

Typical integration flow for Vitora or third-party HMIS systems:

```
┌─────────────┐     ┌───────────────┐     ┌──────────────┐
│ HMIS Order  │────▶│ TibaBot ECG   │────▶│ PDF Report   │
│ (clinician) │     │ /interpret    │     │ /report      │
└─────────────┘     └───────────────┘     └──────────────┘
       │                    │                      │
       │                    ▼                      ▼
       │            ┌───────────────┐     ┌──────────────┐
       └───────────▶│ FHIR Resource │     │ File in EMR  │
                    │ DiagReport    │     │ patient chart│
                    └───────────────┘     └──────────────┘
```

### Step-by-Step Integration

```javascript
// 1. Clinician enters ECG findings in HMIS
const ecgData = {
  heart_rate: 88,
  rhythm: "regular",
  pr_interval: 200,
  qrs_duration: 110,
  qtc_interval: 440,
  st_segment: "normal",
  t_wave: "normal",
  clinical_context: patientHistory,
  age: patient.age,
  sex: patient.sex,
  include_fhir: true  // Get FHIR resource for EMR
};

// 2. Get interpretation
const interpretation = await fetch('/clinical/ecg/interpret', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': facilityKey },
  body: JSON.stringify(ecgData)
}).then(r => r.json());

// 3. Display urgency alert if needed
if (interpretation.urgency === 'emergent') {
  showCriticalAlert(interpretation.action_required);
}

// 4. If AF detected, calculate stroke risk
if (interpretation.icd10_codes.includes('I48.0')) {
  const strokeRisk = await fetch('/clinical/ecg/scores/cha2ds2-vasc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': facilityKey },
    body: JSON.stringify({
      age: patient.age,
      sex: patient.sex,
      hypertension: patient.hasHypertension,
      diabetes: patient.hasDiabetes,
      // ... other risk factors
    })
  }).then(r => r.json());
}

// 5. Generate PDF for patient file
const pdfBlob = await fetch('/clinical/ecg/report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': facilityKey },
  body: JSON.stringify({
    interpretation,
    patient_context: { name: patient.name, age: patient.age, id: patient.mrn },
    facility_name: facility.name,
    provider_name: currentUser.name
  })
}).then(r => r.blob());

// 6. Store FHIR DiagnosticReport in EMR
if (interpretation.fhir_diagnostic_report) {
  await emrClient.createResource(interpretation.fhir_diagnostic_report);
}
```

### Workflow: Mobile ECG Photo Upload

For field clinicians using the mobile app (or any client with camera access):

```javascript
// 1. Capture or select ECG photo
const formData = new FormData();
formData.append('file', ecgPhotoFile);

// 2. Upload for interpretation
const result = await fetch('/clinical/ecg/upload', {
  method: 'POST',
  headers: { 'X-API-Key': facilityKey },
  body: formData
}).then(r => r.json());

// 3. Check quality
if (result.quality_score < 0.5) {
  showWarning('Image quality low — consider retaking photo');
}

// 4. Use interpretation as normal
displayResult(result.interpretation);
```

---

## FHIR Integration

When `include_fhir: true` is set on the interpret request, the response includes a FHIR R4 `DiagnosticReport` resource with:

- `resourceType`: `"DiagnosticReport"`
- `status`: `"final"`
- `category`: Cardiology (LOINC)
- `code`: ECG (LOINC 8601-7)
- `conclusion`: Interpretation text
- `conclusionCode`: ICD-10 codes as `CodeableConcept`

This can be directly POSTed to any FHIR R4-compliant EMR.

---

## Urgency Levels & Clinical Actions

| Urgency | Meaning | Expected Response |
|---------|---------|-------------------|
| `emergent` | Life-threatening ECG pattern | Immediate intervention, activate code team |
| `urgent` | Significant abnormality requiring prompt attention | Review within 1–4 hours, specialist consult |
| `routine` | Normal or minor finding | Standard follow-up |

### Emergent Patterns (trigger immediate alert)

- ST elevation ≥2mm (STEMI)
- Ventricular tachycardia / fibrillation
- Complete heart block
- Brugada pattern (Type 1)
- Massive PE pattern (S1Q3T3 + RV strain)
- Hyperkalaemia (peaked T + widened QRS)

---

## Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| `400` | Invalid input (missing required fields, bad file format, file too large) | Check request body/file |
| `401` | Missing or invalid API key | Verify `X-API-Key` header |
| `404` | Feature disabled (`TIBABOT_ENABLE_ECG_INTERPRETER=false`) | Enable feature flag |
| `413` | File exceeds 10 MB limit | Compress or resize image |
| `429` | Rate limit exceeded | Back off and retry |
| `500` | Internal processing error | Retry; if persistent, report |

Error response format:

```json
{
  "detail": "ECG file processing failed"
}
```

---

## Rate Limits

Standard facility rate limits apply (default: 30 requests/60 seconds). The `/clinical/ecg/upload` endpoint counts as 1 request despite heavier processing.

---

## Kenya-Specific Considerations

- **Facility levels** (`facility_level`): Recommendations adapt to MOH facility levels (H1 dispensary → H5 national referral). E.g., H1/H2 may get "Refer to H3+ for cardiology review" while H4/H5 get specific intervention protocols.
- **Anticoagulation guidance**: CHA₂DS₂-VASc recommendations reference Kenyan drug availability (rivaroxaban/apixaban vs. warfarin with INR monitoring).
- **Emergency numbers**: Emergent findings include Kenya emergency numbers (999/112).
- **Provider role adaptation**: `provider_role` adjusts language complexity (clinical officer vs. specialist cardiologist).

---

## SDK Examples

### Python

```python
import httpx

client = httpx.Client(
    base_url="https://tibabot.vitora.nexora.africa",
    headers={"X-API-Key": "your-facility-key"}
)

# Interpret
result = client.post("/clinical/ecg/interpret", json={
    "heart_rate": 88,
    "rhythm": "regular",
    "pr_interval": 200,
    "age": 55,
    "sex": "male"
}).json()

# Upload file
with open("ecg_strip.jpg", "rb") as f:
    result = client.post("/clinical/ecg/upload", files={"file": f}).json()

# CHA₂DS₂-VASc
score = client.post("/clinical/ecg/scores/cha2ds2-vasc", json={
    "age": 72, "sex": "female", "hypertension": True, "diabetes": True
}).json()
```

### Dart (Flutter)

```dart
final dio = Dio(BaseOptions(
  baseUrl: 'https://tibabot.vitora.nexora.africa',
  headers: {'X-API-Key': apiKey},
));

// Interpret
final response = await dio.post('/clinical/ecg/interpret', data: {
  'heart_rate': 88,
  'rhythm': 'regular',
  'age': 55,
  'sex': 'male',
});

// Upload file
final formData = FormData.fromMap({
  'file': await MultipartFile.fromFile(filePath, filename: 'ecg.jpg'),
});
final uploadResponse = await dio.post('/clinical/ecg/upload', data: formData);
```

### cURL

```bash
# Interpret
curl -X POST https://tibabot.vitora.nexora.africa/clinical/ecg/interpret \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-facility-key" \
  -d '{"heart_rate": 88, "rhythm": "regular", "age": 55, "sex": "male"}'

# Upload
curl -X POST https://tibabot.vitora.nexora.africa/clinical/ecg/upload \
  -H "X-API-Key: your-facility-key" \
  -F "file=@ecg_strip.jpg"

# CHA₂DS₂-VASc
curl -X POST https://tibabot.vitora.nexora.africa/clinical/ecg/scores/cha2ds2-vasc \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-facility-key" \
  -d '{"age": 72, "sex": "female", "hypertension": true, "diabetes": true}'
```

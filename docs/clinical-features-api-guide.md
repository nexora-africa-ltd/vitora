# TibaBot Clinical Features API Guide

Supplementary API guide for the clinical decision support features implemented as part of the [Clinical Features Plan](clinical_features_plan.md). These endpoints extend the core TibaBot API documented in [api-guide.md](api-guide.md).

## Base URL

| Environment | URL |
|-------------|-----|
| **Production** | `https://tibabot.hmis.nexora.africa` |
| **Local Dev** | `http://localhost:8000` |

## Authentication

Same as the core API — see [ai-api-guide.md](ai-api-guide.md#authentication). All clinical feature endpoints that modify or evaluate patient data require API key authentication. Health and listing endpoints are public.

---

## Endpoints Overview

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/cds/health` | GET | No | CDS Rules Engine health |
| `/cds/evaluate` | POST | **Yes** | Evaluate CDS rules against patient data |
| `/cds/rules` | GET | **Yes** | List available CDS rules |
| `/lab/health` | GET | No | Lab Assist service health |
| `/lab/interpret` | POST | **Yes** | Interpret lab results |
| `/discharge/health` | GET | No | Discharge Readiness service health |
| `/discharge/conditions` | GET | No | List supported discharge conditions |
| `/discharge/assess` | POST | **Yes** | Assess discharge readiness |
| `/care-plan/health` | GET | No | Care Plan service health |
| `/care-plan/conditions` | GET | No | List conditions with care plan templates |
| `/care-plan/conditions/{key}` | GET | No | Get condition template details |
| `/care-plan/generate` | POST | **Yes** | Generate a structured care plan |
| `/care-plan/generate/fhir` | POST | **Yes** | Generate care plan as FHIR R4 resource |
| `/clerking/health` | GET | No | Clerking Assist service health |
| `/clerking/templates/{format}` | GET | No | Get note template sections |
| `/clerking/autocomplete` | POST | **Yes** | Context-aware medical autocomplete |
| `/clerking/structure` | POST | **Yes** | Convert free-text to structured note |

---

## Feature Flags

All clinical features are gated by environment variables and disabled independently.

| Flag | Default | Description |
|------|---------|-------------|
| `TIBABOT_ENABLE_CDS_RULES` | `true` | Enable CDS Rules Engine |
| `TIBABOT_ENABLE_LAB_ASSIST` | `true` | Enable Lab Assist |
| `TIBABOT_ENABLE_DISCHARGE_READINESS` | `true` | Enable Discharge Readiness |
| `TIBABOT_ENABLE_CARE_PLAN` | `true` | Enable Care Plan Generator |
| `TIBABOT_ENABLE_CLERKING_ASSIST` | `true` | Enable Clerking Assist |

---

## 1. CDS Rules Engine

Clinical decision support rules evaluated against patient data: drug-drug interactions, contraindications, KEML formulary compliance, and Kenya MOH protocol adherence.

> **Feature flag:** `TIBABOT_ENABLE_CDS_RULES`

### Health Check

```http
GET /cds/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "total_rules": 36,
  "categories": {
    "drug-interaction": 8,
    "contraindication": 5,
    "formulary": 10,
    "protocol-adherence": 13
  }
}
```

### Evaluate Rules

```http
POST /cds/evaluate
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "medications": ["warfarin", "aspirin", "metformin"],
  "diagnoses": ["atrial_fibrillation", "type_2_diabetes"],
  "symptoms": ["bleeding_gums"],
  "lab_results": {"inr": 4.5, "creatinine": 1.8},
  "allergies": ["penicillin"],
  "patient_age": 65,
  "patient_sex": "male",
  "is_pregnant": false,
  "facility_level": "H3",
  "region": "lake_endemic"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `medications` | string[] | No | `[]` | Current/proposed medications (lowercase) |
| `diagnoses` | string[] | No | `[]` | Active diagnoses/conditions |
| `symptoms` | string[] | No | `[]` | Current symptoms |
| `pending_procedures` | string[] | No | `[]` | Planned or pending procedures |
| `lab_results` | dict[str, float] | No | `{}` | Lab results as `test_name → value` |
| `allergies` | string[] | No | `[]` | Known allergies |
| `patient_age` | int (0-120) | No | `null` | Patient age in years |
| `patient_sex` | string | No | `null` | `"male"` or `"female"` |
| `is_pregnant` | bool | No | `false` | Whether patient is pregnant |
| `region` | string | No | `null` | Geographic region (e.g., `"lake_endemic"`, `"coast_endemic"`) |
| `facility_level` | string | No | `null` | Kenya facility level (`"H1"`-`"H5"`) |

**Response:**
```json
{
  "alerts": [
    {
      "rule_id": "DDI-001",
      "rule_name": "Warfarin + Aspirin interaction",
      "category": "drug-interaction",
      "severity": "high",
      "message": "Concurrent use of warfarin and aspirin increases bleeding risk",
      "recommendation": "Monitor INR closely; consider gastroprotection",
      "reference": "KEML 2023, BNF Drug Interactions",
      "evidence_snippets": []
    }
  ],
  "recommendations": [
    {
      "rule_id": "LAB-001",
      "rule_name": "Critical INR value",
      "category": "lab-critical",
      "severity": "critical",
      "message": "INR 4.5 is critically elevated — bleeding risk",
      "recommendation": "Hold warfarin, check for active bleeding, consider vitamin K",
      "reference": null,
      "evidence_snippets": []
    }
  ],
  "rules_evaluated": 36,
  "rules_fired": 3,
  "processing_time_ms": 12.5
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `alerts` | CDSAlert[] | Fired alerts requiring clinical attention |
| `recommendations` | CDSAlert[] | Clinical recommendations |
| `rules_evaluated` | int | Total rules evaluated |
| `rules_fired` | int | Number of rules that matched |
| `processing_time_ms` | float | Evaluation time in milliseconds |

**Alert Severities:** `critical`, `high`, `medium`, `low`

**Rule Categories:** `drug-interaction`, `contraindication`, `protocol-adherence`, `lab-critical`, `dosing`, `formulary`

### List Rules

```http
GET /cds/rules
X-API-Key: your-api-key
```

Optional query parameter: `?category=drug-interaction` to filter by category.

**Response:**
```json
{
  "total": 36,
  "rules": [
    {
      "id": "DDI-001",
      "name": "Warfarin + Aspirin interaction",
      "category": "drug-interaction",
      "severity": "high",
      "enabled": true,
      "facility_levels": null
    }
  ]
}
```

---

## 2. Lab Assist

Interprets lab results in clinical context: flags abnormals against age/sex-specific reference ranges (~50 common tests), detects multi-lab patterns, and generates critical value alerts.

> **Feature flag:** `TIBABOT_ENABLE_LAB_ASSIST`

### Health Check

```http
GET /lab/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "mode": "rule-based"
}
```

### Interpret Lab Results

```http
POST /lab/interpret
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "patient_age": 55,
  "patient_sex": "male",
  "is_pregnant": false,
  "lab_results": [
    {"test_name": "glucose", "value": 450, "unit": "mg/dL"},
    {"test_name": "bicarbonate", "value": 12, "unit": "mEq/L"},
    {"test_name": "potassium", "value": 5.8, "unit": "mEq/L"},
    {"test_name": "ph", "value": 7.25, "unit": ""},
    {"test_name": "hemoglobin", "value": 14.5, "unit": "g/dL"}
  ],
  "diagnoses": ["type_2_diabetes"]
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `patient_age` | int (0-120) | **Yes** | — | Patient age in years |
| `patient_sex` | string | **Yes** | — | `"male"` or `"female"` |
| `is_pregnant` | bool | No | `false` | Whether patient is pregnant |
| `gestational_weeks` | int (0-45) | No | `null` | Gestational age if pregnant |
| `lab_results` | LabResult[] | **Yes** (min 1) | — | Lab results to interpret |
| `diagnoses` | string[] | No | `[]` | Current diagnoses for context |

**LabResult object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `test_name` | string | **Yes** | Standardized test name (e.g., `"serum_creatinine"`, `"hemoglobin"`) |
| `value` | float | **Yes** | Numeric result value |
| `unit` | string | **Yes** | Unit of measurement (e.g., `"mg/dL"`, `"mmol/L"`) |
| `timestamp` | datetime | No | When the sample was collected |

**Response:**
```json
{
  "flags": [
    {
      "test_name": "glucose",
      "value": 450.0,
      "unit": "mg/dL",
      "status": "critical_high",
      "reference_range": "70-100 mg/dL",
      "delta_from_normal_pct": 350.0
    },
    {
      "test_name": "bicarbonate",
      "value": 12.0,
      "unit": "mEq/L",
      "status": "critical_low",
      "reference_range": "22-29 mEq/L",
      "delta_from_normal_pct": 45.5
    },
    {
      "test_name": "potassium",
      "value": 5.8,
      "unit": "mEq/L",
      "status": "high",
      "reference_range": "3.5-5.1 mEq/L",
      "delta_from_normal_pct": 13.7
    },
    {
      "test_name": "hemoglobin",
      "value": 14.5,
      "unit": "g/dL",
      "status": "normal",
      "reference_range": "13.5-17.5 g/dL",
      "delta_from_normal_pct": 0.0
    }
  ],
  "patterns": [
    {
      "pattern_name": "dka_triad",
      "description": "Diabetic Ketoacidosis triad: hyperglycemia + metabolic acidosis + ketonemia",
      "confidence": 0.9,
      "contributing_labs": ["glucose", "bicarbonate", "ph"],
      "clinical_significance": "critical",
      "suggested_actions": [
        "Start IV insulin infusion",
        "Aggressive fluid resuscitation with normal saline",
        "Monitor potassium q2h"
      ]
    }
  ],
  "interpretation_summary": "Critical findings: Severely elevated glucose (450 mg/dL) with low bicarbonate and acidotic pH — pattern consistent with DKA. Hemoglobin within normal limits.",
  "suggested_followup_labs": ["beta_hydroxybutyrate", "anion_gap", "serum_osmolality"],
  "critical_alerts": [
    "CRITICAL: Glucose 450 mg/dL (reference: 70-100 mg/dL)",
    "CRITICAL: Bicarbonate 12 mEq/L (reference: 22-29 mEq/L)",
    "DKA triad detected — immediate intervention required"
  ]
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `flags` | LabFlag[] | Flagged results with reference ranges and deviation % |
| `patterns` | LabPattern[] | Detected multi-lab patterns with confidence |
| `interpretation_summary` | string | Narrative summary of findings |
| `suggested_followup_labs` | string[] | Recommended follow-up lab tests |
| `critical_alerts` | string[] | Items requiring immediate attention |

**Flag Statuses:** `critical_low`, `low`, `normal`, `high`, `critical_high`

**Pattern Significance Levels:** `critical`, `significant`, `monitor`

**Supported Patterns (15):** DKA triad, sepsis labs, AKI, hepatic injury, DIC, anemia workup, hypothyroidism, hyperthyroidism, ACS, metabolic acidosis, respiratory failure, hyperkalemia, pancytopenia, severe malaria (Kenya MOH protocol).

---

## 3. Discharge Readiness

Assesses whether a patient meets discharge criteria based on condition-specific checklists, vitals/lab stability trends, and composite scoring. Includes Kenya-specific social criteria (NHIF/SHA, CHW referral).

> **Feature flag:** `TIBABOT_ENABLE_DISCHARGE_READINESS`

### Health Check

```http
GET /discharge/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "mode": "rule-based",
  "supported_conditions": [
    "aki", "asthma", "copd", "dka", "heart_failure",
    "malaria", "pneumonia", "post_surgical", "pre_eclampsia", "tb"
  ]
}
```

### List Supported Conditions

```http
GET /discharge/conditions
```

**Response:**
```json
{
  "conditions": [
    "aki", "asthma", "copd", "dka", "heart_failure",
    "malaria", "pneumonia", "post_surgical", "pre_eclampsia", "tb"
  ],
  "count": 10
}
```

### Assess Discharge Readiness

```http
POST /discharge/assess
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "patient_age": 45,
  "primary_diagnosis": "pneumonia",
  "admission_type": "medical",
  "days_admitted": 5,
  "vitals_history": [
    {
      "timestamp": "2026-03-04T08:00:00Z",
      "heart_rate": 88,
      "systolic_bp": 120,
      "diastolic_bp": 78,
      "temperature": 37.0,
      "respiratory_rate": 18,
      "oxygen_saturation": 96
    },
    {
      "timestamp": "2026-03-04T20:00:00Z",
      "heart_rate": 82,
      "systolic_bp": 118,
      "diastolic_bp": 75,
      "temperature": 36.8,
      "respiratory_rate": 16,
      "oxygen_saturation": 97
    },
    {
      "timestamp": "2026-03-05T08:00:00Z",
      "heart_rate": 78,
      "systolic_bp": 122,
      "diastolic_bp": 76,
      "temperature": 36.6,
      "respiratory_rate": 16,
      "oxygen_saturation": 97
    }
  ],
  "lab_results": [
    {"test_name": "wbc", "value": 9.5, "unit": "x10^9/L"},
    {"test_name": "crp", "value": 15, "unit": "mg/L"}
  ],
  "current_medications": ["amoxicillin", "paracetamol"],
  "can_ambulate": true,
  "can_tolerate_oral": true,
  "has_follow_up_arranged": true,
  "has_caregiver_at_home": true,
  "has_nhif_or_sha": true,
  "chw_referral_made": false
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `patient_age` | int (0-120) | **Yes** | — | Patient age in years |
| `primary_diagnosis` | string | **Yes** | — | Primary diagnosis (see supported conditions) |
| `admission_type` | string | No | `"medical"` | `"medical"`, `"surgical"`, `"obstetric"`, `"pediatric"` |
| `days_admitted` | int (≥0) | **Yes** | — | Days since admission |
| `vitals_history` | VitalsSnapshot[] | No | `[]` | Vitals from last 48h, chronologically ordered |
| `lab_results` | LabResult[] | No | `[]` | Recent lab results |
| `current_medications` | string[] | No | `[]` | Current medication list |
| `can_ambulate` | bool | No | `null` | Can walk independently |
| `can_tolerate_oral` | bool | No | `null` | Tolerates oral intake |
| `has_follow_up_arranged` | bool | No | `false` | Follow-up appointment arranged |
| `has_caregiver_at_home` | bool | No | `null` | Caregiver available at home |
| `has_nhif_or_sha` | bool | No | `null` | NHIF/SHA coverage (Kenya-specific) |
| `chw_referral_made` | bool | No | `null` | CHW referral arranged (Kenya-specific) |

**VitalsSnapshot object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | datetime | **Yes** | When vitals were taken |
| `heart_rate` | float (0-300) | No | Heart rate (bpm) |
| `systolic_bp` | float (0-300) | No | Systolic blood pressure (mmHg) |
| `diastolic_bp` | float (0-200) | No | Diastolic blood pressure (mmHg) |
| `temperature` | float (25-45) | No | Temperature (°C) |
| `respiratory_rate` | float (0-80) | No | Respiratory rate (breaths/min) |
| `oxygen_saturation` | float (0-100) | No | SpO2 (%) |

**Response:**
```json
{
  "readiness_score": 0.85,
  "readiness_level": "ready",
  "criteria": [
    {
      "criterion": "Afebrile for 24h",
      "category": "vitals",
      "met": true,
      "current_value": "36.6°C",
      "target_value": "<37.8°C for 24h",
      "notes": null
    },
    {
      "criterion": "Oxygen saturation stable on room air",
      "category": "vitals",
      "met": true,
      "current_value": "97%",
      "target_value": "≥92% on room air",
      "notes": null
    },
    {
      "criterion": "Tolerating oral antibiotics",
      "category": "medication",
      "met": true,
      "current_value": "Amoxicillin (oral)",
      "target_value": "Switched to oral antibiotics",
      "notes": null
    },
    {
      "criterion": "CHW referral arranged",
      "category": "social",
      "met": false,
      "current_value": "Not arranged",
      "target_value": "Referral to local CHW",
      "notes": "Kenya MOH recommends CHW follow-up for pneumonia"
    }
  ],
  "unmet_criteria_count": 1,
  "readmission_risk": null,
  "readmission_risk_level": null,
  "recommendations": [
    "Arrange Community Health Worker referral for post-discharge follow-up"
  ],
  "vitals_stability": "stable"
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `readiness_score` | float (0.0-1.0) | Composite readiness score |
| `readiness_level` | string | `"ready"`, `"near_ready"`, or `"not_ready"` |
| `criteria` | DischargeCriterion[] | Individual criteria evaluations |
| `unmet_criteria_count` | int | Number of unmet criteria |
| `readmission_risk` | float \| null | 30-day readmission probability (future ML model) |
| `readmission_risk_level` | string \| null | `"low"`, `"moderate"`, or `"high"` (future) |
| `recommendations` | string[] | Actions to address before discharge |
| `vitals_stability` | string \| null | `"stable"`, `"improving"`, or `"unstable"` |

**Readiness Levels:**
- `ready` — All critical criteria met, safe to discharge
- `near_ready` — Most criteria met, minor items outstanding
- `not_ready` — Significant criteria unmet, not safe to discharge

**Criterion Categories:** `vitals`, `labs`, `functional`, `medication`, `social`, `follow_up`

---

## 4. Care Plan Generator

Generates structured, evidence-based care plans for 10 conditions. Plans include KEML facility-level medication checks, CDS rules validation, and Kenya-specific protocol adherence.

> **Feature flag:** `TIBABOT_ENABLE_CARE_PLAN`

### Health Check

```http
GET /care-plan/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "mode": "template",
  "supported_conditions": [
    "aki", "asthma", "dka", "heart_failure", "hiv",
    "malaria", "pneumonia", "pre_eclampsia", "sickle_cell", "tuberculosis"
  ],
  "template_count": 10
}
```

### List Condition Templates

```http
GET /care-plan/conditions
```

**Response:**
```json
{
  "conditions": [
    {"key": "pneumonia", "name": "Community-Acquired Pneumonia", "icd10": "J18.9"},
    {"key": "malaria", "name": "Plasmodium falciparum Malaria", "icd10": "B50.9"},
    {"key": "dka", "name": "Diabetic Ketoacidosis", "icd10": "E10.1"},
    {"key": "heart_failure", "name": "Congestive Heart Failure", "icd10": "I50.9"},
    {"key": "tuberculosis", "name": "Pulmonary Tuberculosis", "icd10": "A15.0"},
    {"key": "hiv", "name": "HIV/AIDS", "icd10": "B20"},
    {"key": "pre_eclampsia", "name": "Pre-eclampsia", "icd10": "O14.1"},
    {"key": "asthma", "name": "Asthma Exacerbation", "icd10": "J45.1"},
    {"key": "aki", "name": "Acute Kidney Injury", "icd10": "N17.9"},
    {"key": "sickle_cell", "name": "Sickle Cell Crisis", "icd10": "D57.0"}
  ],
  "count": 10
}
```

### Get Condition Template Details

```http
GET /care-plan/conditions/pneumonia
```

Returns the full template details for a specific condition including default goals, interventions, and discharge criteria.

### Generate Care Plan

```http
POST /care-plan/generate
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "primary_diagnosis": "Community-acquired pneumonia",
  "icd10_code": "J18.9",
  "severity": "Moderate (CURB-65: 2)",
  "comorbidities": ["type_2_diabetes", "hypertension"],
  "patient_age": 58,
  "patient_sex": "male",
  "is_pregnant": false,
  "facility_level": "H3",
  "allergies": ["penicillin"],
  "current_medications": ["metformin", "amlodipine"],
  "vitals": {"heart_rate": 95, "systolic_bp": 130, "temperature": 38.5, "spo2": 93},
  "lab_results": [
    {"test_name": "wbc", "value": 15.2, "unit": "x10^9/L"},
    {"test_name": "creatinine", "value": 1.1, "unit": "mg/dL"}
  ]
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `primary_diagnosis` | string | **Yes** | — | Primary diagnosis |
| `icd10_code` | string | No | `null` | ICD-10 code if known |
| `severity` | string | No | `null` | Severity descriptor |
| `comorbidities` | string[] | No | `[]` | Comorbid conditions |
| `patient_age` | int (0-120) | **Yes** | — | Patient age |
| `patient_sex` | string | **Yes** | — | `"male"` or `"female"` |
| `is_pregnant` | bool | No | `false` | Pregnancy status |
| `facility_level` | string | No | `"H3"` | Kenya facility level (`"H1"`-`"H5"`) |
| `allergies` | string[] | No | `[]` | Known allergies |
| `current_medications` | string[] | No | `[]` | Current medications |
| `vitals` | dict[str, float] | No | `{}` | Current vitals as `name → value` |
| `lab_results` | LabResult[] | No | `[]` | Recent lab results |

**Response:**
```json
{
  "primary_diagnosis": "Community-acquired pneumonia",
  "icd10_code": "J18.9",
  "severity": "Moderate (CURB-65: 2)",
  "goals": [
    {
      "id": "G1",
      "description": "Resolve infection",
      "target": "Afebrile for 48h, WBC normalizing",
      "timeframe": "5-7 days",
      "priority": "high"
    },
    {
      "id": "G2",
      "description": "Restore oxygenation",
      "target": "SpO2 ≥94% on room air",
      "timeframe": "2-3 days",
      "priority": "high"
    }
  ],
  "interventions": [
    {
      "category": "medications",
      "items": [
        {
          "action": "Ceftriaxone 1g IV BD + Azithromycin 500mg OD",
          "rationale": "KEML first-line for moderate CAP. Penicillin allergy — cephalosporin substitution per Kenya MOH guidelines",
          "duration": "3 days IV then step-down to oral",
          "monitoring": "Temperature q6h, clinical response at 48h",
          "timing": "Start within 4 hours of admission",
          "escalation": "No improvement at 48h → consider broader coverage",
          "content": null
        }
      ]
    },
    {
      "category": "investigations",
      "items": [
        {
          "action": "Blood cultures x2, sputum culture, CXR",
          "rationale": "Identify pathogen, assess extent of consolidation",
          "duration": null,
          "monitoring": "Review culture results at 48-72h",
          "timing": "On admission, before antibiotics",
          "escalation": null,
          "content": null
        }
      ]
    },
    {
      "category": "nursing",
      "items": [
        {
          "action": "Oxygen therapy to maintain SpO2 ≥94%",
          "rationale": "Correct hypoxemia",
          "duration": "Until SpO2 stable on room air",
          "monitoring": "SpO2 continuous, wean as tolerated",
          "timing": null,
          "escalation": "SpO2 <90% despite O2 → notify doctor",
          "content": null
        }
      ]
    },
    {
      "category": "patient_education",
      "items": [
        {
          "action": "Pneumonia education",
          "rationale": "Support self-management post-discharge",
          "duration": null,
          "monitoring": null,
          "timing": "Before discharge",
          "escalation": null,
          "content": "Complete full course of antibiotics. Return if fever recurs, breathing worsens, or new chest pain."
        }
      ]
    }
  ],
  "discharge_criteria": [
    "Afebrile for 24h",
    "SpO2 ≥92% on room air",
    "Tolerating oral antibiotics and fluids",
    "Clinical improvement on CXR or stable"
  ],
  "follow_up": {
    "appointment": "GP/outpatient review in 7 days",
    "investigations": "Repeat CXR at 6 weeks if symptoms persist",
    "red_flags": [
      "Return immediately if: fever recurs, worsening breathlessness, chest pain, coughing blood"
    ]
  },
  "references": [
    "Kenya MOH Clinical Guidelines 2022",
    "KEML 2023",
    "BTS Guidelines for CAP"
  ],
  "cds_alerts": [],
  "facility_level_notes": [
    "All recommended medications available at H3 level per KEML 2023"
  ],
  "template_used": "pneumonia",
  "mode": "template"
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `primary_diagnosis` | string | Echoed diagnosis |
| `icd10_code` | string \| null | ICD-10 code |
| `severity` | string \| null | Severity descriptor |
| `goals` | CarePlanGoal[] | Goals with priorities and timeframes |
| `interventions` | InterventionCategory[] | Grouped by category |
| `discharge_criteria` | string[] | Criteria for discharge |
| `follow_up` | FollowUp \| null | Follow-up instructions with red flags |
| `references` | string[] | Clinical guideline references |
| `cds_alerts` | dict[] | CDS safety alerts (DDI, contraindications) |
| `facility_level_notes` | string[] | KEML availability notes for facility |
| `template_used` | string \| null | Which condition template was used |
| `mode` | string | Generation mode: `"template"`, `"hybrid"`, or `"generic"` |
| `evidence_sources` | string[] | RAG source documents used for LLM enrichment |
| `llm_enriched` | bool | Whether the plan was enriched by LLM |

**Intervention Categories:** `medications`, `investigations`, `nursing`, `nutrition`, `patient_education`, `rehabilitation`, `referrals`

**Goal Priorities:** `high`, `medium`, `low`

### Generate Care Plan as FHIR R4 Resource

Generates the same care plan as `/care-plan/generate` but returns the output as an HL7 FHIR R4 CarePlan resource suitable for EMR integration.

```http
POST /care-plan/generate/fhir
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:** Same as `/care-plan/generate` (see above).

**Response:**
```json
{
  "resourceType": "CarePlan",
  "id": "a1b2c3d4e5f6",
  "status": "active",
  "intent": "plan",
  "title": "Care Plan: Community-acquired pneumonia (Moderate (CURB-65: 2))",
  "description": "Evidence-based care plan for Community-acquired pneumonia",
  "created": "2026-03-05T12:00:00Z",
  "category": [
    {
      "coding": [
        {
          "system": "http://hl7.org/fhir/sid/icd-10",
          "code": "J18.9",
          "display": "Community-acquired pneumonia"
        }
      ],
      "text": "Community-acquired pneumonia"
    }
  ],
  "goal": [
    { "reference": "#G1" },
    { "reference": "#G2" }
  ],
  "contained": [
    {
      "resourceType": "Goal",
      "id": "G1",
      "lifecycleStatus": "active",
      "priority": {
        "coding": [
          {
            "system": "http://hl7.org/fhir/request-priority",
            "code": "urgent",
            "display": "Urgent"
          }
        ],
        "text": "high"
      },
      "description": { "text": "Resolve infection" },
      "target": [
        { "detailString": "Afebrile for 48h, WBC normalizing" }
      ],
      "note": [
        { "text": "Timeframe: 5-7 days" }
      ]
    }
  ],
  "activity": [
    {
      "detail": {
        "kind": "MedicationRequest",
        "code": {
          "coding": [
            {
              "system": "http://snomed.info/sct",
              "code": "182832007",
              "display": "Medication management"
            }
          ],
          "text": "Ceftriaxone 1g IV BD + Azithromycin 500mg OD"
        },
        "status": "not-started",
        "description": "Ceftriaxone 1g IV BD + Azithromycin 500mg OD",
        "scheduledString": "Start within 4 hours; 3 days IV then step-down"
      },
      "note": [
        { "text": "Rationale: KEML first-line for moderate CAP" },
        { "text": "Monitoring: Temperature q6h, clinical response at 48h" }
      ]
    }
  ],
  "note": [
    { "text": "Discharge criteria:\n- Afebrile for 24h\n- SpO2 ≥92% on room air" },
    { "text": "Follow-up: GP/outpatient review in 7 days\nRed flags: fever recurs; worsening breathlessness" },
    { "text": "References:\n- Kenya MOH Clinical Guidelines 2022\n- KEML 2023" }
  ],
  "extension": [
    {
      "url": "https://tibabot.hmis.nexora.africa/fhir/StructureDefinition/care-plan-generation-mode",
      "valueString": "template"
    },
    {
      "url": "https://tibabot.hmis.nexora.africa/fhir/StructureDefinition/care-plan-template",
      "valueString": "pneumonia"
    },
    {
      "url": "https://tibabot.hmis.nexora.africa/fhir/StructureDefinition/facility-level",
      "valueString": "H3"
    }
  ]
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `resourceType` | `"CarePlan"` | FHIR resource type |
| `id` | string | Unique resource identifier |
| `status` | string | Always `"active"` |
| `intent` | string | Always `"plan"` |
| `title` | string | Diagnosis + severity |
| `created` | string | ISO 8601 timestamp |
| `category` | CodeableConcept[] | ICD-10 coded diagnosis |
| `goal` | Reference[] | References to contained Goal resources |
| `contained` | Goal[] | FHIR Goal resources with priority, target, timeframe |
| `activity` | Activity[] | SNOMED CT-coded interventions with scheduling |
| `note` | Annotation[] | Discharge criteria, follow-up, references, CDS alerts |
| `extension` | Extension[] | TibaBot metadata (generation mode, template, facility level) |

**Activity Kinds (per intervention category):**

| Category | FHIR Kind |
|----------|-----------|
| `medications` | `MedicationRequest` |
| `investigations` | `ServiceRequest` |
| `nursing` | `Task` |
| `nutrition` | `NutritionOrder` |
| `patient_education` | `Task` |
| `rehabilitation` | `ServiceRequest` |
| `referrals` | `ServiceRequest` |

---

## 5. Clerking Assist

Autocomplete for clinical documentation and free-text to structured note conversion. Supports clerking, SOAP, and discharge summary formats with ICD-10-coded diagnosis extraction.

> **Feature flag:** `TIBABOT_ENABLE_CLERKING_ASSIST`

### Health Check

```http
GET /clerking/health
```

**Response:**
```json
{
  "status": "healthy",
  "is_loaded": true,
  "mode": "rule-based"
}
```

### Get Note Template

```http
GET /clerking/templates/clerking
```

**Supported formats:** `clerking`, `soap`, `discharge_summary`

**Response:**
```json
{
  "format": "clerking",
  "sections": {
    "presenting_complaint": "",
    "hpi": "",
    "pmh": "",
    "drug_history": "",
    "allergies": "",
    "family_history": "",
    "social_history": "",
    "review_of_systems": "",
    "examination": "",
    "investigations": "",
    "assessment": "",
    "plan": ""
  },
  "section_count": 12
}
```

### Autocomplete

```http
POST /clerking/autocomplete
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "current_text": "hea",
  "cursor_section": "presenting_complaint",
  "note_sections": [],
  "specialty": "internal_medicine"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `current_text` | string (1-2000) | **Yes** | — | What the user has typed |
| `cursor_section` | string | **Yes** | — | Active note section (see section names below) |
| `note_sections` | NoteSection[] | No | `[]` | Already-filled sections for context |
| `specialty` | string | No | `null` | Medical specialty (e.g., `"internal_medicine"`, `"pediatrics"`) |

**Valid Section Names:** `presenting_complaint`, `hpi`, `pmh`, `drug_history`, `allergies`, `family_history`, `social_history`, `review_of_systems`, `examination`, `investigations`, `assessment`, `plan`

**Response:**
```json
{
  "suggestions": [
    {
      "text": "headache",
      "category": "symptom",
      "confidence": 0.95,
      "icd10_code": null,
      "source": "template"
    },
    {
      "text": "heart failure",
      "category": "diagnosis",
      "confidence": 0.88,
      "icd10_code": "I50.9",
      "source": "template"
    },
    {
      "text": "heartburn / GERD",
      "category": "symptom",
      "confidence": 0.82,
      "icd10_code": null,
      "source": "template"
    }
  ],
  "extracted_entities": [],
  "section_completeness": {
    "presenting_complaint": false,
    "hpi": false,
    "pmh": false,
    "drug_history": false,
    "allergies": false,
    "family_history": false,
    "social_history": false,
    "review_of_systems": false,
    "examination": false,
    "investigations": false,
    "assessment": false,
    "plan": false
  }
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `suggestions` | Suggestion[] | Ranked autocomplete suggestions |
| `extracted_entities` | dict[] | NER entities (future: ClinicalBERT) |
| `section_completeness` | dict[str, bool] | Which sections still need input |

**Suggestion Categories:** `symptom`, `diagnosis`, `medication`, `procedure`, `investigation`, `phrase`, `template`

**Suggestion Sources:** `ner`, `llm`, `template`, `history`

### Structure Note

Convert free-text clinical notes into a structured format.

```http
POST /clerking/structure
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "free_text": "45 year old male presents with 3 days of productive cough, fever, and right-sided chest pain. PMH: Type 2 DM on metformin. NKDA. Exam: Temp 38.5, HR 95, BP 130/85, SpO2 93% on RA. Reduced air entry right lower zone with bronchial breathing. Assessment: Community-acquired pneumonia. Plan: Admit, IV antibiotics, O2 therapy, blood cultures, CXR.",
  "patient_age": 45,
  "patient_sex": "male",
  "specialty": "internal_medicine",
  "output_format": "clerking"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `free_text` | string (10-10000) | **Yes** | — | Raw clinical notes or dictation |
| `patient_age` | int (0-120) | **Yes** | — | Patient age |
| `patient_sex` | string | **Yes** | — | `"male"` or `"female"` |
| `specialty` | string | No | `null` | Medical specialty |
| `output_format` | string | No | `"clerking"` | `"clerking"`, `"soap"`, or `"discharge_summary"` |

**Response:**
```json
{
  "structured_note": {
    "presenting_complaint": "3 days productive cough, fever, right-sided chest pain",
    "hpi": "45 year old male presents with 3 days of productive cough, fever, and right-sided chest pain.",
    "pmh": "Type 2 DM on metformin",
    "drug_history": "Metformin",
    "allergies": "NKDA",
    "examination": "Temp 38.5, HR 95, BP 130/85, SpO2 93% on RA. Reduced air entry right lower zone with bronchial breathing.",
    "assessment": "Community-acquired pneumonia",
    "plan": "Admit, IV antibiotics, O2 therapy, blood cultures, CXR"
  },
  "extracted_diagnoses": [
    {
      "diagnosis": "Community-acquired pneumonia",
      "icd10_code": "J18.9",
      "confidence": 0.92
    },
    {
      "diagnosis": "Type 2 diabetes mellitus",
      "icd10_code": "E11.9",
      "confidence": 0.88
    }
  ],
  "extracted_medications": ["metformin"],
  "suggested_investigations": [
    "Full blood count",
    "Blood cultures",
    "Chest X-ray",
    "CRP / ESR",
    "Blood glucose"
  ],
  "completeness_score": 0.67,
  "missing_sections": [
    "family_history",
    "social_history",
    "review_of_systems",
    "investigations"
  ]
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `structured_note` | dict[str, str] | Section name → content mapping |
| `extracted_diagnoses` | dict[] | Diagnoses with ICD-10 codes and confidence |
| `extracted_medications` | string[] | Medications found in the text |
| `suggested_investigations` | string[] | Suggested investigations based on presentation |
| `completeness_score` | float (0.0-1.0) | How complete the structured note is |
| `missing_sections` | string[] | Sections that could not be populated |

---

## Error Handling

All clinical endpoints follow the same error pattern as the core API.

```json
{
  "detail": "Error description"
}
```

| Status | Scenario |
|--------|----------|
| 400 | Invalid request body, missing required fields, invalid format |
| 401 | Invalid or missing API key (on auth-required endpoints) |
| 404 | Condition template not found (`/care-plan/conditions/{key}`) |
| 429 | Rate limit exceeded |
| 500 | Internal service error (logged server-side) |
| 503 | Feature service not available (not loaded or feature flag disabled) |

---

## SDK Examples

### Python

```python
import requests

class TibaBotClinicalClient:
    def __init__(self, api_key: str, base_url: str = "https://tibabot.hmis.nexora.africa"):
        self.base_url = base_url
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }

    def evaluate_cds(self, medications: list, diagnoses: list = None,
                     lab_results: dict = None, **kwargs) -> dict:
        payload = {"medications": medications}
        if diagnoses:
            payload["diagnoses"] = diagnoses
        if lab_results:
            payload["lab_results"] = lab_results
        payload.update(kwargs)
        resp = requests.post(f"{self.base_url}/cds/evaluate",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def interpret_labs(self, patient_age: int, patient_sex: str,
                       lab_results: list, **kwargs) -> dict:
        payload = {
            "patient_age": patient_age,
            "patient_sex": patient_sex,
            "lab_results": lab_results,
            **kwargs
        }
        resp = requests.post(f"{self.base_url}/lab/interpret",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def assess_discharge(self, patient_age: int, primary_diagnosis: str,
                         days_admitted: int, **kwargs) -> dict:
        payload = {
            "patient_age": patient_age,
            "primary_diagnosis": primary_diagnosis,
            "days_admitted": days_admitted,
            **kwargs
        }
        resp = requests.post(f"{self.base_url}/discharge/assess",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def generate_care_plan(self, primary_diagnosis: str, patient_age: int,
                           patient_sex: str, **kwargs) -> dict:
        payload = {
            "primary_diagnosis": primary_diagnosis,
            "patient_age": patient_age,
            "patient_sex": patient_sex,
            **kwargs
        }
        resp = requests.post(f"{self.base_url}/care-plan/generate",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def generate_care_plan_fhir(self, primary_diagnosis: str, patient_age: int,
                                patient_sex: str, **kwargs) -> dict:
        """Generate care plan as FHIR R4 CarePlan resource."""
        payload = {
            "primary_diagnosis": primary_diagnosis,
            "patient_age": patient_age,
            "patient_sex": patient_sex,
            **kwargs
        }
        resp = requests.post(f"{self.base_url}/care-plan/generate/fhir",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()

    def autocomplete(self, text: str, section: str, **kwargs) -> dict:
        payload = {"current_text": text, "cursor_section": section, **kwargs}
        resp = requests.post(f"{self.base_url}/clerking/autocomplete",
                             headers=self.headers, json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def structure_note(self, free_text: str, patient_age: int,
                       patient_sex: str, **kwargs) -> dict:
        payload = {
            "free_text": free_text,
            "patient_age": patient_age,
            "patient_sex": patient_sex,
            **kwargs
        }
        resp = requests.post(f"{self.base_url}/clerking/structure",
                             headers=self.headers, json=payload, timeout=15)
        resp.raise_for_status()
        return resp.json()


# Usage
client = TibaBotClinicalClient(api_key="your-api-key")

# Check drug interactions
alerts = client.evaluate_cds(
    medications=["warfarin", "aspirin"],
    lab_results={"inr": 4.5},
    patient_age=65, patient_sex="male"
)
print(f"{alerts['rules_fired']} rules fired, {len(alerts['alerts'])} alerts")

# Interpret lab results
labs = client.interpret_labs(
    patient_age=55, patient_sex="male",
    lab_results=[
        {"test_name": "glucose", "value": 450, "unit": "mg/dL"},
        {"test_name": "bicarbonate", "value": 12, "unit": "mEq/L"},
    ]
)
for alert in labs["critical_alerts"]:
    print(f"⚠ {alert}")

# Assess discharge readiness
discharge = client.assess_discharge(
    patient_age=45, primary_diagnosis="pneumonia", days_admitted=5,
    can_ambulate=True, can_tolerate_oral=True
)
print(f"Readiness: {discharge['readiness_level']} ({discharge['readiness_score']:.0%})")

# Generate care plan
plan = client.generate_care_plan(
    primary_diagnosis="Community-acquired pneumonia",
    patient_age=58, patient_sex="male",
    facility_level="H3", allergies=["penicillin"]
)
print(f"Goals: {len(plan['goals'])}, Template: {plan['template_used']}")

# Generate FHIR care plan for EMR integration
fhir_plan = client.generate_care_plan_fhir(
    primary_diagnosis="Community-acquired pneumonia",
    patient_age=58, patient_sex="male",
    icd10_code="J18.9", facility_level="H3"
)
print(f"FHIR resource: {fhir_plan['resourceType']}, Activities: {len(fhir_plan['activity'])}")

# Autocomplete while typing
completions = client.autocomplete(text="hea", section="presenting_complaint")
for s in completions["suggestions"]:
    print(f"  {s['text']} ({s['category']}, {s['confidence']:.0%})")

# Structure free-text notes
result = client.structure_note(
    free_text="45M with 3 days cough and fever. PMH: DM2. Exam: Temp 38.5...",
    patient_age=45, patient_sex="male"
)
print(f"Completeness: {result['completeness_score']:.0%}")
print(f"Diagnoses: {[d['diagnosis'] for d in result['extracted_diagnoses']]}")
```

### JavaScript/TypeScript

```typescript
class TibaBotClinicalClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://tibabot.hmis.nexora.africa') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(method: string, path: string, body?: any) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${error.detail || 'Unknown error'}`);
    }
    return response.json();
  }

  async evaluateCDS(data: {
    medications?: string[];
    diagnoses?: string[];
    lab_results?: Record<string, number>;
    patient_age?: number;
    patient_sex?: 'male' | 'female';
    is_pregnant?: boolean;
    facility_level?: string;
  }) {
    return this.request('POST', '/cds/evaluate', data);
  }

  async interpretLabs(data: {
    patient_age: number;
    patient_sex: 'male' | 'female';
    lab_results: Array<{ test_name: string; value: number; unit: string }>;
    diagnoses?: string[];
  }) {
    return this.request('POST', '/lab/interpret', data);
  }

  async assessDischarge(data: {
    patient_age: number;
    primary_diagnosis: string;
    days_admitted: number;
    vitals_history?: Array<Record<string, any>>;
    can_ambulate?: boolean;
    can_tolerate_oral?: boolean;
    has_nhif_or_sha?: boolean;
  }) {
    return this.request('POST', '/discharge/assess', data);
  }

  async generateCarePlan(data: {
    primary_diagnosis: string;
    patient_age: number;
    patient_sex: 'male' | 'female';
    facility_level?: string;
    comorbidities?: string[];
    allergies?: string[];
  }) {
    return this.request('POST', '/care-plan/generate', data);
  }

  async generateCarePlanFhir(data: {
    primary_diagnosis: string;
    patient_age: number;
    patient_sex: 'male' | 'female';
    facility_level?: string;
    comorbidities?: string[];
    allergies?: string[];
    icd10_code?: string;
  }) {
    return this.request('POST', '/care-plan/generate/fhir', data);
  }

  async autocomplete(text: string, section: string) {
    return this.request('POST', '/clerking/autocomplete', {
      current_text: text,
      cursor_section: section,
    });
  }

  async structureNote(data: {
    free_text: string;
    patient_age: number;
    patient_sex: 'male' | 'female';
    output_format?: 'clerking' | 'soap' | 'discharge_summary';
  }) {
    return this.request('POST', '/clerking/structure', data);
  }
}

// Usage
const client = new TibaBotClinicalClient('your-api-key');

const alerts = await client.evaluateCDS({
  medications: ['warfarin', 'aspirin'],
  lab_results: { inr: 4.5 },
  patient_age: 65,
  patient_sex: 'male',
});
console.log(`${alerts.rules_fired} rules fired`);

const labs = await client.interpretLabs({
  patient_age: 55,
  patient_sex: 'male',
  lab_results: [{ test_name: 'glucose', value: 450, unit: 'mg/dL' }],
});
console.log(labs.critical_alerts);
```

### cURL

```bash
# CDS rule evaluation
curl -X POST https://tibabot.hmis.nexora.africa/cds/evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "medications": ["warfarin", "aspirin"],
    "lab_results": {"inr": 4.5},
    "patient_age": 65,
    "patient_sex": "male"
  }'

# Lab interpretation
curl -X POST https://tibabot.hmis.nexora.africa/lab/interpret \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "patient_age": 55,
    "patient_sex": "male",
    "lab_results": [
      {"test_name": "glucose", "value": 450, "unit": "mg/dL"},
      {"test_name": "bicarbonate", "value": 12, "unit": "mEq/L"}
    ]
  }'

# Discharge readiness assessment
curl -X POST https://tibabot.hmis.nexora.africa/discharge/assess \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "patient_age": 45,
    "primary_diagnosis": "pneumonia",
    "days_admitted": 5,
    "can_ambulate": true,
    "can_tolerate_oral": true,
    "has_nhif_or_sha": true
  }'

# Care plan generation
curl -X POST https://tibabot.hmis.nexora.africa/care-plan/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "primary_diagnosis": "Community-acquired pneumonia",
    "patient_age": 58,
    "patient_sex": "male",
    "facility_level": "H3",
    "allergies": ["penicillin"]
  }'

# Care plan as FHIR R4 resource (for EMR integration)
curl -X POST https://tibabot.hmis.nexora.africa/care-plan/generate/fhir \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "primary_diagnosis": "Community-acquired pneumonia",
    "icd10_code": "J18.9",
    "patient_age": 58,
    "patient_sex": "male",
    "facility_level": "H3"
  }'

# Clerking autocomplete
curl -X POST https://tibabot.hmis.nexora.africa/clerking/autocomplete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"current_text": "hea", "cursor_section": "presenting_complaint"}'

# Structure free-text note
curl -X POST https://tibabot.hmis.nexora.africa/clerking/structure \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "free_text": "45M with cough and fever for 3 days. PMH: DM2. Assessment: CAP.",
    "patient_age": 45,
    "patient_sex": "male",
    "output_format": "soap"
  }'

# Get note template
curl https://tibabot.hmis.nexora.africa/clerking/templates/soap

# List discharge conditions
curl https://tibabot.hmis.nexora.africa/discharge/conditions

# List care plan templates
curl https://tibabot.hmis.nexora.africa/care-plan/conditions

# Health checks
curl https://tibabot.hmis.nexora.africa/cds/health
curl https://tibabot.hmis.nexora.africa/lab/health
curl https://tibabot.hmis.nexora.africa/discharge/health
curl https://tibabot.hmis.nexora.africa/care-plan/health
curl https://tibabot.hmis.nexora.africa/clerking/health
```

---

## Cross-Feature Integration

Several clinical features work together when available:

| Integration | How It Works |
|-------------|-------------|
| **Care Plan + CDS Rules** | Care plan generation automatically validates medications against CDS rules for DDI, contraindications, and formulary compliance |
| **Care Plan + KEML** | Medication interventions are checked against KEML facility-level restrictions; `facility_level_notes` flag unavailable drugs |
| **Lab Assist → Discharge** | Lab results from Lab Assist inform discharge criteria evaluation |
| **CDS Rules → Lab Assist** | Critical lab value rules mirror Lab Assist critical alerts |
| **Clerking → ICD-10** | Structured notes include auto-coded diagnoses via the ICD-10 service |

---

## Support

- **Core API Docs:** [ai-api-guide.md](ai-api-guide.md)
- **Clinical Features Plan:** [clinical_features_plan.md](clinical_features_plan.md)
- **Issues:** https://github.com/nexora-africa-ltd/tibabot/issues
- **OpenAPI:** `https://tibabot.hmis.nexora.africa/docs` (when `TIBABOT_ENABLE_DOCS=true`)

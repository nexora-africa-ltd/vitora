# TibaBot API Developer Guide

A comprehensive guide for developers integrating with the TibaBot API — covering core patient-facing endpoints, clinical decision support features, ML predictors, and webhook integrations.

## Base URL

| Environment | URL |
|-------------|-----|
| **Production** | `https://tibabot.vitora.nexora.africa` |
| **Local Dev** | `http://localhost:8000` |

## Authentication

### API Key Methods

Pass your API key using one of:

```bash
# Header (recommended)
curl -H "X-API-Key: your-api-key" https://tibabot.vitora.nexora.africa/chat

# Query parameter
curl "https://tibabot.vitora.nexora.africa/chat?api_key=your-api-key"
```

### Rate Limits

| Client Type | Requests/Minute |
|-------------|-----------------|
| Anonymous | 30 |
| Authenticated | 60 |

Check your status: `GET /rate-limit`

Rate limit headers returned on `429`:
- `retry_after_seconds` — seconds until reset
- `limit` — your current limit
- `remaining` — requests remaining
- `reset_at` — UTC timestamp of reset

---

## Endpoints Overview

### Core

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | System health check |
| `/build-info` | GET | No | Build version and git info |
| `/stats` | GET | No | API usage statistics |
| `/rate-limit` | GET | No | Rate limit status |
| `/chat` | POST | Optional | Unified patient chat (auto-routes chat/symptom modes) |
| `/conversation/{id}` | GET | No | Get conversation history |
| `/triage` | POST | No | Single-turn symptom triage |

### Symptom Checker

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/symptom-checker/conversation/start` | POST | No | Start symptom checker conversation |
| `/symptom-checker/conversation/message` | POST | No | Continue symptom checker conversation |
| `/symptom-checker/conversation/{session_id}` | GET | No | Get conversation state |
| `/symptom-checker/conversation/{session_id}` | DELETE | No | End/delete conversation |
| `/symptom-checker/conversation/feedback` | POST | No | Feedback for conversation response |
| `/symptom-checker/conversation/health` | GET | No | Symptom checker service health |

### Clinical Assistant (Provider-Facing)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/clinical/assist` | POST | **Yes** | Provider clinical decision support |
| `/clinical/chat` | POST | **Yes** | Multi-turn clinical chat (SSE streaming) |
| `/clinical/chat/session/{session_id}` | GET | **Yes** | Get clinical session info |
| `/clinical/chat/session/{session_id}/history` | GET | **Yes** | Get clinical session history |
| `/clinical/chat/session/{session_id}` | DELETE | **Yes** | Delete clinical session |
| `/clinical/chat/stats` | GET | **Yes** | Clinical chat statistics |
| `/clinical/profile` | GET | **Yes** | Get provider profile |
| `/clinical/profile` | PUT | **Yes** | Update provider profile |
| `/clinical/document` | POST | **Yes** | Generate clinical documents (discharge summaries, SOAP notes, etc.) |
| `/clinical/health` | GET | No | Clinical service health |

### ICD-10 Auto-Coder

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/icd10/code` | POST | No | Auto-code clinical text |
| `/icd10/batch` | POST | No | Batch auto-code (up to 100) |
| `/icd10/search` | GET | No | Search ICD-10 codes |
| `/icd10/suggest` | GET | No | Typeahead code suggestions |
| `/icd10/validate` | POST | No | Validate code combinations |
| `/icd10/lookup/{code}` | GET | No | Lookup single code details |
| `/icd10/stats` | GET | No | ICD-10 service statistics |

### ML Predictors

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/predict/condition` | POST | Optional | ML condition prediction |
| `/predict/conditions` | GET | No | List predictable conditions |
| `/predict/features` | GET | No | List expected input features |
| `/predict/health` | GET | No | Predictor service health |
| `/predict/icu/predict` | POST | Optional | ICU condition prediction |
| `/predict/icu/sofa` | POST | Optional | Calculate SOFA score |
| `/predict/icu/qsofa` | POST | Optional | Calculate qSOFA score |
| `/predict/icu/risk-stratify` | POST | Optional | Patient risk stratification |
| `/predict/icu/conditions` | GET | No | List ICU conditions |
| `/predict/icu/health` | GET | No | ICU predictor health |

### CDS Rules Engine

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/cds/health` | GET | No | CDS Rules Engine health |
| `/cds/evaluate` | POST | **Yes** | Evaluate CDS rules against patient data |
| `/cds/rules` | GET | **Yes** | List available CDS rules |

### Lab Assist

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/lab/health` | GET | No | Lab Assist service health |
| `/lab/interpret` | POST | **Yes** | Interpret lab results in clinical context |

### Discharge Readiness

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/discharge/health` | GET | No | Discharge readiness service health |
| `/discharge/conditions` | GET | No | List supported discharge conditions |
| `/discharge/assess` | POST | **Yes** | Assess discharge readiness |

### Care Plan Generator

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/care-plan/health` | GET | No | Care Plan service health |
| `/care-plan/conditions` | GET | No | List conditions with care plan templates |
| `/care-plan/conditions/{key}` | GET | No | Get condition template details |
| `/care-plan/generate` | POST | **Yes** | Generate a structured care plan |
| `/care-plan/generate/fhir` | POST | **Yes** | Generate care plan as FHIR R4 resource |

### Clerking Assist

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/clerking/health` | GET | No | Clerking Assist service health |
| `/clerking/templates/{format}` | GET | No | Get note template sections |
| `/clerking/autocomplete` | POST | **Yes** | Context-aware medical autocomplete |
| `/clerking/structure` | POST | **Yes** | Convert free-text to structured note |

### Investigation Suggestions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/clinical/investigations/suggest` | POST | **Yes** | Suggest investigations for a clinical encounter (FHIR-ready) |

### Practitioner Validation

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/practitioner/validate` | POST | Optional | Validate practitioner (SHA HWR) |
| `/practitioner/stats` | GET | **Yes** | Practitioner validation stats |
| `/practitioner/health` | GET | No | Validation service health |

### Internationalization

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/i18n/languages` | GET | No | Supported languages |
| `/i18n/detect` | GET | No | Detect language from headers |
| `/i18n/translate` | POST | No | Get translations for keys |
| `/i18n/bundle/{language}` | GET | No | Full translation bundle |

### Feedback

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/feedback` | POST | Optional | Submit feedback for any service response |
| `/feedback/stats` | GET | No | Feedback statistics (overall + per-service) |

### Patient Platform

> Full guide: [patient-platform-api-guide.md](patient-platform-api-guide.md)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/patient` | POST | Optional | Create pseudonymous patient account |
| `/patient/{id}` | GET | Optional | Look up patient by ID |
| `/patient/{id}/journal` | POST | Optional | Log a symptom (encrypted) |
| `/patient/{id}/vitals` | POST | Optional | Log a vital sign |
| `/patient/{id}/event` | POST | Optional | Log a generic health event |
| `/patient/{id}/timeline` | GET | Optional | Event timeline (filtered) |
| `/patient/{id}/summary` | GET | Optional | Trend summary with alerts |
| `/patient/{id}/reminders` | POST | Optional | Create medication reminder |
| `/patient/{id}/reminders` | GET | Optional | Get active reminders |
| `/patient/{id}/reminders/adherence` | POST / GET | Optional | Log / query medication adherence |
| `/patient/{id}/goals` | POST / GET | Optional | Create / list health goals |
| `/patient/{id}/goals/templates` | GET | Optional | WHO-aligned goal templates |
| `/patient/{id}/caregivers` | POST / GET | Optional | Register / list caregivers |
| `/patient/{id}/alerts` | GET | Optional | Get caregiver alerts |
| `/patient/{id}/screenings/recommended` | GET | Optional | Age/sex/risk screening recommendations |
| `/patient/{id}/screenings` | POST / GET | Optional | Log / query screening history |
| `/patient/{id}/immunization/schedule` | POST | Optional | Full KEPI schedule with status |
| `/patient/{id}/immunization/due` | POST | Optional | Due / catch-up vaccines only |
| `/patient/{id}/immunization/summary` | POST | Optional | Completion statistics |
| `/patient/{id}/immunization/log` | POST | Optional | Log administered vaccine |
| `/patient/{id}/education` | GET | Optional | Bilingual health education snippets |
| `/community/stats` | GET | Optional | Aggregate patient/event counts |
| `/community/trends` | GET | Optional | Top symptom trends (anonymized) |
| `/community/screening/coverage` | GET | Optional | Screening coverage summary |

### WhatsApp Webhooks

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/webhooks/whatsapp` | GET | No | Meta webhook verification |
| `/webhooks/whatsapp` | POST | No | Incoming message handler |
| `/webhooks/whatsapp/status` | POST | No | Delivery status callbacks |
| `/webhooks/whatsapp/stats` | GET | No | Rate limiting & delivery stats |

---

## Core Endpoints

### 1. Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "build_version": "abc1234-20260206",
  "rag_initialized": true,
  "meddialog_docs": 107520,
  "icd10_codes": 121386,
  "kenya_clinical_docs": 9421,
  "llm_provider": "groq",
  "llm_tier": "premium",
  "demo_mode": false,
  "uptime_seconds": 3600.5,
  "symptom_checker": {"status": "wired", "service": "SymptomCheckerService"},
  "conversation_state": {"status": "wired", "service": "ConversationStateMachine"},
  "intent_classifier": {"status": "loaded", "model": "fasttext"}
}
```

### 2. Build Info

```http
GET /build-info
```

**Response:**
```json
{
  "version": "1.0.0",
  "git_commit": "abc1234",
  "git_branch": "main",
  "build_timestamp": "2026-03-01T12:00:00Z",
  "python_version": "3.11.9",
  "uptime_seconds": 3600.5
}
```

---

### 3. Chat (Unified Patient Assistant)

The `/chat` endpoint supports multiple modes: general health Q&A, guided symptom checking, or auto-routing based on intent detection.

> **Persistence:** All chat turns are persisted to a local SQLite database (`data/conversations.db`)
> for analytics and conversation continuity across server restarts. Set `TIBABOT_CONVERSATIONS_DB`
> to override the database path.

```http
POST /chat
Content-Type: application/json
```

**Request:**
```json
{
  "message": "I have a headache and fever for 2 days",
  "conversation_id": "optional-uuid",
  "mode": "auto",
  "include_disclaimer": true,
  "include_sources": false,
  "provider_role": "clinical_officer",
  "facility_level": 3,
  "history": []
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string (1-5000) | Yes | User message |
| `conversation_id` | string | No | Session ID for multi-turn |
| `mode` | string | No | `"chat"`, `"symptom-check"`, or `"auto"` (default) |
| `include_disclaimer` | bool | No | Include medical disclaimer (default: true) |
| `include_sources` | bool | No | Include source citations (default: false) |
| `provider_role` | string | No | Provider role for profile-aware retrieval. Values: `"doctor"`, `"clinical_officer"`, `"nurse"`, `"chw"`. Adjusts reranking weights to surface the most relevant content for that role |
| `facility_level` | int (1-6) | No | Kenya MOH facility level. Tailors KEML medicine recommendations to available formulary tier |
| `history` | array | No | Previous conversation messages |

**Response:**
```json
{
  "response": "Based on your symptoms of headache and fever...",
  "conversation_id": "uuid-here",
  "risk_level": "medium",
  "is_emergency": false,
  "processing_time_ms": 1250,
  "model_used": "llama-3.3-70b-versatile",
  "engine": "rag",
  "sources": [],
  "mode": "chat",
  "triage_level": null,
  "triage_result": null,
  "progress_percentage": null,
  "options": null
}
```

| Response Field | Description |
|----------------|-------------|
| `engine` | Response source: `rag`, `llm`, `demo`, `rules`, `safety`, `symptom-check` |
| `risk_level` | `low`, `medium`, `high`, `emergency` |
| `mode` | Which mode handled the request |
| `confidence` | Retrieval confidence: `high`, `medium`, or `low`. Low-confidence queries return an insufficient-evidence response instead of calling the LLM |
| `facility_level` | Facility level used for tailoring this response (1-6), if provided |
| `triage_level` | Populated when `mode=symptom-check` |
| `triage_result` | Full triage assessment (symptom-check mode) |
| `progress_percentage` | Symptom-check conversation progress (0-100) |
| `options` | Suggested user response options |

**Cross-Store Reranking:**

The `/chat` endpoint uses query-type-aware reranking to prioritize the most relevant sources:
- **Clinical queries** (protocols, dosing, algorithms) → Kenya Clinical guidelines first
- **Patient queries** ("I have a headache") → MedDialog conversational answers first
- **Diagnostic queries** (ICD-10 coding) → ICD-10 codes first
- **General queries** → Balanced across all stores

When `provider_role` is set, additional role-specific boosts are applied (e.g., doctors see more international research, CHWs see more conversational guidance). Boost weights are configurable in `configs/reranking_weights.yaml`.

**Risk Levels:**
- `low` — General health information
- `medium` — Warrants medical attention
- `high` — Seek doctor soon
- `emergency` — Call 999/112 immediately

---

### 4. Symptom Triage (Single-Turn)

Quick single-turn symptom assessment without conversation flow.

```http
POST /triage
Content-Type: application/json
```

**Request:**
```json
{
  "symptoms": "headache, fever, and neck stiffness for 2 days",
  "age": 30,
  "sex": "F",
  "include_differentials": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `symptoms` | string (3-2000) | Yes | Symptom description |
| `age` | int | No | Patient age |
| `sex` | string | No | `"M"` or `"F"` |
| `include_differentials` | bool | No | Include differential diagnoses |

**Response:**
```json
{
  "triage_level": "urgent",
  "triage_message": "Seek medical attention within 24 hours",
  "extracted_symptoms": ["headache", "fever", "neck stiffness"],
  "red_flags_detected": ["neck stiffness with fever"],
  "red_flag_warnings": ["Possible meningitis — seek urgent care"],
  "differential_diagnoses": [
    {"condition": "Meningitis", "probability": 0.35}
  ],
  "recommendations": ["Visit nearest facility immediately"],
  "follow_up_questions": [],
  "kenya_notes": "MOH recommends lumbar puncture for suspected meningitis",
  "disclaimer": "This is not a diagnosis...",
  "processing_time_ms": 450
}
```

---

### 5. Conversational Symptom Checker

Guided multi-turn symptom assessment with progressive triage.

> **Session Persistence:** Symptom checker sessions are stored in Redis (when `REDIS_URL` is set)
> so sessions survive server restarts and work across multiple replicas. Falls back to in-memory
> storage when Redis is unavailable.

#### Start Conversation

```http
POST /symptom-checker/conversation/start
Content-Type: application/json
```

**Request:**
```json
{
  "language": "en"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "state": "greeting",
  "message": "Hello! I'm TibaBot. How can I help you today?",
  "message_type": "greeting",
  "is_emergency": false,
  "progress_percentage": 0,
  "options": ["I have symptoms to discuss", "I need health information"],
  "engine": "rules"
}
```

#### Send Message

```http
POST /symptom-checker/conversation/message
Content-Type: application/json
```

**Request:**
```json
{
  "session_id": "uuid-from-start",
  "message": "I have stomach pain for 2 days, sharp on the right side"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "state": "assessment_ready",
  "message": "Based on your symptoms...",
  "message_type": "assessment",
  "is_emergency": false,
  "progress_percentage": 100,
  "triage_level": "urgent",
  "triage_result": {
    "triage_level": "urgent",
    "differentials": [
      {"condition": "Appendicitis", "probability": 0.35},
      {"condition": "Gastritis", "probability": 0.25}
    ],
    "recommendations": ["See a doctor within 24 hours"],
    "red_flags": []
  },
  "options": [],
  "engine": "rules"
}
```

**Conversation States:**
- `greeting` — Initial greeting
- `collecting_symptoms` — Gathering symptom info
- `collecting_duration` — Asking about timing
- `assessment_ready` — Assessment generated
- `emergency` — Emergency detected

#### Get Conversation State

```http
GET /symptom-checker/conversation/{session_id}
```

#### End Conversation

```http
DELETE /symptom-checker/conversation/{session_id}
```

#### Submit Conversation Feedback

```http
POST /symptom-checker/conversation/feedback
Content-Type: application/json
```

```json
{
  "session_id": "uuid",
  "message_id": "msg-uuid",
  "feedback": "up",
  "bot_response": "Based on your symptoms...",
  "triage_level": "urgent",
  "state": "assessment_ready"
}
```

---

### 6. Clinical Assistant (Provider-Facing)

Authenticated endpoints for healthcare providers. Includes Kenya-specific guidelines (KEML, MOH protocols).

#### Single-Turn Clinical Assist

```http
POST /clinical/assist
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "query": "First-line treatment for uncomplicated malaria in adult",
  "context": {
    "patient_age": 35,
    "patient_sex": "M",
    "facility_level": 3,
    "allergies": [],
    "comorbidities": [],
    "current_medications": []
  },
  "user_context": {
    "role": "CLINICAL_OFFICER",
    "seniority": "REGISTRAR"
  },
  "include_citations": true,
  "include_icd10_codes": true,
  "verbosity": "standard"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string (5-2000) | Yes | Clinical question |
| `context` | PatientContext | No | Patient demographics & clinical context |
| `user_context` | UserContext | No | Provider context for role-aware retrieval. Contains `role` (`DOCTOR`, `CLINICAL_OFFICER`, `NURSE`, `CHW`, `STUDENT`), optional `seniority` and `specialization` |
| `include_citations` | bool | No | Include source citations |
| `include_icd10_codes` | bool | No | Suggest ICD-10 codes |
| `verbosity` | string | No | `"concise"`, `"standard"`, or `"educational"` |

**Role-Aware Retrieval:** When `user_context.role` is set, the guideline retrieval adjusts:
- **Budget allocation** — CHWs get more Kenya results (65%), doctors get more international (65%)
- **Distance boosting** — Kenya/International relevance scores are adjusted per role
- **Prompt calibration** — Language complexity adapts (accessible for CHWs/students, technical for consultants)

Boost weights are configurable in `configs/reranking_weights.yaml` under `clinical_provider_role_boosts`.

**Response:**
```json
{
  "recommendation": "For uncomplicated P. falciparum malaria in adults...",
  "risk_level": "medium",
  "citations": [
    {"source": "Kenya Malaria Treatment Guidelines 2022", "section": "Chapter 4.2"}
  ],
  "suggested_icd10_codes": [
    {"code": "B50.9", "description": "Plasmodium falciparum malaria, unspecified"}
  ],
  "safety_alerts": [],
  "has_safety_concerns": false,
  "abbreviations_used": {"ACT": "Artemisinin-based Combination Therapy"},
  "verbosity": "standard",
  "disclaimer": "...",
  "processing_time_ms": 2100,
  "model_used": "llama-3.3-70b-versatile",
  "is_demo_mode": false
}
```

#### Multi-Turn Clinical Chat

Supports streaming via Server-Sent Events (SSE).

```http
POST /clinical/chat
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "message": "Patient with suspected TB, sputum smear positive",
  "session_id": "optional-session-uuid",
  "patient_context": {
    "patient_age": 28,
    "facility_level": 4
  },
  "user_context": {
    "role": "DOCTOR",
    "specialization": "INTERNAL_MEDICINE"
  },
  "verbosity": "standard",
  "include_citations": true,
  "include_icd10_codes": true,
  "stream": false
}
```

**Response:**
```json
{
  "response": "For sputum smear-positive TB...",
  "session_id": "uuid",
  "message_count": 1,
  "risk_level": "high",
  "citations": [],
  "suggested_icd10_codes": [
    {"code": "A15.0", "description": "Tuberculosis of lung"}
  ],
  "safety_alerts": [],
  "has_safety_concerns": false,
  "verbosity": "standard",
  "processing_time_ms": 1800,
  "model_used": "llama-3.3-70b-versatile",
  "is_demo_mode": false
}
```

#### Provider Profile

```http
GET /clinical/profile
X-API-Key: your-api-key
```

```http
PUT /clinical/profile
X-API-Key: your-api-key
Content-Type: application/json
```

#### Session Management

```http
GET /clinical/chat/session/{session_id}
GET /clinical/chat/session/{session_id}/history
DELETE /clinical/chat/session/{session_id}
GET /clinical/chat/stats
```

#### Clinical Document Generation

Generate structured clinical documents from admission data using LLM with Kenya clinical guidelines.

```http
POST /clinical/document
Content-Type: application/json
X-API-Key: your-api-key
```

**Document Types:**

| Type | Description |
|------|-------------|
| `discharge_summary` | Full discharge summary with hospital course, significant findings, patient education, medications, follow-up |
| `soap` | SOAP-format clinical note |
| `progress_note` | Inpatient progress note |
| `referral_letter` | Referral letter to another facility/specialist |
| `clerking_note` | Initial clerking/admission note |

**Request:**
```json
{
  "document_type": "discharge_summary",
  "patient_context": {
    "patient_age": 32,
    "patient_sex": "male",
    "allergies": ["Sulfonamides"],
    "comorbidities": ["HIV"],
    "current_medications": ["TDF/3TC/DTG"],
    "facility_level": 4
  },
  "admission_context": {
    "primary_diagnosis": "Gonococcal urethritis",
    "icd10_code": "A54.0",
    "secondary_diagnoses": ["HIV infection"],
    "admission_date": "2025-06-01",
    "discharge_date": "2025-06-04",
    "length_of_stay_days": 3,
    "ward": "Medical Ward",
    "discharge_type": "NORMAL",
    "procedures_performed": ["Urethral swab culture"],
    "medications_given": ["Ceftriaxone 500mg IM stat", "Azithromycin 1g PO stat"],
    "discharge_medications": ["Doxycycline 100mg BD x 7 days"],
    "key_investigations": ["GC culture: positive", "RPR: non-reactive"],
    "complications": [],
    "condition_at_discharge": "Stable, afebrile, symptoms resolving"
  },
  "encounter_context": {
    "chief_complaint": "Urethral discharge and dysuria for 5 days"
  },
  "facility_context": {
    "level": 4,
    "county": "Nairobi"
  },
  "output_format": "structured",
  "generation_mode": "suggest",
  "include_icd10_codes": true,
  "additional_instructions": "Emphasise partner notification and STI follow-up per MOH guidelines"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_type` | string | Yes | One of: `discharge_summary`, `soap`, `progress_note`, `referral_letter`, `clerking_note` |
| `patient_context` | PatientContext | Yes | Patient demographics and clinical context. `patient_sex` accepts `"M"`, `"F"`, `"male"`, or `"female"` |
| `admission_context` | AdmissionContext | Yes | Structured admission / encounter data (see below) |
| `encounter_context` | EncounterContext | No | Chief complaint, vitals, HPI, examination findings |
| `facility_context` | FacilityContext | No | Facility level (1-6) and county |
| `output_format` | string | No | `"markdown"` (default), `"structured"` (JSON sections), or `"fhir"` (FHIR R4 Composition) |
| `generation_mode` | string | No | `"suggest"` (default): rich draft with AI-synthesised narratives and clearly-tagged suggestions for clinician review. `"generate"`: strict, facts-only output safe for audit trails and legal records (temperature 0, skeleton gating) |
| `additional_instructions` | string (max 2000) | No | Extra guidance for the LLM |
| `include_icd10_codes` | bool | No | Include ICD-10 code suggestions (default: `true`) |
| `system_instruction` | string (max 2000) | No | Host application instruction injected into the system prompt |

**AdmissionContext Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `primary_diagnosis` | string (2-500) | Yes | Primary diagnosis (free text or ICD-10 description) |
| `icd10_code` | string | No | ICD-10 code e.g. `"A54.0"` |
| `secondary_diagnoses` | string[] | No | Secondary / comorbid diagnoses |
| `admission_date` | string | No | Admission date (ISO 8601) |
| `discharge_date` | string | No | Discharge date (ISO 8601) |
| `length_of_stay_days` | int (0-3650) | No | Length of stay in days |
| `ward` | string | No | Ward name e.g. `"ICU"`, `"Medical Ward"` |
| `discharge_type` | string | No | One of: `NORMAL`, `AMA`, `TRANSFER`, `DEATH`, `DAMA` |
| `procedures_performed` | string[] | No | Procedures performed during admission |
| `medications_given` | string[] | No | Medications administered during stay |
| `discharge_medications` | string[] | No | Medications prescribed at discharge |
| `key_investigations` | string[] | No | Notable lab / imaging results |
| `complications` | string[] | No | Complications during admission |
| `condition_at_discharge` | string | No | Patient condition at discharge |

**Response (`output_format: "structured"`):**
```json
{
  "document_type": "discharge_summary",
  "sections": [
    {
      "section_id": "patient_information",
      "title": "Patient Information",
      "content": "32-year-old male, HIV-positive on TDF/3TC/DTG..."
    },
    {
      "section_id": "hospital_course",
      "title": "Hospital Course",
      "content": "Patient admitted with 5-day history of urethral discharge..."
    },
    {
      "section_id": "significant_findings",
      "title": "Significant Findings",
      "content": "GC culture: positive (2025-06-02). RPR: non-reactive (2025-06-01)."
    },
    {
      "section_id": "patient_education",
      "title": "Patient Education",
      "content": "You were treated for a bacterial infection. Take all your antibiotics as prescribed. Watch for: fever, worsening discharge, or pain — seek care immediately if these occur. Ensure your partner(s) are also tested and treated."
    },
    {
      "section_id": "discharge_medications",
      "title": "Discharge Medications",
      "content": "1. Doxycycline 100mg BD × 7 days\n2. Continue TDF/3TC/DTG..."
    },
    {
      "section_id": "condition_at_discharge",
      "title": "Condition at Discharge",
      "content": "Stable, afebrile, symptoms resolving..."
    },
    {
      "section_id": "follow_up",
      "title": "Follow-Up and Instructions",
      "content": "1. STI clinic review in 7 days\n2. Partner notification counselling..."
    }
  ],
  "full_text": "## Patient Information\n32-year-old male...\n\n## Hospital Course\n...\n\n## Significant Findings\n...\n\n## Patient Education\n...",
  "suggested_icd10_codes": [
    {"code": "A54.0", "description": "Gonococcal infection of lower genitourinary tract", "confidence": 0.95}
  ],
  "safety_alerts": [],
  "has_safety_concerns": false,
  "citations": [
    {"source": "Kenya STI Treatment Guidelines 2024", "section": "Chapter 3"}
  ],
  "generation_mode": "suggest",
  "processing_time_ms": 3200,
  "model_used": "llama-3.3-70b-versatile",
  "disclaimer": "AI-generated clinical document. Must be reviewed and approved by the responsible clinician before use."
}
```

**Generation Modes:**

| Mode | Purpose | Temperature | LLM Scope | Grounding | Skeleton Threshold |
|------|---------|-------------|-----------|-----------|--------------------|
| `suggest` (default) | Draft for clinician review. AI synthesises narratives, fills gaps, proposes follow-up — all clearly tagged as AI-suggested. | 0.3 | All sections | Warnings only (permissive) | Disabled — always attempts generation |
| `generate` | Strict, audit-safe output. Only facts present in the input appear in the document. | 0 | Narrative sections only | Strict — flags anything not verbatim in input | 12.5% completeness required |

In `suggest` mode, the `section_provenance` map in the response tags each section as `from_input`, `llm_generated`, `llm_suggested`, `guideline_rag`, `not_documented`, or `skeleton` so clinicians know exactly what to verify.

**Response (`output_format: "markdown"`):**

Returns the same schema, but `full_text` contains the complete rendered Markdown document and `sections` are parsed from the Markdown headings.

**Response (`output_format: "fhir"`):**

Returns the same schema, plus a `fhir_resource` field containing a FHIR R4 `Composition` resource. The `full_text` field is empty (use the FHIR resource instead).

```json
{
  "document_type": "discharge_summary",
  "sections": [...],
  "full_text": "",
  "fhir_resource": {
    "resourceType": "Composition",
    "status": "final",
    "type": {
      "coding": [
        {
          "system": "http://loinc.org",
          "code": "18842-5",
          "display": "Discharge summary"
        }
      ],
      "text": "Discharge summary"
    },
    "subject": {
      "display": "32y/M"
    },
    "date": "2026-03-17T12:00:00Z",
    "title": "Discharge summary",
    "section": [
      {
        "title": "Hospital Course",
        "text": {
          "status": "generated",
          "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Patient admitted with...</div>"
        }
      },
      {
        "title": "Discharge Medications",
        "text": {
          "status": "generated",
          "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">1. Doxycycline 100mg BD...</div>"
        }
      }
    ],
    "encounter": {
      "display": "Admitted: 2025-06-01 | Discharged: 2025-06-04 | Ward: Medical Ward"
    },
    "author": [
      {"display": "TibaBot Clinical Documentation AI (review required)"}
    ]
  },
  "suggested_icd10_codes": [...],
  "processing_time_ms": 3200,
  "model_used": "llama-3.3-70b-versatile",
  "disclaimer": "AI-generated clinical document. Must be reviewed and approved by the responsible clinician before use."
}
```

**LOINC Codes per Document Type:**

| Document Type | LOINC Code | Display |
|--------------|------------|---------|
| `discharge_summary` | 18842-5 | Discharge summary |
| `soap` | 11506-3 | Progress note |
| `progress_note` | 11506-3 | Progress note |
| `referral_letter` | 57133-1 | Referral note |
| `clerking_note` | 11488-4 | Consultation note |

**SOAP Note Example:**
```json
{
  "document_type": "soap",
  "patient_context": {
    "patient_age": 45,
    "patient_sex": "F",
    "facility_level": 3
  },
  "admission_context": {
    "primary_diagnosis": "Hypertension, uncontrolled"
  },
  "encounter_context": {
    "chief_complaint": "Headache and dizziness for 2 days",
    "vitals": {
      "blood_pressure_systolic": 180,
      "blood_pressure_diastolic": 110,
      "heart_rate": 92
    }
  },
  "output_format": "markdown"
}
```

---

### 7. ICD-10 Auto-Coder

#### Search Codes

```http
GET /icd10/search?q=malaria&limit=10
```

**Response:**
```json
{
  "results": [
    {"code": "B50.9", "description": "Plasmodium falciparum malaria, unspecified"},
    {"code": "B51.9", "description": "Plasmodium vivax malaria, unspecified"}
  ],
  "total_matches": 15,
  "query": "malaria",
  "processing_time_ms": 12
}
```

#### Typeahead Suggestions

Optimized for UI autocomplete with fast response times.

```http
GET /icd10/suggest?q=malar&limit=5
```

**Response:**
```json
{
  "suggestions": [
    {"code": "B50.9", "description": "Plasmodium falciparum malaria, unspecified", "score": 0.95}
  ],
  "query": "malar",
  "total_matches": 8,
  "processing_time_ms": 5
}
```

#### Auto-Code Clinical Text

```http
POST /icd10/code
Content-Type: application/json
```

**Request:**
```json
{
  "clinical_text": "Patient presents with high fever, chills, positive malaria RDT",
  "max_codes": 5,
  "include_hierarchy": false,
  "include_confidence": true
}
```

**Response:**
```json
{
  "codes": [
    {"code": "B50.9", "confidence": 0.89, "description": "P. falciparum malaria"},
    {"code": "R50.9", "confidence": 0.72, "description": "Fever, unspecified"}
  ],
  "processing_time_ms": 150,
  "method": "vector_search",
  "input_text": "Patient presents with high fever..."
}
```

#### Batch Auto-Code

Process up to 100 clinical texts in a single request.

```http
POST /icd10/batch
Content-Type: application/json
```

**Request:**
```json
{
  "items": [
    {"clinical_text": "Malaria with fever"},
    {"clinical_text": "Type 2 diabetes mellitus"}
  ],
  "max_codes_per_item": 3,
  "include_confidence": true
}
```

**Response:**
```json
{
  "results": ["..."],
  "total_processed": 2,
  "successful": 2,
  "failed": 0,
  "processing_time_ms": 280
}
```

#### Validate Code Combinations

Check for excludes1/excludes2 conflicts between ICD-10 codes.

```http
POST /icd10/validate
Content-Type: application/json
```

**Request:**
```json
{
  "codes": ["E11.9", "E10.9"]
}
```

**Response:**
```json
{
  "valid": false,
  "conflicts": [
    {"codes": ["E11.9", "E10.9"], "reason": "Type 1 and Type 2 diabetes are mutually exclusive"}
  ],
  "warnings": [],
  "validated_codes": ["E11.9", "E10.9"],
  "unrecognized_codes": [],
  "processing_time_ms": 8
}
```

#### Lookup Single Code

```http
GET /icd10/lookup/B50.9
```

**Response:**
```json
{
  "found": true,
  "code": {
    "code": "B50.9",
    "description": "Plasmodium falciparum malaria, unspecified",
    "category": "B50",
    "chapter": "I"
  },
  "related_codes": ["..."],
  "processing_time_ms": 3
}
```

---

### 8. Medical Condition Predictor

CatBoost ML model predicting chronic conditions from patient demographics, vitals, and lab values.

> **Feature flag:** `TIBABOT_ENABLE_PREDICTOR` (default: `true`)

```http
POST /predict/condition
Content-Type: application/json
```

**Request:**
```json
{
  "age": 55,
  "gender": "male",
  "glucose": 180,
  "blood_pressure": 145,
  "bmi": 32.5,
  "oxygen_saturation": 96,
  "cholesterol": 240,
  "triglycerides": 200,
  "hba1c": 7.5,
  "smoking": 1,
  "alcohol": 0,
  "physical_activity": 2,
  "diet_score": 4,
  "stress_level": 7,
  "sleep_hours": 5,
  "family_history": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `age` | int | Patient age |
| `gender` | string | `"male"` or `"female"` |
| `glucose` | float | Blood glucose (mg/dL) |
| `blood_pressure` | float | Systolic BP (mmHg) |
| `bmi` | float | Body mass index |
| `oxygen_saturation` | float | SpO2 (%) |
| `cholesterol` | float | Total cholesterol (mg/dL) |
| `triglycerides` | float | Triglycerides (mg/dL) |
| `hba1c` | float | Glycated hemoglobin (%) |
| `smoking` | int | Smoking status (0/1) |
| `alcohol` | int | Alcohol use (0/1) |
| `physical_activity` | int | Activity level (1-5) |
| `diet_score` | int | Diet quality score (1-10) |
| `stress_level` | int | Stress level (1-10) |
| `sleep_hours` | float | Average sleep hours |
| `family_history` | int | Family history flag (0/1) |

**Response:**
```json
{
  "primary_condition": "Diabetes",
  "confidence": 0.82,
  "all_predictions": [
    {"condition": "Diabetes", "probability": 0.82},
    {"condition": "Hypertension", "probability": 0.65},
    {"condition": "Heart Disease", "probability": 0.30}
  ],
  "risk_factors": ["High glucose", "Elevated HbA1c", "High BMI"],
  "model_version": "1.0.0"
}
```

**Query parameter:** `?display_mode=explicit` (default) or `?display_mode=silent`

#### Supporting Endpoints

```http
GET /predict/conditions   # List all predictable conditions
GET /predict/features     # List expected input features
GET /predict/health       # Service health check
```

---

### 9. ICU Condition Predictor

Multi-label predictor for critical care conditions (sepsis, AKI, etc.) with clinical severity scores.

> **Feature flag:** `TIBABOT_ENABLE_ICU_PREDICTOR` (default: `true`)

#### Predict ICU Conditions

```http
POST /predict/icu/predict
Content-Type: application/json
```

**Request:**
```json
{
  "heart_rate": 110,
  "systolic_bp": 85,
  "diastolic_bp": 55,
  "respiratory_rate": 28,
  "spo2": 90,
  "temperature": 39.2,
  "gcs": 13,
  "creatinine": 2.5,
  "lactate": 4.0,
  "wbc": 18.5,
  "platelets": 80,
  "bilirubin": 3.2,
  "pao2": 65,
  "paco2": 48,
  "ph": 7.28,
  "vasopressors": true,
  "mechanical_ventilation": false,
  "dialysis": false,
  "unit_system": "metric"
}
```

**Response:**
```json
{
  "predictions": [
    {
      "condition": "Sepsis",
      "probability": 0.85,
      "risk_level": "high",
      "confidence": "high",
      "icd10_code": "A41.9"
    },
    {
      "condition": "Acute Kidney Injury",
      "probability": 0.72,
      "risk_level": "high",
      "confidence": "moderate",
      "icd10_code": "N17.9"
    }
  ],
  "sofa_score": {"total": 12, "respiratory": 2, "coagulation": 3, "liver": 2, "cardiovascular": 3, "cns": 1, "renal": 1},
  "qsofa_score": {"total": 2, "criteria": {"low_sbp": true, "high_rr": true, "altered_mentation": false}},
  "critical_alerts": ["Lactate > 2 mmol/L — consider sepsis workup"],
  "recommendations": ["Consider broad-spectrum antibiotics", "Volume resuscitation"],
  "overall_acuity": "critical"
}
```

#### Calculate SOFA Score

```http
POST /predict/icu/sofa
Content-Type: application/json
```

Returns component-level SOFA score breakdown (0-24 total).

#### Calculate qSOFA Score

```http
POST /predict/icu/qsofa
Content-Type: application/json
```

Returns qSOFA criteria assessment (0-3 total).

#### Risk Stratification

```http
POST /predict/icu/risk-stratify
Content-Type: application/json
```

Returns monitoring frequency recommendations and escalation triggers.

#### Supporting Endpoints

```http
GET /predict/icu/conditions   # List ICU conditions with ICD-10 mappings
GET /predict/icu/health       # Service health check
```

---

### 10. Practitioner Validation

Validate healthcare practitioners against the SHA Health Workforce Registry (HWR).

```http
POST /practitioner/validate
Content-Type: application/json
```

**Request:**
```json
{
  "identification_type": "ID",
  "identification_number": "12345678"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `identification_type` | string | `"ID"` or `"passport"` |
| `identification_number` | string (6-20) | National ID or passport number |

**Response:**
```json
{
  "status": "valid",
  "message": "Practitioner is registered and active",
  "practitioner": {
    "name": "Dr. Jane Wanjiku",
    "registration_number": "A1234",
    "cadre": "Medical Practitioner",
    "license_status": "Active"
  },
  "api_key": "generated-api-key",
  "api_key_hash": "sha256-hash",
  "validated_at": "2026-03-02T10:00:00Z",
  "identification_type": "ID",
  "identification_number_masked": "****5678"
}
```

**Status Values:** `valid`, `inactive`, `not_found`, `suspended`, `error`

#### Supporting Endpoints

```http
GET /practitioner/health   # Service health check
GET /practitioner/stats    # Validation statistics (auth required)
```

---

### 11. Internationalization (i18n)

```http
GET /i18n/languages
```

**Response:**
```json
{
  "languages": {"en": "English", "sw": "Swahili"},
  "default": "en"
}
```

```http
GET /i18n/detect
```

Detects language from `Accept-Language` header.

```http
POST /i18n/translate
Content-Type: application/json
```

**Request:**
```json
{
  "keys": ["symptom_checker.greeting", "triage.emergency"],
  "language": "sw"
}
```

```http
GET /i18n/bundle/sw
```

Returns the full Swahili translation bundle (useful for frontend caching).

---

### 12. Feedback

Unified feedback collection across all TibaBot services. Every service response can be rated with thumbs up/down, tagged by service type, and enriched with service-specific metadata.

#### Submit Feedback

```http
POST /feedback
Content-Type: application/json
```

**Request:**
```json
{
  "message_id": "abc123",
  "conversation_id": "conv-456",
  "feedback": "down",
  "user_query": "Generate care plan for pneumonia with SpO2 88%",
  "bot_response": "Goals: Manage pneumonia. Investigations: Baseline investigations...",
  "risk_level": "high",
  "service_type": "care_plan",
  "metadata": {
    "mode": "template",
    "template_used": "pneumonia",
    "llm_enriched": false,
    "facility_level": "H3"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | ID of the response being rated |
| `feedback` | string | Yes | `"up"` or `"down"` |
| `conversation_id` | string | No | Associated conversation |
| `user_query` | string | No | Original user question |
| `bot_response` | string | No | Bot's response text (truncated to 500 chars) |
| `risk_level` | string | No | Risk level of the response |
| `service_type` | string | No | Which service generated the response (see below) |
| `metadata` | dict | No | Service-specific context for quality analysis |

**Service Types:**

| Value | Service |
|-------|---------|
| `chat` | General RAG chat (default) |
| `symptom_checker` | Symptom checker / triage |
| `clinical_assist` | Clinical assistant (provider-facing) |
| `care_plan` | Care Plan Generator |
| `lab_assist` | Lab result interpretation |
| `discharge_readiness` | Discharge readiness assessment |
| `cds_rules` | CDS Rules Engine |
| `clerking_assist` | Clerking Assist |
| `icd10` | ICD-10 search / coding |
| `medical_predictor` | Medical condition predictor |
| `icu_predictor` | ICU condition predictor |

**Recommended `metadata` by service:**

| Service | Useful metadata fields |
|---------|----------------------|
| `care_plan` | `mode`, `template_used`, `llm_enriched`, `facility_level` |
| `clinical_assist` | `verbosity`, `risk_level`, `rag_source_count` |
| `symptom_checker` | `triage_level`, `symptoms_extracted`, `language` |
| `lab_assist` | `critical_count`, `patterns_detected` |
| `discharge_readiness` | `readiness_level`, `readiness_score`, `condition` |
| `cds_rules` | `rules_fired`, `alert_count`, `severity_max` |
| `clerking_assist` | `format`, `completeness_score` |
| `icd10` | `code`, `confidence`, `search_mode` |

**Response:**
```json
{
  "status": "received",
  "message": "Thank you for your feedback!",
  "feedback_id": "a1b2c3d4"
}
```

#### Feedback Statistics

```http
GET /feedback/stats
GET /feedback/stats?service=care_plan
```

Optional query parameter `service` filters statistics to a single service type.

**Response:**
```json
{
  "total": 142,
  "positive": 118,
  "negative": 24,
  "positive_rate": 83.1,
  "by_service": {
    "chat": {"total": 80, "positive": 68, "negative": 12, "positive_rate": 85.0},
    "care_plan": {"total": 30, "positive": 22, "negative": 8, "positive_rate": 73.3},
    "lab_assist": {"total": 15, "positive": 14, "negative": 1, "positive_rate": 93.3}
  },
  "recent_negative": [
    {
      "feedback_id": "a1b2c3d4",
      "user_query": "Generate care plan for pneumonia with SpO2 88%",
      "risk_level": "high",
      "service_type": "care_plan",
      "timestamp": "2026-03-07T10:30:00"
    }
  ]
}
```

---

## Clinical Decision Support Endpoints

### 13. CDS Rules Engine

Clinical decision support rules evaluated against patient data: drug-drug interactions, contraindications, KEML formulary compliance, and Kenya MOH protocol adherence.

> **Feature flag:** `TIBABOT_ENABLE_CDS_RULES` (default: `true`)

#### Health Check

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

#### Evaluate Rules

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

#### List Rules

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

### 14. Lab Assist

Interprets lab results in clinical context: flags abnormals against age/sex-specific reference ranges (~50 common tests), detects multi-lab patterns, and generates critical value alerts.

> **Feature flag:** `TIBABOT_ENABLE_LAB_ASSIST` (default: `true`)

#### Health Check

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

#### Interpret Lab Results

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

### 15. Discharge Readiness

Assesses whether a patient meets discharge criteria based on condition-specific checklists, vitals/lab stability trends, and composite scoring. Includes Kenya-specific social criteria (NHIF/SHA, CHW referral).

> **Feature flag:** `TIBABOT_ENABLE_DISCHARGE_READINESS` (default: `true`)

#### Health Check

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

#### List Supported Conditions

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

#### Assess Discharge Readiness

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
      "name": "Afebrile for 24h",
      "category": "vitals",
      "met": true,
      "current_value": "36.6°C",
      "target_value": "< 38.0°C",
      "notes": null
    },
    {
      "criterion": "crp within safe-for-discharge range",
      "name": "crp within safe-for-discharge range",
      "category": "labs",
      "met": false,
      "current_value": "15.0 mg/L",
      "target_value": "0-10 mg/L",
      "notes": null
    },
    {
      "criterion": "CHW referral arranged",
      "name": "CHW referral arranged",
      "category": "social",
      "met": false,
      "current_value": "not met",
      "target_value": "required",
      "notes": "CHW follow-up for medication adherence and home monitoring"
    },
    {
      "criterion": "Heart Rate stability trend",
      "name": "Heart Rate stability trend",
      "category": "vitals",
      "met": true,
      "current_value": "78.0 bpm (stable)",
      "target_value": "50-100 bpm",
      "notes": "Trend over 2 readings: stable"
    }
  ],
  "unmet_criteria_count": 2,
  "readmission_risk": null,
  "readmission_risk_level": null,
  "recommendations": [
    "crp within safe-for-discharge range — current: 15.0 mg/L, target: 0-10 mg/L",
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
| `readmission_risk` | float \| null | 30-day readmission probability (ML model) |
| `readmission_risk_level` | string \| null | `"low"`, `"moderate"`, or `"high"` |
| `recommendations` | string[] | Actions to address before discharge |
| `vitals_stability` | string \| null | `"stable"`, `"improving"`, or `"unstable"` |

**DischargeCriterion object:**

| Field | Type | Description |
|-------|------|-------------|
| `criterion` | string | Criterion description (e.g. `"Afebrile for 24h"`) |
| `name` | string | Alias for `criterion` — always identical value, provided for serializer compatibility |
| `category` | string | One of: `vitals`, `labs`, `functional`, `medication`, `social`, `follow_up` |
| `met` | bool | Whether the criterion is satisfied |
| `current_value` | string | Current observed value (always populated, e.g. `"8.5 K/µL"`, `"met"`) |
| `target_value` | string | Target safe-for-discharge range (always populated, e.g. `"4-12 K/µL"`, `"required"`) |
| `notes` | string \| null | Additional clinical context |

**Clinical array evaluation:** Every item in the request arrays is individually assessed:
- **`lab_results`** — Each lab is evaluated against safe-for-discharge reference ranges (e.g. WBC 4-12, lactate 0-2). Labs without a known range are flagged for clinician review.
- **`current_medications`** — Each medication is checked for IV route; IV meds are flagged as needing oral transition before discharge.
- **`vitals_history`** — Each vital sign series is assessed for stability trend (stable/improving/unstable).

**Readiness Levels:**
- `ready` — All critical criteria met, safe to discharge
- `near_ready` — Most criteria met, minor items outstanding
- `not_ready` — Significant criteria unmet, not safe to discharge

**Criterion Categories:** `vitals`, `labs`, `functional`, `medication`, `social`, `follow_up`

---

### 16. Care Plan Generator

Generates structured, evidence-based care plans for 10 conditions. Plans include KEML facility-level medication checks, CDS rules validation, and Kenya-specific protocol adherence. Supports FHIR R4 output for EMR integration.

> **Feature flag:** `TIBABOT_ENABLE_CARE_PLAN` (default: `true`)

#### Health Check

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

#### List Condition Templates

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

#### Get Condition Template Details

```http
GET /care-plan/conditions/pneumonia
```

Returns the full template details for a specific condition including default goals, interventions, and discharge criteria.

#### Generate Care Plan

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
    }
  ],
  "interventions": [
    {
      "category": "medications",
      "items": [
        {
          "action": "Ceftriaxone 1g IV BD + Azithromycin 500mg OD",
          "rationale": "KEML first-line for moderate CAP. Penicillin allergy — cephalosporin substitution",
          "duration": "3 days IV then step-down to oral",
          "monitoring": "Temperature q6h, clinical response at 48h",
          "timing": "Start within 4 hours of admission",
          "escalation": "No improvement at 48h → consider broader coverage"
        }
      ]
    },
    {
      "category": "investigations",
      "items": [
        {
          "action": "Blood cultures x2, sputum culture, CXR",
          "rationale": "Identify pathogen, assess extent of consolidation",
          "timing": "On admission, before antibiotics"
        }
      ]
    },
    {
      "category": "nursing",
      "items": [
        {
          "action": "Oxygen therapy to maintain SpO2 ≥94%",
          "rationale": "Correct hypoxemia",
          "escalation": "SpO2 <90% despite O2 → notify doctor"
        }
      ]
    },
    {
      "category": "patient_education",
      "items": [
        {
          "action": "Pneumonia education",
          "content": "Complete full course of antibiotics. Return if fever recurs or breathing worsens."
        }
      ]
    }
  ],
  "discharge_criteria": [
    "Afebrile for 24h",
    "SpO2 ≥92% on room air",
    "Tolerating oral antibiotics and fluids"
  ],
  "follow_up": {
    "appointment": "GP/outpatient review in 7 days",
    "investigations": "Repeat CXR at 6 weeks if symptoms persist",
    "red_flags": [
      "Return immediately if: fever recurs, worsening breathlessness, chest pain, coughing blood"
    ]
  },
  "references": ["Kenya MOH Clinical Guidelines 2022", "KEML 2023", "BTS Guidelines for CAP"],
  "cds_alerts": [],
  "facility_level_notes": ["All recommended medications available at H3 level per KEML 2023"],
  "template_used": "pneumonia",
  "mode": "template"
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
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

#### Generate Care Plan as FHIR R4 Resource

Same request as `/care-plan/generate` but returns the output as an HL7 FHIR R4 CarePlan resource suitable for EMR integration.

```http
POST /care-plan/generate/fhir
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:** Same as `/care-plan/generate`.

**Response:** FHIR R4 `CarePlan` resource with:
- `contained` Goal resources with priority and timeframes
- `activity` entries coded with SNOMED CT per intervention category
- `extension` fields for TibaBot metadata (generation mode, template, facility level)
- `category` coded with ICD-10

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

### 17. Clerking Assist

Autocomplete for clinical documentation and free-text to structured note conversion. Supports clerking, SOAP, and discharge summary formats with ICD-10-coded diagnosis extraction.

> **Feature flag:** `TIBABOT_ENABLE_CLERKING_ASSIST` (default: `true`)

#### Health Check

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

#### Get Note Template

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

#### Autocomplete

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

#### Structure Note

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
    {"diagnosis": "Community-acquired pneumonia", "icd10_code": "J18.9", "confidence": 0.92},
    {"diagnosis": "Type 2 diabetes mellitus", "icd10_code": "E11.9", "confidence": 0.88}
  ],
  "extracted_medications": ["metformin"],
  "suggested_investigations": [
    "Full blood count", "Blood cultures", "Chest X-ray", "CRP / ESR", "Blood glucose"
  ],
  "completeness_score": 0.67,
  "missing_sections": ["family_history", "social_history", "review_of_systems", "investigations"]
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

### 18. Investigation Suggestions

Suggests laboratory, imaging, and point-of-care investigations based on diagnoses, symptoms, and clinical context. Pulls from 64 Kenya MOH care plan templates and CDS protocol adherence rules. Returns structured suggestions with LOINC codes and optional draft FHIR R4 `ServiceRequest` resources for HMIS integration.

> **Feature flag:** `TIBABOT_ENABLE_INVESTIGATIONS` (default: `true`)

#### Suggest Investigations

```http
POST /clinical/investigations/suggest
Content-Type: application/json
X-API-Key: your-api-key
```

**Request:**
```json
{
  "chief_complaint": "Fever and chills for 3 days",
  "diagnoses": ["malaria"],
  "symptoms": ["fever", "chills", "headache"],
  "existing_orders": ["Malaria RDT"],
  "existing_results": {"malaria_rdt": "positive"},
  "patient_age": 30,
  "patient_sex": "M",
  "is_pregnant": false,
  "facility_level": "H3",
  "region": "lake_endemic",
  "include_fhir": true,
  "max_suggestions": 10
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `chief_complaint` | string (≤1000) | No | `null` | Chief complaint or reason for visit |
| `diagnoses` | string[] | No | `[]` | Working/confirmed diagnoses (free text or ICD-10 descriptions) |
| `symptoms` | string[] | No | `[]` | Current symptoms |
| `existing_orders` | string[] | No | `[]` | Investigations already ordered (excluded from suggestions) |
| `existing_results` | dict[str, str] | No | `{}` | Lab results already available (test → value) |
| `patient_age` | int (0-120) | No | `null` | Patient age in years |
| `patient_sex` | string | No | `null` | `"M"` or `"F"` |
| `is_pregnant` | bool | No | `false` | Whether patient is pregnant |
| `facility_level` | string | No | `null` | Kenya facility level (`"H1"`–`"H5"`) — filters out investigations above the facility's capability |
| `region` | string | No | `null` | Geographic region for protocol rules (e.g. `"lake_endemic"`, `"coast_endemic"`) |
| `include_fhir` | bool | No | `false` | Include draft FHIR R4 `ServiceRequest` resources in response |
| `max_suggestions` | int (1-50) | No | `15` | Maximum number of suggestions to return |

**Response:**
```json
{
  "suggestions": [
    {
      "name": "FBC, blood glucose, renal function, LFTs",
      "category": "laboratory",
      "priority": "stat",
      "rationale": "Assess severity and organ involvement",
      "timing": "On admission",
      "loinc_code": "58410-2",
      "loinc_display": "CBC panel - Blood by Automated count",
      "source": "Kenya Malaria Treatment Guidelines 2022",
      "condition_key": "malaria",
      "min_facility_level": "H2"
    },
    {
      "name": "Blood glucose level",
      "category": "laboratory",
      "priority": "stat",
      "rationale": "Hypoglycaemia is a feature of severe malaria and a side effect of quinine/artesunate",
      "timing": "On admission, q4-6h in severe malaria",
      "loinc_code": "2339-0",
      "loinc_display": "Glucose [Mass/volume] in Blood",
      "source": "Kenya Malaria Treatment Guidelines 2022",
      "condition_key": "malaria",
      "min_facility_level": "H2"
    }
  ],
  "fhir_service_requests": [
    {
      "resourceType": "ServiceRequest",
      "status": "draft",
      "intent": "proposal",
      "priority": "stat",
      "code": {
        "text": "FBC, blood glucose, renal function, LFTs",
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "58410-2",
            "display": "CBC panel - Blood by Automated count"
          }
        ]
      },
      "subject": {"display": "30y/M"},
      "occurrenceString": "On admission",
      "note": [{"text": "Assess severity and organ involvement"}],
      "supportingInfo": [{"display": "Kenya Malaria Treatment Guidelines 2022"}]
    }
  ],
  "matched_conditions": ["malaria"],
  "cds_alerts_applied": 0,
  "total_suggestions": 2,
  "disclaimer": "Investigation suggestions are advisory only. Clinical judgment and local protocols should guide ordering decisions."
}
```

| Response Field | Type | Description |
|----------------|------|-------------|
| `suggestions` | SuggestedInvestigation[] | Ordered by priority (stat → urgent → routine) |
| `fhir_service_requests` | dict[] \| null | Draft FHIR R4 ServiceRequest resources (when `include_fhir=true`) |
| `matched_conditions` | string[] | Care plan template condition keys that matched |
| `cds_alerts_applied` | int | Number of CDS protocol rules that contributed suggestions |
| `total_suggestions` | int | Total number of suggestions returned |
| `disclaimer` | string | Medical disclaimer |

**SuggestedInvestigation fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable investigation name (e.g. `"FBC"`, `"Chest X-ray PA"`) |
| `category` | enum | `laboratory`, `imaging`, `procedure`, `point_of_care`, `microbiology`, `pathology` |
| `priority` | enum | `stat`, `urgent`, `routine` |
| `rationale` | string | Clinical rationale from Kenya MOH guidelines |
| `timing` | string \| null | When to perform (e.g. `"On admission"`, `"Day 3"`) |
| `loinc_code` | string \| null | LOINC code for HMIS interoperability |
| `loinc_display` | string \| null | LOINC display name |
| `source` | string \| null | Guideline source reference |
| `condition_key` | string \| null | Matched care plan template condition |
| `min_facility_level` | string \| null | Minimum Kenya facility level required |

#### HMIS Integration Pattern (Vitora)

The recommended integration pattern for Vitora or any FHIR-compliant HMIS:

1. **Encounter opened** → Vitora calls `POST /clinical/investigations/suggest` with `include_fhir=true`
2. **Suggestions displayed** → Vitora renders suggestions as "pre-orders" in the encounter UI
3. **Clinician accepts/rejects** → Vitora creates actual `ServiceRequest` resources in its FHIR store
4. **TibaBot is read-only / advisory** — it never writes orders directly

```
Vitora Encounter ──▶ POST /clinical/investigations/suggest
                     { diagnoses, symptoms, existing_orders, facility_level }
                ◀── { suggestions[ ], fhir_service_requests[ ] }
                     │
                     ▼
              Clinician reviews in encounter UI
                     │
                Accept ──▶ Vitora creates ServiceRequest in FHIR store
                Reject ──▶ No action
```

---

## Integrations

### 19. WhatsApp Webhooks

WhatsApp integration supporting both Meta WhatsApp Cloud API and Twilio webhook formats. Includes per-phone-number rate limiting, HMAC signature verification, and delivery status tracking.

> **Feature flag:** `WHATSAPP_ENABLED` (default: `false`)

#### Webhook Verification (Meta)

```http
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=your-token&hub.challenge=challenge-string
```

Meta sends this during webhook setup. Returns the challenge string if the `verify_token` matches.

#### Incoming Messages

```http
POST /webhooks/whatsapp
```

Receives incoming WhatsApp messages. Supports both Meta and Twilio payload formats — automatically detected. Messages are processed in background tasks with per-phone-number rate limiting.

**Meta payload format:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "254712345678",
                "type": "text",
                "text": {"body": "I have a headache"},
                "timestamp": "1709900000"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Twilio payload format:** Standard Twilio webhook fields (`From`, `Body`, `MessageSid`).

#### Delivery Status Callbacks

```http
POST /webhooks/whatsapp/status
```

Receives delivery status updates (sent, delivered, read, failed) for outbound messages.

```json
{
  "statuses": [
    {
      "id": "wamid.xxx",
      "status": "delivered",
      "timestamp": "1709900100",
      "recipient_id": "254712345678"
    }
  ]
}
```

#### Stats

```http
GET /webhooks/whatsapp/stats
```

**Response:**
```json
{
  "rate_limits": {
    "active_sessions": 5,
    "requests_per_minute": 30
  },
  "delivery": {
    "total_sent": 150,
    "delivered": 142,
    "read": 98,
    "failed": 3,
    "delivery_rate": 0.947,
    "read_rate": 0.653,
    "avg_latency_ms": 1200
  }
}
```

---

## Error Handling

### Error Response Format

```json
{
  "detail": "Error description",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 30
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request body or missing required fields |
| 401 | `UNAUTHORIZED` | Invalid or missing API key |
| 404 | — | Resource not found (e.g., condition template, session) |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |
| 503 | `SERVICE_UNAVAILABLE` | RAG not initialized or feature service not loaded |

---

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `TIBABOT_ENABLE_PREDICTOR` | `true` | Enable medical condition predictor |
| `TIBABOT_ENABLE_ICU_PREDICTOR` | `true` | Enable ICU condition predictor |
| `TIBABOT_ENABLE_CDS_RULES` | `true` | Enable CDS Rules Engine |
| `TIBABOT_ENABLE_LAB_ASSIST` | `true` | Enable Lab Assist |
| `TIBABOT_ENABLE_DISCHARGE_READINESS` | `true` | Enable Discharge Readiness |
| `TIBABOT_ENABLE_CARE_PLAN` | `true` | Enable Care Plan Generator |
| `TIBABOT_ENABLE_CLERKING_ASSIST` | `true` | Enable Clerking Assist |
| `WHATSAPP_ENABLED` | `false` | Enable WhatsApp webhook integration |
| `TIBABOT_ENABLE_DOCS` | `false` | Enable OpenAPI docs (`/docs`, `/redoc`) |
| `TIBABOT_REQUIRE_AUTH` | `false` | Require auth for all endpoints |

### Storage Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | *(none)* | Redis connection URL for session storage (e.g. `redis://localhost:6379`). When set, symptom checker sessions are persisted to Redis with automatic TTL expiry. Falls back to in-memory when unavailable. |
| `TIBABOT_CONVERSATIONS_DB` | `data/conversations.db` | Path to SQLite database for chat conversation history. All `/chat` turns are durably persisted here for analytics and continuity. |

---

## Cross-Feature Integration

Several clinical features work together when available:

| Integration | How It Works |
|-------------|-------------|
| **Care Plan + CDS Rules** | Care plan generation automatically validates medications against CDS rules for DDI, contraindications, and formulary compliance |
| **Care Plan + KEML** | Medication interventions checked against KEML facility-level restrictions; `facility_level_notes` flag unavailable drugs |
| **Lab Assist → Discharge** | Lab results from Lab Assist inform discharge criteria evaluation |
| **CDS Rules → Lab Assist** | Critical lab value rules mirror Lab Assist critical alerts |
| **Clerking → ICD-10** | Structured notes include auto-coded diagnoses via the ICD-10 service |
| **Clinical Document → Guidelines** | Document generation retrieves Kenya clinical guidelines via RAG for context-aware content |
| **Clinical Document → ICD-10** | Generated documents include auto-coded ICD-10 suggestions |
| **Feedback → All Services** | Unified feedback endpoint accepts `service_type` to tag ratings per service |

---

## OpenAPI Documentation

When `TIBABOT_ENABLE_DOCS=true`:

| Endpoint | Description |
|----------|-------------|
| `/docs` | Swagger UI (interactive) |
| `/redoc` | ReDoc (readable) |
| `/openapi.json` | OpenAPI 3.0 spec |

**Enable for development:**
```bash
export TIBABOT_ENABLE_DOCS=true
uvicorn src.api.main:app --reload
```

---

## SDK Examples

### Python

```python
import requests

class TibaBotClient:
    """Unified client for core + clinical feature endpoints."""

    def __init__(self, api_key: str, base_url: str = "https://tibabot.vitora.nexora.africa"):
        self.base_url = base_url
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }

    def _post(self, path: str, payload: dict, timeout: int = 15) -> dict:
        resp = requests.post(f"{self.base_url}{path}", headers=self.headers,
                             json=payload, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    def _get(self, path: str, params: dict = None, timeout: int = 10) -> dict:
        resp = requests.get(f"{self.base_url}{path}", headers=self.headers,
                            params=params, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    # --- Core ---

    def chat(self, message: str, mode: str = "auto") -> dict:
        return self._post("/chat", {"message": message, "mode": mode}, timeout=30)

    def triage(self, symptoms: str, age: int = None, sex: str = None) -> dict:
        payload = {"symptoms": symptoms}
        if age: payload["age"] = age
        if sex: payload["sex"] = sex
        return self._post("/triage", payload, timeout=30)

    def clinical_assist(self, query: str, context: dict = None) -> dict:
        return self._post("/clinical/assist", {"query": query, "context": context or {}}, timeout=30)

    # --- ICD-10 ---

    def search_icd10(self, query: str, limit: int = 10) -> dict:
        return self._get("/icd10/search", {"q": query, "limit": limit})

    def code_icd10(self, clinical_text: str) -> dict:
        return self._post("/icd10/code", {"clinical_text": clinical_text})

    # --- ML Predictors ---

    def predict_condition(self, features: dict) -> dict:
        return self._post("/predict/condition", features)

    def predict_icu(self, features: dict) -> dict:
        return self._post("/predict/icu/predict", features)

    # --- CDS Rules ---

    def evaluate_cds(self, medications: list, diagnoses: list = None,
                     lab_results: dict = None, **kwargs) -> dict:
        payload = {"medications": medications}
        if diagnoses: payload["diagnoses"] = diagnoses
        if lab_results: payload["lab_results"] = lab_results
        payload.update(kwargs)
        return self._post("/cds/evaluate", payload)

    # --- Lab Assist ---

    def interpret_labs(self, patient_age: int, patient_sex: str,
                       lab_results: list, **kwargs) -> dict:
        return self._post("/lab/interpret", {
            "patient_age": patient_age, "patient_sex": patient_sex,
            "lab_results": lab_results, **kwargs
        })

    # --- Discharge Readiness ---

    def assess_discharge(self, patient_age: int, primary_diagnosis: str,
                         days_admitted: int, **kwargs) -> dict:
        return self._post("/discharge/assess", {
            "patient_age": patient_age, "primary_diagnosis": primary_diagnosis,
            "days_admitted": days_admitted, **kwargs
        })

    # --- Care Plan ---

    def generate_care_plan(self, primary_diagnosis: str, patient_age: int,
                           patient_sex: str, **kwargs) -> dict:
        return self._post("/care-plan/generate", {
            "primary_diagnosis": primary_diagnosis, "patient_age": patient_age,
            "patient_sex": patient_sex, **kwargs
        })

    def generate_care_plan_fhir(self, primary_diagnosis: str, patient_age: int,
                                patient_sex: str, **kwargs) -> dict:
        return self._post("/care-plan/generate/fhir", {
            "primary_diagnosis": primary_diagnosis, "patient_age": patient_age,
            "patient_sex": patient_sex, **kwargs
        })

    # --- Clerking ---

    def autocomplete(self, text: str, section: str, **kwargs) -> dict:
        return self._post("/clerking/autocomplete", {
            "current_text": text, "cursor_section": section, **kwargs
        })

    def structure_note(self, free_text: str, patient_age: int,
                       patient_sex: str, **kwargs) -> dict:
        return self._post("/clerking/structure", {
            "free_text": free_text, "patient_age": patient_age,
            "patient_sex": patient_sex, **kwargs
        })

    # --- Practitioner ---

    def validate_practitioner(self, id_type: str, id_number: str) -> dict:
        return self._post("/practitioner/validate", {
            "identification_type": id_type, "identification_number": id_number
        })


# Usage
client = TibaBotClient(api_key="your-api-key")

# Patient chat
result = client.chat("What causes malaria?")
print(result["response"])

# Clinical assist
rec = client.clinical_assist("Treatment for uncomplicated malaria", {"patient_age": 30})
print(rec["recommendation"])

# ICD-10 auto-coding
codes = client.code_icd10("Patient with fever and positive malaria RDT")
print(codes["codes"])

# CDS rule check
alerts = client.evaluate_cds(
    medications=["warfarin", "aspirin"],
    lab_results={"inr": 4.5},
    patient_age=65, patient_sex="male"
)
print(f"{alerts['rules_fired']} rules fired, {len(alerts['alerts'])} alerts")

# Lab interpretation
labs = client.interpret_labs(
    patient_age=55, patient_sex="male",
    lab_results=[
        {"test_name": "glucose", "value": 450, "unit": "mg/dL"},
        {"test_name": "bicarbonate", "value": 12, "unit": "mEq/L"},
    ]
)
for alert in labs["critical_alerts"]:
    print(f"⚠ {alert}")

# Discharge readiness
discharge = client.assess_discharge(
    patient_age=45, primary_diagnosis="pneumonia", days_admitted=5,
    can_ambulate=True, can_tolerate_oral=True
)
print(f"Readiness: {discharge['readiness_level']} ({discharge['readiness_score']:.0%})")

# Care plan
plan = client.generate_care_plan(
    primary_diagnosis="Community-acquired pneumonia",
    patient_age=58, patient_sex="male",
    facility_level="H3", allergies=["penicillin"]
)
print(f"Goals: {len(plan['goals'])}, Template: {plan['template_used']}")

# FHIR care plan
fhir = client.generate_care_plan_fhir(
    primary_diagnosis="Community-acquired pneumonia",
    patient_age=58, patient_sex="male",
    icd10_code="J18.9", facility_level="H3"
)
print(f"FHIR resource: {fhir['resourceType']}, Activities: {len(fhir['activity'])}")

# Clerking autocomplete
completions = client.autocomplete(text="hea", section="presenting_complaint")
for s in completions["suggestions"]:
    print(f"  {s['text']} ({s['category']}, {s['confidence']:.0%})")

# Structure free-text notes
result = client.structure_note(
    free_text="45M with 3 days cough and fever. PMH: DM2. Assessment: CAP.",
    patient_age=45, patient_sex="male"
)
print(f"Completeness: {result['completeness_score']:.0%}")
```

### JavaScript/TypeScript

```typescript
class TibaBotClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://tibabot.vitora.nexora.africa') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(method: string, path: string, body?: any, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${error.detail || 'Unknown error'}`);
    }
    return response.json();
  }

  // Core
  async chat(message: string, mode: 'chat' | 'symptom-check' | 'auto' = 'auto') {
    return this.request('POST', '/chat', { message, mode });
  }

  async triage(symptoms: string, age?: number, sex?: string) {
    return this.request('POST', '/triage', { symptoms, age, sex });
  }

  async clinicalAssist(query: string, context?: Record<string, any>) {
    return this.request('POST', '/clinical/assist', { query, context });
  }

  // ICD-10
  async searchICD10(query: string, limit = 10) {
    return this.request('GET', '/icd10/search', undefined, { q: query, limit: String(limit) });
  }

  async codeICD10(clinicalText: string) {
    return this.request('POST', '/icd10/code', { clinical_text: clinicalText });
  }

  // ML Predictors
  async predictCondition(features: Record<string, any>) {
    return this.request('POST', '/predict/condition', features);
  }

  async predictICU(features: Record<string, any>) {
    return this.request('POST', '/predict/icu/predict', features);
  }

  // CDS Rules
  async evaluateCDS(data: {
    medications?: string[]; diagnoses?: string[];
    lab_results?: Record<string, number>; patient_age?: number;
    patient_sex?: 'male' | 'female'; facility_level?: string;
  }) {
    return this.request('POST', '/cds/evaluate', data);
  }

  // Lab Assist
  async interpretLabs(data: {
    patient_age: number; patient_sex: 'male' | 'female';
    lab_results: Array<{ test_name: string; value: number; unit: string }>;
    diagnoses?: string[];
  }) {
    return this.request('POST', '/lab/interpret', data);
  }

  // Discharge Readiness
  async assessDischarge(data: {
    patient_age: number; primary_diagnosis: string; days_admitted: number;
    can_ambulate?: boolean; can_tolerate_oral?: boolean; has_nhif_or_sha?: boolean;
  }) {
    return this.request('POST', '/discharge/assess', data);
  }

  // Care Plan
  async generateCarePlan(data: {
    primary_diagnosis: string; patient_age: number; patient_sex: 'male' | 'female';
    facility_level?: string; comorbidities?: string[]; allergies?: string[];
  }) {
    return this.request('POST', '/care-plan/generate', data);
  }

  async generateCarePlanFhir(data: {
    primary_diagnosis: string; patient_age: number; patient_sex: 'male' | 'female';
    icd10_code?: string; facility_level?: string;
  }) {
    return this.request('POST', '/care-plan/generate/fhir', data);
  }

  // Clerking
  async autocomplete(text: string, section: string) {
    return this.request('POST', '/clerking/autocomplete', { current_text: text, cursor_section: section });
  }

  async structureNote(data: {
    free_text: string; patient_age: number; patient_sex: 'male' | 'female';
    output_format?: 'clerking' | 'soap' | 'discharge_summary';
  }) {
    return this.request('POST', '/clerking/structure', data);
  }

  // Practitioner
  async validatePractitioner(idType: string, idNumber: string) {
    return this.request('POST', '/practitioner/validate', {
      identification_type: idType, identification_number: idNumber,
    });
  }
}

// Usage
const client = new TibaBotClient('your-api-key');

const result = await client.chat('What are symptoms of typhoid?');
console.log(result.response);

const codes = await client.codeICD10('Fever with positive malaria RDT');
console.log(codes.codes);

const alerts = await client.evaluateCDS({
  medications: ['warfarin', 'aspirin'],
  lab_results: { inr: 4.5 },
  patient_age: 65, patient_sex: 'male',
});
console.log(`${alerts.rules_fired} rules fired`);
```

### cURL

```bash
# Chat
curl -X POST https://tibabot.vitora.nexora.africa/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"message": "How to treat mild malaria?", "mode": "auto"}'

# Single-turn triage
curl -X POST https://tibabot.vitora.nexora.africa/triage \
  -H "Content-Type: application/json" \
  -d '{"symptoms": "headache and fever for 3 days", "age": 30, "sex": "F"}'

# ICD-10 search
curl "https://tibabot.vitora.nexora.africa/icd10/search?q=malaria&limit=5" \
  -H "X-API-Key: your-api-key"

# ICD-10 auto-code
curl -X POST https://tibabot.vitora.nexora.africa/icd10/code \
  -H "Content-Type: application/json" \
  -d '{"clinical_text": "Patient with fever and chills, positive RDT"}'

# Practitioner validation
curl -X POST https://tibabot.vitora.nexora.africa/practitioner/validate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"identification_type": "ID", "identification_number": "12345678"}'

# ICU prediction
curl -X POST https://tibabot.vitora.nexora.africa/predict/icu/predict \
  -H "Content-Type: application/json" \
  -d '{"heart_rate": 110, "systolic_bp": 85, "diastolic_bp": 55, "respiratory_rate": 28, "spo2": 90, "temperature": 39.2, "gcs": 13, "creatinine": 2.5, "lactate": 4.0}'

# CDS rule evaluation
curl -X POST https://tibabot.vitora.nexora.africa/cds/evaluate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"medications": ["warfarin", "aspirin"], "lab_results": {"inr": 4.5}, "patient_age": 65, "patient_sex": "male"}'

# Lab interpretation
curl -X POST https://tibabot.vitora.nexora.africa/lab/interpret \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"patient_age": 55, "patient_sex": "male", "lab_results": [{"test_name": "glucose", "value": 450, "unit": "mg/dL"}, {"test_name": "bicarbonate", "value": 12, "unit": "mEq/L"}]}'

# Discharge readiness
curl -X POST https://tibabot.vitora.nexora.africa/discharge/assess \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"patient_age": 45, "primary_diagnosis": "pneumonia", "days_admitted": 5, "can_ambulate": true, "can_tolerate_oral": true}'

# Care plan generation
curl -X POST https://tibabot.vitora.nexora.africa/care-plan/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"primary_diagnosis": "Community-acquired pneumonia", "patient_age": 58, "patient_sex": "male", "facility_level": "H3", "allergies": ["penicillin"]}'

# FHIR care plan
curl -X POST https://tibabot.vitora.nexora.africa/care-plan/generate/fhir \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"primary_diagnosis": "Community-acquired pneumonia", "icd10_code": "J18.9", "patient_age": 58, "patient_sex": "male", "facility_level": "H3"}'

# Clerking autocomplete
curl -X POST https://tibabot.vitora.nexora.africa/clerking/autocomplete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"current_text": "hea", "cursor_section": "presenting_complaint"}'

# Structure free-text note
curl -X POST https://tibabot.vitora.nexora.africa/clerking/structure \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"free_text": "45M with cough and fever for 3 days. PMH: DM2. Assessment: CAP.", "patient_age": 45, "patient_sex": "male"}'

# Investigation suggestions
curl -X POST https://tibabot.vitora.nexora.africa/clinical/investigations/suggest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"diagnoses": ["malaria"], "symptoms": ["fever", "chills"], "facility_level": "H3", "region": "lake_endemic", "include_fhir": true}'

# Investigation suggestions with existing orders excluded
curl -X POST https://tibabot.vitora.nexora.africa/clinical/investigations/suggest \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"diagnoses": ["pneumonia"], "existing_orders": ["Chest X-ray", "FBC"], "facility_level": "H3", "include_fhir": false}'

# Health checks
curl https://tibabot.vitora.nexora.africa/health
curl https://tibabot.vitora.nexora.africa/cds/health
curl https://tibabot.vitora.nexora.africa/lab/health
curl https://tibabot.vitora.nexora.africa/discharge/health
curl https://tibabot.vitora.nexora.africa/care-plan/health
curl https://tibabot.vitora.nexora.africa/clerking/health
```

---

## Support

- **Issues:** https://github.com/nexora-africa-ltd/tibabot/issues
- **Docs:** https://tibabot.vitora.nexora.africa/docs (when enabled)
- **Email:** support@nexora.africa

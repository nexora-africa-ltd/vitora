# TibaBot Integrator Guide

## Overview

TibaBot provides RESTful APIs for clinical decision support, symptom triage,
patient engagement, and Kenya EMR interoperability. This guide is for
third-party developers integrating TibaBot into HMIS systems, hospital
portals, community health worker apps, and patient-facing mobile apps.

**Production:** `https://tibabot.vitora.nexora.africa`
**Staging:** Contact the team for staging credentials.

---

## 1. Getting Access

Contact the TibaBot team to provision a facility API key (`tbf_` prefix) or
practitioner API key (`tbp_` prefix). Include:

- Your facility/organisation name
- Expected monthly request volume
- Integration type (HMIS, mobile app, web portal, etc.)

---

## 2. Authentication

All requests must include your API key in the `X-API-Key` header:

```bash
curl -X POST https://tibabot.vitora.nexora.africa/chat \
  -H "X-API-Key: tbf_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the first-line treatment for malaria?"}'
```

Unauthenticated requests are rate-limited to 10 req/min. Authenticated requests
get 60 req/min (standard) or higher on request.

---

## 3. Common Workflows

### 3.1 Symptom Triage (patient-facing)

No API key required. Best for patient-facing apps and chat widgets.

```bash
curl -X POST https://tibabot.vitora.nexora.africa/triage \
  -H "Content-Type: application/json" \
  -d '{
    "symptoms": "fever and headache for 3 days",
    "age": 30,
    "sex": "F",
    "include_differentials": true
  }'
```

Returns triage level (`emergency`, `urgent`, `semi_urgent`, `routine`, `self_care`),
extracted symptoms, red flag warnings, and differential diagnoses.

### 3.2 Guided Symptom Checker (multi-turn)

For conversational symptom collection with state-machine-driven flow:

```bash
# Start a session
curl -X POST https://tibabot.vitora.nexora.africa/symptom-checker/conversation/start \
  -H "Content-Type: application/json" \
  -d '{"language": "en", "initial_symptoms": "I have a headache"}'

# Continue the conversation (use session_id from start response)
curl -X POST https://tibabot.vitora.nexora.africa/symptom-checker/conversation/message \
  -H "Content-Type: application/json" \
  -d '{"session_id": "sc_abc123", "message": "For 3 days now"}'
```

### 3.3 Clinical Decision Support (provider-facing)

Requires API key. For HMIS-integrated provider dashboards.

```bash
curl -X POST https://tibabot.vitora.nexora.africa/clinical/assist \
  -H "X-API-Key: tbf_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Treatment for uncomplicated malaria in pregnant woman",
    "patient_context": {"age": 28, "sex": "F", "pregnant": true},
    "verbosity": "standard"
  }'
```

### 3.4 Medical Chat (provider-facing)

Multi-turn clinical chat with conversation history:

```bash
curl -X POST https://tibabot.vitora.nexora.africa/clinical/chat \
  -H "X-API-Key: tbf_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What antibiotics are appropriate for this patient?",
    "patient_context": {"age": 45, "sex": "M", "diagnosis": "CAP"}
  }'
```

Returns a `session_id` — include it in follow-up messages to continue the
conversation. Set `"stream": true` for SSE streaming.

### 3.5 Drug Lookup

Search the Kenya drug formulary (SmPC, PPB, KEML):

```bash
curl "https://tibabot.vitora.nexora.africa/drugs/search?q=amoxicillin&limit=10"
```

### 3.6 ICD-10 Auto-Coding

Auto-code clinical text to ICD-10:

```bash
curl -X POST https://tibabot.vitora.nexora.africa/icd10/code \
  -H "Content-Type: application/json" \
  -d '{"text": "Type 2 diabetes with diabetic nephropathy"}'
```

---

## 4. TibaBot SDKs

TibaBot provides official SDKs in Python, JavaScript/TypeScript, and Dart/Flutter.
The SDKs wrap the REST API with typed request/response models, automatic
authentication, configurable timeouts, and structured exceptions. For the
complete SDK reference, sample applications, and embedded widget examples, see
`docs/sdk_implementation_guide.md`.

### 4.1 Available SDKs

| SDK | Location | Install target |
|-----|----------|----------------|
| Python | `sdk/python/tibabot/` | `pip install tibabot-client` |
| JavaScript/TypeScript | `sdk/javascript/` | `npm install tibabot-client` |
| Dart/Flutter | `sdk/flutter/` | Git dependency (`sdk/flutter`) |

### 4.2 Installation

**Python**

```bash
pip install tibabot-client
```

**JavaScript/TypeScript**

```bash
npm install tibabot-client
```


**Dart/Flutter**

```yaml
# pubspec.yaml
dependencies:
  tibabot_client:
    git:
      url: https://github.com/nexora-africa-ltd/tibabot.git
      path: sdk/flutter
```

### 4.3 Authentication

All SDKs accept either a facility/practitioner API key or a short-lived bearer
token (used for SMART-on-FHIR / user-scoped flows).

```python
from tibabot import TibaBotClient
client = TibaBotClient(
    base_url="https://tibabot.vitora.nexora.africa",
    api_key="tbf_your_key_here",
)
```

```typescript
import { TibaBotClient } from "tibabot-client";
const client = new TibaBotClient({
  baseUrl: "https://tibabot.vitora.nexora.africa",
  apiKey: "tbf_your_key_here",
});
```

```dart
import 'package:tibabot_client/tibabot_client.dart';
final client = TibaBotClient(apiKey: 'tbf_your_key_here');
```

### 4.4 Common SDK Workflows

#### Symptom triage

```python
from tibabot import TriageRequest
triage = client.triage(TriageRequest(symptoms=["fever", "headache"]))
print(triage.triage_level)
```

```typescript
const triage = await client.triage({ symptoms: ["fever", "headache"] });
console.log(triage.triage_level);
```

```dart
final triage = await client.triage(TriageRequest(symptoms: ['fever', 'headache']));
print(triage.triageLevel);
```

#### Clinical decision support

```python
from tibabot import ClinicalAssistRequest
assist = client.clinical_assist(
    ClinicalAssistRequest(
        query="Treatment for uncomplicated malaria in pregnancy",
        context={"age": 28, "sex": "F", "pregnant": True},
    )
)
print(assist.recommendation)
```

#### Patient platform

```python
from tibabot import CreatePatientRequest, VitalsRequest
patient = client.create_patient(
    CreatePatientRequest(demographics={"age": 30, "sex": "F"})
)
vitals = client.record_vitals(
    patient.patient_id,
    VitalsRequest(vital_type="blood_pressure", value="120/80"),
)
print(vitals.timestamp)
```

### 4.5 Error handling

SDKs raise typed exceptions that map to the HTTP status codes described in
Section 6. Catch them by type:

```python
from tibabot import TibaBotError, RateLimitError, ValidationError
try:
    client.triage(TriageRequest(symptoms=[]))
except ValidationError as e:
    print("Validation:", e.details)
except RateLimitError as e:
    print(f"Retry after {e.retry_after}s")
except TibaBotError as e:
    print(f"API error: {e}")
```

```typescript
import { ValidationError, RateLimitError, TibaBotError } from "tibabot-client";
try {
  await client.triage({ symptoms: [] });
} catch (e) {
  if (e instanceof ValidationError) console.log("Validation:", e.details);
  else if (e instanceof RateLimitError) console.log(`Retry after ${e.retryAfter}s`);
  else if (e instanceof TibaBotError) console.log("API error:", e.message);
}
```

```dart
try {
  await client.triage(TriageRequest(symptoms: []));
} on TibaBotValidationError catch (e) {
  print('Validation: ${e.details}');
} on TibaBotRateLimitError {
  print('Rate limited');
} on TibaBotError catch (e) {
  print('Error: ${e.message}');
}
```

### 4.6 Rate limiting and retries

The SDKs do not retry automatically on `429 Too Many Requests`. Read the
`Retry-After` value from the rate-limit exception (Python/JS) or implement an
exponential backoff. See Section 7 for the authenticated and unauthenticated
rate-limit tiers.

### 4.7 Embedded UI widgets

For no-code integration, drop a vanilla-JS web component into any page:

```html
<script src="https://cdn.tibabot.health/widgets/tibabot-chat.js"></script>
<tibabot-chat
  api-key="tbf_your_key_here"
  base-url="https://tibabot.vitora.nexora.africa"
  title="Clinical Assistant"
></tibabot-chat>
```

A triage widget is also available at
`https://cdn.tibabot.health/widgets/tibabot-triage.js`. See
`docs/sdk_implementation_guide.md` for full attribute lists, React/Vue/Angular
integration, and framework-specific mobile examples.

---

## 5. Webhooks

TibaBot can push events to your endpoint for real-time integration.

### Register a webhook

```bash
curl -X POST https://tibabot.vitora.nexora.africa/webhooks \
  -H "X-API-Key: tbf_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-system.com/hooks/tibabot",
    "events": ["clinical_assist_completed", "document_generated"],
    "secret": "whsec_your_secret"
  }'
```

### Available events

| Event | When it fires |
|-------|---------------|
| `clinical_assist_completed` | Clinical decision support query answered |
| `clinical_chat_completed` | Clinical chat turn completed |
| `document_generated` | Clinical document generated |
| `patient_created` | New patient registered on platform |
| `screening_completed` | Screening logged |
| `alert_triggered` | Patient alert triggered |

### Verification

TibaBot signs each webhook payload using HMAC-SHA256 with your shared secret.
The signature is in the `X-TibaBot-Signature-256` header. Verify before
processing:

```python
import hmac, hashlib

expected = hmac.new(
    b"whsec_your_secret",
    response_body.encode("utf-8"),
    hashlib.sha256,
).hexdigest()

assert hmac.compare_digest(expected, received_signature)
```

---

## 6. Error Handling

All errors return JSON:

```json
{
  "error": "auth_required",
  "message": "Valid API key required in X-API-Key header",
  "details": {}
}
```

| Status | Code | Retryable? | What to do |
|--------|------|------------|------------|
| 400 | `invalid_request` | No | Fix request body |
| 401 | `auth_required` | No | Check API key |
| 403 | `forbidden` | No | Contact team for scope upgrade |
| 404 | `not_found` | No | Check endpoint URL |
| 409 | `conflict` | No | Resource exists — use different identifier |
| 422 | `validation_error` | No | Fix schema (check `details.detail`) |
| 429 | `rate_limited` | Yes | Back off, respect `Retry-After` header |
| 500 | `internal_error` | Yes | Retry after 5s; escalate if persistent |
| 503 | `service_unavailable` | Yes | Model not loaded — retry after 30s |

---

## 7. Rate Limiting

| Tier | Limit |
|------|-------|
| Unauthenticated | 10 req/min per IP |
| Standard (API key) | 60 req/min |
| Elevated | 120+ req/min (contact team) |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

On 429, wait the number of seconds specified in `Retry-After` before retrying.

---

## 8. Pagination

List endpoints support pagination via `?page=` and `?limit=`:

```bash
curl "https://tibabot.vitora.nexora.africa/conversations?page=1&limit=20"
```

Responses include `total`, `page`, `limit`, and `pages` in the response body.

---

## 9. Idempotency

For critical POST endpoints (e.g., creating patients, logging encounters), you
can provide an `Idempotency-Key` header. If a request fails (network error,
500), retry with the same key — the server deduplicates within a 24-hour
window.

---

## 10. Versioning

TibaBot does not use URL path versioning. Breaking changes are announced with
a **minimum 90-day deprecation notice** via the `Sunset` response header on
affected endpoints. Pin your integration to a specific build by checking the
`X-TibaBot-Version` response header.

---

## 11. Support

- **Issues:** Report bugs via the support channel provided during onboarding
- **Changes:** Subscribe to the changelog (URL provided during onboarding)
- **Status:** Service status page (URL provided during onboarding)

---

## 12. Changelog

| Date | Change |
|------|--------|
| 2026-07-09 | Initial integrator guide published |

---

## Appendix: Endpoint Quick Reference

### Core

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /chat` | Key | Open-ended medical Q&A |
| `POST /chat/stream` | Key | SSE streaming chat |
| `POST /feedback` | Key | Submit response feedback |
| `GET /conversations` | Key | List conversation IDs |
| `GET /conversation/{id}` | Key | Get conversation history |

### Symptom Triage

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /triage` | None | Single-turn symptom triage |
| `POST /symptom-checker/conversation/start` | None | Start guided triage session |
| `POST /symptom-checker/conversation/message` | None | Continue triage session |
| `GET /symptom-checker/conversation/{session_id}` | None | Get session state |
| `DELETE /symptom-checker/conversation/{session_id}` | None | End session |
| `GET /symptom-checker/conversation/health` | None | Triage service health |
| `POST /symptom-checker/conversation/feedback` | None | Rate triage response |

### Clinical

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /clinical/assist` | Key | Clinical decision support |
| `POST /clinical/chat` | Key | Multi-turn clinical chat |
| `POST /clinical/document` | Key | Generate clinical documents |
| `POST /clinical/document/async` | Key | Queued document generation |
| `POST /clinical/investigations/suggest` | Key | Investigation suggestions |
| `GET /clinical/health` | Key | Clinical service health |
| `GET /clinical/profile` | Key | Get provider profile |
| `PUT /clinical/profile` | Key | Update provider profile |
| `GET /clinical/chat/session/{session_id}` | Key | Get chat session info |
| `GET /clinical/chat/session/{session_id}/history` | Key | Get chat history |
| `DELETE /clinical/chat/session/{session_id}` | Key | Delete chat session |
| `GET /clinical/chat/stats` | Key | Chat session statistics |

### Patient Platform

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /patient` | Key | Create pseudonymous patient |
| `GET /patient/{id}` | Key | Get patient profile |
| `GET /patient/{id}/summary` | Key | Clinical summary |
| `PUT /patient/{id}` | Key | Update patient |
| `DELETE /patient/{id}` | Key | Deactivate patient |
| `POST /patient/{id}/journal` | Key | Log symptom journal entry |
| `GET /patient/{id}/journal` | Key | List journal entries |
| `POST /patient/{id}/vitals` | Key | Log vitals |
| `GET /patient/{id}/vitals` | Key | List vitals |
| `POST /patient/{id}/events` | Key | Log health event |
| `GET /patient/{id}/timeline` | Key | Health event timeline |
| `POST /patient/{id}/goals` | Key | Create goal |
| `PUT /patient/{id}/goals/{goal_id}` | Key | Update goal |
| `POST /patient/{id}/reminders` | Key | Create reminder |
| `POST /patient/{id}/adherence` | Key | Log adherence |
| `POST /patient/{id}/vaccinations` | Key | Log vaccination |
| `POST /patient/{id}/screenings` | Key | Log screening |
| `POST /patient/{id}/periods` | Key | Log menstrual period |
| `POST /patient/{id}/aefi` | Key | Report AEFI |
| `POST /patient/{id}/caregivers` | Key | Register caregiver |
| `GET /patient/{id}/alerts` | Key | List patient alerts |
| `GET /patient/{id}/wearables` | Key | List wearable connections |
| `POST /patient/{id}/wearables/connect` | Key | Initiate wearable OAuth |
| `POST /patient/{id}/wearables/sync` | Key | Trigger wearable sync |
| `POST /patient/{id}/immunizations/contraindications` | Key | Check contraindications |

### Community Health

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /community/stats` | Key | Aggregate community stats |
| `GET /community/trends` | Key | Symptom trends |
| `GET /community/alerts` | Key | Outbreak/spike alerts |
| `GET /community/screening/coverage` | Key | Screening coverage metrics |
| `GET /community/immunization/coverage` | Key | Immunization coverage |

### Medical ML

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /predict/condition` | Key | Predict medical conditions |
| `POST /predict/batch` | Key | Batch prediction |
| `POST /predict/icu/predict` | Key | ICU condition prediction |
| `POST /predict/icu/sofa` | Key | Calculate SOFA score |
| `POST /predict/icu/qsofa` | Key | Calculate qSOFA score |
| `POST /predict/icu/risk-stratify` | Key | ICU risk stratification |

### Lab & Diagnostics

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /lab/interpret` | Key | Interpret lab results |
| `POST /clinical/egfr/calculate` | Key | Calculate eGFR / CKD stage |
| `POST /clinical/ecg/interpret` | Key | Interpret ECG features |
| `POST /clinical/ecg/upload` | Key | Upload ECG PDF/image |
| `POST /clinical/ecg/compare` | Key | Compare two ECGs |
| `POST /clinical/ecg/report` | Key | Generate ECG report |
| `POST /clinical/ecg/review` | Key | Submit clinician review |
| `POST /clinical/ecg/cha2ds2-vasc` | Key | CHA₂DS₂-VASc score |
| `POST /clinical/ecg/has-bled` | Key | HAS-BLED score |

### Care & Discharge

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /care-plan/generate` | Key | Generate care plan |
| `POST /care-plan/fhir` | Key | Care plan as FHIR R4 |
| `POST /discharge/assess` | Key | Discharge readiness assessment |
| `GET /discharge/conditions` | Key | Conditions with discharge criteria |

### Clerking & Notes

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /clerking/templates/{format}` | Key | Get note template |
| `POST /clerking/autocomplete` | Key | Clinical note autocomplete |
| `POST /clerking/generate` | Key | Generate clinical note |

### Surgical

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /surgical/pre-op` | Key | Pre-operative risk assessment |
| `POST /surgical/post-op` | Key | Post-operative care plan |
| `POST /surgical/checklist/start` | Key | Start WHO checklist |
| `POST /surgical/checklist/advance` | Key | Advance checklist phase |
| `GET /surgical/checklist/{session_id}` | Key | Checklist status |
| `GET /surgical/procedures` | Key | List procedure templates |

### Formulary & Coding

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /drugs/search` | None | Drug formulary search |
| `GET /drugs/smpc/{id}` | None | SmPC document detail |
| `POST /icd10/code` | None | ICD-10 auto-coding |
| `POST /icd10/batch` | None | Batch ICD-10 coding |
| `GET /icd10/search` | None | ICD-10 code search |
| `GET /icd10/suggest` | None | ICD-10 typeahead |
| `POST /icd10/validate` | None | Code combination validation |
| `GET /icd10/lookup/{code}` | None | Code detail lookup |
| `POST /cds/evaluate` | Key | Evaluate CDS rules |

### CDS Hooks (EHR integration)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /cds-hooks-services` | Key | CDS Hooks discovery |
| `POST /cds-hooks-services/{service_id}` | Key | Invoke CDS Hooks service |

### SMART on FHIR (EHR integration)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /.well-known/smart-configuration` | None | SMART discovery document |
| `GET /smart/authorize` | None | OAuth2 authorization |
| `POST /smart/token` | Key | Token exchange |
| `POST /smart/ehr/register` | Key | Register EHR connection |
| `GET /smart/ehr/configs` | Key | List EHR configurations |
| `POST /smart/context` | Key | Fetch enriched EHR context |
| `POST /smart/bridge/chat` | Key | EHR-enriched clinical chat |
| `POST /smart/bridge/clinical/assist` | Key | EHR-enriched CDS assist |
| `POST /smart/bridge/clinical/document` | Key | EHR-enriched document gen |
| `POST /smart/bridge/care-plan/generate` | Key | EHR-enriched care plan |

### Webhooks

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /webhooks` | Key | Register webhook |
| `GET /webhooks` | Key | List webhooks |
| `GET /webhooks/{id}` | Key | Get webhook details |
| `PUT /webhooks/{id}` | Key | Update webhook |
| `DELETE /webhooks/{id}` | Key | Delete webhook |
| `POST /webhooks/{id}/pause` | Key | Pause delivery |
| `POST /webhooks/{id}/activate` | Key | Resume delivery |
| `GET /webhooks/{id}/deliveries` | Key | Delivery history |

### WhatsApp

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /webhooks/whatsapp` | None | Webhook verification |
| `POST /webhooks/whatsapp` | None | Incoming message |
| `POST /webhooks/whatsapp/status` | None | Delivery status callback |

### HL7v2 (EMR interoperability)

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /hl7v2/message` | Key | Receive/ack HL7v2 message |
| `POST /hl7v2/generate` | Key | Build HL7v2 from structured data |
| `POST /hl7v2/send` | Key | Generate and send HL7v2 message |

### Bulk FHIR

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /fhir/$export` | Key | System-level bulk export |
| `GET /fhir/Patient/$export` | Key | Patient-level bulk export |
| `GET /fhir/$export/status/{job_id}` | Key | Poll export status |

### FHIRcast

| Endpoint | Auth | Description |
|----------|------|-------------|
| `WS /fhircast/ws/{session_id}` | None | Real-time clinical sync |

### Language

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /i18n/languages` | None | Supported languages |
| `GET /i18n/detect` | None | Detect language from header |
| `POST /i18n/translate` | None | Translate keys |

### Facility

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /facility/knowledge-base` | Key | KB info and document list |
| `POST /facility/knowledge-base/upload` | Key | Upload KB document |
| `DELETE /facility/knowledge-base/documents/{id}` | Key | Delete KB document |
| `GET /facility/knowledge-base/search` | Key | Search facility KB |

### Health

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /health` | None | Full service health status |
| `GET /stats` | None | API usage statistics |
| `GET /rate-limit` | None | Current rate limit status |
| `POST /auth/validate` | None | Validate API key |

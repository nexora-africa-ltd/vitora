# TibaBot HMIS Integration Checklist

A step-by-step checklist for Health Management Information Systems (HMIS) looking to integrate TibaBot's AI-powered healthcare assistant capabilities.

---

## 📋 Quick Overview

| Item | Details |
|------|---------|
| **Production URL** | `https://tibabot.hmis.nexora.africa` |
| **Authentication** | API Key (header or query param) |
| **Rate Limits** | 30 req/min (anon) / 60 req/min (authenticated) |
| **Response Format** | JSON |
| **Languages** | English, Swahili (with Sheng support) |

---

## Phase 1: Pre-Integration Planning

### 1.1 Technical Assessment
- [ ] Review your HMIS architecture for REST API integration capability
- [ ] Identify target integration points (patient portal, EHR, clinical decision support)
- [ ] Assess network connectivity to TibaBot production URL
- [ ] Determine expected request volume (for rate limit planning)
- [ ] Review data privacy requirements (TibaBot doesn't store patient data)

### 1.2 Use Case Identification
Select which TibaBot capabilities you need:

| Capability | Endpoint | Description |
|------------|----------|-------------|
| [ ] **Patient Chat** | `POST /chat` | General health Q&A for patients (auto-routes chat/symptom modes) |
| [ ] **Symptom Triage** | `POST /triage` | Single-turn symptom assessment with triage |
| [ ] **Symptom Checker** | `POST /symptom-checker/conversation/*` | Guided multi-turn symptom assessment |
| [ ] **Clinical Assistant** | `POST /clinical/assist` | Provider-facing clinical decision support |
| [ ] **Clinical Chat** | `POST /clinical/chat` | Multi-turn clinical conversation (SSE streaming) |
| [ ] **ICD-10 Auto-Coding** | `POST /icd10/code` | Automatic diagnosis code suggestions |
| [ ] **ICD-10 Search** | `GET /icd10/search` | Search ICD-10 code database |
| [ ] **ICD-10 Validation** | `POST /icd10/validate` | Validate code combinations (conflict detection) |
| [ ] **Condition Predictor** | `POST /predict/condition` | ML-based chronic condition prediction |
| [ ] **ICU Predictor** | `POST /predict/icu/predict` | Critical care condition prediction (sepsis, AKI, etc.) |
| [ ] **Practitioner Validation** | `POST /practitioner/validate` | Validate practitioners against SHA HWR |

### 1.3 Stakeholder Sign-Off
- [ ] Clinical team approval for medical AI integration
- [ ] IT/Security team approval for external API integration
- [ ] Data protection officer review (if applicable)
- [ ] Legal review of terms of service

---

## Phase 2: Technical Setup

### 2.1 API Credentials
- [ ] Request API key(s) from Nexora support (support@nexora.africa)
- [ ] Decide on authentication method:
  - **Header (recommended):** `X-API-Key: your-api-key`
  - **Query param:** `?api_key=your-api-key`
- [ ] Store API key securely (environment variable, secrets manager)
- [ ] Never expose API key in client-side code

### 2.2 Environment Configuration
```bash
# Required environment variables for your HMIS
TIBABOT_API_URL=https://tibabot.hmis.nexora.africa
TIBABOT_API_KEY=your-api-key-here
TIBABOT_TIMEOUT=30  # seconds
```

### 2.3 Health Check Verification
- [ ] Test connectivity with health endpoint:
```bash
curl https://tibabot.hmis.nexora.africa/health
```
- [ ] Verify response shows:
  - `"status": "healthy"`
  - `"rag_initialized": true`
  - `"demo_mode": false`

### 2.4 Network Configuration
- [ ] Whitelist TibaBot domain in firewall (if required)
- [ ] Configure proxy settings (if applicable)
- [ ] Set appropriate timeouts (recommended: 30s for AI responses)
- [ ] Implement retry logic with exponential backoff

---

## Phase 3: Integration Development

### 3.1 Core API Integration

#### Patient Chat (`POST /chat`)
- [ ] Implement chat endpoint call
- [ ] Handle request fields:
  - `message` — user message (required, 1-5000 chars)
  - `conversation_id` — session ID for multi-turn
  - `mode` — `"chat"`, `"symptom-check"`, or `"auto"` (default)
  - `include_disclaimer` — include medical disclaimer (default: true)
  - `include_sources` — include source citations (default: false)
  - `history` — previous conversation messages
- [ ] Handle response fields:
  - `response` — AI-generated answer
  - `risk_level` — low/medium/high/emergency
  - `is_emergency` — boolean flag for urgent cases
  - `conversation_id` — for multi-turn conversations
  - `engine` — response source (rag/llm/demo/rules/safety/symptom-check)
  - `model_used` — LLM model name
  - `mode` — which mode handled the request
  - `triage_level` — populated when mode=symptom-check
  - `triage_result` — full triage assessment (symptom-check mode)
  - `progress_percentage` — conversation progress (0-100)
  - `options` — suggested user response options
- [ ] Display appropriate warnings for high/emergency risk levels

**Sample Request:**
```json
{
  "message": "I have a headache and fever for 2 days",
  "conversation_id": "optional-session-id",
  "mode": "auto",
  "include_disclaimer": true
}
```

#### Symptom Triage (`POST /triage`)
- [ ] Implement single-turn symptom assessment
- [ ] Send symptom description with optional age/sex
- [ ] Handle triage response:
  - `triage_level` — emergency/urgent/moderate/low
  - `extracted_symptoms`, `red_flags_detected`, `red_flag_warnings`
  - `differential_diagnoses`, `recommendations`
  - `kenya_notes` — Kenya-specific clinical notes

#### Symptom Checker (`POST /symptom-checker/conversation/*`)
- [ ] Implement conversation flow:
  1. `POST /symptom-checker/conversation/start` — Begin symptom assessment
  2. `POST /symptom-checker/conversation/message` — Continue conversation
  3. `GET /symptom-checker/conversation/{session_id}` — Get conversation state
  4. `DELETE /symptom-checker/conversation/{session_id}` — End conversation
  5. `POST /symptom-checker/conversation/feedback` — Submit feedback
- [ ] Handle conversation states:
  - `greeting` → `collecting_symptoms` → `collecting_duration` → `assessment_ready`
  - `emergency` (requires immediate action)
- [ ] Display triage levels appropriately (emergency/urgent/moderate/low)
- [ ] Show differential diagnoses and recommendations
- [ ] Render suggested response options from `options` field

#### Clinical Assistant (`POST /clinical/assist`)
- [ ] Implement provider authentication (ensure only clinicians access)
- [ ] Send relevant context via `PatientContext`:
  - `patient_age`, `patient_sex`, `gestational_age_weeks`
  - `facility_level` (1-6), `allergies`, `comorbidities`, `current_medications`
- [ ] Configure verbosity: `"concise"`, `"standard"`, or `"educational"`
- [ ] Display:
  - Clinical recommendations
  - Kenya-specific guidance (KEML, MOH protocols)
  - Suggested ICD-10 codes
  - Source citations
  - Safety alerts and abbreviation glossary

#### Clinical Chat (`POST /clinical/chat`)
- [ ] Implement multi-turn clinical conversation
- [ ] Optionally enable SSE streaming (`"stream": true`)
- [ ] Manage sessions:
  - `GET /clinical/chat/session/{session_id}` — Session info
  - `GET /clinical/chat/session/{session_id}/history` — Full history
  - `DELETE /clinical/chat/session/{session_id}` — Delete session

#### ICD-10 Integration (`/icd10/*`)
- [ ] Implement search: `GET /icd10/search?q=malaria&limit=10`
- [ ] Implement typeahead: `GET /icd10/suggest?q=malar&limit=5` (optimized for UI autocomplete)
- [ ] Implement auto-coding: `POST /icd10/code` with `clinical_text`
- [ ] Implement batch coding: `POST /icd10/batch` (up to 100 texts)
- [ ] Implement validation: `POST /icd10/validate` to check code conflicts
- [ ] Implement lookup: `GET /icd10/lookup/{code}` for single code details
- [ ] Display confidence scores for code suggestions
- [ ] Allow clinician to confirm/override suggested codes

#### Condition Predictor (`POST /predict/condition`)
- [ ] Implement patient feature submission (age, gender, vitals, labs, lifestyle)
- [ ] Display primary condition with confidence score
- [ ] Show all predictions ranked by probability
- [ ] List identified risk factors
- [ ] Use `?display_mode=explicit` or `?display_mode=silent`

#### ICU Predictor (`POST /predict/icu/*`)
- [ ] Implement ICU condition prediction with vitals, labs, ABG, and interventions
- [ ] Support metric/imperial unit systems
- [ ] Display SOFA and qSOFA scores
- [ ] Show critical alerts and escalation recommendations
- [ ] Integrate risk stratification: `POST /predict/icu/risk-stratify`

#### Practitioner Validation (`POST /practitioner/validate`)
- [ ] Implement SHA HWR practitioner lookup
- [ ] Pass `identification_type` ("ID" or "passport") and `identification_number`
- [ ] Handle validation statuses: `valid`, `inactive`, `not_found`, `suspended`, `error`
- [ ] Store and use returned API key for authenticated access

### 3.2 Error Handling
- [ ] Handle HTTP error codes:
  | Code | Action |
  |------|--------|
  | 400 | Show validation error message |
  | 401 | Check API key configuration |
  | 429 | Implement backoff, show "Try again later" |
  | 500 | Log error, show generic message |
  | 503 | Service unavailable, retry later |
- [ ] Implement graceful degradation when TibaBot is unavailable
- [ ] Log all errors for debugging

### 3.3 Rate Limit Management
- [ ] Monitor rate limit status: `GET /rate-limit`
- [ ] Implement request queuing if needed
- [ ] Display user-friendly messages when rate limited
- [ ] Consider authenticated requests for higher limits (60/min vs 30/min)

---

## Phase 4: User Interface

### 4.1 Patient-Facing UI
- [ ] Design chat interface matching your HMIS branding
- [ ] Show typing indicators during AI processing
- [ ] Display risk level badges (color-coded):
  - 🟢 Low — Green
  - 🟡 Medium — Yellow
  - 🟠 High — Orange
  - 🔴 Emergency — Red
- [ ] Show emergency banner with Kenya emergency numbers (999/112)
- [ ] Display response engine tags (RAG, demo, rules)
- [ ] Render suggested options from `options` field as clickable buttons
- [ ] Add medical disclaimer footer

### 4.2 Provider-Facing UI
- [ ] Integrate clinical assistant into provider workflow
- [ ] Support multi-turn clinical chat with session management
- [ ] Display ICD-10 suggestions in diagnosis entry forms
- [ ] Integrate ICD-10 typeahead (`/icd10/suggest`) for autocomplete in forms
- [ ] Show source citations for clinical recommendations
- [ ] Display safety alerts prominently
- [ ] Add feedback mechanism for AI suggestions

### 4.3 Accessibility & Localization
- [ ] Support English and Swahili interfaces
- [ ] Use `/i18n/bundle/{language}` to load translations
- [ ] Use `/i18n/detect` for automatic language selection
- [ ] Ensure mobile responsiveness
- [ ] Test with screen readers
- [ ] Handle Sheng (Kenyan slang) input gracefully

---

## Phase 5: Testing

### 5.1 Functional Testing
- [ ] Test all integrated endpoints with sample data
- [ ] Verify correct handling of emergency responses
- [ ] Test multi-turn conversations (symptom checker session continuity)
- [ ] Test multi-turn clinical chat (session management)
- [ ] Verify ICD-10 code suggestions accuracy
- [ ] Test ICD-10 code validation (conflict detection)
- [ ] Test condition predictor with various patient profiles
- [ ] Test ICU predictor with critical care scenarios
- [ ] Test practitioner validation with valid/invalid IDs
- [ ] Test with Swahili and Sheng inputs

### 5.2 Edge Cases
- [ ] Empty/null inputs
- [ ] Very long messages (test character limits)
- [ ] Special characters and encoding
- [ ] Network timeouts
- [ ] Rate limit exceeded scenarios
- [ ] Demo mode fallback (when RAG not initialized)
- [ ] Invalid session IDs for conversation endpoints

### 5.3 Performance Testing
- [ ] Measure response latency (typical: 1-3 seconds)
- [ ] Test under expected load
- [ ] Verify timeout handling
- [ ] Test concurrent user scenarios

### 5.4 Security Testing
- [ ] Verify API key is not exposed in client-side code
- [ ] Test that unauthorized requests are rejected
- [ ] Verify HTTPS is enforced
- [ ] Check response data doesn't leak sensitive info
- [ ] Test clinical endpoints require authentication

---

## Phase 6: Compliance & Documentation

### 6.1 Data Privacy
- [ ] Document data flow (TibaBot doesn't persist patient data)
- [ ] Update privacy policy to mention AI assistant usage
- [ ] Obtain patient consent for AI-assisted services (if required)
- [ ] Ensure compliance with Kenya Data Protection Act

### 6.2 Medical Disclaimer
- [ ] Display prominent disclaimer:
  > "TibaBot provides health information for educational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of a qualified healthcare provider."
- [ ] Ensure users understand AI limitations

### 6.3 Internal Documentation
- [ ] Document integration architecture
- [ ] Create runbook for common issues
- [ ] Document API key rotation procedure
- [ ] Create training materials for staff

---

## Phase 7: Go-Live

### 7.1 Pre-Launch Checklist
- [ ] Final UAT sign-off
- [ ] API keys configured in production
- [ ] Monitoring and alerting set up
- [ ] Support escalation path defined
- [ ] Rollback plan documented

### 7.2 Monitoring Setup
- [ ] Monitor TibaBot health endpoint (`/health`)
- [ ] Monitor build version (`/build-info`) after deployments
- [ ] Track API response times
- [ ] Alert on error rate spikes
- [ ] Monitor rate limit usage (`/rate-limit`)
- [ ] Log all AI interactions for audit

### 7.3 Soft Launch
- [ ] Deploy to limited user group first
- [ ] Gather feedback for 1-2 weeks
- [ ] Monitor for issues
- [ ] Iterate based on feedback

### 7.4 Full Rollout
- [ ] Announce to all users
- [ ] Provide user training/documentation
- [ ] Monitor adoption metrics

---

## Phase 8: Ongoing Operations

### 8.1 Maintenance
- [ ] Subscribe to TibaBot update notifications
- [ ] Plan for API version upgrades
- [ ] Rotate API keys periodically
- [ ] Review usage patterns quarterly

### 8.2 Feedback Loop
- [ ] Collect user feedback: `POST /feedback`
```json
{
  "message_id": "msg-uuid",
  "feedback": "up",
  "conversation_id": "conv-uuid",
  "user_query": "What causes malaria?",
  "bot_response": "Malaria is caused by...",
  "risk_level": "low"
}
```
- [ ] Use conversation-specific feedback: `POST /symptom-checker/conversation/feedback`
- [ ] Monitor feedback stats: `GET /feedback/stats`
- [ ] Report issues to Nexora support
- [ ] Share feedback to improve TibaBot

### 8.3 Continuous Improvement
- [ ] Track user satisfaction metrics
- [ ] Monitor clinical accuracy feedback
- [ ] Evaluate new TibaBot features for adoption

---

## Appendix A: Quick Reference — Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | System health check |
| `/build-info` | GET | No | Build version and git info |
| `/stats` | GET | No | API usage statistics |
| `/rate-limit` | GET | No | Rate limit status |
| `/chat` | POST | Optional | Unified patient chat |
| `/conversation/{id}` | GET | No | Get conversation history |
| `/triage` | POST | No | Single-turn symptom triage |
| `/symptom-checker/conversation/start` | POST | No | Start symptom checker |
| `/symptom-checker/conversation/message` | POST | No | Continue symptom checker |
| `/symptom-checker/conversation/{session_id}` | GET | No | Get conversation state |
| `/symptom-checker/conversation/{session_id}` | DELETE | No | End conversation |
| `/symptom-checker/conversation/feedback` | POST | No | Conversation feedback |
| `/symptom-checker/conversation/health` | GET | No | Symptom checker health |
| `/clinical/assist` | POST | Yes | Clinical decision support |
| `/clinical/chat` | POST | Yes | Multi-turn clinical chat |
| `/clinical/chat/session/{id}` | GET | Yes | Get clinical session |
| `/clinical/chat/session/{id}/history` | GET | Yes | Session history |
| `/clinical/chat/session/{id}` | DELETE | Yes | Delete session |
| `/clinical/chat/stats` | GET | Yes | Clinical chat stats |
| `/clinical/profile` | GET/PUT | Yes | Provider profile |
| `/clinical/health` | GET | No | Clinical service health |
| `/icd10/code` | POST | No | Auto-code clinical text |
| `/icd10/batch` | POST | No | Batch auto-code (up to 100) |
| `/icd10/search` | GET | No | Search ICD-10 codes |
| `/icd10/suggest` | GET | No | Typeahead suggestions |
| `/icd10/validate` | POST | No | Validate code combinations |
| `/icd10/lookup/{code}` | GET | No | Lookup single code |
| `/icd10/stats` | GET | No | ICD-10 statistics |
| `/predict/condition` | POST | Optional | Condition prediction |
| `/predict/conditions` | GET | No | List conditions |
| `/predict/features` | GET | No | List input features |
| `/predict/health` | GET | No | Predictor health |
| `/predict/icu/predict` | POST | Optional | ICU condition prediction |
| `/predict/icu/sofa` | POST | Optional | Calculate SOFA score |
| `/predict/icu/qsofa` | POST | Optional | Calculate qSOFA score |
| `/predict/icu/risk-stratify` | POST | Optional | Risk stratification |
| `/predict/icu/conditions` | GET | No | List ICU conditions |
| `/predict/icu/health` | GET | No | ICU predictor health |
| `/practitioner/validate` | POST | Optional | Validate practitioner |
| `/practitioner/stats` | GET | Yes | Validation statistics |
| `/practitioner/health` | GET | No | Validation health |
| `/i18n/languages` | GET | No | Supported languages |
| `/i18n/detect` | GET | No | Detect language |
| `/i18n/translate` | POST | No | Get translations |
| `/i18n/bundle/{language}` | GET | No | Translation bundle |
| `/feedback` | POST | Optional | Submit feedback |
| `/feedback/stats` | GET | No | Feedback statistics |

---

## Appendix B: SDK Code Samples

### Python
```python
import requests

class TibaBotClient:
    def __init__(self, api_key: str, base_url: str = "https://tibabot.hmis.nexora.africa"):
        self.base_url = base_url
        self.headers = {
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        }

    def chat(self, message: str, mode: str = "auto") -> dict:
        response = requests.post(
            f"{self.base_url}/chat",
            headers=self.headers,
            json={"message": message, "mode": mode},
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def triage(self, symptoms: str, age: int = None, sex: str = None) -> dict:
        payload = {"symptoms": symptoms}
        if age: payload["age"] = age
        if sex: payload["sex"] = sex
        response = requests.post(
            f"{self.base_url}/triage",
            headers=self.headers,
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def search_icd10(self, query: str, limit: int = 10) -> dict:
        response = requests.get(
            f"{self.base_url}/icd10/search",
            headers=self.headers,
            params={"q": query, "limit": limit},
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def validate_practitioner(self, id_type: str, id_number: str) -> dict:
        response = requests.post(
            f"{self.base_url}/practitioner/validate",
            headers=self.headers,
            json={"identification_type": id_type, "identification_number": id_number},
            timeout=15
        )
        response.raise_for_status()
        return response.json()

# Usage
client = TibaBotClient(api_key="your-api-key")
result = client.chat("What causes malaria?")
print(result["response"])
```

### JavaScript/TypeScript
```typescript
class TibaBotClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = 'https://tibabot.hmis.nexora.africa') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(method: string, path: string, body?: any, params?: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async chat(message: string, mode: 'chat' | 'symptom-check' | 'auto' = 'auto') {
    return this.request('POST', '/chat', { message, mode });
  }

  async triage(symptoms: string, age?: number, sex?: string) {
    return this.request('POST', '/triage', { symptoms, age, sex });
  }

  async searchICD10(query: string, limit = 10) {
    return this.request('GET', '/icd10/search', undefined, { q: query, limit: String(limit) });
  }

  async validatePractitioner(idType: string, idNumber: string) {
    return this.request('POST', '/practitioner/validate', {
      identification_type: idType,
      identification_number: idNumber,
    });
  }
}

// Usage
const client = new TibaBotClient('your-api-key');
const result = await client.chat('What are symptoms of typhoid?');
console.log(result.response);
```

---

## Appendix C: Support Contacts

| Resource | Contact |
|----------|---------|
| **Technical Support** | support@nexora.africa |
| **GitHub Issues** | https://github.com/nexora-africa-ltd/tibabot/issues |
| **API Documentation** | Enable `/docs` endpoint (contact support) |
| **Vitora HMIS** | https://github.com/nexora-africa-ltd/vitora-hmis |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | February 2026 | Initial checklist |
| 1.1 | March 2026 | Added symptom triage, clinical chat, ICU predictor, practitioner validation, i18n endpoints; updated schemas and endpoint paths |

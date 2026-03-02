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
| [ ] **Patient Chat** | `POST /chat` | General health Q&A for patients |
| [ ] **Symptom Checker** | `POST /conversation/*` | Guided symptom assessment with triage |
| [ ] **Clinical Assistant** | `POST /clinical/assist` | Provider-facing clinical decision support |
| [ ] **ICD-10 Auto-Coding** | `POST /icd10/code` | Automatic diagnosis code suggestions |
| [ ] **ICD-10 Search** | `GET /icd10/search` | Search ICD-10 code database |
| [ ] **Condition Predictor** | `POST /predict/condition` | ML-based condition prediction |

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
- [ ] Handle response fields:
  - `response` - AI-generated answer
  - `risk_level` - low/medium/high/emergency
  - `is_emergency` - boolean flag for urgent cases
  - `conversation_id` - for multi-turn conversations
  - `citations` - source references
- [ ] Display appropriate warnings for high/emergency risk levels

**Sample Request:**
```json
{
  "message": "I have a headache and fever for 2 days",
  "conversation_id": "optional-session-id",
  "context": {
    "age": 30,
    "gender": "female"
  }
}
```

#### Symptom Checker (`POST /conversation/*`)
- [ ] Implement conversation flow:
  1. `POST /conversation/start` - Begin symptom assessment
  2. `POST /conversation/message` - Continue conversation
- [ ] Handle conversation states:
  - `greeting` → `collecting_symptoms` → `collecting_duration` → `assessment_ready`
  - `emergency` (requires immediate action)
- [ ] Display triage levels appropriately (emergency/urgent/moderate/low)
- [ ] Show differential diagnoses and recommendations

#### Clinical Assistant (`POST /clinical/assist`)
- [ ] Implement provider authentication (ensure only clinicians access)
- [ ] Send relevant context:
  - `patient_age`, `facility_level`, `presenting_complaint`
- [ ] Display:
  - Clinical recommendations
  - Kenya-specific guidance (KEML, MOH protocols)
  - Suggested ICD-10 codes
  - Source citations

#### ICD-10 Integration (`/icd10/*`)
- [ ] Implement search: `GET /icd10/search?q=malaria&limit=10`
- [ ] Implement auto-coding: `POST /icd10/code` with clinical text
- [ ] Display confidence scores for code suggestions
- [ ] Allow clinician to confirm/override suggested codes

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
  - 🟢 Low - Green
  - 🟡 Medium - Yellow
  - 🟠 High - Orange
  - 🔴 Emergency - Red
- [ ] Show emergency banner with Kenya emergency numbers (999/112)
- [ ] Add medical disclaimer footer

### 4.2 Provider-Facing UI
- [ ] Integrate clinical assistant into provider workflow
- [ ] Display ICD-10 suggestions in diagnosis entry forms
- [ ] Show source citations for clinical recommendations
- [ ] Add feedback mechanism for AI suggestions

### 4.3 Accessibility & Localization
- [ ] Support English and Swahili interfaces
- [ ] Ensure mobile responsiveness
- [ ] Test with screen readers
- [ ] Handle Sheng (Kenyan slang) input gracefully

---

## Phase 5: Testing

### 5.1 Functional Testing
- [ ] Test all integrated endpoints with sample data
- [ ] Verify correct handling of emergency responses
- [ ] Test multi-turn conversations (session continuity)
- [ ] Verify ICD-10 code suggestions accuracy
- [ ] Test with Swahili and Sheng inputs

### 5.2 Edge Cases
- [ ] Empty/null inputs
- [ ] Very long messages (test character limits)
- [ ] Special characters and encoding
- [ ] Network timeouts
- [ ] Rate limit exceeded scenarios

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
- [ ] Monitor TibaBot health endpoint
- [ ] Track API response times
- [ ] Alert on error rate spikes
- [ ] Monitor rate limit usage
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
  "conversation_id": "uuid",
  "rating": 5,
  "helpful": true,
  "comment": "Accurate advice"
}
```
- [ ] Report issues to Nexora support
- [ ] Share feedback to improve TibaBot

### 8.3 Continuous Improvement
- [ ] Track user satisfaction metrics
- [ ] Monitor clinical accuracy feedback
- [ ] Evaluate new TibaBot features for adoption

---

## Appendix A: Quick Reference - Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | System health check |
| `/chat` | POST | Optional | Patient health Q&A |
| `/conversation/start` | POST | Optional | Start symptom checker |
| `/conversation/message` | POST | Optional | Continue symptom checker |
| `/clinical/assist` | POST | Yes | Provider clinical support |
| `/icd10/search` | GET | Optional | Search ICD-10 codes |
| `/icd10/code` | POST | Yes | Auto-code clinical text |
| `/predict/condition` | POST | Optional | ML condition prediction |
| `/feedback` | POST | Optional | Submit feedback |
| `/rate-limit` | GET | No | Check rate limit status |

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

    def chat(self, message: str, context: dict = None) -> dict:
        response = requests.post(
            f"{self.base_url}/chat",
            headers=self.headers,
            json={"message": message, "context": context or {}},
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

  async chat(message: string, context?: Record<string, any>): Promise<any> {
    const response = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ message, context: context || {} }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async searchICD10(query: string, limit = 10): Promise<any> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const response = await fetch(`${this.baseUrl}/icd10/search?${params}`, {
      headers: { 'X-API-Key': this.apiKey },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
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

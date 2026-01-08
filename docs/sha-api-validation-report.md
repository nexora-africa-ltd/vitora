# SHA API Validation Report

> Generated from official Kenya Digital Superhighway Postman Collection
> Date: January 2025

## Executive Summary

This report compares Vitora's SHA integration implementation against the **official Kenya Digital Superhighway API documentation** obtained from the SHA developer portal Postman workspace.

**Overall Status**: 🟡 **Significant Updates Required**

| Category | Status | Priority |
|----------|--------|----------|
| Authentication | ❌ Incorrect | Critical |
| Eligibility Check | ❌ Wrong endpoint/method | Critical |
| Claims Submission | ⚠️ Partial match | High |
| Client Registry | ❌ Not implemented | Medium |
| Terminology Lookup | ❌ Not implemented | Medium |

---

## 1. Authentication - CRITICAL FIX REQUIRED

### Official API Specification

**Endpoint**: `GET /v1/hie-auth?key={{consumer_key}}`

**Authentication Method**: Basic Auth → JWT Token

**Required Credentials** (from collection variables):
- `consumer_key`: API key (e.g., `1FL-DHABP05113`)
- `secret`: Client secret for JWT signing
- `username`: API username
- `password`: API password

### Official Code Snippets (from SHA Developer Portal)

#### cURL
```bash
curl -X GET "{base_url}/v1/hie-auth?key=YOUR-CONSUMER-KEY" \
  -H "Authorization: Basic $(echo -n 'YOUR-USERNAME:YOUR-PASSWORD' | base64)"
```

#### Python
```python
import requests
import base64

# Credentials
username = "YOUR-USERNAME"
password = "YOUR-PASSWORD"
consumer_key = "YOUR-CONSUMER-KEY"

# Create Basic Auth header
credentials = f"{username}:{password}"
basic_auth = base64.b64encode(credentials.encode()).decode()

# Make the request
response = requests.get(
    f"{base_url}/v1/hie-auth?key={consumer_key}",
    headers={"Authorization": f"Basic {basic_auth}"}
)

# Get the JWT token
token = response.json()["token"]
```

#### JavaScript (Node.js)
```javascript
const base64 = require("base-64");

const username = "YOUR-USERNAME";
const password = "YOUR-PASSWORD";
const consumerKey = "YOUR-CONSUMER-KEY";
const baseUrl = "YOUR-BASE-URL";

const credentials = `${username}:${password}`;
const basicAuth = base64.encode(credentials);

async function getToken() {
  try {
    const response = await fetch(`${baseUrl}/v1/hie-auth?key=${consumerKey}`, {
      method: "GET",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log("JWT Token:", data.token);
    return data.token;
  } catch (error) {
    console.error("Error fetching token:", error);
  }
}

getToken();
```

### Postman Pre-request Script (JWT Generation)

```javascript
// Pre-request script from official Postman collection
var CryptoJS = require('crypto-js');

function base64url(source) {
    let encodedSource = CryptoJS.enc.Base64.stringify(source);
    encodedSource = encodedSource.replace(/=+$/, '');
    encodedSource = encodedSource.replace(/\+/g, '-');
    encodedSource = encodedSource.replace(/\//g, '_');
    return encodedSource;
}

function generateJWT(user, agent, secret) {
    var header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    var payload = JSON.stringify({
        username: user,
        agent: agent,
        exp: Math.floor(Date.now() / 1000) + 3600  // 1 hour expiry
    });
    
    var encoded_header = base64url(CryptoJS.enc.Utf8.parse(header));
    var encoded_payload = base64url(CryptoJS.enc.Utf8.parse(payload));
    
    var signature = CryptoJS.HmacSHA256(
        encoded_header + "." + encoded_payload, 
        secret
    );
    
    return encoded_header + "." + encoded_payload + "." + base64url(signature);
}

// Generate and store token
var jwt = generateJWT(
    pm.collectionVariables.get("username"),
    pm.collectionVariables.get("consumer_key"),
    pm.collectionVariables.get("secret")
);
pm.collectionVariables.set("token", jwt);
```

**Headers for Authenticated Requests**:
```
Authorization: Bearer {{token}}
Content-Type: application/json
```

### Current Implementation Issues

File: `backend/hmis/apps/billing/services/sha_eligibility.py`

```python
# CURRENT (INCORRECT)
headers = {
    'Authorization': f'Bearer {self.api_key}',  # Wrong - uses raw API key
    'Content-Type': 'application/json',
}

# SHOULD BE
# 1. Generate JWT from consumer_key + secret
# 2. Use JWT as Bearer token
```

### Recommended Fix

Create new authentication service:

```python
# backend/hmis/apps/billing/services/sha_auth.py

import hmac
import hashlib
import base64
import json
import time
from django.conf import settings

class SHAAuthService:
    """
    SHA Authentication Service.
    
    Generates JWT tokens for SHA API authentication per official spec.
    """
    
    def __init__(self):
        self.consumer_key = settings.SHA_CONSUMER_KEY
        self.secret = settings.SHA_CLIENT_SECRET
        self.username = settings.SHA_USERNAME
        self.base_url = settings.SHA_API_BASE_URL
    
    def _base64url_encode(self, data: bytes) -> str:
        """Base64URL encode without padding."""
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    
    def generate_jwt(self) -> str:
        """
        Generate JWT token for SHA API authentication.
        
        Uses HS256 algorithm as specified in official Postman collection.
        Token expires in 1 hour.
        """
        header = {'alg': 'HS256', 'typ': 'JWT'}
        payload = {
            'username': self.username,
            'agent': self.consumer_key,
            'exp': int(time.time()) + 3600  # 1 hour expiry
        }
        
        # Encode header and payload
        header_encoded = self._base64url_encode(json.dumps(header).encode())
        payload_encoded = self._base64url_encode(json.dumps(payload).encode())
        
        # Create signature
        message = f"{header_encoded}.{payload_encoded}"
        signature = hmac.new(
            self.secret.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()
        signature_encoded = self._base64url_encode(signature)
        
        return f"{header_encoded}.{payload_encoded}.{signature_encoded}"
    
    def get_auth_headers(self) -> dict:
        """Get headers with fresh JWT token."""
        token = self.generate_jwt()
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
```

---

## 2. Eligibility Check - CRITICAL FIX REQUIRED

### Official API Specification

**Endpoint**: `GET /v2/eligibility`

**Query Parameters**:
| Parameter | Description | Example |
|-----------|-------------|---------|
| `doc_type` | Document type | `national_id`, `kra_pin`, `sha_number`, `cr_number` |
| `doc_value` | Document value | `12345678` |

**Example Request**:
```
GET https://uat.dha.go.ke/v2/eligibility?doc_type=national_id&doc_value=12345678
Authorization: Bearer {{token}}
```

**Response Structure**:
```json
{
    "IsSuccess": true,
    "Message": "Success",
    "Errors": [],
    "Data": {
        "eligible": true,
        "reason": "Active Coverage",
        "coverageEndDate": "2025-12-31",
        "isEmployed": true,
        "means_testing_details": {
            "category": "STANDARD",
            "copay_percentage": 10
        }
    }
}
```

### Current Implementation Issues

File: `backend/hmis/apps/billing/services/sha_eligibility.py`

```python
# CURRENT (INCORRECT)
response = requests.post(
    f'{self.api_base_url}/eligibility/check',  # Wrong URL and method
    json=request_data,  # Should be query params
    ...
)

# SHOULD BE
response = requests.get(
    f'{self.api_base_url}/v2/eligibility',
    params={
        'doc_type': 'sha_number',  # or 'national_id'
        'doc_value': sha_member.sha_number,
    },
    headers=self.auth_service.get_auth_headers(),
    timeout=self.timeout,
)
```

---

## 3. Client Registry - NEW FEATURE REQUIRED

### Official API Specification

SHA provides a Client Registry for patient lookup and registration.

#### Fetch Client

**Endpoint**: `GET /v3/client-registry/fetch-client`

**Query Parameters**:
| Parameter | Description | Example |
|-----------|-------------|---------|
| `doc_type` | Document type | `national_id`, `kra_pin`, `sha_number`, `cr_number`, `birth_certificate`, `nemis`, `driving_licence` |
| `doc_value` | Document value | `12345678` |

**Response**:
```json
{
    "IsSuccess": true,
    "Data": {
        "resourceType": "Patient",
        "id": "CR6164711105276-6",
        "identifier": [
            {"system": "urn:kenya:sha", "value": "SHA-123456789"},
            {"system": "urn:kenya:national_id", "value": "12345678"}
        ],
        "name": [{"family": "Doe", "given": ["John"]}],
        "gender": "male",
        "birthDate": "1990-01-15"
    }
}
```

#### Register Client

**Endpoint**: `POST /v3/uat-cr-registration`

**Request Body** (FHIR Patient resource):
```json
{
    "resourceType": "Patient",
    "identifier": [
        {"system": "urn:kenya:national_id", "value": "12345678"}
    ],
    "name": [{"family": "Doe", "given": ["John"]}],
    "gender": "male",
    "birthDate": "1990-01-15",
    "telecom": [{"system": "phone", "value": "+254700000000"}],
    "address": [{"city": "Nairobi", "country": "KE"}]
}
```

---

## 4. Claims Submission - UPDATE REQUIRED

### Official API Specification

**Endpoint**: `POST /v1/shr-med/bundle`

**Request Body**: FHIR Bundle (your current format is mostly correct)

**Claim Status Check**:
**Endpoint**: `GET /v1/shr-med/claim-status?claim_id={{claim_id}}`

### Current Implementation Issues

```python
# CURRENT (INCORRECT endpoints)
'/v1/claims/submit',
'/api/v1/claims/submit',
'/claims/submit',

# SHOULD BE
'/v1/shr-med/bundle'  # For submission
'/v1/shr-med/claim-status'  # For status check
```

---

## 5. Terminology Services - NEW FEATURE

### Official API Endpoints

| Endpoint | Purpose | Example Query |
|----------|---------|---------------|
| `GET /terminology/v1/icd11` | ICD-11 diagnosis codes | `?code=BA00&chapter=1` |
| `GET /terminology/v1/loinc` | LOINC lab codes | `?code=2339-0` |
| `GET /terminology/v1/ichi` | Health interventions | `?code=AAA.AA.AA` |
| `GET /terminology/v1/sha-intervention` | SHA tariffs | `?code=SHA-001` |
| `GET /terminology/v1/active-component` | Drug components | `?name=paracetamol` |
| `GET /terminology/v1/product` | Products/medications | `?name=panadol` |

---

## 6. Environment Configuration

### Required Settings

Add to `backend/hmis/settings/base.py`:

```python
# SHA API Configuration (Official Endpoints)
SHA_API_BASE_URL = env('SHA_API_BASE_URL', default='https://uat.dha.go.ke')
SHA_CONSUMER_KEY = env('SHA_CONSUMER_KEY', default='')
SHA_CLIENT_SECRET = env('SHA_CLIENT_SECRET', default='')
SHA_USERNAME = env('SHA_USERNAME', default='')
SHA_PASSWORD = env('SHA_PASSWORD', default='')

# SHA API Endpoints (Official)
SHA_ENDPOINTS = {
    'auth': '/v1/hie-auth',
    'eligibility': '/v2/eligibility',
    'client_registry': '/v3/client-registry/fetch-client',
    'client_register': '/v3/uat-cr-registration',
    'claims_submit': '/v1/shr-med/bundle',
    'claims_status': '/v1/shr-med/claim-status',
    'terminology_icd11': '/terminology/v1/icd11',
    'terminology_loinc': '/terminology/v1/loinc',
    'terminology_ichi': '/terminology/v1/ichi',
    'terminology_sha': '/terminology/v1/sha-intervention',
}
```

### Required `.env` Variables

```bash
# SHA API Credentials (from developer portal)
SHA_API_BASE_URL=https://uat.dha.go.ke
SHA_CONSUMER_KEY=1FL-DHABP05113
SHA_CLIENT_SECRET=your_secret_here
SHA_USERNAME=your_username
SHA_PASSWORD=your_password
```

---

## 7. Implementation Priority

### Phase 1 - Critical (Week 1)
1. ✅ Create `SHAAuthService` with JWT generation
2. ✅ Update eligibility endpoint to `GET /v2/eligibility`
3. ✅ Update claims endpoint to `POST /v1/shr-med/bundle`
4. ✅ Update test script with correct endpoints

### Phase 2 - High (Week 2)
1. Implement Client Registry integration
2. Add terminology service lookups
3. Update FHIR bundle format if needed

### Phase 3 - Enhancement (Week 3+)
1. Add caching for terminology lookups
2. Implement pre-authorization flow
3. Add facility search integration

---

## 8. Testing Validation

After implementing fixes, use the official test credentials to validate:

```bash
# Run updated test script
cd backend
poetry run python scripts/test_sha_integration.py --test auth
poetry run python scripts/test_sha_integration.py --test eligibility --national-id "12345678"
poetry run python scripts/test_sha_integration.py --test claims
```

---

## Appendix: Official API Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid/expired token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Rate Limited |
| 500 | Server Error |

---

**Document Status**: Ready for Implementation
**Last Updated**: January 2025
**Source**: Kenya Digital Superhighway Postman Collection (Official)

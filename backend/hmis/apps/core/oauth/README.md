# SMART on FHIR OAuth2 Module

> **Purpose**: Enables third-party healthcare applications to securely integrate with Vitora HMIS using the SMART on FHIR standard.

---

## 🔐 Authentication Methods: JWT vs OAuth2

Vitora HMIS supports **two authentication methods** that serve different purposes:

| Feature | SimpleJWT (Internal) | OAuth2/SMART (External) |
|---------|---------------------|------------------------|
| **Purpose** | Internal Vitora apps | Third-party SMART apps |
| **Users** | Web, mobile, desktop frontends | External EHR integrations |
| **Login Endpoint** | `POST /api/token/` | `GET /oauth/authorize/` |
| **Token Type** | JWT (access + refresh) | OAuth2 Bearer token |
| **Scopes** | N/A (role-based) | SMART on FHIR scopes |
| **Patient Context** | Session-based | Launch context in token |

### When to Use Which?

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Vitora HMIS API                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Internal Apps (Vitora Frontend)      External Apps (SMART)        │
│   ┌─────────────────────────────┐      ┌─────────────────────────┐  │
│   │  • web-app (Next.js)        │      │  • Third-party EHRs     │  │
│   │  • mobile-app (React Native)│      │  • Health apps          │  │
│   │  • desktop-app (Electron)   │      │  • Research tools       │  │
│   └──────────────┬──────────────┘      └──────────────┬──────────┘  │
│                  │                                    │             │
│                  ▼                                    ▼             │
│         POST /api/token/                    GET /oauth/authorize/   │
│         (SimpleJWT)                         (OAuth2 + SMART)        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### For Internal Apps (Vitora Frontend)

Continue using the existing JWT authentication:

```bash
# Login
curl -X POST http://localhost:9088/api/token/ \
  -H "Content-Type: application/json" \
  -d '{"username": "staff@example.com", "password": "password123"}'

# Response
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGci...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGci..."
}

# Use token
curl http://localhost:9088/api/patients/ \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGci..."
```

### For Third-Party SMART Apps

Use OAuth2 with SMART on FHIR extensions:

#### Step 1: Discover Configuration

```bash
curl http://localhost:9088/.well-known/smart-configuration
```

Response includes authorization/token endpoints, supported scopes, and capabilities.

#### Step 2: Register Your Application

Register via Django admin at `/admin/oauth2_provider/application/` or programmatically.

#### Step 3: Authorization Flow

```
┌────────────┐     ┌────────────┐     ┌────────────┐
│  SMART App │     │   Vitora   │     │    User    │
└─────┬──────┘     └─────┬──────┘     └─────┬──────┘
      │                  │                  │
      │ 1. Redirect to   │                  │
      │ /oauth/authorize │                  │
      │─────────────────>│                  │
      │                  │ 2. Show login    │
      │                  │─────────────────>│
      │                  │                  │
      │                  │ 3. User approves │
      │                  │<─────────────────│
      │                  │                  │
      │ 4. Redirect with │                  │
      │ authorization    │                  │
      │ code             │                  │
      │<─────────────────│                  │
      │                  │                  │
      │ 5. Exchange code │                  │
      │ for token        │                  │
      │─────────────────>│                  │
      │                  │                  │
      │ 6. Access token  │                  │
      │ + patient context│                  │
      │<─────────────────│                  │
```

#### Example: EHR Launch Flow

```javascript
// 1. EHR redirects to your app with launch params
// GET https://your-app.com/launch?iss=https://vitora.example.com/fhir&launch=abc123

// 2. Your app redirects to authorization
const authUrl = new URL('https://vitora.example.com/oauth/authorize/');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', 'your-client-id');
authUrl.searchParams.set('redirect_uri', 'https://your-app.com/callback');
authUrl.searchParams.set('scope', 'openid fhirUser launch patient/*.read');
authUrl.searchParams.set('state', 'random-state');
authUrl.searchParams.set('launch', 'abc123');  // From EHR
window.location = authUrl;

// 3. After user approval, exchange code for token
const tokenResponse = await fetch('https://vitora.example.com/oauth/token/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    redirect_uri: 'https://your-app.com/callback',
    client_id: 'your-client-id',
    client_secret: 'your-client-secret',  // For confidential clients
    code_verifier: pkceVerifier,           // For PKCE
  }),
});

// 4. Response includes patient context
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid fhirUser launch patient/*.read",
  "patient": "123",      // Patient ID from launch context
  "encounter": "456"     // Encounter ID (if requested)
}
```

---

## 📋 Supported SMART Scopes

### OIDC Scopes
| Scope | Description |
|-------|-------------|
| `openid` | OpenID Connect authentication |
| `profile` | User profile information |
| `fhirUser` | FHIR User resource reference |
| `offline_access` | Refresh tokens for offline use |

### Launch Scopes
| Scope | Description |
|-------|-------------|
| `launch` | Receive launch context from EHR |
| `launch/patient` | Request patient context |
| `launch/encounter` | Request encounter context |

### Clinical Scopes (SMART v2 format)
| Pattern | Example | Description |
|---------|---------|-------------|
| `patient/<Resource>.read` | `patient/Patient.read` | Read patient demographics |
| `patient/<Resource>.write` | `patient/Observation.write` | Write observations |
| `patient/*.*` | `patient/*.*` | Full patient data access |
| `user/<Resource>.read` | `user/Patient.read` | Read any patient (provider) |
| `system/<Resource>.*` | `system/*.*` | Backend service access |

### Commonly Used Scope Combinations

```bash
# Patient portal app (patient-facing)
openid profile patient/Patient.read patient/Observation.read

# Clinical decision support (provider-facing, read-only)
openid fhirUser launch user/Patient.read user/Observation.read user/Condition.read

# Lab integration (backend service)
system/ServiceRequest.read system/DiagnosticReport.write

# Full EHR integration
openid fhirUser launch/patient launch/encounter patient/*.*
```

---

## 🔗 API Endpoints

### Discovery & Metadata
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/.well-known/smart-configuration` | GET | SMART configuration document |
| `/fhir/metadata` | GET | FHIR CapabilityStatement |

### OAuth2 (django-oauth-toolkit)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/oauth/authorize/` | GET | Authorization endpoint |
| `/oauth/token/` | POST | Token endpoint |
| `/oauth/revoke_token/` | POST | Token revocation |
| `/oauth/introspect/` | POST | Token introspection |

### SMART-Specific
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/smart/launch` | GET | EHR launch handler |
| `/smart/launch-context` | POST | Create launch context (internal) |
| `/smart/introspect` | POST | SMART token introspection |

---

## ⚙️ Configuration

### Django Settings

```python
# settings/base.py

INSTALLED_APPS = [
    ...
    "oauth2_provider",  # django-oauth-toolkit
]

OAUTH2_PROVIDER = {
    "SCOPES_BACKEND_CLASS": "hmis.apps.core.oauth.scopes.SMARTScopes",
    "OAUTH2_VALIDATOR_CLASS": "hmis.apps.core.oauth.validators.SMARTOAuth2Validator",
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,      # 1 hour
    "REFRESH_TOKEN_EXPIRE_SECONDS": 2592000,  # 30 days
    "PKCE_REQUIRED": True,                    # Required for public clients
    "OIDC_ENABLED": True,
}

FHIR_BASE_URL = os.getenv("FHIR_BASE_URL", "http://localhost:9088")
```

### Environment Variables

```bash
# .env
FHIR_BASE_URL=https://vitora.example.com
```

---

## 🛡️ Using SMART Permissions in Views

To enforce SMART scope-based access control in your ViewSets:

```python
from rest_framework.viewsets import ModelViewSet
from hmis.apps.core.oauth.permissions import (
    SMARTScopePermission,
    SMARTPatientAccessPermission,
    get_smart_filter_for_patient_scopes,
)

class PatientViewSet(ModelViewSet):
    """Patient API with SMART scope enforcement."""

    permission_classes = [SMARTScopePermission, SMARTPatientAccessPermission]
    smart_resource_type = "Patient"  # FHIR resource type

    def get_queryset(self):
        qs = super().get_queryset()
        # Automatically filter by patient context for patient/* scopes
        return get_smart_filter_for_patient_scopes(self.request, qs)
```

---

## 📁 Module Structure

```
oauth/
├── __init__.py          # Module exports
├── scopes.py            # SMART scope definitions
├── validators.py        # OAuth2 validators with SMART extensions
├── views.py             # SMART configuration & launch endpoints
├── permissions.py       # Scope-based permission classes
├── urls.py              # URL routing
└── README.md            # This file
```

---

## 🔍 Troubleshooting

### "Invalid scope" error
Ensure the requested scope follows SMART v2 syntax: `<context>/<Resource>.<action>`

### "Missing launch context" warning
The `launch` scope requires an EHR-initiated launch. For standalone apps, use `launch/patient` to request patient selection.

### Token not working with existing endpoints
Existing endpoints use JWT authentication by default. For SMART tokens to work, add `OAuth2Authentication` to the view:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "oauth2_provider.contrib.rest_framework.OAuth2Authentication",  # Add this
    ],
}
```

---

## 📚 References

- [SMART App Launch IG](http://hl7.org/fhir/smart-app-launch/)
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [django-oauth-toolkit Documentation](https://django-oauth-toolkit.readthedocs.io/)
- [Vitora FHIR Validation Plan](../../../../../docs/fhir-validation-plan.md)

---

**Last Updated**: January 31, 2026
**Module Version**: 1.0.0

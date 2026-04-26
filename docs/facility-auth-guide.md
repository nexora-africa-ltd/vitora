# TibaBot Facility Authentication & User Identity Guide

How HMIS platforms (Vitora, OpenMRS, etc.) authenticate with TibaBot and identify individual users.

## Architecture Overview

TibaBot uses a **dual-layer authentication** model:

| Layer | Mechanism | Identifies | Purpose |
|-------|-----------|------------|---------|
| **System identity** | API key (`X-API-Key` header) | Facility / organization | Billing, rate limits, scope enforcement |
| **User identity** | JWT (`Authorization: Bearer` header) | Individual user | Audit trail, personalization, role-based retrieval |

```
┌─────────────────────────┐
│  Vitora HMIS / Host App │
│                         │
│  1. User signs in       │
│  2. App issues JWT      │
│  3. Calls TibaBot:      │
│     X-API-Key: <key>    │ ← authenticates the facility (billing)
│     Authorization:      │ ← identifies the user (audit)
│       Bearer <jwt>      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│      TibaBot API        │
│                         │
│  • Validate API key     │ ← facility-level auth
│  • Validate JWT (opt.)  │ ← user-level identity
│  • Build AuthContext     │
│  • Attach to request    │
│    → request.state.auth │
└─────────────────────────┘
```

The API key is **required** for protected endpoints. The JWT is **always optional** — when absent, requests are treated as anonymous facility-level calls.

---

## Billing Model

Each **facility** is a billing seat:

- Organization registers → gets one API key per facility
- Billing is per-seat (per facility key), not per-user
- Users within a facility share the facility's API key
- User identity (JWT) is for audit/personalization, not billing

---

## API Key Authentication

### Obtaining a Key

Facility API keys are provisioned by TibaBot administrators via the admin API:

```bash
curl -X POST https://tibabot.vitora.nexora.africa/admin/facility-keys \
  -H "X-Admin-Key: $TIBABOT_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "facility_id": "knh-001",
    "facility_name": "Kenyatta National Hospital",
    "org_id": "nexora",
    "facility_level": 5,
    "scopes": ["chat", "triage", "icd10", "clinical", "predict"],
    "jwks_uri": "https://auth.vitora.nexora.africa/.well-known/jwks.json",
    "jwt_issuer": "vitora.nexora.africa"
  }'
```

Response (shown **once** — store securely):

```json
{
  "api_key": "tb_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "key_hash": "3f2b1a4c5d6e7f8g",
  "facility_id": "knh-001",
  "org_id": "nexora",
  "facility_name": "Kenyatta National Hospital",
  "scopes": ["chat", "triage", "icd10", "clinical", "predict"],
  "created_at": "2026-04-26T12:00:00Z"
}
```

### Using the Key

```bash
# Header (recommended)
curl -H "X-API-Key: tb_a1b2c3d4..." https://tibabot.vitora.nexora.africa/chat

# Query parameter (for testing only)
curl "https://tibabot.vitora.nexora.africa/chat?api_key=tb_a1b2c3d4..."
```

### Key Metadata

Each facility key carries:

| Field | Description |
|-------|-------------|
| `facility_id` | Unique facility identifier |
| `facility_name` | Human-readable name |
| `org_id` | Owning organization |
| `facility_level` | Kenya MOH level (1–6) for KEML tailoring |
| `rate_limit` | Custom rate limit override (req/min) |
| `scopes` | Permitted API scopes (e.g. `chat`, `clinical`, `predict`) |
| `jwks_uri` | JWKS endpoint for validating user JWTs |
| `jwt_issuer` | Expected `iss` claim in user JWTs |

### Key Rotation

```bash
curl -X POST https://tibabot.vitora.nexora.africa/admin/facility-keys/rotate \
  -H "X-Admin-Key: $TIBABOT_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"facility_id": "knh-001", "reason": "Scheduled 90-day rotation"}'
```

This atomically creates a new key and revokes the old one. The response contains the new raw key.

### Key Revocation

```bash
curl -X DELETE https://tibabot.vitora.nexora.africa/admin/facility-keys/knh-001 \
  -H "X-Admin-Key: $TIBABOT_ADMIN_KEY"
```

### Listing Keys

```bash
# All keys
curl https://tibabot.vitora.nexora.africa/admin/facility-keys \
  -H "X-Admin-Key: $TIBABOT_ADMIN_KEY"

# Filter by org
curl "https://tibabot.vitora.nexora.africa/admin/facility-keys?org_id=nexora" \
  -H "X-Admin-Key: $TIBABOT_ADMIN_KEY"
```

### Legacy Keys

Keys set via `TIBABOT_API_KEYS` env var continue to work but carry no facility metadata. They appear as `facility_id: "legacy"` in the auth context. Migrate to provisioned keys for full audit and billing support.

---

## User Identity (JWT)

### Overview

When the host app (e.g. Vitora HMIS) authenticates a user, it issues a JWT and includes it in requests to TibaBot. TibaBot validates the JWT signature and extracts user claims for audit logging and role-based behavior.

**JWT validation is always optional and non-blocking.** If the JWT is missing or invalid, the request proceeds with facility-level identity only.

### JWT Claims Schema

The host app's JWT must include these claims:

#### Required Standard Claims

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string | User ID — unique within the issuing org |
| `iss` | string | Issuer — must match the facility's `jwt_issuer` config |
| `exp` | integer | Expiration (Unix epoch) |

#### Optional Custom Claims (namespace: `tibabot/`)

| Claim | Type | Description |
|-------|------|-------------|
| `tibabot/org_id` | string | Organization ID |
| `tibabot/facility_id` | string | Facility ID (should match API key's facility) |
| `tibabot/role` | string | User role: `doctor`, `clinical_officer`, `nurse`, `chw`, `patient`, `admin` |
| `tibabot/facility_level` | integer | Kenya MOH facility level (1–6), overrides API key's level if present |
| `tibabot/name` | string | Display name (used in audit logs, not persisted) |

### Example JWT Payload

```json
{
  "sub": "user-12345",
  "iss": "vitora.nexora.africa",
  "aud": "tibabot-api",
  "exp": 1745700000,
  "iat": 1745696400,
  "tibabot/org_id": "nexora",
  "tibabot/facility_id": "knh-001",
  "tibabot/role": "doctor",
  "tibabot/facility_level": 5,
  "tibabot/name": "Dr. Ochieng"
}
```

### Signing Methods

| Method | Algorithm | When to Use |
|--------|-----------|-------------|
| **JWKS endpoint** (recommended) | RS256, ES256 | Production — host app publishes public keys at a `/.well-known/jwks.json` endpoint |
| **Shared secret** | HS256 | Development/testing — set `TIBABOT_JWT_SECRET` env var |

### Sending the JWT

```bash
curl -X POST https://tibabot.vitora.nexora.africa/chat \
  -H "X-API-Key: tb_a1b2c3d4..." \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the treatment for malaria?"}'
```

### JWT Validation Flow

1. Extract `Authorization: Bearer <token>` header
2. Look up facility's `jwks_uri` and `jwt_issuer` from the facility key store
3. Fetch signing key from JWKS endpoint (cached 1 hour) or use shared secret
4. Validate signature, expiry, audience (`tibabot-api`), and issuer
5. Extract claims into `AuthContext.user_*` fields
6. If validation fails → log warning, proceed without user identity (non-blocking)

### Per-Facility JWT Configuration

Each facility key can store its own JWKS endpoint and expected issuer:

```json
{
  "jwks_uri": "https://auth.vitora.nexora.africa/.well-known/jwks.json",
  "jwt_issuer": "vitora.nexora.africa"
}
```

This lets different HMIS platforms use their own identity providers. Facilities without JWT config fall back to the global `TIBABOT_JWT_JWKS_URI` / `TIBABOT_JWT_ISSUER` defaults.

---

## AuthContext

Every request gets an `AuthContext` attached to `request.state.auth`, populated from both layers:

```python
class AuthContext(BaseModel):
    # From API key
    api_key_hash: Optional[str]        # SHA-256 hash (first 16 hex chars)
    facility_id: Optional[str]         # e.g. "knh-001"
    facility_name: Optional[str]       # e.g. "Kenyatta National Hospital"
    org_id: Optional[str]              # e.g. "nexora"
    facility_level: Optional[int]      # 1–6 (Kenya MOH)
    is_authenticated: bool             # True if valid API key
    scopes: List[str]                  # ["chat", "triage", "icd10", ...]

    # From JWT (when present)
    user_id: Optional[str]             # JWT sub claim
    user_role: Optional[str]           # "doctor", "nurse", etc.
    user_name: Optional[str]           # Display name
    jwt_issuer: Optional[str]          # JWT iss claim
    has_verified_identity: bool        # True if valid JWT
```

### Accessing in Route Handlers

```python
from fastapi import Request

@router.post("/my-endpoint")
async def my_endpoint(request: Request):
    auth = request.state.auth

    # Facility identity (from API key)
    facility_id = auth.facility_id
    org_id = auth.org_id

    # User identity (from JWT, may be None)
    user_id = auth.user_id
    role = auth.user_role

    # Check identity tier
    if auth.has_verified_identity:
        # Full identity — user signed in via host app
        ...
    elif auth.is_authenticated:
        # Facility-level only — no user JWT
        ...
    else:
        # Anonymous — no API key
        ...
```

---

## Rate Limits

| Client Type | Default (req/min) | How Set |
|-------------|-------------------|---------|
| Anonymous (no API key) | 30 | `TIBABOT_RATE_LIMIT` env var |
| Authenticated (valid API key) | 60 (2× anonymous) | Multiplier in `RateLimiter` |
| Facility-specific override | Custom | `rate_limit` field on facility key |

---

## Scopes

Facility keys can be limited to specific API scopes:

| Scope | Endpoints |
|-------|-----------|
| `chat` | `/chat`, `/conversation/*` |
| `triage` | `/triage`, `/symptom-checker/*` |
| `icd10` | `/icd10/*` |
| `clinical` | `/clinical/*` |
| `predict` | `/predict/*` |
| `patient` | `/patient/*` |
| `admin` | `/admin/*` |

Default scopes for new keys: `["chat", "triage", "icd10"]`

---

## Admin API Reference

All admin endpoints require `X-Admin-Key` header matching `TIBABOT_ADMIN_KEY` env var.

### `POST /admin/facility-keys` — Create Key

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `facility_id` | string | Yes | Unique facility identifier |
| `facility_name` | string | Yes | Human-readable name |
| `org_id` | string | Yes | Organization identifier |
| `facility_level` | int | No | Kenya MOH level (1–6) |
| `rate_limit` | int | No | Custom rate limit (req/min, 1–1000) |
| `scopes` | string[] | No | API scopes (default: chat, triage, icd10) |
| `jwks_uri` | string | No | JWKS endpoint for JWT validation |
| `jwt_issuer` | string | No | Expected JWT issuer |

### `GET /admin/facility-keys` — List Keys

Query params: `org_id` (optional filter)

### `DELETE /admin/facility-keys/{facility_id}` — Revoke Key

Revokes all active keys for the specified facility.

### `POST /admin/facility-keys/rotate` — Rotate Key

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `facility_id` | string | Yes | Facility to rotate |
| `reason` | string | No | Rotation reason (for audit) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TIBABOT_API_KEYS` | (empty) | Legacy comma-separated API keys |
| `TIBABOT_REQUIRE_AUTH` | `true` | Require API key for protected endpoints |
| `TIBABOT_RATE_LIMIT` | `30` | Requests per minute (anonymous) |
| `TIBABOT_RATE_WINDOW` | `60` | Rate limit window (seconds) |
| `TIBABOT_ADMIN_KEY` | (unset) | Master key for admin endpoints |
| `TIBABOT_FACILITY_KEYS_DB` | `data/facility_keys.db` | SQLite path for facility keys |
| `TIBABOT_JWT_SECRET` | (unset) | HS256 shared secret (dev only) |
| `TIBABOT_JWT_JWKS_URI` | (unset) | Default JWKS endpoint |
| `TIBABOT_JWT_ISSUER` | (unset) | Default expected JWT issuer |
| `TIBABOT_JWT_AUDIENCE` | `tibabot-api` | Expected JWT audience |
| `TIBABOT_JWT_LEEWAY` | `30` | Clock skew tolerance (seconds) |
| `TIBABOT_JWT_ALGORITHMS` | `RS256,ES256` | Accepted JWT algorithms |

---

## Integration Checklist for HMIS Developers

1. **Request a facility API key** from the TibaBot admin
2. **Store the key** in your secrets manager (shown once)
3. **Include `X-API-Key`** on all TibaBot API requests
4. **(Optional) Issue JWTs** for user-level identity:
   - Publish a JWKS endpoint (or share a HS256 secret for dev)
   - Include `sub`, `iss`, `exp`, `aud: "tibabot-api"` claims
   - Add `tibabot/role` and `tibabot/facility_id` custom claims
   - Pass JWT in `Authorization: Bearer <token>` header
5. **Plan key rotation** — rotate every 90 days or on staff changes
6. **Monitor rate limits** — check `GET /rate-limit` and handle 429 responses

---

## Security Notes

- API keys are hashed (SHA-256) before storage — raw keys are never persisted
- JWTs are validated server-side on every request (signature, expiry, audience, issuer)
- JWKS signing keys are cached for 1 hour to reduce latency
- JWT validation failures are non-blocking and logged at debug level
- All admin operations are logged via the audit log
- The `X-Admin-Key` is a single master key — restrict access to platform operators

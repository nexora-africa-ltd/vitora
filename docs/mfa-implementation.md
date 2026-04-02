# MFA Implementation (TOTP + Backup Codes)

This document describes the current backend Multi‑Factor Authentication (MFA) implementation for Vitora HMIS.

## Scope

### Implemented (Backend)
- TOTP-based MFA enrollment using an authenticator app (RFC 6238 via `pyotp`)
- QR provisioning URI + base64 PNG QR code
- Single-use backup codes (recovery codes)
- MFA login flow using a short-lived temporary MFA token
- Role-based MFA requirement enforcement (blocks disabling MFA for required roles)
- Audit logging for MFA lifecycle events
- **Brute-force protection** via rate limiting and failed attempt tracking
- **Django admin restricted to Nexora superusers** (`AdminAccessMiddleware`)
- **Admin MFA enforcement** — TOTP verification required before accessing `/admin/` (session-based)
- **MFA onboarding grace period** — 72h (configurable) for new users before mandatory setup
- **Grace period enforcement middleware** — blocks API access after deadline expires
- 53 comprehensive unit tests (`backend/tests/test_mfa.py`)
- 16 rate limiting tests (`backend/tests/test_rate_limiting.py`)
- 21 admin security tests (`backend/tests/test_admin_security.py`)

### Implemented (Frontend)
- MFA setup wizard (`web-app/components/auth/mfa-setup-wizard.tsx`)
- MFA verification during login (`web-app/components/auth/mfa-verification.tsx`)
- MFA API client (`web-app/lib/api/mfa.ts`)
- Zod schemas for type-safe API responses (`web-app/lib/schemas/mfa.schema.ts`)
- **MFA grace period banner** (`web-app/components/auth/mfa-grace-banner.tsx`) — dismissible countdown
- **403 `mfa_setup_required` interceptor** (`web-app/lib/api/client.ts`) — redirects to setup
- **Login flow** passes `mfa_grace_deadline` and `mfa_grace_expired` through auth context
- 37 UI component tests

### Not implemented yet
- E2E MFA tests (Playwright)
- MFA settings page in user profile (currently via Settings > Security tab)

## Dependencies

### Backend
Declared in [backend/pyproject.toml](backend/pyproject.toml):
- `pyotp` — TOTP token generation/verification (RFC 6238)
- `qrcode` — QR code generation for authenticator apps

**Note**: `django-otp` and `django-two-factor-auth` were evaluated but **not used**. Our custom MFA module provides better control for DHA compliance (audit logging, role-based enforcement) without the overhead of SMS support we don't need.

### Frontend
- React components using shadcn/ui patterns
- Sonner for toast notifications
- Zod for API response validation

## Data Model

Module: [backend/hmis/apps/core/mfa/models.py](backend/hmis/apps/core/mfa/models.py)

- `UserTOTPDevice`
  - Fields: `user`, `name`, `secret_key`, `confirmed`, `created_at`, `last_used_at`
  - Behavior:
    - Secret auto-generated on save if missing
    - `verify_token()` updates `last_used_at` on successful verification
    - `get_provisioning_uri()` returns an `otpauth://` URI (issuer: `Vitora HMIS`)

- `BackupCode`
  - Stores SHA‑256 hashes of recovery codes
  - `generate_codes()` deletes existing codes and returns plain-text codes once
  - `verify_code()` consumes (marks used) on success

- `MFAToken`
  - Temporary token returned during login when MFA is enabled
  - Expires after 5 minutes (`TOKEN_LIFETIME_MINUTES = 5`)
  - Enforced single-use (`used=True` after verification)
  - **Brute-force protection**: Tracks `failed_attempts` and invalidates after 5 failed attempts (`MAX_FAILED_ATTEMPTS = 5`)

Migration: [backend/hmis/apps/core/migrations/0017_mfa_models.py](backend/hmis/apps/core/migrations/0017_mfa_models.py)

## Role Requirements

Utility: [backend/hmis/apps/core/mfa/utils.py](backend/hmis/apps/core/mfa/utils.py)

MFA is considered:
- **Enabled** if the user has at least one confirmed TOTP device.
- **Required** if:
  - `user.is_superuser` is true, OR
  - the user has a `StaffProfile` whose primary/secondary role code is in `{ADMIN, CLINICAL_SENIOR, MANAGEMENT}`, OR
  - the role category is `MANAGEMENT`.

## API Endpoints

URL config: [backend/hmis/apps/core/mfa/urls.py](backend/hmis/apps/core/mfa/urls.py)
Mounted at: [backend/hmis/urls.py](backend/hmis/urls.py) under `/api/mfa/`.

### 1) MFA Status
- `GET /api/mfa/status/` (auth required)
- Response shape:
  - `mfa_enabled` (bool)
  - `mfa_required` (bool)
  - `devices_count` (int)
  - `backup_codes_remaining` (int)
  - `has_pending_setup` (bool)

### 2) Start TOTP Setup (Enrollment)
- `POST /api/mfa/totp/setup/` (auth required)
- Behavior:
  - Deletes any unconfirmed device(s) for the user
  - Creates a new unconfirmed `UserTOTPDevice`
  - Returns `secret`, `provisioning_uri`, and `qr_code` (base64 PNG)

### 3) Confirm TOTP Setup
- `POST /api/mfa/totp/confirm/` (auth required)
- Body:
  - `{ "token": "123456" }`
- Behavior:
  - Verifies the TOTP token against the pending device
  - Marks device as `confirmed=true`
  - Generates backup codes and returns them once

### 4) Disable MFA
- `POST /api/mfa/disable/` (auth required)
- Body:
  - `{ "password": "<current_password>" }`
- Behavior:
  - Denied (`403`) if MFA is required for the user’s role
  - Validates password
  - Deletes all devices and backup codes for the user

### 5) Regenerate Backup Codes
- `POST /api/mfa/backup-codes/regenerate/` (auth required)
- Body:
  - `{ "token": "123456" }` (current TOTP)
- Behavior:
  - Requires MFA enabled
  - Verifies TOTP
  - Generates a fresh set of backup codes (invalidates old ones)

### 6) Verify MFA During Login
- `POST /api/mfa/verify/` (no auth; part of login flow)
- Body (either of):
  - `{ "mfa_token": "...", "token": "123456" }`
  - `{ "mfa_token": "...", "backup_code": "ABCDEFGH" }`
- Behavior:
  - Validates and consumes `MFAToken`
  - Returns JWT `access` + `refresh` on success

## Login Flow Integration

Login view: [backend/hmis/apps/core/views.py](backend/hmis/apps/core/views.py) (`AuditedTokenObtainPairView`)

- If MFA is enabled for the user, `/api/token/` returns:
  - `{ "mfa_required": true, "mfa_token": "..." }`
  - (No `access`/`refresh` yet)
- If MFA is required but not enabled:
  - Tokens are still returned, plus:
    - `mfa_setup_required=true` to drive the UI flow
    - `mfa_grace_deadline` (ISO 8601) — when the setup grace period expires
    - `mfa_grace_expired` (bool) — true if deadline has already passed
  - On first login, `StaffProfile.mfa_grace_deadline` is set (now + `MFA_GRACE_PERIOD_HOURS`, default 72h)
  - The deadline is set once and never extended

## Django Admin Access Control

Middleware: [backend/hmis/apps/core/middleware.py](backend/hmis/apps/core/middleware.py) (`AdminAccessMiddleware`)

- **Superuser-only**: Only `is_superuser=True` users can access `/admin/`. Tenant staff (`is_staff=True` but not superuser) receive 403.
- **Admin MFA**: If the superuser has a confirmed TOTP device, they must verify TOTP at `/admin/mfa-verify/` before accessing any admin page. Verification is stored in `request.session['admin_mfa_verified']`.
- **Template**: [backend/hmis/templates/admin/mfa_verify.html](backend/hmis/templates/admin/mfa_verify.html)

## MFA Onboarding Grace Period

Utilities: [backend/hmis/apps/core/mfa/utils.py](backend/hmis/apps/core/mfa/utils.py)
Middleware: [backend/hmis/apps/core/middleware.py](backend/hmis/apps/core/middleware.py) (`MFAGraceEnforcementMiddleware`)

**Flow:**
1. User with MFA-required role logs in without TOTP configured
2. `set_mfa_grace_deadline()` sets `StaffProfile.mfa_grace_deadline = now + 72h`
3. During grace period: full API access; frontend shows dismissible banner with countdown
4. After grace period: `MFAGraceEnforcementMiddleware` returns 403 `{code: "mfa_setup_required"}` on all API routes except `/api/token/`, `/api/mfa/`, `/api/auth/change-password/`, `/api/me/`
5. Frontend interceptor catches this 403 and redirects to `/settings?tab=security`

**Settings:**
- `MFA_ENFORCEMENT` — master toggle (default `True`; `False` in dev/test)
- `MFA_GRACE_PERIOD_HOURS` — configurable, default `72` (set to `0` for immediate enforcement)

**Model field:** `StaffProfile.mfa_grace_deadline` (DateTimeField, nullable)

**Frontend components:**
- `MFAGraceBanner` (`web-app/components/auth/mfa-grace-banner.tsx`) — amber alert shown inside dashboard layout
- Axios 403 interceptor (`web-app/lib/api/client.ts`) — catches `mfa_setup_required` and redirects
- Login page redirects to setup when `mfa_grace_expired=true`

## Audit Logging

Events are written via `AuditLog.log(...)` in MFA views.

Current MFA-related actions:
- `mfa_enrollment_started`
- `mfa_enabled`
- `mfa_disabled`
- `backup_codes_regenerated`
- `backup_code_used`
- `mfa_verification_failed`
- `mfa_verification_success`

## Brute-Force Protection

Authentication endpoints are protected against brute-force attacks through multiple layers:

### Rate Limiting (DRF Throttling)

Configured in [backend/hmis/settings/base.py](backend/hmis/settings/base.py):

| Endpoint | Scope | Rate Limit |
|----------|-------|------------|
| `POST /api/token/` | `login` | 5 requests/minute |
| `POST /api/mfa/verify/` | `mfa_verify` | 5 requests/minute |

When the rate limit is exceeded, requests receive HTTP `429 Too Many Requests`.

### MFA Token Failed Attempt Tracking

The `MFAToken` model tracks failed verification attempts:

- Each failed TOTP or backup code verification increments `failed_attempts`
- After 5 failed attempts (`MAX_FAILED_ATTEMPTS`), the token is automatically invalidated
- The user must restart the login flow to get a new MFA token
- Failed attempts are logged to the audit trail with attempt count

### Combined Protection

The dual-layer approach provides defense in depth:

1. **Rate limiting** prevents rapid automated attacks from any source
2. **Per-token attempt tracking** prevents slow attacks that stay under rate limits
3. **5-minute token expiry** limits the attack window
4. **Audit logging** enables detection of attack patterns

### Test Coverage

Rate limiting tests: [backend/tests/test_rate_limiting.py](backend/tests/test_rate_limiting.py)
- Verifies throttle configuration on login and MFA verify endpoints
- Tests rate limit enforcement after threshold
- Tests failed attempt tracking and token invalidation
- Tests 429 response after max attempts

## Test Coverage

Backend tests: [backend/tests/test_mfa.py](backend/tests/test_mfa.py)
- Model tests: devices, provisioning URI, backup code generation/consumption
- API tests: status, setup/confirm, disable, regenerate
- Login flow: MFA required response + verify endpoint
- Role enforcement: required roles vs optional roles
- Audit log tests for MFA events

## Frontend Follow-ups

When implementing the `web-app/` MFA UI:
- Add a settings wizard to:
  - enroll (setup + confirm)
  - display and require storage of backup codes
  - allow regeneration (with TOTP confirmation)
  - allow disable (with password) where permitted
- Update Zod schemas / API client wiring as needed for MFA status and login responses.
- E2E Playwright tests for: login → MFA verify, grace period banner, grace expired redirect
- Clear `vitora_mfa_grace_deadline` from localStorage when MFA setup is completed

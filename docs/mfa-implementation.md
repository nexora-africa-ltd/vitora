# MFA Implementation (TOTP + Backup Codes)

This document describes the current backend Multi‑Factor Authentication (MFA) implementation for Vitora HMIS.

## Scope

Implemented (backend):
- TOTP-based MFA enrollment using an authenticator app (RFC 6238 via `pyotp`)
- QR provisioning URI + base64 PNG QR code
- Single-use backup codes (recovery codes)
- MFA login flow using a short-lived temporary MFA token
- Role-based MFA requirement enforcement (blocks disabling MFA for required roles)
- Audit logging for MFA lifecycle events

Not implemented yet:
- Web frontend MFA settings/setup wizard in `web-app/`
- E2E MFA tests (only backend tests exist today)

## Dependencies

Backend dependencies are declared in [backend/pyproject.toml](backend/pyproject.toml):
- `pyotp` (used for token generation/verification)
- `qrcode` (QR generation; already present)
- `django-otp` and `django-two-factor-auth` are added as dependencies but the current implementation uses a custom MFA module (see below). They are available for future integration if we decide to align with their built-in device models.

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
  - Tokens are still returned, plus `mfa_setup_required=true` to drive the UI flow

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

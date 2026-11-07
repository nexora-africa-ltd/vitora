<!--
Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
Purpose: DHA capability submission evidence for SEC-AUTH-001 authentication and access control.
Use: Attach the listed sanitized staging artifacts and automated test reports to the DHA portal.
Inputs: DHA Certification Test Facility staging accounts, Facility 13, and SEC-AUTH-001 artifacts captured on 7 November 2026.
-->

# SEC-AUTH-001 — Authentication and Access Control

**Priority:** High
**Test method:** Live System Test and targeted automated regression tests
**Status:** **Ready for portal submission** — live staging evidence refreshed on 7 November 2026 after the idle-logout redirect and tenant-scoped failed-login audit fixes.

## Capability statement

Vitora authenticates users with username/password credentials, requires a second factor for configured roles, returns a canonical tenant-aware access profile, applies role-based permissions, warns after 15 minutes of client inactivity, ends the client session at 30 minutes, and maintains server-enforced session revocation. Emergency break-glass access is time-bound, reasoned, audited, and subject to administrator review.

The staged DHA demonstration uses dedicated laboratory accounts only. No production user, patient identifier, password, access token, refresh token, cookie, MFA token, or backup code is included in this evidence package.

## DHA portal endpoint submission

| Portal field | Value |
|---|---|
| Endpoint title | `Retrieve authenticated staff access profile — SEC-AUTH-001` |
| HTTP method | `GET` |
| URL | `https://staging-api.vitora.digital/api/staff/me/` |
| Authentication | Authenticated DHA laboratory clinician session (MFA verified) |
| Required header | `X-Facility-ID: 13` |
| Expected result | `200 OK` with the caller's role, facility context, and effective permissions |

The attached response is intentionally minimized: user identifiers, contact details, licensing identifiers, membership details, tokens, and session material are removed. It retains the authorization facts DHA needs to validate.

## Captured attachments

All listed live artifacts were captured against the DHA staging environment on 7 November 2026. Screenshot labels identify the screen purpose; the capture manifest records the capture constraints and sanitization statement.

| Attachment | Evidence |
|---|---|
| `SEC-AUTH-001/sanitized-staff-me-response.json` | Sanitized live `GET /api/staff/me/` response for the clinician role, including role (`DOCTOR`), facility operating profile, enabled modules, and effective permissions. |
| `SEC-AUTH-001/01-successful-login-clinician.png` | Successful clinician session after MFA completion. The fully rendered Profile screen shows the authenticated clinical role and assigned permissions; direct identifiers are redacted. |
| `SEC-AUTH-001/02-invalid-login-rejected.png` | Rejected invalid-login response. The username is a non-existent DHA evidence value and the entered password is masked. |
| `SEC-AUTH-001/03-mfa-challenge.png` | MFA challenge with a six-digit OTP control and backup-code alternative; no authentication secret is visible. |
| `SEC-AUTH-001/06-rbac-permission-comparison.png` | Visual comparison generated from three sanitized live `/api/staff/me/` responses: administrator, clinician, and clerk. It contrasts effective permission counts and selected administrative/clinical capabilities. |
| `SEC-AUTH-001/rbac-permission-comparison.json` | Machine-readable sanitized source for the RBAC comparison image. |
| `SEC-AUTH-001/07-idle-warning-15-minutes.png` | Client idle-warning modal after a simulated 15-minute inactivity interval, with countdown and explicit continue/logout actions. |
| `SEC-AUTH-001/08-idle-logout-30-minutes.png` | Automatic logout after a simulated 30-minute inactivity interval, including the explicit sign-in notification. |
| `SEC-AUTH-001/sanitized-break-glass-review-record.json` | Authoritative sanitized staging API evidence of a controlled, system-scoped mass-casualty break-glass invocation, review, and closure. No patient scope was used. |
| `SEC-AUTH-001/09-break-glass-invocation-and-review.png` | Emergency Access user interface and invocation controls. See the API record above for the authoritative completed reviewer record. |
| `SEC-AUTH-001/10-failed-login-audit-entry.png` | Tenant-scoped Audit Logs entry for a controlled rejected login. The username and client IP are redacted. |
| `SEC-AUTH-001/backend-security-tests.txt` | Targeted backend report: **231 passed** — login, session security, MFA, staff-access profile, emergency access, cookie refresh, and upload validation. |
| `SEC-AUTH-001/idle-timer-tests.txt` | Targeted frontend idle-timer report: **7 passed**. |
| `SEC-AUTH-001/capture-manifest.json` | Capture timestamp, artifact descriptions, and sanitization constraints. |
| `SEC-AUTH-001/SHA256SUMS.txt` | Integrity checksums for the evidence set. |

## Automated test scope

The 231 backend tests are reproducible with the following targeted suite:

```text
poetry run pytest --no-cov -q \
  tests/core/test_auth_session_security.py \
  tests/core/test_admin_security.py \
  tests/core/test_authentication.py \
  tests/core/test_auth_backend.py \
  tests/core/test_auth_response_facility.py \
  tests/core/test_mfa.py \
  tests/core/test_emergency_access.py \
  tests/core/test_cookie_refresh_privacy.py \
  tests/core/test_upload_security.py::TestExtensionCheck \
  tests/core/test_upload_security.py::TestSizeCheck \
  tests/core/test_upload_security.py::TestMagicSniffing
```

The seven frontend checks are reproducible with:

```text
npm test -- --runInBand __tests__/lib/hooks/use-idle-timer.test.ts
```

## Audit observations

- The controlled system-scoped break-glass record is visibly **Reviewed and Closed** in the Emergency Access UI. It has no patient scope, so no patient identifier is present in the evidence.
- Failed authentication for a known staff account now records the facility and organization context without assigning a user actor. This allows the appropriate tenant administrator to review the security event while avoiding cross-tenant visibility.
- Idle logout uses a document navigation to preserve the `reason=idle` notification after local authentication state is cleared.

## Final portal checklist

1. Verify the `/api/staff/me/` endpoint returns `200 OK` with Facility 13 context immediately before upload.
2. Review every image and JSON file for identifiers, credentials, tokens, cookies, MFA values, client IP addresses, and patient data before upload.
3. Regenerate `SHA256SUMS.txt` after any recapture.
4. Rotate or disable the DHA laboratory accounts and invalidate remaining backup codes after certification testing.

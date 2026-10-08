# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing pre-launch penetration testing and security validation report for Vitora HMIS.
Use: Review recent web/API security results, remediation status, and release-readiness boundaries.
Inputs: OWASP ZAP HTML reports in .tmp/, targeted backend pytest results, and production validation evidence.
-->

# Vitora HMIS Penetration Testing Report

**Assessment period:** 4-5 October 2026
**Report version:** 1.0
**Prepared by:** Nexora Consulting Ltd
**System:** Vitora Hospital Management Information System (HMIS)
**Environment:** Production pre-launch validation
**Classification:** DHA-facing security assurance evidence

---

## Executive Summary

Nexora Consulting Ltd completed a scoped pre-launch security assessment of the Vitora HMIS production web application and API. The assessment combined OWASP ZAP dynamic application security testing (DAST), targeted backend authorization regression testing, and production authentication smoke validation.

No High-risk finding was identified in the scoped OWASP ZAP reports. The production web application enforces HTTPS redirects, HSTS, nonce-based Content Security Policy (CSP), clickjacking protection, MIME-sniffing protection, and non-cacheable login responses. Targeted backend authorization suites completed successfully with **175 passing tests** covering multitenancy, sensitive-patient access, permission denial, RBAC, and admin security controls.

The assessment supports pre-launch readiness for a system with no live customer or patient data. It is not an independent third-party penetration-test certification. Manual cross-organization, cross-facility, sensitive-patient, and non-admin administrative-route validation has been completed; the supporting tester and reviewer evidence must be retained before formal approval.

## Recent Penetration Testing Results

| Assessment                                         | Tool / Method                    | Scope                                                                   | Result                                                                               |
| -------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Production web DAST baseline                       | OWASP ZAP 2.17.0                 | `https://app.vitora.digital`                                            | No High findings; scoped report completed                                            |
| Production API DAST baseline                       | OWASP ZAP 2.17.0                 | `https://api.vitora.digital` and app context                            | No High findings; API site summary reported no Medium or Low findings                |
| Multitenancy and organization PII regression suite | pytest / Django test environment | Tenant scoping, facility scoping, organization PII, analytics isolation | 84 passed                                                                            |
| Authorization and admin regression suite           | pytest / Django test environment | Sensitive access, permission denial, RBAC, admin security               | 91 passed                                                                            |
| Production authentication smoke validation         | Controlled production validation | Authenticated versus unauthenticated protected requests                 | Authenticated requests returned 200; unauthenticated protected requests returned 401 |

### ZAP Summary

| Report Artifact                                 | Context                      | High | Medium | Low | Informational |
| ----------------------------------------------- | ---------------------------- | ---: | -----: | --: | ------------: |
| `2026-10-05-ZAP-Report-app.vitora.digital.html` | Vitora Production Pre-Launch |    0 |      3 |   1 |             7 |
| `2026-10-05-ZAP-Report-api.vitora.digital.html` | Vitora Production Pre-Launch |    0 |      1 |   2 |             5 |

The API report included both `api.vitora.digital` and the application origin because both are required for Vitora's cross-origin cookie authentication flow. In that report, the API site summary itself reported no Medium or Low findings; the Medium finding related to the web application response surface.

## Scope And Methodology

### In Scope

```text
https://app.vitora.digital
https://api.vitora.digital
```

### Activities Performed

- Traditional and AJAX/browser-assisted crawling of the production web application.
- Passive response analysis for TLS, redirects, CSP, HSTS, framing, caching, cookie-related controls, MIME sniffing, and information disclosure.
- Controlled low-impact DAST discovery against public web/API surfaces.
- Production authentication smoke validation: protected request success when authenticated and `401 Unauthorized` when unauthenticated.
- Targeted backend pytest regression validation for multitenancy, sensitive access, permission denial, RBAC, and admin protections.
- Source and deployment review of CSP remediation.

### Activities Not Performed

The following were intentionally excluded from automated production testing to prevent operational, clinical, financial, or external-integration effects:

- Denial-of-service, load, stress, and brute-force testing.
- Broad automated write testing against `POST`, `PUT`, `PATCH`, or `DELETE` operations.
- Payment, M-Pesa, SHA/DHA claim submission, biometric consent, SMS, email, or external callback invocation.
- File-upload fuzzing and destructive document operations.
- Tests involving real patient, facility, staff, billing, or clinical data.

## Security Controls Verified

### Transport And Response Security

Production validation confirmed:

| Control                  | Result                                                                     |
| ------------------------ | -------------------------------------------------------------------------- |
| HTTP to HTTPS redirect   | Verified (`307` to `https://app.vitora.digital/`)                          |
| HSTS                     | Verified with `includeSubDomains; preload`                                 |
| Clickjacking protection  | Verified using `X-Frame-Options: DENY` and CSP `frame-ancestors 'self'`    |
| MIME-sniffing protection | Verified using `X-Content-Type-Options: nosniff`                           |
| Referrer policy          | Verified as `strict-origin-when-cross-origin`                              |
| Login/cache protection   | Verified as `Cache-Control: private, no-store, max-age=0, must-revalidate` |
| Framework disclosure     | `X-Powered-By` removed from production responses                           |

### Content Security Policy

The production web application uses a nonce-based CSP with `strict-dynamic`, including:

```text
default-src 'self'
script-src 'self' 'nonce-...' 'strict-dynamic'
object-src 'none'
base-uri 'self'
frame-ancestors 'self'
form-action 'self'
upgrade-insecure-requests
```

The deployment hardening also separates style elements from existing inline style attributes and limits image sources to configured API/media origins. The invalid bare `/_next` HTML response is covered by CSP so it does not create an unprotected error-page exception.

## Authorization And Tenant Security Evidence

The following targeted backend test suites were executed against the current codebase:

```text
tests/core/test_multitenancy.py
tests/patients/test_organization_pii_lookup.py
tests/analytics/test_api.py
```

Result:

```text
84 passed
```

The following authorization, sensitive-access, RBAC, and admin suites were also executed:

```text
tests/core/test_permission_denied_matrix.py
tests/core/test_authorization.py
tests/core/test_admin_security.py
tests/rbac/test_permissions_extended.py
```

Result:

```text
91 passed
```

### Controls Covered By Regression Evidence

| Control                              | Evidence                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Organization tenant isolation        | Multitenancy and organization-scoped PII tests                                  |
| Facility-scoped operational records  | Multitenancy and facility-scoped API tests                                      |
| Sensitive-patient restriction        | Permission-denial and authorization tests for `patients.view_sensitive_patient` |
| Sensitive-access audit events        | RBAC tests for `view_sensitive_patient` and `sensitive_access_denied` events    |
| Model delete permissions             | Permission-denial matrix tests                                                  |
| Tenant admin restrictions            | Admin-security and authorization tests                                          |
| Unauthenticated protected API access | Production smoke validation returned `401 Unauthorized`                         |

## Findings And Remediation Status

| Finding                                                            | ZAP Rating    | Assessment                                                                    | Status                                                                                                                 |
| ------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| CSP image source permitted all HTTPS origins                       | Medium        | Defense-in-depth hardening; script execution remained nonce-restricted        | Remediated in `1de5e1bb6` and `c85bd7c9a`; live production CSP verified with explicit API and Azure Blob media origins |
| CSP allowed inline styles                                          | Medium        | Required compatibility allowance was narrowed to style attributes only        | Remediated in `1de5e1bb6` using `style-src 'self'` and `style-src-attr 'unsafe-inline'`                                |
| CSP absent on invalid `GET /_next` HTML 404                        | Medium        | Error-page hardening gap; normal application routes already had CSP           | Remediated in `1de5e1bb6`                                                                                              |
| Private IP strings in static JavaScript bundle                     | Low           | Generic bundled strings; no exposed reachable private service identified      | Accepted pending routine dependency/bundle review                                                                      |
| `password=ZAP` in generated URL                                    | Informational | Scanner-generated request parameter; not an application credential leak       | False positive / accepted                                                                                              |
| PWA state and Sentry replay session identifiers in browser storage | Informational | No authentication token or patient identifier observed in the reported values | Accepted; continue privacy review of telemetry configuration                                                           |
| Content-Type on minimal redirect                                   | Informational | Bodyless redirect response; no typed content delivered                        | Accepted                                                                                                               |

## Residual Risk And Required Pre-Onboarding Validation

No live customer, patient, or facility data was present during this pre-launch assessment. Manual cross-organization, cross-facility, sensitive-patient, and non-admin administrative-route validation has been completed. Before the first live facility is onboarded, Nexora must retain the controlled production authorization smoke-test evidence using synthetic organizations/facilities and synthetic records.

Minimum required checks:

| Test                                                           | Expected Result                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| User in Organization B requests Patient A                      | Manual validation completed; retain tester, date, expected/actual result, and reviewer evidence              |
| User in Organization B requests Encounter A                    | Manual validation completed; retain tester, date, expected/actual result, and reviewer evidence              |
| Facility B user requests Facility A operational record         | Manual validation completed; retain tester, date, record type, expected/actual result, and reviewer evidence |
| User without sensitive permission requests Sensitive Patient A | Manual validation completed; retain tester, date, expected/actual result, and reviewer evidence              |
| User with sensitive permission requests Sensitive Patient A    | Manual validation completed; retain tester, date, audit-event evidence, and reviewer evidence                |
| Non-admin requests tenant-admin route/API                      | Manual validation completed; retain tester, date, expected/actual result, and reviewer evidence              |

These controls have automated regression evidence. The production smoke test is required to detect configuration or deployment drift before processing real health data.

## Conclusion

The current evidence supports **conditional pre-launch security readiness** for Vitora HMIS. The scoped production DAST reports found no High-risk vulnerability, current authorization regression suites passed, production authentication behavior was validated, and the required manual authorization smoke checks were completed. The system is suitable for controlled pre-launch operation without live customer data, subject to retention and approval of the synthetic-tenant test evidence before the first facility onboarding.

This report does not represent an independent third-party penetration-test certificate or a guarantee of absence of vulnerabilities.

## Evidence Register

| Artifact                                 | Location / Reference                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| Scoped production web ZAP report         | `.tmp/2026-10-05-ZAP-Report-app.vitora.digital.html`       |
| Scoped production API ZAP report         | `.tmp/2026-10-05-ZAP-Report-api.vitora.digital.html`       |
| CSP hardening commit                     | `1de5e1bb6 fix(security): tighten content security policy` |
| Blob media CSP deployment wiring         | `c85bd7c9a fix(deploy): preserve media origin in CSP`      |
| Targeted authorization regression result | 175 passed on 5 October 2026                               |

## Approval

| Role                         | Name                  | Date           | Signature / Reference |
| ---------------------------- | --------------------- | -------------- | --------------------- |
| Assessment performed by      | Nexora Consulting Ltd | 5 October 2026 | Pending approval      |
| Engineering review           |                       |                |                       |
| Security/compliance approval |                       |                |                       |

---

**Document Status:** Draft for DHA-facing review
**Document Owner:** Nexora Consulting Ltd
**Next Review:** Before first live facility onboarding and after any material authentication, tenancy, or external-integration change

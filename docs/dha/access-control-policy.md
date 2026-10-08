# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.

<!--
Purpose: DHA-facing access control policy for Vitora HMIS role-based access control and tenant protection.
Use: Apply when provisioning, reviewing, changing, suspending, or auditing user access.
Inputs: Approved role matrix, staff profile, organization/facility assignment, MFA status, and access-review evidence.
-->

# Access Control Policy

**System:** Vitora HMIS
**Policy owner:** Nexora Consulting Ltd Security Lead
**Review frequency:** At least quarterly and after a material role, facility, or security change

## 1. Policy Statement

Vitora applies least privilege, role-based access control (RBAC), organization/facility scoping, sensitive-patient restrictions, audit logging, and MFA controls for designated privileged roles. Access is granted only for approved clinical, operational, administrative, or support purposes.

## 2. Seven Permission Levels

Vitora stores granular role codes and permissions in a role `permissions_matrix`. For DHA-facing governance, deployed roles are grouped into the following seven permission levels. The approved role matrix remains the authoritative source for exact create/read/update/delete and module capabilities.

| Level | Access Band                           | Typical Implemented Role Codes                               | Permitted Scope                                                         |
| ----: | ------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
|     1 | Platform administration               | Django superuser / Nexora platform staff                     | Platform operations only; Django `/admin/` is restricted to superusers  |
|     2 | Organization/facility administration  | `ADMIN`, `ORG-ADMIN`, `OWNER`                                | Tenant administration, facilities, staff, roles, approved configuration |
|     3 | Senior clinical oversight             | `DOCTOR`, `CLINICAL_OFFICER`, approved senior clinical roles | Clinical care, diagnosis, orders, approved review workflows             |
|     4 | Nursing and direct clinical support   | `NURSE`, `NURSE_AIDE`                                        | Assigned clinical workflow within approved tenant/facility scope        |
|     5 | Diagnostic and medicines services     | `LAB_TECH`, `LAB_SCIENTIST`, `PHARMACIST`, `PHARMACY_TECH`   | Laboratory/pharmacy workflow within assigned scope                      |
|     6 | Registration, records, and operations | `RECEPTIONIST`, `RECORDS_CLERK`                              | Registration, records, and approved operational functions               |
|     7 | Restricted/community/support access   | Remaining approved limited-function roles                    | Only assigned limited modules and read/write actions in the role matrix |

No level grants access beyond the permissions matrix, organization/facility assignment, model-level permission, and object-level scope enforced by the API.

## 3. Tenant And Facility Isolation

- Organization-scoped records, including patient identity records, are limited to the user's organization.
- Facility-scoped operational records, including encounters and many clinical/financial workflows, are limited to the assigned facility unless an approved cross-facility role applies.
- API viewsets use tenant-scoping controls and save tenant context when records are created.
- Cross-organization access must return denial without exposing protected data.
- Facility access and role changes require authorized administration and audit evidence.

## 4. Sensitive Patient Access

Records marked sensitive, including HIV, GBV, and mental-health-related records, require the `patients.view_sensitive_patient` permission. Successful and denied access attempts are logged as `view_sensitive_patient` and `sensitive_access_denied` respectively. Emergency/break-glass access is governed by a separate policy and does not permit unrestricted RBAC administration changes.

## 5. Authentication And MFA

- Web authentication uses HTTP-only cookie-based authentication endpoints.
- Access and refresh cookies are not stored in browser local storage by the web client.
- MFA is required for superusers and designated privileged roles, including `ADMIN`, `CLINICAL_SENIOR`, and management roles, subject to the configured enforcement and grace-period controls.
- Password reset, user invitation, email verification, and onboarding workflows are controlled and audited.

## 6. Provisioning, Review, And Revocation

1. An authorized administrator approves the user, role, organization, facility, department, and required modules.
2. The administrator provisions the staff profile and assigns the minimum required role.
3. MFA is enrolled where required.
4. Access changes, suspension, departure, facility transfer, and emergency-access expiry are recorded and reviewed.
5. Quarterly access review verifies privileged users, sensitive-access permissions, dormant accounts, role drift, and organization/facility assignments.

## 7. Audit And Enforcement

Vitora logs authentication, sensitive access, patient and encounter activity, and relevant administrative events. Role permissions are synchronized to Django Group permissions. Delete endpoints enforce explicit model delete permissions. Production authorization regression suites cover multitenancy, permission denial, sensitive access, RBAC, and admin security.

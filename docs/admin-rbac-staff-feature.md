# Admin / RBAC / Staff Feature

This document describes the current Admin, RBAC, and Staff Management feature set in Vitora HMIS across the backend API and the web frontend.

It is intended to help engineers understand:

- the core RBAC domain models
- the available API endpoints and their intended usage
- the frontend admin screens that consume those endpoints
- the current permission model
- the known implementation gaps that still need cleanup

## Scope

The feature currently covers four closely related admin surfaces:

1. Departments
2. Roles
3. Staff profiles
4. Audit log viewing

Primary code locations:

- Backend models: `backend/hmis/apps/core/models.py`
- Backend serializers: `backend/hmis/apps/core/serializers.py`
- Backend viewsets: `backend/hmis/apps/core/views.py`
- Backend routes: `backend/hmis/urls.py`
- Frontend API client: `web-app/lib/api/rbac.ts`
- Frontend schemas: `web-app/lib/schemas/rbac.schema.ts`
- Frontend types: `web-app/lib/types/rbac.ts`
- Frontend hooks: `web-app/lib/hooks/use-rbac.ts`
- Frontend pages: `web-app/app/(dashboard)/admin/**`

## Feature Overview

Vitora's RBAC foundation extends beyond Django's built-in permissions by introducing domain-level hospital structures:

- `Department`: organizational grouping for staff
- `Role`: hospital role with category, hierarchy, and JSON permission matrix
- `StaffProfile`: hospital staff identity linked to a Django user, department, and role
- `AuditLog`: append-only audit records for accountability and compliance

On the frontend, these models are surfaced through the dashboard admin area:

- `/admin/departments`
- `/admin/roles`
- `/admin/staff`
- `/admin/audit-logs`

## Backend Domain Model

### Department

`Department` is used to organize staff into operational units such as clinical, administrative, laboratory, pharmacy, radiology, and records.

Current model fields include:

- `code`
- `name`
- `department_type`
- `parent`
- `head`
- `is_active`
- `created_at`
- `updated_at`

Supported department types in the current backend model:

- `CLINICAL`
- `ADMINISTRATIVE`
- `SUPPORT`
- `LABORATORY`
- `PHARMACY`
- `RADIOLOGY`
- `RECORDS`

Useful model methods:

- `get_staff_count()`
- `get_hierarchy()`
- `get_subdepartments()`

### Role

`Role` defines hospital roles and stores fine-grained permissions in `permissions_matrix`.

Current role categories:

- `CLINICAL`
- `ADMINISTRATIVE`
- `TECHNICAL`
- `MANAGEMENT`
- `COMMUNITY`

Important fields:

- `code`
- `name`
- `category`
- `description`
- `permissions_matrix`
- `hierarchy_level`
- `parent_role`
- `django_group`
- `requires_license`
- `license_body`
- `is_active`

Useful model methods:

- `has_permission(action, resource)`
- `get_all_permissions()`
- `can_access_department(department)`

### StaffProfile

`StaffProfile` links a Django user account to hospital-specific staffing metadata.

Important fields:

- `user`
- `employee_id`
- `title`
- `middle_name`
- `primary_role`
- `secondary_roles`
- `primary_department`
- `secondary_departments`
- `hwr_id`
- `license_number`
- `license_expiry`
- `license_verified`
- `licensing_body`
- `specialization`
- `phone_number`
- `emergency_contact_name`
- `emergency_contact_phone`
- `employment_status`
- `employment_type`
- `date_joined`
- `date_left`
- `supervisor`

Current employment statuses:

- `ACTIVE`
- `ON_LEAVE`
- `SUSPENDED`
- `TERMINATED`

Current employment types:

- `PERMANENT`
- `CONTRACT`
- `LOCUM`

### AuditLog

`AuditLog` is an append-only accountability record used for compliance and security review.

Important fields:

- `user`
- `action`
- `resource_type`
- `resource_id`
- `timestamp`
- `ip_address`
- `user_agent`
- `details`
- `patient_id`

This model is read-only through the API.

## Backend API Surface

The RBAC/admin API lives under `/api/`.

### Departments

- `GET /api/departments/`
- `POST /api/departments/`
- `GET /api/departments/{id}/`
- `PATCH /api/departments/{id}/`
- `DELETE /api/departments/{id}/`
- `GET /api/departments/{id}/staff/`

Permissions:

- list/retrieve: authenticated users
- create/update/delete: admin users (`IsAdminUser`)

List filters exposed in the viewset:

- `department_type`
- `is_active`
- `parent`
- `search`
- `ordering`

### Roles

- `GET /api/roles/`
- `POST /api/roles/`
- `GET /api/roles/{id}/`
- `PATCH /api/roles/{id}/`
- `DELETE /api/roles/{id}/`
- `GET /api/roles/{id}/permissions/`

Permissions:

- list/retrieve: authenticated users
- create/update/delete: admin users (`IsAdminUser`)

List filters exposed in the viewset:

- `category`
- `requires_license`
- `is_active`
- `hierarchy_level`
- `search`
- `ordering`

### Staff Profiles

- `GET /api/staff/`
- `POST /api/staff/`
- `GET /api/staff/{id}/`
- `PATCH /api/staff/{id}/`
- `DELETE /api/staff/{id}/`
- `GET /api/staff/me/`
- `PATCH /api/staff/me/`
- `GET /api/staff/check_username/?username=...`
- `POST /api/staff/suggest_username/`

Permissions:

- list/retrieve/update/me: authenticated users
- create/delete: admin users (`IsAdminUser`)

Important behavior:

- `POST /api/staff/` uses a dedicated create serializer that creates both the `User` and the `StaffProfile`
- `PATCH /api/staff/me/` is intentionally limited to a small set of self-editable fields
- `DELETE /api/staff/{id}/` is implemented as a soft termination by setting `employment_status = TERMINATED` and `date_left`

List filters exposed in the viewset:

- `primary_role`
- `primary_department`
- `employment_status`
- `primary_role__requires_license`
- `search`
- `ordering`

### Permissions

- `GET /api/permissions/`

This endpoint exposes Django model permissions to authenticated users for role-management UI.

### Audit Logs

- `GET /api/auditlogs/`
- `GET /api/auditlogs/{id}/`

Permissions:

- safe methods only
- currently restricted by `AuditLogPermission`

Current audit log filters exposed in the viewset:

- `action`
- `resource_type`
- `user`
- `search`
- `ordering`

## Frontend Admin Screens

The frontend admin feature lives under `web-app/app/(dashboard)/admin/`.

### Departments UI

Routes:

- `/admin/departments`
- `/admin/departments/new`
- `/admin/departments/[id]`

Capabilities:

- list departments
- filter by department type
- create department
- edit department
- delete department
- assign parent department
- assign department head from staff profiles

### Roles UI

Routes:

- `/admin/roles`
- `/admin/roles/new`
- `/admin/roles/[id]`

Capabilities:

- list roles
- filter by category
- create role
- edit role metadata
- delete role
- view and select permission entries from Django permissions

Important note: the role UI currently presents permission-selection controls, but those controls must remain aligned with the backend `permissions_matrix` contract to be effective.

### Staff UI

Routes:

- `/admin/staff`
- `/admin/staff/new`
- `/admin/staff/[id]`

Capabilities:

- list staff profiles
- filter by department, role, and status
- create staff profiles with user accounts
- edit staff profile assignments and professional metadata
- terminate staff profiles
- validate username availability
- suggest usernames from names
- optionally enrich professional fields from DHA/HWR search in the new-staff flow

### Audit Logs UI

Route:

- `/admin/audit-logs`

Capabilities:

- list audit logs
- filter by action
- search by user/action/resource text
- review log details for accountability

## Frontend Data Layer

The frontend RBAC feature is organized into four main layers:

### Types

Defined in `web-app/lib/types/rbac.ts`.

These interfaces describe:

- departments
- roles
- permissions
- staff profiles
- audit log entries
- list query params
- create/update payloads

### Zod Schemas

Defined in `web-app/lib/schemas/rbac.schema.ts`.

These validate API responses at runtime before the UI consumes them.

### API Client

Defined in `web-app/lib/api/rbac.ts`.

This file wraps API calls for:

- departments
- roles
- permissions
- staff
- audit logs

### React Query Hooks

Defined in `web-app/lib/hooks/use-rbac.ts`.

These hooks expose query/mutation helpers to the admin pages and manage cache invalidation.

## Permission Model

There are two overlapping permission systems in the codebase:

1. Django/DRF endpoint permissions
2. frontend role/permission convenience checks

### API-Level Permissions

The backend uses DRF permission classes such as:

- `IsAuthenticated`
- `IsAdminUser`
- `AuditLogPermission`
- `RoleBasedPermission`
- `SensitiveAccessPermission`

Important current behavior:

- most RBAC resource listing endpoints are available to authenticated users
- mutating departments and roles requires admin/staff privileges through `IsAdminUser`
- staff creation and termination require admin/staff privileges through `IsAdminUser`
- audit log viewing is more restrictive than the rest of the admin area and is controlled separately by `AuditLogPermission`

### Frontend Permission Helpers

The web app also has client-side permission helpers such as `usePermissions()` for role-aware rendering.

These are useful for UX, but they are not a substitute for backend permission enforcement.

## Operational Workflows

### Department Management Workflow

1. Admin opens `/admin/departments`
2. Frontend loads paginated departments from `/api/departments/`
3. Admin creates or edits a department
4. Frontend submits to `/api/departments/` or `/api/departments/{id}/`
5. Department can optionally reference a parent department and a staff profile as department head

### Role Management Workflow

1. Admin opens `/admin/roles`
2. Frontend loads roles from `/api/roles/`
3. Frontend loads available Django permissions from `/api/permissions/`
4. Admin edits metadata and intended permissions for a role
5. Frontend submits the role payload to `/api/roles/` or `/api/roles/{id}/`

### Staff Onboarding Workflow

1. Admin opens `/admin/staff/new`
2. Optional DHA/HWR search pre-fills professional metadata
3. Frontend checks username availability with `/api/staff/check_username/`
4. Frontend requests username suggestions with `/api/staff/suggest_username/`
5. Frontend submits create payload to `/api/staff/`
6. Backend creates the Django user and linked staff profile

### Staff Maintenance Workflow

1. Admin opens `/admin/staff/{id}`
2. Frontend loads staff profile, department list, and role list
3. Admin updates assignment or professional metadata
4. Frontend submits patch to `/api/staff/{id}/`
5. Admin can terminate the staff record through delete, which performs soft termination

### Audit Review Workflow

1. Authorized user opens `/admin/audit-logs`
2. Frontend requests `/api/auditlogs/`
3. User filters by action or searches by text
4. UI renders audit rows with timestamp, user, action, resource, and details

## Known Gaps and Integration Risks

This section documents the current known issues so engineers do not assume the feature is fully normalized yet.

### 1. Backend and Frontend Contract Drift Exists

The RBAC/admin feature has active schema and payload drift between:

- backend serializers and models
- backend generated OpenAPI
- frontend TypeScript types and Zod schemas
- frontend admin page assumptions

This especially affects:

- department display fields and enum values
- role permission editing
- staff update payloads versus create payload aliases
- audit log action filtering and display fields

### 2. Audit Logs Are More Restricted Than the Rest of Admin

The audit log area is not governed exactly like departments, roles, and staff.

`AuditLogPermission` is currently the source of truth for audit-log access and should be reviewed carefully before assuming all admin users can see audit records.

### 3. Role Permission Editing Needs Careful Normalization

The backend role contract uses `permissions_matrix`, while the frontend role screens also consume flat Django permission entries from `/api/permissions/`.

Any engineer modifying this feature should explicitly define the mapping between:

- selected Django permissions in the UI
- stored `permissions_matrix` in the backend

### 4. Staff Update Semantics Differ From Staff Create Semantics

Create currently supports friendly aliases like `department`, `role`, and `hire_date` through the dedicated create serializer.

Update behavior is tied to the read/update staff serializer and should not be assumed to accept the same payload shape unless explicitly implemented.

### 5. Generated OpenAPI Does Not Fully Describe Actual Runtime Behavior

The generated schema has historically underrepresented some filter params and helper endpoint response shapes in this area.

When making contract-sensitive changes, verify against:

- serializer code
- viewset code
- runtime tests
- generated OpenAPI

not just one of those in isolation.

## Recommended Engineering Rules For This Feature

When extending or refactoring Admin/RBAC/Staff:

1. Treat backend model-backed fields and serializer fields as the canonical source unless a frontend enhancement clearly deserves backend support.
2. Prefer enhancing the backend when a useful display or alias field improves UX and is stable enough to belong in the API.
3. Remove frontend-only fields only when they are redundant, misleading, or unsupported by the domain model.
4. Keep create and update payload types separate for staff and any other entity with asymmetric serializers.
5. Validate every API response in the frontend with Zod.
6. Keep the generated OpenAPI in sync with the runtime API.
7. Add focused tests when changing permission behavior, serializer fields, or helper endpoint shapes.

## Suggested Validation Checklist

Before considering Admin/RBAC/Staff changes complete:

- backend RBAC tests pass
- serializer contract tests pass
- OpenAPI schema is regenerated
- frontend RBAC contract tests pass
- web-app type-check passes
- admin pages are manually exercised for create, edit, filter, and delete flows

## Related Documents

- `docs/sprint-1.1-1.2-track-c-rbac-deliverables.md`
- `docs/rbac-capability-plan.md`
- `docs/architecture-analysis-findings.md`
- `docs/dha-compliance.md`
- `docs/dpia.md`
- `docs/contract-testing-recommendations.md`

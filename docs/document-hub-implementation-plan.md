# Document Hub Implementation Plan

Feature name: **Document Hub**

Confirmed permission model:

- Share permissions: `VIEW`, `SIGN`
- Default permission on new share: `VIEW`

## 1. Objectives

1. Provide a single workspace where users can:
   - See all attributable documents (Mine)
   - See documents shared with them
   - Cryptographically sign eligible documents
   - Share documents with other users
2. Enforce authorization server-side for both viewing and signing shared documents.
3. Keep a complete audit trail of sharing and signature actions.

## 2. In-Scope Document Types (Initial)

From current signing registry:

- `LabResult`
- `Prescription`
- `Discharge`
- `RadiologyReport`
- `DiagnosticReport`
- `SickNote`
- `ClinicalReferral`

## 3. Functional Requirements

### 3.1 Document Hub Tabs

- `Mine`
- `Shared With Me`
- `Signed`
- `Pending Signature`

### 3.2 Core Actions

- Open document
- Sign document (if eligible)
- Share document with user (`VIEW` default)
- Revoke share

### 3.3 Permission Behavior

- `VIEW`: recipient can view/open in Document Hub.
- `SIGN`: recipient can view/open and sign if document state allows signing.
- Default share permission is `VIEW`.

### 3.4 Signature Eligibility

- User may sign if:
  - They are the attributable owner for the document type, or
  - They have an active `SIGN` share.
- Workflow/state restrictions still apply (for example, only finalized reports where applicable).

## 4. Backend Design

### 4.1 Data Model

Add `DocumentShare` in `backend/hmis/apps/core/models.py`.

Fields:

- `document_type` (restricted to supported types)
- `document_id`
- `shared_by` (FK User)
- `shared_with` (FK User)
- `permission` (`VIEW`/`SIGN`, default `VIEW`)
- `note` (optional)
- `expires_at` (nullable; phase 3 activation)
- `revoked_at` (nullable)
- `revoked_by` (nullable FK User)
- timestamps (`created_at`, `updated_at`)

Indexes/constraints:

- Index on `(document_type, document_id)`
- Index on `shared_with`
- Index on `shared_by`
- Prevent duplicate active shares for same `(document_type, document_id, shared_with)`

### 4.2 API Endpoints

Create Document Hub APIs in core app.

Recommended endpoints:

- `GET /api/core/document-hub/`
  - Filters: `tab`, `document_type`, `q`, pagination
- `POST /api/core/document-shares/`
  - Create share (default `permission=VIEW`)
- `GET /api/core/document-shares/`
  - List shares (scoped by user/role)
- `POST /api/core/document-shares/{id}/revoke/`
  - Revoke share
- Optional later: `PATCH /api/core/document-shares/{id}/`
  - Update permission `VIEW <-> SIGN`

### 4.3 Document Hub Response Shape

Normalized item shape should include:

- `document_type`, `document_id`
- `document_number`
- `title`
- `patient_name`
- `status`
- `owner_name`
- `is_signed`, `signed_at`
- `is_shared_with_me`, `share_permission`
- `shared_by_name`, `shared_at`
- `can_sign`

### 4.4 Signing Guard Hardening

Enhance signing path (`/api/core/signatures/sign/`) to enforce:

- owner attribution OR active `SIGN` share
- valid tenant/org scope
- valid workflow state

Return clear errors:

- `403` for permission denied
- `400` for invalid sign state

### 4.5 Audit Logging

Log events:

- document share create
- document share revoke
- document share permission update (if enabled)
- sign via shared permission
- denied sign attempts

## 5. Frontend Design

### 5.1 Route

Add page:

- `web-app/app/(dashboard)/document-hub/page.tsx`

### 5.2 Components

Suggested components:

- `web-app/components/document-hub/document-hub-page.tsx`
- `web-app/components/document-hub/document-hub-table.tsx`
- `web-app/components/document-hub/share-document-dialog.tsx`

### 5.3 UX Behavior

- Tabbed view: Mine, Shared With Me, Signed, Pending Signature
- Search by document number, patient, owner
- Filters by document type/status
- Actions per row: Open, Sign, Share, Revoke
- Show share badge (`VIEW`/`SIGN`) for shared items

### 5.4 Navigation and RBAC

Update:

- `web-app/lib/config/navigation.ts`
  - Add `Document Hub` nav entry (`/document-hub`)
- `web-app/lib/permissions/actions.ts`
  - Add action keys:
    - `core.view_document_hub`
    - `core.share_documents`
- Optional module mapping in `web-app/lib/permissions/constants.ts`

### 5.5 API/Types/Schemas

Add frontend API client surface (new file or extend security API):

- list hub items
- create share
- list shares
- revoke share

Add types/schemas:

- `DocumentHubItem`
- `DocumentShare`
- share request payloads

## 6. Attribution Mapping (Mine Tab)

Define and centralize attribution per document type:

- `Prescription` -> `prescribed_by`
- `DiagnosticReport` -> `issued_by`
- `RadiologyReport` -> `reported_by`
- `SickNote` -> `issued_by`
- `ClinicalReferral` -> `referred_by`
- `Discharge` -> `discharged_by`
- `LabResult` -> policy choice (`entered_by` or `verified_by`, or both via business rule)

## 7. Phase Plan

## Phase 1 - MVP

Goal: deliver core value quickly.

Backend:

- Add `DocumentShare` model + migration
- Implement create/list/revoke share APIs
- Implement `GET /api/core/document-hub/` for `mine` and `shared`
- Add signing authorization guard for `SIGN` shares

Frontend:

- Build `/document-hub` page
- Implement `Mine` and `Shared With Me` tabs
- Add share dialog with default `VIEW`
- Add sign action in hub rows
- Add nav item and permission gates

Tests:

- Model tests for share lifecycle
- API tests for mine/shared visibility
- API tests for `VIEW` vs `SIGN` signing behavior

Exit criteria:

- Shared docs appear in recipient hub
- `VIEW` cannot sign
- `SIGN` can sign (if document state permits)

## Phase 2 - Workflow Completion

Goal: complete tab experience and quality of use.

Backend:

- Add server-side tab filters for `signed` and `pending`
- Improve search/filter handling

Frontend:

- Add `Signed` and `Pending Signature` tabs
- Add stronger filtering/sorting UX
- Improve empty/error states and permission messaging

Tests:

- Tab correctness tests
- Search/filter tests
- Permission transition tests (`VIEW` -> `SIGN`)

Exit criteria:

- All four tabs fully operational and consistent with signature state

## Phase 3 - Governance and Scale

Goal: enterprise readiness.

Backend:

- Activate `expires_at` policy behavior
- Optional permission update endpoint
- Expanded audit reporting for share/sign activities
- Query optimization for high-volume orgs

Frontend:

- Share management view (active/revoked/expired)
- Optional notifications for new shares
- Optional bulk actions

Tests/ops:

- Performance tests for hub queries
- Security review for tenant leakage/privilege escalation

Exit criteria:

- Governed sharing lifecycle and stable performance at scale

## 8. Non-Functional Requirements

- Tenant-safe by default (organization/facility scope)
- Server-side authorization is authoritative
- Auditability for compliance
- Backward compatibility with existing document routes and signature flows

## 9. Risks and Mitigations

1. Cross-tenant leakage
   - Mitigation: strict tenant filters on all hub/share/sign queries.
2. Inconsistent attribution logic
   - Mitigation: central attribution map + unit tests per document type.
3. State mismatch for signing
   - Mitigation: enforce workflow checks server-side; do not trust UI only.
4. Aggregation performance
   - Mitigation: indexed fields, pagination, tab-scoped query strategy.

## 10. Acceptance Criteria (Final)

- Document Hub visible to authorized users.
- Mine tab shows attributable documents across supported types.
- Shared With Me shows active user-to-user shares.
- New shares default to `VIEW`.
- `VIEW` shares cannot sign.
- `SIGN` shares can sign if workflow state permits.
- Signed/Pending tabs reflect true cryptographic status.
- Share and sign events are audit logged.

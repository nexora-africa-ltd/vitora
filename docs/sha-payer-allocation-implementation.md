# SHA Payer Allocation Implementation

## Goal

Ensure all provided services are billed for SHA patients, then explicitly allocate each claim line between:

- SHA-covered amount
- Patient-payable amount
- Discount/waiver amount (with mandatory reason)

This prevents underbilling from line suppression and supports partial split now.

## Scope Implemented

- Full-stack payer allocation workflow for SHA claim items
- Submission/discharge blocking when allocation is pending
- Per-line allocation update API
- UI for allocation review and save actions
- Validation + audit behavior for discounts and split math

## Backend Changes

### Data Model

Updated `SHAClaimItem` in `backend/hmis/apps/billing/models.py` with:

- `sha_covered_amount` (Decimal)
- `patient_payable_amount` (Decimal)
- `discount_amount` (Decimal)
- `discount_reason` (Text)
- `discount_applied_by` (FK user)
- `discount_applied_at` (DateTime)
- `allocation_status` (`pending` | `resolved`)

Migration:

- `backend/hmis/apps/billing/migrations/0062_shaclaimitem_allocation_status_and_more.py`

### Validation Rules

In `SHAClaimItem.clean()`:

- No negative split amounts
- If `discount_amount > 0`, `discount_reason` is required
- Invariant enforced:
  - `sha_covered_amount + patient_payable_amount + discount_amount == claimed_amount`

In `SHAClaim.validate_for_submission()` (`backend/hmis/apps/billing/models.py`):

- Adds blocking error when any claim items have `allocation_status = pending`

### Allocation API

New endpoint in `backend/hmis/apps/billing/sha_views.py`:

- `POST /api/sha/claims/{claim_id}/items/{item_id}/allocation/`

Request body:

- `sha_covered_amount`
- `patient_payable_amount`
- `discount_amount`
- `discount_reason` (required when discount > 0)

Behavior:

- Validates decimal amounts
- Enforces discount reason
- Sets `allocation_status = resolved`
- Stamps discount audit fields when discount > 0
- Writes `AuditLog` action: `sha_claim_item_allocation_updated`

### Preview-Line Apply Behavior

In `ilm_apply_preview_lines` (`backend/hmis/apps/billing/sha_views.py`):

- Created lines are now marked `allocation_status = pending`
- Returns `allocation_pending_count` in response

### Discharge Guard

In `backend/hmis/apps/billing/sha_ilm_lifecycle_views.py`:

- Discharge blocks when pending allocations exist
- Returns HTTP 400 with:
  - `code: allocation_pending`
  - `pending_count`

## Frontend Changes

### Types and Schemas

Updated:

- `web-app/lib/types/sha.ts`
- `web-app/lib/schemas/sha.schema.ts`
- `web-app/lib/api/sha.ts`

Added claim item allocation fields and API method:

- `shaApi.updateClaimItemAllocation(...)`

### Workflow UI

Updated `web-app/components/billing/sha/ClaimILMPanel.tsx`:

- Adds pre-submit checklist item:
  - `Payer allocation resolved (SHA / patient / discount)`
- Adds allocation review panel when pending items exist
- Per-line inputs for:
  - SHA covered
  - Patient payable
  - Discount/waiver
  - Discount reason
- `Save allocation` action calls backend endpoint
- Refreshes claim on success

### Response Messaging

`ilmApplyPreviewLines` response type now includes:

- `allocation_pending_count`

Used in success feedback to inform operator that allocation review is still required.

## Operational Flow

1. Preview lines are applied locally.
2. New claim lines are created with `allocation_status = pending`.
3. Operator resolves each line split in Workflow -> Lifecycle panel.
4. Once all lines are resolved, checklist clears.
5. Submit/discharge proceeds; if unresolved lines remain, backend blocks.

## Test Coverage Added/Updated

`backend/tests/billing/test_api/test_sha_uat_compliance.py`:

- apply-preview-lines returns pending allocation count
- allocation endpoint requires discount reason
- allocation endpoint supports partial split and resolves line
- discharge blocked when allocations are pending

Also verified existing discharge/lifecycle and SHA suites still pass in targeted runs.

## Notes

- This implementation enforces mandatory discount reason at server level (not UI-only).
- Outpatient and inpatient follow the same allocation policy via shared claim validation.
- Existing claim line capture is preserved; suppression logic is replaced by explicit payer split handling.

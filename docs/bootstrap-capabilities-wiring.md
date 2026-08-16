<!--
File purpose: Documents capability/bootstrap wiring across Inventory, Pharmacy, and Billing Invoice routes.
How to use: Read before adding or modifying dashboard pages that depend on module flags, catalog sources, or capability gates.
Inputs: Bootstrap payloads from /api/inventory/bootstrap/ and /api/pharmacy/bootstrap/.
-->

# Bootstrap Capabilities Wiring

## What this feature does

Vitora now exposes facility-aware capability bootstrap payloads for module-level and action-level gating in the frontend.

- Inventory bootstrap: `GET /api/inventory/bootstrap/`
- Pharmacy bootstrap: `GET /api/pharmacy/bootstrap/`
- Compact subset embedded in key list endpoints:
  - Inventory stock counts list includes `capabilities`
  - Pharmacy prescriptions list includes `capabilities`

The frontend uses these payloads to:

- gate routes and actions when a module is disabled,
- show capability badges and read-only states,
- align item source and pricing behavior with backend-configured sources,
- keep behavior consistent across dashboard pages.

## Backend payload shape (high level)

Both bootstrap endpoints include:

- `tenant_scope`
- `modules`
- `permissions`
- `catalog_sources`
- `realtime`
- `meta`

Inventory-specific values include:

- `inventory_enabled`
- `catalog_sources.invoice_item_source`
- `catalog_sources.order_item_source`
- `catalog_sources.unified_pricing_enabled`

Pharmacy-specific values include:

- `pharmacy_enabled`
- `catalog_sources.dispense_item_source`
- `catalog_sources.pricing_source`
- `catalog_sources.unified_pricing_enabled`

## Frontend wiring implemented

### Route-level capability gates

These layouts now enforce module availability for entire route trees:

- `web-app/app/(dashboard)/inventory/layout.tsx`
- `web-app/app/(dashboard)/pharmacy/layout.tsx`
- `web-app/app/(dashboard)/transactions/invoices/layout.tsx`

Gate components:

- `web-app/app/(dashboard)/inventory/capability-gate.tsx`
- `web-app/app/(dashboard)/pharmacy/capability-gate.tsx`
- `web-app/app/(dashboard)/transactions/invoices/capability-gate.tsx`

### Action-level and form-level wiring

Additional capability checks and form behavior were applied in key action pages:

- `web-app/app/(dashboard)/pharmacy/prescriptions/new/page.tsx`
- `web-app/app/(dashboard)/pharmacy/drugs/new/page.tsx`
- `web-app/app/(dashboard)/pharmacy/drugs/[id]/edit/page.tsx`
- `web-app/app/(dashboard)/pharmacy/stock/adjustments/page.tsx`
- `web-app/app/(dashboard)/inventory/purchase-orders/new/page.tsx`
- `web-app/app/(dashboard)/inventory/goods-receipt/new/page.tsx`
- `web-app/app/(dashboard)/inventory/transfers/new/page.tsx`
- `web-app/app/(dashboard)/inventory/suppliers/new/page.tsx`
- `web-app/app/(dashboard)/inventory/store-locations/new/page.tsx`
- `web-app/app/(dashboard)/transactions/invoices/page.tsx`
- `web-app/app/(dashboard)/transactions/invoices/[id]/page.tsx`
- `web-app/app/(dashboard)/transactions/invoices/new/page.tsx`
- `web-app/components/billing/InvoiceForm.tsx`

## Item source and pricing alignment

Invoice form behavior is aligned to backend-supported source sets:

- Supported source values: `services`, `catalogs`
- Unknown values normalize to `services`
- Pricing mode respects `unified_pricing_enabled`

When unified pricing is enabled, relevant unit-price fields are disabled to prevent manual divergence.

## Implementation guidance for future pages

When adding a new page under Inventory, Pharmacy, or Invoice routes:

1. Consume bootstrap data from the section gate or query cache key:
   - `['inventory-bootstrap']`
   - `['pharmacy-bootstrap']`
2. Gate write actions by both RBAC and capability flags.
3. Reflect capability state in UI (disabled controls, badges, or informational alerts).
4. Keep payload validation schema-first (Zod + `parseResponse`).

## Verification

Primary frontend verification command:

```bash
cd web-app
npx tsc --noEmit
```

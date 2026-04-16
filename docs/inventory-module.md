# Inventory Module — Single Source of Truth

> **Last Updated**: April 16, 2026
> **Module Path**: `backend/hmis/apps/inventory/`
> **Total LOC**: ~5,700 (models 1735 + serializers 1224 + views 846 + services 808 + admin 464 + signals 236 + filters 188 + tasks 147 + urls 41)
> **Tests**: 292 across 17 test files in `tests/inventory/`
> **Migrations**: 5 (0001–0005)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Architecture & Phasing](#2-architecture--phasing)
3. [Data Models](#3-data-models)
4. [Enums / TextChoices](#4-enums--textchoices)
5. [Auto-Number Generators](#5-auto-number-generators)
6. [API Endpoints](#6-api-endpoints)
7. [Serializers](#7-serializers)
8. [Filters](#8-filters)
9. [Services](#9-services)
10. [Celery Tasks](#10-celery-tasks)
11. [Management Commands](#11-management-commands)
12. [Domain Events](#12-domain-events)
13. [Admin Configuration](#13-admin-configuration)
14. [Test Coverage](#14-test-coverage)
15. [Key Workflows](#15-key-workflows)
16. [Integration Points](#16-integration-points)

---

## 1. Module Overview

The Inventory module manages the complete supply chain for a healthcare facility:

- **Procurement** — Supplier catalog, purchase orders with approval workflow, goods receipt
- **Multi-store distribution** — Named store locations, inter-facility stock transfers
- **Ward-level stock** — Par-level management, consume/replenish/return actions
- **Stock reconciliation** — Cycle counts with generate → count → approve workflow
- **Tax compliance** — KRA eTIMS integration for fiscal invoicing (Kenya)
- **Demand forecasting** — Consumption aggregation, moving average / exponential smoothing forecasts, automated reorder suggestions

### Tenant Scoping

| Scope | Models | Why |
|-------|--------|-----|
| **Organization** | `Supplier`, `StockTransfer` | Suppliers shared across facilities; transfers cross facility boundaries |
| **Facility** | `PurchaseOrder`, `GoodsReceiptNote`, `StoreLocation`, `WardStock`, `StockCount`, `ETIMSConfig`, `ETIMSInvoice`, `ConsumptionRecord`, `DemandForecast`, `ReorderSuggestion` | Procurement, stock, and forecasting are per-facility |
| **Unscoped** | `PurchaseOrderItem`, `GRNItem`, `TransferItem`, `WardStockTransaction`, `StockCountItem`, `ETIMSItem` | Child records — scoped via parent FK chain |

---

## 2. Architecture & Phasing

The module was built across 6 phases:

| Phase | Sprint | Focus | Models Added |
|-------|--------|-------|--------------|
| **1** | Procurement Foundation | Suppliers, POs, GRNs | `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceiptNote`, `GRNItem` |
| **2** | Multi-store Transfers | Named stores, inter-facility transfers | `StoreLocation`, `StockTransfer`, `TransferItem` |
| **3** | Ward Stock | Ward-level par management | `WardStock`, `WardStockTransaction` |
| **4** | Cycle Counting | Stock reconciliation | `StockCount`, `StockCountItem` |
| **5** | KRA eTIMS | Tax compliance | `ETIMSConfig`, `ETIMSInvoice`, `ETIMSItem` |
| **6** | Demand Forecasting | Predictive analytics | `ConsumptionRecord`, `DemandForecast`, `ReorderSuggestion` |

---

## 3. Data Models

### 3.1 Supplier

> **File**: `models.py` | **Scope**: `OrganizationScopedModel` | **Migration**: 0001

Vendor/manufacturer in the procurement chain. Shared across all facilities in an org.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `code` | `CharField(50)` | Unique per org | e.g. `SUP-001` |
| `name` | `CharField(255)` | Required | |
| `supplier_type` | `CharField(20)` | `SupplierType` choices | Default: `DISTRIBUTOR` |
| `contact_person` | `CharField(200)` | Blank OK | |
| `email` | `EmailField` | Blank OK | |
| `phone` | `CharField(30)` | Blank OK | |
| `address` | `TextField` | Blank OK | |
| `tax_pin` | `CharField(20)` | Blank OK | KRA PIN |
| `payment_terms` | `CharField(100)` | Blank OK | e.g. "Net 30" |
| `lead_time_days` | `PositiveIntegerField` | Default: 7 | Avg delivery days |
| `rating` | `DecimalField(3,2)` | Default: 0 | 0.00–5.00 |
| `is_active` | `BooleanField` | Default: True | |
| `notes` | `TextField` | Blank OK | |

**Constraints**: `UniqueConstraint(["organization", "code"])` — `unique_supplier_code_per_org`

---

### 3.2 PurchaseOrder

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0001

Procurement request with 6-state approval workflow.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `po_number` | `CharField(30)` | Unique, auto-gen, read-only | `PO-YYYYMMDD-XXXX` |
| `supplier` | `FK → Supplier` | PROTECT | |
| `status` | `CharField(25)` | `PurchaseOrderStatus` choices | Default: `DRAFT` |
| `ordered_by` | `FK → User` | PROTECT | |
| `approved_by` | `FK → User` | SET_NULL, nullable | |
| `order_date` | `DateField` | Default: `timezone.now` | |
| `expected_delivery_date` | `DateField` | Nullable | |
| `approved_at` | `DateTimeField` | Nullable | |
| `cancelled_at` | `DateTimeField` | Nullable | |
| `notes` | `TextField` | Blank OK | |
| `cancellation_reason` | `TextField` | Blank OK | |

**Properties**: `total_amount`, `is_fully_received`

**State Machine**:
```
DRAFT → submit() → SUBMITTED → approve(user) → APPROVED
                                                    ↓
                                          update_receipt_status()
                                          ↙                ↘
                              PARTIALLY_RECEIVED       RECEIVED

Any non-terminal → cancel(user, reason) → CANCELLED
```

**Custom Permission**: `approve_purchase_order`

---

### 3.3 PurchaseOrderItem

> **File**: `models.py` | **Scope**: Unscoped (child of PO) | **Migration**: 0001

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `purchase_order` | `FK → PurchaseOrder` | CASCADE | related_name: `items` |
| `drug` | `FK → pharmacy.Drug` | PROTECT | |
| `quantity_ordered` | `PositiveIntegerField` | Required | |
| `quantity_received` | `PositiveIntegerField` | Default: 0 | Updated on GRN confirm |
| `unit_cost` | `DecimalField(10,2)` | Required | |
| `notes` | `CharField(255)` | Blank OK | |

**Properties**: `line_total`, `is_fully_received`, `outstanding_quantity`

---

### 3.4 GoodsReceiptNote

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0001

Record of physically receiving goods. Confirming creates `StockBatch` records.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `grn_number` | `CharField(30)` | Unique, auto-gen, read-only | `GRN-YYYYMMDD-XXXX` |
| `purchase_order` | `FK → PurchaseOrder` | SET_NULL, nullable | Null for ad-hoc receipts |
| `supplier` | `FK → Supplier` | PROTECT | |
| `status` | `CharField(15)` | `GRNStatus` choices | Default: `DRAFT` |
| `received_by` | `FK → User` | PROTECT | |
| `received_date` | `DateField` | Default: `timezone.now` | |
| `delivery_note_number` | `CharField(50)` | Blank OK | |
| `invoice_number` | `CharField(50)` | Blank OK | |
| `notes` | `TextField` | Blank OK | |
| `confirmed_at` | `DateTimeField` | Nullable | |
| `confirmed_by` | `FK → User` | SET_NULL, nullable | |

**Properties**: `total_items`, `total_amount`

**State Machine**:
```
DRAFT → confirm(user) → CONFIRMED    (creates StockBatch per item, updates PO quantities)
DRAFT → cancel()      → CANCELLED
```

---

### 3.5 GRNItem

> **File**: `models.py` | **Scope**: Unscoped (child of GRN) | **Migration**: 0001

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `grn` | `FK → GoodsReceiptNote` | CASCADE | related_name: `items` |
| `drug` | `FK → pharmacy.Drug` | PROTECT | |
| `po_item` | `FK → PurchaseOrderItem` | SET_NULL, nullable | |
| `batch_number` | `CharField(100)` | Required | |
| `expiry_date` | `DateField` | Required | |
| `manufacture_date` | `DateField` | Nullable | |
| `quantity_received` | `PositiveIntegerField` | Required | |
| `cost_price` | `DecimalField(10,2)` | Required | |
| `selling_price` | `DecimalField(10,2)` | Required | |
| `location` | `CharField(100)` | Blank OK | Shelf/bin |
| `notes` | `CharField(255)` | Blank OK | |
| `stock_batch` | `FK → pharmacy.StockBatch` | SET_NULL, nullable | Set on GRN confirm |

**Properties**: `line_total`

---

### 3.6 StoreLocation

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0002

Named storage location within a facility (main store, satellite pharmacy, ward store, etc.).

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `code` | `CharField(50)` | Required | |
| `name` | `CharField(255)` | Required | |
| `location_type` | `CharField(25)` | `StoreLocationType` choices | Default: `MAIN_STORE` |
| `is_active` | `BooleanField` | Default: True | |
| `managed_by` | `FK → User` | SET_NULL, nullable | |
| `notes` | `TextField` | Blank OK | |

**Constraints**: `UniqueConstraint(["facility", "code"])` — `unique_store_code_per_facility`

---

### 3.7 StockTransfer

> **File**: `models.py` | **Scope**: `OrganizationScopedModel` | **Migration**: 0002

Inter-facility or inter-store stock transfer with 6-state lifecycle.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `transfer_number` | `CharField(30)` | Unique, auto-gen | `TRF-YYYYMMDD-XXXX` |
| `source_facility` | `FK → core.Facility` | PROTECT | |
| `source_store` | `FK → StoreLocation` | SET_NULL, nullable | |
| `destination_facility` | `FK → core.Facility` | PROTECT | |
| `destination_store` | `FK → StoreLocation` | SET_NULL, nullable | |
| `status` | `CharField(15)` | `TransferStatus` choices | Default: `DRAFT` |
| `requested_by` | `FK → User` | PROTECT | |
| `approved_by` | `FK → User` | SET_NULL, nullable | |
| `dispatched_by` | `FK → User` | SET_NULL, nullable | |
| `received_by` | `FK → User` | SET_NULL, nullable | |
| `request_date` | `DateField` | Default: `timezone.now` | |
| `approved_at` | `DateTimeField` | Nullable | |
| `dispatched_at` | `DateTimeField` | Nullable | |
| `received_at` | `DateTimeField` | Nullable | |
| `cancelled_at` | `DateTimeField` | Nullable | |
| `notes` | `TextField` | Blank OK | |
| `cancellation_reason` | `TextField` | Blank OK | |

**Properties**: `total_items` (count), `total_quantity` (sum)

**State Machine**:
```
DRAFT → submit() → REQUESTED → approve(user) → APPROVED → dispatch(user) → IN_TRANSIT → receive(user) → RECEIVED

DRAFT/REQUESTED/APPROVED → cancel(user, reason) → CANCELLED
IN_TRANSIT/RECEIVED → cannot cancel
```

**Validation**: `source_facility != destination_facility` (enforced in `clean()`)

---

### 3.8 TransferItem

> **File**: `models.py` | **Scope**: Unscoped (child of StockTransfer) | **Migration**: 0002

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `transfer` | `FK → StockTransfer` | CASCADE | related_name: `items` |
| `drug` | `FK → pharmacy.Drug` | PROTECT | |
| `batch` | `FK → pharmacy.StockBatch` | PROTECT | |
| `quantity` | `PositiveIntegerField` | Required | |
| `notes` | `CharField(255)` | Blank OK | |

---

### 3.9 WardStock

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0003

Par-level ward stock management.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `store_location` | `FK → StoreLocation` | CASCADE | |
| `drug` | `FK → pharmacy.Drug` | PROTECT | |
| `ward` | `FK → inpatient.Ward` | SET_NULL, nullable | |
| `quantity_available` | `PositiveIntegerField` | Default: 0 | |
| `par_level` | `PositiveIntegerField` | Default: 0 | Minimum stock |
| `max_level` | `PositiveIntegerField` | Default: 0 | Maximum stock |
| `last_replenished_at` | `DateTimeField` | Nullable | |
| `last_counted_at` | `DateTimeField` | Nullable | |

**Properties**: `is_below_par`, `is_above_max`, `reorder_quantity`

**Constraints**: `UniqueConstraint(["facility", "store_location", "drug"])` — `unique_ward_stock_per_store_drug`

---

### 3.10 WardStockTransaction

> **File**: `models.py` | **Scope**: Unscoped (child of WardStock) | **Migration**: 0003

Immutable ledger of ward stock movements.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `ward_stock` | `FK → WardStock` | CASCADE | related_name: `transactions` |
| `transaction_type` | `CharField(15)` | `WardTransactionType` choices | |
| `quantity` | `IntegerField` | Required | Signed: positive for in, negative for out |
| `performed_by` | `FK → User` | PROTECT | |
| `notes` | `CharField(255)` | Blank OK | |
| `reference` | `CharField(100)` | Blank OK | e.g. patient MRN, transfer # |
| `created_at` | `DateTimeField` | Auto | |

---

### 3.11 StockCount

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0003

Stock reconciliation cycle count with multi-step workflow.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `count_number` | `CharField(30)` | Unique, auto-gen | `CNT-YYYYMMDD-XXXX` |
| `count_type` | `CharField(15)` | `StockCountType` choices | FULL, PARTIAL, SPOT |
| `store_location` | `FK → StoreLocation` | PROTECT | |
| `status` | `CharField(15)` | `StockCountStatus` choices | Default: `DRAFT` |
| `started_by` | `FK → User` | PROTECT | |
| `approved_by` | `FK → User` | SET_NULL, nullable | |
| `started_at` | `DateTimeField` | Nullable | |
| `completed_at` | `DateTimeField` | Nullable | |
| `approved_at` | `DateTimeField` | Nullable | |
| `notes` | `TextField` | Blank OK | |

**State Machine**:
```
DRAFT → generate_items() → (populates StockCountItems from StockBatch)
      → start()          → IN_PROGRESS
      → complete()        → COMPLETED
      → approve(user)     → APPROVED  (creates StockAdjustments for variances)
      → cancel()          → CANCELLED
```

---

### 3.12 StockCountItem

> **File**: `models.py` | **Scope**: Unscoped (child of StockCount) | **Migration**: 0003

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `stock_count` | `FK → StockCount` | CASCADE | related_name: `items` |
| `drug` | `FK → pharmacy.Drug` | PROTECT | |
| `batch` | `FK → pharmacy.StockBatch` | SET_NULL, nullable | |
| `system_quantity` | `PositiveIntegerField` | Default: 0 | Snapshot at count start |
| `counted_quantity` | `PositiveIntegerField` | Nullable | Staff enters this |
| `variance` | `IntegerField` | Default: 0 | `counted - system` |
| `notes` | `CharField(255)` | Blank OK | |

**Constraints**: `UniqueConstraint(["stock_count", "drug", "batch"])` — `unique_count_item_per_drug_batch`

---

### 3.13 ETIMSConfig

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0004

KRA eTIMS configuration per facility.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `device_serial` | `CharField(100)` | Required | eTIMS device serial |
| `environment` | `CharField(15)` | SANDBOX / PRODUCTION | Default: `SANDBOX` |
| `api_url` | `URLField` | Required | KRA eTIMS endpoint |
| `api_key` | `CharField(255)` | Required | Encrypted at rest |
| `tin` | `CharField(20)` | Required | Taxpayer ID Number |
| `bhf_id` | `CharField(10)` | Default: "00" | Branch ID |
| `is_active` | `BooleanField` | Default: True | |
| `last_sync_at` | `DateTimeField` | Nullable | |

---

### 3.14 ETIMSInvoice

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0004

KRA eTIMS fiscal invoice record with submission lifecycle.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `invoice` | `FK → billing.Invoice` | PROTECT | related_name: `etims_invoices` |
| `status` | `CharField(15)` | `ETIMSInvoiceStatus` choices | Default: `PENDING` |
| `scu_number` | `CharField(100)` | Blank OK | SCU control number from KRA |
| `internal_data` | `CharField(255)` | Blank OK | Internal reference |
| `receipt_signature` | `CharField(500)` | Blank OK | Digital signature from KRA |
| `submitted_at` | `DateTimeField` | Nullable | |
| `confirmed_at` | `DateTimeField` | Nullable | |
| `error_message` | `TextField` | Blank OK | |
| `retry_count` | `PositiveIntegerField` | Default: 0 | |
| `raw_request` | `JSONField` | Nullable | Sent payload |
| `raw_response` | `JSONField` | Nullable | KRA response |

**Methods**: `mark_submitted(scu_number)`, `mark_confirmed(receipt_signature)`, `mark_failed(error)`, `mark_cancelled()`

**State Machine**:
```
PENDING → mark_submitted() → SUBMITTED → mark_confirmed() → CONFIRMED
                           ↘ mark_failed()   → FAILED (retryable)
PENDING/FAILED → mark_cancelled() → CANCELLED
```

---

### 3.15 ETIMSItem

> **File**: `models.py` | **Scope**: Unscoped (child of ETIMSInvoice) | **Migration**: 0004

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `etims_invoice` | `FK → ETIMSInvoice` | CASCADE | related_name: `items` |
| `item_code` | `CharField(100)` | Required | KRA item classification |
| `item_name` | `CharField(255)` | Required | |
| `quantity` | `DecimalField(12,2)` | Required | |
| `unit_price` | `DecimalField(12,2)` | Required | |
| `tax_amount` | `DecimalField(12,2)` | Default: 0 | |
| `total_amount` | `DecimalField(12,2)` | Required | |

---

### 3.16 ConsumptionRecord

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0005

Aggregated consumption data for a drug over a period. Auto-generated from `Dispensing` and `StockAdjustment` records.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `drug` | `FK → pharmacy.Drug` | PROTECT | related_name: `consumption_records` |
| `period_start` | `DateField` | Required | |
| `period_end` | `DateField` | Required | |
| `quantity_dispensed` | `DecimalField(12,2)` | Default: 0 | |
| `quantity_transferred` | `DecimalField(12,2)` | Default: 0 | Net (out - in) |
| `quantity_adjusted` | `DecimalField(12,2)` | Default: 0 | Damage, loss, expiry |

**Properties**: `total_consumption` (dispensed + adjusted), `average_daily_consumption`

**Constraints**: `UniqueConstraint(["facility", "drug", "period_start", "period_end"])` — `unique_consumption_per_drug_period`

---

### 3.17 DemandForecast

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0005

Predicted demand for a drug over a future period. Generated by the forecasting service.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `drug` | `FK → pharmacy.Drug` | PROTECT | related_name: `demand_forecasts` |
| `forecast_date` | `DateField` | Required | Date generated |
| `period_months` | `PositiveIntegerField` | Default: 3 | Horizon (3, 6, 12) |
| `predicted_demand` | `DecimalField(12,2)` | Required | |
| `confidence_lower` | `DecimalField(12,2)` | Nullable | 95% CI lower bound |
| `confidence_upper` | `DecimalField(12,2)` | Nullable | 95% CI upper bound |
| `method` | `CharField(25)` | `ForecastMethod` choices | Default: `MOVING_AVERAGE` |
| `reorder_point` | `DecimalField(12,2)` | Nullable | Lead-time demand + safety stock |
| `suggested_order_quantity` | `DecimalField(12,2)` | Nullable | |
| `generated_by` | `FK → User` | SET_NULL, nullable | Null for system-generated |

---

### 3.18 ReorderSuggestion

> **File**: `models.py` | **Scope**: `FacilityScopedModel` | **Migration**: 0005

Suggested reorder based on forecast vs current stock. Can be converted to a PurchaseOrder.

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `drug` | `FK → pharmacy.Drug` | PROTECT | related_name: `reorder_suggestions` |
| `supplier` | `FK → Supplier` | SET_NULL, nullable | Preferred supplier |
| `current_stock` | `DecimalField(12,2)` | Required | Snapshot at generation |
| `reorder_point` | `DecimalField(12,2)` | Required | |
| `suggested_quantity` | `DecimalField(12,2)` | Required | |
| `urgency` | `CharField(10)` | `ReorderUrgency` choices | Default: `MEDIUM` |
| `status` | `CharField(18)` | `ReorderStatus` choices | Default: `PENDING` |
| `purchase_order` | `FK → PurchaseOrder` | SET_NULL, nullable | Set on conversion |

**Methods**: `dismiss()`, `mark_converted(purchase_order)`

---

## 4. Enums / TextChoices

| Enum | Values | Used By |
|------|--------|---------|
| `SupplierType` | `MANUFACTURER`, `DISTRIBUTOR`, `WHOLESALER`, `GOVERNMENT` | `Supplier.supplier_type` |
| `PurchaseOrderStatus` | `DRAFT`, `SUBMITTED`, `APPROVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED` | `PurchaseOrder.status` |
| `GRNStatus` | `DRAFT`, `CONFIRMED`, `CANCELLED` | `GoodsReceiptNote.status` |
| `StoreLocationType` | `MAIN_STORE`, `SATELLITE_PHARMACY`, `WARD_STORE`, `THEATRE_STORE`, `LAB_STORE` | `StoreLocation.location_type` |
| `TransferStatus` | `DRAFT`, `REQUESTED`, `APPROVED`, `IN_TRANSIT`, `RECEIVED`, `CANCELLED` | `StockTransfer.status` |
| `WardTransactionType` | `CONSUME`, `REPLENISH`, `RETURN`, `ADJUSTMENT` | `WardStockTransaction.transaction_type` |
| `StockCountType` | `FULL`, `PARTIAL`, `SPOT` | `StockCount.count_type` |
| `StockCountStatus` | `DRAFT`, `IN_PROGRESS`, `COMPLETED`, `APPROVED`, `CANCELLED` | `StockCount.status` |
| `ETIMSEnvironment` | `SANDBOX`, `PRODUCTION` | `ETIMSConfig.environment` |
| `ETIMSInvoiceStatus` | `PENDING`, `SUBMITTED`, `CONFIRMED`, `FAILED`, `CANCELLED` | `ETIMSInvoice.status` |
| `ForecastMethod` | `MOVING_AVERAGE`, `EXPONENTIAL_SMOOTHING`, `SEASONAL` | `DemandForecast.method` |
| `ReorderUrgency` | `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` | `ReorderSuggestion.urgency` |
| `ReorderStatus` | `PENDING`, `CONVERTED_TO_PO`, `DISMISSED` | `ReorderSuggestion.status` |

---

## 5. Auto-Number Generators

| Function | Pattern | Model |
|----------|---------|-------|
| `generate_po_number()` | `PO-YYYYMMDD-XXXX` | `PurchaseOrder.po_number` |
| `generate_grn_number()` | `GRN-YYYYMMDD-XXXX` | `GoodsReceiptNote.grn_number` |
| `generate_transfer_number()` | `TRF-YYYYMMDD-XXXX` | `StockTransfer.transfer_number` |
| `generate_count_number()` | `CNT-YYYYMMDD-XXXX` | `StockCount.count_number` |

All use date-based prefix + sequential 4-digit suffix, querying the latest record with that prefix.

---

## 6. API Endpoints

**Base URL**: `/api/inventory/`

### 6.1 Suppliers — `/api/inventory/suppliers/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/suppliers/` | List | Org-scoped, filterable |
| `POST` | `/suppliers/` | Create | |
| `GET` | `/suppliers/{id}/` | Retrieve | |
| `PATCH` | `/suppliers/{id}/` | Partial update | |
| `DELETE` | `/suppliers/{id}/` | Destroy | |
| `POST` | `/suppliers/{id}/toggle_active/` | Toggle active | Flips `is_active` |

**ViewSet**: `SupplierViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `organization`
**Filter**: `SupplierFilter`

### 6.2 Purchase Orders — `/api/inventory/purchase-orders/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/purchase-orders/` | List | Facility-scoped |
| `POST` | `/purchase-orders/` | Create | Nested items |
| `GET` | `/purchase-orders/{id}/` | Retrieve | Includes nested items |
| `PATCH` | `/purchase-orders/{id}/` | Partial update | DRAFT only |
| `DELETE` | `/purchase-orders/{id}/` | Destroy | DRAFT only |
| `POST` | `/purchase-orders/{id}/submit/` | Submit | DRAFT → SUBMITTED |
| `POST` | `/purchase-orders/{id}/approve/` | Approve | SUBMITTED → APPROVED |
| `POST` | `/purchase-orders/{id}/cancel/` | Cancel | Any non-terminal → CANCELLED |
| `GET` | `/purchase-orders/{id}/items/` | List items | Read-only items sub-list |

**ViewSet**: `PurchaseOrderViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`
**Filter**: `PurchaseOrderFilter`

### 6.3 Goods Receipts — `/api/inventory/goods-receipts/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/goods-receipts/` | List | Facility-scoped |
| `POST` | `/goods-receipts/` | Create | Nested items |
| `GET` | `/goods-receipts/{id}/` | Retrieve | |
| `PATCH` | `/goods-receipts/{id}/` | Partial update | |
| `POST` | `/goods-receipts/{id}/confirm/` | Confirm | Creates StockBatches, updates PO |
| `POST` | `/goods-receipts/{id}/cancel_grn/` | Cancel | DRAFT only |
| `GET` | `/goods-receipts/by_purchase_order/?po={id}` | Filter by PO | |

**ViewSet**: `GoodsReceiptNoteViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`
**Filter**: `GoodsReceiptNoteFilter`

### 6.4 Store Locations — `/api/inventory/store-locations/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/store-locations/` | List | Facility-scoped |
| `POST` | `/store-locations/` | Create | |
| `GET` | `/store-locations/{id}/` | Retrieve | |
| `PATCH` | `/store-locations/{id}/` | Partial update | |
| `DELETE` | `/store-locations/{id}/` | Destroy | |

**ViewSet**: `StoreLocationViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`
**Filter**: `StoreLocationFilter`

### 6.5 Stock Transfers — `/api/inventory/transfers/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/transfers/` | List | Org-scoped |
| `POST` | `/transfers/` | Create | Nested items |
| `GET` | `/transfers/{id}/` | Retrieve | |
| `PATCH` | `/transfers/{id}/` | Partial update | |
| `POST` | `/transfers/{id}/submit/` | Submit | DRAFT → REQUESTED |
| `POST` | `/transfers/{id}/approve/` | Approve | REQUESTED → APPROVED |
| `POST` | `/transfers/{id}/dispatch_transfer/` | Dispatch | APPROVED → IN_TRANSIT |
| `POST` | `/transfers/{id}/receive/` | Receive | IN_TRANSIT → RECEIVED |
| `POST` | `/transfers/{id}/cancel/` | Cancel | DRAFT/REQUESTED/APPROVED → CANCELLED |
| `GET` | `/transfers/{id}/items/` | List items | |

**ViewSet**: `StockTransferViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `organization`
**Filter**: `StockTransferFilter`

### 6.6 Ward Stock — `/api/inventory/ward-stock/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/ward-stock/` | List | Facility-scoped |
| `POST` | `/ward-stock/` | Create | |
| `GET` | `/ward-stock/{id}/` | Retrieve | |
| `PATCH` | `/ward-stock/{id}/` | Partial update | |
| `POST` | `/ward-stock/{id}/consume/` | Consume | Decreases quantity, logs transaction |
| `POST` | `/ward-stock/{id}/replenish/` | Replenish | Increases quantity, logs transaction |
| `POST` | `/ward-stock/{id}/return_to_store/` | Return | Decreases quantity, logs return |

**ViewSet**: `WardStockViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`
**Filter**: `WardStockFilter`

### 6.7 Ward Transactions — `/api/inventory/ward-transactions/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/ward-transactions/` | List | Read-only |

**ViewSet**: `WardStockTransactionViewSet` — `TenantScopedViewMixin`, `ReadOnlyModelViewSet`

### 6.8 Stock Counts — `/api/inventory/stock-counts/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/stock-counts/` | List | Facility-scoped |
| `POST` | `/stock-counts/` | Create | |
| `GET` | `/stock-counts/{id}/` | Retrieve | Nested items |
| `POST` | `/stock-counts/{id}/generate_items/` | Generate items | Populates from StockBatch |
| `POST` | `/stock-counts/{id}/start/` | Start | DRAFT → IN_PROGRESS |
| `POST` | `/stock-counts/{id}/complete/` | Complete | IN_PROGRESS → COMPLETED |
| `POST` | `/stock-counts/{id}/approve/` | Approve | COMPLETED → APPROVED (creates adjustments) |
| `POST` | `/stock-counts/{id}/cancel/` | Cancel | → CANCELLED |
| `GET/PATCH` | `/stock-counts/{id}/item_detail/?item_id={id}` | Item detail | Update counted_quantity |

**ViewSet**: `StockCountViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`

### 6.9 eTIMS Config — `/api/inventory/etims-config/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/etims-config/` | List | Facility-scoped |
| `POST` | `/etims-config/` | Create | |
| `GET` | `/etims-config/{id}/` | Retrieve | |
| `PATCH` | `/etims-config/{id}/` | Partial update | |
| `POST` | `/etims-config/{id}/test_connection/` | Test | Validates KRA API connectivity |

**ViewSet**: `ETIMSConfigViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`

### 6.10 eTIMS Invoices — `/api/inventory/etims-invoices/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/etims-invoices/` | List | Facility-scoped |
| `POST` | `/etims-invoices/` | Create | Links to billing.Invoice |
| `GET` | `/etims-invoices/{id}/` | Retrieve | Nested items |
| `POST` | `/etims-invoices/{id}/submit/` | Submit | Triggers async Celery task |
| `POST` | `/etims-invoices/{id}/retry/` | Retry | FAILED → re-submit |
| `POST` | `/etims-invoices/{id}/cancel/` | Cancel | PENDING/FAILED → CANCELLED |

**ViewSet**: `ETIMSInvoiceViewSet` — `TenantScopedViewMixin`, `ReadOnCreateMixin`, `ModelViewSet`
**Tenant scope**: `facility`

### 6.11 Consumption Records — `/api/inventory/consumption/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/consumption/` | List | Facility-scoped, read-only |
| `GET` | `/consumption/{id}/` | Retrieve | |

**ViewSet**: `ConsumptionRecordViewSet` — `TenantScopedViewMixin`, `ReadOnlyModelViewSet`
**Tenant scope**: `facility`
**Filter**: `ConsumptionRecordFilter`

### 6.12 Demand Forecasts — `/api/inventory/forecasts/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/forecasts/` | List | Facility-scoped, read-only |
| `GET` | `/forecasts/{id}/` | Retrieve | |
| `POST` | `/forecasts/generate/` | Generate | Single drug or all drugs |

**ViewSet**: `DemandForecastViewSet` — `TenantScopedViewMixin`, `ReadOnlyModelViewSet`
**Tenant scope**: `facility`
**Filter**: `DemandForecastFilter`

**Generate action input** (`DemandForecastGenerateSerializer`):
```json
{
  "drug_id": 123,           // optional — omit for all drugs
  "period_months": 3,       // required — forecast horizon
  "method": "MOVING_AVERAGE" // required — MOVING_AVERAGE or EXPONENTIAL_SMOOTHING
}
```

### 6.13 Reorder Suggestions — `/api/inventory/reorder-suggestions/`

| Method | URL | Action | Notes |
|--------|-----|--------|-------|
| `GET` | `/reorder-suggestions/` | List | Facility-scoped, read-only |
| `GET` | `/reorder-suggestions/{id}/` | Retrieve | |
| `POST` | `/reorder-suggestions/{id}/convert_to_po/` | Convert to PO | Creates PO + item, marks CONVERTED |
| `POST` | `/reorder-suggestions/{id}/dismiss/` | Dismiss | PENDING → DISMISSED |

**ViewSet**: `ReorderSuggestionViewSet` — `TenantScopedViewMixin`, `ReadOnlyModelViewSet`
**Tenant scope**: `facility`
**Filter**: `ReorderSuggestionFilter`

---

## 7. Serializers

### Write Serializers (Create/Action)

| Serializer | Model | Nested Write | Notes |
|------------|-------|--------------|-------|
| `SupplierCreateSerializer` | Supplier | — | |
| `PurchaseOrderCreateSerializer` | PurchaseOrder | `items` (PO items) | |
| `GoodsReceiptNoteCreateSerializer` | GoodsReceiptNote | `items` (GRN items) | |
| `StockTransferCreateSerializer` | StockTransfer | `items` (transfer items) | |
| `WardStockCreateSerializer` | WardStock | — | |
| `StockCountCreateSerializer` | StockCount | — | |
| `ETIMSConfigCreateSerializer` | ETIMSConfig | — | |
| `ETIMSInvoiceCreateSerializer` | ETIMSInvoice | — | |
| `DemandForecastGenerateSerializer` | — (input) | — | `drug_id`, `period_months`, `method` |

### Read Serializers

| Serializer | Model | Computed Fields | Notes |
|------------|-------|-----------------|-------|
| `SupplierSerializer` | Supplier | `supplier_type_display` | |
| `PurchaseOrderListSerializer` | PurchaseOrder | `total_amount`, `item_count`, `supplier_name` | |
| `PurchaseOrderDetailSerializer` | PurchaseOrder | `total_amount`, nested `items` | |
| `GoodsReceiptNoteListSerializer` | GRN | `total_items`, `total_amount`, `supplier_name` | |
| `GoodsReceiptNoteDetailSerializer` | GRN | Nested `items` | |
| `StockTransferListSerializer` | StockTransfer | `total_items`, `source_facility_name`, `destination_facility_name` | |
| `StockTransferDetailSerializer` | StockTransfer | Nested `items` | |
| `WardStockSerializer` | WardStock | `drug_name`, `is_below_par`, `reorder_quantity` | |
| `StockCountListSerializer` | StockCount | `store_location_name`, `item_count` | |
| `StockCountDetailSerializer` | StockCount | Nested `items` | |
| `ETIMSInvoiceSerializer` | ETIMSInvoice | Nested `items`, `invoice_number` | |
| `ConsumptionRecordSerializer` | ConsumptionRecord | `drug_name`, `total_consumption`, `average_daily_consumption` | Read-only |
| `DemandForecastSerializer` | DemandForecast | `drug_name` | Read-only |
| `ReorderSuggestionSerializer` | ReorderSuggestion | `drug_name`, `supplier_name` | Read-only |

### Action Serializers

| Serializer | Purpose |
|------------|---------|
| `POApproveSerializer` | Approve PO (empty — just triggers action) |
| `POCancelSerializer` | Cancel PO — `reason` field |
| `TransferApproveSerializer` | Approve transfer (empty) |
| `TransferCancelSerializer` | Cancel transfer — `reason` field |
| `WardConsumeSerializer` | Ward consume — `quantity`, `notes`, `reference` |
| `WardReplenishSerializer` | Ward replenish — `quantity`, `notes` |
| `WardReturnSerializer` | Ward return — `quantity`, `notes` |
| `StockCountItemUpdateSerializer` | Update counted qty — `counted_quantity`, `notes` |

---

## 8. Filters

| Filter Class | Model | Fields |
|--------------|-------|--------|
| `SupplierFilter` | Supplier | `is_active`, `supplier_type`, `search` (name/code/contact) |
| `PurchaseOrderFilter` | PurchaseOrder | `status`, `supplier`, `order_date_from`, `order_date_to` |
| `GoodsReceiptNoteFilter` | GRN | `status`, `supplier`, `purchase_order`, `received_date_from`, `received_date_to` |
| `StoreLocationFilter` | StoreLocation | `is_active`, `location_type`, `search` (name/code) |
| `StockTransferFilter` | StockTransfer | `status`, `source_facility`, `destination_facility`, `request_date_from`, `request_date_to` |
| `WardStockFilter` | WardStock | `store_location`, `drug`, `ward` |
| `ConsumptionRecordFilter` | ConsumptionRecord | `drug`, `period_after`, `period_before` |
| `DemandForecastFilter` | DemandForecast | `drug`, `method`, `forecast_after`, `forecast_before` |
| `ReorderSuggestionFilter` | ReorderSuggestion | `drug`, `urgency`, `status`, `supplier` |

---

## 9. Services

### 9.1 eTIMS Service — `services/etims.py`

**`ETIMSClient`**
Low-level KRA API client.

| Method | Purpose |
|--------|---------|
| `__init__(config: ETIMSConfig)` | Stores API URL, key, TIN, BHF ID |
| `submit_invoice(payload: dict) → dict` | POST to KRA `/trnsSales/saveSales`, returns response |
| `check_status(scu_number: str) → dict` | GET status of a submitted invoice |

**`build_etims_payload(etims_invoice: ETIMSInvoice) → dict`**
Constructs the KRA-compliant JSON payload from an ETIMSInvoice + linked billing.Invoice + items.

**`submit_etims_invoice(etims_invoice_id: int) → ETIMSInvoice`**
End-to-end flow: loads ETIMSInvoice → builds payload → submits via client → marks submitted/confirmed/failed → stores raw request/response.

### 9.2 Forecasting Service — `services/forecasting.py`

**Constants**: `SAFETY_FACTOR = 1.65` (z-score for ~95% service level), `DEFAULT_ALPHA = 0.3` (exponential smoothing weight)

**`ConsumptionAggregator(facility_id)`**

| Method | Purpose |
|--------|---------|
| `aggregate(period_start, period_end, drug_ids=None) → int` | Queries `Dispensing` + `StockAdjustment`, creates/updates `ConsumptionRecord` rows. Returns count. |

**`DemandForecaster(facility_id)`**

| Method | Purpose |
|--------|---------|
| `forecast(drug_id, period_months=3, method="MOVING_AVERAGE", lookback_months=6, user=None) → DemandForecast` | Generates a single forecast. Falls back to `default_reorder_quantity` if no history. |
| `forecast_all(period_months=3, method="MOVING_AVERAGE", user=None) → int` | Generates for all drugs with consumption history. Returns count. |
| `_moving_average(values, period_months) → Decimal` | Static. Simple average × period. |
| `_exponential_smoothing(values, period_months) → Decimal` | Static. Single ETS with α=0.3. |
| `_confidence_interval(values, predicted, period_months) → (lower, upper)` | Static. 95% CI using sample std dev. |
| `_compute_reorder_params(drug_id, predicted_demand, period_months) → (reorder_point, suggested_qty)` | Uses lead time, safety stock, current stock. |

**`ReorderEngine(facility_id)`**

| Method | Purpose |
|--------|---------|
| `generate_suggestions() → int` | Compares latest forecast vs stock. Creates `ReorderSuggestion` for drugs below reorder point. Skips existing PENDING suggestions. |
| `_get_latest_forecasts_sqlite()` | SQLite fallback (no `DISTINCT ON`). |
| `_compute_urgency(current_stock, reorder_point, predicted_demand) → str` | CRITICAL (0 stock or ≤7 days), HIGH (≤14 days), MEDIUM (below reorder), LOW. |
| `_find_preferred_supplier(drug_id, org_id)` | Highest-rated active supplier for the drug. |

---

## 10. Celery Tasks

| Task | Schedule | What it does |
|------|----------|--------------|
| `submit_etims_invoice_task(etims_invoice_id)` | On-demand | Async submission to KRA. Retries up to 3× with exponential backoff. |
| `retry_failed_etims_invoices()` | Periodic | Finds FAILED invoices with retry_count < 3, re-submits. |
| `aggregate_daily_consumption()` | Daily | Aggregates yesterday's dispensing/adjustment data for all active facilities. |
| `generate_weekly_forecasts()` | Weekly | Generates 3-month moving average forecasts for all drugs at all active facilities. |
| `generate_reorder_suggestions_task()` | Weekly | Runs ReorderEngine for all active facilities. |

---

## 11. Management Commands

### `aggregate_consumption`

```bash
python manage.py aggregate_consumption --facility-id 1 --months 1
python manage.py aggregate_consumption --all-facilities --months 3
python manage.py aggregate_consumption --all-facilities --dry-run
```

| Argument | Required | Default | Notes |
|----------|----------|---------|-------|
| `--facility-id` | One of `--facility-id` / `--all-facilities` | — | Single facility |
| `--all-facilities` | | — | Process all active facilities |
| `--months` | No | 1 | Lookback period |
| `--dry-run` | No | False | Preview without writing |

### `generate_forecasts`

```bash
python manage.py generate_forecasts --facility-id 1
python manage.py generate_forecasts --all-facilities --drug-id 42 --method EXPONENTIAL_SMOOTHING
```

| Argument | Required | Default | Notes |
|----------|----------|---------|-------|
| `--facility-id` | One of `--facility-id` / `--all-facilities` | — | |
| `--all-facilities` | | — | |
| `--drug-id` | No | — | Single drug (omit for all) |
| `--period-months` | No | 3 | Forecast horizon |
| `--method` | No | `MOVING_AVERAGE` | `MOVING_AVERAGE` or `EXPONENTIAL_SMOOTHING` |

### `generate_reorder_suggestions`

```bash
python manage.py generate_reorder_suggestions --facility-id 1
python manage.py generate_reorder_suggestions --all-facilities
```

| Argument | Required | Default | Notes |
|----------|----------|---------|-------|
| `--facility-id` | One of `--facility-id` / `--all-facilities` | — | |
| `--all-facilities` | | — | |

---

## 12. Domain Events

All events are published via `publish_event(event_type, aggregate_type, aggregate_id, payload)` in `signals.py`. Event type constants are defined in `hmis.apps.core.events.types.InventoryEvents`.

### Event Catalog

| Event Constant | Event String | Trigger | Aggregate |
|---------------|--------------|---------|-----------|
| `SUPPLIER_CREATED` | `inventory.supplier.created` | Supplier `post_save` (created) | `Supplier` |
| `PO_CREATED` | `inventory.purchase_order.created` | PO `post_save` (created) | `PurchaseOrder` |
| `PO_SUBMITTED` | `inventory.purchase_order.submitted` | PO `post_save` (status=SUBMITTED) | `PurchaseOrder` |
| `PO_APPROVED` | `inventory.purchase_order.approved` | PO `post_save` (status=APPROVED) | `PurchaseOrder` |
| `PO_CANCELLED` | `inventory.purchase_order.cancelled` | PO `post_save` (status=CANCELLED) | `PurchaseOrder` |
| `GRN_CREATED` | `inventory.grn.created` | GRN `post_save` (created) | `GoodsReceiptNote` |
| `GRN_CONFIRMED` | `inventory.grn.confirmed` | GRN `post_save` (status=CONFIRMED) | `GoodsReceiptNote` |
| `GRN_CANCELLED` | `inventory.grn.cancelled` | GRN `post_save` (status=CANCELLED) | `GoodsReceiptNote` |
| `TRANSFER_CREATED` | `inventory.transfer.created` | Transfer `post_save` (created) | `StockTransfer` |
| `TRANSFER_REQUESTED` | `inventory.transfer.requested` | Transfer `post_save` (status=REQUESTED) | `StockTransfer` |
| `TRANSFER_APPROVED` | `inventory.transfer.approved` | Transfer `post_save` (status=APPROVED) | `StockTransfer` |
| `TRANSFER_DISPATCHED` | `inventory.transfer.dispatched` | Transfer `post_save` (status=IN_TRANSIT) | `StockTransfer` |
| `TRANSFER_RECEIVED` | `inventory.transfer.received` | Transfer `post_save` (status=RECEIVED) | `StockTransfer` |
| `TRANSFER_CANCELLED` | `inventory.transfer.cancelled` | Transfer `post_save` (status=CANCELLED) | `StockTransfer` |
| `WARD_STOCK_LOW` | `inventory.ward_stock.low` | WardStockTransaction `post_save` (below par) | `WardStock` |
| `WARD_STOCK_CONSUMED` | `inventory.ward_stock.consumed` | WardStockTransaction `post_save` (CONSUME) | `WardStock` |
| `WARD_STOCK_REPLENISHED` | `inventory.ward_stock.replenished` | WardStockTransaction `post_save` (REPLENISH) | `WardStock` |
| `STOCK_COUNT_COMPLETED` | `inventory.stock_count.completed` | StockCount `post_save` (status=COMPLETED) | `StockCount` |
| `STOCK_COUNT_APPROVED` | `inventory.stock_count.approved` | StockCount `post_save` (status=APPROVED) | `StockCount` |
| `ETIMS_SUBMITTED` | `inventory.etims.submitted` | ETIMSInvoice `post_save` (status=SUBMITTED) | `ETIMSInvoice` |
| `ETIMS_CONFIRMED` | `inventory.etims.confirmed` | ETIMSInvoice `post_save` (status=CONFIRMED) | `ETIMSInvoice` |
| `ETIMS_FAILED` | `inventory.etims.failed` | ETIMSInvoice `post_save` (status=FAILED) | `ETIMSInvoice` |
| `REORDER_SUGGESTION_CREATED` | `inventory.reorder_suggestion.created` | ReorderSuggestion `post_save` (created) | `ReorderSuggestion` |
| `REORDER_CONVERTED_TO_PO` | `inventory.reorder_suggestion.converted_to_po` | ReorderSuggestion `post_save` (status=CONVERTED_TO_PO) | `ReorderSuggestion` |

### Signal Handlers (signals.py)

| Handler | Sender | Logic |
|---------|--------|-------|
| `publish_supplier_event` | `Supplier` | Created only |
| `publish_purchase_order_event` | `PurchaseOrder` | Maps status to event type |
| `publish_grn_event` | `GoodsReceiptNote` | Maps status to event type |
| `publish_transfer_event` | `StockTransfer` | Maps status to event type |
| `publish_ward_stock_transaction_event` | `WardStockTransaction` | CONSUME/REPLENISH + low-stock check |
| `publish_stock_count_event` | `StockCount` | COMPLETED/APPROVED |
| `publish_etims_invoice_event` | `ETIMSInvoice` | SUBMITTED/CONFIRMED/FAILED |
| `publish_reorder_suggestion_event` | `ReorderSuggestion` | Created / CONVERTED_TO_PO |

---

## 13. Admin Configuration

| Admin Class | Model | list_display | Inlines | Notable Features |
|-------------|-------|-------------|---------|-----------------|
| `SupplierAdmin` | Supplier | code, name, type, rating, is_active | — | list_filter: type, is_active |
| `PurchaseOrderAdmin` | PurchaseOrder | po_number, supplier, colored_status, total, date | `PurchaseOrderItemInline` | colored_status badge |
| `GoodsReceiptNoteAdmin` | GRN | grn_number, supplier, colored_status, date | `GRNItemInline` | colored_status badge |
| `StoreLocationAdmin` | StoreLocation | code, name, type, facility, is_active | — | |
| `StockTransferAdmin` | StockTransfer | transfer_number, source→dest, colored_status | `TransferItemInline` | colored_status badge |
| `WardStockAdmin` | WardStock | drug, store, quantity, par_level, is_below_par | — | |
| `StockCountAdmin` | StockCount | count_number, type, colored_status, store | `StockCountItemInline` | colored_status badge |
| `ETIMSConfigAdmin` | ETIMSConfig | facility, environment, device_serial, is_active | — | |
| `ETIMSInvoiceAdmin` | ETIMSInvoice | invoice, colored_status, scu_number, submitted_at | `ETIMSItemInline` | colored_status badge |
| `ConsumptionRecordAdmin` | ConsumptionRecord | drug, period_start, period_end, qty_dispensed, total | — | list_filter: drug |
| `DemandForecastAdmin` | DemandForecast | drug, forecast_date, method, predicted_demand | — | list_filter: method |
| `ReorderSuggestionAdmin` | ReorderSuggestion | drug, colored_urgency, colored_status, suggested_qty | — | colored urgency + status badges |

---

## 14. Test Coverage

| Test File | Tests | Focus |
|-----------|-------|-------|
| `test_inventory_api.py` | ~35 | Supplier, PO, GRN CRUD + actions |
| `test_inventory_models.py` | ~38 | PO/GRN state machines, properties |
| `test_inventory_events.py` | ~12 | Supplier/PO/GRN domain events |
| `test_transfer_api.py` | ~20 | Transfer CRUD + lifecycle actions |
| `test_transfer_models.py` | ~18 | Transfer state machine, validation |
| `test_transfer_events.py` | ~8 | Transfer domain events |
| `test_ward_stock_api.py` | ~10 | Ward stock CRUD + consume/replenish/return |
| `test_ward_stock_models.py` | ~12 | Ward stock properties, transactions |
| `test_stock_count_api.py` | ~15 | Stock count lifecycle API |
| `test_stock_count_models.py` | ~14 | Stock count state machine |
| `test_phase3_4_events.py` | ~10 | Ward stock + stock count events |
| `test_etims_api.py` | ~20 | eTIMS config + invoice API |
| `test_etims_service.py` | ~15 | eTIMS service layer + payload building |
| `test_etims_tasks.py` | ~10 | eTIMS Celery tasks |
| `test_forecasting_service.py` | ~25 | Aggregator, Forecaster, ReorderEngine |
| `test_forecasting_api.py` | ~21 | Consumption, Forecast, Reorder API |
| `test_forecasting_tasks.py` | ~6 | Forecasting Celery tasks |
| **Total** | **~292** | |

---

## 15. Key Workflows

### 15.1 Procurement Cycle

```
1. Create Supplier (org-level)
2. Create PurchaseOrder (DRAFT) with items
3. Submit PO  →  SUBMITTED
4. Approve PO →  APPROVED
5. Create GoodsReceiptNote (DRAFT) linked to PO
6. Confirm GRN → CONFIRMED
   → Creates StockBatch per GRN item
   → Updates PO item quantities_received
   → PO status → PARTIALLY_RECEIVED or RECEIVED
```

### 15.2 Stock Transfer

```
1. Create StockTransfer (DRAFT) with items
2. Submit   → REQUESTED
3. Approve  → APPROVED
4. Dispatch → IN_TRANSIT (deducts source stock)
5. Receive  → RECEIVED   (adds to destination stock)
```

### 15.3 Ward Stock Management

```
1. Create WardStock record (link store_location + drug)
2. Replenish → increases quantity, logs REPLENISH transaction
3. Consume   → decreases quantity, logs CONSUME transaction
   → If below par_level, publishes WARD_STOCK_LOW event
4. Return    → decreases quantity, logs RETURN transaction
```

### 15.4 Stock Reconciliation (Cycle Count)

```
1. Create StockCount (DRAFT) for a store_location
2. Generate Items → populates from StockBatch (captures system_quantity)
3. Start          → IN_PROGRESS (staff begins counting)
4. Update items   → staff enters counted_quantity per item
5. Complete       → COMPLETED (calculates variance)
6. Approve        → APPROVED
   → Creates StockAdjustment records for non-zero variances
```

### 15.5 KRA eTIMS Fiscal Invoicing

```
1. Configure ETIMSConfig (per facility — device serial, API key, TIN)
2. Create ETIMSInvoice linked to a billing.Invoice
3. Submit → triggers Celery task:
   a. Builds KRA payload from invoice items
   b. Submits to KRA API
   c. Marks SUBMITTED (with SCU number) or FAILED
4. KRA confirms → CONFIRMED (with receipt signature)
5. Failed → retryable up to 3 times
```

### 15.6 Demand Forecasting Pipeline

```
1. aggregate_daily_consumption (daily Celery task)
   → Queries Dispensing + StockAdjustment for yesterday
   → Creates/updates ConsumptionRecord rows per drug

2. generate_weekly_forecasts (weekly Celery task)
   → For each drug with consumption history:
     a. Loads last 6 months of ConsumptionRecords
     b. Applies moving average (or exponential smoothing)
     c. Computes 95% confidence interval
     d. Computes reorder_point (lead_time_demand + safety_stock)
     e. Creates DemandForecast record

3. generate_reorder_suggestions (weekly Celery task)
   → For each drug with a forecast:
     a. Gets current stock from StockBatch aggregation
     b. Compares vs reorder_point
     c. If stock ≤ reorder_point AND no existing PENDING suggestion:
        Creates ReorderSuggestion with urgency level

4. User reviews suggestions in UI:
   → Convert to PO (creates PurchaseOrder + item, marks CONVERTED_TO_PO)
   → Dismiss (marks DISMISSED)
```

---

## 16. Integration Points

### Cross-Module Dependencies

| External Model | Used By | How |
|----------------|---------|-----|
| `pharmacy.Drug` | PO items, GRN items, transfers, ward stock, counts, consumption, forecasts, reorder | FK on most child models |
| `pharmacy.StockBatch` | GRN confirm (creates), transfers (source), counts (snapshot) | Created by GRN.confirm(), queried by forecasting |
| `pharmacy.Dispensing` | ConsumptionAggregator | Aggregated for demand forecasting |
| `pharmacy.StockAdjustment` | ConsumptionAggregator | Aggregated for demand forecasting |
| `billing.Invoice` | ETIMSInvoice | FK — fiscal invoice mirrors billing invoice |
| `billing.InvoiceItem` | eTIMS payload builder | Reads items for KRA payload |
| `core.Facility` | All facility-scoped models | Tenant scoping |
| `core.Organization` | All org-scoped models | Tenant scoping |
| `inpatient.Ward` | WardStock | Optional FK for ward-specific stock |
| `auth.User` | PO ordered_by/approved_by, GRN received_by, etc. | FK on workflow actors |

### External System Integrations

| System | Integration | Status |
|--------|-------------|--------|
| **KRA eTIMS** | REST API via `ETIMSClient` | ✅ Implemented (Phase 5) |
| **PowerSync** | Offline sync (if tables added to publication) | 📋 Not yet synced |

### Celery Beat Schedule (Recommended)

```python
CELERY_BEAT_SCHEDULE = {
    "aggregate-daily-consumption": {
        "task": "hmis.apps.inventory.tasks.aggregate_daily_consumption",
        "schedule": crontab(hour=2, minute=0),  # 2:00 AM daily
    },
    "generate-weekly-forecasts": {
        "task": "hmis.apps.inventory.tasks.generate_weekly_forecasts",
        "schedule": crontab(hour=3, minute=0, day_of_week=1),  # Monday 3:00 AM
    },
    "generate-reorder-suggestions": {
        "task": "hmis.apps.inventory.tasks.generate_reorder_suggestions_task",
        "schedule": crontab(hour=4, minute=0, day_of_week=1),  # Monday 4:00 AM
    },
    "retry-failed-etims": {
        "task": "hmis.apps.inventory.tasks.retry_failed_etims_invoices",
        "schedule": crontab(hour="*/6"),  # Every 6 hours
    },
}
```

---

> **Maintainer**: Engineering Lead
> **Module Owner**: Inventory & Supply Chain Team

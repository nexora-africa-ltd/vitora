/**
 * Zod schemas for Inventory API response validation.
 *
 * Based on backend serializers at hmis/apps/inventory/serializers.py
 * See lib/types/inventory.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

/** Helper: parse decimal strings or numbers to number. */
const decimal = z.union([z.number(), z.string().transform(Number)]);

// =============================================================================
// ENUMS
// =============================================================================

export const SupplierTypeSchema = z.enum([
  'MANUFACTURER',
  'DISTRIBUTOR',
  'WHOLESALER',
  'GOVERNMENT',
]);

export const PurchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);

export const GRNStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED']);

export const StoreLocationTypeSchema = z.enum([
  'MAIN_STORE',
  'SATELLITE_PHARMACY',
  'WARD_STORE',
  'THEATRE_STORE',
  'LAB_STORE',
]);

export const TransferStatusSchema = z.enum([
  'DRAFT',
  'REQUESTED',
  'APPROVED',
  'IN_TRANSIT',
  'RECEIVED',
  'CANCELLED',
]);

export const WardTransactionTypeSchema = z.enum([
  'CONSUME',
  'REPLENISH',
  'RETURN',
  'ADJUSTMENT',
]);

export const StockCountTypeSchema = z.enum(['FULL', 'PARTIAL', 'SPOT']);

export const StockCountStatusSchema = z.enum([
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'APPROVED',
  'CANCELLED',
]);

export const ETIMSEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);

export const ETIMSInvoiceStatusSchema = z.enum([
  'PENDING',
  'SUBMITTED',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
]);

export const ForecastMethodSchema = z.enum([
  'MOVING_AVERAGE',
  'EXPONENTIAL_SMOOTHING',
  'SEASONAL',
]);

export const ReorderUrgencySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

export const ReorderStatusSchema = z.enum(['PENDING', 'CONVERTED_TO_PO', 'DISMISSED']);

// =============================================================================
// SUPPLIER
// =============================================================================

export const SupplierSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  supplier_type: SupplierTypeSchema,
  contact_person: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  tax_pin: z.string(),
  payment_terms: z.string(),
  lead_time_days: z.number(),
  rating: decimal,
  is_active: z.boolean(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedSupplierSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(SupplierSchema),
});

// =============================================================================
// PURCHASE ORDER
// =============================================================================

export const PurchaseOrderItemSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  quantity_ordered: z.number(),
  quantity_received: z.number(),
  unit_cost: decimal,
  line_total: decimal,
  is_fully_received: z.boolean(),
  outstanding_quantity: z.number(),
  notes: z.string(),
});

export const PurchaseOrderListSchema = z.object({
  id: z.number(),
  po_number: z.string(),
  supplier: z.number(),
  supplier_name: z.string(),
  status: PurchaseOrderStatusSchema,
  order_date: z.string(),
  expected_delivery_date: z.string().nullable(),
  total_amount: decimal,
  is_fully_received: z.boolean(),
  ordered_by: z.number(),
  ordered_by_name: z.string(),
  created_at: z.string(),
});

export const PurchaseOrderDetailSchema = PurchaseOrderListSchema.extend({
  approved_by: z.number().nullable(),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancellation_reason: z.string(),
  notes: z.string(),
  items: z.array(PurchaseOrderItemSchema),
  updated_at: z.string(),
});

export const PaginatedPurchaseOrderSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PurchaseOrderListSchema),
});

// =============================================================================
// GOODS RECEIPT NOTE
// =============================================================================

export const GRNItemSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  po_item: z.number().nullable(),
  batch_number: z.string(),
  expiry_date: z.string(),
  manufacture_date: z.string().nullable(),
  quantity_received: z.number(),
  cost_price: decimal,
  selling_price: decimal,
  location: z.string(),
  notes: z.string(),
  stock_batch_id: z.number().nullable(),
  line_total: decimal,
});

export const GoodsReceiptNoteListSchema = z.object({
  id: z.number(),
  grn_number: z.string(),
  purchase_order: z.number().nullable(),
  po_number: z.string().nullable(),
  supplier: z.number(),
  supplier_name: z.string(),
  status: GRNStatusSchema,
  received_date: z.string(),
  delivery_note_number: z.string(),
  total_items: z.number(),
  total_amount: decimal,
  received_by: z.number(),
  received_by_name: z.string(),
  created_at: z.string(),
});

export const GoodsReceiptNoteDetailSchema = GoodsReceiptNoteListSchema.extend({
  invoice_number: z.string(),
  notes: z.string(),
  items: z.array(GRNItemSchema),
  confirmed_at: z.string().nullable(),
  confirmed_by: z.number().nullable(),
  confirmed_by_name: z.string(),
  updated_at: z.string(),
});

export const PaginatedGoodsReceiptNoteSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(GoodsReceiptNoteListSchema),
});

// =============================================================================
// STORE LOCATION
// =============================================================================

export const StoreLocationSchema = z.object({
  id: z.number(),
  code: z.string(),
  name: z.string(),
  location_type: StoreLocationTypeSchema,
  is_active: z.boolean(),
  managed_by: z.number().nullable(),
  managed_by_name: z.string(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedStoreLocationSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StoreLocationSchema),
});

// =============================================================================
// STOCK TRANSFER
// =============================================================================

export const TransferItemSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  source_batch: z.number(),
  source_batch_number: z.string(),
  quantity_requested: z.number(),
  quantity_dispatched: z.number(),
  quantity_received: z.number(),
  destination_batch_id: z.number().nullable(),
  notes: z.string(),
});

export const StockTransferListSchema = z.object({
  id: z.number(),
  transfer_number: z.string(),
  source_facility: z.number(),
  source_facility_name: z.string(),
  source_store: z.number().nullable(),
  destination_facility: z.number(),
  destination_facility_name: z.string(),
  destination_store: z.number().nullable(),
  status: TransferStatusSchema,
  request_date: z.string(),
  total_items: z.number(),
  requested_by: z.number(),
  requested_by_name: z.string(),
  created_at: z.string(),
});

export const StockTransferDetailSchema = StockTransferListSchema.extend({
  source_store_name: z.string().nullable(),
  destination_store_name: z.string().nullable(),
  notes: z.string(),
  cancellation_reason: z.string(),
  items: z.array(TransferItemSchema),
  approved_by: z.number().nullable(),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  dispatched_by: z.number().nullable(),
  dispatched_by_name: z.string(),
  dispatched_at: z.string().nullable(),
  received_by: z.number().nullable(),
  received_by_name: z.string(),
  received_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  updated_at: z.string(),
});

export const PaginatedStockTransferSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StockTransferListSchema),
});

// =============================================================================
// WARD STOCK
// =============================================================================

export const WardStockTransactionSchema = z.object({
  id: z.number(),
  ward_stock: z.number(),
  transaction_type: WardTransactionTypeSchema,
  quantity: z.number(),
  batch: z.number().nullable(),
  patient: z.number().nullable(),
  patient_name: z.string(),
  drug_name: z.string(),
  performed_by: z.number(),
  performed_by_name: z.string(),
  performed_at: z.string(),
  notes: z.string(),
  created_at: z.string(),
});

export const PaginatedWardStockTransactionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WardStockTransactionSchema),
});

export const WardStockSchema = z.object({
  id: z.number(),
  store_location: z.number(),
  store_location_name: z.string(),
  drug: z.number(),
  drug_name: z.string(),
  ward: z.number().nullable(),
  quantity_available: z.number(),
  par_level: z.number(),
  max_level: z.number(),
  is_below_par: z.boolean(),
  is_above_max: z.boolean(),
  reorder_quantity: z.number(),
  last_replenished_at: z.string().nullable(),
  last_counted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaginatedWardStockSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(WardStockSchema),
});

// =============================================================================
// STOCK COUNT
// =============================================================================

export const StockCountItemSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  batch: z.number().nullable(),
  batch_number: z.string(),
  system_quantity: z.number(),
  counted_quantity: z.number().nullable(),
  variance: z.number().nullable(),
  has_discrepancy: z.boolean(),
  variance_reason: z.string(),
  counted_by: z.number().nullable(),
  counted_by_name: z.string(),
  counted_at: z.string().nullable(),
});

export const StockCountListSchema = z.object({
  id: z.number(),
  count_number: z.string(),
  count_type: StockCountTypeSchema,
  store_location: z.number().nullable(),
  store_location_name: z.string().nullable(),
  status: StockCountStatusSchema,
  started_by: z.number(),
  started_by_name: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  total_items_counted: z.number(),
  total_discrepancies: z.number(),
  created_at: z.string(),
});

export const StockCountDetailSchema = StockCountListSchema.extend({
  notes: z.string(),
  items: z.array(StockCountItemSchema),
  approved_by: z.number().nullable(),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  updated_at: z.string(),
});

export const PaginatedStockCountSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(StockCountListSchema),
});

// =============================================================================
// eTIMS
// =============================================================================

export const ETIMSConfigSchema = z.object({
  id: z.number(),
  bhf_id: z.string(),
  dvc_srl_no: z.string(),
  tin: z.string(),
  api_base_url: z.string(),
  is_active: z.boolean(),
  last_sync_at: z.string().nullable(),
  environment: ETIMSEnvironmentSchema,
  facility: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ETIMSItemSchema = z.object({
  id: z.number(),
  item_code: z.string(),
  item_name: z.string(),
  quantity: decimal,
  unit_price: decimal,
  tax_amount: decimal,
  total: decimal,
});

export const ETIMSInvoiceSchema = z.object({
  id: z.number(),
  invoice: z.number(),
  invoice_number: z.string(),
  patient_name: z.string(),
  invoice_total: decimal,
  dispensing: z.number().nullable(),
  etims_receipt_number: z.string(),
  etims_internal_data: z.record(z.unknown()).nullable(),
  status: ETIMSInvoiceStatusSchema,
  submitted_at: z.string().nullable(),
  confirmed_at: z.string().nullable(),
  error_message: z.string(),
  retry_count: z.number(),
  facility: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(ETIMSItemSchema),
});

export const PaginatedETIMSInvoiceSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ETIMSInvoiceSchema),
});

// =============================================================================
// FORECASTING
// =============================================================================

export const ConsumptionRecordSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  quantity_dispensed: decimal,
  quantity_transferred: decimal,
  quantity_adjusted: decimal,
  total_consumption: decimal,
  average_daily_consumption: decimal,
  facility: z.number(),
  created_at: z.string(),
});

export const PaginatedConsumptionRecordSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ConsumptionRecordSchema),
});

export const DemandForecastSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  forecast_date: z.string(),
  period_months: z.number(),
  predicted_demand: decimal,
  confidence_lower: decimal.nullable(),
  confidence_upper: decimal.nullable(),
  method: ForecastMethodSchema,
  reorder_point: decimal.nullable(),
  suggested_order_quantity: decimal.nullable(),
  generated_by: z.number().nullable(),
  facility: z.number(),
  created_at: z.string(),
});

export const PaginatedDemandForecastSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(DemandForecastSchema),
});

export const ReorderSuggestionSchema = z.object({
  id: z.number(),
  drug: z.number(),
  drug_name: z.string(),
  supplier: z.number().nullable(),
  supplier_name: z.string().nullable(),
  current_stock: decimal,
  reorder_point: decimal,
  suggested_quantity: decimal,
  urgency: ReorderUrgencySchema,
  status: ReorderStatusSchema,
  purchase_order: z.number().nullable(),
  facility: z.number(),
  created_at: z.string(),
});

export const PaginatedReorderSuggestionSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ReorderSuggestionSchema),
});

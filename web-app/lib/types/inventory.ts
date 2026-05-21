/**
 * Inventory module type definitions.
 *
 * Based on backend models at hmis/apps/inventory/models.py
 * and serializers at hmis/apps/inventory/serializers.py
 */

// =============================================================================
// ENUMS
// =============================================================================

export type SupplierType = 'MANUFACTURER' | 'DISTRIBUTOR' | 'WHOLESALER' | 'GOVERNMENT';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type GRNStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export type StoreLocationType =
  | 'MAIN_STORE'
  | 'SATELLITE_PHARMACY'
  | 'WARD_STORE'
  | 'THEATRE_STORE'
  | 'LAB_STORE';

export type TransferStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'APPROVED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'CANCELLED';

export type WardTransactionType = 'CONSUME' | 'REPLENISH' | 'RETURN' | 'ADJUSTMENT';

export type StockCountType = 'FULL' | 'CYCLE' | 'SPOT';

export type StockCountStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'APPROVED'
  | 'CANCELLED';

export type ETIMSEnvironment = 'SANDBOX' | 'PRODUCTION';

export type ETIMSInvoiceStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED';

export type ETIMSReceiptType = 'N' | 'C' | 'T' | 'P';

export type ETIMSTransactionType = 'S' | 'NC';

export type ETIMSReceiptLabel = 'NS' | 'NC' | 'CS' | 'CC' | 'TS' | 'TC' | 'PS';

export type ETIMSDailyReportType = 'X' | 'Z';

export type ForecastMethod = 'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING' | 'SEASONAL';

export type ReorderUrgency = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ReorderStatus = 'PENDING' | 'CONVERTED_TO_PO' | 'DISMISSED';

// =============================================================================
// READ MODELS — match backend read serializers
// =============================================================================

/**
 * Configurable payment term option.
 * Matches PaymentTermSerializer fields.
 */
export interface PaymentTerm {
  id: number;
  code: string;
  name: string;
  days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentTermCreateData {
  code: string;
  name: string;
  days: number;
  is_active?: boolean;
}

/**
 * Supplier — shared across facilities in an organization.
 * Matches SupplierSerializer fields.
 */
export interface Supplier {
  id: number;
  code: string;
  name: string;
  supplier_type: SupplierType;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_pin: string;
  payment_terms: string;
  payment_term: number | null;
  payment_term_name: string | null;
  lead_time_days: number;
  rating: number | string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Purchase order item (nested in PO detail).
 * Matches PurchaseOrderItemSerializer fields.
 */
export interface PurchaseOrderItem {
  id: number;
  drug: number;
  drug_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number | string;
  line_total: number | string;
  is_fully_received: boolean;
  outstanding_quantity: number;
  notes: string;
}

/**
 * Purchase order — list shape (compact).
 * Matches PurchaseOrderListSerializer fields.
 */
export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier: number;
  supplier_name: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: number | string;
  is_fully_received: boolean;
  ordered_by: number;
  ordered_by_name: string;
  created_at: string;
}

/**
 * Purchase order — detail shape (full with nested items).
 * Matches PurchaseOrderDetailSerializer fields.
 */
export interface PurchaseOrderDetail extends PurchaseOrder {
  approved_by: number | null;
  approved_by_name: string;
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string;
  notes: string;
  items: PurchaseOrderItem[];
  updated_at: string;
}

/**
 * GRN item (nested in GRN detail).
 * Matches GRNItemSerializer fields.
 */
export interface GRNItem {
  id: number;
  drug: number;
  drug_name: string;
  po_item: number | null;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string | null;
  quantity_received: number;
  cost_price: number | string;
  selling_price: number | string;
  location: string;
  notes: string;
  stock_batch_id: number | null;
  line_total: number | string;
}

/**
 * Goods Receipt Note — list shape (compact).
 * Matches GoodsReceiptNoteListSerializer fields.
 */
export interface GoodsReceiptNote {
  id: number;
  grn_number: string;
  purchase_order: number | null;
  po_number: string | null;
  supplier: number;
  supplier_name: string;
  status: GRNStatus;
  received_date: string;
  delivery_note_number: string;
  total_items: number;
  total_amount: number | string;
  received_by: number;
  received_by_name: string;
  created_at: string;
}

/**
 * Goods Receipt Note — detail shape (full with nested items).
 * Matches GoodsReceiptNoteDetailSerializer fields.
 */
export interface GoodsReceiptNoteDetail extends GoodsReceiptNote {
  invoice_number: string;
  notes: string;
  items: GRNItem[];
  confirmed_at: string | null;
  confirmed_by: number | null;
  confirmed_by_name: string;
  updated_at: string;
}

/**
 * Store location within a facility.
 * Matches StoreLocationSerializer fields.
 */
export interface StoreLocation {
  id: number;
  code: string;
  name: string;
  location_type: StoreLocationType;
  is_active: boolean;
  managed_by: number | null;
  managed_by_name: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/**
 * Transfer item (nested in transfer detail).
 * Matches TransferItemSerializer fields.
 */
export interface TransferItem {
  id: number;
  drug: number;
  drug_name: string;
  source_batch: number;
  source_batch_number: string;
  quantity_requested: number;
  quantity_dispatched: number;
  quantity_received: number;
  destination_batch_id: number | null;
  notes: string;
}

/**
 * Stock transfer — list shape (compact).
 * Matches StockTransferListSerializer fields.
 */
export interface StockTransfer {
  id: number;
  transfer_number: string;
  source_facility: number;
  source_facility_name: string;
  source_store: number | null;
  destination_facility: number;
  destination_facility_name: string;
  destination_store: number | null;
  status: TransferStatus;
  request_date: string;
  total_items: number;
  requested_by: number;
  requested_by_name: string;
  created_at: string;
}

/**
 * Stock transfer — detail shape (full with nested items).
 * Matches StockTransferDetailSerializer fields.
 */
export interface StockTransferDetail extends StockTransfer {
  source_store_name: string | null;
  destination_store_name: string | null;
  notes: string;
  cancellation_reason: string;
  items: TransferItem[];
  approved_by: number | null;
  approved_by_name: string;
  approved_at: string | null;
  dispatched_by: number | null;
  dispatched_by_name: string;
  dispatched_at: string | null;
  received_by: number | null;
  received_by_name: string;
  received_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

/**
 * Ward stock transaction (read-only history).
 * Matches WardStockTransactionSerializer fields.
 */
export interface WardStockTransaction {
  id: number;
  ward_stock: number;
  transaction_type: WardTransactionType;
  quantity: number;
  batch: number | null;
  patient: number | null;
  patient_name: string;
  drug_name: string;
  performed_by: number;
  performed_by_name: string;
  performed_at: string;
  notes: string;
  created_at: string;
}

/**
 * Ward stock — par-level management.
 * Matches WardStockSerializer fields.
 */
export interface WardStock {
  id: number;
  store_location: number;
  store_location_name: string;
  drug: number;
  drug_name: string;
  ward: number | null;
  quantity_available: number;
  par_level: number;
  max_level: number;
  is_below_par: boolean;
  is_above_max: boolean;
  reorder_quantity: number;
  last_replenished_at: string | null;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stock count item (nested in count detail).
 * Matches StockCountItemSerializer fields.
 */
export interface StockCountItem {
  id: number;
  drug: number;
  drug_name: string;
  batch: number | null;
  batch_number: string;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  has_discrepancy: boolean;
  variance_reason: string;
  counted_by: number | null;
  counted_by_name: string;
  counted_at: string | null;
}

/**
 * Stock count — list shape (compact).
 * Matches StockCountListSerializer fields.
 */
export interface StockCount {
  id: number;
  count_number: string;
  count_type: StockCountType;
  store_location: number | null;
  store_location_name: string | null;
  status: StockCountStatus;
  started_by: number;
  started_by_name: string;
  started_at: string | null;
  completed_at: string | null;
  total_items_counted: number;
  total_discrepancies: number;
  created_at: string;
}

/**
 * Stock count — detail shape (full with nested items).
 * Matches StockCountDetailSerializer fields.
 */
export interface StockCountDetail extends StockCount {
  notes: string;
  item_count: number;
  approved_by: number | null;
  approved_by_name: string;
  approved_at: string | null;
  updated_at: string;
}

/**
 * eTIMS facility configuration.
 * Matches ETIMSConfigSerializer fields.
 */
export interface ETIMSConfig {
  id: number;
  bhf_id: string;
  dvc_srl_no: string;
  tin: string;
  api_base_url: string;
  is_active: boolean;
  last_sync_at: string | null;
  environment: ETIMSEnvironment;
  facility: number;
  counter_ns: number;
  counter_nc: number;
  counter_cs: number;
  counter_cc: number;
  counter_ts: number;
  counter_tc: number;
  counter_ps: number;
  created_at: string;
  updated_at: string;
}

/**
 * eTIMS invoice line item (nested in eTIMS invoice).
 * Matches ETIMSItemSerializer fields.
 */
export interface ETIMSItem {
  id: number;
  item_code: string;
  item_name: string;
  quantity: number | string;
  unit_price: number | string;
  tax_amount: number | string;
  total: number | string;
}

/**
 * eTIMS invoice submission.
 * Matches ETIMSInvoiceSerializer fields.
 */
export interface ETIMSInvoice {
  id: number;
  invoice: number;
  invoice_number: string;
  patient_name: string;
  invoice_total: number | string;
  dispensing: number | null;
  // Receipt classification
  receipt_type: ETIMSReceiptType;
  transaction_type: ETIMSTransactionType;
  receipt_label: ETIMSReceiptLabel;
  receipt_type_counter: number;
  // Credit note reference
  original_etims_invoice: number | null;
  original_cu_invoice_number: string;
  buyer_pin: string;
  // KRA response
  etims_receipt_number: string;
  etims_internal_data: Record<string, unknown> | null;
  // SCU response fields (§5.3)
  scu_id: string;
  scu_datetime: string | null;
  scu_receipt_counter: number;
  scu_total_counter: number;
  scu_internal_data: string;
  scu_receipt_signature: string;
  cu_invoice_number: string;
  formatted_internal_data: string;
  formatted_receipt_signature: string;
  qr_code_data: string;
  ej_data_sent: boolean;
  // Lifecycle
  status: ETIMSInvoiceStatus;
  submitted_at: string | null;
  confirmed_at: string | null;
  error_message: string;
  retry_count: number;
  facility: number;
  created_at: string;
  updated_at: string;
  items: ETIMSItem[];
}

/**
 * Consumption record (read-only aggregation).
 * Matches ConsumptionRecordSerializer fields.
 */
export interface ConsumptionRecord {
  id: number;
  drug: number;
  drug_name: string;
  period_start: string;
  period_end: string;
  quantity_dispensed: number | string;
  quantity_transferred: number | string;
  quantity_adjusted: number | string;
  total_consumption: number | string;
  average_daily_consumption: number | string;
  facility: number;
  created_at: string;
}

/**
 * Demand forecast (read-only prediction).
 * Matches DemandForecastSerializer fields.
 */
export interface DemandForecast {
  id: number;
  drug: number;
  drug_name: string;
  forecast_date: string;
  period_months: number;
  predicted_demand: number | string;
  confidence_lower: number | string | null;
  confidence_upper: number | string | null;
  method: ForecastMethod;
  reorder_point: number | string | null;
  suggested_order_quantity: number | string | null;
  generated_by: number | null;
  facility: number;
  created_at: string;
}

/**
 * Reorder suggestion (actionable recommendation).
 * Matches ReorderSuggestionSerializer fields.
 */
export interface ReorderSuggestion {
  id: number;
  drug: number;
  drug_name: string;
  supplier: number | null;
  supplier_name: string | null;
  current_stock: number | string;
  reorder_point: number | string;
  suggested_quantity: number | string;
  urgency: ReorderUrgency;
  status: ReorderStatus;
  purchase_order: number | null;
  facility: number;
  created_at: string;
}

// =============================================================================
// WRITE/INPUT TYPES — match backend create/action serializers
// =============================================================================

export interface SupplierCreateData {
  code: string;
  name: string;
  supplier_type?: SupplierType;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_pin?: string;
  payment_terms?: string;
  payment_term?: number | null;
  lead_time_days?: number;
  notes?: string;
}

export interface PurchaseOrderItemCreateData {
  drug: number;
  quantity_ordered: number;
  unit_cost: number | string;
  notes?: string;
}

export interface PurchaseOrderCreateData {
  supplier: number;
  order_date?: string;
  expected_delivery_date?: string | null;
  notes?: string;
  items: PurchaseOrderItemCreateData[];
}

export interface GRNItemCreateData {
  drug: number;
  po_item?: number | null;
  batch_number: string;
  expiry_date: string;
  manufacture_date?: string | null;
  quantity_received: number;
  cost_price: number | string;
  selling_price: number | string;
  location?: string;
  notes?: string;
}

export interface GoodsReceiptNoteCreateData {
  purchase_order?: number | null;
  supplier: number;
  received_date?: string;
  delivery_note_number?: string;
  invoice_number?: string;
  notes?: string;
  items: GRNItemCreateData[];
}

export interface StoreLocationCreateData {
  code: string;
  name: string;
  location_type?: StoreLocationType;
  is_active?: boolean;
  managed_by?: number | null;
  notes?: string;
}

export interface TransferItemCreateData {
  drug: number;
  source_batch: number;
  quantity_requested: number;
  notes?: string;
}

export interface StockTransferCreateData {
  source_facility: number;
  source_store?: number | null;
  destination_facility: number;
  destination_store?: number | null;
  request_date?: string;
  notes?: string;
  items: TransferItemCreateData[];
}

export interface WardStockCreateData {
  store_location: number;
  drug: number;
  ward?: number | null;
  quantity_available?: number;
  par_level?: number;
  max_level?: number;
}

export interface WardConsumeData {
  quantity: number;
  patient?: number | null;
  batch?: number | null;
  notes?: string;
}

export interface WardReplenishData {
  quantity: number;
  batch?: number | null;
  notes?: string;
}

export interface WardReturnData {
  quantity: number;
  notes?: string;
}

export interface StockCountCreateData {
  count_type: StockCountType;
  store_location?: number | null;
  notes?: string;
}

export interface StockCountItemUpdateData {
  counted_quantity: number;
  variance_reason?: string;
}

export interface ETIMSConfigCreateData {
  bhf_id?: string;
  dvc_srl_no: string;
  tin: string;
  api_base_url: string;
  api_key?: string;
  is_active?: boolean;
  environment?: ETIMSEnvironment;
}

export interface ETIMSInvoiceCreateData {
  invoice: number;
  dispensing?: number | null;
  receipt_type?: ETIMSReceiptType;
  transaction_type?: ETIMSTransactionType;
  receipt_label?: ETIMSReceiptLabel;
  original_etims_invoice?: number | null;
  original_cu_invoice_number?: string;
  buyer_pin?: string;
}

export interface ETIMSCreditNoteData {
  reason: string;
}

export interface ETIMSDailyReport {
  id: number;
  facility: number;
  report_type: ETIMSDailyReportType;
  report_date: string;
  report_number: number;
  // Tax breakdown
  taxable_amount_a: number | string;
  tax_amount_a: number | string;
  taxable_amount_b: number | string;
  tax_amount_b: number | string;
  taxable_amount_c: number | string;
  tax_amount_c: number | string;
  taxable_amount_d: number | string;
  tax_amount_d: number | string;
  taxable_amount_e: number | string;
  tax_amount_e: number | string;
  // Sales totals
  total_ns_amount: number | string;
  total_ns_count: number;
  total_nc_amount: number | string;
  total_nc_count: number;
  total_items_sold: number;
  total_cs_cc_count: number;
  total_cs_cc_amount: number | string;
  total_ts_tc_count: number;
  total_ts_tc_amount: number | string;
  total_ps_count: number;
  total_ps_amount: number | string;
  // Payment breakdown
  payment_cash: number | string;
  payment_mpesa: number | string;
  payment_insurance: number | string;
  payment_other: number | string;
  // Misc
  total_discounts: number | string;
  incomplete_sales_count: number;
  generated_by: number | null;
  generated_by_name: string | null;
  created_at: string;
}

export interface ETIMSDailyReportGenerateData {
  report_type: ETIMSDailyReportType;
  report_date?: string;
}

export interface DemandForecastGenerateData {
  drug_id?: number;
  period_months?: number;
  method: 'MOVING_AVERAGE' | 'EXPONENTIAL_SMOOTHING';
}

export interface POCancelData {
  reason?: string;
}

export interface TransferCancelData {
  reason?: string;
}

// =============================================================================
// LIST PARAMS — match backend filter classes
// =============================================================================

export interface SupplierListParams {
  page?: number;
  page_size?: number;
  is_active?: boolean;
  supplier_type?: SupplierType;
  search?: string;
  ordering?: string;
}

export interface PurchaseOrderListParams {
  page?: number;
  page_size?: number;
  status?: PurchaseOrderStatus;
  supplier?: number;
  order_date_from?: string;
  order_date_to?: string;
  ordering?: string;
}

export interface GoodsReceiptNoteListParams {
  page?: number;
  page_size?: number;
  status?: GRNStatus;
  supplier?: number;
  purchase_order?: number;
  received_date_from?: string;
  received_date_to?: string;
  ordering?: string;
}

export interface StoreLocationListParams {
  page?: number;
  page_size?: number;
  is_active?: boolean;
  location_type?: StoreLocationType;
  search?: string;
  ordering?: string;
}

export interface StockTransferListParams {
  page?: number;
  page_size?: number;
  status?: TransferStatus;
  source_facility?: number;
  destination_facility?: number;
  request_date_from?: string;
  request_date_to?: string;
  ordering?: string;
}

export interface WardStockListParams {
  page?: number;
  page_size?: number;
  store_location?: number;
  drug?: number;
  ward?: number;
  ordering?: string;
}

export interface WardStockTransactionListParams {
  page?: number;
  page_size?: number;
  ward_stock?: number;
  transaction_type?: WardTransactionType;
  ordering?: string;
}

export interface StockCountListParams {
  page?: number;
  page_size?: number;
  status?: StockCountStatus;
  count_type?: StockCountType;
  store_location?: number;
  ordering?: string;
}

export interface ETIMSInvoiceListParams {
  page?: number;
  page_size?: number;
  status?: ETIMSInvoiceStatus;
  ordering?: string;
}

export interface ConsumptionRecordListParams {
  page?: number;
  page_size?: number;
  drug?: number;
  period_after?: string;
  period_before?: string;
  ordering?: string;
}

export interface DemandForecastListParams {
  page?: number;
  page_size?: number;
  drug?: number;
  method?: ForecastMethod;
  forecast_after?: string;
  forecast_before?: string;
  ordering?: string;
}

export interface ReorderSuggestionListParams {
  page?: number;
  page_size?: number;
  drug?: number;
  urgency?: ReorderUrgency;
  status?: ReorderStatus;
  supplier?: number;
  ordering?: string;
}

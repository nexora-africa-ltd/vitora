/**
 * Billing Type Definitions for Vitora HMIS
 * Based on backend billing module implementation
 *
 * @see backend/hmis/apps/billing/models.py
 * @see backend/BILLING_IMPLEMENTATION_STATUS.md
 */

// ============================================================================
// Service & Category Types
// ============================================================================

export interface ServiceCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: number;
  category: number;
  category_name?: string | null;
  code: string;
  name: string;
  description: string;
  unit_price: string; // Decimal as string from API
  currency: string;
  sha_code: string;
  icd10_code: string;
  is_active: boolean;
  requires_quantity: boolean;
  is_taxable: boolean;
  created_at: string;
  updated_at: string;
  created_by: number;
}

export interface ServiceCreateData {
  category: number;
  code: string;
  name: string;
  description?: string;
  unit_price: string;
  sha_code?: string;
  icd10_code?: string;
  is_active?: boolean;
  requires_quantity?: boolean;
  is_taxable?: boolean;
}

export interface ServiceUpdateData extends Partial<ServiceCreateData> {}

// ============================================================================
// Invoice Types
// ============================================================================

export type InvoiceStatus =
  | 'PROFORMA'
  | 'DRAFT'
  | 'PENDING'
  | 'PARTIAL'
  | 'PAID'
  | 'CANCELLED'
  | 'OVERDUE'
  | 'WRITTEN_OFF';

export interface Invoice {
  id: number;
  invoice_number: string;
  patient: number;
  patient_name?: string | null;
  patient_mrn?: string | null;
  encounter?: number | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string;

  // Totals
  subtotal: string;
  discount_type: 'PERCENTAGE' | 'FIXED' | null;
  discount_value: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;

  // Insurance/SHA
  sha_claim_number?: string | null;
  insurance_coverage: string;

  // Notes
  notes: string;

  // Metadata
  created_at: string;
  updated_at: string;
  created_by: number;
  finalized_at?: string | null;
  finalized_by?: number | null;
  cancelled_at?: string | null;
  cancelled_by?: number | null;
  cancellation_reason?: string | null;

  // Proforma-specific fields
  valid_until?: string | null;                  // ISO date string for proforma validity
  is_converted: boolean;                 // True if proforma has been converted
  converted_at?: string | null;                 // ISO datetime when conversion occurred
  converted_from_proforma?: number | null;      // ID of source proforma (for converted invoices)
  is_valid: boolean;                     // Computed: proforma not expired
  days_until_expiry: number;             // Computed: -1 if N/A, 0+ for proformas
  can_convert: boolean;                  // Computed: proforma + valid + has unconverted items

  // QR code for validation (base64 data URI)
  qr_code?: string | null;

  // Nested items (when expanded)
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: number;
  invoice: number;
  description: string;
  quantity: number;
  unit_price: string;
  discount_percentage: string;
  line_total: string;

  // Linked entities (optional)
  service?: number | null;
  service_name?: string | null;
  drug?: number | null;
  drug_name?: string | null;
  lab_order?: number | null;
  lab_order_name?: string | null;

  // Insurance
  is_covered_by_insurance: boolean;
  sha_code?: string | null;

  // Proforma conversion tracking
  is_converted: boolean;
  converted_at?: string | null;
  converted_from_item?: number | null;          // ID of source proforma item

  created_at: string;
  updated_at: string;
}

export interface InvoiceCreateData {
  patient: number;
  encounter?: number;
  due_date: string;
  notes?: string;
}

export interface InvoiceUpdateData {
  notes?: string;
  due_date?: string;
}

export interface InvoiceItemCreateData {
  description: string;
  quantity: number;
  unit_price: string;
  discount_percentage?: string;
  service?: number;
  drug?: number;
  lab_order?: number;
  is_covered_by_insurance?: boolean;
  sha_code?: string;
}

/**
 * Proforma invoice creation data
 * Extends InvoiceCreateData with proforma-specific fields
 */
export interface ProformaCreateData extends InvoiceCreateData {
  status: 'PROFORMA';
  valid_until?: string;                  // Optional custom validity date (ISO date string)
}

/**
 * Request data for converting proforma to invoice
 */
export interface ProformaConvertRequest {
  item_ids?: number[];                   // Optional: specific items for partial conversion
}

/**
 * Request data for renewing expired proforma
 */
export interface ProformaRenewRequest {
  validity_days?: number;                // Optional: custom validity period (default 30)
}

export type DiscountType = 'PERCENTAGE' | 'FIXED';

export interface ApplyDiscountData {
  discount_type: DiscountType;
  discount_value: string;
  discount_reason?: string;
}

// ============================================================================
// Payment Types
// ============================================================================

export type PaymentMethod =
  | 'CASH'
  | 'MPESA'
  | 'CARD'
  | 'INSURANCE'
  | 'BANK_TRANSFER';

// ============================================================================
// Payment Point Types
// ============================================================================

export interface PaymentPoint {
  id: number;
  name: string;
  code: string;
  method: PaymentMethod;

  // M-Pesa
  till_number?: string | null;
  paybill_number?: string | null;
  paybill_account_number?: string | null;

  // Bank
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch?: string | null;

  is_active: boolean;
  notes?: string | null;

  created_at: string;
  updated_at: string;
  created_by: number;
}

export interface PaymentPointListParams {
  method?: PaymentMethod;
  is_active?: boolean;
}

export interface PaginatedPaymentPoints {
  count: number;
  next: string | null;
  previous: string | null;
  results: PaymentPoint[];
}

export type PaymentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'REVERSED';

export interface Payment {
  id: number;
  payment_reference: string;
  invoice: number;
  invoice_number?: string | null;
  patient_name?: string | null;

  payment_point?: number | null;

  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;

  // M-Pesa specific
  mpesa_receipt_number?: string | null;
  mpesa_phone_number?: string | null;
  mpesa_checkout_request_id?: string | null;

  // Card specific
  card_last_four?: string | null;
  card_type?: string | null;
  card_authorization_code?: string | null;

  // Insurance specific
  insurance_claim_number?: string | null;
  insurance_approval_code?: string | null;

  // Processing
  processed_at?: string | null;
  processed_by?: number | null;
  failure_reason?: string | null;

  // Reversal/Refund
  reversed_at?: string | null;
  reversed_by?: number | null;
  reversal_reason?: string | null;
  refunded_at?: string | null;
  refund_reference?: string | null;

  notes: string;
  created_at: string;
  updated_at: string;
  created_by: number;
}

export interface PaymentCreateData {
  invoice: number;
  amount: string;
  method: PaymentMethod;
  payment_point?: number;
  payment_details?: Record<string, unknown>;
  mpesa_phone?: string;
  card_last_four?: string;
  card_type?: string;
  insurance_claim_number?: string;
  notes?: string;
}

// ============================================================================
// M-Pesa Types
// ============================================================================

export interface MpesaSTKPushRequest {
  invoice_id: number;
  phone_number: string;
  amount: string;
  payment_point: number;
}

export interface MpesaSTKPushResponse {
  success: boolean;
  checkout_request_id: string;
  merchant_request_id: string;
  response_code: string;
  response_description: string;
  customer_message: string;
}

export interface MpesaCallbackData {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export interface MpesaQueryResponse {
  success: boolean;
  result_code: number;
  result_description: string;
  checkout_request_id: string;
  amount?: string;
  mpesa_receipt_number?: string;
  transaction_date?: string;
  phone_number?: string;
}

// ============================================================================
// Receipt Types
// ============================================================================

export interface ReceiptLineItem {
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface Receipt {
  id: number;
  receipt_number: string;
  payment: number;
  payment_reference?: string | null;
  invoice?: number | null;

  // Denormalized for printing
  patient_name: string;
  patient_mrn?: string | null;
  facility_name: string;
  facility_address?: string | null;
  facility_phone?: string | null;

  amount: string;
  amount_in_words: string;
  payment_method: PaymentMethod;
  receipt_date: string;

  // Line items (from invoice)
  line_items?: ReceiptLineItem[];

  // Served by / Till info
  issued_by?: number | null;
  issued_by_username?: string | null;
  received_by_username?: string | null;
  payment_point_name?: string | null;
  payment_point_code?: string | null;

  // QR code for validation (base64 data URI)
  qr_code?: string | null;

  // Void info
  is_voided: boolean;
  voided_at?: string | null;
  voided_by?: number | null;
  void_reason?: string | null;

  created_at: string;
  created_by?: number | null;
}

// ============================================================================
// Credit Note Types
// ============================================================================

export type CreditNoteReason =
  | 'OVERCHARGE'
  | 'SERVICE_NOT_RENDERED'
  | 'DUPLICATE_BILLING'
  | 'PRICING_ERROR'
  | 'OTHER';

export type CreditNoteStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REFUNDED';

export interface CreditNote {
  id: number;
  credit_note_number: string;
  invoice: number;
  invoice_number?: string | null;
  patient_name?: string | null;

  amount: string;
  reason: CreditNoteReason;
  reason_detail: string;
  status: CreditNoteStatus;

  // Workflow
  requested_by: number;
  requested_by_name?: string | null;
  created_at: string;

  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;

  rejected_by?: number | null;
  rejection_reason?: string | null;
  rejected_at?: string | null;

  refunded_at?: string | null;
  refund_reference?: string | null;
  refund_method?: PaymentMethod | null;
}

export interface CreditNoteCreateData {
  invoice: number;
  amount: string;
  reason: CreditNoteReason;
  // Legacy/API field
  reason_detail?: string;
  // UI-friendly alias used by some callers/tests
  description?: string;
}

export interface CreditNoteApprovalData {
  approved: boolean;
  rejection_reason?: string;
}

export interface CreditNoteRefundData {
  refund_method: PaymentMethod;
  refund_reference?: string;
}

// ============================================================================
// Report Types
// ============================================================================

export interface PaymentMethodBreakdown {
  amount: number;
  count: number;
}

export interface DailyCollectionReport {
  date: string;
  total_collected: string;
  total_amount: number;
  total_transactions: number;
  invoice_count: number;
  by_payment_method: Record<PaymentMethod, string>;
  by_method?: Record<PaymentMethod, PaymentMethodBreakdown>;
  recent_payments?: Array<{
    id: number;
    payment_reference: string;
    amount: string;
    method: PaymentMethod;
    created_at: string;
  }>;
}

export interface RevenueSummary {
  start_date: string;
  end_date: string;
  total_revenue: string;
  by_category: Array<{
    category: string;
    revenue: string;
    count: number;
  }>;
  by_payment_method: Record<PaymentMethod, string>;
}

export interface OutstandingBalance {
  invoice_id: number;
  invoice_number: string;
  patient_name: string;
  patient_mrn: string;
  invoice_date: string;
  due_date: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  days_overdue: number;
  status: InvoiceStatus;
}

export interface ServiceUtilization {
  service_id: number;
  service_name: string;
  service_code: string;
  category: string;
  count: number;
  total_revenue: string;
}

export interface PaymentMethodAnalysis {
  start_date: string;
  end_date: string;
  total_payments: number;
  total_amount: string;
  by_method: Array<{
    method: PaymentMethod;
    count: number;
    amount: string;
    percentage: string;
  }>;
  mpesa_success_rate?: string;
  average_payment_amount: string;
}

// ============================================================================
// List/Filter Types
// ============================================================================

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: InvoiceStatus;
  patient?: number;
  start_date?: string;
  end_date?: string;
  ordering?: string;
}

export interface PaymentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  invoice?: number;
  start_date?: string;
  end_date?: string;
  ordering?: string;
}

export interface ServiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  category?: number;
  is_active?: boolean;
  ordering?: string;
}

export interface CreditNoteListParams {
  page?: number;
  page_size?: number;
  status?: CreditNoteStatus;
  invoice?: number;
  ordering?: string;
}

// ============================================================================
// Paginated Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type PaginatedInvoices = PaginatedResponse<Invoice>;
export type PaginatedPayments = PaginatedResponse<Payment>;
export type PaginatedServices = PaginatedResponse<Service>;
export type PaginatedServiceCategories = PaginatedResponse<ServiceCategory>;
export type PaginatedCreditNotes = PaginatedResponse<CreditNote>;
export type PaginatedReceipts = PaginatedResponse<Receipt>;

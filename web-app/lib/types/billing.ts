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
  category_name?: string;
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
  | 'DRAFT' 
  | 'PENDING' 
  | 'PARTIAL' 
  | 'PAID' 
  | 'CANCELLED' 
  | 'OVERDUE';

export interface Invoice {
  id: number;
  invoice_number: string;
  patient: number;
  patient_name?: string;
  patient_mrn?: string;
  encounter?: number;
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
  sha_claim_number?: string;
  insurance_coverage: string;
  
  // Notes
  notes: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  created_by: number;
  finalized_at?: string;
  finalized_by?: number;
  cancelled_at?: string;
  cancelled_by?: number;
  cancellation_reason?: string;
  
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
  service?: number;
  service_name?: string;
  drug?: number;
  drug_name?: string;
  lab_order?: number;
  lab_order_name?: string;
  
  // Insurance
  is_covered_by_insurance: boolean;
  sha_code?: string;
  
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

export interface ApplyDiscountData {
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string;
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
  invoice_number?: string;
  patient_name?: string;
  
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  
  // M-Pesa specific
  mpesa_receipt_number?: string;
  mpesa_phone_number?: string;
  mpesa_checkout_request_id?: string;
  
  // Card specific
  card_last_four?: string;
  card_type?: string;
  card_authorization_code?: string;
  
  // Insurance specific
  insurance_claim_number?: string;
  insurance_approval_code?: string;
  
  // Processing
  processed_at?: string;
  processed_by?: number;
  failure_reason?: string;
  
  // Reversal/Refund
  reversed_at?: string;
  reversed_by?: number;
  reversal_reason?: string;
  refunded_at?: string;
  refund_reference?: string;
  
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: number;
}

export interface PaymentCreateData {
  invoice: number;
  amount: string;
  method: PaymentMethod;
  mpesa_phone_number?: string;
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

export interface Receipt {
  id: number;
  receipt_number: string;
  payment: number;
  payment_reference?: string;
  
  // Denormalized for printing
  patient_name: string;
  patient_mrn?: string;
  facility_name: string;
  facility_address?: string;
  facility_phone?: string;
  
  amount: string;
  amount_in_words: string;
  payment_method: PaymentMethod;
  receipt_date: string;
  
  // Void info
  is_voided: boolean;
  voided_at?: string;
  voided_by?: number;
  void_reason?: string;
  
  created_at: string;
  created_by: number;
}

// ============================================================================
// Credit Note Types
// ============================================================================

export type CreditNoteReason = 
  | 'OVERCHARGE' 
  | 'SERVICE_NOT_RENDERED' 
  | 'DUPLICATE_BILLING' 
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
  invoice_number?: string;
  patient_name?: string;
  
  amount: string;
  reason: CreditNoteReason;
  reason_detail: string;
  status: CreditNoteStatus;
  
  // Workflow
  requested_by: number;
  requested_by_name?: string;
  created_at: string;
  
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  
  rejected_by?: number;
  rejection_reason?: string;
  rejected_at?: string;
  
  refunded_at?: string;
  refund_reference?: string;
  refund_method?: PaymentMethod;
}

export interface CreditNoteCreateData {
  invoice: number;
  amount: string;
  reason: CreditNoteReason;
  reason_detail: string;
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

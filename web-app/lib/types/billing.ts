/**
 * Billing Type Definitions for Vitora HMIS
 *
 * Entity types are derived from Zod schemas to ensure runtime validation
 * matches static types. Input/request types are defined manually.
 *
 * @see lib/schemas/billing.schema.ts for schema definitions
 * @see backend/hmis/apps/billing/models.py
 */

// =============================================================================
// RE-EXPORT SCHEMA-DERIVED TYPES
// These types are inferred from Zod schemas for type safety
// =============================================================================

export type {
  // Enum types
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  CreditNoteReason,
  CreditNoteStatus,
  DiscountType,
  SHAAccreditationStatus,
  SHAServiceLevel,
  // Entity types
  ServiceCategory,
  Service,
  InvoiceItem,
  Invoice,
  PaymentPoint,
  Payment,
  ReceiptLineItem,
  Receipt,
  CreditNote,
  OutstandingBalance,
  ServiceUtilization,
  BillingDiscrepancy,
  UnbilledService,
  MpesaSTKPushResponse,
  MpesaQueryResponse,
  DailyCollectionReport,
  RevenueSummary,
  PaymentMethodAnalysis,
  DailyClosureReport,
  FacilityBillingConfig,
  SHAContractSummary,
  // Paginated types
  PaginatedServiceCategories,
  PaginatedServices,
  PaginatedInvoices,
  PaginatedPayments,
  PaginatedPaymentPoints,
  PaginatedCreditNotes,
  PaginatedReceipts,
  PaginatedFacilityBillingConfigs,
} from '@/lib/schemas/billing.schema';

// =============================================================================
// INPUT/REQUEST TYPES (manually defined - not from API responses)
// =============================================================================

// ----------------------------------------------------------------------------
// Service Input Types
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Invoice Input Types
// ----------------------------------------------------------------------------

/**
 * Invoice payment type matching backend Invoice.PaymentType
 */
export type InvoicePaymentType = 'CASH' | 'MPESA' | 'INSURANCE' | 'CORPORATE' | 'MIXED';

export interface InvoiceCreateData {
  patient: number;
  encounter?: number;
  due_date: string;
  notes?: string;
  payment_type?: InvoicePaymentType;
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
  valid_until?: string;
}

/**
 * Request data for converting proforma to invoice
 */
export interface ProformaConvertRequest {
  item_ids?: number[];
}

/**
 * Request data for renewing expired proforma
 */
export interface ProformaRenewRequest {
  validity_days?: number;
}

export interface ApplyDiscountData {
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: string;
  discount_reason?: string;
}

// ----------------------------------------------------------------------------
// Payment Input Types
// ----------------------------------------------------------------------------

export interface PaymentPointListParams {
  method?: 'CASH' | 'MPESA' | 'CARD' | 'INSURANCE' | 'BANK_TRANSFER' | 'CORPORATE' | 'CHEQUE';
  is_active?: boolean;
}

export interface PaymentCreateData {
  invoice: number;
  amount: string;
  method: 'CASH' | 'MPESA' | 'CARD' | 'INSURANCE' | 'BANK_TRANSFER' | 'CORPORATE' | 'CHEQUE';
  payment_point?: number;
  payment_details?: Record<string, unknown>;
  mpesa_phone?: string;
  mpesa_receipt_number?: string;
  card_last_four?: string;
  card_type?: string;
  insurance_claim_number?: string;
  notes?: string;
}

// ----------------------------------------------------------------------------
// M-Pesa Types
// ----------------------------------------------------------------------------

export interface MpesaSTKPushRequest {
  invoice_id: number;
  phone_number: string;
  amount: string;
  payment_point: number;
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

// ----------------------------------------------------------------------------
// Credit Note Input Types
// ----------------------------------------------------------------------------

export interface CreditNoteCreateData {
  invoice: number;
  amount: string;
  reason: 'OVERCHARGE' | 'SERVICE_NOT_RENDERED' | 'DUPLICATE_BILLING' | 'DUPLICATE' | 'DUPLICATE_CHARGE' | 'PRICING_ERROR' | 'OTHER' | 'INSURANCE' | 'INSURANCE_ADJUSTMENT' | 'GOODWILL';
  reason_detail: string;
}

export interface CreditNoteApprovalData {
  notes?: string;
}

export interface CreditNoteRefundData {
  refund_method: 'CASH' | 'MPESA' | 'CARD' | 'INSURANCE' | 'BANK_TRANSFER' | 'CORPORATE' | 'CHEQUE';
  refund_reference?: string;
  notes?: string;
}

// ----------------------------------------------------------------------------
// Report Request Types
// ----------------------------------------------------------------------------

export interface DailyCollectionReportParams {
  date?: string;
  payment_point?: number;
}

export interface RevenueSummaryParams {
  start_date?: string;
  end_date?: string;
  group_by?: 'day' | 'week' | 'month';
}

// =============================================================================
// LIST/FILTER PARAMETER TYPES
// =============================================================================

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: 'PROFORMA' | 'DRAFT' | 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED' | 'OVERDUE' | 'WRITTEN_OFF';
  payment_type?: 'CASH' | 'MPESA' | 'INSURANCE' | 'CORPORATE' | 'MIXED';
  patient?: number;
  start_date?: string;
  end_date?: string;
  ordering?: string;
}

export interface PaymentListParams {
  page?: number;
  page_size?: number;
  search?: string;
  method?: 'CASH' | 'MPESA' | 'CARD' | 'INSURANCE' | 'BANK_TRANSFER' | 'CORPORATE' | 'CHEQUE';
  status?: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'REVERSED';
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
  status?: 'PENDING' | 'DRAFT' | 'APPROVED' | 'REJECTED' | 'REFUNDED';
  invoice?: number;
  ordering?: string;
}

// =============================================================================
// GENERIC PAGINATED RESPONSE (for compatibility)
// =============================================================================

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// =============================================================================
// FACILITY BILLING CONFIG INPUT TYPES
// =============================================================================

export interface FacilityBillingConfigCreateData {
  facility: number;
  default_payment_type?: string;
  default_due_days?: number;
  auto_finalize_on_checkout?: boolean;
  tax_rate?: string;
  sha_accreditation_status?: string;
  sha_accreditation_date?: string;
  sha_accreditation_expiry?: string;
  sha_contract_number?: string;
  sha_contract_start?: string;
  sha_contract_end?: string;
  sha_service_level?: string;
  sha_max_claim_amount?: string;
  fee_schedule_name?: string;
  fee_schedule_override?: Record<string, unknown>;
  mpesa_paybill?: string;
  mpesa_account_ref?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_branch?: string;
  // M-Pesa API credentials (per-facility)
  mpesa_consumer_key?: string;
  mpesa_consumer_secret?: string;
  mpesa_passkey?: string;
  mpesa_shortcode?: string;
  mpesa_callback_url?: string;
  mpesa_environment?: string;
}

export interface FacilityBillingConfigUpdateData extends Partial<Omit<FacilityBillingConfigCreateData, 'facility'>> {}

export interface FacilityBillingConfigListParams {
  page?: number;
  page_size?: number;
  facility?: number;
  sha_accreditation_status?: string;
  is_sha_contract_active?: boolean;
}

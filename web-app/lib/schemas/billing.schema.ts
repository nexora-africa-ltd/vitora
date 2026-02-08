/**
 * Zod schemas for Billing API response validation
 *
 * Implements validation for all billing-related API responses.
 * See lib/types/billing.ts for corresponding TypeScript interfaces.
 */
import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const InvoiceStatusSchema = z.enum([
  'PROFORMA',
  'DRAFT',
  'PENDING',
  'PARTIAL',
  'PAID',
  'CANCELLED',
  'OVERDUE',
  'WRITTEN_OFF',
]);

export const PaymentMethodSchema = z.enum([
  'CASH',
  'MPESA',
  'CARD',
  'INSURANCE',
  'BANK_TRANSFER',
  'CORPORATE',
  'CHEQUE',
]);

export const PaymentStatusSchema = z.enum([
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'REVERSED',
]);

export const CreditNoteReasonSchema = z.enum([
  'OVERCHARGE',
  'SERVICE_NOT_RENDERED',
  'DUPLICATE_BILLING',
  'PRICING_ERROR',
  'OTHER',
  'DUPLICATE',
  'INSURANCE',
  'GOODWILL',
]);

export const CreditNoteStatusSchema = z.enum([
  'PENDING',
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'REFUNDED',
]);

export const DiscountTypeSchema = z.enum(['PERCENTAGE', 'FIXED']);

// =============================================================================
// SERVICE CATEGORY SCHEMA
// =============================================================================

export const ServiceCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  description: z.string(),
  display_order: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ServiceCategorySchemaType = z.infer<typeof ServiceCategorySchema>;

// =============================================================================
// SERVICE SCHEMA
// =============================================================================

export const ServiceSchema = z.object({
  id: z.number(),
  category: z.number(),
  category_name: z.string().optional().nullable(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  unit_price: z.string(),
  currency: z.string(),
  sha_code: z.string(),
  icd10_code: z.string(),
  is_active: z.boolean(),
  is_available: z.boolean().optional(),
  requires_quantity: z.boolean(),
  is_taxable: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number(),
  created_by_username: z.string().optional().nullable(),
});

export type ServiceSchemaType = z.infer<typeof ServiceSchema>;

// =============================================================================
// INVOICE ITEM SCHEMA (defined before Invoice for nesting)
// =============================================================================

export const InvoiceItemSchema = z.object({
  id: z.number(),
  invoice: z.number(),
  description: z.string(),
  quantity: z.number(),
  unit_price: z.string(),
  discount_percentage: z.string(),
  line_total: z.string(),
  discount_amount: z.string().optional().nullable(),

  // Linked entities
  service: z.number().optional().nullable(),
  service_name: z.string().optional().nullable(),
  drug: z.number().optional().nullable(),
  drug_name: z.string().optional().nullable(),
  lab_order: z.number().optional().nullable(),
  lab_order_name: z.string().optional().nullable(),

  // Insurance
  is_covered_by_insurance: z.boolean(),
  sha_code: z.string().optional().nullable(),
  insurance_approved_amount: z.string().optional().nullable(),

  // Proforma conversion tracking
  is_converted: z.boolean(),
  converted_at: z.string().optional().nullable(),
  converted_from_item: z.number().optional().nullable(),

  created_at: z.string(),
  updated_at: z.string(),
});

export type InvoiceItemSchemaType = z.infer<typeof InvoiceItemSchema>;

// =============================================================================
// INVOICE SCHEMA
// =============================================================================

export const InvoiceSchema = z.object({
  id: z.number(),
  invoice_number: z.string(),
  patient: z.number(),
  patient_name: z.string().optional().nullable(),
  patient_mrn: z.string().optional().nullable(),
  encounter: z.number().optional().nullable(),
  status: InvoiceStatusSchema,
  invoice_date: z.string(),
  due_date: z.string(),

  // Totals
  subtotal: z.string(),
  discount_type: DiscountTypeSchema.nullable(),
  discount_value: z.string(),
  discount_amount: z.string(),
  tax_amount: z.string(),
  total_amount: z.string(),
  amount_paid: z.string(),
  balance_due: z.string(),
  balance: z.string().optional().nullable(),

  // Insurance/SHA
  sha_claim_number: z.string().optional().nullable(),
  insurance_coverage: z.string(),
  insurance_provider: z.string().optional().nullable(),
  insurance_member_no: z.string().optional().nullable(),
  insurance_amount: z.string().optional().nullable(),
  payment_type: z.string().optional().nullable(),
  discount_reason: z.string().optional().nullable(),

  // Notes
  notes: z.string(),

  // Metadata
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number(),
  created_by_username: z.string().optional().nullable(),
  finalized_at: z.string().optional().nullable(),
  finalized_by: z.number().optional().nullable(),
  cancelled_at: z.string().optional().nullable(),
  cancelled_by: z.number().optional().nullable(),
  cancellation_reason: z.string().optional().nullable(),

  // Proforma-specific fields
  valid_until: z.string().optional().nullable(),
  is_converted: z.boolean(),
  converted_at: z.string().optional().nullable(),
  converted_from_proforma: z.number().optional().nullable(),
  is_valid: z.boolean(),
  days_until_expiry: z.number(),
  can_convert: z.boolean(),

  // QR code
  qr_code: z.string().optional().nullable(),

  // Nested items
  items: z.array(InvoiceItemSchema).optional(),
});

export type InvoiceSchemaType = z.infer<typeof InvoiceSchema>;

// =============================================================================
// PAYMENT POINT SCHEMA
// =============================================================================

export const PaymentPointSchema = z.object({
  id: z.number(),
  name: z.string(),
  code: z.string(),
  method: PaymentMethodSchema,

  // M-Pesa
  till_number: z.string().optional().nullable(),
  paybill_number: z.string().optional().nullable(),
  paybill_account_number: z.string().optional().nullable(),

  // Bank
  bank_name: z.string().optional().nullable(),
  bank_account_name: z.string().optional().nullable(),
  bank_account_number: z.string().optional().nullable(),
  bank_branch: z.string().optional().nullable(),

  is_active: z.boolean(),
  notes: z.string().optional().nullable(),

  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number(),
  created_by_username: z.string().optional().nullable(),
});

export type PaymentPointSchemaType = z.infer<typeof PaymentPointSchema>;

// =============================================================================
// PAYMENT SCHEMA
// =============================================================================

export const PaymentSchema = z.object({
  id: z.number(),
  payment_reference: z.string(),
  invoice: z.number(),
  invoice_number: z.string().optional().nullable(),
  patient_name: z.string().optional().nullable(),

  payment_point: z.number().optional().nullable(),

  amount: z.string(),
  method: PaymentMethodSchema,
  status: PaymentStatusSchema,

  // M-Pesa specific
  mpesa_receipt_number: z.string().optional().nullable(),
  mpesa_phone_number: z.string().optional().nullable(),
  mpesa_checkout_request_id: z.string().optional().nullable(),

  // Card specific
  card_last_four: z.string().optional().nullable(),
  card_type: z.string().optional().nullable(),
  card_authorization_code: z.string().optional().nullable(),

  // Insurance specific
  insurance_claim_number: z.string().optional().nullable(),
  insurance_approval_code: z.string().optional().nullable(),
  payment_details: z.record(z.unknown()).optional(),
  mpesa_transaction_id: z.string().optional().nullable(),
  mpesa_phone: z.string().optional().nullable(),
  received_by: z.number().optional().nullable(),
  received_by_username: z.string().optional().nullable(),

  // Processing
  processed_at: z.string().optional().nullable(),
  processed_by: z.number().optional().nullable(),
  failure_reason: z.string().optional().nullable(),
  payment_date: z.string().optional().nullable(),

  // Reversal/Refund
  reversed_at: z.string().optional().nullable(),
  reversed_by: z.number().optional().nullable(),
  reversal_reason: z.string().optional().nullable(),
  refunded_at: z.string().optional().nullable(),
  refund_reference: z.string().optional().nullable(),

  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.number(),
});

export type PaymentSchemaType = z.infer<typeof PaymentSchema>;

// =============================================================================
// RECEIPT SCHEMA
// =============================================================================

export const ReceiptLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit_price: z.string(),
  line_total: z.string(),
});

export const ReceiptSchema = z.object({
  id: z.number(),
  receipt_number: z.string(),
  payment: z.number(),
  payment_reference: z.string().optional().nullable(),
  invoice: z.number().optional().nullable(),

  // Denormalized for printing
  patient_name: z.string(),
  patient_mrn: z.string().optional().nullable(),
  facility_name: z.string(),
  facility_address: z.string().optional().nullable(),
  facility_phone: z.string().optional().nullable(),

  amount: z.string(),
  amount_in_words: z.string(),
  payment_method: PaymentMethodSchema,
  receipt_date: z.string(),

  // Line items
  line_items: z.array(ReceiptLineItemSchema).optional(),

  // Served by / Till info
  issued_by: z.number().optional().nullable(),
  issued_by_username: z.string().optional().nullable(),
  received_by_username: z.string().optional().nullable(),
  payment_point_name: z.string().optional().nullable(),
  payment_point_code: z.string().optional().nullable(),

  // QR code
  qr_code: z.string().optional().nullable(),

  // Void info
  is_voided: z.boolean(),
  voided_at: z.string().optional().nullable(),
  voided_by: z.number().optional().nullable(),
  void_reason: z.string().optional().nullable(),

  created_at: z.string(),
  created_by: z.number().optional().nullable(),
});

export type ReceiptSchemaType = z.infer<typeof ReceiptSchema>;

// =============================================================================
// CREDIT NOTE SCHEMA
// =============================================================================

export const CreditNoteSchema = z.object({
  id: z.number(),
  credit_note_number: z.string(),
  invoice: z.number(),
  invoice_number: z.string().optional().nullable(),
  patient: z.number().optional().nullable(),
  patient_name: z.string().optional().nullable(),

  amount: z.string(),
  reason: CreditNoteReasonSchema,
  reason_detail: z.string(),
  status: CreditNoteStatusSchema,

  // Workflow
  requested_by: z.number(),
  requested_by_name: z.string().optional().nullable(),
  requested_by_username: z.string().optional().nullable(),
  created_at: z.string(),

  approved_by: z.number().optional().nullable(),
  approved_by_name: z.string().optional().nullable(),
  approved_by_username: z.string().optional().nullable(),
  approved_at: z.string().optional().nullable(),

  rejected_by: z.number().optional().nullable(),
  rejection_reason: z.string().optional().nullable(),
  rejected_at: z.string().optional().nullable(),

  refunded_at: z.string().optional().nullable(),
  refund_reference: z.string().optional().nullable(),
  refund_method: PaymentMethodSchema.optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export type CreditNoteSchemaType = z.infer<typeof CreditNoteSchema>;

// =============================================================================
// M-PESA SCHEMAS
// =============================================================================

export const MpesaSTKPushResponseSchema = z.object({
  success: z.boolean(),
  checkout_request_id: z.string(),
  merchant_request_id: z.string(),
  response_code: z.string(),
  response_description: z.string(),
  customer_message: z.string(),
});

export const MpesaQueryResponseSchema = z.object({
  success: z.boolean(),
  result_code: z.number(),
  result_description: z.string(),
  checkout_request_id: z.string(),
  amount: z.string().optional(),
  mpesa_receipt_number: z.string().optional(),
  transaction_date: z.string().optional(),
  phone_number: z.string().optional(),
});

// =============================================================================
// REPORT SCHEMAS
// =============================================================================

export const PaymentMethodBreakdownSchema = z.object({
  amount: z.number(),
  count: z.number(),
});

export const DailyCollectionReportSchema = z.object({
  date: z.string(),
  total_collected: z.string(),
  total_amount: z.number(),
  total_transactions: z.number(),
  invoice_count: z.number(),
  by_payment_method: z.record(z.string()),
  by_method: z.record(PaymentMethodBreakdownSchema).optional(),
  recent_payments: z.array(z.object({
    id: z.number(),
    payment_reference: z.string(),
    amount: z.string(),
    method: PaymentMethodSchema,
    created_at: z.string(),
  })).optional(),
});

export const RevenueSummarySchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  total_revenue: z.string(),
  by_category: z.array(z.object({
    category: z.string(),
    revenue: z.string(),
    count: z.number(),
  })),
  by_payment_method: z.record(z.string()),
});

export const OutstandingBalanceSchema = z.object({
  invoice_id: z.number(),
  invoice_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  invoice_date: z.string(),
  due_date: z.string(),
  total_amount: z.string(),
  amount_paid: z.string(),
  balance_due: z.string(),
  days_overdue: z.number(),
  status: InvoiceStatusSchema,
});

export const ServiceUtilizationSchema = z.object({
  service_id: z.number(),
  service_name: z.string(),
  service_code: z.string(),
  category: z.string(),
  count: z.number(),
  total_revenue: z.string(),
});

export const PaymentMethodAnalysisSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
  total_payments: z.number(),
  total_amount: z.string(),
  by_method: z.array(z.object({
    method: PaymentMethodSchema,
    count: z.number(),
    amount: z.string(),
    percentage: z.string(),
  })),
  mpesa_success_rate: z.string().optional(),
  average_payment_amount: z.string(),
});

export const DailyClosureReportSchema = z.object({
  date: z.string(),
  total_invoiced: z.string(),
  total_collected: z.string(),
  outstanding: z.string(),
  by_department: z.array(z.object({
    department: z.string(),
    invoiced: z.string(),
    collected: z.string(),
  })),
  by_payment_method: z.record(z.string()),
  transaction_count: z.number(),
});

export const BillingDiscrepancySchema = z.object({
  id: z.number(),
  encounter_id: z.number().nullable(),
  invoice_number: z.string(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  service_name: z.string(),
  expected_amount: z.string(),
  billed_amount: z.string(),
  discrepancy: z.string(),
  date: z.string(),
  status: z.enum(['PENDING', 'RESOLVED']),
});

export const UnbilledServiceSchema = z.object({
  department: z.string(),
  services_count: z.number(),
  total_amount: z.string(),
});

// =============================================================================
// PAGINATED RESPONSES
// =============================================================================

export const PaginatedServiceCategorySchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ServiceCategorySchema),
});

export const PaginatedServiceSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ServiceSchema),
});

export const PaginatedInvoiceSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(InvoiceSchema),
});

export const PaginatedPaymentSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PaymentSchema),
});

export const PaginatedPaymentPointSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(PaymentPointSchema),
});

export const PaginatedCreditNoteSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(CreditNoteSchema),
});

export const PaginatedReceiptSchema = z.object({
  count: z.number(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  results: z.array(ReceiptSchema),
});

// =============================================================================
// ARRAY RESPONSES
// =============================================================================

export const ServiceCategoryArraySchema = z.array(ServiceCategorySchema);
export const ServiceArraySchema = z.array(ServiceSchema);
export const InvoiceArraySchema = z.array(InvoiceSchema);
export const InvoiceItemArraySchema = z.array(InvoiceItemSchema);
export const PaymentArraySchema = z.array(PaymentSchema);
export const CreditNoteArraySchema = z.array(CreditNoteSchema);
export const OutstandingBalanceArraySchema = z.array(OutstandingBalanceSchema);
export const ServiceUtilizationArraySchema = z.array(ServiceUtilizationSchema);
export const BillingDiscrepancyArraySchema = z.array(BillingDiscrepancySchema);
export const UnbilledServiceArraySchema = z.array(UnbilledServiceSchema);

export const InvoiceItemArrayResponseSchema = z.object({
  results: z.array(InvoiceItemSchema),
});

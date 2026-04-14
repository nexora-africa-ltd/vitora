import { z } from 'zod';

const numberLike = z.union([z.number(), z.string()]).pipe(z.coerce.number());

const paginated = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    count: z.number(),
    next: z.string().nullable(),
    previous: z.string().nullable(),
    results: z.array(itemSchema),
  });

export const InvoiceStatusSchema = z.enum(['proforma', 'draft', 'pending', 'partial', 'paid', 'overdue', 'cancelled', 'written_off']);

export const InvoiceItemSchema = z.object({
  id: z.number(),
  invoice: z.number().optional(),
  service: z.number().optional().nullable(),
  service_name: z.string().optional().nullable(),
  drug: z.number().optional().nullable(),
  drug_name: z.string().optional().nullable(),
  lab_order: z.number().optional().nullable(),
  lab_order_name: z.string().optional().nullable(),
  description: z.string(),
  quantity: numberLike,
  unit_price: numberLike,
  discount_amount: numberLike,
  discount_percentage: numberLike.optional().nullable(),
  line_total: numberLike,
  is_covered_by_insurance: z.boolean(),
  insurance_approved_amount: numberLike.optional().nullable(),
  sha_code: z.string().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const InvoiceSchema = z.object({
  id: z.number(),
  invoice_number: z.string(),
  patient: z.number(),
  patient_name: z.string(),
  patient_mrn: z.string(),
  encounter: z.number().optional().nullable(),
  invoice_date: z.string(),
  due_date: z.string().optional().nullable(),
  status: InvoiceStatusSchema,
  payment_type: z.string(),
  subtotal: numberLike,
  discount_type: z.string().optional().nullable(),
  discount_value: numberLike.optional().nullable(),
  discount_amount: numberLike,
  discount_reason: z.string().optional().nullable(),
  tax_amount: numberLike,
  total_amount: numberLike,
  amount_paid: numberLike,
  balance: numberLike,
  balance_due: numberLike,
  insurance_provider: z.string().optional().nullable(),
  insurance_member_no: z.string().optional().nullable(),
  sha_claim_number: z.string().optional().nullable(),
  insurance_amount: numberLike.optional().nullable(),
  insurance_coverage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  created_by_username: z.string().optional().nullable(),
  items: z.array(InvoiceItemSchema),
  qr_code: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PaymentSchema = z.object({
  id: z.number(),
  payment_reference: z.string(),
  invoice: z.number(),
  invoice_number: z.string(),
  method: z.string(),
  payment_point: z.number().optional().nullable(),
  payment_details: z.string().optional().nullable(),
  amount: numberLike,
  status: z.string(),
  notes: z.string().optional().nullable(),
  received_by_username: z.string().optional().nullable(),
  payment_date: z.string(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const PaginatedInvoiceSchema = paginated(InvoiceSchema);
export const PaginatedPaymentSchema = paginated(PaymentSchema);

/**
 * Billing type definitions for the mobile app.
 *
 * Mirrors the backend billing serializers for invoice and payment reads.
 */

export type InvoiceStatus =
  | 'proforma'
  | 'draft'
  | 'pending'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'written_off';

export interface InvoiceLineItem {
  id: number;
  invoice?: number;
  service: number | null;
  service_name: string | null;
  drug?: number | null;
  drug_name?: string | null;
  lab_order?: number | null;
  lab_order_name?: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  discount_amount: string;
  discount_percentage?: string;
  line_total: string;
  is_covered_by_insurance: boolean;
  insurance_approved_amount: string | null;
  sha_code: string | null;
  is_converted?: boolean;
  converted_at?: string | null;
  converted_from_item?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  payment_type: string;
  subtotal: string;
  discount_type: string | null;
  discount_value: string | null;
  discount_amount: string;
  discount_reason: string;
  tax_amount: string;
  total_amount: string;
  amount_paid: string;
  balance: string;
  balance_due: string;
  insurance_provider?: string | null;
  insurance_member_no?: string | null;
  sha_claim_number?: string | null;
  insurance_amount?: string | null;
  insurance_coverage?: string | null;
  notes?: string;
  cancellation_reason?: string | null;
  cancelled_by?: number | null;
  cancelled_at?: string | null;
  valid_until?: string | null;
  is_converted?: boolean;
  converted_at?: string | null;
  converted_from_proforma?: number | null;
  is_valid?: boolean;
  days_until_expiry?: number | null;
  can_convert?: boolean;
  created_by?: number | null;
  created_by_username?: string | null;
  items: InvoiceLineItem[];
  qr_code: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceListItem {
  id: number;
  invoice_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter: number | null;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  payment_type: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
}

export interface InvoiceListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: InvoiceListItem[];
}

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: InvoiceStatus;
  patient?: number;
  encounter?: number;
  payment_type?: string;
  start_date?: string;
  end_date?: string;
  ordering?: string;
}

export interface Payment {
  id: number;
  payment_reference: string;
  invoice: number;
  invoice_number: string;
  method: string;
  payment_point: number | null;
  payment_details?: string | null;
  amount: string;
  status: string;
  mpesa_receipt_number?: string | null;
  mpesa_transaction_id?: string | null;
  mpesa_phone?: string | null;
  notes?: string | null;
  received_by?: number | null;
  received_by_username?: string | null;
  payment_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Payment[];
}

export interface PaymentListParams {
  invoice?: number;
  method?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface CreatePaymentData {
  invoice: number;
  method: string;
  amount: string;
  payment_point?: number | null;
  payment_details?: string;
  notes?: string;
}
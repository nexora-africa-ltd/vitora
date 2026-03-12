import type { PaginatedResponse } from './common';

export type InvoiceStatus = 'proforma' | 'draft' | 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'written_off';

export interface InvoiceItem {
  id: number;
  invoice?: number;
  service?: number | null;
  service_name?: string | null;
  drug?: number | null;
  drug_name?: string | null;
  lab_order?: number | null;
  lab_order_name?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  discount_percentage?: number | null;
  line_total: number;
  is_covered_by_insurance: boolean;
  insurance_approved_amount?: number | null;
  sha_code?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  patient: number;
  patient_name: string;
  patient_mrn: string;
  encounter?: number | null;
  invoice_date: string;
  due_date?: string | null;
  status: InvoiceStatus;
  payment_type: string;
  subtotal: number;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount: number;
  discount_reason?: string | null;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  balance_due: number;
  insurance_provider?: string | null;
  insurance_member_no?: string | null;
  sha_claim_number?: string | null;
  insurance_amount?: number | null;
  insurance_coverage?: string | null;
  notes?: string | null;
  created_by_username?: string | null;
  items: InvoiceItem[];
  qr_code?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: number;
  payment_reference: string;
  invoice: number;
  invoice_number: string;
  method: string;
  payment_point?: number | null;
  payment_details?: string | null;
  amount: number;
  status: string;
  notes?: string | null;
  received_by_username?: string | null;
  payment_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceListParams {
  page?: number;
  page_size?: number;
  search?: string;
  patient?: number;
  encounter?: number;
  status?: InvoiceStatus;
  ordering?: string;
}

export interface PaymentListParams {
  page?: number;
  page_size?: number;
  invoice?: number;
  method?: string;
  status?: string;
}

export type PaginatedInvoiceResponse = PaginatedResponse<Invoice>;
export type PaginatedPaymentResponse = PaginatedResponse<Payment>;
import { InvoiceSchema, PaginatedInvoiceSchema, PaginatedPaymentSchema } from '@/lib/schemas/billing.schema';
import { parseResponse } from '@/lib/schemas/validation';
import type { Invoice, InvoiceListParams, PaginatedInvoiceResponse, PaginatedPaymentResponse, PaymentListParams } from '@/lib/types/billing';

import { apiClient } from './client';

export const billingApi = {
  async listInvoices(params: InvoiceListParams = {}): Promise<PaginatedInvoiceResponse> {
    const response = await apiClient.get('/api/billing/invoices/', { params });
    return parseResponse(PaginatedInvoiceSchema, response.data, { context: 'billing.listInvoices' });
  },

  async getInvoice(id: number): Promise<Invoice> {
    const response = await apiClient.get(`/api/billing/invoices/${id}/`);
    return parseResponse(InvoiceSchema, response.data, { context: 'billing.getInvoice' });
  },

  async listPayments(params: PaymentListParams = {}): Promise<PaginatedPaymentResponse> {
    const response = await apiClient.get('/api/billing/payments/', { params });
    return parseResponse(PaginatedPaymentSchema, response.data, { context: 'billing.listPayments' });
  },
};
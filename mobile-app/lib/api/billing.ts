/**
 * Billing API Module
 *
 * Provides type-safe methods for invoice and payment operations.
 *
 * @module lib/api/billing
 */

import type {
  CreatePaymentData,
  Invoice,
  InvoiceListParams,
  InvoiceListResponse,
  Payment,
  PaymentListParams,
  PaymentListResponse,
} from '@/lib/types/billing';
import { getApiClient } from './client';

export type {
  CreatePaymentData,
  Invoice,
  InvoiceLineItem,
  InvoiceListItem,
  InvoiceListParams,
  InvoiceListResponse,
  InvoiceStatus,
  Payment,
  PaymentListParams,
  PaymentListResponse,
} from '@/lib/types/billing';

// ── API Methods ────────────────────────────────────────────────

export const billingApi = {
  /**
   * List invoices with pagination and filtering
   */
  async list(params?: InvoiceListParams): Promise<InvoiceListResponse> {
    const client = getApiClient();
    const response = await client.get<InvoiceListResponse>(
      '/api/billing/invoices/',
      { params },
    );
    return response.data;
  },

  /**
   * Get a single invoice by ID (includes items)
   */
  async get(id: number): Promise<Invoice> {
    const client = getApiClient();
    const response = await client.get<Invoice>(
      `/api/billing/invoices/${id}/`,
    );
    return response.data;
  },

  /**
   * List payments with optional invoice filtering.
   */
  async listPayments(params?: PaymentListParams): Promise<PaymentListResponse> {
    const client = getApiClient();
    const response = await client.get<PaymentListResponse>(
      '/api/billing/payments/',
      { params },
    );
    return response.data;
  },

  /**
   * Finalize (submit) a draft invoice
   */
  async finalize(id: number): Promise<Invoice> {
    const client = getApiClient();
    const response = await client.post<Invoice>(
      `/api/billing/invoices/${id}/finalize/`,
    );
    return response.data;
  },

  /**
   * Cancel an invoice with a reason
   */
  async cancel(id: number, reason: string): Promise<Invoice> {
    const client = getApiClient();
    const response = await client.post<Invoice>(
      `/api/billing/invoices/${id}/cancel/`,
      { reason },
    );
    return response.data;
  },

  /**
   * Record a payment against an invoice
   */
  async recordPayment(data: CreatePaymentData): Promise<Payment> {
    const client = getApiClient();
    const response = await client.post<Payment>(
      '/api/billing/payments/',
      data,
    );
    return response.data;
  },
};

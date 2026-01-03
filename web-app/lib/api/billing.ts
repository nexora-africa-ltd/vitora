/**
 * Billing API Client for Vitora HMIS
 * 
 * Implements all billing-related API operations including:
 * - Service categories and services
 * - Invoices and invoice items
 * - Payments (Cash, M-Pesa, Card, Insurance)
 * - Credit notes
 * - Financial reports
 * 
 * @see backend/hmis/apps/billing/
 */
import { apiClient } from './client';
import type {
  // Service types
  ServiceCategory,
  Service,
  ServiceCreateData,
  ServiceUpdateData,
  ServiceListParams,
  PaginatedServiceCategories,
  PaginatedServices,
  // Invoice types
  Invoice,
  InvoiceItem,
  InvoiceCreateData,
  InvoiceUpdateData,
  InvoiceItemCreateData,
  InvoiceListParams,
  ApplyDiscountData,
  PaginatedInvoices,
  // Payment types
  Payment,
  PaymentCreateData,
  PaymentListParams,
  PaginatedPayments,
  // M-Pesa types
  MpesaSTKPushRequest,
  MpesaSTKPushResponse,
  MpesaQueryResponse,
  // Receipt
  Receipt,
  // Credit Note types
  CreditNote,
  CreditNoteCreateData,
  CreditNoteListParams,
  CreditNoteRefundData,
  PaginatedCreditNotes,
  // Report types
  DailyCollectionReport,
  RevenueSummary,
  OutstandingBalance,
  ServiceUtilization,
  PaymentMethodAnalysis,
} from '@/lib/types/billing';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build query string from params object
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  return searchParams.toString();
}

// ============================================================================
// Service Categories API
// ============================================================================

async function getServiceCategories(
  params?: { is_active?: boolean }
): Promise<PaginatedServiceCategories> {
  const queryString = params ? buildQueryString(params) : '';
  const url = queryString
    ? `/api/billing/categories/?${queryString}`
    : '/api/billing/categories/';
  const response = await apiClient.get(url);
  return response.data;
}

async function getServiceCategory(id: number): Promise<ServiceCategory> {
  const response = await apiClient.get(`/api/billing/categories/${id}/`);
  return response.data;
}

// ============================================================================
// Services API
// ============================================================================

async function getServices(params?: ServiceListParams): Promise<PaginatedServices> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/services/?${queryString}`;
  const response = await apiClient.get(url);
  return response.data;
}

async function getService(id: number): Promise<Service> {
  const response = await apiClient.get(`/api/billing/services/${id}/`);
  return response.data;
}

async function createService(data: ServiceCreateData): Promise<Service> {
  const response = await apiClient.post('/api/billing/services/', data);
  return response.data;
}

async function updateService(
  id: number,
  data: ServiceUpdateData
): Promise<Service> {
  const response = await apiClient.patch(`/api/billing/services/${id}/`, data);
  return response.data;
}

async function deleteService(id: number): Promise<void> {
  await apiClient.delete(`/api/billing/services/${id}/`);
}

// ============================================================================
// Invoices API
// ============================================================================

async function getInvoices(params?: InvoiceListParams): Promise<PaginatedInvoices> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/invoices/?${queryString}`;
  const response = await apiClient.get(url);
  return response.data;
}

async function getInvoice(id: number): Promise<Invoice> {
  const response = await apiClient.get(`/api/billing/invoices/${id}/`);
  return response.data;
}

async function createInvoice(data: InvoiceCreateData): Promise<Invoice> {
  const response = await apiClient.post('/api/billing/invoices/', data);
  return response.data;
}

async function updateInvoice(
  id: number,
  data: InvoiceUpdateData
): Promise<Invoice> {
  const response = await apiClient.patch(`/api/billing/invoices/${id}/`, data);
  return response.data;
}

async function finalizeInvoice(id: number): Promise<Invoice> {
  const response = await apiClient.post(`/api/billing/invoices/${id}/finalize/`);
  return response.data;
}

async function cancelInvoice(id: number, reason: string): Promise<Invoice> {
  const response = await apiClient.post(`/api/billing/invoices/${id}/cancel/`, {
    reason,
  });
  return response.data;
}

async function addInvoiceItem(
  invoiceId: number,
  data: InvoiceItemCreateData
): Promise<InvoiceItem> {
  const response = await apiClient.post(
    `/api/billing/invoices/${invoiceId}/add_item/`,
    data
  );
  return response.data;
}

async function removeInvoiceItem(
  invoiceId: number,
  itemId: number
): Promise<void> {
  await apiClient.delete(
    `/api/billing/invoices/${invoiceId}/remove_item/${itemId}/`
  );
}

async function applyDiscount(
  invoiceId: number,
  data: ApplyDiscountData
): Promise<Invoice> {
  const response = await apiClient.post(
    `/api/billing/invoices/${invoiceId}/apply_discount/`,
    data
  );
  return response.data;
}

async function getOverdueInvoices(): Promise<PaginatedInvoices> {
  const response = await apiClient.get('/api/billing/invoices/overdue/');
  return response.data;
}

// ============================================================================
// Payments API
// ============================================================================

async function getPayments(params?: PaymentListParams): Promise<PaginatedPayments> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/payments/?${queryString}`;
  const response = await apiClient.get(url);
  return response.data;
}

async function getPayment(id: number): Promise<Payment> {
  const response = await apiClient.get(`/api/billing/payments/${id}/`);
  return response.data;
}

async function createPayment(data: PaymentCreateData): Promise<Payment> {
  const response = await apiClient.post('/api/billing/payments/', data);
  return response.data;
}

async function getPaymentReceipt(paymentId: number): Promise<Receipt> {
  const response = await apiClient.get(
    `/api/billing/payments/${paymentId}/receipt/`
  );
  return response.data;
}

// ============================================================================
// M-Pesa API
// ============================================================================

async function initiateMpesaSTKPush(
  data: MpesaSTKPushRequest
): Promise<MpesaSTKPushResponse> {
  const response = await apiClient.post('/api/billing/mpesa/initiate/', data);
  return response.data;
}

async function queryMpesaTransaction(
  checkoutRequestId: string
): Promise<MpesaQueryResponse> {
  const response = await apiClient.get(
    `/api/billing/mpesa/query/${checkoutRequestId}/`
  );
  return response.data;
}

// ============================================================================
// Credit Notes API
// ============================================================================

async function getCreditNotes(
  params?: CreditNoteListParams
): Promise<PaginatedCreditNotes> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/credit-notes/?${queryString}`;
  const response = await apiClient.get(url);
  return response.data;
}

async function getCreditNote(id: number): Promise<CreditNote> {
  const response = await apiClient.get(`/api/billing/credit-notes/${id}/`);
  return response.data;
}

async function createCreditNote(data: CreditNoteCreateData): Promise<CreditNote> {
  const response = await apiClient.post('/api/billing/credit-notes/', data);
  return response.data;
}

async function approveCreditNote(id: number): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/approve/`,
    { approved: true }
  );
  return response.data;
}

async function rejectCreditNote(
  id: number,
  rejectionReason: string
): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/approve/`,
    { approved: false, rejection_reason: rejectionReason }
  );
  return response.data;
}

async function processRefund(
  id: number,
  data: CreditNoteRefundData
): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/process-refund/`,
    data
  );
  return response.data;
}

// ============================================================================
// Reports API
// ============================================================================

async function getDailyCollectionReport(
  date: string
): Promise<DailyCollectionReport> {
  const response = await apiClient.get(
    `/api/billing/reports/daily-collection/?date=${date}`
  );
  return response.data;
}

async function getRevenueSummary(
  startDate: string,
  endDate: string
): Promise<RevenueSummary> {
  const response = await apiClient.get(
    `/api/billing/reports/revenue-summary/?start_date=${startDate}&end_date=${endDate}`
  );
  return response.data;
}

async function getOutstandingBalances(): Promise<OutstandingBalance[]> {
  const response = await apiClient.get(
    '/api/billing/reports/outstanding-balances/'
  );
  return response.data;
}

async function getServiceUtilization(
  startDate: string,
  endDate: string
): Promise<ServiceUtilization[]> {
  const response = await apiClient.get(
    `/api/billing/reports/service-utilization/?start_date=${startDate}&end_date=${endDate}`
  );
  return response.data;
}

async function getPaymentMethodAnalysis(
  startDate: string,
  endDate: string
): Promise<PaymentMethodAnalysis> {
  const response = await apiClient.get(
    `/api/billing/reports/payment-analysis/?start_date=${startDate}&end_date=${endDate}`
  );
  return response.data;
}

// ============================================================================
// Export API Object
// ============================================================================

export const billingApi = {
  // Service Categories
  getServiceCategories,
  getServiceCategory,
  
  // Services
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  
  // Invoices
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  finalizeInvoice,
  cancelInvoice,
  addInvoiceItem,
  removeInvoiceItem,
  applyDiscount,
  getOverdueInvoices,
  
  // Payments
  getPayments,
  getPayment,
  createPayment,
  getPaymentReceipt,
  
  // M-Pesa
  initiateMpesaSTKPush,
  queryMpesaTransaction,
  
  // Credit Notes
  getCreditNotes,
  getCreditNote,
  createCreditNote,
  approveCreditNote,
  rejectCreditNote,
  processRefund,
  
  // Reports
  getDailyCollectionReport,
  getRevenueSummary,
  getOutstandingBalances,
  getServiceUtilization,
  getPaymentMethodAnalysis,
};

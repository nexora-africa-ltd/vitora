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
  ProformaCreateData,
  ProformaConvertRequest,
  ProformaRenewRequest,
  // Payment types
  Payment,
  PaymentCreateData,
  PaymentListParams,
  PaginatedPayments,
  // Payment points
  PaymentPoint,
  PaymentPointListParams,
  PaginatedPaymentPoints,
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
// Enum mapping helpers (Web UI <-> Backend)
// ============================================================================

function paymentMethodToBackend(method: string): string {
  // UI uses upper snake-case; backend uses lower snake-case
  return method.toLowerCase();
}

function paymentMethodFromBackend(method: string): string {
  return method.toUpperCase();
}

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
// Proforma Invoices API
// ============================================================================

/**
 * Get proforma invoices only
 * Convenience wrapper around getInvoices with status filter
 */
async function getProformas(params?: InvoiceListParams): Promise<PaginatedInvoices> {
  return getInvoices({ ...params, status: 'PROFORMA' });
}

/**
 * Convert proforma to regular invoice
 * @param id - Proforma invoice ID
 * @returns The newly created Invoice
 */
async function convertProforma(id: number): Promise<Invoice> {
  const response = await apiClient.post(
    `/api/billing/invoices/${id}/convert/`
  );
  return response.data;
}

/**
 * Convert proforma to regular invoice (partial - specific items only)
 * @param id - Proforma invoice ID
 * @param itemIds - Specific item IDs to convert
 * @returns The newly created Invoice
 */
async function convertProformaItems(
  id: number,
  itemIds: number[]
): Promise<Invoice> {
  const data: ProformaConvertRequest = { item_ids: itemIds };
  const response = await apiClient.post(
    `/api/billing/invoices/${id}/convert/`,
    data
  );
  return response.data;
}

/**
 * Renew an expired proforma invoice
 * @param id - Proforma invoice ID
 * @param validityDays - Optional: custom validity period (default 30 days)
 * @returns The newly created proforma Invoice
 */
async function renewProforma(
  id: number,
  validityDays?: number
): Promise<Invoice> {
  const data: ProformaRenewRequest = validityDays ? { validity_days: validityDays } : {};
  const response = await apiClient.post(
    `/api/billing/invoices/${id}/renew/`,
    data
  );
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
  const payload: Record<string, unknown> = {
    ...data,
    method: paymentMethodToBackend(data.method),
  };

  // Backend field name is mpesa_phone
  if (data.mpesa_phone !== undefined) {
    payload.mpesa_phone = data.mpesa_phone;
  }

  const response = await apiClient.post('/api/billing/payments/', payload);
  return response.data;
}

async function getPaymentReceipt(paymentId: number): Promise<Receipt> {
  const response = await apiClient.get(
    `/api/billing/payments/${paymentId}/receipt/`
  );
  return response.data;
}

// ============================================================================
// Payment Points API
// ============================================================================

async function getPaymentPoints(
  params?: PaymentPointListParams
): Promise<PaginatedPaymentPoints> {
  const mappedParams: Record<string, unknown> = { ...params };
  if (params?.method) {
    mappedParams.method = paymentMethodToBackend(params.method);
  }

  const queryString = params ? buildQueryString(mappedParams) : '';
  const url = queryString
    ? `/api/billing/payment-points/?${queryString}`
    : '/api/billing/payment-points/';

  const response = await apiClient.get(url);

  // Map backend method values to UI enum values
  const data = response.data as PaginatedPaymentPoints;
  return {
    ...data,
    results: (data.results || []).map((pp: PaymentPoint) => ({
      ...pp,
      method: paymentMethodFromBackend((pp as any).method) as PaymentPoint['method'],
    })),
  };
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

// Daily Closure Report
export interface DailyClosureReport {
  date: string;
  total_invoiced: string;
  total_collected: string;
  outstanding: string;
  by_department: Array<{
    department: string;
    invoiced: string;
    collected: string;
  }>;
  by_payment_method: Record<string, string>;
  transaction_count: number;
}

async function getDailyClosureReport(date: string): Promise<DailyClosureReport> {
  const response = await apiClient.get(
    `/api/billing/reports/daily-closure/?date=${date}`
  );
  return response.data;
}

// Billing Discrepancies
export interface BillingDiscrepancy {
  id: number;
  encounter_id: number | null;
  invoice_number: string;
  patient_name: string;
  patient_mrn: string;
  service_name: string;
  expected_amount: string;
  billed_amount: string;
  discrepancy: string;
  date: string;
  status: 'PENDING' | 'RESOLVED';
}

async function getBillingDiscrepancies(): Promise<BillingDiscrepancy[]> {
  const response = await apiClient.get('/api/billing/reports/discrepancies/');
  return response.data;
}

// Unbilled Services
export interface UnbilledService {
  department: string;
  services_count: number;
  total_amount: string;
}

async function getUnbilledServices(): Promise<UnbilledService[]> {
  const response = await apiClient.get('/api/billing/reports/unbilled-services/');
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

  // Proforma Invoices
  getProformas,
  convertProforma,
  convertProformaItems,
  renewProforma,

  // Payments
  getPayments,
  getPayment,
  createPayment,
  getPaymentReceipt,

  // Payment points
  getPaymentPoints,

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
  getDailyClosureReport,
  getBillingDiscrepancies,
  getUnbilledServices,
};

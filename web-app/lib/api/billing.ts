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
import { parseResponse } from '@/lib/schemas/validation';
import { z } from 'zod';
import {
  ServiceCategorySchema,
  ServiceSchema,
  InvoiceSchema,
  InvoiceItemSchema,
  PaymentSchema,
  PaymentPointSchema,
  ReceiptSchema,
  CreditNoteSchema,
  MpesaSTKPushResponseSchema,
  MpesaQueryResponseSchema,
  DailyCollectionReportSchema,
  RevenueSummarySchema,
  OutstandingBalanceSchema,
  ServiceUtilizationSchema,
  PaymentMethodAnalysisSchema,
  DailyClosureReportSchema,
  BillingDiscrepancySchema,
  UnbilledServiceSchema,
  PaginatedServiceCategorySchema,
  PaginatedServiceSchema,
  PaginatedInvoiceSchema,
  PaginatedPaymentSchema,
  PaginatedPaymentPointSchema,
  PaginatedCreditNoteSchema,
  FacilityBillingConfigSchema,
  SHAContractSummarySchema,
  PaginatedFacilityBillingConfigSchema,
} from '@/lib/schemas/billing.schema';
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
  // Facility billing config
  FacilityBillingConfig,
  FacilityBillingConfigCreateData,
  FacilityBillingConfigUpdateData,
  FacilityBillingConfigListParams,
  SHAContractSummary,
  PaginatedFacilityBillingConfigs,
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
  return parseResponse(PaginatedServiceCategorySchema, response.data, { context: 'billingApi.getServiceCategories' });
}

async function getServiceCategory(id: number): Promise<ServiceCategory> {
  const response = await apiClient.get(`/api/billing/categories/${id}/`);
  return parseResponse(ServiceCategorySchema, response.data, { context: 'billingApi.getServiceCategory' });
}

// ============================================================================
// Services API
// ============================================================================

async function getServices(params?: ServiceListParams): Promise<PaginatedServices> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/services/?${queryString}`;
  const response = await apiClient.get(url);
  return parseResponse(PaginatedServiceSchema, response.data, { context: 'billingApi.getServices' });
}

async function getService(id: number): Promise<Service> {
  const response = await apiClient.get(`/api/billing/services/${id}/`);
  return parseResponse(ServiceSchema, response.data, { context: 'billingApi.getService' });
}

async function createService(data: ServiceCreateData): Promise<Service> {
  const response = await apiClient.post('/api/billing/services/', data);
  return parseResponse(ServiceSchema, response.data, { context: 'billingApi.createService' });
}

async function updateService(
  id: number,
  data: ServiceUpdateData
): Promise<Service> {
  const response = await apiClient.patch(`/api/billing/services/${id}/`, data);
  return parseResponse(ServiceSchema, response.data, { context: 'billingApi.updateService' });
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
  return parseResponse(PaginatedInvoiceSchema, response.data, { context: 'billingApi.getInvoices' });
}

async function getInvoice(id: number): Promise<Invoice> {
  const response = await apiClient.get(`/api/billing/invoices/${id}/`);
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.getInvoice' });
}

async function createInvoice(data: InvoiceCreateData): Promise<Invoice> {
  const response = await apiClient.post('/api/billing/invoices/', data);
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.createInvoice' });
}

async function updateInvoice(
  id: number,
  data: InvoiceUpdateData
): Promise<Invoice> {
  const response = await apiClient.patch(`/api/billing/invoices/${id}/`, data);
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.updateInvoice' });
}

async function finalizeInvoice(id: number): Promise<Invoice> {
  const response = await apiClient.post(`/api/billing/invoices/${id}/finalize/`);
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.finalizeInvoice' });
}

async function cancelInvoice(id: number, reason: string): Promise<Invoice> {
  const response = await apiClient.post(`/api/billing/invoices/${id}/cancel/`, {
    reason,
  });
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.cancelInvoice' });
}

async function addInvoiceItem(
  invoiceId: number,
  data: InvoiceItemCreateData
): Promise<InvoiceItem> {
  const response = await apiClient.post(
    `/api/billing/invoices/${invoiceId}/items/`,
    data
  );
  return parseResponse(InvoiceItemSchema, response.data, { context: 'billingApi.addInvoiceItem' });
}

async function removeInvoiceItem(
  invoiceId: number,
  itemId: number
): Promise<void> {
  await apiClient.delete(
    `/api/billing/invoices/${invoiceId}/items/${itemId}/`
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
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.applyDiscount' });
}

async function getOverdueInvoices(): Promise<PaginatedInvoices> {
  const response = await apiClient.get('/api/billing/invoices/overdue/');
  return parseResponse(PaginatedInvoiceSchema, response.data, { context: 'billingApi.getOverdueInvoices' });
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
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.convertProforma' });
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
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.convertProformaItems' });
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
  return parseResponse(InvoiceSchema, response.data, { context: 'billingApi.renewProforma' });
}

// ============================================================================
// Payments API
// ============================================================================

async function getPayments(params?: PaymentListParams): Promise<PaginatedPayments> {
  const queryString = params ? buildQueryString(params) : '';
  const url = `/api/billing/payments/?${queryString}`;
  const response = await apiClient.get(url);
  return parseResponse(PaginatedPaymentSchema, response.data, { context: 'billingApi.getPayments' });
}

async function getPayment(id: number): Promise<Payment> {
  const response = await apiClient.get(`/api/billing/payments/${id}/`);
  return parseResponse(PaymentSchema, response.data, { context: 'billingApi.getPayment' });
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
  return parseResponse(PaymentSchema, response.data, { context: 'billingApi.createPayment' });
}

async function getPaymentReceipt(paymentId: number): Promise<Receipt> {
  const response = await apiClient.get(
    `/api/billing/payments/${paymentId}/receipt/`
  );
  return parseResponse(ReceiptSchema, response.data, { context: 'billingApi.getPaymentReceipt' });
}

async function downloadReceiptPdf(paymentId: number): Promise<Blob> {
  const response = await apiClient.get(
    `/api/billing/payments/${paymentId}/receipt/pdf/`,
    { responseType: 'blob' }
  );
  return response.data as Blob;
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
  const validated = parseResponse(PaginatedPaymentPointSchema, response.data, { context: 'billingApi.getPaymentPoints' });

  // Map backend method values to UI enum values
  return {
    ...validated,
    results: (validated.results || []).map((pp) => ({
      ...pp,
      method: paymentMethodFromBackend(pp.method) as PaymentPoint['method'],
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
  return parseResponse(MpesaSTKPushResponseSchema, response.data, { context: 'billingApi.initiateMpesaSTKPush' });
}

async function queryMpesaTransaction(
  checkoutRequestId: string
): Promise<MpesaQueryResponse> {
  const response = await apiClient.get(
    `/api/billing/mpesa/query/${checkoutRequestId}/`
  );
  return parseResponse(MpesaQueryResponseSchema, response.data, { context: 'billingApi.queryMpesaTransaction' });
}

/**
 * Verify an M-Pesa transaction code (receipt number) before recording a manual payment.
 * Checks for duplicates and validates against Safaricom.
 */
async function verifyMpesaTransaction(
  transactionId: string
): Promise<{ verified: boolean; receipt_number: string; error: string | null }> {
  const response = await apiClient.post('/api/billing/mpesa/verify/', {
    transaction_id: transactionId,
  });
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
  return parseResponse(PaginatedCreditNoteSchema, response.data, { context: 'billingApi.getCreditNotes' });
}

async function getCreditNote(id: number): Promise<CreditNote> {
  const response = await apiClient.get(`/api/billing/credit-notes/${id}/`);
  return parseResponse(CreditNoteSchema, response.data, { context: 'billingApi.getCreditNote' });
}

async function createCreditNote(data: CreditNoteCreateData): Promise<CreditNote> {
  const response = await apiClient.post('/api/billing/credit-notes/', data);
  return parseResponse(CreditNoteSchema, response.data, { context: 'billingApi.createCreditNote' });
}

async function approveCreditNote(id: number): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/approve/`
  );
  return parseResponse(CreditNoteSchema, response.data, { context: 'billingApi.approveCreditNote' });
}

async function rejectCreditNote(
  id: number,
  rejectionReason: string
): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/reject/`,
    { reason: rejectionReason }
  );
  return parseResponse(CreditNoteSchema, response.data, { context: 'billingApi.rejectCreditNote' });
}

async function processRefund(
  id: number,
  data: CreditNoteRefundData
): Promise<CreditNote> {
  const response = await apiClient.post(
    `/api/billing/credit-notes/${id}/refund/`,
    data
  );
  return parseResponse(CreditNoteSchema, response.data, { context: 'billingApi.processRefund' });
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
  return parseResponse(DailyCollectionReportSchema, response.data, { context: 'billingApi.getDailyCollectionReport' });
}

async function getRevenueSummary(
  startDate: string,
  endDate: string
): Promise<RevenueSummary> {
  const response = await apiClient.get(
    `/api/billing/reports/revenue-summary/?start_date=${startDate}&end_date=${endDate}`
  );
  return parseResponse(RevenueSummarySchema, response.data, { context: 'billingApi.getRevenueSummary' });
}

async function getOutstandingBalances(): Promise<OutstandingBalance[]> {
  const response = await apiClient.get(
    '/api/billing/reports/outstanding-balances/'
  );
  return parseResponse(z.array(OutstandingBalanceSchema), response.data, { context: 'billingApi.getOutstandingBalances' });
}

async function getServiceUtilization(
  startDate: string,
  endDate: string
): Promise<ServiceUtilization[]> {
  const response = await apiClient.get(
    `/api/billing/reports/service-utilization/?start_date=${startDate}&end_date=${endDate}`
  );
  return parseResponse(z.array(ServiceUtilizationSchema), response.data, { context: 'billingApi.getServiceUtilization' });
}

async function getPaymentMethodAnalysis(
  startDate: string,
  endDate: string
): Promise<PaymentMethodAnalysis> {
  const response = await apiClient.get(
    `/api/billing/reports/payment-analysis/?start_date=${startDate}&end_date=${endDate}`
  );
  return parseResponse(PaymentMethodAnalysisSchema, response.data, { context: 'billingApi.getPaymentMethodAnalysis' });
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

async function getDailyClosureReport(date: string, facility?: number): Promise<DailyClosureReport> {
  const params = new URLSearchParams({ date });
  if (facility) params.set('facility', String(facility));
  const response = await apiClient.get(
    `/api/billing/reports/daily-closure/?${params.toString()}`
  );
  return parseResponse(DailyClosureReportSchema, response.data, { context: 'billingApi.getDailyClosureReport' });
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
  return parseResponse(z.array(BillingDiscrepancySchema), response.data, { context: 'billingApi.getBillingDiscrepancies' });
}

// Unbilled Services
export interface UnbilledService {
  department: string;
  services_count: number;
  total_amount: string;
}

async function getUnbilledServices(): Promise<UnbilledService[]> {
  const response = await apiClient.get('/api/billing/reports/unbilled-services/');
  return parseResponse(z.array(UnbilledServiceSchema), response.data, { context: 'billingApi.getUnbilledServices' });
}

// ============================================================================
// Facility Billing Config
// ============================================================================

async function getFacilityBillingConfigs(params?: FacilityBillingConfigListParams): Promise<PaginatedFacilityBillingConfigs> {
  const qs = params ? `?${buildQueryString(params)}` : '';
  const response = await apiClient.get(`/api/billing/facility-configs/${qs}`);
  return parseResponse(PaginatedFacilityBillingConfigSchema, response.data, { context: 'billingApi.getFacilityBillingConfigs' });
}

async function getFacilityBillingConfig(id: number): Promise<FacilityBillingConfig> {
  const response = await apiClient.get(`/api/billing/facility-configs/${id}/`);
  return parseResponse(FacilityBillingConfigSchema, response.data, { context: 'billingApi.getFacilityBillingConfig' });
}

async function createFacilityBillingConfig(data: FacilityBillingConfigCreateData): Promise<FacilityBillingConfig> {
  const response = await apiClient.post('/api/billing/facility-configs/', data);
  return parseResponse(FacilityBillingConfigSchema, response.data, { context: 'billingApi.createFacilityBillingConfig' });
}

async function updateFacilityBillingConfig(id: number, data: FacilityBillingConfigUpdateData): Promise<FacilityBillingConfig> {
  const response = await apiClient.patch(`/api/billing/facility-configs/${id}/`, data);
  return parseResponse(FacilityBillingConfigSchema, response.data, { context: 'billingApi.updateFacilityBillingConfig' });
}

async function getSHAContractSummaries(): Promise<SHAContractSummary[]> {
  const response = await apiClient.get('/api/billing/facility-configs/sha-contracts/');
  return parseResponse(z.array(SHAContractSummarySchema), response.data, { context: 'billingApi.getSHAContractSummaries' });
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
  downloadReceiptPdf,

  // Payment points
  getPaymentPoints,

  // M-Pesa
  initiateMpesaSTKPush,
  queryMpesaTransaction,
  verifyMpesaTransaction,

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

  // Facility Billing Config
  getFacilityBillingConfigs,
  getFacilityBillingConfig,
  createFacilityBillingConfig,
  updateFacilityBillingConfig,
  getSHAContractSummaries,
};

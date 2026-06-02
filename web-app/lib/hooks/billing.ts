/**
 * Billing React Query Hooks
 * Dual-mode: PowerSync (local SQLite) with React Query API fallback for invoice reads.
 * Mutations and reports remain API-only.
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { billingApi } from '@/lib/api/billing';
import { useOfflineQuery } from '@/lib/powersync/use-offline-query';
import { useOfflineMutation } from '@/lib/powersync/use-offline-mutation';
import { generateId } from '@/lib/powersync/uuid';
import { transformInvoiceRow } from '@/lib/powersync/transforms';
import type { InvoiceRow } from '@/lib/powersync/schema';
import type { PaginatedResponse } from '@/lib/types';
import type {
  Invoice,
  InvoiceCreateData,
  InvoiceUpdateData,
  InvoiceItem,
  InvoiceItemCreateData,
  InvoiceListParams,
  ApplyDiscountData,
  Payment,
  PaymentCreateData,
  PaymentListParams,
  PaymentPointListParams,
  PaymentPointCreateData,
  PaymentPointUpdateData,
  PaginatedPaymentPoints,
  Service,
  ServiceCreateData,
  ServiceUpdateData,
  ServiceListParams,
  ServiceCategory,
  ServiceCategoryCreateData,
  ServiceCategoryUpdateData,
  CreditNote,
  CreditNoteCreateData,
  CreditNoteListParams,
  CreditNoteRefundData,
  Receipt,
  MpesaSTKPushRequest,
  MpesaSTKPushResponse,
  MpesaQueryResponse,
  DailyCollectionReport,
  RevenueSummary,
  OutstandingBalance,
  ServiceUtilization,
  PaymentMethodAnalysis,
  PaginatedInvoices,
  PaginatedPayments,
  PaginatedServices,
  PaginatedServiceCategories,
  PaginatedCreditNotes,
  FacilityBillingConfigCreateData,
  FacilityBillingConfigUpdateData,
  FacilityBillingConfigListParams,
} from '@/lib/types/billing';

// ============================================================================
// Query Keys
// ============================================================================

export const billingKeys = {
  all: ['billing'] as const,

  // Invoices
  invoices: () => [...billingKeys.all, 'invoices'] as const,
  invoicesList: (params?: InvoiceListParams) => [...billingKeys.invoices(), 'list', params] as const,
  invoiceDetail: (id: number) => [...billingKeys.invoices(), 'detail', id] as const,
  invoicesOverdue: () => [...billingKeys.invoices(), 'overdue'] as const,

  // Proformas
  proformas: () => [...billingKeys.all, 'proformas'] as const,
  proformasList: (params?: InvoiceListParams) => [...billingKeys.proformas(), 'list', params] as const,

  // Payments
  payments: () => [...billingKeys.all, 'payments'] as const,
  paymentsList: (params?: PaymentListParams) => [...billingKeys.payments(), 'list', params] as const,
  paymentDetail: (id: number) => [...billingKeys.payments(), 'detail', id] as const,
  paymentReceipt: (id: number) => [...billingKeys.payments(), 'receipt', id] as const,

  // Payment points
  paymentPoints: () => [...billingKeys.all, 'payment-points'] as const,
  paymentPointsList: (params?: PaymentPointListParams) =>
    [...billingKeys.paymentPoints(), 'list', params] as const,
  paymentPointDetail: (id: number) => [...billingKeys.paymentPoints(), 'detail', id] as const,

  // Services
  services: () => [...billingKeys.all, 'services'] as const,
  servicesList: (params?: ServiceListParams) => [...billingKeys.services(), 'list', params] as const,
  serviceDetail: (id: number) => [...billingKeys.services(), 'detail', id] as const,

  // Categories
  categories: () => [...billingKeys.all, 'categories'] as const,
  categoriesList: () => [...billingKeys.categories(), 'list'] as const,

  // Credit Notes
  creditNotes: () => [...billingKeys.all, 'credit-notes'] as const,
  creditNotesList: (params?: CreditNoteListParams) => [...billingKeys.creditNotes(), 'list', params] as const,
  creditNoteDetail: (id: number) => [...billingKeys.creditNotes(), 'detail', id] as const,

  // Reports
  reports: () => [...billingKeys.all, 'reports'] as const,
  dailyCollection: (date: string) => [...billingKeys.reports(), 'daily-collection', date] as const,
  revenueSummary: (startDate: string, endDate: string) => [...billingKeys.reports(), 'revenue-summary', startDate, endDate] as const,
  outstandingBalances: () => [...billingKeys.reports(), 'outstanding-balances'] as const,
  serviceUtilization: (startDate: string, endDate: string) => [...billingKeys.reports(), 'service-utilization', startDate, endDate] as const,
  paymentAnalysis: (startDate: string, endDate: string) => [...billingKeys.reports(), 'payment-analysis', startDate, endDate] as const,

  // M-Pesa
  mpesa: () => [...billingKeys.all, 'mpesa'] as const,
  mpesaQuery: (checkoutRequestId: string) => [...billingKeys.mpesa(), 'query', checkoutRequestId] as const,

  // Facility Billing Config
  facilityConfigs: () => [...billingKeys.all, 'facility-configs'] as const,
  facilityConfigsList: (params?: FacilityBillingConfigListParams) => [...billingKeys.facilityConfigs(), 'list', params] as const,
  facilityConfigDetail: (id: number) => [...billingKeys.facilityConfigs(), 'detail', id] as const,
  shaContracts: () => [...billingKeys.facilityConfigs(), 'sha-contracts'] as const,
};

// ============================================================================
// Invoice Hooks
// ============================================================================

type InvoiceJoinedRow = InvoiceRow & { id: string; patient_first_name?: string; patient_last_name?: string; patient_mrn?: string };

/**
 * Fetch paginated list of invoices.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useInvoices(params?: InvoiceListParams) {
  const conditions: string[] = [];
  const sqlParams: (string | number)[] = [];

  if (params?.search) {
    conditions.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.mrn LIKE ? OR inv.invoice_number LIKE ?)');
    const pattern = `%${params.search}%`;
    sqlParams.push(pattern, pattern, pattern, pattern);
  }
  if (params?.status) {
    conditions.push('inv.status = ?');
    sqlParams.push(params.status);
  }
  if (params?.payment_type) {
    conditions.push('inv.payment_type = ?');
    sqlParams.push(params.payment_type);
  }
  if (params?.patient) {
    conditions.push('inv.patient_id = ?');
    sqlParams.push(String(params.patient));
  }
  if (params?.start_date) {
    conditions.push('inv.invoice_date >= ?');
    sqlParams.push(params.start_date);
  }
  if (params?.end_date) {
    conditions.push('inv.invoice_date <= ?');
    sqlParams.push(params.end_date);
  }

  const limit = params?.page_size || 25;
  const offset = ((params?.page || 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Force API mode: invoices require nested line items with service/drug names
  // that can't be resolved from PowerSync's flat local SQLite tables.
  return useOfflineQuery<InvoiceJoinedRow, PaginatedResponse<Invoice>>({
    sql: `SELECT inv.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM billing_invoice inv
      LEFT JOIN patients_patient p ON inv.patient_id = p.id
      ${whereClause}
      ORDER BY inv.created_at DESC
      LIMIT ? OFFSET ?`,
    params: [...sqlParams, limit, offset],
    transform: (rows) => ({
      count: rows.length < limit ? offset + rows.length : offset + limit + 1,
      next: null,
      previous: null,
      results: rows.map(r => transformInvoiceRow(r) as unknown as Invoice),
    }),
    queryKey: billingKeys.invoicesList(params),
    queryFn: () => billingApi.getInvoices(params),
    forceApi: true,
  });
}

/**
 * Fetch single invoice by ID.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useInvoice(id: number | undefined) {
  // Force API mode: invoices require nested line items with service/drug names
  return useOfflineQuery<InvoiceJoinedRow, Invoice>({
    sql: `SELECT inv.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM billing_invoice inv
      LEFT JOIN patients_patient p ON inv.patient_id = p.id
      WHERE inv.id = ?`,
    params: [id !== undefined ? String(id) : '0'],
    transform: (rows) => {
      if (rows.length === 0) throw new Error(`Invoice ${id} not found`);
      return transformInvoiceRow(rows[0]!) as unknown as Invoice;
    },
    queryKey: billingKeys.invoiceDetail(id!),
    queryFn: () => billingApi.getInvoice(id!),
    forceApi: true,
    enabled: id !== undefined && id > 0,
  });
}

/**
 * Fetch overdue invoices.
 * Reads from local PowerSync SQLite when available, falls back to API.
 */
export function useOverdueInvoices() {
  // Force API mode: invoices require nested line items
  return useOfflineQuery<InvoiceJoinedRow, PaginatedResponse<Invoice>>({
    sql: `SELECT inv.*, p.first_name as patient_first_name, p.last_name as patient_last_name, p.mrn as patient_mrn
      FROM billing_invoice inv
      LEFT JOIN patients_patient p ON inv.patient_id = p.id
      WHERE inv.status IN ('PENDING', 'PARTIAL') AND inv.due_date < ?
      ORDER BY inv.due_date ASC`,
    params: [new Date().toISOString().split('T')[0]!],
    transform: (rows) => ({
      count: rows.length,
      next: null,
      previous: null,
      results: rows.map(r => transformInvoiceRow(r) as unknown as Invoice),
    }),
    queryKey: billingKeys.invoicesOverdue(),
    queryFn: () => billingApi.getOverdueInvoices(),
    forceApi: true,
  });
}

/**
 * Create a new invoice.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useOfflineMutation<InvoiceCreateData, Invoice>({
    table: 'billing_invoice',
    operation: 'create',
    // Invoice creation MUST go through the API directly because:
    // 1. The backend generates invoice_number
    // 2. The caller redirects to the invoice detail page using the returned id
    forceApi: true,
    buildLocalData: (data) => ({
      id: generateId(),
      invoice_number: '', // Assigned by backend after sync
      patient_id: String(data.patient),
      encounter_id: data.encounter ? String(data.encounter) : null,
      status: 'DRAFT',
      payment_type: data.payment_type || null,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: data.due_date || null,
      subtotal: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 0,
      amount_paid: 0,
      balance_due: 0,
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    mutationFn: (data) => billingApi.createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

/**
 * Update an existing invoice.
 * Uses local PowerSync write when available, falls back to API.
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useOfflineMutation<{ id: number; data: InvoiceUpdateData }, Invoice>({
    table: 'billing_invoice',
    operation: 'update',
    getId: (input) => input.id,
    buildLocalData: ({ data }) => {
      const fields: Record<string, string | number | null> = {};
      if (data.notes !== undefined) fields.notes = data.notes || null;
      if (data.due_date !== undefined) fields.due_date = data.due_date || null;
      fields.updated_at = new Date().toISOString();
      return fields;
    },
    mutationFn: ({ id, data }) => billingApi.updateInvoice(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

/**
 * Finalize a draft invoice
 */
export function useFinalizeInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => billingApi.finalizeInvoice(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

/**
 * Cancel an invoice
 */
export function useCancelInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, reason }: { invoiceId: number; reason: string }) =>
      billingApi.cancelInvoice(invoiceId, reason),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(invoiceId) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

/**
 * Add item to invoice
 */
export function useAddInvoiceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, item }: { invoiceId: number; item: InvoiceItemCreateData }) =>
      billingApi.addInvoiceItem(invoiceId, item),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(invoiceId) });
    },
  });
}

/**
 * Remove item from invoice
 */
export function useRemoveInvoiceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, itemId }: { invoiceId: number; itemId: number }) =>
      billingApi.removeInvoiceItem(invoiceId, itemId),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(invoiceId) });
    },
  });
}

/**
 * Apply discount to invoice
 */
export function useApplyDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ invoiceId, discount }: { invoiceId: number; discount: ApplyDiscountData }) =>
      billingApi.applyDiscount(invoiceId, discount),
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(invoiceId) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

// ============================================================================
// Proforma Invoice Hooks
// ============================================================================

/**
 * Fetch paginated list of proforma invoices
 */
export function useProformas(params?: InvoiceListParams) {
  return useQuery({
    queryKey: billingKeys.proformasList(params),
    queryFn: () => billingApi.getProformas(params),
  });
}

/**
 * Convert proforma to invoice (full conversion)
 */
export function useConvertProforma() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => billingApi.convertProforma(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
      queryClient.invalidateQueries({ queryKey: billingKeys.proformas() });
    },
  });
}

/**
 * Convert proforma to invoice (partial - specific items)
 */
export function useConvertProformaItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, itemIds }: { id: number; itemIds: number[] }) =>
      billingApi.convertProformaItems(id, itemIds),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
      queryClient.invalidateQueries({ queryKey: billingKeys.proformas() });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(id) });
    },
  });
}

/**
 * Renew an expired proforma invoice
 */
export function useRenewProforma() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, validityDays }: { id: number; validityDays?: number }) =>
      billingApi.renewProforma(id, validityDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.proformas() });
    },
  });
}

// ============================================================================
// Payment Hooks
// ============================================================================

/**
 * Fetch available payment points (optionally filtered by method/is_active)
 */
export function usePaymentPoints(params?: PaymentPointListParams) {
  return useQuery<PaginatedPaymentPoints>({
    queryKey: billingKeys.paymentPointsList(params),
    queryFn: () => billingApi.getPaymentPoints(params),
  });
}

/**
 * Fetch a single payment point by ID
 */
export function usePaymentPoint(id: number | null) {
  return useQuery({
    queryKey: billingKeys.paymentPointDetail(id!),
    queryFn: () => billingApi.getPaymentPoint(id!),
    enabled: !!id,
  });
}

/**
 * Fetch paginated list of payments
 */
export function usePayments(params?: PaymentListParams) {
  return useQuery({
    queryKey: billingKeys.paymentsList(params),
    queryFn: () => billingApi.getPayments(params),
  });
}

/**
 * Fetch single payment by ID
 */
export function usePayment(id: number | undefined) {
  return useQuery({
    queryKey: billingKeys.paymentDetail(id!),
    queryFn: () => billingApi.getPayment(id!),
    enabled: id !== undefined,
  });
}

/**
 * Create a new payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PaymentCreateData) => billingApi.createPayment(data),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.payments() });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(payment.invoice) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
      queryClient.invalidateQueries({ queryKey: billingKeys.reports() });
    },
  });
}

/**
 * Get payment receipt
 */
export function usePaymentReceipt(paymentId: number | undefined) {
  return useQuery({
    queryKey: billingKeys.paymentReceipt(paymentId!),
    queryFn: () => billingApi.getPaymentReceipt(paymentId!),
    enabled: paymentId !== undefined,
  });
}

/**
 * Reverse a completed payment
 */
export function useReversePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: number; reason: string }) =>
      billingApi.reversePayment(paymentId, reason),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.payments() });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoiceDetail(payment.invoice) });
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
      queryClient.invalidateQueries({ queryKey: billingKeys.reports() });
    },
  });
}

// ============================================================================
// M-Pesa Hooks
// ============================================================================

/**
 * Initiate M-Pesa STK Push
 */
export function useMpesaSTKPush() {
  return useMutation({
    mutationFn: (data: MpesaSTKPushRequest) => billingApi.initiateMpesaSTKPush(data),
  });
}

/**
 * Query M-Pesa transaction status
 */
export function useMpesaQuery(
  checkoutRequestId: string | null,
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: billingKeys.mpesaQuery(checkoutRequestId!),
    queryFn: () => billingApi.queryMpesaTransaction(checkoutRequestId!),
    enabled: checkoutRequestId !== null,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Verify an M-Pesa transaction code (for manual payments)
 */
export function useVerifyMpesaTransaction() {
  return useMutation({
    mutationFn: (transactionId: string) => billingApi.verifyMpesaTransaction(transactionId),
  });
}

// ============================================================================
// Service Hooks
// ============================================================================

/**
 * Fetch paginated list of services
 */
export function useServices(params?: ServiceListParams) {
  return useQuery({
    queryKey: billingKeys.servicesList(params),
    queryFn: () => billingApi.getServices(params),
  });
}

/**
 * Fetch single service by ID
 */
export function useService(id: number | undefined) {
  return useQuery({
    queryKey: billingKeys.serviceDetail(id!),
    queryFn: () => billingApi.getService(id!),
    enabled: id !== undefined,
  });
}

/**
 * Fetch service categories
 */
export function useServiceCategories(params?: { is_active?: boolean }) {
  return useQuery({
    queryKey: billingKeys.categoriesList(),
    queryFn: () => billingApi.getServiceCategories(params),
  });
}

/**
 * Create a new service
 */
export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ServiceCreateData) => billingApi.createService(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.services() });
    },
  });
}

/**
 * Update an existing service
 */
export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ServiceUpdateData }) =>
      billingApi.updateService(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.serviceDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.services() });
    },
  });
}

/**
 * Delete a service
 */
export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => billingApi.deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.services() });
    },
  });
}

/**
 * Create a new service category
 */
export function useCreateServiceCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ServiceCategoryCreateData) => billingApi.createServiceCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.categories() });
    },
  });
}

/**
 * Update a service category
 */
export function useUpdateServiceCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ServiceCategoryUpdateData }) =>
      billingApi.updateServiceCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.categories() });
    },
  });
}

/**
 * Delete a service category
 */
export function useDeleteServiceCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => billingApi.deleteServiceCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.categories() });
    },
  });
}

/**
 * Create a new payment point
 */
export function useCreatePaymentPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: PaymentPointCreateData) => billingApi.createPaymentPoint(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentPoints() });
    },
  });
}

/**
 * Update an existing payment point
 */
export function useUpdatePaymentPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: PaymentPointUpdateData }) =>
      billingApi.updatePaymentPoint(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentPoints() });
    },
  });
}

/**
 * Delete a payment point
 */
export function useDeletePaymentPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => billingApi.deletePaymentPoint(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentPoints() });
    },
  });
}

// ============================================================================
// Credit Note Hooks
// ============================================================================

/**
 * Fetch paginated list of credit notes
 */
export function useCreditNotes(params?: CreditNoteListParams) {
  return useQuery({
    queryKey: billingKeys.creditNotesList(params),
    queryFn: () => billingApi.getCreditNotes(params),
  });
}

/**
 * Fetch single credit note by ID
 */
export function useCreditNote(id: number | undefined) {
  return useQuery({
    queryKey: billingKeys.creditNoteDetail(id!),
    queryFn: () => billingApi.getCreditNote(id!),
    enabled: id !== undefined,
  });
}

/**
 * Create a credit note request
 */
export function useCreateCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreditNoteCreateData) => billingApi.createCreditNote(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNotes() });
    },
  });
}

/**
 * Approve a credit note
 */
export function useApproveCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => billingApi.approveCreditNote(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNoteDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNotes() });
    },
  });
}

/**
 * Reject a credit note
 */
export function useRejectCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      billingApi.rejectCreditNote(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNoteDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNotes() });
    },
  });
}

/**
 * Process credit note refund
 */
export function useProcessRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreditNoteRefundData }) =>
      billingApi.processRefund(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNoteDetail(id) });
      queryClient.invalidateQueries({ queryKey: billingKeys.creditNotes() });
    },
  });
}

// ============================================================================
// Report Hooks
// ============================================================================

/**
 * Fetch daily collection report
 */
export function useDailyCollectionReport(date: string) {
  return useQuery({
    queryKey: billingKeys.dailyCollection(date),
    queryFn: () => billingApi.getDailyCollectionReport(date),
  });
}

/**
 * Fetch revenue summary for date range
 */
export function useRevenueSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: billingKeys.revenueSummary(startDate, endDate),
    queryFn: () => billingApi.getRevenueSummary(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Fetch outstanding balances
 */
export function useOutstandingBalances() {
  return useQuery({
    queryKey: billingKeys.outstandingBalances(),
    queryFn: () => billingApi.getOutstandingBalances(),
  });
}

/**
 * Fetch service utilization report
 */
export function useServiceUtilization(startDate: string, endDate: string) {
  return useQuery({
    queryKey: billingKeys.serviceUtilization(startDate, endDate),
    queryFn: () => billingApi.getServiceUtilization(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Fetch payment method analysis
 */
export function usePaymentMethodAnalysis(startDate: string, endDate: string) {
  return useQuery({
    queryKey: billingKeys.paymentAnalysis(startDate, endDate),
    queryFn: () => billingApi.getPaymentMethodAnalysis(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

/**
 * Fetch daily closure report
 */
export function useDailyClosureReport(date: string, facility?: number) {
  return useQuery({
    queryKey: [...billingKeys.reports(), 'daily-closure', date, facility] as const,
    queryFn: () => billingApi.getDailyClosureReport(date, facility),
    enabled: !!date,
  });
}

/**
 * Fetch billing discrepancies
 */
export function useBillingDiscrepancies() {
  return useQuery({
    queryKey: [...billingKeys.reports(), 'discrepancies'] as const,
    queryFn: () => billingApi.getBillingDiscrepancies(),
  });
}

/**
 * Fetch unbilled services
 */
export function useUnbilledServices() {
  return useQuery({
    queryKey: [...billingKeys.reports(), 'unbilled-services'] as const,
    queryFn: () => billingApi.getUnbilledServices(),
  });
}

// ============================================================================
// Facility Billing Config Hooks
// ============================================================================

/**
 * Fetch facility billing configurations
 */
export function useFacilityBillingConfigs(params?: FacilityBillingConfigListParams) {
  return useQuery({
    queryKey: billingKeys.facilityConfigsList(params),
    queryFn: () => billingApi.getFacilityBillingConfigs(params),
  });
}

/**
 * Fetch a single facility billing config
 */
export function useFacilityBillingConfig(id: number | undefined) {
  return useQuery({
    queryKey: billingKeys.facilityConfigDetail(id!),
    queryFn: () => billingApi.getFacilityBillingConfig(id!),
    enabled: !!id,
  });
}

/**
 * Create facility billing config
 */
export function useCreateFacilityBillingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: FacilityBillingConfigCreateData) => billingApi.createFacilityBillingConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.facilityConfigs() });
    },
  });
}

/**
 * Update facility billing config
 */
export function useUpdateFacilityBillingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: FacilityBillingConfigUpdateData }) =>
      billingApi.updateFacilityBillingConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.facilityConfigs() });
    },
  });
}

/**
 * Fetch SHA contract summaries across all facilities
 */
export function useSHAContractSummaries() {
  return useQuery({
    queryKey: billingKeys.shaContracts(),
    queryFn: () => billingApi.getSHAContractSummaries(),
  });
}

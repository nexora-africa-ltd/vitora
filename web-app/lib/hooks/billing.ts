/**
 * Billing React Query Hooks
 * Custom hooks for billing data fetching and mutations
 */
import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { billingApi } from '@/lib/api/billing';
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
  PaginatedPaymentPoints,
  Service,
  ServiceListParams,
  ServiceCategory,
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

  // Payments
  payments: () => [...billingKeys.all, 'payments'] as const,
  paymentsList: (params?: PaymentListParams) => [...billingKeys.payments(), 'list', params] as const,
  paymentDetail: (id: number) => [...billingKeys.payments(), 'detail', id] as const,
  paymentReceipt: (id: number) => [...billingKeys.payments(), 'receipt', id] as const,

  // Payment points
  paymentPoints: () => [...billingKeys.all, 'payment-points'] as const,
  paymentPointsList: (params?: PaymentPointListParams) =>
    [...billingKeys.paymentPoints(), 'list', params] as const,

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
};

// ============================================================================
// Invoice Hooks
// ============================================================================

/**
 * Fetch paginated list of invoices
 */
export function useInvoices(params?: InvoiceListParams) {
  return useQuery({
    queryKey: billingKeys.invoicesList(params),
    queryFn: () => billingApi.getInvoices(params),
  });
}

/**
 * Fetch single invoice by ID
 */
export function useInvoice(id: number | undefined) {
  return useQuery({
    queryKey: billingKeys.invoiceDetail(id!),
    queryFn: () => billingApi.getInvoice(id!),
    enabled: id !== undefined,
  });
}

/**
 * Fetch overdue invoices
 */
export function useOverdueInvoices() {
  return useQuery({
    queryKey: billingKeys.invoicesOverdue(),
    queryFn: () => billingApi.getOverdueInvoices(),
  });
}

/**
 * Create a new invoice
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InvoiceCreateData) => billingApi.createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
  });
}

/**
 * Update an existing invoice
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: InvoiceUpdateData }) =>
      billingApi.updateInvoice(id, data),
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

/**
 * useBilling Hook
 *
 * TanStack Query hooks for billing (invoices / payments).
 *
 * @module hooks/useBilling
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult,
} from '@tanstack/react-query';
import {
  billingApi,
  Invoice,
  InvoiceListResponse,
  InvoiceListParams,
  Payment,
  PaymentListParams,
  PaymentListResponse,
  CreatePaymentData,
} from '@/lib/api/billing';

export const invoiceKeys = {
  all: ['invoices'] as const,
  lists: () => [...invoiceKeys.all, 'list'] as const,
  list: (params: InvoiceListParams) => [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, 'detail'] as const,
  detail: (id: number) => [...invoiceKeys.details(), id] as const,
};

/**
 * Fetch paginated invoice list
 */
export function useInvoices(
  params: InvoiceListParams = {},
): UseQueryResult<InvoiceListResponse, Error> {
  return useQuery({
    queryKey: invoiceKeys.list(params),
    queryFn: () => billingApi.list(params),
  });
}

/**
 * Fetch a single invoice with items
 */
export function useInvoice(
  id: number | null,
): UseQueryResult<Invoice, Error> {
  return useQuery({
    queryKey: invoiceKeys.detail(id ?? 0),
    queryFn: () => billingApi.get(id!),
    enabled: id !== null && id > 0,
  });
}

/**
 * Fetch payments for an invoice.
 */
export function useInvoicePayments(
  params: PaymentListParams = {},
): UseQueryResult<PaymentListResponse, Error> {
  return useQuery({
    queryKey: [...invoiceKeys.all, 'payments', params],
    queryFn: () => billingApi.listPayments(params),
  });
}

/**
 * Record a payment mutation
 */
export function useRecordPayment(): UseMutationResult<
  Payment,
  Error,
  CreatePaymentData
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePaymentData) => billingApi.recordPayment(data),
    onSuccess: (_payment, variables) => {
      qc.invalidateQueries({ queryKey: invoiceKeys.detail(variables.invoice) });
      qc.invalidateQueries({ queryKey: invoiceKeys.lists() });
    },
  });
}

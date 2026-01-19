/**
 * TDD Tests for Billing React Query Hooks - RED PHASE
 *
 * These tests define the expected behavior of billing hooks
 * before implementation. All tests should FAIL initially.
 *
 * @see docs/user-stories.md
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useInvoices,
  useInvoice,
  useCreateInvoice,
  useUpdateInvoice,
  useFinalizeInvoice,
  useCancelInvoice,
  useAddInvoiceItem,
  useRemoveInvoiceItem,
  useApplyDiscount,
  usePayments,
  usePayment,
  useCreatePayment,
  useMpesaSTKPush,
  useMpesaQuery,
  useServices,
  useServiceCategories,
  useCreditNotes,
  useCreateCreditNote,
  useApproveCreditNote,
  useDailyCollectionReport,
  useRevenueSummary,
  useOutstandingBalances,
  useServiceUtilization,
  usePaymentMethodAnalysis,
} from '@/lib/hooks/billing';
import { billingApi } from '@/lib/api/billing';

// Mock the billing API
jest.mock('@/lib/api/billing');

const mockBillingApi = billingApi as jest.Mocked<typeof billingApi>;

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryClientWrapper';
  return Wrapper;
};

// ============================================================================
// Test Fixtures
// ============================================================================

const mockInvoice = {
  id: 1,
  invoice_number: 'INV-20260103-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  status: 'PENDING' as const,
  total_amount: '1500.00',
  balance_due: '1500.00',
  due_date: '2026-02-02',
  invoice_date: '2026-01-03',
  subtotal: '1500.00',
  discount_type: null,
  discount_value: '0.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  amount_paid: '0.00',
  insurance_coverage: '0.00',
  notes: '',
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-03T10:00:00Z',
  created_by: 1,
};

const mockPayment = {
  id: 1,
  payment_reference: 'PAY-20260103-0001',
  invoice: 1,
  amount: '500.00',
  method: 'CASH' as const,
  status: 'COMPLETED' as const,
  notes: '',
  created_at: '2026-01-03T10:30:00Z',
  updated_at: '2026-01-03T10:30:00Z',
  created_by: 1,
};

const mockService = {
  id: 1,
  category: 1,
  code: 'CONS-001',
  name: 'General Consultation',
  unit_price: '500.00',
  currency: 'KES',
  sha_code: '',
  icd10_code: '',
  description: '',
  is_active: true,
  requires_quantity: false,
  is_taxable: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: 1,
};

// ============================================================================
// Invoice Hooks Tests
// ============================================================================

describe('useInvoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch invoices list', async () => {
    mockBillingApi.getInvoices.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockInvoice],
    });

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
    expect(mockBillingApi.getInvoices).toHaveBeenCalled();
  });

  it('should fetch invoices with filters', async () => {
    mockBillingApi.getInvoices.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const { result } = renderHook(
      () => useInvoices({ status: 'PENDING', patient: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockBillingApi.getInvoices).toHaveBeenCalledWith({ status: 'PENDING', patient: 1 });
  });

  it('should handle loading state', () => {
    mockBillingApi.getInvoices.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('should handle error state', async () => {
    mockBillingApi.getInvoices.mockRejectedValue(new Error('Failed to fetch'));

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });
});

describe('useInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch single invoice by ID', async () => {
    mockBillingApi.getInvoice.mockResolvedValue(mockInvoice);

    const { result } = renderHook(() => useInvoice(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockInvoice);
    expect(mockBillingApi.getInvoice).toHaveBeenCalledWith(1);
  });

  it('should not fetch when ID is undefined', () => {
    const { result } = renderHook(() => useInvoice(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(mockBillingApi.getInvoice).not.toHaveBeenCalled();
  });
});

describe('useCreateInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create invoice and invalidate queries', async () => {
    mockBillingApi.createInvoice.mockResolvedValue(mockInvoice);

    const { result } = renderHook(() => useCreateInvoice(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({
      patient: 1,
      due_date: '2026-02-02',
    });

    expect(mockBillingApi.createInvoice).toHaveBeenCalledWith({
      patient: 1,
      due_date: '2026-02-02',
    });
  });

  it('should handle validation errors', async () => {
    const validationError = {
      response: {
        status: 400,
        data: { patient: ['This field is required.'] },
      },
    };
    mockBillingApi.createInvoice.mockRejectedValue(validationError);

    const { result } = renderHook(() => useCreateInvoice(), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync({ patient: 0, due_date: '2026-02-02' } as any)).rejects.toMatchObject(
      validationError
    );
  });
});

describe('useFinalizeInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should finalize invoice', async () => {
    const finalizedInvoice = { ...mockInvoice, status: 'PENDING' as const };
    mockBillingApi.finalizeInvoice.mockResolvedValue(finalizedInvoice);

    const { result } = renderHook(() => useFinalizeInvoice(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync(1);

    expect(mockBillingApi.finalizeInvoice).toHaveBeenCalledWith(1);
    expect(response.status).toBe('PENDING');
  });
});

describe('useCancelInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should cancel invoice with reason', async () => {
    const cancelledInvoice = {
      ...mockInvoice,
      status: 'CANCELLED' as const,
      cancellation_reason: 'Patient request',
    };
    mockBillingApi.cancelInvoice.mockResolvedValue(cancelledInvoice);

    const { result } = renderHook(() => useCancelInvoice(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoiceId: 1,
      reason: 'Patient request',
    });

    expect(mockBillingApi.cancelInvoice).toHaveBeenCalledWith(1, 'Patient request');
    expect(response.status).toBe('CANCELLED');
  });
});

describe('useAddInvoiceItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add item to invoice', async () => {
    const mockItem = {
      id: 1,
      invoice: 1,
      description: 'Lab Test',
      quantity: 1,
      unit_price: '800.00',
      discount_percentage: '0.00',
      line_total: '800.00',
      is_covered_by_insurance: false,
      created_at: '2026-01-03T10:00:00Z',
      updated_at: '2026-01-03T10:00:00Z',
    };
    mockBillingApi.addInvoiceItem.mockResolvedValue(mockItem);

    const { result } = renderHook(() => useAddInvoiceItem(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoiceId: 1,
      item: {
        description: 'Lab Test',
        quantity: 1,
        unit_price: '800.00',
      },
    });

    expect(mockBillingApi.addInvoiceItem).toHaveBeenCalledWith(1, {
      description: 'Lab Test',
      quantity: 1,
      unit_price: '800.00',
    });
    expect(response.line_total).toBe('800.00');
  });
});

describe('useApplyDiscount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply percentage discount', async () => {
    const discountedInvoice = {
      ...mockInvoice,
      discount_type: 'PERCENTAGE' as const,
      discount_value: '10.00',
      discount_amount: '150.00',
    };
    mockBillingApi.applyDiscount.mockResolvedValue(discountedInvoice);

    const { result } = renderHook(() => useApplyDiscount(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoiceId: 1,
      discount: {
        discount_type: 'PERCENTAGE',
        discount_value: '10.00',
      },
    });

    expect(response.discount_amount).toBe('150.00');
  });
});

// ============================================================================
// Payment Hooks Tests
// ============================================================================

describe('usePayments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch payments list', async () => {
    mockBillingApi.getPayments.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockPayment],
    });

    const { result } = renderHook(() => usePayments(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });

  it('should filter payments by method', async () => {
    mockBillingApi.getPayments.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const { result } = renderHook(
      () => usePayments({ method: 'MPESA' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockBillingApi.getPayments).toHaveBeenCalledWith({ method: 'MPESA' });
  });
});

describe('useCreatePayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create cash payment', async () => {
    mockBillingApi.createPayment.mockResolvedValue(mockPayment);

    const { result } = renderHook(() => useCreatePayment(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoice: 1,
      amount: '500.00',
      method: 'CASH',
    });

    expect(mockBillingApi.createPayment).toHaveBeenCalledWith({
      invoice: 1,
      amount: '500.00',
      method: 'CASH',
    });
    expect(response.status).toBe('COMPLETED');
  });
});

// ============================================================================
// M-Pesa Hooks Tests - KE-CSH-001
// ============================================================================

describe('useMpesaSTKPush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initiate STK push', async () => {
    mockBillingApi.initiateMpesaSTKPush.mockResolvedValue({
      success: true,
      checkout_request_id: 'ws_CO_123456789',
      merchant_request_id: '12345',
      response_code: '0',
      response_description: 'Success',
      customer_message: 'Success',
    });

    const { result } = renderHook(() => useMpesaSTKPush(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoice_id: 1,
      phone_number: '0712345678',
      amount: '500.00',
      payment_point: 1,
    });

    expect(response.success).toBe(true);
    expect(response.checkout_request_id).toBeTruthy();
  });

  it('should handle STK push failure', async () => {
    mockBillingApi.initiateMpesaSTKPush.mockRejectedValue({
      response: {
        status: 400,
        data: { phone_number: ['Invalid phone number'] },
      },
    });

    const { result } = renderHook(() => useMpesaSTKPush(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        invoice_id: 1,
        phone_number: 'invalid',
        amount: '500.00',
        payment_point: 1,
      })
    ).rejects.toBeDefined();
  });
});

describe('useMpesaQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should query M-Pesa transaction status', async () => {
    mockBillingApi.queryMpesaTransaction.mockResolvedValue({
      success: true,
      result_code: 0,
      result_description: 'Success',
      checkout_request_id: 'ws_CO_123456789',
      mpesa_receipt_number: 'QJH3XXXXXX',
    });

    const { result } = renderHook(
      () => useMpesaQuery('ws_CO_123456789'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.success).toBe(true);
  });

  it('should poll for pending transactions', async () => {
    // First call returns pending
    mockBillingApi.queryMpesaTransaction.mockResolvedValueOnce({
      success: false,
      result_code: 1,
      result_description: 'Pending',
      checkout_request_id: 'ws_CO_123456789',
    });

    const { result } = renderHook(
      () => useMpesaQuery('ws_CO_123456789', { refetchInterval: 3000 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Should be polling
    expect(result.current.data?.success).toBe(false);
  });
});

// ============================================================================
// Service Hooks Tests
// ============================================================================

describe('useServices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch services list', async () => {
    mockBillingApi.getServices.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [mockService],
    });

    const { result } = renderHook(() => useServices(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });

  it('should filter by category', async () => {
    mockBillingApi.getServices.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const { result } = renderHook(
      () => useServices({ category: 1 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockBillingApi.getServices).toHaveBeenCalledWith({ category: 1 });
  });
});

describe('useServiceCategories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch service categories', async () => {
    mockBillingApi.getServiceCategories.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 1, name: 'Consultation', code: 'CONS', description: '', display_order: 1, is_active: true, created_at: '', updated_at: '' }],
    });

    const { result } = renderHook(() => useServiceCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });
});

// ============================================================================
// Credit Note Hooks Tests
// ============================================================================

describe('useCreditNotes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch credit notes', async () => {
    mockBillingApi.getCreditNotes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 1,
        credit_note_number: 'CN-001',
        invoice: 1,
        amount: '100.00',
        reason: 'OVERCHARGE' as const,
        reason_detail: 'Test',
        status: 'PENDING' as const,
        requested_by: 1,
        created_at: '',
      }],
    });

    const { result } = renderHook(() => useCreditNotes(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
  });
});

describe('useCreateCreditNote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create credit note', async () => {
    mockBillingApi.createCreditNote.mockResolvedValue({
      id: 1,
      credit_note_number: 'CN-001',
      invoice: 1,
      amount: '100.00',
      reason: 'OVERCHARGE' as const,
      reason_detail: 'Overcharged for consultation',
      status: 'PENDING' as const,
      requested_by: 1,
      created_at: '',
    });

    const { result } = renderHook(() => useCreateCreditNote(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync({
      invoice: 1,
      amount: '100.00',
      reason: 'OVERCHARGE',
      reason_detail: 'Overcharged for consultation',
    });

    expect(response.status).toBe('PENDING');
  });
});

describe('useApproveCreditNote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should approve credit note', async () => {
    mockBillingApi.approveCreditNote.mockResolvedValue({
      id: 1,
      credit_note_number: 'CN-001',
      invoice: 1,
      amount: '100.00',
      reason: 'OVERCHARGE' as const,
      reason_detail: 'Test',
      status: 'APPROVED' as const,
      requested_by: 1,
      created_at: '',
      approved_by: 2,
      approved_at: '2026-01-03T12:00:00Z',
    });

    const { result } = renderHook(() => useApproveCreditNote(), {
      wrapper: createWrapper(),
    });

    const response = await result.current.mutateAsync(1);

    expect(response.status).toBe('APPROVED');
  });
});

// ============================================================================
// Report Hooks Tests - KE-CLM-003
// ============================================================================

describe('useDailyCollectionReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch daily collection report', async () => {
    mockBillingApi.getDailyCollectionReport.mockResolvedValue({
      date: '2026-01-03',
      total_collected: '15000.00',
      total_amount: 15000,
      total_transactions: 10,
      invoice_count: 10,
      by_payment_method: {
        CASH: '8000.00',
        MPESA: '5000.00',
        CARD: '2000.00',
        INSURANCE: '0.00',
        BANK_TRANSFER: '0.00',
      },
    });

    const { result } = renderHook(
      () => useDailyCollectionReport('2026-01-03'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total_collected).toBe('15000.00');
  });
});

describe('useRevenueSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch revenue summary', async () => {
    mockBillingApi.getRevenueSummary.mockResolvedValue({
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      total_revenue: '500000.00',
      by_category: [],
      by_payment_method: {
        CASH: '200000.00',
        MPESA: '250000.00',
        CARD: '50000.00',
        INSURANCE: '0.00',
        BANK_TRANSFER: '0.00',
      },
    });

    const { result } = renderHook(
      () => useRevenueSummary('2026-01-01', '2026-01-31'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total_revenue).toBe('500000.00');
  });
});

describe('useOutstandingBalances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch outstanding balances', async () => {
    mockBillingApi.getOutstandingBalances.mockResolvedValue([
      {
        invoice_id: 1,
        invoice_number: 'INV-001',
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-001',
        invoice_date: '2026-01-01',
        due_date: '2026-01-31',
        total_amount: '1500.00',
        amount_paid: '500.00',
        balance_due: '1000.00',
        days_overdue: 3,
        status: 'OVERDUE' as const,
      },
    ]);

    const { result } = renderHook(() => useOutstandingBalances(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.days_overdue).toBe(3);
  });
});

describe('useServiceUtilization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch service utilization', async () => {
    mockBillingApi.getServiceUtilization.mockResolvedValue([
      {
        service_id: 1,
        service_name: 'Consultation',
        service_code: 'CONS-001',
        category: 'Consultation',
        count: 100,
        total_revenue: '50000.00',
      },
    ]);

    const { result } = renderHook(
      () => useServiceUtilization('2026-01-01', '2026-01-31'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
  });
});

describe('usePaymentMethodAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch payment method analysis', async () => {
    mockBillingApi.getPaymentMethodAnalysis.mockResolvedValue({
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      total_payments: 500,
      total_amount: '500000.00',
      by_method: [],
      mpesa_success_rate: '95.00',
      average_payment_amount: '1000.00',
    });

    const { result } = renderHook(
      () => usePaymentMethodAnalysis('2026-01-01', '2026-01-31'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.mpesa_success_rate).toBe('95.00');
  });
});

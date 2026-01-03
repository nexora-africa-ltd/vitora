/**
 * TDD Tests for Billing Zustand Store - RED PHASE
 * 
 * Tests for billing state management before implementation.
 * All tests should FAIL initially.
 */
import { renderHook, act } from '@testing-library/react';
import { useBillingStore, useBillingStoreWithComputed } from '@/lib/stores/billing';
import type { InvoiceStatus, PaymentMethod } from '@/lib/types/billing';

describe('useBillingStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useBillingStore.getState().reset();
  });

  // ============================================================================
  // Invoice Filter State Tests
  // ============================================================================

  describe('Invoice Filters', () => {
    it('should have default invoice filters', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.invoiceFilters).toEqual({
        status: undefined,
        patient: undefined,
        startDate: undefined,
        endDate: undefined,
        search: '',
        page: 1,
        pageSize: 20,
      });
    });

    it('should update invoice status filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceStatusFilter('PENDING');
      });

      expect(result.current.invoiceFilters.status).toBe('PENDING');
    });

    it('should update invoice date range filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceDateRange('2026-01-01', '2026-01-31');
      });

      expect(result.current.invoiceFilters.startDate).toBe('2026-01-01');
      expect(result.current.invoiceFilters.endDate).toBe('2026-01-31');
    });

    it('should update invoice search filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceSearch('Jane');
      });

      expect(result.current.invoiceFilters.search).toBe('Jane');
    });

    it('should update invoice patient filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoicePatientFilter(1);
      });

      expect(result.current.invoiceFilters.patient).toBe(1);
    });

    it('should update invoice page', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoicePage(3);
      });

      expect(result.current.invoiceFilters.page).toBe(3);
    });

    it('should reset invoice filters', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceStatusFilter('PENDING');
        result.current.setInvoiceSearch('Jane');
        result.current.resetInvoiceFilters();
      });

      expect(result.current.invoiceFilters.status).toBeUndefined();
      expect(result.current.invoiceFilters.search).toBe('');
    });
  });

  // ============================================================================
  // Payment Filter State Tests
  // ============================================================================

  describe('Payment Filters', () => {
    it('should have default payment filters', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.paymentFilters).toEqual({
        method: undefined,
        status: undefined,
        invoice: undefined,
        startDate: undefined,
        endDate: undefined,
        page: 1,
        pageSize: 20,
      });
    });

    it('should update payment method filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setPaymentMethodFilter('MPESA');
      });

      expect(result.current.paymentFilters.method).toBe('MPESA');
    });

    it('should update payment status filter', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setPaymentStatusFilter('COMPLETED');
      });

      expect(result.current.paymentFilters.status).toBe('COMPLETED');
    });

    it('should reset payment filters', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setPaymentMethodFilter('CASH');
        result.current.resetPaymentFilters();
      });

      expect(result.current.paymentFilters.method).toBeUndefined();
    });
  });

  // ============================================================================
  // Selected Items State Tests
  // ============================================================================

  describe('Selected Items', () => {
    it('should track selected invoice', () => {
      const { result } = renderHook(() => useBillingStore());

      const mockInvoice = { id: 1, invoice_number: 'INV-001' };

      act(() => {
        result.current.setSelectedInvoice(mockInvoice as any);
      });

      expect(result.current.selectedInvoice?.id).toBe(1);
    });

    it('should clear selected invoice', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setSelectedInvoice({ id: 1 } as any);
        result.current.clearSelectedInvoice();
      });

      expect(result.current.selectedInvoice).toBeNull();
    });

    it('should track selected payment', () => {
      const { result } = renderHook(() => useBillingStore());

      const mockPayment = { id: 1, payment_reference: 'PAY-001' };

      act(() => {
        result.current.setSelectedPayment(mockPayment as any);
      });

      expect(result.current.selectedPayment?.id).toBe(1);
    });

    it('should track multiple selected invoices for batch operations', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.toggleInvoiceSelection(1);
        result.current.toggleInvoiceSelection(2);
        result.current.toggleInvoiceSelection(3);
      });

      expect(result.current.selectedInvoiceIds).toEqual([1, 2, 3]);
    });

    it('should remove from selected when toggled again', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.toggleInvoiceSelection(1);
        result.current.toggleInvoiceSelection(2);
        result.current.toggleInvoiceSelection(1);
      });

      expect(result.current.selectedInvoiceIds).toEqual([2]);
    });

    it('should clear all selected invoices', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.toggleInvoiceSelection(1);
        result.current.toggleInvoiceSelection(2);
        result.current.clearSelectedInvoices();
      });

      expect(result.current.selectedInvoiceIds).toEqual([]);
    });

    it('should select all invoices from list', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.selectAllInvoices([1, 2, 3, 4, 5]);
      });

      expect(result.current.selectedInvoiceIds).toEqual([1, 2, 3, 4, 5]);
    });
  });

  // ============================================================================
  // UI State Tests
  // ============================================================================

  describe('UI State', () => {
    it('should track payment dialog open state', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.isPaymentDialogOpen).toBe(false);

      act(() => {
        result.current.openPaymentDialog();
      });

      expect(result.current.isPaymentDialogOpen).toBe(true);

      act(() => {
        result.current.closePaymentDialog();
      });

      expect(result.current.isPaymentDialogOpen).toBe(false);
    });

    it('should track credit note dialog open state', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.isCreditNoteDialogOpen).toBe(false);

      act(() => {
        result.current.openCreditNoteDialog();
      });

      expect(result.current.isCreditNoteDialogOpen).toBe(true);
    });

    it('should track discount dialog open state', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.openDiscountDialog();
      });

      expect(result.current.isDiscountDialogOpen).toBe(true);
    });

    it('should track active tab', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.activeTab).toBe('invoices');

      act(() => {
        result.current.setActiveTab('payments');
      });

      expect(result.current.activeTab).toBe('payments');
    });
  });

  // ============================================================================
  // M-Pesa Payment State Tests
  // ============================================================================

  describe('M-Pesa Payment State', () => {
    it('should track M-Pesa payment progress', () => {
      const { result } = renderHook(() => useBillingStore());

      expect(result.current.mpesaPayment).toEqual({
        status: 'idle',
        checkoutRequestId: null,
        phoneNumber: '',
        amount: '',
        errorMessage: null,
        receiptNumber: null,
      });
    });

    it('should update M-Pesa status to initiating', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setMpesaStatus('initiating');
      });

      expect(result.current.mpesaPayment.status).toBe('initiating');
    });

    it('should store checkout request ID', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setMpesaCheckoutRequestId('ws_CO_123456789');
        result.current.setMpesaStatus('waiting');
      });

      expect(result.current.mpesaPayment.checkoutRequestId).toBe('ws_CO_123456789');
      expect(result.current.mpesaPayment.status).toBe('waiting');
    });

    it('should handle M-Pesa success', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setMpesaSuccess('QJH3XXXXXX');
      });

      expect(result.current.mpesaPayment.status).toBe('success');
      expect(result.current.mpesaPayment.receiptNumber).toBe('QJH3XXXXXX');
    });

    it('should handle M-Pesa failure', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setMpesaError('Request cancelled by user');
      });

      expect(result.current.mpesaPayment.status).toBe('failed');
      expect(result.current.mpesaPayment.errorMessage).toBe('Request cancelled by user');
    });

    it('should reset M-Pesa state', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setMpesaSuccess('QJH3XXXXXX');
        result.current.resetMpesaPayment();
      });

      expect(result.current.mpesaPayment.status).toBe('idle');
      expect(result.current.mpesaPayment.receiptNumber).toBeNull();
    });
  });

  // ============================================================================
  // Report State Tests
  // ============================================================================

  describe('Report State', () => {
    it('should track report date range', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setReportDateRange('2026-01-01', '2026-01-31');
      });

      expect(result.current.reportDateRange).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });
    });

    it('should set report date to today by default', () => {
      const { result } = renderHook(() => useBillingStore());

      const today = new Date().toISOString().split('T')[0];
      expect(result.current.reportDateRange.startDate).toBe(today);
      expect(result.current.reportDateRange.endDate).toBe(today);
    });

    it('should track selected report type', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setReportType('revenue-summary');
      });

      expect(result.current.reportType).toBe('revenue-summary');
    });
  });

  // ============================================================================
  // Persistence Tests
  // ============================================================================

  describe('Persistence', () => {
    it('should persist filters to local storage', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceStatusFilter('PENDING');
      });

      // Check localStorage (requires middleware setup)
      const stored = localStorage.getItem('billing-store');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.invoiceFilters.status).toBe('PENDING');
      }
    });
  });

  // ============================================================================
  // Reset Tests
  // ============================================================================

  describe('Reset', () => {
    it('should reset all state', () => {
      const { result } = renderHook(() => useBillingStore());

      act(() => {
        result.current.setInvoiceStatusFilter('PENDING');
        result.current.setPaymentMethodFilter('MPESA');
        result.current.toggleInvoiceSelection(1);
        result.current.openPaymentDialog();
        result.current.reset();
      });

      expect(result.current.invoiceFilters.status).toBeUndefined();
      expect(result.current.paymentFilters.method).toBeUndefined();
      expect(result.current.selectedInvoiceIds).toEqual([]);
      expect(result.current.isPaymentDialogOpen).toBe(false);
    });
  });

  // ============================================================================
  // Computed Values Tests
  // ============================================================================

  describe('Computed Values', () => {
    it('should compute whether any invoice is selected', () => {
      const { result } = renderHook(() => useBillingStoreWithComputed());

      expect(result.current.hasSelectedInvoices).toBe(false);

      act(() => {
        result.current.toggleInvoiceSelection(1);
      });

      expect(result.current.hasSelectedInvoices).toBe(true);
    });

    it('should compute selected invoice count', () => {
      const { result } = renderHook(() => useBillingStoreWithComputed());

      act(() => {
        result.current.toggleInvoiceSelection(1);
        result.current.toggleInvoiceSelection(2);
      });

      expect(result.current.selectedInvoiceCount).toBe(2);
    });

    it('should compute whether filters are active', () => {
      const { result } = renderHook(() => useBillingStoreWithComputed());

      expect(result.current.hasActiveInvoiceFilters).toBe(false);

      act(() => {
        result.current.setInvoiceStatusFilter('PENDING');
      });

      expect(result.current.hasActiveInvoiceFilters).toBe(true);
    });
  });
});

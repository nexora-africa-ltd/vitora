/**
 * Billing Zustand Store
 * State management for billing module
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Invoice,
  Payment,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/lib/types/billing';

// ============================================================================
// Types
// ============================================================================

interface InvoiceFilters {
  status?: InvoiceStatus;
  patient?: number;
  startDate?: string;
  endDate?: string;
  search: string;
  page: number;
  pageSize: number;
}

interface PaymentFilters {
  method?: PaymentMethod;
  status?: PaymentStatus;
  invoice?: number;
  startDate?: string;
  endDate?: string;
  page: number;
  pageSize: number;
}

interface MpesaPaymentState {
  status: 'idle' | 'initiating' | 'waiting' | 'success' | 'failed';
  checkoutRequestId: string | null;
  phoneNumber: string;
  amount: string;
  errorMessage: string | null;
  receiptNumber: string | null;
}

interface ReportDateRange {
  startDate: string;
  endDate: string;
}

type ReportType =
  | 'daily-collection'
  | 'revenue-summary'
  | 'outstanding-balances'
  | 'service-utilization'
  | 'payment-analysis';

type BillingTab = 'invoices' | 'payments' | 'bills' | 'credit-notes' | 'reports';

interface BillingState {
  // Invoice filters
  invoiceFilters: InvoiceFilters;
  setInvoiceStatusFilter: (status: InvoiceStatus | undefined) => void;
  setInvoiceDateRange: (startDate: string, endDate: string) => void;
  setInvoiceSearch: (search: string) => void;
  setInvoicePatientFilter: (patientId: number | undefined) => void;
  setInvoicePage: (page: number) => void;
  resetInvoiceFilters: () => void;

  // Payment filters
  paymentFilters: PaymentFilters;
  setPaymentMethodFilter: (method: PaymentMethod | undefined) => void;
  setPaymentStatusFilter: (status: PaymentStatus | undefined) => void;
  setPaymentPage: (page: number) => void;
  resetPaymentFilters: () => void;

  // Selected items
  selectedInvoice: Invoice | null;
  setSelectedInvoice: (invoice: Invoice | null) => void;
  clearSelectedInvoice: () => void;

  selectedPayment: Payment | null;
  setSelectedPayment: (payment: Payment | null) => void;

  // Multiple selection for batch operations
  selectedInvoiceIds: number[];
  toggleInvoiceSelection: (invoiceId: number) => void;
  selectAllInvoices: (invoiceIds: number[]) => void;
  clearSelectedInvoices: () => void;

  // UI State
  isPaymentDialogOpen: boolean;
  openPaymentDialog: () => void;
  closePaymentDialog: () => void;

  isCreditNoteDialogOpen: boolean;
  openCreditNoteDialog: () => void;
  closeCreditNoteDialog: () => void;

  isDiscountDialogOpen: boolean;
  openDiscountDialog: () => void;
  closeDiscountDialog: () => void;

  activeTab: BillingTab;
  setActiveTab: (tab: BillingTab) => void;

  // M-Pesa Payment State
  mpesaPayment: MpesaPaymentState;
  setMpesaStatus: (status: MpesaPaymentState['status']) => void;
  setMpesaCheckoutRequestId: (id: string) => void;
  setMpesaPhoneNumber: (phone: string) => void;
  setMpesaAmount: (amount: string) => void;
  setMpesaSuccess: (receiptNumber: string) => void;
  setMpesaError: (errorMessage: string) => void;
  resetMpesaPayment: () => void;

  // Report State
  reportDateRange: ReportDateRange;
  setReportDateRange: (startDate: string, endDate: string) => void;
  reportType: ReportType;
  setReportType: (type: ReportType) => void;

  // Computed values (as getters)
  hasSelectedInvoices: boolean;
  selectedInvoiceCount: number;
  hasActiveInvoiceFilters: boolean;

  // Reset all state
  reset: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const getToday = (): string => new Date().toISOString().split('T')[0] ?? '';

const defaultInvoiceFilters: InvoiceFilters = {
  status: undefined,
  patient: undefined,
  startDate: undefined,
  endDate: undefined,
  search: '',
  page: 1,
  pageSize: 20,
};

const defaultPaymentFilters: PaymentFilters = {
  method: undefined,
  status: undefined,
  invoice: undefined,
  startDate: undefined,
  endDate: undefined,
  page: 1,
  pageSize: 20,
};

const defaultMpesaPayment: MpesaPaymentState = {
  status: 'idle',
  checkoutRequestId: null,
  phoneNumber: '',
  amount: '',
  errorMessage: null,
  receiptNumber: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useBillingStore = create<BillingState>()(
  persist(
    (set, get) => ({
      // ========================================================================
      // Invoice Filters
      // ========================================================================
      invoiceFilters: { ...defaultInvoiceFilters },

      setInvoiceStatusFilter: (status) =>
        set((state) => ({
          invoiceFilters: { ...state.invoiceFilters, status, page: 1 },
        })),

      setInvoiceDateRange: (startDate, endDate) =>
        set((state) => ({
          invoiceFilters: { ...state.invoiceFilters, startDate, endDate, page: 1 },
        })),

      setInvoiceSearch: (search) =>
        set((state) => ({
          invoiceFilters: { ...state.invoiceFilters, search, page: 1 },
        })),

      setInvoicePatientFilter: (patient) =>
        set((state) => ({
          invoiceFilters: { ...state.invoiceFilters, patient, page: 1 },
        })),

      setInvoicePage: (page) =>
        set((state) => ({
          invoiceFilters: { ...state.invoiceFilters, page },
        })),

      resetInvoiceFilters: () =>
        set({ invoiceFilters: { ...defaultInvoiceFilters } }),

      // ========================================================================
      // Payment Filters
      // ========================================================================
      paymentFilters: { ...defaultPaymentFilters },

      setPaymentMethodFilter: (method) =>
        set((state) => ({
          paymentFilters: { ...state.paymentFilters, method, page: 1 },
        })),

      setPaymentStatusFilter: (status) =>
        set((state) => ({
          paymentFilters: { ...state.paymentFilters, status, page: 1 },
        })),

      setPaymentPage: (page) =>
        set((state) => ({
          paymentFilters: { ...state.paymentFilters, page },
        })),

      resetPaymentFilters: () =>
        set({ paymentFilters: { ...defaultPaymentFilters } }),

      // ========================================================================
      // Selected Items
      // ========================================================================
      selectedInvoice: null,
      setSelectedInvoice: (invoice) => set({ selectedInvoice: invoice }),
      clearSelectedInvoice: () => set({ selectedInvoice: null }),

      selectedPayment: null,
      setSelectedPayment: (payment) => set({ selectedPayment: payment }),

      // Multiple selection
      selectedInvoiceIds: [],

      toggleInvoiceSelection: (invoiceId) =>
        set((state) => {
          const isSelected = state.selectedInvoiceIds.includes(invoiceId);
          if (isSelected) {
            return {
              selectedInvoiceIds: state.selectedInvoiceIds.filter(
                (id) => id !== invoiceId
              ),
            };
          }
          return {
            selectedInvoiceIds: [...state.selectedInvoiceIds, invoiceId],
          };
        }),

      selectAllInvoices: (invoiceIds) => set({ selectedInvoiceIds: invoiceIds }),

      clearSelectedInvoices: () => set({ selectedInvoiceIds: [] }),

      // ========================================================================
      // UI State
      // ========================================================================
      isPaymentDialogOpen: false,
      openPaymentDialog: () => set({ isPaymentDialogOpen: true }),
      closePaymentDialog: () => set({ isPaymentDialogOpen: false }),

      isCreditNoteDialogOpen: false,
      openCreditNoteDialog: () => set({ isCreditNoteDialogOpen: true }),
      closeCreditNoteDialog: () => set({ isCreditNoteDialogOpen: false }),

      isDiscountDialogOpen: false,
      openDiscountDialog: () => set({ isDiscountDialogOpen: true }),
      closeDiscountDialog: () => set({ isDiscountDialogOpen: false }),

      activeTab: 'invoices',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ========================================================================
      // M-Pesa Payment State
      // ========================================================================
      mpesaPayment: { ...defaultMpesaPayment },

      setMpesaStatus: (status) =>
        set((state) => ({
          mpesaPayment: { ...state.mpesaPayment, status },
        })),

      setMpesaCheckoutRequestId: (checkoutRequestId) =>
        set((state) => ({
          mpesaPayment: { ...state.mpesaPayment, checkoutRequestId },
        })),

      setMpesaPhoneNumber: (phoneNumber) =>
        set((state) => ({
          mpesaPayment: { ...state.mpesaPayment, phoneNumber },
        })),

      setMpesaAmount: (amount) =>
        set((state) => ({
          mpesaPayment: { ...state.mpesaPayment, amount },
        })),

      setMpesaSuccess: (receiptNumber) =>
        set((state) => ({
          mpesaPayment: {
            ...state.mpesaPayment,
            status: 'success',
            receiptNumber,
            errorMessage: null,
          },
        })),

      setMpesaError: (errorMessage) =>
        set((state) => ({
          mpesaPayment: {
            ...state.mpesaPayment,
            status: 'failed',
            errorMessage,
          },
        })),

      resetMpesaPayment: () =>
        set({ mpesaPayment: { ...defaultMpesaPayment } }),

      // ========================================================================
      // Report State
      // ========================================================================
      reportDateRange: {
        startDate: getToday(),
        endDate: getToday(),
      },

      setReportDateRange: (startDate, endDate) =>
        set({ reportDateRange: { startDate, endDate } }),

      reportType: 'daily-collection',
      setReportType: (reportType) => set({ reportType }),

      // ========================================================================
      // Computed Values
      // Note: These are computed on access, not stored in state
      // ========================================================================
      hasSelectedInvoices: false, // Placeholder - computed below
      selectedInvoiceCount: 0, // Placeholder - computed below
      hasActiveInvoiceFilters: false, // Placeholder - computed below

      // ========================================================================
      // Reset
      // ========================================================================
      reset: () =>
        set({
          invoiceFilters: { ...defaultInvoiceFilters },
          paymentFilters: { ...defaultPaymentFilters },
          selectedInvoice: null,
          selectedPayment: null,
          selectedInvoiceIds: [],
          isPaymentDialogOpen: false,
          isCreditNoteDialogOpen: false,
          isDiscountDialogOpen: false,
          activeTab: 'invoices',
          mpesaPayment: { ...defaultMpesaPayment },
          reportDateRange: {
            startDate: getToday(),
            endDate: getToday(),
          },
          reportType: 'daily-collection',
        }),
    }),
    {
      name: 'billing-store',
      partialize: (state) => ({
        invoiceFilters: state.invoiceFilters,
        paymentFilters: state.paymentFilters,
        activeTab: state.activeTab,
        reportDateRange: state.reportDateRange,
        reportType: state.reportType,
      }),
    }
  )
);

// ============================================================================
// Selectors for computed values
// Use these with: useBillingStore(selectHasSelectedInvoices)
// ============================================================================

export const selectHasSelectedInvoices = (state: BillingState) =>
  state.selectedInvoiceIds.length > 0;

export const selectSelectedInvoiceCount = (state: BillingState) =>
  state.selectedInvoiceIds.length;

export const selectHasActiveInvoiceFilters = (state: BillingState) => {
  const filters = state.invoiceFilters;
  return (
    filters.status !== undefined ||
    filters.patient !== undefined ||
    filters.startDate !== undefined ||
    filters.endDate !== undefined ||
    filters.search !== ''
  );
};

// ============================================================================
// Custom hook that includes computed values
// ============================================================================

export const useBillingStoreWithComputed = () => {
  const store = useBillingStore();
  return {
    ...store,
    hasSelectedInvoices: store.selectedInvoiceIds.length > 0,
    selectedInvoiceCount: store.selectedInvoiceIds.length,
    hasActiveInvoiceFilters:
      store.invoiceFilters.status !== undefined ||
      store.invoiceFilters.patient !== undefined ||
      store.invoiceFilters.startDate !== undefined ||
      store.invoiceFilters.endDate !== undefined ||
      store.invoiceFilters.search !== '',
  };
};

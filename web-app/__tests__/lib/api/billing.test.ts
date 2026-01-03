/**
 * TDD Tests for Billing API Client - RED PHASE
 * 
 * These tests define the expected behavior of the billing API client
 * before implementation. All tests should FAIL initially.
 * 
 * User Stories Covered:
 * - KE-CSH-001: Payment Processing
 * - KE-CSH-002: Invoice Generation
 * - KE-BIL-001: Billing Reconciliation
 * - KE-CLM-003: Financial Performance Reports
 * 
 * @see docs/user-stories.md
 * @see backend/BILLING_IMPLEMENTATION_STATUS.md
 */
import { billingApi } from '@/lib/api/billing';
import { apiClient } from '@/lib/api/client';
import type {
  Invoice,
  InvoiceCreateData,
  InvoiceItem,
  InvoiceItemCreateData,
  Payment,
  PaymentCreateData,
  Service,
  ServiceCategory,
  CreditNote,
  CreditNoteCreateData,
  Receipt,
  MpesaSTKPushRequest,
  ApplyDiscountData,
} from '@/lib/types/billing';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

// ============================================================================
// Test Fixtures
// ============================================================================

const mockServiceCategory: ServiceCategory = {
  id: 1,
  name: 'Consultation',
  code: 'CONS',
  description: 'Consultation services',
  display_order: 1,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockService: Service = {
  id: 1,
  category: 1,
  category_name: 'Consultation',
  code: 'CONS-001',
  name: 'General Consultation',
  description: 'General medical consultation',
  unit_price: '500.00',
  currency: 'KES',
  sha_code: 'SHA-CONS-001',
  icd10_code: '',
  is_active: true,
  requires_quantity: false,
  is_taxable: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: 1,
};

const mockInvoice: Invoice = {
  id: 1,
  invoice_number: 'INV-20260103-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  encounter: 1,
  status: 'PENDING',
  invoice_date: '2026-01-03',
  due_date: '2026-02-02',
  subtotal: '1500.00',
  discount_type: null,
  discount_value: '0.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  total_amount: '1500.00',
  amount_paid: '0.00',
  balance_due: '1500.00',
  sha_claim_number: '',
  insurance_coverage: '0.00',
  notes: '',
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-03T10:00:00Z',
  created_by: 1,
};

const mockInvoiceItem: InvoiceItem = {
  id: 1,
  invoice: 1,
  description: 'General Consultation',
  quantity: 1,
  unit_price: '500.00',
  discount_percentage: '0.00',
  line_total: '500.00',
  service: 1,
  service_name: 'General Consultation',
  is_covered_by_insurance: false,
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-03T10:00:00Z',
};

const mockPayment: Payment = {
  id: 1,
  payment_reference: 'PAY-20260103-0001',
  invoice: 1,
  invoice_number: 'INV-20260103-0001',
  patient_name: 'Jane Doe',
  amount: '500.00',
  method: 'CASH',
  status: 'COMPLETED',
  notes: '',
  created_at: '2026-01-03T10:30:00Z',
  updated_at: '2026-01-03T10:30:00Z',
  created_by: 1,
  processed_at: '2026-01-03T10:30:00Z',
  processed_by: 1,
};

const mockReceipt: Receipt = {
  id: 1,
  receipt_number: 'RCP-20260103-0001',
  payment: 1,
  payment_reference: 'PAY-20260103-0001',
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  facility_name: 'Demo Health Facility',
  facility_address: '123 Health Street, Nairobi',
  facility_phone: '+254712345678',
  amount: '500.00',
  amount_in_words: 'Five Hundred Kenya Shillings Only',
  payment_method: 'CASH',
  receipt_date: '2026-01-03T10:30:00Z',
  is_voided: false,
  created_at: '2026-01-03T10:30:00Z',
  created_by: 1,
};

const mockCreditNote: CreditNote = {
  id: 1,
  credit_note_number: 'CN-20260103-0001',
  invoice: 1,
  invoice_number: 'INV-20260103-0001',
  patient_name: 'Jane Doe',
  amount: '100.00',
  reason: 'OVERCHARGE',
  reason_detail: 'Incorrect consultation fee applied',
  status: 'PENDING',
  requested_by: 1,
  requested_by_name: 'Test User',
  created_at: '2026-01-03T11:00:00Z',
};

// ============================================================================
// Service Category Tests
// ============================================================================

describe('Billing API - Service Categories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getServiceCategories', () => {
    it('should fetch all service categories', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockServiceCategory],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await billingApi.getServiceCategories();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/categories/');
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.code).toBe('CONS');
    });

    it('should return active categories by default', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getServiceCategories({ is_active: true });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('is_active=true');
    });
  });

  describe('getServiceCategory', () => {
    it('should fetch a single service category by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockServiceCategory });

      const result = await billingApi.getServiceCategory(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/categories/1/');
      expect(result.name).toBe('Consultation');
    });
  });
});

// ============================================================================
// Service Tests
// ============================================================================

describe('Billing API - Services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getServices', () => {
    it('should fetch services list with default params', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockService],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await billingApi.getServices();

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/billing/services/'));
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.name).toBe('General Consultation');
    });

    it('should filter services by category', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getServices({ category: 1 });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('category=1');
    });

    it('should filter services by active status', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getServices({ is_active: true });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('is_active=true');
    });

    it('should search services by name or code', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getServices({ search: 'consultation' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('search=consultation');
    });
  });

  describe('getService', () => {
    it('should fetch a single service by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockService });

      const result = await billingApi.getService(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/services/1/');
      expect(result.code).toBe('CONS-001');
    });
  });

  describe('createService', () => {
    it('should create a new service', async () => {
      const serviceData = {
        category: 1,
        code: 'LAB-001',
        name: 'Complete Blood Count',
        unit_price: '800.00',
      };
      const mockResponse = { id: 2, ...serviceData };
      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await billingApi.createService(serviceData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/services/', serviceData);
      expect(result.code).toBe('LAB-001');
    });
  });

  describe('updateService', () => {
    it('should update an existing service', async () => {
      const updateData = { unit_price: '600.00' };
      mockApiClient.patch.mockResolvedValue({ data: { ...mockService, ...updateData } });

      const result = await billingApi.updateService(1, updateData);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/billing/services/1/', updateData);
      expect(result.unit_price).toBe('600.00');
    });
  });

  describe('deleteService', () => {
    it('should delete a service', async () => {
      mockApiClient.delete.mockResolvedValue({ data: null });

      await billingApi.deleteService(1);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/billing/services/1/');
    });
  });
});

// ============================================================================
// Invoice Tests - KE-CSH-002
// ============================================================================

describe('Billing API - Invoices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInvoices', () => {
    it('should fetch invoices list with default params', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockInvoice],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await billingApi.getInvoices();

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/billing/invoices/'));
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.invoice_number).toBe('INV-20260103-0001');
    });

    it('should filter invoices by status', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getInvoices({ status: 'PENDING' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('status=PENDING');
    });

    it('should filter invoices by patient', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getInvoices({ patient: 1 });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('patient=1');
    });

    it('should filter invoices by date range', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getInvoices({ start_date: '2026-01-01', end_date: '2026-01-31' });

      const url = mockApiClient.get.mock.calls[0]?.[0];
      expect(url).toContain('start_date=2026-01-01');
      expect(url).toContain('end_date=2026-01-31');
    });

    it('should support pagination', async () => {
      const mockResponse = { data: { count: 50, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getInvoices({ page: 2, page_size: 20 });

      const url = mockApiClient.get.mock.calls[0]?.[0];
      expect(url).toContain('page=2');
      expect(url).toContain('page_size=20');
    });
  });

  describe('getInvoice', () => {
    it('should fetch a single invoice by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockInvoice });

      const result = await billingApi.getInvoice(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/invoices/1/');
      expect(result.patient_name).toBe('Jane Doe');
    });
  });

  describe('createInvoice', () => {
    it('should create a new invoice', async () => {
      const invoiceData: InvoiceCreateData = {
        patient: 1,
        encounter: 1,
        due_date: '2026-02-02',
        notes: 'Regular consultation visit',
      };
      mockApiClient.post.mockResolvedValue({ data: mockInvoice });

      const result = await billingApi.createInvoice(invoiceData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/invoices/', invoiceData);
      expect(result.invoice_number).toMatch(/^INV-/);
    });
  });

  describe('updateInvoice', () => {
    it('should update a draft invoice', async () => {
      const updateData = { notes: 'Updated notes' };
      mockApiClient.patch.mockResolvedValue({ data: { ...mockInvoice, ...updateData } });

      const result = await billingApi.updateInvoice(1, updateData);

      expect(mockApiClient.patch).toHaveBeenCalledWith('/api/billing/invoices/1/', updateData);
      expect(result.notes).toBe('Updated notes');
    });
  });

  describe('finalizeInvoice', () => {
    it('should finalize a draft invoice', async () => {
      const finalizedInvoice = { ...mockInvoice, status: 'PENDING' as const, finalized_at: '2026-01-03T11:00:00Z' };
      mockApiClient.post.mockResolvedValue({ data: finalizedInvoice });

      const result = await billingApi.finalizeInvoice(1);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/invoices/1/finalize/');
      expect(result.status).toBe('PENDING');
      expect(result.finalized_at).toBeTruthy();
    });
  });

  describe('cancelInvoice', () => {
    it('should cancel an invoice with reason', async () => {
      const cancelledInvoice = {
        ...mockInvoice,
        status: 'CANCELLED' as const,
        cancelled_at: '2026-01-03T11:00:00Z',
        cancellation_reason: 'Patient requested cancellation',
      };
      mockApiClient.post.mockResolvedValue({ data: cancelledInvoice });

      const result = await billingApi.cancelInvoice(1, 'Patient requested cancellation');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/invoices/1/cancel/', {
        reason: 'Patient requested cancellation',
      });
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('addInvoiceItem', () => {
    it('should add an item to an invoice', async () => {
      const itemData: InvoiceItemCreateData = {
        description: 'Lab Test - CBC',
        quantity: 1,
        unit_price: '800.00',
        service: 2,
      };
      mockApiClient.post.mockResolvedValue({ data: { ...mockInvoiceItem, ...itemData } });

      const result = await billingApi.addInvoiceItem(1, itemData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/invoices/1/add_item/', itemData);
      expect(result.description).toBe('Lab Test - CBC');
    });
  });

  describe('removeInvoiceItem', () => {
    it('should remove an item from an invoice', async () => {
      mockApiClient.delete.mockResolvedValue({ data: null });

      await billingApi.removeInvoiceItem(1, 2);

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/billing/invoices/1/remove_item/2/');
    });
  });

  describe('applyDiscount', () => {
    it('should apply percentage discount to invoice', async () => {
      const discountData: ApplyDiscountData = {
        discount_type: 'PERCENTAGE',
        discount_value: '10.00',
      };
      const discountedInvoice = {
        ...mockInvoice,
        discount_type: 'PERCENTAGE' as const,
        discount_value: '10.00',
        discount_amount: '150.00',
        total_amount: '1350.00',
        balance_due: '1350.00',
      };
      mockApiClient.post.mockResolvedValue({ data: discountedInvoice });

      const result = await billingApi.applyDiscount(1, discountData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/invoices/1/apply_discount/', discountData);
      expect(result.discount_amount).toBe('150.00');
    });

    it('should apply fixed discount to invoice', async () => {
      const discountData: ApplyDiscountData = {
        discount_type: 'FIXED',
        discount_value: '200.00',
      };
      mockApiClient.post.mockResolvedValue({
        data: {
          ...mockInvoice,
          discount_type: 'FIXED',
          discount_amount: '200.00',
        },
      });

      const result = await billingApi.applyDiscount(1, discountData);

      expect(result.discount_type).toBe('FIXED');
    });
  });

  describe('getOverdueInvoices', () => {
    it('should fetch overdue invoices', async () => {
      const overdueInvoice = { ...mockInvoice, status: 'OVERDUE' as const };
      mockApiClient.get.mockResolvedValue({ data: { count: 1, results: [overdueInvoice] } });

      const result = await billingApi.getOverdueInvoices();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/invoices/overdue/');
      expect(result.results[0]?.status).toBe('OVERDUE');
    });
  });
});

// ============================================================================
// Payment Tests - KE-CSH-001
// ============================================================================

describe('Billing API - Payments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPayments', () => {
    it('should fetch payments list with default params', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockPayment],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await billingApi.getPayments();

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/billing/payments/'));
      expect(result.results).toHaveLength(1);
    });

    it('should filter payments by method', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getPayments({ method: 'MPESA' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('method=MPESA');
    });

    it('should filter payments by status', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getPayments({ status: 'COMPLETED' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('status=COMPLETED');
    });

    it('should filter payments by invoice', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getPayments({ invoice: 1 });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('invoice=1');
    });
  });

  describe('getPayment', () => {
    it('should fetch a single payment by ID', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockPayment });

      const result = await billingApi.getPayment(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/payments/1/');
      expect(result.payment_reference).toBe('PAY-20260103-0001');
    });
  });

  describe('createPayment (Cash)', () => {
    it('should record a cash payment', async () => {
      const paymentData: PaymentCreateData = {
        invoice: 1,
        amount: '500.00',
        method: 'CASH',
        notes: 'Cash payment received',
      };
      mockApiClient.post.mockResolvedValue({ data: mockPayment });

      const result = await billingApi.createPayment(paymentData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/payments/', paymentData);
      expect(result.method).toBe('CASH');
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('createPayment (Card)', () => {
    it('should record a card payment with details', async () => {
      const cardPayment: Payment = {
        ...mockPayment,
        method: 'CARD',
        card_last_four: '4242',
        card_type: 'VISA',
      };
      const paymentData: PaymentCreateData = {
        invoice: 1,
        amount: '500.00',
        method: 'CARD',
        card_last_four: '4242',
        card_type: 'VISA',
      };
      mockApiClient.post.mockResolvedValue({ data: cardPayment });

      const result = await billingApi.createPayment(paymentData);

      expect(result.method).toBe('CARD');
      expect(result.card_last_four).toBe('4242');
    });
  });

  describe('getPaymentReceipt', () => {
    it('should fetch receipt for a payment', async () => {
      mockApiClient.get.mockResolvedValue({ data: mockReceipt });

      const result = await billingApi.getPaymentReceipt(1);

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/payments/1/receipt/');
      expect(result.receipt_number).toBe('RCP-20260103-0001');
      expect(result.amount_in_words).toContain('Five Hundred');
    });
  });
});

// ============================================================================
// M-Pesa Integration Tests - KE-CSH-001
// ============================================================================

describe('Billing API - M-Pesa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateMpesaSTKPush', () => {
    it('should initiate STK push for payment', async () => {
      const stkRequest: MpesaSTKPushRequest = {
        invoice_id: 1,
        phone_number: '0712345678',
        amount: '500.00',
      };
      const mockResponse = {
        success: true,
        checkout_request_id: 'ws_CO_123456789',
        merchant_request_id: '12345-67890',
        response_code: '0',
        response_description: 'Success. Request accepted for processing',
        customer_message: 'Success. Request accepted for processing',
      };
      mockApiClient.post.mockResolvedValue({ data: mockResponse });

      const result = await billingApi.initiateMpesaSTKPush(stkRequest);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/mpesa/initiate/', stkRequest);
      expect(result.success).toBe(true);
      expect(result.checkout_request_id).toBeTruthy();
    });

    it('should handle invalid phone number format', async () => {
      const stkRequest: MpesaSTKPushRequest = {
        invoice_id: 1,
        phone_number: '123456',
        amount: '500.00',
      };
      mockApiClient.post.mockRejectedValue({
        response: {
          status: 400,
          data: { phone_number: ['Phone number must be a valid Kenyan number'] },
        },
      });

      await expect(billingApi.initiateMpesaSTKPush(stkRequest)).rejects.toMatchObject({
        response: { status: 400 },
      });
    });

    it('should handle amount validation errors', async () => {
      const stkRequest: MpesaSTKPushRequest = {
        invoice_id: 1,
        phone_number: '0712345678',
        amount: '0.00',
      };
      mockApiClient.post.mockRejectedValue({
        response: {
          status: 400,
          data: { amount: ['Amount must be at least 1 KES'] },
        },
      });

      await expect(billingApi.initiateMpesaSTKPush(stkRequest)).rejects.toMatchObject({
        response: { status: 400 },
      });
    });
  });

  describe('queryMpesaTransaction', () => {
    it('should query M-Pesa transaction status', async () => {
      const mockResponse = {
        success: true,
        result_code: 0,
        result_description: 'The service request is processed successfully.',
        checkout_request_id: 'ws_CO_123456789',
        amount: '500.00',
        mpesa_receipt_number: 'QJH3XXXXXX',
        transaction_date: '20260103103000',
        phone_number: '254712345678',
      };
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await billingApi.queryMpesaTransaction('ws_CO_123456789');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/mpesa/query/ws_CO_123456789/');
      expect(result.success).toBe(true);
      expect(result.mpesa_receipt_number).toBeTruthy();
    });

    it('should handle pending transaction', async () => {
      const mockResponse = {
        success: false,
        result_code: 1032,
        result_description: 'Request cancelled by user',
        checkout_request_id: 'ws_CO_123456789',
      };
      mockApiClient.get.mockResolvedValue({ data: mockResponse });

      const result = await billingApi.queryMpesaTransaction('ws_CO_123456789');

      expect(result.success).toBe(false);
      expect(result.result_code).toBe(1032);
    });
  });
});

// ============================================================================
// Credit Note Tests
// ============================================================================

describe('Billing API - Credit Notes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCreditNotes', () => {
    it('should fetch credit notes list', async () => {
      const mockResponse = {
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockCreditNote],
        },
      };
      mockApiClient.get.mockResolvedValue(mockResponse);

      const result = await billingApi.getCreditNotes();

      expect(mockApiClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/billing/credit-notes/'));
      expect(result.results).toHaveLength(1);
    });

    it('should filter credit notes by status', async () => {
      const mockResponse = { data: { count: 0, results: [] } };
      mockApiClient.get.mockResolvedValue(mockResponse);

      await billingApi.getCreditNotes({ status: 'PENDING' });

      expect(mockApiClient.get.mock.calls[0]?.[0]).toContain('status=PENDING');
    });
  });

  describe('createCreditNote', () => {
    it('should create a credit note request', async () => {
      const creditNoteData: CreditNoteCreateData = {
        invoice: 1,
        amount: '100.00',
        reason: 'OVERCHARGE',
        reason_detail: 'Incorrect consultation fee applied',
      };
      mockApiClient.post.mockResolvedValue({ data: mockCreditNote });

      const result = await billingApi.createCreditNote(creditNoteData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/credit-notes/', creditNoteData);
      expect(result.status).toBe('PENDING');
    });
  });

  describe('approveCreditNote', () => {
    it('should approve a credit note', async () => {
      const approvedNote = {
        ...mockCreditNote,
        status: 'APPROVED' as const,
        approved_at: '2026-01-03T12:00:00Z',
        approved_by: 2,
      };
      mockApiClient.post.mockResolvedValue({ data: approvedNote });

      const result = await billingApi.approveCreditNote(1);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/credit-notes/1/approve/', { approved: true });
      expect(result.status).toBe('APPROVED');
    });

    it('should reject a credit note with reason', async () => {
      const rejectedNote = {
        ...mockCreditNote,
        status: 'REJECTED' as const,
        rejected_at: '2026-01-03T12:00:00Z',
        rejected_by: 2,
        rejection_reason: 'Insufficient documentation',
      };
      mockApiClient.post.mockResolvedValue({ data: rejectedNote });

      const result = await billingApi.rejectCreditNote(1, 'Insufficient documentation');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/credit-notes/1/approve/', {
        approved: false,
        rejection_reason: 'Insufficient documentation',
      });
      expect(result.status).toBe('REJECTED');
    });
  });

  describe('processRefund', () => {
    it('should process credit note refund', async () => {
      const refundedNote = {
        ...mockCreditNote,
        status: 'REFUNDED' as const,
        refunded_at: '2026-01-03T12:30:00Z',
        refund_reference: 'REF-001',
        refund_method: 'CASH' as const,
      };
      mockApiClient.post.mockResolvedValue({ data: refundedNote });

      const result = await billingApi.processRefund(1, {
        refund_method: 'CASH',
        refund_reference: 'REF-001',
      });

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/billing/credit-notes/1/process-refund/', {
        refund_method: 'CASH',
        refund_reference: 'REF-001',
      });
      expect(result.status).toBe('REFUNDED');
    });
  });
});

// ============================================================================
// Report Tests - KE-CLM-003
// ============================================================================

describe('Billing API - Reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDailyCollectionReport', () => {
    it('should fetch daily collection report', async () => {
      const mockReport = {
        date: '2026-01-03',
        total_collected: '15000.00',
        invoice_count: 10,
        by_payment_method: {
          CASH: '8000.00',
          MPESA: '5000.00',
          CARD: '2000.00',
          INSURANCE: '0.00',
          BANK_TRANSFER: '0.00',
        },
      };
      mockApiClient.get.mockResolvedValue({ data: mockReport });

      const result = await billingApi.getDailyCollectionReport('2026-01-03');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/reports/daily-collection/?date=2026-01-03');
      expect(result.total_collected).toBe('15000.00');
      expect(result.by_payment_method.CASH).toBe('8000.00');
    });
  });

  describe('getRevenueSummary', () => {
    it('should fetch revenue summary for date range', async () => {
      const mockReport = {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        total_revenue: '500000.00',
        by_category: [
          { category: 'Consultation', revenue: '150000.00', count: 300 },
          { category: 'Laboratory', revenue: '200000.00', count: 250 },
          { category: 'Pharmacy', revenue: '150000.00', count: 400 },
        ],
        by_payment_method: {
          CASH: '200000.00',
          MPESA: '250000.00',
          CARD: '50000.00',
          INSURANCE: '0.00',
          BANK_TRANSFER: '0.00',
        },
      };
      mockApiClient.get.mockResolvedValue({ data: mockReport });

      const result = await billingApi.getRevenueSummary('2026-01-01', '2026-01-31');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/billing/reports/revenue-summary/?start_date=2026-01-01&end_date=2026-01-31'
      );
      expect(result.total_revenue).toBe('500000.00');
      expect(result.by_category).toHaveLength(3);
    });
  });

  describe('getOutstandingBalances', () => {
    it('should fetch outstanding balances list', async () => {
      const mockBalances = [
        {
          invoice_id: 1,
          invoice_number: 'INV-20260101-0001',
          patient_name: 'Jane Doe',
          patient_mrn: 'MRN-001',
          invoice_date: '2026-01-01',
          due_date: '2026-01-31',
          total_amount: '1500.00',
          amount_paid: '500.00',
          balance_due: '1000.00',
          days_overdue: 3,
          status: 'OVERDUE',
        },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockBalances });

      const result = await billingApi.getOutstandingBalances();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/billing/reports/outstanding-balances/');
      expect(result).toHaveLength(1);
      expect(result[0]?.days_overdue).toBe(3);
    });
  });

  describe('getServiceUtilization', () => {
    it('should fetch service utilization report', async () => {
      const mockUtilization = [
        {
          service_id: 1,
          service_name: 'General Consultation',
          service_code: 'CONS-001',
          category: 'Consultation',
          count: 150,
          total_revenue: '75000.00',
        },
        {
          service_id: 2,
          service_name: 'Complete Blood Count',
          service_code: 'LAB-001',
          category: 'Laboratory',
          count: 200,
          total_revenue: '160000.00',
        },
      ];
      mockApiClient.get.mockResolvedValue({ data: mockUtilization });

      const result = await billingApi.getServiceUtilization('2026-01-01', '2026-01-31');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/billing/reports/service-utilization/?start_date=2026-01-01&end_date=2026-01-31'
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getPaymentMethodAnalysis', () => {
    it('should fetch payment method analysis', async () => {
      const mockAnalysis = {
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        total_payments: 500,
        total_amount: '500000.00',
        by_method: [
          { method: 'CASH' as const, count: 200, amount: '200000.00', percentage: '40.00' },
          { method: 'MPESA' as const, count: 250, amount: '250000.00', percentage: '50.00' },
          { method: 'CARD' as const, count: 50, amount: '50000.00', percentage: '10.00' },
        ],
        mpesa_success_rate: '95.00',
        average_payment_amount: '1000.00',
      };
      mockApiClient.get.mockResolvedValue({ data: mockAnalysis });

      const result = await billingApi.getPaymentMethodAnalysis('2026-01-01', '2026-01-31');

      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/api/billing/reports/payment-analysis/?start_date=2026-01-01&end_date=2026-01-31'
      );
      expect(result.mpesa_success_rate).toBe('95.00');
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Billing API - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle 401 unauthorized errors', async () => {
    mockApiClient.get.mockRejectedValue({
      response: { status: 401, data: { detail: 'Authentication credentials were not provided.' } },
    });

    await expect(billingApi.getInvoices()).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  it('should handle 403 forbidden errors', async () => {
    mockApiClient.post.mockRejectedValue({
      response: { status: 403, data: { detail: 'You do not have permission to perform this action.' } },
    });

    await expect(billingApi.createInvoice({ patient: 1, due_date: '2026-02-01' })).rejects.toMatchObject({
      response: { status: 403 },
    });
  });

  it('should handle 404 not found errors', async () => {
    mockApiClient.get.mockRejectedValue({
      response: { status: 404, data: { detail: 'Not found.' } },
    });

    await expect(billingApi.getInvoice(999)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });

  it('should handle 400 validation errors', async () => {
    mockApiClient.post.mockRejectedValue({
      response: {
        status: 400,
        data: {
          patient: ['This field is required.'],
          due_date: ['Date cannot be in the past.'],
        },
      },
    });

    await expect(billingApi.createInvoice({ patient: 0, due_date: '2020-01-01' } as any)).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it('should handle network errors', async () => {
    mockApiClient.get.mockRejectedValue(new Error('Network Error'));

    await expect(billingApi.getInvoices()).rejects.toThrow('Network Error');
  });
});

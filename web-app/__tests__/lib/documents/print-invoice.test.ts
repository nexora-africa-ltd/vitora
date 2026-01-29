/**
 * Tests for Invoice Print Utility
 *
 * Tests the printInvoice and previewInvoice functions
 * from the centralized documents system.
 */

import type { Invoice, InvoiceItem, InvoiceStatus } from '@/lib/types/billing';

// Mock the renderer module
jest.mock('@/lib/documents/renderer', () => ({
  renderDocumentAsync: jest.fn().mockResolvedValue('<div class="invoice">Mock Invoice</div>'),
  buildPrintDocument: jest.fn().mockReturnValue('<!DOCTYPE html><html><body>Mock</body></html>'),
  openPrintWindow: jest.fn().mockReturnValue({ close: jest.fn() }),
  escapeHtml: jest.fn((str: string) => str),
  formatDate: jest.fn((str: string) => str),
}));

// Mock the QR utility
jest.mock('@/lib/utils/qr', () => ({
  getInvoiceQRContent: jest.fn().mockReturnValue({
    data: 'VITORA:INV:INV-001',
    isVerifiable: false,
    label: 'Reference only',
  }),
}));

import {
  printInvoice,
  previewInvoice,
  type PrintInvoiceOptions,
} from '@/lib/documents/print-invoice';
import {
  renderDocumentAsync,
  buildPrintDocument,
  openPrintWindow,
} from '@/lib/documents/renderer';
import { getInvoiceQRContent } from '@/lib/utils/qr';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 1,
  invoice_number: 'INV-2026-0001',
  patient: 1,
  patient_name: 'John Doe',
  patient_mrn: 'MRN-20260101-0001',
  status: 'PENDING' as InvoiceStatus,
  invoice_date: '2026-01-29',
  due_date: '2026-02-28',
  subtotal: '2500.00',
  discount_type: null,
  discount_value: '0.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  total_amount: '2500.00',
  amount_paid: '0.00',
  balance_due: '2500.00',
  insurance_coverage: '0.00',
  notes: '',
  created_at: '2026-01-29T10:00:00Z',
  updated_at: '2026-01-29T10:00:00Z',
  created_by: 1,
  is_converted: false,
  is_valid: true,
  days_until_expiry: -1,
  can_convert: false,
  ...overrides,
});

const createMockInvoiceWithItems = (): Invoice => ({
  ...createMockInvoice(),
  items: [
    {
      id: 1,
      invoice: 1,
      description: 'Consultation Fee',
      quantity: 1,
      unit_price: '500.00',
      discount_percentage: '0.00',
      line_total: '500.00',
      is_covered_by_insurance: false,
      is_converted: false,
      created_at: '2026-01-29T10:00:00Z',
      updated_at: '2026-01-29T10:00:00Z',
    },
    {
      id: 2,
      invoice: 1,
      description: 'Lab Test - Complete Blood Count',
      quantity: 1,
      unit_price: '1500.00',
      discount_percentage: '0.00',
      line_total: '1500.00',
      is_covered_by_insurance: false,
      is_converted: false,
      created_at: '2026-01-29T10:00:00Z',
      updated_at: '2026-01-29T10:00:00Z',
    },
    {
      id: 3,
      invoice: 1,
      description: 'Medication - Paracetamol',
      quantity: 2,
      unit_price: '250.00',
      discount_percentage: '0.00',
      line_total: '500.00',
      is_covered_by_insurance: false,
      is_converted: false,
      created_at: '2026-01-29T10:00:00Z',
      updated_at: '2026-01-29T10:00:00Z',
    },
  ],
});

// =============================================================================
// TESTS
// =============================================================================

describe('printInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should call renderer with invoice data', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalled();
      expect(buildPrintDocument).toHaveBeenCalled();
      expect(openPrintWindow).toHaveBeenCalled();
    });

    it('should return print window on success', async () => {
      const invoice = createMockInvoice();

      const result = await printInvoice({ invoice });

      expect(result).toBeTruthy();
    });

    it('should return null when invoice is missing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await printInvoice({ invoice: null as unknown as Invoice });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('printInvoice: invoice is required');

      consoleSpy.mockRestore();
    });
  });

  describe('layout options', () => {
    it('should use A4 layout by default', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('INV-2026-0001'),
        'a4',
        'default',
        expect.any(String)
      );
    });

    it('should accept custom layout option', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice, layout: 'thermal-80mm' });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'thermal-80mm',
        'default',
        expect.any(String)
      );
    });

    it('should accept custom theme option', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice, theme: 'facility-public' });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'a4',
        'facility-public',
        expect.any(String)
      );
    });
  });

  describe('invoice statuses', () => {
    const statuses: InvoiceStatus[] = [
      'DRAFT',
      'PENDING',
      'PARTIAL',
      'PAID',
      'OVERDUE',
      'CANCELLED',
      'PROFORMA',
    ];

    it.each(statuses)('should handle %s status', async (status) => {
      const invoice = createMockInvoice({ status });

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          invoice: expect.objectContaining({
            status,
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('facility information', () => {
    it('should use default facility info when not provided', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          facility: expect.objectContaining({
            name: 'Healthcare Facility',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should use provided facility info', async () => {
      const invoice = createMockInvoice();
      const facility = {
        name: 'City Hospital',
        address: '456 Hospital Ave, Mombasa',
        phone: '+254 700 999 888',
        license: 'MED-2026-999',
      };

      await printInvoice({ invoice, facility });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          facility: expect.objectContaining({
            name: 'City Hospital',
            license: 'MED-2026-999',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('patient information', () => {
    it('should extract patient info from invoice', async () => {
      const invoice = createMockInvoice({
        patient_name: 'Jane Smith',
        patient_mrn: 'MRN-TEST-002',
      });

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          patient: expect.objectContaining({
            full_name: 'Jane Smith',
            mrn: 'MRN-TEST-002',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should use provided patient info', async () => {
      const invoice = createMockInvoice();
      const patient = {
        full_name: 'Override Patient',
        mrn: 'MRN-OVERRIDE',
        age: 35,
        gender: 'F',
      };

      await printInvoice({ invoice, patient });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          patient: expect.objectContaining({
            full_name: 'Override Patient',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle missing patient name gracefully', async () => {
      const invoice = createMockInvoice({
        patient_name: undefined,
        patient_mrn: undefined,
      });

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          patient: expect.objectContaining({
            full_name: 'N/A',
            mrn: 'N/A',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('amount calculations', () => {
    it('should format currency amounts correctly', async () => {
      const invoice = createMockInvoice({
        subtotal: '2500.00',
        discount_amount: '250.00',
        total_amount: '2250.00',
        amount_paid: '1000.00',
        balance_due: '1250.00',
      });

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          invoice: expect.objectContaining({
            subtotal: expect.stringContaining('2,500'),
            total_amount: expect.stringContaining('2,250'),
            amount_paid: expect.stringContaining('1,000'),
            balance_due: expect.stringContaining('1,250'),
          }),
        }),
        expect.any(Object)
      );
    });

    it('should calculate balance when not provided', async () => {
      const invoice = createMockInvoice({
        total_amount: '1000.00',
        amount_paid: '400.00',
        balance_due: undefined as unknown as string,
      });

      await printInvoice({ invoice });

      // Should calculate 1000 - 400 = 600
      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          invoice: expect.objectContaining({
            balance_due: expect.stringContaining('600'),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('discounts', () => {
    it('should include discount when present', async () => {
      const invoice = createMockInvoice({
        discount_type: 'PERCENTAGE',
        discount_value: '10.00',
        discount_amount: '250.00',
      });

      await printInvoice({ invoice });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          invoice: expect.objectContaining({
            discount_amount: expect.stringContaining('250'),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('QR code generation', () => {
    it('should call getInvoiceQRContent with invoice data', async () => {
      const invoice = createMockInvoice();

      await printInvoice({ invoice });

      expect(getInvoiceQRContent).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_number: 'INV-2026-0001',
        })
      );
    });
  });
});

describe('previewInvoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return HTML string without opening print window', async () => {
    const invoice = createMockInvoice();

    const result = await previewInvoice({ invoice });

    expect(typeof result).toBe('string');
    expect(result).toContain('<!DOCTYPE html>');
    expect(openPrintWindow).not.toHaveBeenCalled();
  });

  it('should use same rendering logic as printInvoice', async () => {
    const invoice = createMockInvoice();

    await previewInvoice({ invoice });

    expect(renderDocumentAsync).toHaveBeenCalled();
    expect(buildPrintDocument).toHaveBeenCalled();
  });
});

describe('invoice line items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle invoices with line items', async () => {
    const invoice = createMockInvoiceWithItems();

    await printInvoice({ invoice });

    expect(renderDocumentAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        invoice: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ description: 'Consultation Fee' }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  it('should handle invoices without line items', async () => {
    const invoice = createMockInvoice({ items: undefined });

    await printInvoice({ invoice });

    // Should not throw and should complete successfully
    expect(renderDocumentAsync).toHaveBeenCalled();
  });

  it('should handle empty line items array', async () => {
    const invoice = createMockInvoice({ items: [] });

    await printInvoice({ invoice });

    expect(renderDocumentAsync).toHaveBeenCalled();
  });
});

describe('proforma invoices', () => {
  it('should handle proforma status', async () => {
    const invoice = createMockInvoice({
      status: 'PROFORMA',
      valid_until: '2026-02-28',
      is_converted: false,
      can_convert: true,
    });

    await printInvoice({ invoice });

    expect(renderDocumentAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        invoice: expect.objectContaining({
          status: 'PROFORMA',
        }),
      }),
      expect.any(Object)
    );
  });
});

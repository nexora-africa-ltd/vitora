/**
 * Tests for Receipt Print Utility
 *
 * Tests the printReceipt and previewReceipt functions
 * from the centralized documents system.
 */

import type { Receipt, ReceiptLineItem } from '@/lib/types/billing';

// Mock the renderer module
jest.mock('@/lib/documents/renderer', () => ({
  renderDocumentAsync: jest.fn().mockResolvedValue('<div class="receipt">Mock Receipt</div>'),
  buildPrintDocument: jest.fn().mockReturnValue('<!DOCTYPE html><html><body>Mock</body></html>'),
  openPrintWindow: jest.fn().mockReturnValue({ close: jest.fn() }),
  escapeHtml: jest.fn((str: string) => str),
  formatDateTime: jest.fn((str: string) => str),
}));

// Mock the QR utility
jest.mock('@/lib/utils/qr', () => ({
  getReceiptQRContent: jest.fn().mockReturnValue({
    data: 'VITORA:RCPT:RCP-001',
    isVerifiable: false,
    label: 'Reference only',
  }),
}));

import {
  printReceipt,
  previewReceipt,
  type PrintReceiptOptions,
} from '@/lib/documents/print-receipt';
import {
  renderDocumentAsync,
  buildPrintDocument,
  openPrintWindow,
} from '@/lib/documents/renderer';
import { getReceiptQRContent } from '@/lib/utils/qr';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockReceipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  id: 1,
  receipt_number: 'RCP-2026-0001',
  payment: 1,
  payment_reference: 'INV-2026-0001',
  patient_name: 'John Doe',
  patient_mrn: 'MRN-20260101-0001',
  facility_name: 'Demo Health Facility',
  facility_address: '123 Health Street, Nairobi',
  facility_phone: '+254 700 123 456',
  amount: '1500.00',
  amount_in_words: 'One Thousand Five Hundred Kenya Shillings Only',
  payment_method: 'CASH',
  receipt_date: '2026-01-29T10:30:00Z',
  is_voided: false,
  created_at: '2026-01-29T10:30:00Z',
  ...overrides,
});

const createMockReceiptWithLineItems = (): Receipt => ({
  ...createMockReceipt(),
  line_items: [
    {
      description: 'Consultation Fee',
      quantity: 1,
      unit_price: '500.00',
      line_total: '500.00',
    },
    {
      description: 'Lab Test - Blood Count',
      quantity: 1,
      unit_price: '1000.00',
      line_total: '1000.00',
    },
  ],
});

// =============================================================================
// TESTS
// =============================================================================

describe('printReceipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should call renderer with receipt data', async () => {
      const receipt = createMockReceipt();

      await printReceipt({ receipt });

      expect(renderDocumentAsync).toHaveBeenCalled();
      expect(buildPrintDocument).toHaveBeenCalled();
      expect(openPrintWindow).toHaveBeenCalled();
    });

    it('should return print window on success', async () => {
      const receipt = createMockReceipt();

      const result = await printReceipt({ receipt });

      expect(result).toBeTruthy();
    });

    it('should return null when receipt is missing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await printReceipt({ receipt: null as unknown as Receipt });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('printReceipt: receipt is required');

      consoleSpy.mockRestore();
    });
  });

  describe('layout options', () => {
    it('should use thermal-80mm layout by default', async () => {
      const receipt = createMockReceipt();

      await printReceipt({ receipt });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('RCP-2026-0001'),
        'thermal-80mm',
        'default',
        expect.any(String)
      );
    });

    it('should accept custom layout option', async () => {
      const receipt = createMockReceipt();

      await printReceipt({ receipt, layout: 'a4' });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'a4',
        'default',
        expect.any(String)
      );
    });

    it('should accept custom theme option', async () => {
      const receipt = createMockReceipt();

      await printReceipt({ receipt, theme: 'facility-private' });

      expect(buildPrintDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'thermal-80mm',
        'facility-private',
        expect.any(String)
      );
    });
  });

  describe('facility information', () => {
    it('should use receipt facility info when available', async () => {
      const receipt = createMockReceipt({
        facility_name: 'Custom Clinic',
        facility_address: '456 Custom Street',
        facility_phone: '+254 111 222 333',
      });

      await printReceipt({ receipt });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          facility: expect.objectContaining({
            name: 'Custom Clinic',
            address: '456 Custom Street',
            phone: '+254 111 222 333',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should use provided facility info over receipt data', async () => {
      const receipt = createMockReceipt();
      const facility = {
        name: 'Override Facility',
        address: '789 Override Rd',
        phone: '+254 999 888 777',
      };

      await printReceipt({ receipt, facility });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          facility: expect.objectContaining({
            name: 'Override Facility',
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('patient information', () => {
    it('should extract patient info from receipt', async () => {
      const receipt = createMockReceipt({
        patient_name: 'Jane Smith',
        patient_mrn: 'MRN-TEST-001',
      });

      await printReceipt({ receipt });

      expect(renderDocumentAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          patient: expect.objectContaining({
            full_name: 'Jane Smith',
            mrn: 'MRN-TEST-001',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should use provided patient info', async () => {
      const receipt = createMockReceipt();
      const patient = {
        full_name: 'Override Patient',
        mrn: 'MRN-OVERRIDE',
      };

      await printReceipt({ receipt, patient });

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
  });

  describe('QR code generation', () => {
    it('should call getReceiptQRContent with receipt data', async () => {
      const receipt = createMockReceipt();

      await printReceipt({ receipt });

      expect(getReceiptQRContent).toHaveBeenCalledWith(
        expect.objectContaining({
          receipt_number: 'RCP-2026-0001',
        })
      );
    });
  });
});

describe('previewReceipt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return HTML string without opening print window', async () => {
    const receipt = createMockReceipt();

    const result = await previewReceipt({ receipt });

    expect(typeof result).toBe('string');
    expect(result).toContain('<!DOCTYPE html>');
    expect(openPrintWindow).not.toHaveBeenCalled();
  });

  it('should use same rendering logic as printReceipt', async () => {
    const receipt = createMockReceipt();

    await previewReceipt({ receipt });

    expect(renderDocumentAsync).toHaveBeenCalled();
    expect(buildPrintDocument).toHaveBeenCalled();
  });
});

describe('receipt line items', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle receipts with line items', async () => {
    const receipt = createMockReceiptWithLineItems();

    await printReceipt({ receipt });

    expect(renderDocumentAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        receipt: expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({ description: 'Consultation Fee' }),
          ]),
        }),
      }),
      expect.any(Object)
    );
  });

  it('should handle receipts without line items', async () => {
    const receipt = createMockReceipt({ line_items: undefined });

    await printReceipt({ receipt });

    // Should not throw and should complete successfully
    expect(renderDocumentAsync).toHaveBeenCalled();
  });
});

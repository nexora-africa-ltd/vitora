/**
 * Tests for Invoice Document Schema
 *
 * Validates the invoice schema structure and bindings.
 */

import {
  invoiceSchema,
  invoiceDefaults,
  invoiceStatusColors,
} from '@/lib/documents/schemas/invoice.schema';

describe('invoiceSchema', () => {
  describe('schema structure', () => {
    it('should have correct document type', () => {
      expect(invoiceSchema.document_type).toBe('invoice');
    });

    it('should have version defined', () => {
      expect(invoiceSchema.version).toBe('1.0');
    });

    it('should use A4 layout by default', () => {
      expect(invoiceSchema.layout).toBe('a4');
    });

    it('should reference invoice.html template', () => {
      expect(invoiceSchema.template).toBe('invoice.html');
    });
  });

  describe('data sources', () => {
    it('should define invoice data source', () => {
      expect(invoiceSchema.data_sources).toHaveProperty('invoice', 'invoice');
    });

    it('should define patient data source', () => {
      expect(invoiceSchema.data_sources).toHaveProperty('patient', 'patient');
    });

    it('should define facility data source', () => {
      expect(invoiceSchema.data_sources).toHaveProperty('facility', 'facility');
    });

    it('should define line_items data source', () => {
      expect(invoiceSchema.data_sources).toHaveProperty('line_items', 'invoice.items');
    });
  });

  describe('bindings', () => {
    describe('facility bindings', () => {
      it('should bind facility name', () => {
        expect(invoiceSchema.bindings['{{facility.name}}']).toBe('facility.name');
      });

      it('should bind facility address', () => {
        expect(invoiceSchema.bindings['{{facility.address}}']).toBe('facility.address');
      });

      it('should bind facility phone', () => {
        expect(invoiceSchema.bindings['{{facility.phone}}']).toBe('facility.phone');
      });

      it('should bind facility license', () => {
        expect(invoiceSchema.bindings['{{facility.license}}']).toBe('facility.license');
      });
    });

    describe('invoice bindings', () => {
      it('should bind invoice number', () => {
        expect(invoiceSchema.bindings['{{invoice.number}}']).toBe('invoice.invoice_number');
      });

      it('should bind invoice date', () => {
        expect(invoiceSchema.bindings['{{invoice.date}}']).toBe('invoice.invoice_date');
      });

      it('should bind due date', () => {
        expect(invoiceSchema.bindings['{{invoice.due_date}}']).toBe('invoice.due_date');
      });

      it('should bind status', () => {
        expect(invoiceSchema.bindings['{{invoice.status}}']).toBe('invoice.status');
      });
    });

    describe('patient bindings', () => {
      it('should bind patient name', () => {
        expect(invoiceSchema.bindings['{{patient.name}}']).toBe('patient.full_name');
      });

      it('should bind patient MRN', () => {
        expect(invoiceSchema.bindings['{{patient.mrn}}']).toBe('patient.mrn');
      });
    });

    describe('amount bindings', () => {
      it('should bind subtotal', () => {
        expect(invoiceSchema.bindings['{{invoice.subtotal}}']).toBe('invoice.subtotal');
      });

      it('should bind discount', () => {
        expect(invoiceSchema.bindings['{{invoice.discount}}']).toBe('invoice.discount_amount');
      });

      it('should bind total', () => {
        expect(invoiceSchema.bindings['{{invoice.total}}']).toBe('invoice.total_amount');
      });

      it('should bind paid amount', () => {
        expect(invoiceSchema.bindings['{{invoice.paid}}']).toBe('invoice.amount_paid');
      });

      it('should bind balance', () => {
        expect(invoiceSchema.bindings['{{invoice.balance}}']).toBe('invoice.balance_due');
      });
    });
  });

  describe('repeaters', () => {
    it('should have line items repeater', () => {
      expect(invoiceSchema.repeaters).toBeDefined();
      expect(invoiceSchema.repeaters).toHaveLength(1);
    });

    it('should configure line items repeater correctly', () => {
      const repeater = invoiceSchema.repeaters![0];
      expect(repeater.selector).toBe('tbody > tr');
      expect(repeater.source).toBe('invoice.items');
    });

    it('should map line item fields correctly', () => {
      const repeater = invoiceSchema.repeaters![0];
      expect(repeater.fields['{{item.description}}']).toBe('description');
      expect(repeater.fields['{{item.quantity}}']).toBe('quantity');
      expect(repeater.fields['{{item.unit_price}}']).toBe('unit_price');
      expect(repeater.fields['{{item.total}}']).toBe('line_total');
    });
  });

  describe('assets', () => {
    it('should define QR code asset', () => {
      expect(invoiceSchema.assets).toHaveProperty('qr');
    });

    it('should configure QR asset correctly', () => {
      const qrAsset = invoiceSchema.assets!.qr;
      expect(qrAsset.type).toBe('qr');
      expect(qrAsset.source).toBe('invoice.invoice_number');
      expect(qrAsset.placement).toBe('.qr');
      expect(qrAsset.width).toBe(100);
      expect(qrAsset.height).toBe(100);
    });
  });
});

describe('invoiceDefaults', () => {
  it('should have default facility info', () => {
    expect(invoiceDefaults.facility).toBeDefined();
    expect(invoiceDefaults.facility.name).toBe('Healthcare Facility');
  });

  it('should have empty default facility address', () => {
    expect(invoiceDefaults.facility.address).toBe('');
  });

  it('should have empty default facility phone', () => {
    expect(invoiceDefaults.facility.phone).toBe('');
  });

  it('should have empty default facility license', () => {
    expect(invoiceDefaults.facility.license).toBe('');
  });

  it('should have system name', () => {
    expect(invoiceDefaults.system_name).toBe('Vitora HMIS');
  });
});

describe('invoiceStatusColors', () => {
  describe('status color mappings', () => {
    it('should define DRAFT colors', () => {
      expect(invoiceStatusColors.DRAFT).toEqual({
        bg: '#f1f5f9',
        color: '#475569',
      });
    });

    it('should define PENDING colors', () => {
      expect(invoiceStatusColors.PENDING).toEqual({
        bg: '#fef3c7',
        color: '#92400e',
      });
    });

    it('should define PARTIAL colors', () => {
      expect(invoiceStatusColors.PARTIAL).toEqual({
        bg: '#dbeafe',
        color: '#1e40af',
      });
    });

    it('should define PAID colors (green)', () => {
      expect(invoiceStatusColors.PAID).toEqual({
        bg: '#dcfce7',
        color: '#166534',
      });
    });

    it('should define OVERDUE colors (red)', () => {
      expect(invoiceStatusColors.OVERDUE).toEqual({
        bg: '#fee2e2',
        color: '#991b1b',
      });
    });

    it('should define CANCELLED colors', () => {
      expect(invoiceStatusColors.CANCELLED).toEqual({
        bg: '#f3f4f6',
        color: '#6b7280',
      });
    });

    it('should define PROFORMA colors (purple)', () => {
      expect(invoiceStatusColors.PROFORMA).toEqual({
        bg: '#f3e8ff',
        color: '#7c3aed',
      });
    });

    it('should define WRITTEN_OFF colors', () => {
      expect(invoiceStatusColors.WRITTEN_OFF).toEqual({
        bg: '#fef3c7',
        color: '#92400e',
      });
    });
  });

  it('should have all expected statuses', () => {
    const expectedStatuses = [
      'DRAFT',
      'PENDING',
      'PARTIAL',
      'PAID',
      'OVERDUE',
      'CANCELLED',
      'PROFORMA',
      'WRITTEN_OFF',
    ];

    expectedStatuses.forEach((status) => {
      expect(invoiceStatusColors).toHaveProperty(status);
    });
  });
});

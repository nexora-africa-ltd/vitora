/**
 * Tests for Receipt Document Schema
 *
 * Validates the receipt schema structure and bindings.
 */

import { receiptSchema, receiptDefaults } from '@/lib/documents/schemas/receipt.schema';

describe('receiptSchema', () => {
  describe('schema structure', () => {
    it('should have correct document type', () => {
      expect(receiptSchema.document_type).toBe('receipt');
    });

    it('should have version defined', () => {
      expect(receiptSchema.version).toBe('1.0');
    });

    it('should use thermal-80mm layout by default', () => {
      expect(receiptSchema.layout).toBe('thermal-80mm');
    });

    it('should reference receipt.html template', () => {
      expect(receiptSchema.template).toBe('receipt.html');
    });
  });

  describe('data sources', () => {
    it('should define receipt data source', () => {
      expect(receiptSchema.data_sources).toHaveProperty('receipt', 'receipt');
    });

    it('should define patient data source', () => {
      expect(receiptSchema.data_sources).toHaveProperty('patient', 'patient');
    });

    it('should define facility data source', () => {
      expect(receiptSchema.data_sources).toHaveProperty('facility', 'facility');
    });

    it('should define line_items data source', () => {
      expect(receiptSchema.data_sources).toHaveProperty('line_items', 'receipt.line_items');
    });
  });

  describe('bindings', () => {
    it('should bind facility name', () => {
      expect(receiptSchema.bindings['{{facility.name}}']).toBe('facility.name');
    });

    it('should bind receipt number', () => {
      expect(receiptSchema.bindings['{{receipt.number}}']).toBe('receipt.receipt_number');
    });

    it('should bind patient name', () => {
      expect(receiptSchema.bindings['{{patient.name}}']).toBe('patient.full_name');
    });

    it('should bind payment method', () => {
      expect(receiptSchema.bindings['{{payment.method}}']).toBe('receipt.payment_method');
    });

    it('should bind payment amount', () => {
      expect(receiptSchema.bindings['{{payment.amount}}']).toBe('receipt.amount');
    });
  });

  describe('repeaters', () => {
    it('should have line items repeater', () => {
      expect(receiptSchema.repeaters).toBeDefined();
      expect(receiptSchema.repeaters).toHaveLength(1);
    });

    it('should configure line items repeater correctly', () => {
      const repeater = receiptSchema.repeaters![0];
      expect(repeater.selector).toBe('tbody > tr');
      expect(repeater.source).toBe('receipt.line_items');
      expect(repeater.fields['{{item.description}}']).toBe('description');
      expect(repeater.fields['{{item.amount}}']).toBe('line_total');
    });
  });

  describe('assets', () => {
    it('should define QR code asset', () => {
      expect(receiptSchema.assets).toHaveProperty('qr');
    });

    it('should configure QR asset correctly', () => {
      const qrAsset = receiptSchema.assets!.qr;
      expect(qrAsset.type).toBe('qr');
      expect(qrAsset.source).toBe('receipt.receipt_number');
      expect(qrAsset.placement).toBe('.qr');
      expect(qrAsset.width).toBe(100);
      expect(qrAsset.height).toBe(100);
    });
  });
});

describe('receiptDefaults', () => {
  it('should have default facility info', () => {
    expect(receiptDefaults.facility).toBeDefined();
    expect(receiptDefaults.facility.name).toBe('Healthcare Facility');
  });

  it('should have system name', () => {
    expect(receiptDefaults.system_name).toBe('Vitora HMIS');
  });
});

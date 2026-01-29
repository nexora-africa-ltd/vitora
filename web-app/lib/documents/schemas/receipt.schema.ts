/**
 * Receipt Document Schema
 *
 * Defines the mapping between receipt data and the receipt HTML template.
 * Used by the document renderer to populate the template with payment data.
 */

import type { DocumentDefinition } from '../types';

/**
 * Receipt document definition
 *
 * Maps receipt, patient, facility, and payment data to the
 * receipt template placeholders.
 */
export const receiptSchema: DocumentDefinition = {
  document_type: 'receipt',
  version: '1.0',
  layout: 'thermal-80mm',
  template: 'receipt.html',

  // Data sources map logical names to actual data paths
  data_sources: {
    receipt: 'receipt',
    patient: 'patient',
    facility: 'facility',
    payment: 'payment',
    line_items: 'receipt.line_items',
  },

  // Simple variable bindings: {{placeholder}} → data.path
  bindings: {
    // Facility info (header)
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',

    // Receipt metadata
    '{{receipt.number}}': 'receipt.receipt_number',
    '{{receipt.date}}': 'receipt.receipt_date',
    '{{receipt.payment_reference}}': 'receipt.payment_reference',

    // Patient info
    '{{patient.name}}': 'patient.full_name',
    '{{patient.mrn}}': 'patient.mrn',

    // Payment info
    '{{payment.method}}': 'receipt.payment_method',
    '{{payment.amount}}': 'receipt.amount',
    '{{payment.amount_words}}': 'receipt.amount_in_words',

    // Staff info
    '{{staff.served_by}}': 'receipt.received_by_username',
    '{{staff.payment_point}}': 'receipt.payment_point_name',

    // System footer
    '{{system.name}}': 'system_name',
  },

  // Repeating sections (line items table rows)
  repeaters: [
    {
      selector: 'tbody > tr',
      source: 'receipt.line_items',
      fields: {
        '{{item.description}}': 'description',
        '{{item.quantity}}': 'quantity',
        '{{item.amount}}': 'line_total',
      },
    },
  ],

  // Embedded assets
  assets: {
    qr: {
      type: 'qr',
      source: 'receipt.receipt_number',
      placement: '.qr',
      width: 100,
      height: 100,
    },
  },
};

/**
 * Default values for receipt document
 */
export const receiptDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
  },
  system_name: 'Vitora HMIS',
};

/**
 * Invoice Document Schema
 *
 * Defines the mapping between invoice data and the invoice HTML template.
 * Used by the document renderer to populate the template with billing data.
 */

import type { DocumentDefinition } from '../types';

/**
 * Invoice document definition
 *
 * Maps invoice, patient, facility, and line item data to the
 * invoice template placeholders.
 */
export const invoiceSchema: DocumentDefinition = {
  document_type: 'invoice',
  version: '1.0',
  layout: 'a4',
  template: 'invoice.html',

  // Data sources map logical names to actual data paths
  data_sources: {
    invoice: 'invoice',
    patient: 'patient',
    facility: 'facility',
    line_items: 'invoice.items',
  },

  // Simple variable bindings: {{placeholder}} → data.path
  bindings: {
    // Facility info (header)
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{facility.license}}': 'facility.license',

    // Invoice metadata
    '{{invoice.number}}': 'invoice.invoice_number',
    '{{invoice.date}}': 'invoice.invoice_date',
    '{{invoice.due_date}}': 'invoice.due_date',
    '{{invoice.status}}': 'invoice.status',

    // Patient/billing info
    '{{patient.name}}': 'patient.full_name',
    '{{patient.mrn}}': 'patient.mrn',

    // Amounts
    '{{invoice.subtotal}}': 'invoice.subtotal',
    '{{invoice.discount}}': 'invoice.discount_amount',
    '{{invoice.total}}': 'invoice.total_amount',
    '{{invoice.paid}}': 'invoice.amount_paid',
    '{{invoice.balance}}': 'invoice.balance_due',

    // System footer
    '{{system.name}}': 'system_name',
  },

  // Repeating sections (line items table rows)
  repeaters: [
    {
      selector: 'tbody > tr',
      source: 'invoice.items',
      fields: {
        '{{item.description}}': 'description',
        '{{item.quantity}}': 'quantity',
        '{{item.unit_price}}': 'unit_price',
        '{{item.total}}': 'line_total',
      },
    },
  ],

  // Embedded assets
  assets: {
    qr: {
      type: 'qr',
      source: 'invoice.invoice_number',
      placement: '.qr',
      width: 100,
      height: 100,
    },
  },
};

/**
 * Default values for invoice document
 */
export const invoiceDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
    license: '',
  },
  system_name: 'Vitora HMIS',
};

/**
 * Status color mapping for invoice badges
 */
export const invoiceStatusColors: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: '#f1f5f9', color: '#475569' },
  PENDING: { bg: '#fef3c7', color: '#92400e' },
  PARTIAL: { bg: '#dbeafe', color: '#1e40af' },
  PAID: { bg: '#dcfce7', color: '#166534' },
  OVERDUE: { bg: '#fee2e2', color: '#991b1b' },
  CANCELLED: { bg: '#f3f4f6', color: '#6b7280' },
  PROFORMA: { bg: '#f3e8ff', color: '#7c3aed' },
  WRITTEN_OFF: { bg: '#fef3c7', color: '#92400e' },
};

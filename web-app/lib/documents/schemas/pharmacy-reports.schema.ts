/**
 * Pharmacy Reports Document Schema
 *
 * Defines schemas and defaults for pharmacy report print documents.
 * Follows the same pattern as lab-analytics.schema.ts.
 */

import type { DocumentDefinition } from '../types';

// =============================================================================
// DISPENSING REPORT SCHEMA
// =============================================================================

export const dispensingReportSchema: DocumentDefinition = {
  document_type: 'dispensing_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'dispensing-report.html',

  data_sources: {
    facility: 'facility',
    period: 'period',
    report: 'report',
    summary: 'summary',
    records: 'records',
  },

  bindings: {
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{period.start}}': 'period.start',
    '{{period.end}}': 'period.end',
    '{{report.generated_at}}': 'report.generated_at',
    '{{summary.total_dispensed}}': 'summary.total_dispensed',
    '{{summary.total_value}}': 'summary.total_value',
    '{{summary.record_count}}': 'summary.record_count',
    '{{records.rows}}': 'records.rows',
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'report.reference_url',
      placement: '.qr',
      width: 60,
      height: 60,
    },
  },
};

// =============================================================================
// STOCK SUMMARY REPORT SCHEMA
// =============================================================================

export const stockSummaryReportSchema: DocumentDefinition = {
  document_type: 'stock_summary_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'stock-summary-report.html',

  data_sources: {
    facility: 'facility',
    report: 'report',
    summary: 'summary',
    items: 'items',
  },

  bindings: {
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{report.generated_at}}': 'report.generated_at',
    '{{summary.total_items}}': 'summary.total_items',
    '{{summary.low_stock_count}}': 'summary.low_stock_count',
    '{{summary.total_quantity}}': 'summary.total_quantity',
    '{{items.rows}}': 'items.rows',
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'report.reference_url',
      placement: '.qr',
      width: 60,
      height: 60,
    },
  },
};

// =============================================================================
// EXPIRY REPORT SCHEMA
// =============================================================================

export const expiryReportSchema: DocumentDefinition = {
  document_type: 'expiry_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'expiry-report.html',

  data_sources: {
    facility: 'facility',
    report: 'report',
    summary: 'summary',
    batches: 'batches',
  },

  bindings: {
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{report.generated_at}}': 'report.generated_at',
    '{{report.threshold_days}}': 'report.threshold_days',
    '{{summary.total_batches}}': 'summary.total_batches',
    '{{summary.expired_count}}': 'summary.expired_count',
    '{{summary.critical_count}}': 'summary.critical_count',
    '{{summary.warning_count}}': 'summary.warning_count',
    '{{batches.rows}}': 'batches.rows',
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'report.reference_url',
      placement: '.qr',
      width: 60,
      height: 60,
    },
  },
};

// =============================================================================
// STOCK MOVEMENT REPORT SCHEMA
// =============================================================================

export const stockMovementReportSchema: DocumentDefinition = {
  document_type: 'stock_movement_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'stock-movement-report.html',

  data_sources: {
    facility: 'facility',
    period: 'period',
    report: 'report',
    summary: 'summary',
    movements: 'movements',
  },

  bindings: {
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{period.start}}': 'period.start',
    '{{period.end}}': 'period.end',
    '{{report.generated_at}}': 'report.generated_at',
    '{{summary.total_in}}': 'summary.total_in',
    '{{summary.total_out}}': 'summary.total_out',
    '{{summary.net_movement}}': 'summary.net_movement',
    '{{summary.movement_count}}': 'summary.movement_count',
    '{{movements.rows}}': 'movements.rows',
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'report.reference_url',
      placement: '.qr',
      width: 60,
      height: 60,
    },
  },
};

// =============================================================================
// DEFAULTS
// =============================================================================

export const pharmacyReportDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
  },
  system_name: 'Vitora HMIS',
};

// =============================================================================
// STATUS CLASSES
// =============================================================================

export const expiryStatusClasses: Record<string, string> = {
  EXPIRED: 'status-expired',
  CRITICAL: 'status-critical',
  WARNING: 'status-warning',
  OK: 'status-ok',
};

export const expiryStatusLabels: Record<string, string> = {
  EXPIRED: 'Expired',
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  OK: 'OK',
};

export const movementTypeLabels: Record<string, string> = {
  RECEIVED: 'Received',
  DISPENSED: 'Dispensed',
  ADJUSTED: 'Adjusted',
};

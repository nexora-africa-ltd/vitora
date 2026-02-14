/**
 * Laboratory Report Document Schema
 *
 * Mirrors the imaging reporting document setup:
 * - HTML template reference in web-app/templates/lab-report.html
 * - Print utility in web-app/lib/documents/print-lab-report.ts
 */

import type { DocumentDefinition } from '../types';

export const labReportSchema: DocumentDefinition = {
  document_type: 'lab_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'lab-report.html',

  data_sources: {
    report: 'report',
    patient: 'patient',
    facility: 'facility',
    order: 'order',
    results: 'results',
  },

  bindings: {
    // Facility
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{facility.license}}': 'facility.license',

    // Order/report meta
    '{{order.number}}': 'order.number',
    '{{order.priority}}': 'order.priority',
    '{{order.ordered_at}}': 'order.ordered_at',
    '{{order.ordered_by}}': 'order.ordered_by',
    '{{order.notes}}': 'order.notes',

    '{{report.date}}': 'report.date',
    '{{report.status_label}}': 'report.status_label',
    '{{report.status_class}}': 'report.status_class',

    // Patient
    '{{patient.name}}': 'patient.name',
    '{{patient.mrn}}': 'patient.mrn',
    '{{patient.age}}': 'patient.age',
    '{{patient.sex}}': 'patient.sex',

    // Conditional display
    '{{critical.display}}': 'critical.display',
    '{{notes.display}}': 'notes.display',

    // Rendered HTML blocks
    '{{results.rows}}': 'results.rows',

    // Signature
    '{{signature.name}}': 'signature.name',
    '{{signature.credentials}}': 'signature.credentials',
    '{{signature.datetime}}': 'signature.datetime',
    '{{signature.status}}': 'signature.status',

    // Footer
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'order.number',
      placement: '.qr',
      width: 80,
      height: 80,
    },
  },
};

export const labReportDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
    license: '',
  },
  system_name: 'Vitora HMIS',
  signature_credentials: 'Laboratory',
};

export const labReportStatusClasses: Record<string, string> = {
  DRAFT: 'status-draft',
  PRELIMINARY: 'status-preliminary',
  FINAL: 'status-final',
};

export const labReportStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PRELIMINARY: 'Preliminary',
  FINAL: 'Final',
};

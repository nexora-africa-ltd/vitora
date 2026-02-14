/**
 * Radiology Report Document Schema
 *
 * Defines the mapping between radiology report data and the template.
 * Used by the document renderer to populate the template with report data.
 */

import type { DocumentDefinition } from '../types';

/**
 * Radiology report document definition
 *
 * Maps report, patient, facility, and clinical data to the
 * radiology report template placeholders.
 */
export const radiologyReportSchema: DocumentDefinition = {
  document_type: 'radiology_report' as any, // Extended type
  version: '1.0',
  layout: 'a4',
  template: 'radiology-report.html',

  // Data sources map logical names to actual data paths
  data_sources: {
    report: 'report',
    patient: 'patient',
    facility: 'facility',
    order: 'order',
    amendments: 'report.amendments',
  },

  // Simple variable bindings: {{placeholder}} → data.path
  bindings: {
    // Facility info (header)
    '{{facility_name}}': 'facility.name',
    '{{facility_address}}': 'facility.address',
    '{{facility_phone}}': 'facility.phone',
    '{{facility_license}}': 'facility.license',

    // Report metadata
    '{{report_number}}': 'report.report_number',
    '{{order_number}}': 'report.order_number',
    '{{report_date}}': 'report.created_at',
    '{{report_status}}': 'report.status',
    '{{status_class}}': 'status_class',

    // Patient info
    '{{patient_name}}': 'patient.full_name',
    '{{patient_mrn}}': 'patient.mrn',
    '{{patient_age}}': 'patient.age',
    '{{patient_sex}}': 'patient.sex',

    // Study info
    '{{referring_physician}}': 'order.ordered_by_name',
    '{{study_date}}': 'order.ordered_at',
    '{{modality}}': 'report.modality',
    '{{study_description}}': 'report.study_description',
    '{{clinical_indication}}': 'order.clinical_indication',

    // Report content
    '{{technique}}': 'report.technique',
    '{{technique_display}}': 'technique_display',
    '{{comparison}}': 'report.comparison',
    '{{comparison_display}}': 'comparison_display',
    '{{findings}}': 'report.findings',
    '{{impression}}': 'report.impression',
    '{{recommendations}}': 'report.recommendations',
    '{{recommendations_display}}': 'recommendations_display',

    // Critical findings
    '{{critical_display}}': 'critical_display',
    '{{critical_description}}': 'report.critical_finding_description',
    '{{critical_communication}}': 'critical_communication',

    // Signature
    '{{radiologist_name}}': 'report.reported_by_name',
    '{{radiologist_credentials}}': 'radiologist_credentials',
    '{{signature_datetime}}': 'signature_datetime',
    '{{signature_status}}': 'signature_status',

    // Amendments
    '{{amendments_display}}': 'amendments_display',

    // System footer
    '{{system_name}}': 'system_name',
  },

  // Repeating sections (amendments)
  repeaters: [
    {
      selector: '.amendment-item',
      source: 'report.amendments',
      fields: {
        '{{amendment_number}}': 'amendment_number',
        '{{amendment_reason}}': 'reason',
        '{{amendment_by}}': 'amended_by_name',
        '{{amendment_date}}': 'amended_at',
      },
    },
  ],

  // Embedded assets
  assets: {
    qr: {
      type: 'qr',
      source: 'report.report_number',
      placement: '.qr',
      width: 80,
      height: 80,
    },
  },
};

/**
 * Default values for radiology report document
 */
export const radiologyReportDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
    license: '',
  },
  system_name: 'Vitora HMIS',
  radiologist_credentials: 'Radiologist',
};

/**
 * Status CSS class mapping for report badges
 */
export const reportStatusClasses: Record<string, string> = {
  DRAFT: 'status-draft',
  PRELIMINARY: 'status-preliminary',
  FINAL: 'status-final',
  AMENDED: 'status-amended',
};

/**
 * Status display labels
 */
export const reportStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  PRELIMINARY: 'Preliminary',
  FINAL: 'Final',
  AMENDED: 'Amended',
};

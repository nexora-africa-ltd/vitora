/**
 * Labour Partograph Document Schema
 *
 * Defines defaults and placeholder bindings for printable partograph output.
 */

import type { DocumentDefinition } from '../types';

export const partographReportSchema: DocumentDefinition = {
  document_type: 'partograph_report' as any,
  version: '1.0',
  layout: 'a4',
  template: 'partograph-report.html',

  data_sources: {
    facility: 'facility',
    registration: 'registration',
    partograph: 'partograph',
    summary: 'summary',
    observations: 'observations',
    signature: 'signature',
    system: 'system',
  },

  bindings: {
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{facility.license}}': 'facility.license',
    '{{registration.mch_number}}': 'registration.mch_number',
    '{{registration.mother_name}}': 'registration.mother_name',
    '{{registration.mother_mrn}}': 'registration.mother_mrn',
    '{{registration.registration_date}}': 'registration.registration_date',
    '{{registration.gestation}}': 'registration.gestation',
    '{{registration.risk_factors}}': 'registration.risk_factors',
    '{{registration.notes}}': 'registration.notes',
    '{{partograph.started_at}}': 'partograph.started_at',
    '{{partograph.completed_at}}': 'partograph.completed_at',
    '{{partograph.status_label}}': 'partograph.status_label',
    '{{partograph.status_class}}': 'partograph.status_class',
    '{{partograph.parity}}': 'partograph.parity',
    '{{partograph.gestation_weeks}}': 'partograph.gestation_weeks',
    '{{partograph.membranes}}': 'partograph.membranes',
    '{{partograph.liquor}}': 'partograph.liquor',
    '{{partograph.notes}}': 'partograph.notes',
    '{{summary.total_observations}}': 'summary.total_observations',
    '{{summary.latest_fhr}}': 'summary.latest_fhr',
    '{{summary.latest_dilation}}': 'summary.latest_dilation',
    '{{summary.latest_contractions}}': 'summary.latest_contractions',
    '{{summary.latest_maternal_pulse}}': 'summary.latest_maternal_pulse',
    '{{summary.latest_alerts}}': 'summary.latest_alerts',
    '{{alerts.display}}': 'alerts.display',
    '{{notes.display}}': 'notes.display',
    '{{registrationNotes.display}}': 'registrationNotes.display',
    '{{observations.rows}}': 'observations.rows',
    '{{signature.name}}': 'signature.name',
    '{{signature.credentials}}': 'signature.credentials',
    '{{signature.datetime}}': 'signature.datetime',
    '{{signature.status}}': 'signature.status',
    '{{system.name}}': 'system.name',
  },

  assets: {
    qr: {
      type: 'qr',
      source: 'registration.mch_number',
      placement: '.qr',
      width: 70,
      height: 70,
    },
  },
};

export const partographReportDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
    license: '',
  },
  system_name: 'Vitora HMIS',
  signature_credentials: 'Maternity Unit',
};

export const partographReportStatusClasses: Record<string, string> = {
  ACTIVE: 'status-active',
  COMPLETED: 'status-completed',
  REFERRED: 'status-referred',
};

export const partographReportStatusLabels: Record<string, string> = {
  ACTIVE: 'Active Labour',
  COMPLETED: 'Completed',
  REFERRED: 'Referred',
};

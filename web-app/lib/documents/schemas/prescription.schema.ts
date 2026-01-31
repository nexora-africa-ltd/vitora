/**
 * Prescription Document Schema
 *
 * Defines the mapping between prescription data and the prescription HTML template.
 * Used by the document renderer to populate the template with clinical data.
 */

import type { DocumentDefinition } from '../types';

/**
 * Prescription document definition
 *
 * Maps prescription, patient, facility, and clinician data to the
 * prescription.html template placeholders.
 */
export const prescriptionSchema: DocumentDefinition = {
  document_type: 'prescription',
  version: '1.0',
  layout: 'a4',
  template: 'prescription.html',

  // Data sources map logical names to actual data paths
  data_sources: {
    patient: 'patient',
    prescription: 'prescription',
    facility: 'facility',
    clinician: 'clinician',
    encounter: 'encounter',
    medications: 'prescription.items',
  },

  // Simple variable bindings: {{placeholder}} → data.path
  bindings: {
    // Facility info (header)
    '{{facility.name}}': 'facility.name',
    '{{facility.address}}': 'facility.address',
    '{{facility.phone}}': 'facility.phone',
    '{{facility.license}}': 'facility.license',

    // Patient info
    '{{patient.full_name}}': 'patient.full_name',
    '{{patient.identifier}}': 'patient.mrn',
    '{{patient.age}}': 'patient.age',
    '{{patient.sex}}': 'patient.gender',

    // Prescription info
    '{{prescription.date}}': 'prescription.prescribed_date',
    '{{prescription.notes}}': 'prescription.clinical_notes',

    // Encounter
    '{{encounter.id}}': 'encounter_id',

    // Clinician (signature block)
    '{{clinician.name}}': 'clinician.name',
    '{{clinician.registration}}': 'clinician.registration_number',

    // System footer
    '{{system.name}}': 'system_name',
  },

  // Repeating sections (medication table rows)
  repeaters: [
    {
      selector: 'tbody > tr',
      source: 'prescription.items',
      fields: {
        '{{drug.name}}': 'drug_name',
        '{{drug.dose}}': 'dosage',
        '{{drug.frequency}}': 'frequency',
        '{{drug.duration}}': 'duration',
        '{{drug.instructions}}': 'instructions',
      },
    },
  ],

  // Embedded assets
  assets: {
    qr: {
      type: 'qr',
      source: 'prescription.prescription_number',
      placement: '.qr',
      width: 90,
      height: 90,
    },
  },
};

/**
 * Default values for prescription document
 */
export const prescriptionDefaults = {
  facility: {
    name: 'Healthcare Facility',
    address: '',
    phone: '',
    license: '',
  },
  clinician: {
    name: 'Prescribing Clinician',
    registration_number: '',
  },
  system_name: 'Vitora HMIS',
};

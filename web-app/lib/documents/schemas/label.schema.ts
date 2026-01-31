/**
 * Label Document Schema
 *
 * Defines the mapping between dispensing data and the label HTML template.
 * Used by the document renderer to populate medication labels.
 */

import type { DocumentDefinition } from '../types';

/**
 * Medication label document definition
 *
 * Maps dispensing, patient, and facility data to the
 * label.html template placeholders.
 */
export const labelSchema: DocumentDefinition = {
  document_type: 'label',
  version: '1.0',
  layout: 'label',
  template: 'label.html',

  // Data sources map logical names to actual data paths
  data_sources: {
    patient: 'patient',
    facility: 'facility',
    drug: 'drug',
    dispense: 'dispensing',
  },

  // Simple variable bindings: {{placeholder}} → data.path
  bindings: {
    // Facility info
    '{{facility.name}}': 'facility.name',

    // Patient info
    '{{patient.full_name}}': 'patient.full_name',

    // Dispense info
    '{{dispense.date}}': 'dispensing.dispensed_at',

    // Drug info
    '{{drug.name}}': 'drug.drug_name',
    '{{drug.dose}}': 'drug.dosage',
    '{{drug.frequency}}': 'drug.frequency',
    '{{drug.duration}}': 'drug.duration',
    '{{drug.instructions}}': 'drug.instructions',
  },

  // No repeaters for single label
  repeaters: [],

  // Embedded assets
  assets: {
    qr: {
      type: 'qr',
      source: 'dispensing.id',
      placement: '.qr',
      width: 64,
      height: 64,
    },
  },
};

/**
 * Default values for label document
 */
export const labelDefaults = {
  facility: {
    name: 'Healthcare Facility',
  },
  drug: {
    instructions: 'Take as directed by your healthcare provider.',
  },
};

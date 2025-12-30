/**
 * Vitora HMIS Desktop - Treatment Plan Module
 *
 * Functions for treatment plan management including templates,
 * medications, follow-up scheduling, and referrals.
 *
 * Sprint 1.1-1.2: Treatment Plan Builder
 */

// ====================
// Constants
// ====================

/**
 * Medication frequency options
 */
const FREQUENCY_OPTIONS = [
  { value: 'OD', label: 'Once daily (OD)' },
  { value: 'BD', label: 'Twice daily (BD)' },
  { value: 'TDS', label: 'Three times daily (TDS)' },
  { value: 'QID', label: 'Four times daily (QID)' },
  { value: 'PRN', label: 'As needed (PRN)' },
  { value: 'STAT', label: 'Immediately (STAT)' },
  { value: 'QHS', label: 'At bedtime (QHS)' },
  { value: 'Q4H', label: 'Every 4 hours' },
  { value: 'Q6H', label: 'Every 6 hours' },
  { value: 'Q8H', label: 'Every 8 hours' },
  { value: 'Q12H', label: 'Every 12 hours' },
  { value: 'Weekly', label: 'Once weekly' },
];

/**
 * Follow-up date presets
 */
const FOLLOW_UP_PRESETS = [
  { value: '1_week', label: '1 Week', days: 7 },
  { value: '2_weeks', label: '2 Weeks', days: 14 },
  { value: '1_month', label: '1 Month', days: 30 },
  { value: '3_months', label: '3 Months', days: 90 },
  { value: '6_months', label: '6 Months', days: 180 },
];

/**
 * Referral specialty options (sorted alphabetically)
 */
const REFERRAL_SPECIALTIES = [
  'Cardiology',
  'Dentistry',
  'Dermatology',
  'ENT (Ear, Nose, Throat)',
  'Gastroenterology',
  'General Surgery',
  'Gynecology',
  'Internal Medicine',
  'Nephrology',
  'Neurology',
  'Obstetrics',
  'Oncology',
  'Ophthalmology',
  'Orthopedics',
  'Pediatrics',
  'Physiotherapy',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
  'Surgery',
  'Urology',
];

// ====================
// State Management
// ====================

let medications = [];
let medicationIndex = 0;
let treatmentPlanState = {
  template_id: null,
  follow_up_date: null,
  follow_up_days: null,
  instructions: '',
  referral_needed: false,
  referral_specialty: '',
  referral_notes: '',
};

// ====================
// Template Functions
// ====================

/**
 * Fetch available treatment templates from API
 * @returns {Promise<Array>} Array of template objects
 */
async function fetchTreatmentTemplates() {
  try {
    const response = await window.electronAPI.apiRequest('GET', '/api/treatment-templates/');

    if (response.success && response.data) {
      return response.data.results || response.data || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching treatment templates:', error);
    return [];
  }
}

/**
 * Apply a treatment template to populate the form
 * @param {object} template - Template object with default values
 */
function applyTemplate(template) {
  if (!template) return;

  // Clear existing medications and apply template medications
  clearMedications();

  if (template.default_medications && Array.isArray(template.default_medications)) {
    template.default_medications.forEach(med => {
      addMedication({
        drug_name: med.drug_name,
        dosage: med.dosage,
        frequency: med.frequency || '',
        duration: med.duration || '',
      });
    });
  }

  // Set template reference
  treatmentPlanState.template_id = template.id || null;

  // Set follow-up days
  if (template.default_follow_up_days) {
    treatmentPlanState.follow_up_days = template.default_follow_up_days;
  }

  // Set default instructions
  if (template.default_instructions) {
    treatmentPlanState.instructions = template.default_instructions;
  }
}

// ====================
// Medication Functions
// ====================

/**
 * Add a medication to the treatment plan
 * @param {object} medication - Medication object
 * @returns {object} Added medication with index
 */
function addMedication(medication) {
  const newMed = {
    ...medication,
    index: medicationIndex++,
  };
  medications.push(newMed);
  return newMed;
}

/**
 * Remove a medication by index
 * @param {number} index - Medication index
 * @returns {boolean} True if removed, false if not found
 */
function removeMedication(index) {
  const initialLength = medications.length;
  medications = medications.filter(med => med.index !== index);
  return medications.length < initialLength;
}

/**
 * Get all medications (returns a copy)
 * @returns {Array} Array of medication objects
 */
function getMedications() {
  return [...medications];
}

/**
 * Clear all medications
 */
function clearMedications() {
  medications = [];
}

/**
 * Validate a medication object
 * @param {object} medication - Medication to validate
 * @returns {object} Validation result with valid flag and errors array
 */
function validateMedication(medication) {
  const errors = [];

  if (!medication) {
    return { valid: false, errors: ['Invalid medication object'] };
  }

  // Drug name is required
  if (!medication.drug_name || !medication.drug_name.trim()) {
    errors.push('Drug name is required');
  }

  // Dosage is required
  if (!medication.dosage || !medication.dosage.trim()) {
    errors.push('Dosage is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format medication for display
 * @param {object} medication - Medication object
 * @returns {string} Formatted medication string
 */
function formatMedicationDisplay(medication) {
  if (!medication) return '';

  const parts = [];

  if (medication.drug_name) {
    parts.push(medication.drug_name.trim());
  }

  if (medication.dosage) {
    parts.push(medication.dosage.trim());
  }

  if (medication.frequency) {
    parts.push(medication.frequency.trim());
  }

  if (medication.duration) {
    parts.push(`for ${medication.duration.trim()}`);
  }

  return parts.join(' ');
}

// ====================
// Follow-Up Functions
// ====================

/**
 * Calculate follow-up date from preset or days
 * @param {string|number} preset - Preset name or number of days
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null if invalid
 */
function calculateFollowUpDate(preset) {
  let days = null;

  // Check if it's a preset string
  if (typeof preset === 'string') {
    const presetObj = FOLLOW_UP_PRESETS.find(p => p.value === preset);
    if (presetObj) {
      days = presetObj.days;
    }
  } else if (typeof preset === 'number' && preset > 0) {
    days = preset;
  }

  if (!days || days <= 0) {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() + days);

  // Format as YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Set follow-up date
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {boolean} True if valid and set, false otherwise
 */
function setFollowUpDate(date) {
  // Validate date format
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  // Parse and validate date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return false;
  }

  // Reject past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsedDate < today) {
    return false;
  }

  treatmentPlanState.follow_up_date = date;
  return true;
}

// ====================
// Instructions & Referral Functions
// ====================

/**
 * Set patient instructions
 * @param {string} instructions - Instructions text
 */
function setInstructions(instructions) {
  treatmentPlanState.instructions = (instructions || '').trim();
}

/**
 * Set referral information
 * @param {boolean} needed - Whether referral is needed
 * @param {string} specialty - Referral specialty
 * @param {string} notes - Referral notes
 */
function setReferral(needed, specialty = '', notes = '') {
  treatmentPlanState.referral_needed = Boolean(needed);

  if (needed) {
    treatmentPlanState.referral_specialty = specialty || '';
    treatmentPlanState.referral_notes = notes || '';
  } else {
    treatmentPlanState.referral_specialty = '';
    treatmentPlanState.referral_notes = '';
  }
}

// ====================
// State Access Functions
// ====================

/**
 * Get current treatment plan data
 * @returns {object} Treatment plan state including medications
 */
function getTreatmentPlanData() {
  return {
    ...treatmentPlanState,
    medications: getMedications(),
  };
}

/**
 * Clear all treatment plan data
 */
function clearTreatmentPlan() {
  clearMedications();
  medicationIndex = 0;
  treatmentPlanState = {
    template_id: null,
    follow_up_date: null,
    follow_up_days: null,
    instructions: '',
    referral_needed: false,
    referral_specialty: '',
    referral_notes: '',
  };
}

/**
 * Build treatment plan payload for API submission
 * @param {number} encounterId - Encounter ID
 * @returns {object|null} Payload object or null if invalid
 */
function buildTreatmentPlanPayload(encounterId) {
  if (!encounterId) {
    return null;
  }

  return {
    encounter: encounterId,
    template: treatmentPlanState.template_id,
    medications_json: JSON.stringify(getMedications().map(med => ({
      drug_name: med.drug_name,
      dosage: med.dosage,
      frequency: med.frequency || '',
      duration: med.duration || '',
    }))),
    follow_up_date: treatmentPlanState.follow_up_date,
    follow_up_instructions: treatmentPlanState.instructions,
    referral_needed: treatmentPlanState.referral_needed,
    referral_specialty: treatmentPlanState.referral_needed ? treatmentPlanState.referral_specialty : '',
    referral_notes: treatmentPlanState.referral_needed ? treatmentPlanState.referral_notes : '',
  };
}

// ====================
// Module Exports
// ====================
// For Node.js/Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Constants
    FREQUENCY_OPTIONS,
    FOLLOW_UP_PRESETS,
    REFERRAL_SPECIALTIES,

    // Template Functions
    fetchTreatmentTemplates,
    applyTemplate,

    // Medication Functions
    addMedication,
    removeMedication,
    getMedications,
    clearMedications,
    validateMedication,
    formatMedicationDisplay,

    // Follow-Up Functions
    calculateFollowUpDate,
    setFollowUpDate,

    // Instructions & Referral
    setInstructions,
    setReferral,

    // State Management
    getTreatmentPlanData,
    clearTreatmentPlan,
    buildTreatmentPlanPayload,
  };
}

// For browser - expose globally
if (typeof window !== 'undefined') {
  window.TreatmentPlanModule = {
    // Constants
    FREQUENCY_OPTIONS,
    FOLLOW_UP_PRESETS,
    REFERRAL_SPECIALTIES,

    // Template Functions
    fetchTreatmentTemplates,
    applyTemplate,

    // Medication Functions
    addMedication,
    removeMedication,
    getMedications,
    clearMedications,
    validateMedication,
    formatMedicationDisplay,

    // Follow-Up Functions
    calculateFollowUpDate,
    setFollowUpDate,

    // Instructions & Referral
    setInstructions,
    setReferral,

    // State Management
    getTreatmentPlanData,
    clearTreatmentPlan,
    buildTreatmentPlanPayload,
  };
}

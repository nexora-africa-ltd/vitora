/**
 * Unit Tests for Treatment Plan Builder (Sprint 1.1-1.2)
 *
 * TDD approach: Tests written BEFORE implementation (Red phase).
 * Tests should FAIL initially, then pass after implementation (Green phase).
 *
 * Functions under test (to be implemented in src/renderer/treatment-plan.js):
 * - fetchTreatmentTemplates()
 * - applyTemplate(template)
 * - addMedication(medication)
 * - removeMedication(index)
 * - getMedications()
 * - clearMedications()
 * - validateMedication(medication)
 * - calculateFollowUpDate(preset)
 * - formatMedicationDisplay(medication)
 * - buildTreatmentPlanPayload(encounterId)
 */

// Import functions from the treatment-plan module (to be created)
const treatmentPlan = require('../src/renderer/treatment-plan');

// Mock window.electronAPI for API calls
const mockApiRequest = jest.fn();
global.window = {
  electronAPI: {
    apiRequest: mockApiRequest,
  },
};

// ====================
// Test Setup
// ====================
beforeEach(() => {
  jest.clearAllMocks();
  treatmentPlan.clearMedications();
  treatmentPlan.clearTreatmentPlan();
});

// ====================
// Tests: fetchTreatmentTemplates
// ====================
describe('fetchTreatmentTemplates', () => {
  test('should call API to fetch templates', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { results: [] },
    });

    await treatmentPlan.fetchTreatmentTemplates();

    expect(mockApiRequest).toHaveBeenCalledWith('GET', '/api/treatment-templates/');
  });

  test('should return templates array on success', async () => {
    const mockTemplates = [
      { id: 1, name: 'General OPD', department: 'Outpatient' },
      { id: 2, name: 'Malaria Protocol', department: 'Internal Medicine' },
    ];
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { results: mockTemplates },
    });

    const templates = await treatmentPlan.fetchTreatmentTemplates();

    expect(templates).toEqual(mockTemplates);
  });

  test('should return empty array on API failure', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    const templates = await treatmentPlan.fetchTreatmentTemplates();

    expect(templates).toEqual([]);
  });

  test('should return empty array on API exception', async () => {
    mockApiRequest.mockRejectedValue(new Error('Network error'));

    const templates = await treatmentPlan.fetchTreatmentTemplates();

    expect(templates).toEqual([]);
  });
});

// ====================
// Tests: applyTemplate
// ====================
describe('applyTemplate', () => {
  const mockTemplate = {
    id: 1,
    name: 'Malaria Protocol',
    department: 'Internal Medicine',
    default_medications: [
      { drug_name: 'Artemether-Lumefantrine', dosage: '80/480mg', frequency: 'BD', duration: '3 days' },
      { drug_name: 'Paracetamol', dosage: '1g', frequency: 'TDS', duration: '3 days' },
    ],
    default_follow_up_days: 7,
    default_instructions: 'Complete the full course. Return if fever persists.',
  };

  test('should populate medications from template', () => {
    treatmentPlan.applyTemplate(mockTemplate);

    const medications = treatmentPlan.getMedications();
    expect(medications.length).toBe(2);
    expect(medications[0].drug_name).toBe('Artemether-Lumefantrine');
  });

  test('should set follow-up days from template', () => {
    treatmentPlan.applyTemplate(mockTemplate);

    const plan = treatmentPlan.getTreatmentPlanData();
    expect(plan.follow_up_days).toBe(7);
  });

  test('should set instructions from template', () => {
    treatmentPlan.applyTemplate(mockTemplate);

    const plan = treatmentPlan.getTreatmentPlanData();
    expect(plan.instructions).toBe('Complete the full course. Return if fever persists.');
  });

  test('should set template reference', () => {
    treatmentPlan.applyTemplate(mockTemplate);

    const plan = treatmentPlan.getTreatmentPlanData();
    expect(plan.template_id).toBe(1);
  });

  test('should clear existing medications before applying', () => {
    treatmentPlan.addMedication({ drug_name: 'Existing Drug', dosage: '100mg' });
    treatmentPlan.applyTemplate(mockTemplate);

    const medications = treatmentPlan.getMedications();
    expect(medications.length).toBe(2);
    expect(medications[0].drug_name).toBe('Artemether-Lumefantrine');
  });

  test('should handle template with no medications', () => {
    const emptyTemplate = { id: 2, name: 'Empty', default_medications: [] };
    treatmentPlan.applyTemplate(emptyTemplate);

    const medications = treatmentPlan.getMedications();
    expect(medications).toEqual([]);
  });

  test('should handle null template gracefully', () => {
    expect(() => treatmentPlan.applyTemplate(null)).not.toThrow();
  });
});

// ====================
// Tests: Medication Management
// ====================
describe('Medication Management', () => {
  describe('addMedication', () => {
    test('should add valid medication to list', () => {
      const medication = {
        drug_name: 'Amoxicillin',
        dosage: '500mg',
        frequency: 'TDS',
        duration: '7 days',
      };

      treatmentPlan.addMedication(medication);

      const medications = treatmentPlan.getMedications();
      expect(medications.length).toBe(1);
      expect(medications[0]).toMatchObject(medication);
    });

    test('should add multiple medications', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });
      treatmentPlan.addMedication({ drug_name: 'Drug B', dosage: '200mg' });
      treatmentPlan.addMedication({ drug_name: 'Drug C', dosage: '300mg' });

      const medications = treatmentPlan.getMedications();
      expect(medications.length).toBe(3);
    });

    test('should assign unique index to each medication', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });
      treatmentPlan.addMedication({ drug_name: 'Drug B', dosage: '200mg' });

      const medications = treatmentPlan.getMedications();
      expect(medications[0].index).toBeDefined();
      expect(medications[1].index).toBeDefined();
      expect(medications[0].index).not.toBe(medications[1].index);
    });

    test('should return the added medication with index', () => {
      const result = treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });

      expect(result).toMatchObject({ drug_name: 'Drug A', dosage: '100mg' });
      expect(result.index).toBeDefined();
    });
  });

  describe('removeMedication', () => {
    test('should remove medication by index', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });
      const med2 = treatmentPlan.addMedication({ drug_name: 'Drug B', dosage: '200mg' });
      treatmentPlan.addMedication({ drug_name: 'Drug C', dosage: '300mg' });

      treatmentPlan.removeMedication(med2.index);

      const medications = treatmentPlan.getMedications();
      expect(medications.length).toBe(2);
      expect(medications.find(m => m.drug_name === 'Drug B')).toBeUndefined();
    });

    test('should handle removing non-existent index', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });

      expect(() => treatmentPlan.removeMedication(999)).not.toThrow();
      expect(treatmentPlan.getMedications().length).toBe(1);
    });

    test('should return true when medication removed', () => {
      const med = treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });

      const result = treatmentPlan.removeMedication(med.index);

      expect(result).toBe(true);
    });

    test('should return false when medication not found', () => {
      const result = treatmentPlan.removeMedication(999);

      expect(result).toBe(false);
    });
  });

  describe('clearMedications', () => {
    test('should remove all medications', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });
      treatmentPlan.addMedication({ drug_name: 'Drug B', dosage: '200mg' });

      treatmentPlan.clearMedications();

      expect(treatmentPlan.getMedications()).toEqual([]);
    });
  });

  describe('getMedications', () => {
    test('should return empty array initially', () => {
      expect(treatmentPlan.getMedications()).toEqual([]);
    });

    test('should return copy of medications array', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });

      const meds1 = treatmentPlan.getMedications();
      const meds2 = treatmentPlan.getMedications();

      expect(meds1).not.toBe(meds2); // Different array references
      expect(meds1).toEqual(meds2); // Same content
    });
  });
});

// ====================
// Tests: validateMedication
// ====================
describe('validateMedication', () => {
  test('should return valid for complete medication', () => {
    const medication = {
      drug_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'TDS',
      duration: '7 days',
    };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('should require drug_name', () => {
    const medication = { dosage: '500mg', frequency: 'TDS' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Drug name is required');
  });

  test('should require dosage', () => {
    const medication = { drug_name: 'Amoxicillin', frequency: 'TDS' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Dosage is required');
  });

  test('should allow optional frequency', () => {
    const medication = { drug_name: 'Amoxicillin', dosage: '500mg' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(true);
  });

  test('should allow optional duration', () => {
    const medication = { drug_name: 'Amoxicillin', dosage: '500mg', frequency: 'TDS' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(true);
  });

  test('should reject empty drug_name', () => {
    const medication = { drug_name: '', dosage: '500mg' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Drug name is required');
  });

  test('should reject whitespace-only drug_name', () => {
    const medication = { drug_name: '   ', dosage: '500mg' };

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Drug name is required');
  });

  test('should handle null medication', () => {
    const result = treatmentPlan.validateMedication(null);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('should collect multiple errors', () => {
    const medication = { frequency: 'TDS' }; // Missing drug_name and dosage

    const result = treatmentPlan.validateMedication(medication);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });
});

// ====================
// Tests: calculateFollowUpDate
// ====================
describe('calculateFollowUpDate', () => {
  // Mock current date for consistent testing
  const mockDate = new Date('2025-12-30');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should calculate 1 week follow-up', () => {
    const result = treatmentPlan.calculateFollowUpDate('1_week');

    expect(result).toBe('2026-01-06');
  });

  test('should calculate 2 weeks follow-up', () => {
    const result = treatmentPlan.calculateFollowUpDate('2_weeks');

    expect(result).toBe('2026-01-13');
  });

  test('should calculate 1 month follow-up', () => {
    const result = treatmentPlan.calculateFollowUpDate('1_month');

    // 30 days from Dec 30 = Jan 29
    expect(result).toBe('2026-01-29');
  });

  test('should calculate 3 months follow-up', () => {
    const result = treatmentPlan.calculateFollowUpDate('3_months');

    // 90 days from Dec 30 = Mar 30
    expect(result).toBe('2026-03-30');
  });

  test('should calculate custom days follow-up', () => {
    const result = treatmentPlan.calculateFollowUpDate(10); // 10 days

    expect(result).toBe('2026-01-09');
  });

  test('should return null for invalid preset', () => {
    const result = treatmentPlan.calculateFollowUpDate('invalid');

    expect(result).toBeNull();
  });

  test('should return null for zero days', () => {
    const result = treatmentPlan.calculateFollowUpDate(0);

    expect(result).toBeNull();
  });

  test('should return null for negative days', () => {
    const result = treatmentPlan.calculateFollowUpDate(-5);

    expect(result).toBeNull();
  });

  test('should return ISO date string format (YYYY-MM-DD)', () => {
    const result = treatmentPlan.calculateFollowUpDate('1_week');

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ====================
// Tests: formatMedicationDisplay
// ====================
describe('formatMedicationDisplay', () => {
  test('should format complete medication', () => {
    const medication = {
      drug_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'TDS',
      duration: '7 days',
    };

    const result = treatmentPlan.formatMedicationDisplay(medication);

    expect(result).toBe('Amoxicillin 500mg TDS for 7 days');
  });

  test('should format medication without frequency', () => {
    const medication = {
      drug_name: 'Amoxicillin',
      dosage: '500mg',
      duration: '7 days',
    };

    const result = treatmentPlan.formatMedicationDisplay(medication);

    expect(result).toBe('Amoxicillin 500mg for 7 days');
  });

  test('should format medication without duration', () => {
    const medication = {
      drug_name: 'Amoxicillin',
      dosage: '500mg',
      frequency: 'TDS',
    };

    const result = treatmentPlan.formatMedicationDisplay(medication);

    expect(result).toBe('Amoxicillin 500mg TDS');
  });

  test('should format minimal medication (name + dosage)', () => {
    const medication = {
      drug_name: 'Amoxicillin',
      dosage: '500mg',
    };

    const result = treatmentPlan.formatMedicationDisplay(medication);

    expect(result).toBe('Amoxicillin 500mg');
  });

  test('should handle null medication', () => {
    const result = treatmentPlan.formatMedicationDisplay(null);

    expect(result).toBe('');
  });

  test('should handle medication with extra whitespace', () => {
    const medication = {
      drug_name: '  Amoxicillin  ',
      dosage: ' 500mg ',
      frequency: ' TDS ',
    };

    const result = treatmentPlan.formatMedicationDisplay(medication);

    expect(result).toBe('Amoxicillin 500mg TDS');
  });
});

// ====================
// Tests: buildTreatmentPlanPayload
// ====================
describe('buildTreatmentPlanPayload', () => {
  test('should build payload with encounter ID', () => {
    treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg' });
    treatmentPlan.setFollowUpDate('2026-01-15');
    treatmentPlan.setInstructions('Take with food');

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.encounter).toBe(123);
  });

  test('should include medications JSON', () => {
    treatmentPlan.addMedication({ drug_name: 'Drug A', dosage: '100mg', frequency: 'BD' });
    treatmentPlan.addMedication({ drug_name: 'Drug B', dosage: '200mg', frequency: 'TDS' });

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.medications_json).toBeDefined();
    const medications = JSON.parse(payload.medications_json);
    expect(medications.length).toBe(2);
  });

  test('should include follow-up date', () => {
    treatmentPlan.setFollowUpDate('2026-01-15');

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.follow_up_date).toBe('2026-01-15');
  });

  test('should include instructions', () => {
    treatmentPlan.setInstructions('Complete the full course');

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.follow_up_instructions).toBe('Complete the full course');
  });

  test('should include template ID when set', () => {
    const template = { id: 5, name: 'Test', default_medications: [] };
    treatmentPlan.applyTemplate(template);

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.template).toBe(5);
  });

  test('should include referral data when set', () => {
    treatmentPlan.setReferral(true, 'Cardiology', 'Chest pain evaluation');

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.referral_needed).toBe(true);
    expect(payload.referral_specialty).toBe('Cardiology');
    expect(payload.referral_notes).toBe('Chest pain evaluation');
  });

  test('should not include referral fields when not needed', () => {
    treatmentPlan.setReferral(false);

    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload.referral_needed).toBe(false);
    expect(payload.referral_specialty).toBe('');
    expect(payload.referral_notes).toBe('');
  });

  test('should return null if no encounter ID provided', () => {
    const payload = treatmentPlan.buildTreatmentPlanPayload(null);

    expect(payload).toBeNull();
  });

  test('should handle empty treatment plan', () => {
    const payload = treatmentPlan.buildTreatmentPlanPayload(123);

    expect(payload).not.toBeNull();
    expect(payload.encounter).toBe(123);
    expect(payload.medications_json).toBe('[]');
  });
});

// ====================
// Tests: Treatment Plan State Management
// ====================
describe('Treatment Plan State', () => {
  describe('setFollowUpDate', () => {
    test('should set follow-up date', () => {
      treatmentPlan.setFollowUpDate('2026-01-15');

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.follow_up_date).toBe('2026-01-15');
    });

    test('should validate date format', () => {
      const result = treatmentPlan.setFollowUpDate('invalid-date');

      expect(result).toBe(false);
    });

    test('should accept valid ISO date', () => {
      const result = treatmentPlan.setFollowUpDate('2026-01-15');

      expect(result).toBe(true);
    });

    test('should reject past dates', () => {
      const result = treatmentPlan.setFollowUpDate('2020-01-01');

      expect(result).toBe(false);
    });
  });

  describe('setInstructions', () => {
    test('should set patient instructions', () => {
      treatmentPlan.setInstructions('Take medication with food');

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.instructions).toBe('Take medication with food');
    });

    test('should trim whitespace', () => {
      treatmentPlan.setInstructions('  Instructions with spaces  ');

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.instructions).toBe('Instructions with spaces');
    });
  });

  describe('setReferral', () => {
    test('should set referral data', () => {
      treatmentPlan.setReferral(true, 'Orthopedics', 'Fracture evaluation');

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.referral_needed).toBe(true);
      expect(plan.referral_specialty).toBe('Orthopedics');
      expect(plan.referral_notes).toBe('Fracture evaluation');
    });

    test('should clear referral data when not needed', () => {
      treatmentPlan.setReferral(true, 'Orthopedics', 'Notes');
      treatmentPlan.setReferral(false);

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.referral_needed).toBe(false);
      expect(plan.referral_specialty).toBe('');
      expect(plan.referral_notes).toBe('');
    });
  });

  describe('clearTreatmentPlan', () => {
    test('should reset all treatment plan data', () => {
      treatmentPlan.addMedication({ drug_name: 'Drug', dosage: '100mg' });
      treatmentPlan.setFollowUpDate('2026-01-15');
      treatmentPlan.setInstructions('Instructions');
      treatmentPlan.setReferral(true, 'Cardiology', 'Notes');

      treatmentPlan.clearTreatmentPlan();

      const plan = treatmentPlan.getTreatmentPlanData();
      expect(plan.medications).toEqual([]);
      expect(plan.follow_up_date).toBeNull();
      expect(plan.instructions).toBe('');
      expect(plan.referral_needed).toBe(false);
      expect(plan.template_id).toBeNull();
    });
  });
});

// ====================
// Tests: FREQUENCY_OPTIONS constant
// ====================
describe('FREQUENCY_OPTIONS', () => {
  test('should export frequency options', () => {
    expect(treatmentPlan.FREQUENCY_OPTIONS).toBeDefined();
    expect(Array.isArray(treatmentPlan.FREQUENCY_OPTIONS)).toBe(true);
  });

  test('should include common frequencies', () => {
    const options = treatmentPlan.FREQUENCY_OPTIONS;
    const values = options.map(o => o.value);

    expect(values).toContain('OD');
    expect(values).toContain('BD');
    expect(values).toContain('TDS');
    expect(values).toContain('QID');
    expect(values).toContain('PRN');
  });

  test('should have label and value for each option', () => {
    treatmentPlan.FREQUENCY_OPTIONS.forEach(option => {
      expect(option.value).toBeDefined();
      expect(option.label).toBeDefined();
    });
  });
});

// ====================
// Tests: FOLLOW_UP_PRESETS constant
// ====================
describe('FOLLOW_UP_PRESETS', () => {
  test('should export follow-up presets', () => {
    expect(treatmentPlan.FOLLOW_UP_PRESETS).toBeDefined();
    expect(Array.isArray(treatmentPlan.FOLLOW_UP_PRESETS)).toBe(true);
  });

  test('should include common presets', () => {
    const presets = treatmentPlan.FOLLOW_UP_PRESETS;
    const values = presets.map(p => p.value);

    expect(values).toContain('1_week');
    expect(values).toContain('2_weeks');
    expect(values).toContain('1_month');
  });

  test('should have label, value, and days for each preset', () => {
    treatmentPlan.FOLLOW_UP_PRESETS.forEach(preset => {
      expect(preset.value).toBeDefined();
      expect(preset.label).toBeDefined();
      expect(preset.days).toBeDefined();
      expect(typeof preset.days).toBe('number');
    });
  });
});

// ====================
// Tests: REFERRAL_SPECIALTIES constant
// ====================
describe('REFERRAL_SPECIALTIES', () => {
  test('should export referral specialties', () => {
    expect(treatmentPlan.REFERRAL_SPECIALTIES).toBeDefined();
    expect(Array.isArray(treatmentPlan.REFERRAL_SPECIALTIES)).toBe(true);
  });

  test('should include common specialties', () => {
    const specialties = treatmentPlan.REFERRAL_SPECIALTIES;

    expect(specialties).toContain('Cardiology');
    expect(specialties).toContain('Orthopedics');
    expect(specialties).toContain('Pediatrics');
    expect(specialties).toContain('Surgery');
  });

  test('should be sorted alphabetically', () => {
    const specialties = treatmentPlan.REFERRAL_SPECIALTIES;
    const sorted = [...specialties].sort();

    expect(specialties).toEqual(sorted);
  });
});

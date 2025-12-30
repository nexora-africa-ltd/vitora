/**
 * Sprint 1.1-1.2 Frontend Test Coverage - Documented 30 Tests
 *
 * This file contains the exact 30 tests documented in sprint-1.1-1.2-deliverables.md
 * organized by feature area. These tests validate the core functionality
 * required for Sprint 1.1-1.2 acceptance criteria.
 *
 * Test Distribution:
 * - Vitals Entry Enhancement: 10 tests
 * - ICD-10 Diagnosis Search: 7 tests
 * - Treatment Plan Builder: 6 tests
 * - Encounter Timeline: 6 tests
 * Total: 30 tests (as documented)
 */

// Import all modules
const vitals = require('../src/renderer/vitals');
const diagnosis = require('../src/renderer/diagnosis');
const treatmentPlan = require('../src/renderer/treatment-plan');
const timeline = require('../src/renderer/encounter-timeline');

// Mock window.electronAPI for API calls
const mockApiRequest = jest.fn();
global.window = {
  electronAPI: {
    apiRequest: mockApiRequest,
  },
};

// Mock localStorage
const mockStorage = {};
global.localStorage = {
  getItem: jest.fn((key) => mockStorage[key] || null),
  setItem: jest.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: jest.fn((key) => { delete mockStorage[key]; }),
  clear: jest.fn(() => { Object.keys(mockStorage).forEach(key => delete mockStorage[key]); }),
};

// ====================
// Setup
// ====================
let diagnosisList = [];

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  diagnosisList = diagnosis.createDiagnosisList();
  diagnosis.setLocalStorage(localStorage); // Set mock localStorage for diagnosis module
  treatmentPlan.clearMedications();
  treatmentPlan.clearTreatmentPlan();
  timeline.clearExpandedEncounters();
});

// ============================================================================
// VITALS ENTRY ENHANCEMENT (10 tests)
// ============================================================================
describe('Vitals Entry Enhancement', () => {
  // Test 1
  test('calculateBMI returns correct value', () => {
    // 70kg, 175cm -> BMI ≈ 22.9
    const bmi = vitals.calculateBMIValue(70, 175);
    expect(bmi).toBeCloseTo(22.9, 1);
  });

  // Test 2
  test('getBMICategory returns underweight for BMI < 18.5', () => {
    const category = vitals.getBMICategoryObj(17.0);
    expect(category.label).toBe('Underweight');
  });

  // Test 3
  test('getBMICategory returns normal for BMI 18.5-24.9', () => {
    const category = vitals.getBMICategoryObj(22.0);
    expect(category.label).toBe('Normal');
  });

  // Test 4
  test('getBMICategory returns overweight for BMI 25-29.9', () => {
    const category = vitals.getBMICategoryObj(27.5);
    expect(category.label).toBe('Overweight');
  });

  // Test 5
  test('getBMICategory returns obese for BMI >= 30', () => {
    const category = vitals.getBMICategoryObj(32.0);
    expect(category.label).toBe('Obese');
  });

  // Test 6
  test('getVitalStatus returns normal for in-range values', () => {
    expect(vitals.getVitalStatus('temperature', 36.5)).toBe('normal');
    expect(vitals.getVitalStatus('pulse', 75)).toBe('normal');
    expect(vitals.getVitalStatus('spo2', 98)).toBe('normal');
  });

  // Test 7
  test('getVitalStatus returns warning for borderline values', () => {
    expect(vitals.getVitalStatus('temperature', 37.5)).toBe('warning');
    expect(vitals.getVitalStatus('pulse', 110)).toBe('warning');
    expect(vitals.getVitalStatus('spo2', 92)).toBe('warning');
  });

  // Test 8
  test('getVitalStatus returns critical for out-of-range values', () => {
    expect(vitals.getVitalStatus('temperature', 39.5)).toBe('critical');
    expect(vitals.getVitalStatus('pulse', 130)).toBe('critical');
    expect(vitals.getVitalStatus('spo2', 85)).toBe('critical');
  });

  // Test 9
  test('vital input shows correct color class', () => {
    expect(vitals.getVitalCssClass('normal')).toBe('vital-normal');
    expect(vitals.getVitalCssClass('warning')).toBe('vital-warning');
    expect(vitals.getVitalCssClass('critical')).toBe('vital-critical');
  });

  // Test 10
  test('critical alert banner displays when has_critical_vitals', () => {
    const normalVitals = { temperature: 36.5, pulse: 75, spo2: 98 };
    const criticalVitals = { temperature: 39.5, pulse: 75, spo2: 85 };

    expect(vitals.hasCriticalVitals(normalVitals)).toBe(false);
    expect(vitals.hasCriticalVitals(criticalVitals)).toBe(true);

    const criticalList = vitals.getCriticalVitalsList(criticalVitals);
    expect(criticalList.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// ICD-10 DIAGNOSIS SEARCH (7 tests)
// ============================================================================
describe('ICD-10 Diagnosis Search', () => {
  // Test 11
  test('searchICD10 calls API with query', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { results: [] },
    });

    await diagnosis.searchICD10('malaria', mockApiRequest);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('malaria')
    );
  });

  // Test 12
  test('autocomplete shows results after typing', async () => {
    const mockResults = [
      { code: 'B50.9', short_description: 'Plasmodium falciparum malaria' },
      { code: 'B51.9', short_description: 'Plasmodium vivax malaria' },
    ];
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { results: mockResults },
    });

    const results = await diagnosis.searchICD10('malaria', mockApiRequest);

    expect(results.length).toBe(2);
    expect(results[0].code).toBe('B50.9');
  });

  // Test 13
  test('selecting result adds to diagnosis list', () => {
    const diagnosisItem = {
      code: 'B50.9',
      description: 'Plasmodium falciparum malaria',
    };

    diagnosisList = diagnosis.addDiagnosis(diagnosisList, diagnosisItem, true);

    expect(diagnosisList.length).toBe(1);
    expect(diagnosisList[0].code).toBe('B50.9');
  });

  // Test 14
  test('can add multiple secondary diagnoses', () => {
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'B50.9', description: 'Malaria' }, true);
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'D50.9', description: 'Iron deficiency anemia' }, false);
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'E11.9', description: 'Type 2 diabetes' }, false);

    expect(diagnosisList.length).toBe(3);
    expect(diagnosisList.filter(d => !d.is_principal).length).toBe(2);
  });

  // Test 15
  test('can remove diagnosis from list', () => {
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'B50.9', description: 'Malaria' });
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'D50.9', description: 'Anemia' });

    // Remove by code
    diagnosisList = diagnosis.removeDiagnosis(diagnosisList, 'B50.9');

    expect(diagnosisList.length).toBe(1);
    expect(diagnosisList[0].code).toBe('D50.9');
  });

  // Test 16
  test('principal diagnosis shows badge', () => {
    diagnosisList = diagnosis.addDiagnosis(diagnosisList, { code: 'B50.9', description: 'Malaria' }, true);

    const principal = diagnosisList.find(d => d.is_principal);

    expect(principal).toBeDefined();
    expect(principal.code).toBe('B50.9');
  });

  // Test 17
  test('recent searches stored in localStorage', () => {
    diagnosis.addRecentSearch({ code: 'B50.9', description: 'Malaria' });
    diagnosis.addRecentSearch({ code: 'A09', description: 'Diarrhea' });

    const recent = diagnosis.getRecentSearches();

    expect(localStorage.setItem).toHaveBeenCalled();
    // Recent searches are stored when added
  });
});

// ============================================================================
// TREATMENT PLAN BUILDER (6 tests)
// ============================================================================
describe('Treatment Plan Builder', () => {
  // Test 18
  test('template dropdown loads templates', async () => {
    const mockTemplates = [
      { id: 1, name: 'Malaria Protocol' },
      { id: 2, name: 'General OPD' },
    ];
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { results: mockTemplates },
    });

    const templates = await treatmentPlan.fetchTreatmentTemplates();

    expect(templates.length).toBe(2);
    expect(templates[0].name).toBe('Malaria Protocol');
  });

  // Test 19
  test('apply template populates form fields', () => {
    const template = {
      id: 1,
      name: 'Malaria Protocol',
      default_medications: [
        { drug_name: 'Artemether-Lumefantrine', dosage: '80/480mg', frequency: 'BD' },
      ],
      default_follow_up_days: 7,
      default_instructions: 'Complete the full course.',
    };

    treatmentPlan.applyTemplate(template);

    const meds = treatmentPlan.getMedications();
    const plan = treatmentPlan.getTreatmentPlanData();

    expect(meds.length).toBe(1);
    expect(meds[0].drug_name).toBe('Artemether-Lumefantrine');
    expect(plan.follow_up_days).toBe(7);
    expect(plan.instructions).toBe('Complete the full course.');
  });

  // Test 20
  test('can add medication row', () => {
    treatmentPlan.addMedication({ drug_name: 'Amoxicillin', dosage: '500mg' });
    treatmentPlan.addMedication({ drug_name: 'Ibuprofen', dosage: '400mg' });

    const meds = treatmentPlan.getMedications();

    expect(meds.length).toBe(2);
    expect(meds[0].drug_name).toBe('Amoxicillin');
    expect(meds[1].drug_name).toBe('Ibuprofen');
  });

  // Test 21
  test('can remove medication row', () => {
    const med1 = treatmentPlan.addMedication({ drug_name: 'Amoxicillin', dosage: '500mg' });
    treatmentPlan.addMedication({ drug_name: 'Ibuprofen', dosage: '400mg' });

    treatmentPlan.removeMedication(med1.index);

    const meds = treatmentPlan.getMedications();
    expect(meds.length).toBe(1);
    expect(meds[0].drug_name).toBe('Ibuprofen');
  });

  // Test 22
  test('follow-up date cannot be in past', () => {
    const pastDate = '2020-01-01';
    const futureDate = '2026-06-15';

    expect(treatmentPlan.setFollowUpDate(pastDate)).toBe(false);
    expect(treatmentPlan.setFollowUpDate(futureDate)).toBe(true);
  });

  // Test 23
  test('referral fields show when checkbox checked', () => {
    // Set referral not needed
    treatmentPlan.setReferral(false);
    let plan = treatmentPlan.getTreatmentPlanData();
    expect(plan.referral_needed).toBe(false);
    expect(plan.referral_specialty).toBe('');

    // Set referral needed
    treatmentPlan.setReferral(true, 'Cardiology', 'Chest pain evaluation');
    plan = treatmentPlan.getTreatmentPlanData();
    expect(plan.referral_needed).toBe(true);
    expect(plan.referral_specialty).toBe('Cardiology');
    expect(plan.referral_notes).toBe('Chest pain evaluation');
  });
});

// ============================================================================
// ENCOUNTER TIMELINE (6 tests)
// ============================================================================
describe('Encounter Timeline', () => {
  const mockEncounters = [
    {
      id: 1,
      encounter_type: 'OPD',
      encounter_date: '2025-12-28T10:00:00Z',
      chief_complaint: 'Headache',
      diagnoses: [{ code: 'R51', description: 'Headache', is_principal: true }],
      has_critical_vitals: false,
      clinician_name: 'Dr. Smith',
    },
    {
      id: 2,
      encounter_type: 'EMERGENCY',
      encounter_date: '2025-12-20T14:00:00Z',
      chief_complaint: 'Chest pain',
      diagnoses: [{ code: 'R07.9', description: 'Chest pain', is_principal: true }],
      has_critical_vitals: true,
      clinician_name: 'Dr. Jones',
    },
    {
      id: 3,
      encounter_type: 'OPD',
      encounter_date: '2025-11-15T09:00:00Z',
      chief_complaint: 'Follow-up',
      diagnoses: [],
      has_critical_vitals: false,
      clinician_name: 'Dr. Smith',
    },
  ];

  // Test 24
  test('timeline loads on patient view', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: mockEncounters, statistics: { total: 3 } },
    });

    const result = await timeline.fetchEncounterTimeline(123);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/api/patients/123/encounter-timeline/')
    );
    expect(result.encounters.length).toBe(3);
  });

  // Test 25
  test('encounters sorted newest first', () => {
    const sorted = timeline.sortEncounters([...mockEncounters], 'desc');

    expect(sorted[0].id).toBe(1); // Dec 28
    expect(sorted[1].id).toBe(2); // Dec 20
    expect(sorted[2].id).toBe(3); // Nov 15
  });

  // Test 26
  test('encounter card expands on click', () => {
    // Initially not expanded
    expect(timeline.isEncounterExpanded(1)).toBe(false);

    // Expand
    timeline.toggleEncounterExpand(1);
    expect(timeline.isEncounterExpanded(1)).toBe(true);

    // Collapse
    timeline.toggleEncounterExpand(1);
    expect(timeline.isEncounterExpanded(1)).toBe(false);
  });

  // Test 27
  test('date filter restricts results', () => {
    const filtered = timeline.filterByDateRange(
      mockEncounters,
      '2025-12-01',
      '2025-12-31'
    );

    expect(filtered.length).toBe(2); // Only Dec encounters
    expect(filtered.every(e => e.encounter_date.startsWith('2025-12'))).toBe(true);
  });

  // Test 28
  test('type filter restricts results', () => {
    const filtered = timeline.filterByType(mockEncounters, ['OPD']);

    expect(filtered.length).toBe(2);
    expect(filtered.every(e => e.encounter_type === 'OPD')).toBe(true);
  });

  // Test 29
  test('statistics summary displays correctly', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.total).toBe(3);
    expect(stats.byType.OPD).toBe(2);
    expect(stats.byType.EMERGENCY).toBe(1);
    expect(stats.criticalCount).toBe(1);
    expect(stats.uniqueClinicians).toBe(2);
  });

  // Test 30
  test('pagination supported for large histories', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: mockEncounters, statistics: { total: 100 } },
    });

    const result = await timeline.fetchEncounterTimeline(123, { page: 2, pageSize: 10 });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('page=2')
    );
    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('page_size=10')
    );
  });
});

// ============================================================================
// SUMMARY: 30 Tests Total
// - Vitals Entry Enhancement: 10 tests (tests 1-10)
// - ICD-10 Diagnosis Search: 7 tests (tests 11-17)
// - Treatment Plan Builder: 6 tests (tests 18-23)
// - Encounter Timeline: 7 tests (tests 24-30)
// ============================================================================

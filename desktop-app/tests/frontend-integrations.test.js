/**
 * Unit Tests for Frontend Integrations (Sprint 1.1-1.2)
 *
 * TDD approach: Tests written BEFORE implementation.
 * Tests cover:
 * - Encounter Timeline integration with patient modal
 * - Treatment template suggestions based on diagnosis
 * - Popular templates display
 * - Template clone functionality
 *
 * Functions under test:
 * - loadPatientTimeline(patientId, filters)
 * - suggestTemplatesForDiagnosis(diagnosisCode)
 * - loadPopularTemplates(limit)
 * - cloneTemplate(templateId)
 */

// Mock window.electronAPI for API calls
const mockApiRequest = jest.fn();
global.window = {
  electronAPI: {
    apiRequest: mockApiRequest,
  },
  TimelineModule: null,
  DiagnosisModule: null,
};

// ====================
// Test Data
// ====================
const mockTimelineData = {
  encounters: [
    {
      id: 1,
      encounter_type: 'OPD',
      encounter_date: '2025-12-28',
      chief_complaint: 'Headache and fever',
      has_critical_vitals: false,
      diagnoses: [{ code: 'J06.9', description: 'Acute upper respiratory infection' }],
    },
    {
      id: 2,
      encounter_type: 'EMERGENCY',
      encounter_date: '2025-12-15',
      chief_complaint: 'Chest pain',
      has_critical_vitals: true,
      diagnoses: [{ code: 'I20.9', description: 'Angina pectoris' }],
    },
  ],
  statistics: {
    total_encounters: 2,
    emergency_count: 1,
    critical_encounters: 1,
  },
};

const mockSuggestedTemplates = [
  {
    id: 1,
    name: 'Malaria Treatment Protocol',
    department: 'Internal Medicine',
    default_medications: '[{"name":"Artemether-Lumefantrine","dosage":"80/480mg","frequency":"BD","duration":"3 days"}]',
    default_instructions: 'Complete full course. Stay hydrated.',
    follow_up_days: 7,
  },
  {
    id: 2,
    name: 'Malaria - Severe Case',
    department: 'Emergency',
    default_medications: '[{"name":"Artesunate","dosage":"2.4mg/kg","frequency":"IV","duration":"Until stable"}]',
    default_instructions: 'Monitor closely. Consider ICU admission.',
    follow_up_days: 3,
  },
];

const mockPopularTemplates = [
  { id: 1, name: 'General OPD Assessment', usage_count: 150 },
  { id: 2, name: 'Malaria Treatment', usage_count: 120 },
  { id: 3, name: 'RTI Management', usage_count: 95 },
];

const mockClonedTemplate = {
  id: 10,
  name: 'Malaria Treatment Protocol (Copy)',
  is_system: false,
  created_by: 5,
  department: 'Internal Medicine',
};

// ====================
// Test Setup
// ====================
beforeEach(() => {
  jest.clearAllMocks();
});

// ====================
// Tests: loadPatientTimeline
// ====================
describe('loadPatientTimeline', () => {
  test('should fetch timeline data from correct endpoint', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    // This function will be added to app.js
    const { loadPatientTimeline } = require('../src/renderer/app-integrations');

    await loadPatientTimeline(123);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/patients/123/encounter-timeline/'
    );
  });

  test('should pass date filters to API', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    const { loadPatientTimeline } = require('../src/renderer/app-integrations');

    await loadPatientTimeline(123, {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/patients/123/encounter-timeline/?start_date=2025-01-01&end_date=2025-12-31'
    );
  });

  test('should pass type filters to API', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    const { loadPatientTimeline } = require('../src/renderer/app-integrations');

    await loadPatientTimeline(123, {
      types: ['OPD', 'EMERGENCY'],
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/patients/123/encounter-timeline/?type=OPD,EMERGENCY'
    );
  });

  test('should return encounters and statistics on success', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    const { loadPatientTimeline } = require('../src/renderer/app-integrations');
    const result = await loadPatientTimeline(123);

    expect(result.success).toBe(true);
    expect(result.encounters).toHaveLength(2);
    expect(result.statistics.total_encounters).toBe(2);
  });

  test('should return error on API failure', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: false,
      error: 'Not found',
    });

    const { loadPatientTimeline } = require('../src/renderer/app-integrations');
    const result = await loadPatientTimeline(999);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ====================
// Tests: suggestTemplatesForDiagnosis
// ====================
describe('suggestTemplatesForDiagnosis', () => {
  test('should call suggest endpoint with diagnosis code', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockSuggestedTemplates },
    });

    const { suggestTemplatesForDiagnosis } = require('../src/renderer/app-integrations');
    await suggestTemplatesForDiagnosis('B50.9');

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/treatment-templates/suggest/?diagnosis=B50.9'
    );
  });

  test('should return array of suggested templates', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockSuggestedTemplates },
    });

    const { suggestTemplatesForDiagnosis } = require('../src/renderer/app-integrations');
    const result = await suggestTemplatesForDiagnosis('B50.9');

    expect(result.success).toBe(true);
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0].name).toBe('Malaria Treatment Protocol');
  });

  test('should return empty array when no suggestions found', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: [] },
    });

    const { suggestTemplatesForDiagnosis } = require('../src/renderer/app-integrations');
    const result = await suggestTemplatesForDiagnosis('Z99.9');

    expect(result.success).toBe(true);
    expect(result.templates).toHaveLength(0);
  });

  test('should handle API errors gracefully', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: false,
      error: 'Server error',
    });

    const { suggestTemplatesForDiagnosis } = require('../src/renderer/app-integrations');
    const result = await suggestTemplatesForDiagnosis('B50.9');

    expect(result.success).toBe(false);
    expect(result.templates).toEqual([]);
  });

  test('should not call API for empty diagnosis code', async () => {
    const { suggestTemplatesForDiagnosis } = require('../src/renderer/app-integrations');
    const result = await suggestTemplatesForDiagnosis('');

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(result.templates).toEqual([]);
  });
});

// ====================
// Tests: loadPopularTemplates
// ====================
describe('loadPopularTemplates', () => {
  test('should call popular endpoint with default limit', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockPopularTemplates },
    });

    const { loadPopularTemplates } = require('../src/renderer/app-integrations');
    await loadPopularTemplates();

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/clinical-templates/popular/?limit=10'
    );
  });

  test('should call popular endpoint with custom limit', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockPopularTemplates },
    });

    const { loadPopularTemplates } = require('../src/renderer/app-integrations');
    await loadPopularTemplates(5);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/clinical-templates/popular/?limit=5'
    );
  });

  test('should return sorted templates by usage count', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockPopularTemplates },
    });

    const { loadPopularTemplates } = require('../src/renderer/app-integrations');
    const result = await loadPopularTemplates();

    expect(result.success).toBe(true);
    expect(result.templates[0].usage_count).toBe(150);
  });
});

// ====================
// Tests: cloneTemplate
// ====================
describe('cloneTemplate', () => {
  test('should call clone endpoint with template ID', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockClonedTemplate,
    });

    const { cloneTemplate } = require('../src/renderer/app-integrations');
    await cloneTemplate(1);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/clinical-templates/1/clone/'
    );
  });

  test('should return cloned template with new ID', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockClonedTemplate,
    });

    const { cloneTemplate } = require('../src/renderer/app-integrations');
    const result = await cloneTemplate(1);

    expect(result.success).toBe(true);
    expect(result.template.id).toBe(10);
    expect(result.template.is_system).toBe(false);
  });

  test('should handle clone failure', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: false,
      error: 'Cannot clone template',
    });

    const { cloneTemplate } = require('../src/renderer/app-integrations');
    const result = await cloneTemplate(999);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ====================
// Tests: applyTemplateToEncounter
// ====================
describe('applyTemplateToEncounter', () => {
  test('should call apply endpoint with template and encounter IDs', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { detail: 'Template applied successfully', usage_count: 151 },
    });

    const { applyTemplateToEncounter } = require('../src/renderer/app-integrations');
    await applyTemplateToEncounter(1, 100);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'POST',
      '/api/clinical-templates/1/apply/',
      { encounter_id: 100 }
    );
  });

  test('should return updated usage count on success', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { detail: 'Template applied successfully', usage_count: 151 },
    });

    const { applyTemplateToEncounter } = require('../src/renderer/app-integrations');
    const result = await applyTemplateToEncounter(1, 100);

    expect(result.success).toBe(true);
    expect(result.usage_count).toBe(151);
  });
});

// ====================
// Tests: Template suggestions on diagnosis add
// ====================
describe('onDiagnosisAdded', () => {
  test('should suggest templates when diagnosis is added', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: { results: mockSuggestedTemplates },
    });

    const { onDiagnosisAdded } = require('../src/renderer/app-integrations');
    const suggestions = await onDiagnosisAdded({
      code: 'B50.9',
      description: 'Plasmodium falciparum malaria',
    });

    expect(suggestions).toHaveLength(2);
  });

  test('should not suggest templates for non-principal diagnosis', async () => {
    const { onDiagnosisAdded } = require('../src/renderer/app-integrations');
    const suggestions = await onDiagnosisAdded({
      code: 'B50.9',
      description: 'Plasmodium falciparum malaria',
      is_principal: false,
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
    expect(suggestions).toEqual([]);
  });
});

// ====================
// Tests: renderTimelineInModal
// ====================
describe('renderTimelineInModal', () => {
  // Mock DOM elements
  let mockTimelineSection;
  let mockTimelineContent;
  let mockApplyFilterBtn;

  beforeEach(() => {
    mockTimelineSection = { style: { display: 'none' } };
    mockTimelineContent = { innerHTML: '' };
    mockApplyFilterBtn = { addEventListener: jest.fn() };

    global.document = {
      getElementById: jest.fn((id) => {
        if (id === 'patient-timeline-section') return mockTimelineSection;
        if (id === 'timeline-content') return mockTimelineContent;
        if (id === 'apply-timeline-filters') return mockApplyFilterBtn;
        return null;
      }),
    };
  });

  test('should show timeline section when called', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    const { renderTimelineInModal } = require('../src/renderer/app-integrations');
    await renderTimelineInModal(123);

    expect(mockTimelineSection.style.display).toBe('block');
  });

  test('should populate timeline content with HTML', async () => {
    mockApiRequest.mockResolvedValueOnce({
      success: true,
      data: mockTimelineData,
    });

    const { renderTimelineInModal } = require('../src/renderer/app-integrations');
    await renderTimelineInModal(123);

    expect(mockTimelineContent.innerHTML).toContain('encounter');
  });

  test('should show loading state initially', async () => {
    // Mock a delayed response
    mockApiRequest.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve({
      success: true,
      data: mockTimelineData,
    }), 100)));

    const { renderTimelineInModal } = require('../src/renderer/app-integrations');
    const promise = renderTimelineInModal(123);

    expect(mockTimelineContent.innerHTML).toContain('Loading');

    await promise;
  });
});

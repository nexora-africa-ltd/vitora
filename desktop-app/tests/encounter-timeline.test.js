/**
 * Unit Tests for Encounter Timeline View (Sprint 1.1-1.2)
 *
 * TDD approach: Tests written BEFORE implementation (Red phase).
 * Tests should FAIL initially, then pass after implementation (Green phase).
 *
 * Functions under test (to be implemented in src/renderer/encounter-timeline.js):
 * - fetchEncounterTimeline(patientId, filters)
 * - formatEncounterCard(encounter)
 * - sortEncounters(encounters, order)
 * - filterByDateRange(encounters, startDate, endDate)
 * - filterByType(encounters, types)
 * - calculateStatistics(encounters)
 * - groupEncountersByMonth(encounters)
 * - toggleEncounterExpand(encounterId)
 * - getExpandedEncounters()
 * - buildTimelineHTML(encounters, statistics)
 */

// Import functions from the encounter-timeline module (to be created)
const timeline = require('../src/renderer/encounter-timeline');

// Mock window.electronAPI for API calls
const mockApiRequest = jest.fn();
global.window = {
  electronAPI: {
    apiRequest: mockApiRequest,
  },
};

// ====================
// Test Data
// ====================
const mockEncounters = [
  {
    id: 1,
    encounter_type: 'OPD',
    encounter_date: '2025-12-28T10:00:00Z',
    chief_complaint: 'Headache and fever',
    temperature: 38.2,
    pulse: 88,
    blood_pressure: '130/85',
    spo2: 97,
    diagnoses: [
      { code: 'J06.9', description: 'Acute upper respiratory infection', is_principal: true }
    ],
    clinician_name: 'Dr. Smith',
    has_critical_vitals: false,
  },
  {
    id: 2,
    encounter_type: 'EMERGENCY',
    encounter_date: '2025-12-15T14:30:00Z',
    chief_complaint: 'Chest pain',
    temperature: 37.0,
    pulse: 110,
    blood_pressure: '150/95',
    spo2: 94,
    diagnoses: [
      { code: 'I20.9', description: 'Angina pectoris', is_principal: true }
    ],
    clinician_name: 'Dr. Jones',
    has_critical_vitals: true,
  },
  {
    id: 3,
    encounter_type: 'OPD',
    encounter_date: '2025-11-20T09:00:00Z',
    chief_complaint: 'Follow-up for diabetes',
    temperature: 36.8,
    pulse: 72,
    blood_pressure: '125/80',
    spo2: 98,
    diagnoses: [
      { code: 'E11.9', description: 'Type 2 diabetes mellitus', is_principal: true }
    ],
    clinician_name: 'Dr. Smith',
    has_critical_vitals: false,
  },
  {
    id: 4,
    encounter_type: 'INPATIENT',
    encounter_date: '2025-10-05T16:00:00Z',
    chief_complaint: 'Pneumonia admission',
    temperature: 39.1,
    pulse: 95,
    blood_pressure: '110/70',
    spo2: 91,
    diagnoses: [
      { code: 'J18.9', description: 'Pneumonia', is_principal: true },
      { code: 'J96.0', description: 'Acute respiratory failure', is_principal: false }
    ],
    clinician_name: 'Dr. Williams',
    has_critical_vitals: true,
  },
];

// ====================
// Test Setup
// ====================
beforeEach(() => {
  jest.clearAllMocks();
  timeline.clearExpandedEncounters();
});

// ====================
// Tests: fetchEncounterTimeline
// ====================
describe('fetchEncounterTimeline', () => {
  test('should call API with patient ID', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: [], statistics: {} },
    });

    await timeline.fetchEncounterTimeline(123);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/api/patients/123/encounter-timeline/')
    );
  });

  test('should include date filters in API call', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: [], statistics: {} },
    });

    await timeline.fetchEncounterTimeline(123, {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('start_date=2025-01-01')
    );
    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('end_date=2025-12-31')
    );
  });

  test('should include type filter in API call', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: [], statistics: {} },
    });

    await timeline.fetchEncounterTimeline(123, {
      types: ['OPD', 'EMERGENCY'],
    });

    // URL encoding converts comma to %2C
    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      expect.stringMatching(/type=OPD(%2C|,)EMERGENCY/)
    );
  });

  test('should return encounters and statistics on success', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: {
        encounters: mockEncounters,
        statistics: { total: 4 },
      },
    });

    const result = await timeline.fetchEncounterTimeline(123);

    expect(result.encounters).toEqual(mockEncounters);
    expect(result.statistics.total).toBe(4);
  });

  test('should return empty data on API failure', async () => {
    mockApiRequest.mockResolvedValue({
      success: false,
      error: 'Not found',
    });

    const result = await timeline.fetchEncounterTimeline(123);

    expect(result.encounters).toEqual([]);
    expect(result.statistics).toEqual({});
  });

  test('should return empty data on API exception', async () => {
    mockApiRequest.mockRejectedValue(new Error('Network error'));

    const result = await timeline.fetchEncounterTimeline(123);

    expect(result.encounters).toEqual([]);
    expect(result.statistics).toEqual({});
  });

  test('should include pagination parameters', async () => {
    mockApiRequest.mockResolvedValue({
      success: true,
      data: { encounters: [], statistics: {} },
    });

    await timeline.fetchEncounterTimeline(123, { page: 2, pageSize: 10 });

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

// ====================
// Tests: formatEncounterCard
// ====================
describe('formatEncounterCard', () => {
  test('should format encounter date as readable string', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[0]);

    expect(formatted.formattedDate).toBe('Dec 28, 2025');
  });

  test('should format encounter time', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[0]);

    // Time format should be HH:MM AM/PM
    expect(formatted.formattedTime).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  test('should include encounter type with label', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[0]);

    expect(formatted.typeLabel).toBe('Outpatient');
  });

  test('should map EMERGENCY type correctly', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[1]);

    expect(formatted.typeLabel).toBe('Emergency');
  });

  test('should map INPATIENT type correctly', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[3]);

    expect(formatted.typeLabel).toBe('Inpatient');
  });

  test('should include principal diagnosis', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[0]);

    expect(formatted.principalDiagnosis).toBe('Acute upper respiratory infection');
  });

  test('should handle encounter with no diagnoses', () => {
    const encounter = { ...mockEncounters[0], diagnoses: [] };
    const formatted = timeline.formatEncounterCard(encounter);

    expect(formatted.principalDiagnosis).toBe('No diagnosis recorded');
  });

  test('should include diagnosis count', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[3]);

    expect(formatted.diagnosisCount).toBe(2);
  });

  test('should include vitals summary', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[0]);

    expect(formatted.vitalsSummary).toContain('38.2°C');
    expect(formatted.vitalsSummary).toContain('88 bpm');
    expect(formatted.vitalsSummary).toContain('130/85');
  });

  test('should flag critical encounters', () => {
    const formatted = timeline.formatEncounterCard(mockEncounters[1]);

    expect(formatted.isCritical).toBe(true);
  });

  test('should handle null encounter', () => {
    const formatted = timeline.formatEncounterCard(null);

    expect(formatted).toBeNull();
  });
});

// ====================
// Tests: sortEncounters
// ====================
describe('sortEncounters', () => {
  test('should sort by date descending (newest first) by default', () => {
    const sorted = timeline.sortEncounters([...mockEncounters]);

    expect(sorted[0].id).toBe(1); // Dec 28
    expect(sorted[1].id).toBe(2); // Dec 15
    expect(sorted[2].id).toBe(3); // Nov 20
    expect(sorted[3].id).toBe(4); // Oct 5
  });

  test('should sort by date ascending (oldest first)', () => {
    const sorted = timeline.sortEncounters([...mockEncounters], 'asc');

    expect(sorted[0].id).toBe(4); // Oct 5
    expect(sorted[3].id).toBe(1); // Dec 28
  });

  test('should handle empty array', () => {
    const sorted = timeline.sortEncounters([]);

    expect(sorted).toEqual([]);
  });

  test('should not modify original array', () => {
    const original = [...mockEncounters];
    timeline.sortEncounters(original);

    expect(original[0].id).toBe(mockEncounters[0].id);
  });
});

// ====================
// Tests: filterByDateRange
// ====================
describe('filterByDateRange', () => {
  test('should filter encounters within date range', () => {
    const filtered = timeline.filterByDateRange(
      mockEncounters,
      '2025-12-01',
      '2025-12-31'
    );

    expect(filtered.length).toBe(2); // Dec 28 and Dec 15
  });

  test('should include encounters on start date', () => {
    // Use a date range that includes the encounter
    const filtered = timeline.filterByDateRange(
      mockEncounters,
      '2025-12-27',
      '2025-12-31'
    );

    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.some(e => e.id === 1)).toBe(true);
  });

  test('should include encounters on end date', () => {
    // Use a range that captures the Dec 15 encounter
    const filtered = timeline.filterByDateRange(
      mockEncounters,
      '2025-12-14',
      '2025-12-16'
    );

    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.some(e => e.id === 2)).toBe(true);
  });

  test('should return all if no date range provided', () => {
    const filtered = timeline.filterByDateRange(mockEncounters, null, null);

    expect(filtered.length).toBe(4);
  });

  test('should filter with only start date', () => {
    const filtered = timeline.filterByDateRange(mockEncounters, '2025-11-01', null);

    expect(filtered.length).toBe(3); // Nov 20, Dec 15, Dec 28
  });

  test('should filter with only end date', () => {
    const filtered = timeline.filterByDateRange(mockEncounters, null, '2025-11-30');

    expect(filtered.length).toBe(2); // Oct 5, Nov 20
  });

  test('should handle empty array', () => {
    const filtered = timeline.filterByDateRange([], '2025-01-01', '2025-12-31');

    expect(filtered).toEqual([]);
  });
});

// ====================
// Tests: filterByType
// ====================
describe('filterByType', () => {
  test('should filter by single type', () => {
    const filtered = timeline.filterByType(mockEncounters, ['OPD']);

    expect(filtered.length).toBe(2);
    expect(filtered.every(e => e.encounter_type === 'OPD')).toBe(true);
  });

  test('should filter by multiple types', () => {
    const filtered = timeline.filterByType(mockEncounters, ['OPD', 'EMERGENCY']);

    expect(filtered.length).toBe(3);
  });

  test('should return all if no types specified', () => {
    const filtered = timeline.filterByType(mockEncounters, []);

    expect(filtered.length).toBe(4);
  });

  test('should return all if types is null', () => {
    const filtered = timeline.filterByType(mockEncounters, null);

    expect(filtered.length).toBe(4);
  });

  test('should handle non-matching type', () => {
    const filtered = timeline.filterByType(mockEncounters, ['UNKNOWN']);

    expect(filtered.length).toBe(0);
  });

  test('should be case-insensitive', () => {
    const filtered = timeline.filterByType(mockEncounters, ['opd']);

    expect(filtered.length).toBe(2);
  });
});

// ====================
// Tests: calculateStatistics
// ====================
describe('calculateStatistics', () => {
  test('should calculate total encounters', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.total).toBe(4);
  });

  test('should count encounters by type', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.byType.OPD).toBe(2);
    expect(stats.byType.EMERGENCY).toBe(1);
    expect(stats.byType.INPATIENT).toBe(1);
  });

  test('should count critical encounters', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.criticalCount).toBe(2);
  });

  test('should find most common diagnosis', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.commonDiagnoses).toBeDefined();
    expect(Array.isArray(stats.commonDiagnoses)).toBe(true);
  });

  test('should calculate date range', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.firstEncounter).toBe('2025-10-05');
    expect(stats.lastEncounter).toBe('2025-12-28');
  });

  test('should handle empty encounters', () => {
    const stats = timeline.calculateStatistics([]);

    expect(stats.total).toBe(0);
    expect(stats.byType).toEqual({});
    expect(stats.criticalCount).toBe(0);
  });

  test('should count unique clinicians', () => {
    const stats = timeline.calculateStatistics(mockEncounters);

    expect(stats.uniqueClinicians).toBe(3); // Smith, Jones, Williams
  });
});

// ====================
// Tests: groupEncountersByMonth
// ====================
describe('groupEncountersByMonth', () => {
  test('should group encounters by month', () => {
    const grouped = timeline.groupEncountersByMonth(mockEncounters);

    expect(grouped['2025-12']).toBeDefined();
    expect(grouped['2025-12'].encounters.length).toBe(2);
  });

  test('should format month keys correctly', () => {
    const grouped = timeline.groupEncountersByMonth(mockEncounters);
    const keys = Object.keys(grouped);

    expect(keys).toContain('2025-12');
    expect(keys).toContain('2025-11');
    expect(keys).toContain('2025-10');
  });

  test('should include month label', () => {
    const grouped = timeline.groupEncountersByMonth(mockEncounters);

    expect(grouped['2025-12'].label).toBe('December 2025');
  });

  test('should handle empty array', () => {
    const grouped = timeline.groupEncountersByMonth([]);

    expect(Object.keys(grouped).length).toBe(0);
  });

  test('should maintain encounter order within month', () => {
    const sorted = timeline.sortEncounters([...mockEncounters], 'desc');
    const grouped = timeline.groupEncountersByMonth(sorted);

    // Dec 28 should come before Dec 15 within December group
    expect(grouped['2025-12'].encounters[0].id).toBe(1);
    expect(grouped['2025-12'].encounters[1].id).toBe(2);
  });
});

// ====================
// Tests: toggleEncounterExpand
// ====================
describe('toggleEncounterExpand', () => {
  test('should expand collapsed encounter', () => {
    timeline.toggleEncounterExpand(1);

    const expanded = timeline.getExpandedEncounters();
    expect(expanded).toContain(1);
  });

  test('should collapse expanded encounter', () => {
    timeline.toggleEncounterExpand(1);
    timeline.toggleEncounterExpand(1);

    const expanded = timeline.getExpandedEncounters();
    expect(expanded).not.toContain(1);
  });

  test('should handle multiple expanded encounters', () => {
    timeline.toggleEncounterExpand(1);
    timeline.toggleEncounterExpand(2);
    timeline.toggleEncounterExpand(3);

    const expanded = timeline.getExpandedEncounters();
    expect(expanded.length).toBe(3);
  });

  test('should return current expansion state', () => {
    const result = timeline.toggleEncounterExpand(1);

    expect(result).toBe(true); // Now expanded
  });

  test('should return false when collapsing', () => {
    timeline.toggleEncounterExpand(1);
    const result = timeline.toggleEncounterExpand(1);

    expect(result).toBe(false); // Now collapsed
  });
});

// ====================
// Tests: clearExpandedEncounters
// ====================
describe('clearExpandedEncounters', () => {
  test('should clear all expanded encounters', () => {
    timeline.toggleEncounterExpand(1);
    timeline.toggleEncounterExpand(2);

    timeline.clearExpandedEncounters();

    expect(timeline.getExpandedEncounters()).toEqual([]);
  });
});

// ====================
// Tests: isEncounterExpanded
// ====================
describe('isEncounterExpanded', () => {
  test('should return true for expanded encounter', () => {
    timeline.toggleEncounterExpand(1);

    expect(timeline.isEncounterExpanded(1)).toBe(true);
  });

  test('should return false for collapsed encounter', () => {
    expect(timeline.isEncounterExpanded(1)).toBe(false);
  });
});

// ====================
// Tests: ENCOUNTER_TYPE_LABELS constant
// ====================
describe('ENCOUNTER_TYPE_LABELS', () => {
  test('should export encounter type labels', () => {
    expect(timeline.ENCOUNTER_TYPE_LABELS).toBeDefined();
  });

  test('should have labels for all types', () => {
    expect(timeline.ENCOUNTER_TYPE_LABELS.OPD).toBe('Outpatient');
    expect(timeline.ENCOUNTER_TYPE_LABELS.EMERGENCY).toBe('Emergency');
    expect(timeline.ENCOUNTER_TYPE_LABELS.INPATIENT).toBe('Inpatient');
  });
});

// ====================
// Tests: formatRelativeTime
// ====================
describe('formatRelativeTime', () => {
  // Mock current date
  const mockNow = new Date('2025-12-30T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should format today', () => {
    const result = timeline.formatRelativeTime('2025-12-30T10:00:00Z');

    expect(result).toBe('Today');
  });

  test('should format yesterday', () => {
    const result = timeline.formatRelativeTime('2025-12-29T10:00:00Z');

    expect(result).toBe('Yesterday');
  });

  test('should format days ago', () => {
    const result = timeline.formatRelativeTime('2025-12-28T10:00:00Z');

    expect(result).toBe('2 days ago');
  });

  test('should format weeks ago', () => {
    const result = timeline.formatRelativeTime('2025-12-15T10:00:00Z');

    expect(result).toBe('2 weeks ago');
  });

  test('should format months ago', () => {
    const result = timeline.formatRelativeTime('2025-10-30T10:00:00Z');

    expect(result).toBe('2 months ago');
  });

  test('should handle null date', () => {
    const result = timeline.formatRelativeTime(null);

    expect(result).toBe('');
  });
});

// ====================
// Tests: buildTimelineHTML (structure only)
// ====================
describe('buildTimelineHTML', () => {
  test('should return HTML string', () => {
    const html = timeline.buildTimelineHTML(mockEncounters, { total: 4 });

    expect(typeof html).toBe('string');
  });

  test('should include statistics section', () => {
    const html = timeline.buildTimelineHTML(mockEncounters, { total: 4 });

    expect(html).toContain('timeline-statistics');
  });

  test('should include encounter cards', () => {
    const html = timeline.buildTimelineHTML(mockEncounters, { total: 4 });

    expect(html).toContain('timeline-encounter-card');
  });

  test('should handle empty encounters', () => {
    const html = timeline.buildTimelineHTML([], { total: 0 });

    expect(html).toContain('No encounters found');
  });

  test('should mark critical encounters', () => {
    const html = timeline.buildTimelineHTML(mockEncounters, { total: 4 });

    expect(html).toContain('critical');
  });

  test('should include timeline connector', () => {
    const html = timeline.buildTimelineHTML(mockEncounters, { total: 4 });

    expect(html).toContain('timeline-connector');
  });
});

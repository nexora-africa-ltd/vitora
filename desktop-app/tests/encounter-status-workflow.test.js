/**
 * Tests for Encounter Status Workflow in Desktop App
 *
 * Sprint 1.1-1.2: Encounter Status Workflow UI
 *
 * Tests cover:
 * - Status badge display
 * - Status action buttons
 * - Status filtering
 * - API integration
 */

const {
  ENCOUNTER_STATUS_LABELS,
  ENCOUNTER_STATUSES,
  formatEncounterCard,
  filterByStatus,
  getStatusLabel,
  canEditEncounter,
  buildTimelineHTML,
  buildStatusFilterHTML,
  clearExpandedEncounters,
} = require('../src/renderer/encounter-timeline');

// ====================
// Test Data
// ====================

const mockEncounterDraft = {
  id: 1,
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2025-12-30T10:00:00Z',
  chief_complaint: 'Headache and fever',
  status: 'DRAFT',
  temperature: 38.5,
  pulse: 90,
  blood_pressure: '120/80',
  spo2: 98,
  has_critical_vitals: false,
  diagnoses: [],
};

const mockEncounterInProgress = {
  id: 2,
  patient: 1,
  encounter_type: 'EMERGENCY',
  encounter_date: '2025-12-29T14:30:00Z',
  chief_complaint: 'Chest pain',
  status: 'IN_PROGRESS',
  temperature: 37.2,
  pulse: 110,
  blood_pressure: '140/95',
  spo2: 94,
  has_critical_vitals: true,
  diagnoses: [{ description: 'Angina', is_principal: true }],
};

const mockEncounterCompleted = {
  id: 3,
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2025-12-28T09:00:00Z',
  chief_complaint: 'Follow-up visit',
  status: 'COMPLETED',
  finalized_at: '2025-12-28T10:30:00Z',
  finalized_by: 5,
  finalized_by_username: 'dr.smith',
  temperature: 36.8,
  has_critical_vitals: false,
  diagnoses: [{ description: 'Hypertension', is_principal: true }],
};

const mockEncounterCancelled = {
  id: 4,
  patient: 1,
  encounter_type: 'OPD',
  encounter_date: '2025-12-27T11:00:00Z',
  chief_complaint: 'Routine checkup',
  status: 'CANCELLED',
  cancellation_reason: 'Patient did not show up',
  has_critical_vitals: false,
  diagnoses: [],
};

// ====================
// Test Suites
// ====================

describe('Encounter Status Constants', () => {
  test('ENCOUNTER_STATUS_LABELS contains all statuses', () => {
    expect(ENCOUNTER_STATUS_LABELS.DRAFT).toBe('Draft');
    expect(ENCOUNTER_STATUS_LABELS.IN_PROGRESS).toBe('In Progress');
    expect(ENCOUNTER_STATUS_LABELS.COMPLETED).toBe('Completed');
    expect(ENCOUNTER_STATUS_LABELS.CANCELLED).toBe('Cancelled');
  });

  test('ENCOUNTER_STATUSES array contains all valid statuses', () => {
    expect(ENCOUNTER_STATUSES).toContain('DRAFT');
    expect(ENCOUNTER_STATUSES).toContain('IN_PROGRESS');
    expect(ENCOUNTER_STATUSES).toContain('COMPLETED');
    expect(ENCOUNTER_STATUSES).toContain('CANCELLED');
    expect(ENCOUNTER_STATUSES.length).toBe(4);
  });
});

describe('getStatusLabel', () => {
  test('returns correct label for DRAFT', () => {
    expect(getStatusLabel('DRAFT')).toBe('Draft');
  });

  test('returns correct label for IN_PROGRESS', () => {
    expect(getStatusLabel('IN_PROGRESS')).toBe('In Progress');
  });

  test('returns correct label for COMPLETED', () => {
    expect(getStatusLabel('COMPLETED')).toBe('Completed');
  });

  test('returns correct label for CANCELLED', () => {
    expect(getStatusLabel('CANCELLED')).toBe('Cancelled');
  });

  test('returns raw status for unknown status', () => {
    expect(getStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('canEditEncounter', () => {
  test('returns true for DRAFT status', () => {
    expect(canEditEncounter('DRAFT')).toBe(true);
  });

  test('returns true for IN_PROGRESS status', () => {
    expect(canEditEncounter('IN_PROGRESS')).toBe(true);
  });

  test('returns false for COMPLETED status', () => {
    expect(canEditEncounter('COMPLETED')).toBe(false);
  });

  test('returns false for CANCELLED status', () => {
    expect(canEditEncounter('CANCELLED')).toBe(false);
  });
});

describe('formatEncounterCard with status', () => {
  beforeEach(() => {
    clearExpandedEncounters();
  });

  test('formats draft encounter with status info', () => {
    const formatted = formatEncounterCard(mockEncounterDraft);

    expect(formatted.status).toBe('DRAFT');
    expect(formatted.statusLabel).toBe('Draft');
    expect(formatted.isEditable).toBe(true);
  });

  test('formats in-progress encounter with status info', () => {
    const formatted = formatEncounterCard(mockEncounterInProgress);

    expect(formatted.status).toBe('IN_PROGRESS');
    expect(formatted.statusLabel).toBe('In Progress');
    expect(formatted.isEditable).toBe(true);
  });

  test('formats completed encounter with status info', () => {
    const formatted = formatEncounterCard(mockEncounterCompleted);

    expect(formatted.status).toBe('COMPLETED');
    expect(formatted.statusLabel).toBe('Completed');
    expect(formatted.isEditable).toBe(false);
  });

  test('formats cancelled encounter with status info', () => {
    const formatted = formatEncounterCard(mockEncounterCancelled);

    expect(formatted.status).toBe('CANCELLED');
    expect(formatted.statusLabel).toBe('Cancelled');
    expect(formatted.isEditable).toBe(false);
  });

  test('defaults to DRAFT for encounters without status', () => {
    const encounterWithoutStatus = { ...mockEncounterDraft };
    delete encounterWithoutStatus.status;

    const formatted = formatEncounterCard(encounterWithoutStatus);

    expect(formatted.status).toBe('DRAFT');
    expect(formatted.statusLabel).toBe('Draft');
    expect(formatted.isEditable).toBe(true);
  });
});

describe('filterByStatus', () => {
  const encounters = [
    mockEncounterDraft,
    mockEncounterInProgress,
    mockEncounterCompleted,
    mockEncounterCancelled,
  ];

  test('returns all encounters when no statuses specified', () => {
    const filtered = filterByStatus(encounters, []);
    expect(filtered.length).toBe(4);
  });

  test('filters by single status - DRAFT', () => {
    const filtered = filterByStatus(encounters, ['DRAFT']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].status).toBe('DRAFT');
  });

  test('filters by single status - COMPLETED', () => {
    const filtered = filterByStatus(encounters, ['COMPLETED']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].status).toBe('COMPLETED');
  });

  test('filters by multiple statuses', () => {
    const filtered = filterByStatus(encounters, ['DRAFT', 'IN_PROGRESS']);
    expect(filtered.length).toBe(2);
    expect(filtered.every(e => ['DRAFT', 'IN_PROGRESS'].includes(e.status))).toBe(true);
  });

  test('handles lowercase status filters', () => {
    const filtered = filterByStatus(encounters, ['draft', 'completed']);
    expect(filtered.length).toBe(2);
  });

  test('returns empty array for empty encounters', () => {
    const filtered = filterByStatus([], ['DRAFT']);
    expect(filtered).toEqual([]);
  });

  test('handles encounters without status field', () => {
    const encountersNoStatus = [{ ...mockEncounterDraft }];
    delete encountersNoStatus[0].status;

    const filtered = filterByStatus(encountersNoStatus, ['DRAFT']);
    expect(filtered.length).toBe(1); // Should default to DRAFT
  });
});

describe('buildTimelineHTML with status', () => {
  beforeEach(() => {
    clearExpandedEncounters();
  });

  test('includes status badge in encounter cards', () => {
    const encounters = [mockEncounterDraft];
    const statistics = { total: 1, criticalCount: 0, uniqueClinicians: 1 };

    const html = buildTimelineHTML(encounters, statistics);

    expect(html).toContain('encounter-status');
    expect(html).toContain('DRAFT');
    expect(html).toContain('Draft');
  });

  test('includes data-status attribute on cards', () => {
    const encounters = [mockEncounterInProgress];
    const statistics = { total: 1, criticalCount: 1, uniqueClinicians: 1 };

    const html = buildTimelineHTML(encounters, statistics);

    expect(html).toContain('data-status="IN_PROGRESS"');
  });

  test('applies status-specific CSS class', () => {
    const encounters = [mockEncounterCompleted];
    const statistics = { total: 1, criticalCount: 0, uniqueClinicians: 1 };

    const html = buildTimelineHTML(encounters, statistics);

    expect(html).toContain('status-completed');
  });

  test('renders empty state when no encounters', () => {
    const html = buildTimelineHTML([], {});

    expect(html).toContain('No encounters found');
  });
});

describe('buildStatusFilterHTML', () => {
  test('builds filter buttons for all statuses', () => {
    const html = buildStatusFilterHTML([]);

    expect(html).toContain('status-filter');
    expect(html).toContain('data-status="ALL"');
    expect(html).toContain('data-status="DRAFT"');
    expect(html).toContain('data-status="IN_PROGRESS"');
    expect(html).toContain('data-status="COMPLETED"');
    expect(html).toContain('data-status="CANCELLED"');
  });

  test('marks active filters', () => {
    const html = buildStatusFilterHTML(['DRAFT', 'IN_PROGRESS']);

    // Check that DRAFT and IN_PROGRESS buttons have active class
    expect(html).toContain('class="status-filter-btn active" data-status="DRAFT"');
    expect(html).toContain('class="status-filter-btn active" data-status="IN_PROGRESS"');
  });

  test('marks ALL as active when no filters', () => {
    const html = buildStatusFilterHTML([]);

    expect(html).toContain('class="status-filter-btn active" data-status="ALL"');
  });

  test('displays human-readable labels', () => {
    const html = buildStatusFilterHTML([]);

    expect(html).toContain('>Draft<');
    expect(html).toContain('>In Progress<');
    expect(html).toContain('>Completed<');
    expect(html).toContain('>Cancelled<');
    expect(html).toContain('>All<');
  });
});

// ====================
// Integration Tests for app.js functions
// ====================

describe('App.js Status Workflow Functions', () => {
  // These tests would need the app.js functions to be exported
  // For now, we test the timeline module which is the primary UI component

  describe('Status badge rendering', () => {
    test('DRAFT status shows warning/yellow styling indicator', () => {
      const html = buildTimelineHTML([mockEncounterDraft], { total: 1 });
      expect(html).toContain('encounter-status DRAFT');
    });

    test('IN_PROGRESS status shows blue styling indicator', () => {
      const html = buildTimelineHTML([mockEncounterInProgress], { total: 1 });
      expect(html).toContain('encounter-status IN_PROGRESS');
    });

    test('COMPLETED status shows green styling indicator', () => {
      const html = buildTimelineHTML([mockEncounterCompleted], { total: 1 });
      expect(html).toContain('encounter-status COMPLETED');
    });

    test('CANCELLED status shows grey styling indicator', () => {
      const html = buildTimelineHTML([mockEncounterCancelled], { total: 1 });
      expect(html).toContain('encounter-status CANCELLED');
    });
  });
});

// ====================
// Edge Cases
// ====================

describe('Edge Cases', () => {
  test('handles null encounter in formatEncounterCard', () => {
    const result = formatEncounterCard(null);
    expect(result).toBeNull();
  });

  test('handles undefined status gracefully', () => {
    const encounter = { ...mockEncounterDraft, status: undefined };
    const formatted = formatEncounterCard(encounter);
    expect(formatted.status).toBe('DRAFT'); // Should default
  });

  test('filterByStatus handles null encounters array', () => {
    const filtered = filterByStatus(null, ['DRAFT']);
    expect(filtered).toEqual([]);
  });

  test('filterByStatus handles null statuses array', () => {
    const encounters = [mockEncounterDraft];
    const filtered = filterByStatus(encounters, null);
    expect(filtered.length).toBe(1);
  });
});

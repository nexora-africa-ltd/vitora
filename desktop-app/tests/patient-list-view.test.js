/**
 * Tests for Patient List View Toggle (List/Grid)
 *
 * Sprint 1.1-1.2: Patient List Display Enhancement
 *
 * Tests cover:
 * - View mode constants and state
 * - View toggle functionality
 * - List view HTML generation
 * - Grid view HTML generation
 * - View mode persistence (localStorage)
 * - Toggle button rendering
 */

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value; }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Import the module (we'll create this)
const {
  VIEW_MODES,
  PATIENT_VIEW_KEY,
  getCurrentViewMode,
  setViewMode,
  toggleViewMode,
  buildPatientListHTML,
  buildPatientGridHTML,
  buildPatientViewHTML,
  buildViewToggleHTML,
  formatPatientCard,
  formatPatientGridItem,
} = require('../src/renderer/patient-list-view');

// ====================
// Test Data
// ====================

const mockPatients = [
  {
    id: 1,
    full_name: 'John Doe',
    mrn: 'MRN-20251230-0001',
    age: 35,
    gender: 'M',
    date_of_birth: '1990-05-15',
    phone_number: '+254712345678',
    county_name: 'Nairobi',
  },
  {
    id: 2,
    full_name: 'Jane Smith',
    mrn: 'MRN-20251230-0002',
    age: 28,
    gender: 'F',
    date_of_birth: '1997-08-22',
    phone_number: '+254723456789',
    county_name: 'Mombasa',
  },
  {
    id: 3,
    full_name: 'Bob Wilson',
    mrn: 'MRN-20251230-0003',
    age: 45,
    gender: 'M',
    date_of_birth: '1980-01-10',
    phone_number: null,
    county_name: 'Kisumu',
  },
];

// ====================
// Test Suites
// ====================

describe('View Mode Constants', () => {
  test('VIEW_MODES contains LIST and GRID', () => {
    expect(VIEW_MODES.LIST).toBe('list');
    expect(VIEW_MODES.GRID).toBe('grid');
  });

  test('PATIENT_VIEW_KEY is defined for localStorage', () => {
    expect(PATIENT_VIEW_KEY).toBe('vitora_patient_view_mode');
  });
});

describe('getCurrentViewMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
  });

  test('returns LIST as default when no preference saved', () => {
    localStorageMock.getItem.mockReturnValue(null);
    expect(getCurrentViewMode()).toBe(VIEW_MODES.LIST);
  });

  test('returns saved preference from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('grid');
    expect(getCurrentViewMode()).toBe(VIEW_MODES.GRID);
  });

  test('returns LIST for invalid stored value', () => {
    localStorageMock.getItem.mockReturnValue('invalid');
    expect(getCurrentViewMode()).toBe(VIEW_MODES.LIST);
  });
});

describe('setViewMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem.mockClear();
  });

  test('saves LIST mode to localStorage', () => {
    setViewMode(VIEW_MODES.LIST);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_patient_view_mode', 'list');
  });

  test('saves GRID mode to localStorage', () => {
    setViewMode(VIEW_MODES.GRID);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_patient_view_mode', 'grid');
  });

  test('returns the set mode', () => {
    const result = setViewMode(VIEW_MODES.GRID);
    expect(result).toBe(VIEW_MODES.GRID);
  });

  test('ignores invalid mode and returns current mode', () => {
    localStorageMock.getItem.mockReturnValue('list');
    const result = setViewMode('invalid');
    expect(result).toBe(VIEW_MODES.LIST);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe('toggleViewMode', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.setItem.mockClear();
  });

  test('toggles from LIST to GRID', () => {
    localStorageMock.getItem.mockReturnValue('list');
    const result = toggleViewMode();
    expect(result).toBe(VIEW_MODES.GRID);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_patient_view_mode', 'grid');
  });

  test('toggles from GRID to LIST', () => {
    localStorageMock.getItem.mockReturnValue('grid');
    const result = toggleViewMode();
    expect(result).toBe(VIEW_MODES.LIST);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_patient_view_mode', 'list');
  });
});

describe('formatPatientCard (List View)', () => {
  test('formats patient with all fields', () => {
    const formatted = formatPatientCard(mockPatients[0]);

    expect(formatted.id).toBe(1);
    expect(formatted.fullName).toBe('John Doe');
    expect(formatted.mrn).toBe('MRN-20251230-0001');
    expect(formatted.age).toBe(35);
    expect(formatted.genderDisplay).toBe('Male');
    expect(formatted.phoneNumber).toBe('+254712345678');
    expect(formatted.county).toBe('Nairobi');
  });

  test('formats female gender correctly', () => {
    const formatted = formatPatientCard(mockPatients[1]);
    expect(formatted.genderDisplay).toBe('Female');
  });

  test('handles missing phone number', () => {
    const formatted = formatPatientCard(mockPatients[2]);
    expect(formatted.phoneNumber).toBeNull();
    expect(formatted.hasPhone).toBe(false);
  });

  test('handles patient with phone number', () => {
    const formatted = formatPatientCard(mockPatients[0]);
    expect(formatted.hasPhone).toBe(true);
  });

  test('returns null for null patient', () => {
    expect(formatPatientCard(null)).toBeNull();
  });
});

describe('formatPatientGridItem', () => {
  test('formats patient for grid display', () => {
    const formatted = formatPatientGridItem(mockPatients[0]);

    expect(formatted.id).toBe(1);
    expect(formatted.initials).toBe('JD');
    expect(formatted.fullName).toBe('John Doe');
    expect(formatted.mrn).toBe('MRN-20251230-0001');
    expect(formatted.ageSummary).toBe('35y, M');
  });

  test('generates correct initials for single name', () => {
    const patient = { ...mockPatients[0], full_name: 'Madonna' };
    const formatted = formatPatientGridItem(patient);
    expect(formatted.initials).toBe('M');
  });

  test('generates correct initials for three-part name', () => {
    const patient = { ...mockPatients[0], full_name: 'John Paul Doe' };
    const formatted = formatPatientGridItem(patient);
    expect(formatted.initials).toBe('JD'); // First and last
  });

  test('returns null for null patient', () => {
    expect(formatPatientGridItem(null)).toBeNull();
  });
});

describe('buildPatientListHTML', () => {
  test('generates list view HTML with patient cards', () => {
    const html = buildPatientListHTML(mockPatients);

    expect(html).toContain('patient-list-view');
    expect(html).toContain('patient-card');
    expect(html).toContain('John Doe');
    expect(html).toContain('Jane Smith');
    expect(html).toContain('MRN-20251230-0001');
  });

  test('includes patient actions (View Details, New Encounter)', () => {
    const html = buildPatientListHTML(mockPatients);

    expect(html).toContain('btn-view');
    expect(html).toContain('btn-encounter');
    expect(html).toContain('View Details');
    expect(html).toContain('New Encounter');
  });

  test('includes data-patient-id attributes', () => {
    const html = buildPatientListHTML(mockPatients);

    expect(html).toContain('data-patient-id="1"');
    expect(html).toContain('data-patient-id="2"');
    expect(html).toContain('data-patient-id="3"');
  });

  test('returns empty state for empty array', () => {
    const html = buildPatientListHTML([]);

    expect(html).toContain('no-results');
    expect(html).toContain('No patients found');
  });

  test('handles null input gracefully', () => {
    const html = buildPatientListHTML(null);
    expect(html).toContain('No patients found');
  });
});

describe('buildPatientGridHTML', () => {
  test('generates grid view HTML with patient tiles', () => {
    const html = buildPatientGridHTML(mockPatients);

    expect(html).toContain('patient-grid-view');
    expect(html).toContain('patient-grid-item');
    expect(html).toContain('JD'); // Initials for John Doe
    expect(html).toContain('JS'); // Initials for Jane Smith
  });

  test('includes compact patient info', () => {
    const html = buildPatientGridHTML(mockPatients);

    expect(html).toContain('John Doe');
    expect(html).toContain('MRN-20251230-0001');
    expect(html).toContain('35y, M');
  });

  test('includes action buttons', () => {
    const html = buildPatientGridHTML(mockPatients);

    expect(html).toContain('btn-grid-view');
    expect(html).toContain('btn-grid-encounter');
  });

  test('includes avatar with initials', () => {
    const html = buildPatientGridHTML(mockPatients);

    expect(html).toContain('patient-avatar');
    expect(html).toContain('JD');
  });

  test('returns empty state for empty array', () => {
    const html = buildPatientGridHTML([]);

    expect(html).toContain('no-results');
    expect(html).toContain('No patients found');
  });
});

describe('buildPatientViewHTML', () => {
  test('returns list view HTML when mode is LIST', () => {
    const html = buildPatientViewHTML(mockPatients, VIEW_MODES.LIST);

    expect(html).toContain('patient-list-view');
    expect(html).not.toContain('patient-grid-view');
  });

  test('returns grid view HTML when mode is GRID', () => {
    const html = buildPatientViewHTML(mockPatients, VIEW_MODES.GRID);

    expect(html).toContain('patient-grid-view');
    expect(html).not.toContain('patient-list-view');
  });

  test('defaults to list view for invalid mode', () => {
    const html = buildPatientViewHTML(mockPatients, 'invalid');

    expect(html).toContain('patient-list-view');
  });
});

describe('buildViewToggleHTML', () => {
  test('generates toggle buttons', () => {
    const html = buildViewToggleHTML(VIEW_MODES.LIST);

    expect(html).toContain('view-toggle');
    expect(html).toContain('btn-view-list');
    expect(html).toContain('btn-view-grid');
  });

  test('marks LIST button as active when in list mode', () => {
    const html = buildViewToggleHTML(VIEW_MODES.LIST);

    expect(html).toContain('btn-view-list active');
    expect(html).not.toContain('btn-view-grid active');
  });

  test('marks GRID button as active when in grid mode', () => {
    const html = buildViewToggleHTML(VIEW_MODES.GRID);

    expect(html).toContain('btn-view-grid active');
    expect(html).not.toContain('btn-view-list active');
  });

  test('includes aria-labels for accessibility', () => {
    const html = buildViewToggleHTML(VIEW_MODES.LIST);

    expect(html).toContain('aria-label="List view"');
    expect(html).toContain('aria-label="Grid view"');
  });

  test('includes icons for list and grid', () => {
    const html = buildViewToggleHTML(VIEW_MODES.LIST);

    // Should contain some icon representation
    expect(html).toContain('icon');
  });
});

// ====================
// Integration Tests
// ====================

describe('View Toggle Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  test('complete toggle workflow: LIST -> GRID -> LIST', () => {
    // Start with LIST (default)
    localStorageMock.getItem.mockReturnValue(null);
    expect(getCurrentViewMode()).toBe(VIEW_MODES.LIST);

    // Toggle to GRID
    localStorageMock.getItem.mockReturnValue('list');
    const gridMode = toggleViewMode();
    expect(gridMode).toBe(VIEW_MODES.GRID);

    // Build grid HTML
    localStorageMock.getItem.mockReturnValue('grid');
    const gridHtml = buildPatientViewHTML(mockPatients, getCurrentViewMode());
    expect(gridHtml).toContain('patient-grid-view');

    // Toggle back to LIST
    const listMode = toggleViewMode();
    expect(listMode).toBe(VIEW_MODES.LIST);

    // Build list HTML
    localStorageMock.getItem.mockReturnValue('list');
    const listHtml = buildPatientViewHTML(mockPatients, getCurrentViewMode());
    expect(listHtml).toContain('patient-list-view');
  });

  test('view mode persists across function calls', () => {
    setViewMode(VIEW_MODES.GRID);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vitora_patient_view_mode', 'grid');

    // Simulate page reload by returning the stored value
    localStorageMock.getItem.mockReturnValue('grid');
    expect(getCurrentViewMode()).toBe(VIEW_MODES.GRID);
  });
});

// ====================
// Edge Cases
// ====================

describe('Edge Cases', () => {
  test('handles patient with special characters in name', () => {
    const patient = { ...mockPatients[0], full_name: "O'Brien-Smith" };
    const formatted = formatPatientCard(patient);
    expect(formatted.fullName).toBe("O'Brien-Smith");
  });

  test('handles patient with very long name', () => {
    const patient = { ...mockPatients[0], full_name: 'Very Long Name That Goes On And On' };
    const formatted = formatPatientGridItem(patient);
    expect(formatted.initials).toBe('VO'); // First and last word initials
  });

  test('handles empty patient name', () => {
    const patient = { ...mockPatients[0], full_name: '' };
    const formatted = formatPatientGridItem(patient);
    expect(formatted.initials).toBe('?'); // Fallback for empty name
  });

  test('handles undefined gender', () => {
    const patient = { ...mockPatients[0], gender: undefined };
    const formatted = formatPatientCard(patient);
    expect(formatted.genderDisplay).toBe('Unknown');
  });

  test('handles Other gender (O)', () => {
    const patient = { ...mockPatients[0], gender: 'O' };
    const formatted = formatPatientCard(patient);
    expect(formatted.genderDisplay).toBe('Other');
  });

  test('grid initials use uppercase', () => {
    const patient = { ...mockPatients[0], full_name: 'john doe' };
    const formatted = formatPatientGridItem(patient);
    expect(formatted.initials).toBe('JD');
  });
});

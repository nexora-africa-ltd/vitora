/**
 * Vitora HMIS Desktop - Patient List View Module
 *
 * Functions for displaying patient list in list or grid format
 * with toggleable view mode and localStorage persistence.
 *
 * Sprint 1.1-1.2: Patient List Display Enhancement
 */

// ====================
// Constants
// ====================

/**
 * View mode options
 */
const VIEW_MODES = {
  LIST: 'list',
  GRID: 'grid',
};

/**
 * localStorage key for view mode preference
 */
const PATIENT_VIEW_KEY = 'vitora_patient_view_mode';

// ====================
// View Mode Management
// ====================

/**
 * Get the current view mode from localStorage
 * @returns {string} Current view mode ('list' or 'grid')
 */
function getCurrentViewMode() {
  if (typeof localStorage === 'undefined') return VIEW_MODES.LIST;

  const stored = localStorage.getItem(PATIENT_VIEW_KEY);

  if (stored === VIEW_MODES.LIST || stored === VIEW_MODES.GRID) {
    return stored;
  }

  return VIEW_MODES.LIST; // Default to list view
}

/**
 * Set the view mode and persist to localStorage
 * @param {string} mode - View mode to set ('list' or 'grid')
 * @returns {string} The set mode or current mode if invalid
 */
function setViewMode(mode) {
  if (mode !== VIEW_MODES.LIST && mode !== VIEW_MODES.GRID) {
    return getCurrentViewMode();
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PATIENT_VIEW_KEY, mode);
  }

  return mode;
}

/**
 * Toggle between list and grid view modes
 * @returns {string} The new view mode
 */
function toggleViewMode() {
  const current = getCurrentViewMode();
  const newMode = current === VIEW_MODES.LIST ? VIEW_MODES.GRID : VIEW_MODES.LIST;
  return setViewMode(newMode);
}

// ====================
// Formatting Functions
// ====================

/**
 * Format gender code to display text
 * @param {string} gender - Gender code (M, F, O)
 * @returns {string} Formatted gender text
 */
function formatGender(gender) {
  const genderMap = {
    M: 'Male',
    F: 'Female',
    O: 'Other',
  };
  return genderMap[gender] || 'Unknown';
}

/**
 * Format patient data for list card display
 * @param {object} patient - Patient object
 * @returns {object|null} Formatted patient data or null
 */
function formatPatientCard(patient) {
  if (!patient) return null;

  return {
    id: patient.id,
    fullName: patient.full_name,
    mrn: patient.mrn,
    age: patient.age,
    gender: patient.gender,
    genderDisplay: formatGender(patient.gender),
    dateOfBirth: patient.date_of_birth,
    phoneNumber: patient.phone_number || null,
    hasPhone: !!patient.phone_number,
    county: patient.county_name || null,
  };
}

/**
 * Generate initials from a full name
 * @param {string} fullName - Full name
 * @returns {string} Initials (2 characters max)
 */
function generateInitials(fullName) {
  if (!fullName || fullName.trim() === '') return '?';

  const parts = fullName.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  // Use first and last name initials
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);

  return (first + last).toUpperCase();
}

/**
 * Format patient data for grid item display
 * @param {object} patient - Patient object
 * @returns {object|null} Formatted patient data or null
 */
function formatPatientGridItem(patient) {
  if (!patient) return null;

  const initials = generateInitials(patient.full_name);
  const genderShort = patient.gender === 'M' ? 'M' : patient.gender === 'F' ? 'F' : 'O';

  return {
    id: patient.id,
    fullName: patient.full_name,
    mrn: patient.mrn,
    initials,
    ageSummary: `${patient.age}y, ${genderShort}`,
    county: patient.county_name || null,
  };
}

// ====================
// HTML Building Functions
// ====================

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build HTML for patient list view
 * @param {Array} patients - Array of patient objects
 * @returns {string} HTML string
 */
function buildPatientListHTML(patients) {
  if (!patients || patients.length === 0) {
    return '<p class="no-results">No patients found.</p>';
  }

  const cardsHTML = patients.map(patient => {
    const formatted = formatPatientCard(patient);
    if (!formatted) return '';

    return `
      <div class="patient-card" data-patient-id="${formatted.id}">
        <div class="patient-header">
          <h3>${escapeHtml(formatted.fullName)}</h3>
          <span class="mrn">MRN: ${escapeHtml(formatted.mrn)}</span>
        </div>
        <div class="patient-details">
          <div class="detail">
            <span class="label">Age:</span>
            <span class="value">${formatted.age} years</span>
          </div>
          <div class="detail">
            <span class="label">Gender:</span>
            <span class="value">${formatted.genderDisplay}</span>
          </div>
          <div class="detail">
            <span class="label">DOB:</span>
            <span class="value">${formatted.dateOfBirth}</span>
          </div>
          ${formatted.hasPhone ? `
          <div class="detail">
            <span class="label">Phone:</span>
            <span class="value">${escapeHtml(formatted.phoneNumber)}</span>
          </div>
          ` : ''}
        </div>
        <div class="patient-actions">
          <button class="btn-view" onclick="viewPatientDetails(${formatted.id})">View Details</button>
          <button class="btn-encounter" onclick="startEncounter(${formatted.id}, '${escapeHtml(formatted.fullName)}', '${escapeHtml(formatted.mrn)}')">New Encounter</button>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="patient-list-view">${cardsHTML}</div>`;
}

/**
 * Build HTML for patient grid view
 * @param {Array} patients - Array of patient objects
 * @returns {string} HTML string
 */
function buildPatientGridHTML(patients) {
  if (!patients || patients.length === 0) {
    return '<p class="no-results">No patients found.</p>';
  }

  const tilesHTML = patients.map(patient => {
    const formatted = formatPatientGridItem(patient);
    if (!formatted) return '';

    return `
      <div class="patient-grid-item" data-patient-id="${formatted.id}">
        <div class="patient-avatar">
          <span class="initials">${formatted.initials}</span>
        </div>
        <div class="patient-grid-info">
          <h4 class="patient-name">${escapeHtml(formatted.fullName)}</h4>
          <span class="patient-mrn">${escapeHtml(formatted.mrn)}</span>
          <span class="patient-summary">${formatted.ageSummary}</span>
        </div>
        <div class="patient-grid-actions">
          <button class="btn-grid-view" onclick="viewPatientDetails(${formatted.id})" title="View Details">
            <span class="icon">👁</span>
          </button>
          <button class="btn-grid-encounter" onclick="startEncounter(${formatted.id}, '${escapeHtml(formatted.fullName)}', '${escapeHtml(formatted.mrn)}')" title="New Encounter">
            <span class="icon">📋</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="patient-grid-view">${tilesHTML}</div>`;
}

/**
 * Build HTML for patient view based on current mode
 * @param {Array} patients - Array of patient objects
 * @param {string} mode - View mode ('list' or 'grid')
 * @returns {string} HTML string
 */
function buildPatientViewHTML(patients, mode) {
  if (mode === VIEW_MODES.GRID) {
    return buildPatientGridHTML(patients);
  }
  return buildPatientListHTML(patients);
}

/**
 * Build HTML for view toggle buttons
 * @param {string} currentMode - Current view mode
 * @returns {string} HTML string
 */
function buildViewToggleHTML(currentMode) {
  const listActive = currentMode === VIEW_MODES.LIST ? 'active' : '';
  const gridActive = currentMode === VIEW_MODES.GRID ? 'active' : '';

  return `
    <div class="view-toggle">
      <button class="btn-view-list ${listActive}" data-view="list" aria-label="List view" title="List View">
        <span class="icon">☰</span>
      </button>
      <button class="btn-view-grid ${gridActive}" data-view="grid" aria-label="Grid view" title="Grid View">
        <span class="icon">▦</span>
      </button>
    </div>
  `;
}

// ====================
// Module Exports
// ====================

// For Node.js/Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Constants
    VIEW_MODES,
    PATIENT_VIEW_KEY,

    // View Mode Management
    getCurrentViewMode,
    setViewMode,
    toggleViewMode,

    // Formatting Functions
    formatPatientCard,
    formatPatientGridItem,
    generateInitials,
    formatGender,
    escapeHtml,

    // HTML Building Functions
    buildPatientListHTML,
    buildPatientGridHTML,
    buildPatientViewHTML,
    buildViewToggleHTML,
  };
}

// For browser - expose globally
if (typeof window !== 'undefined') {
  window.PatientListView = {
    // Constants
    VIEW_MODES,
    PATIENT_VIEW_KEY,

    // View Mode Management
    getCurrentViewMode,
    setViewMode,
    toggleViewMode,

    // Formatting Functions
    formatPatientCard,
    formatPatientGridItem,
    generateInitials,
    formatGender,

    // HTML Building Functions
    buildPatientListHTML,
    buildPatientGridHTML,
    buildPatientViewHTML,
    buildViewToggleHTML,
  };
}

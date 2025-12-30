/**
 * Vitora HMIS Desktop - Encounter Timeline Module
 *
 * Functions for displaying patient encounter history with
 * filtering, sorting, statistics, and expandable details.
 *
 * Sprint 1.1-1.2: Encounter Timeline View
 */

// ====================
// Constants
// ====================

/**
 * Encounter type display labels
 */
const ENCOUNTER_TYPE_LABELS = {
  OPD: 'Outpatient',
  EMERGENCY: 'Emergency',
  INPATIENT: 'Inpatient',
  TELEMEDICINE: 'Telemedicine',
  HOME_VISIT: 'Home Visit',
};

/**
 * Month names for date formatting
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ====================
// State Management
// ====================

let expandedEncounters = new Set();

// ====================
// API Functions
// ====================

/**
 * Fetch encounter timeline for a patient
 * @param {number} patientId - Patient ID
 * @param {object} filters - Optional filters (startDate, endDate, types, page, pageSize)
 * @returns {Promise<object>} Object with encounters array and statistics
 */
async function fetchEncounterTimeline(patientId, filters = {}) {
  try {
    // Build query parameters
    const params = new URLSearchParams();

    if (filters.startDate) {
      params.append('start_date', filters.startDate);
    }
    if (filters.endDate) {
      params.append('end_date', filters.endDate);
    }
    if (filters.types && filters.types.length > 0) {
      params.append('type', filters.types.join(','));
    }
    if (filters.page) {
      params.append('page', filters.page);
    }
    if (filters.pageSize) {
      params.append('page_size', filters.pageSize);
    }

    const queryString = params.toString();
    const url = `/api/patients/${patientId}/encounter-timeline/${queryString ? '?' + queryString : ''}`;

    const response = await window.electronAPI.apiRequest('GET', url);

    if (response.success && response.data) {
      return {
        encounters: response.data.encounters || response.data.results || [],
        statistics: response.data.statistics || {},
      };
    }

    return { encounters: [], statistics: {} };
  } catch (error) {
    console.error('Error fetching encounter timeline:', error);
    return { encounters: [], statistics: {} };
  }
}

// ====================
// Formatting Functions
// ====================

/**
 * Format encounter data for display in a card
 * @param {object} encounter - Encounter object
 * @returns {object|null} Formatted encounter data or null
 */
function formatEncounterCard(encounter) {
  if (!encounter) return null;

  const date = new Date(encounter.encounter_date);

  // Format date
  const formattedDate = `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

  // Format time
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  const formattedTime = `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;

  // Get type label
  const typeLabel = ENCOUNTER_TYPE_LABELS[encounter.encounter_type] || encounter.encounter_type;

  // Get principal diagnosis
  const principalDiagnosis = encounter.diagnoses && encounter.diagnoses.length > 0
    ? (encounter.diagnoses.find(d => d.is_principal) || encounter.diagnoses[0]).description
    : 'No diagnosis recorded';

  // Build vitals summary
  const vitals = [];
  if (encounter.temperature) vitals.push(`${encounter.temperature}°C`);
  if (encounter.pulse) vitals.push(`${encounter.pulse} bpm`);
  if (encounter.blood_pressure) vitals.push(encounter.blood_pressure);
  if (encounter.spo2) vitals.push(`SpO2 ${encounter.spo2}%`);
  const vitalsSummary = vitals.join(' | ');

  return {
    ...encounter,
    formattedDate,
    formattedTime,
    typeLabel,
    principalDiagnosis,
    diagnosisCount: encounter.diagnoses ? encounter.diagnoses.length : 0,
    vitalsSummary,
    isCritical: encounter.has_critical_vitals || false,
  };
}

/**
 * Format relative time (Today, Yesterday, X days ago, etc.)
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time string
 */
function formatRelativeTime(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();

  // Reset time parts for day comparison
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = nowDay - dateDay;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return `${Math.floor(diffDays / 365)} year${diffDays >= 730 ? 's' : ''} ago`;
}

// ====================
// Sorting & Filtering Functions
// ====================

/**
 * Sort encounters by date
 * @param {Array} encounters - Array of encounters
 * @param {string} order - 'asc' or 'desc' (default: 'desc')
 * @returns {Array} Sorted copy of encounters
 */
function sortEncounters(encounters, order = 'desc') {
  if (!encounters || encounters.length === 0) return [];

  return [...encounters].sort((a, b) => {
    const dateA = new Date(a.encounter_date);
    const dateB = new Date(b.encounter_date);

    return order === 'asc' ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Filter encounters by date range
 * @param {Array} encounters - Array of encounters
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array} Filtered encounters
 */
function filterByDateRange(encounters, startDate, endDate) {
  if (!encounters || encounters.length === 0) return [];
  if (!startDate && !endDate) return encounters;

  return encounters.filter(encounter => {
    const date = new Date(encounter.encounter_date);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (startDate) {
      const start = new Date(startDate);
      if (dateOnly < start) return false;
    }

    if (endDate) {
      const end = new Date(endDate);
      if (dateOnly > end) return false;
    }

    return true;
  });
}

/**
 * Filter encounters by type
 * @param {Array} encounters - Array of encounters
 * @param {Array} types - Array of encounter types to include
 * @returns {Array} Filtered encounters
 */
function filterByType(encounters, types) {
  if (!encounters || encounters.length === 0) return [];
  if (!types || types.length === 0) return encounters;

  const upperTypes = types.map(t => t.toUpperCase());

  return encounters.filter(encounter =>
    upperTypes.includes(encounter.encounter_type.toUpperCase())
  );
}

// ====================
// Statistics Functions
// ====================

/**
 * Calculate statistics from encounters
 * @param {Array} encounters - Array of encounters
 * @returns {object} Statistics object
 */
function calculateStatistics(encounters) {
  if (!encounters || encounters.length === 0) {
    return {
      total: 0,
      byType: {},
      criticalCount: 0,
      commonDiagnoses: [],
      firstEncounter: null,
      lastEncounter: null,
      uniqueClinicians: 0,
    };
  }

  // Count by type
  const byType = {};
  encounters.forEach(e => {
    byType[e.encounter_type] = (byType[e.encounter_type] || 0) + 1;
  });

  // Count critical
  const criticalCount = encounters.filter(e => e.has_critical_vitals).length;

  // Count diagnoses
  const diagnosisCounts = {};
  encounters.forEach(e => {
    if (e.diagnoses) {
      e.diagnoses.forEach(d => {
        const key = d.code || d.description;
        diagnosisCounts[key] = (diagnosisCounts[key] || 0) + 1;
      });
    }
  });

  // Sort and get top diagnoses
  const commonDiagnoses = Object.entries(diagnosisCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  // Get date range
  const sorted = sortEncounters(encounters, 'asc');
  const firstEncounter = sorted[0].encounter_date.split('T')[0];
  const lastEncounter = sorted[sorted.length - 1].encounter_date.split('T')[0];

  // Count unique clinicians
  const clinicians = new Set();
  encounters.forEach(e => {
    if (e.clinician_name) clinicians.add(e.clinician_name);
  });

  return {
    total: encounters.length,
    byType,
    criticalCount,
    commonDiagnoses,
    firstEncounter,
    lastEncounter,
    uniqueClinicians: clinicians.size,
  };
}

/**
 * Group encounters by month
 * @param {Array} encounters - Array of encounters (should be pre-sorted)
 * @returns {object} Object with month keys and encounter arrays
 */
function groupEncountersByMonth(encounters) {
  if (!encounters || encounters.length === 0) return {};

  const grouped = {};

  encounters.forEach(encounter => {
    const date = new Date(encounter.encounter_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!grouped[key]) {
      grouped[key] = {
        label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`,
        encounters: [],
      };
    }

    grouped[key].encounters.push(encounter);
  });

  return grouped;
}

// ====================
// Expansion State Functions
// ====================

/**
 * Toggle encounter expanded state
 * @param {number} encounterId - Encounter ID
 * @returns {boolean} New expansion state (true = expanded)
 */
function toggleEncounterExpand(encounterId) {
  if (expandedEncounters.has(encounterId)) {
    expandedEncounters.delete(encounterId);
    return false;
  } else {
    expandedEncounters.add(encounterId);
    return true;
  }
}

/**
 * Get list of expanded encounter IDs
 * @returns {Array} Array of expanded encounter IDs
 */
function getExpandedEncounters() {
  return Array.from(expandedEncounters);
}

/**
 * Check if encounter is expanded
 * @param {number} encounterId - Encounter ID
 * @returns {boolean} True if expanded
 */
function isEncounterExpanded(encounterId) {
  return expandedEncounters.has(encounterId);
}

/**
 * Clear all expanded encounters
 */
function clearExpandedEncounters() {
  expandedEncounters.clear();
}

// ====================
// HTML Building Functions
// ====================

/**
 * Build timeline HTML
 * @param {Array} encounters - Array of encounters
 * @param {object} statistics - Statistics object
 * @returns {string} HTML string
 */
function buildTimelineHTML(encounters, statistics) {
  if (!encounters || encounters.length === 0) {
    return `
      <div class="timeline-empty">
        <p>No encounters found</p>
      </div>
    `;
  }

  // Build statistics section
  const statsHTML = `
    <div class="timeline-statistics">
      <div class="stat-item">
        <span class="stat-value">${statistics.total || 0}</span>
        <span class="stat-label">Total Encounters</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${statistics.criticalCount || 0}</span>
        <span class="stat-label">Critical</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${statistics.uniqueClinicians || 0}</span>
        <span class="stat-label">Clinicians</span>
      </div>
    </div>
  `;

  // Build encounter cards
  const cardsHTML = encounters.map((encounter, index) => {
    const formatted = formatEncounterCard(encounter);
    const isExpanded = isEncounterExpanded(encounter.id);
    const criticalClass = formatted.isCritical ? 'critical' : '';
    const expandedClass = isExpanded ? 'expanded' : '';

    return `
      <div class="timeline-encounter-card ${criticalClass} ${expandedClass}" data-encounter-id="${encounter.id}">
        ${index < encounters.length - 1 ? '<div class="timeline-connector"></div>' : ''}
        <div class="timeline-card-header">
          <div class="timeline-date">
            <span class="date">${formatted.formattedDate}</span>
            <span class="time">${formatted.formattedTime}</span>
          </div>
          <span class="timeline-type type-${encounter.encounter_type.toLowerCase()}">${formatted.typeLabel}</span>
        </div>
        <div class="timeline-card-body">
          <div class="timeline-complaint">${encounter.chief_complaint}</div>
          <div class="timeline-diagnosis">${formatted.principalDiagnosis}</div>
          <div class="timeline-vitals">${formatted.vitalsSummary}</div>
        </div>
        <div class="timeline-card-footer">
          <span class="clinician">${encounter.clinician_name || 'Unknown'}</span>
          <button class="btn-expand" aria-expanded="${isExpanded}">${isExpanded ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${statsHTML}
    <div class="timeline-container">
      ${cardsHTML}
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
    ENCOUNTER_TYPE_LABELS,

    // API Functions
    fetchEncounterTimeline,

    // Formatting Functions
    formatEncounterCard,
    formatRelativeTime,

    // Sorting & Filtering
    sortEncounters,
    filterByDateRange,
    filterByType,

    // Statistics
    calculateStatistics,
    groupEncountersByMonth,

    // Expansion State
    toggleEncounterExpand,
    getExpandedEncounters,
    isEncounterExpanded,
    clearExpandedEncounters,

    // HTML Building
    buildTimelineHTML,
  };
}

// For browser - expose globally
if (typeof window !== 'undefined') {
  window.TimelineModule = {
    // Constants
    ENCOUNTER_TYPE_LABELS,

    // API Functions
    fetchEncounterTimeline,

    // Formatting Functions
    formatEncounterCard,
    formatRelativeTime,

    // Sorting & Filtering
    sortEncounters,
    filterByDateRange,
    filterByType,

    // Statistics
    calculateStatistics,
    groupEncountersByMonth,

    // Expansion State
    toggleEncounterExpand,
    getExpandedEncounters,
    isEncounterExpanded,
    clearExpandedEncounters,

    // HTML Building
    buildTimelineHTML,
  };
}

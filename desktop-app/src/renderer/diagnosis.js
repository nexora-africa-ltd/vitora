/**
 * Vitora HMIS Desktop - Diagnosis Module
 *
 * Functions for ICD-10 code search, autocomplete,
 * recent searches management, and diagnosis list handling.
 *
 * Sprint 1.1-1.2: Diagnosis Search Component
 */

// ====================
// Configuration
// ====================
const RECENT_SEARCHES_KEY = 'vitora_recent_icd10';
const MAX_RECENT_SEARCHES = 10;
const DEFAULT_DEBOUNCE_DELAY = 300;
const MIN_SEARCH_LENGTH = 2;

// Diagnosis certainty levels (matching backend model)
const CERTAINTY_LEVELS = ['CONFIRMED', 'PROVISIONAL', 'DIFFERENTIAL', 'RULED_OUT'];

// Common diagnoses for Kenya (quick-select)
const COMMON_DIAGNOSES = [
  { code: 'B50.9', description: 'Plasmodium falciparum malaria, unspecified' },
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { code: 'A01.0', description: 'Typhoid fever' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified' },
  { code: 'K29.7', description: 'Gastritis, unspecified' },
  { code: 'J45.9', description: 'Asthma, unspecified' },
  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
];

// ====================
// localStorage abstraction (for testability)
// ====================
let storage = typeof localStorage !== 'undefined' ? localStorage : null;

/**
 * Set localStorage implementation (for testing)
 * @param {object} mockStorage - Mock localStorage object
 */
function setLocalStorage(mockStorage) {
  storage = mockStorage;
}

// ====================
// Utility Functions
// ====================

/**
 * Debounce function execution
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds (default: 300)
 * @returns {Function} Debounced function
 */
function debounce(fn, delay = DEFAULT_DEBOUNCE_DELAY) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ====================
// ICD-10 Search Functions
// ====================

/**
 * Search ICD-10 codes via API
 * @param {string} query - Search query
 * @param {Function} apiRequest - API request function (injected for testability)
 * @returns {Promise<Array>} Array of formatted ICD-10 results
 */
async function searchICD10(query, apiRequest) {
  const trimmedQuery = (query || '').trim();

  // Don't search for empty or short queries
  if (trimmedQuery.length < MIN_SEARCH_LENGTH) {
    return [];
  }

  try {
    const response = await apiRequest('GET', `/api/icd10-codes/?search=${encodeURIComponent(trimmedQuery)}`);

    if (!response.success) {
      return [];
    }

    // Handle both paginated and non-paginated responses
    const results = response.data?.results || response.data || [];

    return results.map(formatICD10Result);
  } catch (error) {
    console.error('ICD-10 search error:', error);
    return [];
  }
}

/**
 * Format ICD-10 code result for UI display
 * @param {object} code - Raw ICD-10 code object from API
 * @returns {object} Formatted code object
 */
function formatICD10Result(code) {
  return {
    ...code,
    description: code.short_description || code.long_description || '',
  };
}

// ====================
// Recent Searches (localStorage)
// ====================

/**
 * Get recent ICD-10 searches from localStorage
 * @returns {Array} Array of recent search objects
 */
function getRecentSearches() {
  if (!storage) return [];

  try {
    const stored = storage.getItem(RECENT_SEARCHES_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading recent searches:', error);
    return [];
  }
}

/**
 * Add ICD-10 code to recent searches
 * @param {object} code - ICD-10 code object with code and description
 */
function addRecentSearch(code) {
  if (!storage || !code?.code) return;

  const recent = getRecentSearches();

  // Remove existing entry if present (will be re-added at top)
  const filtered = recent.filter(r => r.code !== code.code);

  // Add to beginning (most recent first)
  const updated = [
    { id: code.id, code: code.code, description: code.description },
    ...filtered,
  ].slice(0, MAX_RECENT_SEARCHES);

  try {
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving recent search:', error);
  }
}

/**
 * Clear all recent searches
 */
function clearRecentSearches() {
  if (!storage) return;

  try {
    storage.removeItem(RECENT_SEARCHES_KEY);
  } catch (error) {
    console.error('Error clearing recent searches:', error);
  }
}

// ====================
// Diagnosis List Management
// ====================

/**
 * Create empty diagnosis list
 * @returns {Array} Empty diagnosis list
 */
function createDiagnosisList() {
  return [];
}

/**
 * Add diagnosis to list
 * @param {Array} list - Current diagnosis list
 * @param {object} diagnosis - Diagnosis object with id, code, description
 * @param {boolean} isPrincipal - Whether this is the principal diagnosis
 * @returns {Array} Updated diagnosis list
 */
function addDiagnosis(list, diagnosis, isPrincipal = null) {
  // Check for duplicate
  if (list.some(d => d.code === diagnosis.code)) {
    return list;
  }

  // Determine if this should be principal
  const shouldBePrincipal = isPrincipal !== null ? isPrincipal : list.length === 0;

  // If new diagnosis is principal, demote existing principal
  let updatedList = list;
  if (shouldBePrincipal && list.length > 0) {
    updatedList = list.map(d => ({ ...d, is_principal: false }));
  }

  // Add new diagnosis
  const newDiagnosis = {
    id: diagnosis.id,
    code: diagnosis.code,
    description: diagnosis.description,
    is_principal: shouldBePrincipal,
    certainty: diagnosis.certainty || 'CONFIRMED',
  };

  return [...updatedList, newDiagnosis];
}

/**
 * Remove diagnosis from list by code
 * @param {Array} list - Current diagnosis list
 * @param {string} code - ICD-10 code to remove
 * @returns {Array} Updated diagnosis list
 */
function removeDiagnosis(list, code) {
  const diagnosisToRemove = list.find(d => d.code === code);

  if (!diagnosisToRemove) {
    return list;
  }

  const filtered = list.filter(d => d.code !== code);

  // If removed diagnosis was principal, promote first remaining diagnosis
  if (diagnosisToRemove.is_principal && filtered.length > 0) {
    filtered[0] = { ...filtered[0], is_principal: true };
  }

  return filtered;
}

/**
 * Set principal diagnosis
 * @param {Array} list - Current diagnosis list
 * @param {string} code - ICD-10 code to set as principal
 * @returns {Array} Updated diagnosis list
 */
function setPrincipalDiagnosis(list, code) {
  if (!list.some(d => d.code === code)) {
    return list;
  }

  return list.map(d => ({
    ...d,
    is_principal: d.code === code,
  }));
}

/**
 * Get diagnosis payload for API submission
 * @param {Array} list - Diagnosis list
 * @returns {Array} Formatted payload for API
 */
function getDiagnosisPayload(list) {
  return list.map(d => ({
    icd10_code: d.id,
    is_principal: d.is_principal,
    certainty: d.certainty,
  }));
}

// ====================
// Certainty Validation
// ====================

/**
 * Validate certainty level
 * @param {string} certainty - Certainty level to validate
 * @returns {boolean} True if valid
 */
function isValidCertainty(certainty) {
  return CERTAINTY_LEVELS.includes(certainty);
}

// ====================
// Common Diagnoses
// ====================

/**
 * Get list of common diagnoses for quick selection
 * @returns {Array} Array of common diagnosis objects
 */
function getCommonDiagnoses() {
  return [...COMMON_DIAGNOSES];
}

// ====================
// Module Exports
// ====================
// For Node.js/Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Constants
    CERTAINTY_LEVELS,
    RECENT_SEARCHES_KEY,
    MAX_RECENT_SEARCHES,

    // Utility
    debounce,
    setLocalStorage,

    // ICD-10 Search
    searchICD10,
    formatICD10Result,

    // Recent Searches
    getRecentSearches,
    addRecentSearch,
    clearRecentSearches,

    // Diagnosis List
    createDiagnosisList,
    addDiagnosis,
    removeDiagnosis,
    setPrincipalDiagnosis,
    getDiagnosisPayload,

    // Certainty
    isValidCertainty,

    // Common Diagnoses
    getCommonDiagnoses,
  };
}

// For browser - expose globally
if (typeof window !== 'undefined') {
  window.DiagnosisModule = {
    // Constants
    CERTAINTY_LEVELS,
    COMMON_DIAGNOSES,
    RECENT_SEARCHES_KEY,
    MAX_RECENT_SEARCHES,

    // Utility
    debounce,
    setLocalStorage,

    // ICD-10 Search
    searchICD10,
    formatICD10Result,

    // Recent Searches
    getRecentSearches,
    addRecentSearch,
    clearRecentSearches,

    // Diagnosis List
    createDiagnosisList,
    addDiagnosis,
    removeDiagnosis,
    setPrincipalDiagnosis,
    getDiagnosisPayload,

    // Certainty
    isValidCertainty,

    // Common Diagnoses
    getCommonDiagnoses,
  };
}

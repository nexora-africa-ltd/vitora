/**
 * Vitora HMIS Desktop - App Integrations Module
 *
 * Functions for integrating various app components including:
 * - Encounter Timeline integration with patient modal
 * - Treatment template suggestions based on diagnosis
 * - Popular templates display
 * - Template clone functionality
 *
 * Sprint 1.1-1.2: Frontend Integrations
 */

// ====================
// Timeline Functions
// ====================

/**
 * Load patient encounter timeline with optional filters
 * @param {number} patientId - Patient ID
 * @param {object} filters - Optional filters (startDate, endDate, types)
 * @returns {Promise<object>} Object with success, encounters, statistics, or error
 */
async function loadPatientTimeline(patientId, filters = {}) {
  try {
    // Build query parameters
    const queryParts = [];

    if (filters.startDate) {
      queryParts.push(`start_date=${filters.startDate}`);
    }
    if (filters.endDate) {
      queryParts.push(`end_date=${filters.endDate}`);
    }
    if (filters.types && filters.types.length > 0) {
      queryParts.push(`type=${filters.types.join(',')}`);
    }

    const queryString = queryParts.join('&');
    const url = `/api/patients/${patientId}/encounter-timeline/${queryString ? '?' + queryString : ''}`;

    const response = await window.electronAPI.apiRequest('GET', url);

    if (response.success && response.data) {
      return {
        success: true,
        encounters: response.data.encounters || [],
        statistics: response.data.statistics || {},
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to load timeline',
      encounters: [],
      statistics: {},
    };
  } catch (error) {
    console.error('Error loading patient timeline:', error);
    return {
      success: false,
      error: error.message || 'Failed to load timeline',
      encounters: [],
      statistics: {},
    };
  }
}

// ====================
// Template Suggestion Functions
// ====================

/**
 * Suggest treatment templates based on diagnosis code
 * @param {string} diagnosisCode - ICD-10 diagnosis code
 * @returns {Promise<object>} Object with success and templates array
 */
async function suggestTemplatesForDiagnosis(diagnosisCode) {
  // Don't call API for empty diagnosis code
  if (!diagnosisCode || diagnosisCode.trim() === '') {
    return {
      success: true,
      templates: [],
    };
  }

  try {
    const url = `/api/treatment-templates/suggest/?diagnosis=${encodeURIComponent(diagnosisCode)}`;
    const response = await window.electronAPI.apiRequest('GET', url);

    if (response.success && response.data) {
      return {
        success: true,
        templates: response.data.results || [],
      };
    }

    return {
      success: false,
      templates: [],
      error: response.error || 'Failed to get suggestions',
    };
  } catch (error) {
    console.error('Error suggesting templates:', error);
    return {
      success: false,
      templates: [],
      error: error.message || 'Failed to get suggestions',
    };
  }
}

// ====================
// Popular Templates Functions
// ====================

/**
 * Load popular clinical templates
 * @param {number} limit - Maximum number of templates to return (default: 10)
 * @returns {Promise<object>} Object with success and templates array
 */
async function loadPopularTemplates(limit = 10) {
  try {
    const url = `/api/clinical-templates/popular/?limit=${limit}`;
    const response = await window.electronAPI.apiRequest('GET', url);

    if (response.success && response.data) {
      return {
        success: true,
        templates: response.data.results || [],
      };
    }

    return {
      success: false,
      templates: [],
      error: response.error || 'Failed to load popular templates',
    };
  } catch (error) {
    console.error('Error loading popular templates:', error);
    return {
      success: false,
      templates: [],
      error: error.message || 'Failed to load popular templates',
    };
  }
}

// ====================
// Template Clone Functions
// ====================

/**
 * Clone a clinical template
 * @param {number} templateId - Template ID to clone
 * @returns {Promise<object>} Object with success and cloned template
 */
async function cloneTemplate(templateId) {
  try {
    const url = `/api/clinical-templates/${templateId}/clone/`;
    const response = await window.electronAPI.apiRequest('POST', url);

    if (response.success && response.data) {
      return {
        success: true,
        template: response.data,
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to clone template',
    };
  } catch (error) {
    console.error('Error cloning template:', error);
    return {
      success: false,
      error: error.message || 'Failed to clone template',
    };
  }
}

// ====================
// Template Apply Functions
// ====================

/**
 * Apply a clinical template to an encounter
 * @param {number} templateId - Template ID to apply
 * @param {number} encounterId - Encounter ID to apply template to
 * @returns {Promise<object>} Object with success and usage_count
 */
async function applyTemplateToEncounter(templateId, encounterId) {
  try {
    const url = `/api/clinical-templates/${templateId}/apply/`;
    const response = await window.electronAPI.apiRequest('POST', url, {
      encounter_id: encounterId,
    });

    if (response.success && response.data) {
      return {
        success: true,
        usage_count: response.data.usage_count,
        message: response.data.detail,
      };
    }

    return {
      success: false,
      error: response.error || 'Failed to apply template',
    };
  } catch (error) {
    console.error('Error applying template:', error);
    return {
      success: false,
      error: error.message || 'Failed to apply template',
    };
  }
}

// ====================
// Diagnosis Event Handlers
// ====================

/**
 * Handler for when a diagnosis is added to an encounter
 * Suggests templates only for principal diagnoses
 * @param {object} diagnosis - Diagnosis object with code, description, is_principal
 * @returns {Promise<Array>} Array of suggested templates
 */
async function onDiagnosisAdded(diagnosis) {
  // Only suggest templates for principal diagnoses (default is principal if not specified)
  if (diagnosis.is_principal === false) {
    return [];
  }

  const result = await suggestTemplatesForDiagnosis(diagnosis.code);
  return result.templates || [];
}

// ====================
// Timeline Rendering Functions
// ====================

/**
 * Render encounter timeline in the patient modal
 * @param {number} patientId - Patient ID
 * @returns {Promise<void>}
 */
async function renderTimelineInModal(patientId) {
  const timelineSection = document.getElementById('patient-timeline-section');
  const timelineContent = document.getElementById('timeline-content');
  const applyFilterBtn = document.getElementById('apply-timeline-filters');

  if (!timelineSection || !timelineContent) {
    console.error('Timeline elements not found');
    return;
  }

  // Show the timeline section
  timelineSection.style.display = 'block';

  // Show loading state
  timelineContent.innerHTML = '<div class="loading">Loading timeline...</div>';

  try {
    const result = await loadPatientTimeline(patientId);

    if (result.success) {
      // Render encounters
      const html = renderTimelineHTML(result.encounters, result.statistics);
      timelineContent.innerHTML = html;
    } else {
      timelineContent.innerHTML = `<div class="error">Failed to load timeline: ${result.error}</div>`;
    }
  } catch (error) {
    timelineContent.innerHTML = `<div class="error">Error loading timeline: ${error.message}</div>`;
  }

  // Set up filter button if present
  if (applyFilterBtn) {
    applyFilterBtn.addEventListener('click', async () => {
      // Re-load with filters (to be implemented based on UI)
      await renderTimelineInModal(patientId);
    });
  }
}

/**
 * Render timeline HTML from encounters data
 * @param {Array} encounters - Array of encounter objects
 * @param {object} statistics - Statistics object
 * @returns {string} HTML string
 */
function renderTimelineHTML(encounters, statistics) {
  if (!encounters || encounters.length === 0) {
    return '<div class="no-encounters">No encounters found</div>';
  }

  let html = '<div class="timeline-statistics">';
  html += `<span>Total: ${statistics.total_encounters || encounters.length} encounters</span>`;
  if (statistics.emergency_count) {
    html += `<span class="emergency-count">Emergency: ${statistics.emergency_count}</span>`;
  }
  if (statistics.critical_encounters) {
    html += `<span class="critical-count">Critical: ${statistics.critical_encounters}</span>`;
  }
  html += '</div>';

  html += '<div class="timeline-encounters">';
  for (const encounter of encounters) {
    const criticalClass = encounter.has_critical_vitals ? 'critical' : '';
    html += `
      <div class="encounter-card ${criticalClass}">
        <div class="encounter-header">
          <span class="encounter-type">${encounter.encounter_type}</span>
          <span class="encounter-date">${encounter.encounter_date}</span>
        </div>
        <div class="encounter-complaint">${encounter.chief_complaint}</div>
        ${encounter.diagnoses && encounter.diagnoses.length > 0 ? `
          <div class="encounter-diagnoses">
            ${encounter.diagnoses.map(d => `<span class="diagnosis">${d.code}: ${d.description}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }
  html += '</div>';

  return html;
}

// ====================
// Module Exports
// ====================

// Export for Node.js/Jest environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadPatientTimeline,
    suggestTemplatesForDiagnosis,
    loadPopularTemplates,
    cloneTemplate,
    applyTemplateToEncounter,
    onDiagnosisAdded,
    renderTimelineInModal,
    renderTimelineHTML,
  };
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.AppIntegrations = {
    loadPatientTimeline,
    suggestTemplatesForDiagnosis,
    loadPopularTemplates,
    cloneTemplate,
    applyTemplateToEncounter,
    onDiagnosisAdded,
    renderTimelineInModal,
    renderTimelineHTML,
  };
}

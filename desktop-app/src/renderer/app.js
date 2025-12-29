/**
 * Vitora HMIS Desktop - Renderer Process
 *
 * This file handles the UI logic for authentication, patient registration,
 * encounter management, offline status detection, and theme management.
 *
 * Sprint 0.6: Added authentication flow and dark mode
 */

// ====================
// Theme Management
// ====================
const THEME_KEY = 'vitora_theme';

/**
 * Initialize theme on app start
 */
function initializeTheme() {
  // Check for saved theme preference or use system preference
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  setTheme(theme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Set the theme
 */
function setTheme(theme) {
  const body = document.body;

  if (theme === 'dark') {
    body.classList.add('dark-mode');
  } else {
    body.classList.remove('dark-mode');
  }

  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Toggle theme
 */
function toggleTheme() {
  const currentTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

// ====================
// Authentication State
// ====================
let authState = {
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  user: null
};

// ====================
// State Management
// ====================
let selectedPatient = null;
let isOnline = true;

// ====================
// DOM Elements - Auth
// ====================
const loginContainer = document.getElementById('login-container');
const mainContainer = document.getElementById('main-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const loginBtnText = document.getElementById('login-btn-text');
const loginSpinner = document.getElementById('login-spinner');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');

// ====================
// Authentication Functions
// ====================

/**
 * Initialize the app - check for existing session
 */
async function initializeApp() {
  // Try to restore session from stored tokens
  const storedTokens = await window.electronAPI.getStoredTokens();

  if (storedTokens && storedTokens.accessToken) {
    authState.accessToken = storedTokens.accessToken;
    authState.refreshToken = storedTokens.refreshToken;
    authState.user = storedTokens.user;

    // Verify the token is still valid
    const isValid = await verifyToken(storedTokens.accessToken);

    if (isValid) {
      authState.isAuthenticated = true;
      showMainApp();
      return;
    } else if (storedTokens.refreshToken) {
      // Try to refresh the token
      const refreshed = await refreshAccessToken(storedTokens.refreshToken);
      if (refreshed) {
        authState.isAuthenticated = true;
        showMainApp();
        return;
      }
    }
  }

  // No valid session, show login
  showLoginScreen();
}

/**
 * Verify if an access token is still valid
 */
async function verifyToken(token) {
  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/token/verify/', { token });
    return response.success;
  } catch {
    return false;
  }
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(refreshToken) {
  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/token/refresh/', {
      refresh: refreshToken
    });

    if (response.success && response.data.access) {
      authState.accessToken = response.data.access;
      await window.electronAPI.storeTokens({
        accessToken: response.data.access,
        refreshToken: authState.refreshToken,
        user: authState.user
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  // Show loading state
  setLoginLoading(true);
  hideLoginError();

  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/token/', {
      username,
      password
    });

    if (response.success && response.data.access) {
      // Store tokens
      authState.accessToken = response.data.access;
      authState.refreshToken = response.data.refresh;
      authState.user = { username };
      authState.isAuthenticated = true;

      // Persist tokens
      await window.electronAPI.storeTokens({
        accessToken: response.data.access,
        refreshToken: response.data.refresh,
        user: { username }
      });

      // Show main app
      showMainApp();

      // Clear login form
      loginForm.reset();
    } else {
      showLoginError('Invalid username or password');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.detail || 'Login failed. Please try again.';
    showLoginError(errorMsg);
  } finally {
    setLoginLoading(false);
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  // Clear auth state
  authState = {
    isAuthenticated: false,
    accessToken: null,
    refreshToken: null,
    user: null
  };

  // Clear stored tokens
  await window.electronAPI.clearTokens();

  // Show login screen
  showLoginScreen();
}

/**
 * Show the login screen
 */
function showLoginScreen() {
  loginContainer.style.display = 'flex';
  mainContainer.style.display = 'none';
}

/**
 * Show the main application
 */
function showMainApp() {
  loginContainer.style.display = 'none';
  mainContainer.style.display = 'block';

  // Update user display
  if (authState.user && authState.user.username) {
    currentUserSpan.textContent = authState.user.username;
  }

  // Initialize the app
  initializeMainApp();
}

/**
 * Set login button loading state
 */
function setLoginLoading(loading) {
  loginBtn.disabled = loading;
  loginBtnText.textContent = loading ? 'Signing in...' : 'Sign In';
  loginSpinner.style.display = loading ? 'inline-block' : 'none';
}

/**
 * Show login error message
 */
function showLoginError(message) {
  loginError.textContent = message;
  loginError.style.display = 'block';
}

/**
 * Hide login error message
 */
function hideLoginError() {
  loginError.style.display = 'none';
}

// Event listeners for auth
loginForm.addEventListener('submit', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

// ====================
// Token Refresh Timer
// ====================
let tokenRefreshInterval = null;

function startTokenRefreshTimer() {
  // Refresh token every 25 minutes (access token expires at 30 min)
  tokenRefreshInterval = setInterval(async () => {
    if (authState.isAuthenticated && authState.refreshToken) {
      const refreshed = await refreshAccessToken(authState.refreshToken);
      if (!refreshed) {
        // Token refresh failed, logout user
        handleLogout();
      }
    }
  }, 25 * 60 * 1000); // 25 minutes
}

function stopTokenRefreshTimer() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
}

// ====================
// Main App Initialization
// ====================
function initializeMainApp() {
  startTokenRefreshTimer();

  // Update online status
  setTimeout(updateOnlineStatus, 1000);

  // Load patients if on list tab
  if (document.getElementById('list-tab').classList.contains('active')) {
    loadPatients();
  }

  // Load counties for patient registration form
  if (document.getElementById('register-tab').classList.contains('active')) {
    loadCounties();
  }
}

// ====================
// Offline Indicator
// ====================
const offlineIndicator = document.getElementById('offline-indicator');

function updateOnlineStatus() {
  // Try to reach the backend to determine actual connectivity
  checkBackendConnection();
}

async function checkBackendConnection() {
  try {
    const response = await window.electronAPI.apiRequest('GET', '/api/patients/?limit=1');
    setOnlineStatus(true);
  } catch (error) {
    setOnlineStatus(false);
  }
}

function setOnlineStatus(online) {
  isOnline = online;
  if (online) {
    offlineIndicator.style.display = 'none';
    offlineIndicator.classList.add('online-indicator');
    offlineIndicator.innerHTML = '<span class="offline-dot"></span><span>Online</span>';
  } else {
    offlineIndicator.style.display = 'flex';
    offlineIndicator.classList.remove('online-indicator');
    offlineIndicator.innerHTML = '<span class="offline-dot"></span><span>Offline Mode</span>';
  }
}

// Check connection status every 30 seconds
setInterval(updateOnlineStatus, 30000);
// Initial check
setTimeout(updateOnlineStatus, 1000);

// ====================
// Tab Navigation
// ====================
function resetEncounterSelection() {
  selectedPatient = null;

  // Reset patient selection UI
  patientSearchInput.style.display = 'block';
  patientSearchBtn.style.display = 'inline-block';
  patientSearchInput.value = '';
  patientSearchResults.innerHTML = '';
  selectedPatientDiv.style.display = 'none';

  // Reset encounter form UI
  encounterForm.reset();
  encounterForm.style.display = 'none';
  bmiDisplay.style.display = 'none';

  resetTreatmentPlanBuilder();
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Load data for the active tab
    if (tabName === 'list') {
      loadPatients();
    } else if (tabName === 'encounter') {
      // Switching to encounter tab should start in patient-search mode.
      // This avoids leaking selected patient state across flows/tests.
      resetEncounterSelection();

      // Set today's date as default
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('encounter-date').value = today;
    } else if (tabName === 'register') {
      // Load counties when switching to register tab
      loadCounties();
    }
  });
});

// ====================
// Kenya Location Hierarchy (Cascading Dropdowns)
// ====================
const countySelect = document.getElementById('county');
const subCountySelect = document.getElementById('sub-county');
const wardSelect = document.getElementById('ward');

/**
 * Load all counties from the API
 */
async function loadCounties() {
  try {
    const response = await window.electronAPI.apiRequest('GET', '/api/locations/counties/');

    if (response.success) {
      const counties = response.data.results || response.data || [];

      // Clear and populate county dropdown
      countySelect.innerHTML = '<option value="">Select County...</option>';
      counties.forEach(county => {
        const option = document.createElement('option');
        option.value = county.id;
        option.textContent = county.name;
        countySelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Failed to load counties:', error);
  }
}

/**
 * Load sub-counties for a selected county
 */
async function loadSubCounties(countyId) {
  subCountySelect.innerHTML = '<option value="">Loading...</option>';
  subCountySelect.disabled = true;
  wardSelect.innerHTML = '<option value="">Select Ward (Optional)...</option>';
  wardSelect.disabled = true;

  if (!countyId) {
    subCountySelect.innerHTML = '<option value="">Select Sub-County...</option>';
    return;
  }

  try {
    const response = await window.electronAPI.apiRequest('GET', `/api/locations/sub-counties/?county=${countyId}`);

    if (response.success) {
      const subCounties = response.data.results || response.data || [];

      subCountySelect.innerHTML = '<option value="">Select Sub-County...</option>';
      subCounties.forEach(subCounty => {
        const option = document.createElement('option');
        option.value = subCounty.id;
        option.textContent = subCounty.name;
        subCountySelect.appendChild(option);
      });
      subCountySelect.disabled = false;
    }
  } catch (error) {
    console.error('Failed to load sub-counties:', error);
    subCountySelect.innerHTML = '<option value="">Failed to load</option>';
  }
}

/**
 * Load wards for a selected sub-county
 */
async function loadWards(subCountyId) {
  wardSelect.innerHTML = '<option value="">Loading...</option>';
  wardSelect.disabled = true;

  if (!subCountyId) {
    wardSelect.innerHTML = '<option value="">Select Ward (Optional)...</option>';
    return;
  }

  try {
    const response = await window.electronAPI.apiRequest('GET', `/api/locations/wards/?sub_county=${subCountyId}`);

    if (response.success) {
      const wards = response.data.results || response.data || [];

      wardSelect.innerHTML = '<option value="">Select Ward (Optional)...</option>';
      wards.forEach(ward => {
        const option = document.createElement('option');
        option.value = ward.id;
        option.textContent = ward.name;
        wardSelect.appendChild(option);
      });
      wardSelect.disabled = false;
    }
  } catch (error) {
    console.error('Failed to load wards:', error);
    wardSelect.innerHTML = '<option value="">Failed to load</option>';
  }
}

// County change event - load sub-counties
countySelect.addEventListener('change', () => {
  loadSubCounties(countySelect.value);
});

// Sub-county change event - load wards
subCountySelect.addEventListener('change', () => {
  loadWards(subCountySelect.value);
});

// ====================
// Referral Source Toggle
// ====================
const referralSourceSelect = document.getElementById('referral-source');
const referredFromGroup = document.getElementById('referred-from-facility-group');

referralSourceSelect.addEventListener('change', () => {
  if (referralSourceSelect.value === 'other_facility') {
    referredFromGroup.style.display = 'block';
    referredFromGroup.classList.remove('hidden');
  } else {
    referredFromGroup.style.display = 'none';
    referredFromGroup.classList.add('hidden');
    document.getElementById('referred-from-facility').value = '';
  }
});

// ====================
// Patient Registration
// ====================
const patientForm = document.getElementById('patient-form');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');

/**
 * Reset patient form including cascading dropdowns
 */
function resetPatientForm() {
  patientForm.reset();

  // Reset cascading dropdowns
  subCountySelect.innerHTML = '<option value="">Select Sub-County...</option>';
  subCountySelect.disabled = true;
  wardSelect.innerHTML = '<option value="">Select Ward (Optional)...</option>';
  wardSelect.disabled = true;

  // Reset referral source visibility
  referredFromGroup.style.display = 'none';
  referredFromGroup.classList.add('hidden');

  // Hide message
  hideMessage(messageDiv);
}

patientForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';

  const formData = new FormData(patientForm);
  const data = Object.fromEntries(formData.entries());

  // Remove empty fields
  Object.keys(data).forEach(key => {
    if (data[key] === '') {
      delete data[key];
    }
  });

  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/patients/', data);

    if (response.success) {
      showMessage('success', `Patient registered successfully! MRN: ${response.data.mrn}`, messageDiv);
      resetPatientForm();
      // Reload counties for next registration
      loadCounties();
    } else {
      const errorMessage = formatErrorMessage(response.error);
      showMessage('error', `Failed to register patient: ${errorMessage}`, messageDiv);
    }
  } catch (error) {
    showMessage('error', `Error: ${error.message}`, messageDiv);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register Patient';
  }
});

clearBtn.addEventListener('click', () => {
  resetPatientForm();
  loadCounties();
});

// ====================
// Patient List
// ====================
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const patientListDiv = document.getElementById('patient-list');

searchBtn.addEventListener('click', () => {
  loadPatients(searchInput.value);
});

searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    loadPatients(searchInput.value);
  }
});

async function loadPatients(searchQuery = '') {
  patientListDiv.innerHTML = '<p class="loading">Loading patients...</p>';

  try {
    let endpoint = '/api/patients/';
    if (searchQuery) {
      endpoint += `?search=${encodeURIComponent(searchQuery)}`;
    }

    const response = await window.electronAPI.apiRequest('GET', endpoint);

    if (response.success) {
      displayPatients(response.data.results || []);
    } else {
      patientListDiv.innerHTML = '<p class="error">Failed to load patients.</p>';
    }
  } catch (error) {
    patientListDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

function displayPatients(patients) {
  if (patients.length === 0) {
    patientListDiv.innerHTML = '<p class="no-results">No patients found.</p>';
    return;
  }

  const html = patients.map(patient => `
    <div class="patient-card" data-patient-id="${patient.id}">
      <div class="patient-header">
        <h3>${patient.full_name}</h3>
        <span class="mrn">MRN: ${patient.mrn}</span>
      </div>
      <div class="patient-details">
        <div class="detail">
          <span class="label">Age:</span>
          <span class="value">${patient.age} years</span>
        </div>
        <div class="detail">
          <span class="label">Gender:</span>
          <span class="value">${formatGender(patient.gender)}</span>
        </div>
        <div class="detail">
          <span class="label">DOB:</span>
          <span class="value">${formatDate(patient.date_of_birth)}</span>
        </div>
        ${patient.phone_number ? `
        <div class="detail">
          <span class="label">Phone:</span>
          <span class="value">${patient.phone_number}</span>
        </div>
        ` : ''}
      </div>
      <div class="patient-actions">
        <button class="btn-view" onclick="viewPatientDetails(${patient.id})">View Details</button>
        <button class="btn-encounter" onclick="startEncounter(${patient.id}, '${escapeHtml(patient.full_name)}', '${patient.mrn}')">New Encounter</button>
      </div>
    </div>
  `).join('');

  patientListDiv.innerHTML = html;
}

// ====================
// Encounter Management
// ====================
const patientSearchInput = document.getElementById('patient-search');
const patientSearchBtn = document.getElementById('patient-search-btn');
const patientSearchResults = document.getElementById('patient-search-results');
const selectedPatientDiv = document.getElementById('selected-patient');
const encounterForm = document.getElementById('encounter-form');
const encounterMessageDiv = document.getElementById('encounter-message');
const encounterSubmitBtn = document.getElementById('encounter-submit-btn');
const encounterClearBtn = document.getElementById('encounter-clear-btn');

// Patient search for encounter
patientSearchBtn.addEventListener('click', () => {
  searchPatientsForEncounter(patientSearchInput.value);
});

patientSearchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchPatientsForEncounter(patientSearchInput.value);
  }
});

async function searchPatientsForEncounter(query) {
  if (!query) {
    patientSearchResults.innerHTML = '<p class="no-results">Enter a name or MRN to search.</p>';
    return;
  }

  patientSearchResults.innerHTML = '<p class="loading">Searching...</p>';

  try {
    const response = await window.electronAPI.apiRequest('GET', `/api/patients/?search=${encodeURIComponent(query)}`);

    if (response.success && response.data.results.length > 0) {
      const html = response.data.results.map(patient => `
        <div class="patient-search-item" onclick="selectPatient(${patient.id}, '${escapeHtml(patient.full_name)}', '${patient.mrn}')">
          <div class="patient-info">
            <span class="patient-name">${patient.full_name}</span>
            <span class="patient-meta">${formatGender(patient.gender)}, ${patient.age} years • MRN: ${patient.mrn}</span>
          </div>
        </div>
      `).join('');
      patientSearchResults.innerHTML = html;
    } else {
      patientSearchResults.innerHTML = '<p class="no-results">No patients found.</p>';
    }
  } catch (error) {
    patientSearchResults.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

function selectPatient(id, name, mrn) {
  selectedPatient = { id, name, mrn };

  document.getElementById('selected-patient-name').textContent = name;
  document.getElementById('selected-patient-mrn').textContent = `MRN: ${mrn}`;

  patientSearchResults.innerHTML = '';
  patientSearchInput.style.display = 'none';
  patientSearchBtn.style.display = 'none';
  selectedPatientDiv.style.display = 'flex';
  encounterForm.style.display = 'block';

  initializeTreatmentPlanBuilder();
}

document.getElementById('change-patient-btn').addEventListener('click', () => {
  selectedPatient = null;
  patientSearchInput.style.display = 'block';
  patientSearchBtn.style.display = 'inline-block';
  patientSearchInput.value = '';
  selectedPatientDiv.style.display = 'none';
  encounterForm.style.display = 'none';

  resetTreatmentPlanBuilder();
});

// Start encounter from patient list
function startEncounter(patientId, patientName, patientMrn) {
  // Switch to encounter tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="encounter"]').classList.add('active');

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById('encounter-tab').classList.add('active');

  // Select the patient
  selectPatient(patientId, patientName, patientMrn);

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('encounter-date').value = today;
}

// ====================
// Treatment Plan Builder (Encounter Tab)
// ====================
const treatmentTemplateSelect = document.getElementById('treatment-template-select');
const applyTemplateBtn = document.getElementById('apply-template-btn');
const templatePreview = document.getElementById('template-preview');
const templatePreviewName = document.getElementById('template-preview-name');
const templatePreviewDepartment = document.getElementById('template-preview-department');
const templatePreviewDescription = document.getElementById('template-preview-description');
const templatePreviewInstructions = document.getElementById('template-preview-instructions');
const templatePreviewMedications = document.getElementById('template-preview-medications');
const medicationRowsTbody = document.getElementById('medication-rows');
const addMedicationRowBtn = document.getElementById('add-medication-row-btn');
const followUpDateInput = document.getElementById('follow-up-date');
const followUpPreset7Btn = document.getElementById('follow-up-preset-7');
const followUpPreset14Btn = document.getElementById('follow-up-preset-14');
const followUpPreset30Btn = document.getElementById('follow-up-preset-30');
const instructionsEditor = document.getElementById('patient-instructions-editor');
const referralNeededCheckbox = document.getElementById('referral-needed');
const referralFieldsDiv = document.getElementById('referral-fields');
const referralSpecialtySelect = document.getElementById('referral-specialty');
const referralNotesTextarea = document.getElementById('referral-notes');

let treatmentTemplatesById = new Map();
let hasLoadedTemplates = false;

function getTodayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function addDaysToIsoDate(baseIsoDate, days) {
  const base = baseIsoDate ? new Date(baseIsoDate) : new Date();
  const result = new Date(base);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

function safeJsonParseArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderTemplateDropdown(templates) {
  treatmentTemplateSelect.innerHTML = '<option value="">Select template...</option>';
  if (!templates.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No templates available';
    option.disabled = true;
    treatmentTemplateSelect.appendChild(option);
    return;
  }

  templates.forEach((t) => {
    const option = document.createElement('option');
    option.value = String(t.id);
    option.textContent = t.name;
    treatmentTemplateSelect.appendChild(option);
  });
}

async function loadTreatmentTemplates() {
  if (hasLoadedTemplates) return;
  hasLoadedTemplates = true;

  try {
    const response = await window.electronAPI.apiRequest('GET', '/api/treatment-templates/');
    if (!response.success) {
      renderTemplateDropdown([]);
      return;
    }

    const templates = response.data?.results || response.data || [];
    treatmentTemplatesById = new Map(templates.map((t) => [String(t.id), t]));
    renderTemplateDropdown(templates);
  } catch {
    renderTemplateDropdown([]);
  }
}

function clearTemplatePreview() {
  templatePreview.style.display = 'none';
  templatePreviewName.textContent = '';
  templatePreviewDepartment.textContent = '';
  templatePreviewDescription.textContent = '';
  templatePreviewInstructions.textContent = '';
  templatePreviewMedications.textContent = '';
}

function showTemplatePreview(template) {
  if (!template) {
    clearTemplatePreview();
    return;
  }

  templatePreviewName.textContent = template.name || '';
  templatePreviewDepartment.textContent = template.department ? `Department: ${template.department}` : '';
  templatePreviewDescription.textContent = template.description || '';
  templatePreviewInstructions.textContent = template.default_instructions || '';

  const meds = safeJsonParseArray(template.default_medications);
  if (!meds.length) {
    templatePreviewMedications.textContent = 'None';
  } else {
    templatePreviewMedications.textContent = meds
      .map((m) => {
        const name = m.name || '';
        const dosage = m.dosage ? ` ${m.dosage}` : '';
        const freq = m.frequency ? `, ${m.frequency}` : '';
        const duration = m.duration ? `, ${m.duration}` : '';
        return `${name}${dosage}${freq}${duration}`.trim();
      })
      .filter(Boolean)
      .join('\n');
  }

  templatePreview.style.display = 'block';
}

function createMedicationRow(values = {}) {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="text" class="medication-name" placeholder="e.g., Amoxicillin" value="${escapeAttribute(values.name || '')}"></td>
    <td><input type="text" class="medication-dosage" placeholder="e.g., 500mg" value="${escapeAttribute(values.dosage || '')}"></td>
    <td><input type="text" class="medication-frequency" placeholder="e.g., TDS" value="${escapeAttribute(values.frequency || '')}"></td>
    <td><input type="text" class="medication-duration" placeholder="e.g., 7 days" value="${escapeAttribute(values.duration || '')}"></td>
    <td><button type="button" class="btn btn-secondary btn-sm remove-medication-row-btn">Remove</button></td>
  `;

  row.querySelector('button.remove-medication-row-btn').addEventListener('click', () => {
    row.remove();
  });

  return row;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function setFollowUpMinToday() {
  const today = getTodayIsoDate();
  followUpDateInput.min = today;
  if (followUpDateInput.value && followUpDateInput.value < today) {
    followUpDateInput.value = today;
  }
}

function applyTemplateLocally(template) {
  if (!template) return;

  // Fill medications
  medicationRowsTbody.innerHTML = '';
  const meds = safeJsonParseArray(template.default_medications);
  meds.forEach((m) => {
    medicationRowsTbody.appendChild(createMedicationRow({
      name: m.name || '',
      dosage: m.dosage || '',
      frequency: m.frequency || '',
      duration: m.duration || '',
    }));
  });

  // Follow-up date based on follow_up_days
  if (template.follow_up_days) {
    followUpDateInput.value = addDaysToIsoDate(getTodayIsoDate(), Number(template.follow_up_days));
  }

  // Instructions
  instructionsEditor.textContent = template.default_instructions || '';
}

function getMedicationsFromRows() {
  const rows = Array.from(medicationRowsTbody.querySelectorAll('tr'));
  const meds = rows.map((row) => {
    const name = row.querySelector('input.medication-name')?.value?.trim() || '';
    const dosage = row.querySelector('input.medication-dosage')?.value?.trim() || '';
    const frequency = row.querySelector('input.medication-frequency')?.value?.trim() || '';
    const duration = row.querySelector('input.medication-duration')?.value?.trim() || '';
    return { name, dosage, frequency, duration };
  });

  return meds.filter((m) => m.name || m.dosage || m.frequency || m.duration);
}

function buildTreatmentPlanPayload(encounterId) {
  const templateId = treatmentTemplateSelect.value ? Number(treatmentTemplateSelect.value) : null;
  const medications = getMedicationsFromRows();
  const followUpDate = followUpDateInput.value || null;
  const followUpInstructions = (instructionsEditor.innerHTML || '').trim();
  const referralNeeded = Boolean(referralNeededCheckbox.checked);
  const referralSpecialty = referralNeeded ? (referralSpecialtySelect.value || '') : '';
  const referralNotes = referralNeeded ? (referralNotesTextarea.value || '') : '';

  const hasAnyData = Boolean(
    templateId ||
    medications.length ||
    followUpDate ||
    followUpInstructions ||
    referralNeeded
  );

  if (!hasAnyData) return null;

  const payload = {
    encounter: encounterId,
    status: 'ACTIVE',
    medications_json: medications.length ? JSON.stringify(medications) : '',
    follow_up_date: followUpDate,
    follow_up_instructions: followUpInstructions,
    referral_needed: referralNeeded,
    referral_specialty: referralSpecialty,
    referral_notes: referralNotes,
  };

  if (templateId) payload.template = templateId;
  return payload;
}

async function upsertTreatmentPlan(encounterId, payload) {
  const url = `/api/encounters/${encounterId}/treatment-plan/`;

  try {
    const createResponse = await window.electronAPI.apiRequest('POST', url, payload);
    if (createResponse.success) return { success: true, created: true };

    // If a plan already exists, PATCH it.
    const patchResponse = await window.electronAPI.apiRequest('PATCH', url, payload);
    return { success: Boolean(patchResponse.success), created: false };
  } catch {
    try {
      const patchResponse = await window.electronAPI.apiRequest('PATCH', url, payload);
      return { success: Boolean(patchResponse.success), created: false };
    } catch {
      return { success: false, created: false };
    }
  }
}

function resetTreatmentPlanBuilder() {
  if (!treatmentTemplateSelect) return;

  treatmentTemplateSelect.value = '';
  clearTemplatePreview();
  medicationRowsTbody.innerHTML = '';
  followUpDateInput.value = '';
  instructionsEditor.innerHTML = '';
  referralNeededCheckbox.checked = false;
  referralFieldsDiv.style.display = 'none';
  referralSpecialtySelect.value = '';
  referralNotesTextarea.value = '';
  setFollowUpMinToday();
}

function initializeTreatmentPlanBuilder() {
  if (!treatmentTemplateSelect) return;

  setFollowUpMinToday();
  loadTreatmentTemplates();
}

// Template selection updates preview
if (treatmentTemplateSelect) {
  treatmentTemplateSelect.addEventListener('change', () => {
    const template = treatmentTemplatesById.get(String(treatmentTemplateSelect.value));
    showTemplatePreview(template);
  });
}

// Apply template button fills values locally
if (applyTemplateBtn) {
  applyTemplateBtn.addEventListener('click', () => {
    const template = treatmentTemplatesById.get(String(treatmentTemplateSelect.value));
    showTemplatePreview(template);
    applyTemplateLocally(template);
  });
}

if (addMedicationRowBtn) {
  addMedicationRowBtn.addEventListener('click', () => {
    medicationRowsTbody.appendChild(createMedicationRow());
  });
}

function wireFollowUpPreset(btn, days) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    followUpDateInput.value = addDaysToIsoDate(getTodayIsoDate(), days);
  });
}

wireFollowUpPreset(followUpPreset7Btn, 7);
wireFollowUpPreset(followUpPreset14Btn, 14);
wireFollowUpPreset(followUpPreset30Btn, 30);

// Simple rich text toolbar
document.querySelectorAll('[data-rte-cmd]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cmd = btn.getAttribute('data-rte-cmd');
    if (!cmd) return;
    instructionsEditor.focus();
    document.execCommand(cmd, false, null);
  });
});

// Referral toggle
if (referralNeededCheckbox) {
  referralNeededCheckbox.addEventListener('change', () => {
    if (referralNeededCheckbox.checked) {
      referralFieldsDiv.style.display = 'block';
    } else {
      referralFieldsDiv.style.display = 'none';
      referralSpecialtySelect.value = '';
      referralNotesTextarea.value = '';
    }
  });
}

// BMI Calculation
const weightInput = document.getElementById('weight');
const heightInput = document.getElementById('height');
const bmiDisplay = document.getElementById('bmi-display');
const bmiValue = document.getElementById('bmi-value');
const bmiCategory = document.getElementById('bmi-category');

function calculateBMI() {
  const weight = parseFloat(weightInput.value);
  const height = parseFloat(heightInput.value);

  if (weight && height && height > 0) {
    const heightInMeters = height / 100;
    const bmi = (weight / (heightInMeters * heightInMeters)).toFixed(1);

    bmiValue.textContent = bmi;
    bmiCategory.textContent = getBMICategory(bmi);
    bmiCategory.className = 'bmi-category ' + getBMICategoryClass(bmi);
    bmiDisplay.style.display = 'flex';
  } else {
    bmiDisplay.style.display = 'none';
  }
}

function getBMICategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

function getBMICategoryClass(bmi) {
  if (bmi < 18.5) return 'bmi-underweight';
  if (bmi < 25) return 'bmi-normal';
  if (bmi < 30) return 'bmi-overweight';
  return 'bmi-obese';
}

weightInput.addEventListener('input', calculateBMI);
heightInput.addEventListener('input', calculateBMI);

// Encounter form submission
encounterForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!selectedPatient) {
    showMessage('error', 'Please select a patient first.', encounterMessageDiv);
    return;
  }

  encounterSubmitBtn.disabled = true;
  encounterSubmitBtn.textContent = 'Saving...';

  const formData = new FormData(encounterForm);
  const data = Object.fromEntries(formData.entries());
  data.patient = selectedPatient.id;

  // Capture treatment plan payload BEFORE we mutate/reset the form
  // (encounterId will be added after encounter creation)
  const treatmentPlanDraft = {
    templateId: treatmentTemplateSelect?.value ? Number(treatmentTemplateSelect.value) : null,
    medications: getMedicationsFromRows(),
    followUpDate: followUpDateInput?.value || null,
    followUpInstructions: (instructionsEditor?.innerHTML || '').trim(),
    referralNeeded: Boolean(referralNeededCheckbox?.checked),
    referralSpecialty: referralSpecialtySelect?.value || '',
    referralNotes: referralNotesTextarea?.value || '',
  };

  // Remove empty fields and convert numbers
  Object.keys(data).forEach(key => {
    if (data[key] === '') {
      delete data[key];
    } else if (['temperature', 'pulse', 'respiratory_rate', 'weight', 'height', 'spo2'].includes(key)) {
      data[key] = parseFloat(data[key]);
    }
  });

  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/encounters/', data);

    if (response.success) {
      const encounterId = response.data?.id;

      // Save treatment plan (if any) after encounter creation
      if (encounterId) {
        const payload = buildTreatmentPlanPayload(encounterId);
        if (payload) {
          // Use captured draft values instead of reading the DOM after resets
          payload.template = treatmentPlanDraft.templateId || payload.template;
          payload.medications_json = treatmentPlanDraft.medications.length ? JSON.stringify(treatmentPlanDraft.medications) : '';
          payload.follow_up_date = treatmentPlanDraft.followUpDate;
          payload.follow_up_instructions = treatmentPlanDraft.followUpInstructions;
          payload.referral_needed = treatmentPlanDraft.referralNeeded;
          payload.referral_specialty = treatmentPlanDraft.referralNeeded ? treatmentPlanDraft.referralSpecialty : '';
          payload.referral_notes = treatmentPlanDraft.referralNeeded ? treatmentPlanDraft.referralNotes : '';

          await upsertTreatmentPlan(encounterId, payload);
        }
      }

      showMessage('success', `Encounter saved successfully for ${selectedPatient.name}`, encounterMessageDiv);
      encounterForm.reset();
      bmiDisplay.style.display = 'none';
      resetTreatmentPlanBuilder();

      // Reset patient selection for next encounter
      document.getElementById('change-patient-btn').click();
    } else {
      const errorMessage = formatErrorMessage(response.error);
      showMessage('error', `Failed to save encounter: ${errorMessage}`, encounterMessageDiv);
    }
  } catch (error) {
    showMessage('error', `Error: ${error.message}`, encounterMessageDiv);
  } finally {
    encounterSubmitBtn.disabled = false;
    encounterSubmitBtn.textContent = 'Save Encounter';
  }
});

encounterClearBtn.addEventListener('click', () => {
  encounterForm.reset();
  bmiDisplay.style.display = 'none';
  hideMessage(encounterMessageDiv);
});

// ====================
// Patient Details Modal
// ====================
const patientModal = document.getElementById('patient-modal');
const patientModalContent = document.getElementById('patient-modal-content');

document.querySelector('.close-modal').addEventListener('click', closeModal);
patientModal.addEventListener('click', (e) => {
  if (e.target === patientModal) {
    closeModal();
  }
});

function closeModal() {
  patientModal.style.display = 'none';
}

async function viewPatientDetails(patientId) {
  patientModal.style.display = 'flex';
  patientModalContent.innerHTML = '<p class="loading">Loading patient details...</p>';

  try {
    // Fetch patient details
    const patientResponse = await window.electronAPI.apiRequest('GET', `/api/patients/${patientId}/`);

    if (!patientResponse.success) {
      patientModalContent.innerHTML = '<p class="error">Failed to load patient details.</p>';
      return;
    }

    const patient = patientResponse.data;

    // Fetch patient encounters
    const encountersResponse = await window.electronAPI.apiRequest('GET', `/api/encounters/?patient=${patientId}`);
    const encounters = encountersResponse.success ? (encountersResponse.data.results || []) : [];

    patientModalContent.innerHTML = `
      <div class="patient-details-header">
        <div>
          <h2>${patient.full_name}</h2>
          <span class="mrn">MRN: ${patient.mrn}</span>
        </div>
        <button class="view-encounters-btn" onclick="startEncounter(${patient.id}, '${escapeHtml(patient.full_name)}', '${patient.mrn}'); closeModal();">
          New Encounter
        </button>
      </div>

      <div class="patient-info-grid">
        <div class="info-item">
          <span class="info-label">Date of Birth</span>
          <span class="info-value">${formatDate(patient.date_of_birth)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Age</span>
          <span class="info-value">${patient.age} years</span>
        </div>
        <div class="info-item">
          <span class="info-label">Gender</span>
          <span class="info-value">${formatGender(patient.gender)}</span>
        </div>
        ${patient.phone_number ? `
        <div class="info-item">
          <span class="info-label">Phone</span>
          <span class="info-value">${patient.phone_number}</span>
        </div>
        ` : ''}
        ${patient.email ? `
        <div class="info-item">
          <span class="info-label">Email</span>
          <span class="info-value">${patient.email}</span>
        </div>
        ` : ''}
        ${patient.national_id ? `
        <div class="info-item">
          <span class="info-label">National ID</span>
          <span class="info-value">${patient.national_id}</span>
        </div>
        ` : ''}
      </div>

      ${(patient.county_name || patient.sub_county_name || patient.village) ? `
      <div class="patient-section">
        <h4>Location</h4>
        <div class="patient-info-grid">
          ${patient.county_name ? `
          <div class="info-item">
            <span class="info-label">County</span>
            <span class="info-value">${patient.county_name}</span>
          </div>
          ` : ''}
          ${patient.sub_county_name ? `
          <div class="info-item">
            <span class="info-label">Sub-County</span>
            <span class="info-value">${patient.sub_county_name}</span>
          </div>
          ` : ''}
          ${patient.ward_name ? `
          <div class="info-item">
            <span class="info-label">Ward</span>
            <span class="info-value">${patient.ward_name}</span>
          </div>
          ` : ''}
          ${patient.village ? `
          <div class="info-item">
            <span class="info-label">Village/Estate</span>
            <span class="info-value">${patient.village}</span>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      ${patient.emergency_contact_name ? `
      <div class="patient-section">
        <h4>Emergency Contact</h4>
        <div class="patient-info-grid">
          <div class="info-item">
            <span class="info-label">Name</span>
            <span class="info-value">${patient.emergency_contact_name}</span>
          </div>
          ${patient.emergency_contact_phone ? `
          <div class="info-item">
            <span class="info-label">Phone</span>
            <span class="info-value">${patient.emergency_contact_phone}</span>
          </div>
          ` : ''}
          ${patient.emergency_contact_relationship ? `
          <div class="info-item">
            <span class="info-label">Relationship</span>
            <span class="info-value">${formatRelationship(patient.emergency_contact_relationship)}</span>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      <div class="encounter-history">
        <h3>Encounter History (${encounters.length})</h3>
        ${encounters.length === 0 ?
          '<p class="no-results">No encounters recorded.</p>' :
          encounters.map(encounter => renderEncounterCard(encounter)).join('')
        }
      </div>
    `;
  } catch (error) {
    patientModalContent.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

function renderEncounterCard(encounter) {
  const hasCritical = encounter.has_critical_vitals;

  return `
    <div class="encounter-card ${hasCritical ? 'critical' : ''}">
      <div class="encounter-header">
        <span class="encounter-type ${encounter.encounter_type}">${encounter.encounter_type}</span>
        <span class="encounter-date">${formatDate(encounter.encounter_date)}</span>
      </div>

      ${hasCritical ? `
      <div class="critical-alert">
        ⚠️ ${encounter.alerts}
      </div>
      ` : ''}

      ${hasVitals(encounter) ? `
      <div class="encounter-vitals">
        ${encounter.temperature ? `
        <div class="vital-item">
          <span class="vital-label">Temp</span>
          <span class="vital-value ${parseFloat(encounter.temperature) >= 39 ? 'critical' : ''}">${encounter.temperature}°C</span>
        </div>
        ` : ''}
        ${encounter.pulse ? `
        <div class="vital-item">
          <span class="vital-label">Pulse</span>
          <span class="vital-value ${encounter.pulse >= 100 ? 'critical' : ''}">${encounter.pulse} bpm</span>
        </div>
        ` : ''}
        ${encounter.blood_pressure ? `
        <div class="vital-item">
          <span class="vital-label">BP</span>
          <span class="vital-value">${encounter.blood_pressure}</span>
        </div>
        ` : ''}
        ${encounter.respiratory_rate ? `
        <div class="vital-item">
          <span class="vital-label">RR</span>
          <span class="vital-value">${encounter.respiratory_rate}</span>
        </div>
        ` : ''}
        ${encounter.spo2 ? `
        <div class="vital-item">
          <span class="vital-label">SpO2</span>
          <span class="vital-value ${parseFloat(encounter.spo2) < 95 ? 'critical' : ''}">${encounter.spo2}%</span>
        </div>
        ` : ''}
        ${encounter.bmi ? `
        <div class="vital-item">
          <span class="vital-label">BMI</span>
          <span class="vital-value">${encounter.bmi}</span>
        </div>
        ` : ''}
      </div>
      ` : ''}

      <div class="encounter-complaint">
        <span class="label">Chief Complaint: </span>
        ${encounter.chief_complaint}
      </div>

      ${hasEncounterMedicalHistory(encounter) ? `
      <div class="encounter-medical-history">
        ${encounter.allergies ? `<div class="history-brief"><span class="history-label">Allergies:</span> ${encounter.allergies}</div>` : ''}
        ${encounter.chronic_conditions ? `<div class="history-brief"><span class="history-label">Conditions:</span> ${encounter.chronic_conditions}</div>` : ''}
        ${encounter.current_medications ? `<div class="history-brief"><span class="history-label">Medications:</span> ${encounter.current_medications}</div>` : ''}
      </div>
      ` : ''}

      ${encounter.notes ? `
      <div class="encounter-complaint">
        <span class="label">Notes: </span>
        ${encounter.notes}
      </div>
      ` : ''}
    </div>
  `;
}

function hasEncounterMedicalHistory(encounter) {
  return encounter.allergies || encounter.chronic_conditions ||
         encounter.current_medications || encounter.past_surgeries ||
         encounter.family_history || encounter.social_history;
}

function hasVitals(encounter) {
  return encounter.temperature || encounter.pulse || encounter.blood_pressure ||
         encounter.respiratory_rate || encounter.weight || encounter.height ||
         encounter.spo2;
}

// ====================
// Toast Notification System
// ====================
const toastContainer = document.getElementById('toast-container');

const toastIcons = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
};

const toastTitles = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info'
};

/**
 * Show a toast notification
 * @param {string} type - 'success', 'error', 'warning', or 'info'
 * @param {string} message - The message to display
 * @param {number} duration - Duration in ms (default 5000)
 */
function showToast(type, message, duration = 5000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  toast.innerHTML = `
    <div class="toast-icon">${toastIcons[type] || toastIcons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${toastTitles[type] || 'Notice'}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
  `;

  // Add close button functionality
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => removeToast(toast));

  // Add to container
  toastContainer.appendChild(toast);

  // Auto-remove after duration
  setTimeout(() => removeToast(toast), duration);

  return toast;
}

/**
 * Remove a toast with animation
 */
function removeToast(toast) {
  if (!toast || !toast.parentNode) return;

  toast.style.animation = 'slideOut 0.3s ease-in forwards';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

// ====================
// Helper Functions
// ====================

/**
 * Show message (legacy function - now uses toast)
 */
function showMessage(type, text, targetDiv) {
  // Show toast notification
  showToast(type, text);

  // Also update the legacy message div for compatibility
  if (targetDiv) {
    targetDiv.className = `message ${type}`;
    targetDiv.textContent = text;
    targetDiv.style.display = 'block';
    setTimeout(() => hideMessage(targetDiv), 5000);
  }
}

function hideMessage(targetDiv) {
  targetDiv.style.display = 'none';
}

function formatErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    return Object.entries(error)
      .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
      .join('; ');
  }

  return 'Unknown error';
}

function formatGender(gender) {
  const genderMap = {
    'M': 'Male',
    'F': 'Female',
    'O': 'Other'
  };
  return genderMap[gender] || gender;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatRelationship(relationship) {
  const relationshipMap = {
    'spouse': 'Spouse',
    'parent': 'Parent',
    'sibling': 'Sibling',
    'child': 'Child',
    'friend': 'Friend',
    'other': 'Other'
  };
  return relationshipMap[relationship] || relationship;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Make functions globally available for onclick handlers
window.viewPatientDetails = viewPatientDetails;
window.startEncounter = startEncounter;
window.selectPatient = selectPatient;
window.closeModal = closeModal;
window.showToast = showToast;

// ====================
// App Initialization
// ====================

/**
 * Main initialization function
 */
async function initApp() {
  // Initialize theme first
  initializeTheme();

  // Setup theme toggle button
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // Set max date for date of birth (cannot be in the future)
  const dobInput = document.getElementById('date-of-birth');
  if (dobInput) {
    const today = new Date().toISOString().split('T')[0];
    dobInput.setAttribute('max', today);
  }

  // Initialize authentication
  await initializeApp();
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

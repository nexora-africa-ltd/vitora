/**
 * Vitora HMIS Desktop - Renderer Process
 * 
 * This file handles the UI logic for authentication, patient registration,
 * encounter management, and offline status detection.
 * 
 * Sprint 0.6: Added authentication flow
 */

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
      // Set today's date as default
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('encounter-date').value = today;
    }
  });
});

// ====================
// Patient Registration
// ====================
const patientForm = document.getElementById('patient-form');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');

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
      patientForm.reset();
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
  patientForm.reset();
  hideMessage(messageDiv);
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
}

document.getElementById('change-patient-btn').addEventListener('click', () => {
  selectedPatient = null;
  patientSearchInput.style.display = 'block';
  patientSearchBtn.style.display = 'inline-block';
  patientSearchInput.value = '';
  selectedPatientDiv.style.display = 'none';
  encounterForm.style.display = 'none';
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
  
  // Remove empty fields and convert numbers
  Object.keys(data).forEach(key => {
    if (data[key] === '') {
      delete data[key];
    } else if (['temperature', 'pulse', 'respiratory_rate', 'weight', 'height'].includes(key)) {
      data[key] = parseFloat(data[key]);
    }
  });
  
  try {
    const response = await window.electronAPI.apiRequest('POST', '/api/encounters/', data);
    
    if (response.success) {
      showMessage('success', `Encounter saved successfully for ${selectedPatient.name}`, encounterMessageDiv);
      encounterForm.reset();
      bmiDisplay.style.display = 'none';
      
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
      
      ${encounter.notes ? `
      <div class="encounter-complaint">
        <span class="label">Notes: </span>
        ${encounter.notes}
      </div>
      ` : ''}
    </div>
  `;
}

function hasVitals(encounter) {
  return encounter.temperature || encounter.pulse || encounter.blood_pressure || 
         encounter.respiratory_rate || encounter.weight || encounter.height;
}

// ====================
// Helper Functions
// ====================
function showMessage(type, text, targetDiv) {
  targetDiv.className = `message ${type}`;
  targetDiv.textContent = text;
  targetDiv.style.display = 'block';
  
  setTimeout(() => hideMessage(targetDiv), 5000);
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

// ====================
// App Initialization
// ====================
// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

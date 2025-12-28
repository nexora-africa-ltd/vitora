/**
 * Vitora HMIS Desktop - Renderer Process
 * 
 * This file handles the UI logic for patient registration and management.
 */

// Tab switching
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
    }
  });
});

// Patient registration form
const patientForm = document.getElementById('patient-form');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');

patientForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Disable submit button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';
  
  // Get form data
  const formData = new FormData(patientForm);
  const data = Object.fromEntries(formData.entries());
  
  // Remove empty fields
  Object.keys(data).forEach(key => {
    if (data[key] === '') {
      delete data[key];
    }
  });
  
  try {
    // Make API request
    const response = await window.electronAPI.apiRequest('POST', '/api/patients/', data);
    
    if (response.success) {
      showMessage('success', `Patient registered successfully! MRN: ${response.data.mrn}`);
      patientForm.reset();
    } else {
      const errorMessage = formatErrorMessage(response.error);
      showMessage('error', `Failed to register patient: ${errorMessage}`);
    }
  } catch (error) {
    showMessage('error', `Error: ${error.message}`);
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Register Patient';
  }
});

clearBtn.addEventListener('click', () => {
  patientForm.reset();
  hideMessage();
});

// Patient list
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
    <div class="patient-card">
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
        ${patient.email ? `
        <div class="detail">
          <span class="label">Email:</span>
          <span class="value">${patient.email}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `).join('');
  
  patientListDiv.innerHTML = html;
}

// Helper functions
function showMessage(type, text) {
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
  messageDiv.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(hideMessage, 5000);
}

function hideMessage() {
  messageDiv.style.display = 'none';
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

// Load patients on initial page load if on list tab
if (document.getElementById('list-tab').classList.contains('active')) {
  loadPatients();
}

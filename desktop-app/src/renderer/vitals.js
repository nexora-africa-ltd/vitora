/**
 * Vitora HMIS Desktop - Vitals Module
 *
 * Functions for vital signs calculation, status classification,
 * BMI calculation, and critical alerts.
 *
 * Sprint 1.1-1.2: Vitals Entry Form Enhancement
 */

// ====================
// Vital Signs Configuration (mirroring backend VITAL_RANGES)
// ====================
const VITAL_RANGES = {
  temperature: {
    unit: '°C',
    normal: [36.1, 37.2],
    warning_low: [35.5, 36.0],
    warning_high: [37.3, 38.0],
    critical_low: 35.5,
    critical_high: 38.0,
  },
  pulse: {
    unit: 'bpm',
    normal: [60, 100],
    warning_low: [50, 59],
    warning_high: [101, 120],
    critical_low: 50,
    critical_high: 120,
  },
  bp_systolic: {
    unit: 'mmHg',
    normal: [90, 120],
    warning_low: null,
    warning_high: [121, 139],
    critical_low: 90,
    critical_high: 140,
  },
  bp_diastolic: {
    unit: 'mmHg',
    normal: [60, 80],
    warning_low: null,
    warning_high: [81, 89],
    critical_low: 60,
    critical_high: 90,
  },
  respiratory_rate: {
    unit: '/min',
    normal: [12, 20],
    warning_low: null,
    warning_high: [21, 25],
    critical_low: 12,
    critical_high: 25,
  },
  spo2: {
    unit: '%',
    normal: [95, 100],
    warning_low: [90, 94],
    warning_high: null,
    critical_low: 90,
    critical_high: null,
  },
};

// ====================
// BMI Category Thresholds (WHO standard)
// ====================
const BMI_CATEGORIES = {
  UNDERWEIGHT: { max: 18.5, label: 'Underweight', cssClass: 'bmi-underweight' },
  NORMAL: { min: 18.5, max: 24.9, label: 'Normal', cssClass: 'bmi-normal' },
  OVERWEIGHT: { min: 25, max: 29.9, label: 'Overweight', cssClass: 'bmi-overweight' },
  OBESE: { min: 30, label: 'Obese', cssClass: 'bmi-obese' },
};

// ====================
// BMI Functions
// ====================

/**
 * Calculate BMI from weight (kg) and height (cm)
 * Formula: BMI = weight / (height_in_meters)^2
 * @param {number} weightKg - Weight in kilograms
 * @param {number} heightCm - Height in centimeters
 * @returns {number|null} BMI value rounded to 1 decimal, or null if invalid
 */
function calculateBMIValue(weightKg, heightCm) {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) {
    return null;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Math.round(bmi * 10) / 10;
}

/**
 * Get BMI category based on BMI value (WHO standard)
 * @param {number} bmi - BMI value
 * @returns {object|null} Category object with label and cssClass, or null if invalid
 */
function getBMICategoryObj(bmi) {
  if (bmi === null || bmi === undefined || isNaN(bmi) || bmi <= 0) {
    return null;
  }
  if (bmi < BMI_CATEGORIES.UNDERWEIGHT.max) {
    return BMI_CATEGORIES.UNDERWEIGHT;
  }
  if (bmi >= BMI_CATEGORIES.NORMAL.min && bmi <= BMI_CATEGORIES.NORMAL.max) {
    return BMI_CATEGORIES.NORMAL;
  }
  if (bmi >= BMI_CATEGORIES.OVERWEIGHT.min && bmi <= BMI_CATEGORIES.OVERWEIGHT.max) {
    return BMI_CATEGORIES.OVERWEIGHT;
  }
  if (bmi >= BMI_CATEGORIES.OBESE.min) {
    return BMI_CATEGORIES.OBESE;
  }
  return null;
}

// ====================
// Blood Pressure & MAP Functions
// ====================

/**
 * Calculate Mean Arterial Pressure (MAP) from blood pressure
 * Formula: MAP = (SBP + 2*DBP) / 3
 * @param {number} systolic - Systolic blood pressure
 * @param {number} diastolic - Diastolic blood pressure
 * @returns {number|null} MAP rounded to nearest integer, or null if invalid
 */
function calculateMAP(systolic, diastolic) {
  if (!systolic || !diastolic || systolic <= 0 || diastolic <= 0) {
    return null;
  }
  if (systolic <= diastolic) {
    return null; // Invalid: systolic must be > diastolic
  }
  const map = (systolic + 2 * diastolic) / 3;
  return Math.round(map);
}

/**
 * Parse blood pressure string "120/80" into systolic and diastolic values
 * @param {string} bpString - Blood pressure string (e.g., "120/80")
 * @returns {object|null} Object with systolic and diastolic, or null if invalid
 */
function parseBloodPressure(bpString) {
  if (!bpString || typeof bpString !== 'string') {
    return null;
  }
  const parts = bpString.split('/');
  if (parts.length !== 2) {
    return null;
  }
  const systolic = parseInt(parts[0].trim(), 10);
  const diastolic = parseInt(parts[1].trim(), 10);
  if (isNaN(systolic) || isNaN(diastolic)) {
    return null;
  }
  return { systolic, diastolic };
}

// ====================
// Vital Status Functions
// ====================

/**
 * Get vital status (normal, warning, critical) based on value and vital type
 * @param {string} vital - Vital type (temperature, pulse, spo2, etc.)
 * @param {number} value - Vital value
 * @returns {string} Status: 'normal', 'warning', or 'critical'
 */
function getVitalStatus(vital, value) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'normal'; // No status for missing values
  }

  const ranges = VITAL_RANGES[vital];
  if (!ranges) {
    return 'normal'; // Unknown vital type
  }

  // Check critical thresholds first (most severe)
  if (ranges.critical_low !== null && value < ranges.critical_low) {
    return 'critical';
  }
  if (ranges.critical_high !== null && value > ranges.critical_high) {
    return 'critical';
  }

  // Check warning thresholds
  if (ranges.warning_low && value >= ranges.warning_low[0] && value <= ranges.warning_low[1]) {
    return 'warning';
  }
  if (ranges.warning_high && value >= ranges.warning_high[0] && value <= ranges.warning_high[1]) {
    return 'warning';
  }

  // Check normal range
  if (ranges.normal && value >= ranges.normal[0] && value <= ranges.normal[1]) {
    return 'normal';
  }

  // If outside normal but not in warning/critical ranges, mark as warning
  return 'warning';
}

/**
 * Get CSS class based on vital status
 * @param {string} status - Status: 'normal', 'warning', or 'critical'
 * @returns {string} CSS class name
 */
function getVitalCssClass(status) {
  const classMap = {
    normal: 'vital-normal',
    warning: 'vital-warning',
    critical: 'vital-critical',
  };
  return classMap[status] || '';
}

// ====================
// Critical Alerts Functions
// ====================

/**
 * Check if any vital has critical status
 * @param {object} vitals - Object with vital values
 * @returns {boolean} True if any vital is critical
 */
function hasCriticalVitals(vitals) {
  const vitalChecks = [
    { name: 'temperature', value: vitals.temperature },
    { name: 'pulse', value: vitals.pulse },
    { name: 'respiratory_rate', value: vitals.respiratory_rate },
    { name: 'spo2', value: vitals.spo2 },
  ];

  // Handle blood pressure separately
  if (vitals.blood_pressure) {
    const bp = parseBloodPressure(vitals.blood_pressure);
    if (bp) {
      vitalChecks.push({ name: 'bp_systolic', value: bp.systolic });
      vitalChecks.push({ name: 'bp_diastolic', value: bp.diastolic });
    }
  }

  return vitalChecks.some(({ name, value }) => getVitalStatus(name, value) === 'critical');
}

/**
 * Get list of critical vitals with their values
 * @param {object} vitals - Object with vital values
 * @returns {Array} Array of critical vital objects with name, label, value, unit
 */
function getCriticalVitalsList(vitals) {
  const criticalList = [];

  const vitalChecks = [
    { name: 'temperature', label: 'Temperature', value: vitals.temperature, unit: '°C' },
    { name: 'pulse', label: 'Pulse', value: vitals.pulse, unit: 'bpm' },
    { name: 'respiratory_rate', label: 'Respiratory Rate', value: vitals.respiratory_rate, unit: '/min' },
    { name: 'spo2', label: 'SpO2', value: vitals.spo2, unit: '%' },
  ];

  vitalChecks.forEach(({ name, label, value, unit }) => {
    if (getVitalStatus(name, value) === 'critical') {
      criticalList.push({ name, label, value, unit });
    }
  });

  // Check blood pressure
  if (vitals.blood_pressure) {
    const bp = parseBloodPressure(vitals.blood_pressure);
    if (bp) {
      if (getVitalStatus('bp_systolic', bp.systolic) === 'critical') {
        criticalList.push({ name: 'bp_systolic', label: 'Systolic BP', value: bp.systolic, unit: 'mmHg' });
      }
      if (getVitalStatus('bp_diastolic', bp.diastolic) === 'critical') {
        criticalList.push({ name: 'bp_diastolic', label: 'Diastolic BP', value: bp.diastolic, unit: 'mmHg' });
      }
    }
  }

  return criticalList;
}

// ====================
// Module Exports
// ====================
module.exports = {
  // Constants
  VITAL_RANGES,
  BMI_CATEGORIES,

  // BMI Functions
  calculateBMIValue,
  getBMICategoryObj,

  // Blood Pressure & MAP
  calculateMAP,
  parseBloodPressure,

  // Vital Status
  getVitalStatus,
  getVitalCssClass,

  // Critical Alerts
  hasCriticalVitals,
  getCriticalVitalsList,
};

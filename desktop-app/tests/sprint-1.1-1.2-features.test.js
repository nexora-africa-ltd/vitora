/**
 * Unit Tests for Sprint 1.1-1.2 Frontend Features - Vitals Entry Enhancement
 *
 * Tests for BMI calculation, vital status classification, MAP calculation,
 * and critical alerts functionality.
 *
 * TDD approach: These tests define the expected behavior BEFORE implementation.
 * Tests should FAIL initially (Red phase), then pass after implementation (Green phase).
 *
 * Functions under test (to be implemented in src/renderer/vitals.js):
 * - calculateBMIValue(weightKg, heightCm)
 * - getBMICategoryObj(bmi)
 * - calculateMAP(systolic, diastolic)
 * - getVitalStatus(vital, value)
 * - parseBloodPressure(bpString)
 * - hasCriticalVitals(vitals)
 * - getCriticalVitalsList(vitals)
 * - getVitalCssClass(status)
 */

// Import functions from the vitals module (to be created)
// In browser context, these will be global functions
const vitals = require('../src/renderer/vitals');

// ====================
// Tests: calculateBMIValue
// ====================
describe('calculateBMIValue', () => {
  test('should calculate correct BMI for normal weight person', () => {
    // 70kg, 175cm -> BMI ≈ 22.9
    const bmi = vitals.calculateBMIValue(70, 175);
    expect(bmi).toBeCloseTo(22.9, 1);
  });

  test('should calculate correct BMI for underweight person', () => {
    // 50kg, 175cm -> BMI ≈ 16.3
    const bmi = vitals.calculateBMIValue(50, 175);
    expect(bmi).toBeCloseTo(16.3, 1);
  });

  test('should calculate correct BMI for overweight person', () => {
    // 85kg, 175cm -> BMI ≈ 27.8
    const bmi = vitals.calculateBMIValue(85, 175);
    expect(bmi).toBeCloseTo(27.8, 1);
  });

  test('should calculate correct BMI for obese person', () => {
    // 100kg, 170cm -> BMI ≈ 34.6
    const bmi = vitals.calculateBMIValue(100, 170);
    expect(bmi).toBeCloseTo(34.6, 1);
  });

  test('should return null for zero weight', () => {
    expect(vitals.calculateBMIValue(0, 175)).toBeNull();
  });

  test('should return null for zero height', () => {
    expect(vitals.calculateBMIValue(70, 0)).toBeNull();
  });

  test('should return null for negative weight', () => {
    expect(vitals.calculateBMIValue(-70, 175)).toBeNull();
  });

  test('should return null for negative height', () => {
    expect(vitals.calculateBMIValue(70, -175)).toBeNull();
  });

  test('should return null for null weight', () => {
    expect(vitals.calculateBMIValue(null, 175)).toBeNull();
  });

  test('should return null for undefined height', () => {
    expect(vitals.calculateBMIValue(70, undefined)).toBeNull();
  });

  test('should round BMI to 1 decimal place', () => {
    // 67kg, 172cm -> BMI = 22.648... should round to 22.6
    const bmi = vitals.calculateBMIValue(67, 172);
    expect(bmi).toBe(22.6);
  });
});

// ====================
// Tests: getBMICategoryObj
// ====================
describe('getBMICategoryObj', () => {
  test('should return Underweight for BMI < 18.5', () => {
    const category = vitals.getBMICategoryObj(17.0);
    expect(category.label).toBe('Underweight');
    expect(category.cssClass).toBe('bmi-underweight');
  });

  test('should return Normal for BMI 18.5-24.9', () => {
    const category = vitals.getBMICategoryObj(22.0);
    expect(category.label).toBe('Normal');
    expect(category.cssClass).toBe('bmi-normal');
  });

  test('should return Normal for BMI at lower boundary (18.5)', () => {
    const category = vitals.getBMICategoryObj(18.5);
    expect(category.label).toBe('Normal');
  });

  test('should return Normal for BMI at upper boundary (24.9)', () => {
    const category = vitals.getBMICategoryObj(24.9);
    expect(category.label).toBe('Normal');
  });

  test('should return Overweight for BMI 25-29.9', () => {
    const category = vitals.getBMICategoryObj(27.5);
    expect(category.label).toBe('Overweight');
    expect(category.cssClass).toBe('bmi-overweight');
  });

  test('should return Obese for BMI >= 30', () => {
    const category = vitals.getBMICategoryObj(32.0);
    expect(category.label).toBe('Obese');
    expect(category.cssClass).toBe('bmi-obese');
  });

  test('should return null for null BMI', () => {
    expect(vitals.getBMICategoryObj(null)).toBeNull();
  });

  test('should return null for negative BMI', () => {
    expect(vitals.getBMICategoryObj(-5)).toBeNull();
  });

  test('should return null for zero BMI', () => {
    expect(vitals.getBMICategoryObj(0)).toBeNull();
  });

  test('should return null for NaN', () => {
    expect(vitals.getBMICategoryObj(NaN)).toBeNull();
  });
});

// ====================
// Tests: calculateMAP
// ====================
describe('calculateMAP', () => {
  test('should calculate correct MAP for normal BP 120/80', () => {
    // MAP = (120 + 2*80) / 3 = 93.33 -> 93
    const map = vitals.calculateMAP(120, 80);
    expect(map).toBe(93);
  });

  test('should calculate correct MAP for high BP 150/95', () => {
    // MAP = (150 + 2*95) / 3 = 113.33 -> 113
    const map = vitals.calculateMAP(150, 95);
    expect(map).toBe(113);
  });

  test('should calculate correct MAP for low BP 90/60', () => {
    // MAP = (90 + 2*60) / 3 = 70
    const map = vitals.calculateMAP(90, 60);
    expect(map).toBe(70);
  });

  test('should return null for zero systolic', () => {
    expect(vitals.calculateMAP(0, 80)).toBeNull();
  });

  test('should return null for zero diastolic', () => {
    expect(vitals.calculateMAP(120, 0)).toBeNull();
  });

  test('should return null when systolic equals diastolic', () => {
    expect(vitals.calculateMAP(100, 100)).toBeNull();
  });

  test('should return null when systolic < diastolic (invalid)', () => {
    expect(vitals.calculateMAP(80, 100)).toBeNull();
  });

  test('should return null for null values', () => {
    expect(vitals.calculateMAP(null, 80)).toBeNull();
    expect(vitals.calculateMAP(120, null)).toBeNull();
  });

  test('should round MAP to nearest integer', () => {
    // MAP = (125 + 2*82) / 3 = 96.33 -> 96
    const map = vitals.calculateMAP(125, 82);
    expect(map).toBe(96);
  });
});

// ====================
// Tests: getVitalStatus - Temperature
// ====================
describe('getVitalStatus - Temperature', () => {
  test('should return normal for temperature 36.5°C', () => {
    expect(vitals.getVitalStatus('temperature', 36.5)).toBe('normal');
  });

  test('should return normal for temperature at lower boundary 36.1°C', () => {
    expect(vitals.getVitalStatus('temperature', 36.1)).toBe('normal');
  });

  test('should return normal for temperature at upper boundary 37.2°C', () => {
    expect(vitals.getVitalStatus('temperature', 37.2)).toBe('normal');
  });

  test('should return warning for low temperature 35.8°C', () => {
    expect(vitals.getVitalStatus('temperature', 35.8)).toBe('warning');
  });

  test('should return warning for high temperature 37.5°C', () => {
    expect(vitals.getVitalStatus('temperature', 37.5)).toBe('warning');
  });

  test('should return critical for very low temperature 35.0°C', () => {
    expect(vitals.getVitalStatus('temperature', 35.0)).toBe('critical');
  });

  test('should return critical for high fever 38.5°C', () => {
    expect(vitals.getVitalStatus('temperature', 38.5)).toBe('critical');
  });
});

// ====================
// Tests: getVitalStatus - Pulse
// ====================
describe('getVitalStatus - Pulse', () => {
  test('should return normal for pulse 75 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 75)).toBe('normal');
  });

  test('should return normal for pulse at lower boundary 60 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 60)).toBe('normal');
  });

  test('should return normal for pulse at upper boundary 100 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 100)).toBe('normal');
  });

  test('should return warning for low pulse 55 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 55)).toBe('warning');
  });

  test('should return warning for high pulse 110 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 110)).toBe('warning');
  });

  test('should return critical for very low pulse 45 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 45)).toBe('critical');
  });

  test('should return critical for very high pulse 130 bpm', () => {
    expect(vitals.getVitalStatus('pulse', 130)).toBe('critical');
  });
});

// ====================
// Tests: getVitalStatus - SpO2
// ====================
describe('getVitalStatus - SpO2', () => {
  test('should return normal for SpO2 98%', () => {
    expect(vitals.getVitalStatus('spo2', 98)).toBe('normal');
  });

  test('should return normal for SpO2 100%', () => {
    expect(vitals.getVitalStatus('spo2', 100)).toBe('normal');
  });

  test('should return normal for SpO2 at lower boundary 95%', () => {
    expect(vitals.getVitalStatus('spo2', 95)).toBe('normal');
  });

  test('should return warning for SpO2 92%', () => {
    expect(vitals.getVitalStatus('spo2', 92)).toBe('warning');
  });

  test('should return critical for SpO2 88% (very low)', () => {
    expect(vitals.getVitalStatus('spo2', 88)).toBe('critical');
  });

  test('should return critical for SpO2 at critical threshold 89%', () => {
    // 89 is below critical_low of 90
    expect(vitals.getVitalStatus('spo2', 89)).toBe('critical');
  });
});

// ====================
// Tests: getVitalStatus - Respiratory Rate
// ====================
describe('getVitalStatus - Respiratory Rate', () => {
  test('should return normal for respiratory rate 16/min', () => {
    expect(vitals.getVitalStatus('respiratory_rate', 16)).toBe('normal');
  });

  test('should return normal for respiratory rate at boundaries 12-20', () => {
    expect(vitals.getVitalStatus('respiratory_rate', 12)).toBe('normal');
    expect(vitals.getVitalStatus('respiratory_rate', 20)).toBe('normal');
  });

  test('should return warning for respiratory rate 23/min', () => {
    expect(vitals.getVitalStatus('respiratory_rate', 23)).toBe('warning');
  });

  test('should return critical for respiratory rate 10/min (bradypnea)', () => {
    expect(vitals.getVitalStatus('respiratory_rate', 10)).toBe('critical');
  });

  test('should return critical for respiratory rate 28/min (tachypnea)', () => {
    expect(vitals.getVitalStatus('respiratory_rate', 28)).toBe('critical');
  });
});

// ====================
// Tests: getVitalStatus - Blood Pressure
// ====================
describe('getVitalStatus - Blood Pressure', () => {
  test('should return normal for systolic BP 115 mmHg', () => {
    expect(vitals.getVitalStatus('bp_systolic', 115)).toBe('normal');
  });

  test('should return normal for diastolic BP 75 mmHg', () => {
    expect(vitals.getVitalStatus('bp_diastolic', 75)).toBe('normal');
  });

  test('should return warning for systolic BP 135 mmHg (prehypertension)', () => {
    expect(vitals.getVitalStatus('bp_systolic', 135)).toBe('warning');
  });

  test('should return warning for diastolic BP 85 mmHg', () => {
    expect(vitals.getVitalStatus('bp_diastolic', 85)).toBe('warning');
  });

  test('should return critical for systolic BP 85 mmHg (hypotension)', () => {
    expect(vitals.getVitalStatus('bp_systolic', 85)).toBe('critical');
  });

  test('should return critical for systolic BP 145 mmHg (hypertension)', () => {
    expect(vitals.getVitalStatus('bp_systolic', 145)).toBe('critical');
  });

  test('should return critical for diastolic BP 55 mmHg (hypotension)', () => {
    expect(vitals.getVitalStatus('bp_diastolic', 55)).toBe('critical');
  });

  test('should return critical for diastolic BP 95 mmHg (hypertension)', () => {
    expect(vitals.getVitalStatus('bp_diastolic', 95)).toBe('critical');
  });
});

// ====================
// Tests: getVitalStatus - Edge Cases
// ====================
describe('getVitalStatus - Edge Cases', () => {
  test('should return normal for null value', () => {
    expect(vitals.getVitalStatus('temperature', null)).toBe('normal');
  });

  test('should return normal for undefined value', () => {
    expect(vitals.getVitalStatus('pulse', undefined)).toBe('normal');
  });

  test('should return normal for NaN value', () => {
    expect(vitals.getVitalStatus('spo2', NaN)).toBe('normal');
  });

  test('should return normal for unknown vital type', () => {
    expect(vitals.getVitalStatus('unknown_vital', 50)).toBe('normal');
  });
});

// ====================
// Tests: parseBloodPressure
// ====================
describe('parseBloodPressure', () => {
  test('should parse valid BP string "120/80"', () => {
    const bp = vitals.parseBloodPressure('120/80');
    expect(bp).toEqual({ systolic: 120, diastolic: 80 });
  });

  test('should parse BP with spaces "120 / 80"', () => {
    const bp = vitals.parseBloodPressure('120 / 80');
    expect(bp).toEqual({ systolic: 120, diastolic: 80 });
  });

  test('should return null for empty string', () => {
    expect(vitals.parseBloodPressure('')).toBeNull();
  });

  test('should return null for null input', () => {
    expect(vitals.parseBloodPressure(null)).toBeNull();
  });

  test('should return null for invalid format', () => {
    expect(vitals.parseBloodPressure('120-80')).toBeNull();
    expect(vitals.parseBloodPressure('120')).toBeNull();
    expect(vitals.parseBloodPressure('abc/def')).toBeNull();
  });
});

// ====================
// Tests: hasCriticalVitals
// ====================
describe('hasCriticalVitals', () => {
  test('should return false for normal vitals', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
      blood_pressure: '120/80',
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(false);
  });

  test('should return true for critical temperature (high fever)', () => {
    const vitalValues = {
      temperature: 39.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(true);
  });

  test('should return true for critical SpO2 (low oxygen)', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 85,
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(true);
  });

  test('should return true for critical blood pressure (hypotension)', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
      blood_pressure: '85/50',
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(true);
  });

  test('should return true for critical blood pressure (hypertension)', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
      blood_pressure: '180/100',
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(true);
  });

  test('should return false for warning-level vitals', () => {
    const vitalValues = {
      temperature: 37.5, // Warning, not critical
      pulse: 105, // Warning, not critical
      respiratory_rate: 22, // Warning, not critical
      spo2: 93, // Warning, not critical
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(false);
  });

  test('should handle missing vitals', () => {
    const vitalValues = {
      temperature: 36.5,
      // Other vitals missing
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(false);
  });

  test('should return true for critical pulse (bradycardia)', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 40,
      respiratory_rate: 16,
      spo2: 98,
    };
    expect(vitals.hasCriticalVitals(vitalValues)).toBe(true);
  });
});

// ====================
// Tests: getCriticalVitalsList
// ====================
describe('getCriticalVitalsList', () => {
  test('should return empty array for normal vitals', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
    };
    expect(vitals.getCriticalVitalsList(vitalValues)).toEqual([]);
  });

  test('should return list with critical temperature', () => {
    const vitalValues = {
      temperature: 39.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
    };
    const criticals = vitals.getCriticalVitalsList(vitalValues);
    expect(criticals.length).toBe(1);
    expect(criticals[0].name).toBe('temperature');
    expect(criticals[0].value).toBe(39.5);
    expect(criticals[0].label).toBe('Temperature');
  });

  test('should return multiple critical vitals', () => {
    const vitalValues = {
      temperature: 39.5,
      pulse: 45,
      respiratory_rate: 16,
      spo2: 85,
    };
    const criticals = vitals.getCriticalVitalsList(vitalValues);
    expect(criticals.length).toBe(3);
    expect(criticals.map((c) => c.name)).toContain('temperature');
    expect(criticals.map((c) => c.name)).toContain('pulse');
    expect(criticals.map((c) => c.name)).toContain('spo2');
  });

  test('should include critical blood pressure values', () => {
    const vitalValues = {
      temperature: 36.5,
      pulse: 75,
      respiratory_rate: 16,
      spo2: 98,
      blood_pressure: '180/55',
    };
    const criticals = vitals.getCriticalVitalsList(vitalValues);
    expect(criticals.length).toBe(2);
    expect(criticals.map((c) => c.name)).toContain('bp_systolic');
    expect(criticals.map((c) => c.name)).toContain('bp_diastolic');
  });
});

// ====================
// Tests: getVitalCssClass
// ====================
describe('getVitalCssClass', () => {
  test('should return vital-normal class for normal status', () => {
    expect(vitals.getVitalCssClass('normal')).toBe('vital-normal');
  });

  test('should return vital-warning class for warning status', () => {
    expect(vitals.getVitalCssClass('warning')).toBe('vital-warning');
  });

  test('should return vital-critical class for critical status', () => {
    expect(vitals.getVitalCssClass('critical')).toBe('vital-critical');
  });

  test('should return empty string for unknown status', () => {
    expect(vitals.getVitalCssClass('unknown')).toBe('');
  });
});

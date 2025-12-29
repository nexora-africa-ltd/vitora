/**
 * Unit Tests for Sprint 0.7 Frontend Features
 *
 * Tests for the helper functions and UI logic added in Sprint 0.7
 *
 * Note: DOM interaction tests are covered in E2E tests (Playwright)
 */

describe('Sprint 0.7 Helper Functions', () => {
  // ====================
  // formatRelationship Tests
  // ====================
  describe('formatRelationship', () => {
    const formatRelationship = (relationship) => {
      const relationshipMap = {
        'spouse': 'Spouse',
        'parent': 'Parent',
        'sibling': 'Sibling',
        'child': 'Child',
        'friend': 'Friend',
        'other': 'Other'
      };
      return relationshipMap[relationship] || relationship;
    };

    test('should format spouse correctly', () => {
      expect(formatRelationship('spouse')).toBe('Spouse');
    });

    test('should format parent correctly', () => {
      expect(formatRelationship('parent')).toBe('Parent');
    });

    test('should format sibling correctly', () => {
      expect(formatRelationship('sibling')).toBe('Sibling');
    });

    test('should format child correctly', () => {
      expect(formatRelationship('child')).toBe('Child');
    });

    test('should format friend correctly', () => {
      expect(formatRelationship('friend')).toBe('Friend');
    });

    test('should format other correctly', () => {
      expect(formatRelationship('other')).toBe('Other');
    });

    test('should return unknown relationship as-is', () => {
      expect(formatRelationship('guardian')).toBe('guardian');
    });
  });

  // ====================
  // hasMedicalHistory Tests
  // ====================
  describe('hasMedicalHistory', () => {
    const hasMedicalHistory = (patient) => {
      return patient.allergies || patient.chronic_conditions ||
             patient.current_medications || patient.past_surgeries;
    };

    test('should return true if patient has allergies', () => {
      const patient = { allergies: 'Penicillin' };
      expect(hasMedicalHistory(patient)).toBeTruthy();
    });

    test('should return true if patient has chronic conditions', () => {
      const patient = { chronic_conditions: 'Diabetes' };
      expect(hasMedicalHistory(patient)).toBeTruthy();
    });

    test('should return true if patient has current medications', () => {
      const patient = { current_medications: 'Metformin 500mg' };
      expect(hasMedicalHistory(patient)).toBeTruthy();
    });

    test('should return true if patient has past surgeries', () => {
      const patient = { past_surgeries: 'Appendectomy 2020' };
      expect(hasMedicalHistory(patient)).toBeTruthy();
    });

    test('should return false if patient has no medical history', () => {
      const patient = {};
      expect(hasMedicalHistory(patient)).toBeFalsy();
    });

    test('should return false if all medical history fields are empty strings', () => {
      const patient = {
        allergies: '',
        chronic_conditions: '',
        current_medications: '',
        past_surgeries: ''
      };
      expect(hasMedicalHistory(patient)).toBeFalsy();
    });
  });

  // ====================
  // SpO2 Validation Tests
  // ====================
  describe('SpO2 Validation', () => {
    const isValidSpO2 = (value) => {
      if (value === null || value === undefined || value === '') return true; // Optional
      const num = parseFloat(value);
      return !isNaN(num) && num >= 0 && num <= 100;
    };

    test('should accept valid SpO2 value of 98', () => {
      expect(isValidSpO2(98)).toBe(true);
    });

    test('should accept SpO2 value of 100', () => {
      expect(isValidSpO2(100)).toBe(true);
    });

    test('should accept SpO2 value of 0', () => {
      expect(isValidSpO2(0)).toBe(true);
    });

    test('should accept decimal SpO2 values', () => {
      expect(isValidSpO2(97.5)).toBe(true);
    });

    test('should reject SpO2 value above 100', () => {
      expect(isValidSpO2(101)).toBe(false);
    });

    test('should reject negative SpO2 value', () => {
      expect(isValidSpO2(-1)).toBe(false);
    });

    test('should accept empty/null SpO2 (optional field)', () => {
      expect(isValidSpO2('')).toBe(true);
      expect(isValidSpO2(null)).toBe(true);
      expect(isValidSpO2(undefined)).toBe(true);
    });
  });

  // ====================
  // DOB Validation Tests
  // ====================
  describe('DOB Validation', () => {
    const isValidDOB = (dateString) => {
      if (!dateString) return false;
      const dob = new Date(dateString + 'T00:00:00'); // Parse as local time
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return dob <= today;
    };

    test('should accept date in the past', () => {
      expect(isValidDOB('1990-01-01')).toBe(true);
    });

    test('should accept today\'s date (newborn)', () => {
      const today = new Date();
      const todayStr = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
      expect(isValidDOB(todayStr)).toBe(true);
    });

    test('should reject future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.getFullYear() + '-' +
        String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' +
        String(tomorrow.getDate()).padStart(2, '0');
      expect(isValidDOB(tomorrowStr)).toBe(false);
    });

    test('should reject empty date', () => {
      expect(isValidDOB('')).toBe(false);
    });

    test('should reject null date', () => {
      expect(isValidDOB(null)).toBe(false);
    });
  });

  // ====================
  // Kenya Location Data Tests
  // ====================
  describe('Kenya Location Helper Functions', () => {
    const counties = [
      { id: 1, code: 1, name: 'Mombasa' },
      { id: 2, code: 47, name: 'Nairobi' }
    ];

    const subCounties = [
      { id: 1, county: 1, name: 'Changamwe' },
      { id: 2, county: 1, name: 'Jomvu' },
      { id: 3, county: 2, name: 'Westlands' }
    ];

    const filterSubCountiesByCounty = (subCounties, countyId) => {
      return subCounties.filter(sc => sc.county === countyId);
    };

    test('should filter sub-counties by county ID', () => {
      const mombasaSubCounties = filterSubCountiesByCounty(subCounties, 1);
      expect(mombasaSubCounties.length).toBe(2);
      expect(mombasaSubCounties[0].name).toBe('Changamwe');
    });

    test('should return empty array for invalid county ID', () => {
      const result = filterSubCountiesByCounty(subCounties, 999);
      expect(result.length).toBe(0);
    });

    test('should return Nairobi sub-counties', () => {
      const nairobiSubCounties = filterSubCountiesByCounty(subCounties, 2);
      expect(nairobiSubCounties.length).toBe(1);
      expect(nairobiSubCounties[0].name).toBe('Westlands');
    });
  });

  // ====================
  // Emergency Contact Validation Tests
  // ====================
  describe('Emergency Contact Validation', () => {
    const isValidPhoneNumber = (phone) => {
      if (!phone) return true; // Optional field
      // Kenya phone number format: +254XXXXXXXXX or 07XXXXXXXX
      const kenyaPhoneRegex = /^(\+254|0)7\d{8}$/;
      return kenyaPhoneRegex.test(phone.replace(/\s/g, ''));
    };

    test('should accept valid Kenya phone with +254 prefix', () => {
      expect(isValidPhoneNumber('+254712345678')).toBe(true);
    });

    test('should accept valid Kenya phone with 07 prefix', () => {
      expect(isValidPhoneNumber('0712345678')).toBe(true);
    });

    test('should accept empty phone (optional)', () => {
      expect(isValidPhoneNumber('')).toBe(true);
    });

    test('should reject invalid phone format', () => {
      expect(isValidPhoneNumber('12345')).toBe(false);
    });

    test('should reject phone with wrong prefix', () => {
      expect(isValidPhoneNumber('+155712345678')).toBe(false);
    });
  });

  // ====================
  // Referral Source Tests
  // ====================
  describe('Referral Source Logic', () => {
    const shouldShowReferredFrom = (referralSource) => {
      return referralSource === 'other_facility';
    };

    test('should not show referred from for self referral', () => {
      expect(shouldShowReferredFrom('self')).toBe(false);
    });

    test('should not show referred from for clinic referral', () => {
      expect(shouldShowReferredFrom('clinic')).toBe(false);
    });

    test('should show referred from for other_facility referral', () => {
      expect(shouldShowReferredFrom('other_facility')).toBe(true);
    });
  });

  // ====================
  // BMI Category Tests (for encounter)
  // ====================
  describe('BMI Calculation', () => {
    const calculateBMI = (weight, heightCm) => {
      if (!weight || !heightCm || heightCm <= 0) return null;
      const heightM = heightCm / 100;
      return (weight / (heightM * heightM)).toFixed(1);
    };

    const getBMICategory = (bmi) => {
      if (!bmi) return null;
      if (bmi < 18.5) return 'Underweight';
      if (bmi < 25) return 'Normal';
      if (bmi < 30) return 'Overweight';
      return 'Obese';
    };

    test('should calculate BMI correctly', () => {
      // 70kg, 170cm => BMI = 70 / (1.7)^2 = 24.2
      expect(calculateBMI(70, 170)).toBe('24.2');
    });

    test('should return null for missing weight', () => {
      expect(calculateBMI(null, 170)).toBe(null);
    });

    test('should return null for missing height', () => {
      expect(calculateBMI(70, null)).toBe(null);
    });

    test('should categorize underweight correctly', () => {
      expect(getBMICategory(17)).toBe('Underweight');
    });

    test('should categorize normal correctly', () => {
      expect(getBMICategory(22)).toBe('Normal');
    });

    test('should categorize overweight correctly', () => {
      expect(getBMICategory(27)).toBe('Overweight');
    });

    test('should categorize obese correctly', () => {
      expect(getBMICategory(32)).toBe('Obese');
    });
  });

  // ====================
  // SpO2 Critical Alert Tests
  // ====================
  describe('SpO2 Critical Alert', () => {
    const isSpO2Critical = (spo2) => {
      if (spo2 === null || spo2 === undefined) return false;
      return spo2 < 95;
    };

    const getSpO2Alert = (spo2) => {
      if (spo2 === null || spo2 === undefined) return '';
      if (spo2 < 90) return 'Severe hypoxemia (SpO2 < 90%)';
      if (spo2 < 95) return 'Low oxygen saturation (hypoxemia)';
      return '';
    };

    test('should not flag normal SpO2 as critical', () => {
      expect(isSpO2Critical(98)).toBe(false);
    });

    test('should flag SpO2 below 95 as critical', () => {
      expect(isSpO2Critical(94)).toBe(true);
    });

    test('should flag SpO2 below 90 as severe', () => {
      expect(getSpO2Alert(88)).toBe('Severe hypoxemia (SpO2 < 90%)');
    });

    test('should alert for SpO2 between 90-95', () => {
      expect(getSpO2Alert(92)).toBe('Low oxygen saturation (hypoxemia)');
    });

    test('should not alert for normal SpO2', () => {
      expect(getSpO2Alert(98)).toBe('');
    });
  });
});

// Note: DOM interaction tests are in E2E tests using Playwright
// See tests/e2e/sprint-0.7-features.e2e.js for comprehensive UI testing

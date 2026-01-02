/**
 * TDD Tests for constants
 * Following TDD approach: Write tests FIRST before implementation
 */
import {
  API_BASE_URL,
  APP_NAME,
  APP_ENV,
  GENDER_OPTIONS,
  REFERRAL_SOURCE_OPTIONS,
  ENCOUNTER_TYPES,
  ENCOUNTER_STATUS,
  VITAL_RANGES,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
} from '@/lib/utils/constants';

describe('constants', () => {
  describe('API configuration', () => {
    it('should have API_BASE_URL defined', () => {
      expect(API_BASE_URL).toBeDefined();
      expect(typeof API_BASE_URL).toBe('string');
    });

    it('should have APP_NAME defined', () => {
      expect(APP_NAME).toBeDefined();
      expect(APP_NAME).toContain('Vitora');
    });

    it('should have APP_ENV defined', () => {
      expect(APP_ENV).toBeDefined();
      expect(['development', 'staging', 'production']).toContain(APP_ENV);
    });
  });

  describe('GENDER_OPTIONS', () => {
    it('should have Male, Female, and Other options', () => {
      expect(GENDER_OPTIONS).toHaveLength(3);
      expect(GENDER_OPTIONS.map((g) => g.value)).toEqual(['M', 'F', 'O']);
    });

    it('should have value and label for each option', () => {
      GENDER_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('label');
      });
    });
  });

  describe('REFERRAL_SOURCE_OPTIONS', () => {
    it('should have self, clinic, and other_facility options', () => {
      expect(REFERRAL_SOURCE_OPTIONS).toHaveLength(3);
      expect(REFERRAL_SOURCE_OPTIONS.map((r) => r.value)).toEqual([
        'self',
        'clinic',
        'other_facility',
      ]);
    });
  });

  describe('ENCOUNTER_TYPES', () => {
    it('should have OPD, IPD, and EMERGENCY types', () => {
      expect(ENCOUNTER_TYPES).toHaveLength(3);
      expect(ENCOUNTER_TYPES.map((e) => e.value)).toEqual(['OPD', 'IPD', 'EMERGENCY']);
    });

    it('should have human readable labels', () => {
      expect(ENCOUNTER_TYPES.find((e) => e.value === 'OPD')?.label).toBe('Outpatient');
      expect(ENCOUNTER_TYPES.find((e) => e.value === 'IPD')?.label).toBe('Inpatient');
      expect(ENCOUNTER_TYPES.find((e) => e.value === 'EMERGENCY')?.label).toBe('Emergency');
    });
  });

  describe('ENCOUNTER_STATUS', () => {
    it('should have all encounter statuses', () => {
      const statuses = ENCOUNTER_STATUS.map((s) => s.value);
      expect(statuses).toContain('DRAFT');
      expect(statuses).toContain('IN_PROGRESS');
      expect(statuses).toContain('COMPLETED');
      expect(statuses).toContain('CANCELLED');
    });

    it('should have color classes for each status', () => {
      ENCOUNTER_STATUS.forEach((status) => {
        expect(status).toHaveProperty('color');
        expect(status.color).toMatch(/bg-/);
      });
    });
  });

  describe('VITAL_RANGES', () => {
    it('should have temperature range', () => {
      expect(VITAL_RANGES.temperature).toEqual({
        min: 36.1,
        max: 37.2,
        unit: '°C',
      });
    });

    it('should have pulse range', () => {
      expect(VITAL_RANGES.pulse).toEqual({
        min: 60,
        max: 100,
        unit: 'bpm',
      });
    });

    it('should have respiratory rate range', () => {
      expect(VITAL_RANGES.respiratoryRate).toEqual({
        min: 12,
        max: 20,
        unit: '/min',
      });
    });

    it('should have SpO2 range with critical threshold', () => {
      expect(VITAL_RANGES.spo2).toEqual({
        min: 95,
        max: 100,
        unit: '%',
        critical: 95,
      });
    });
  });

  describe('Pagination constants', () => {
    it('should have default page size of 10', () => {
      expect(DEFAULT_PAGE_SIZE).toBe(10);
    });

    it('should have page size options', () => {
      expect(PAGE_SIZE_OPTIONS).toEqual([10, 25, 50, 100]);
    });
  });
});

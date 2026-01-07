/**
 * Tests for Dosage Utilities
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

import {
  parseStrength,
  generateDosageSuggestions,
  getSuggestedRoute,
  getUnitDisplayName,
  getRouteOptions,
  getFrequencyOptions,
  getDurationOptions,
} from '@/lib/utils/dosage';
import type { Drug, DrugForm } from '@/lib/types/pharmacy';

// Helper to create a mock drug
function createMockDrug(overrides: Partial<Drug> = {}): Drug {
  return {
    id: 1,
    code: 'DRG-TEST-0001',
    generic_name: 'Test Drug',
    brand_names: ['Brand A'],
    category: 'ANALGESIC',
    form: 'TABLET',
    strength: '500mg',
    unit: 'tablet',
    schedule: 'POM',
    requires_prescription: true,
    is_controlled: false,
    is_narcotic: false,
    keml_code: '1.1.1',
    is_essential: true,
    nhif_code: '',
    default_reorder_level: 50,
    default_reorder_quantity: 100,
    shelf_life_months: 24,
    storage_requirements: 'Store below 25°C',
    reference_price: 10.0,
    is_active: true,
    current_stock: 100,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('parseStrength', () => {
  describe('simple strengths', () => {
    it('should parse simple mg strength', () => {
      const result = parseStrength('500mg');
      expect(result).toEqual({
        value: 500,
        unit: 'mg',
        raw: '500mg',
      });
    });

    it('should parse decimal strength', () => {
      const result = parseStrength('0.5mg');
      expect(result).toEqual({
        value: 0.5,
        unit: 'mg',
        raw: '0.5mg',
      });
    });

    it('should parse gram strength', () => {
      const result = parseStrength('1g');
      expect(result).toEqual({
        value: 1,
        unit: 'g',
        raw: '1g',
      });
    });

    it('should parse mcg strength', () => {
      const result = parseStrength('25mcg');
      expect(result).toEqual({
        value: 25,
        unit: 'mcg',
        raw: '25mcg',
      });
    });

    it('should parse IU strength', () => {
      const result = parseStrength('1000IU');
      expect(result).toEqual({
        value: 1000,
        unit: 'iu',
        raw: '1000IU',
      });
    });

    it('should handle strength with space', () => {
      const result = parseStrength('500 mg');
      expect(result).toEqual({
        value: 500,
        unit: 'mg',
        raw: '500 mg',
      });
    });
  });

  describe('liquid formulations', () => {
    it('should parse liquid strength like 50mg/5ml', () => {
      const result = parseStrength('50mg/5ml');
      expect(result).toEqual({
        value: 50,
        unit: 'mg',
        perVolume: 5,
        volumeUnit: 'ml',
        raw: '50mg/5ml',
      });
    });

    it('should parse liquid strength with total volume', () => {
      const result = parseStrength('250mg/5ml 100ml');
      expect(result).toEqual({
        value: 250,
        unit: 'mg',
        perVolume: 5,
        volumeUnit: 'ml',
        raw: '250mg/5ml 100ml',
      });
    });

    it('should parse liquid with spaces', () => {
      const result = parseStrength('100 mg / 5 ml');
      expect(result).toEqual({
        value: 100,
        unit: 'mg',
        perVolume: 5,
        volumeUnit: 'ml',
        raw: '100 mg / 5 ml',
      });
    });
  });

  describe('combination drugs', () => {
    it('should parse combination strength like 250/125mg', () => {
      const result = parseStrength('250/125mg');
      expect(result).toEqual({
        value: 250,
        unit: 'mg',
        raw: '250/125mg',
      });
    });

    it('should parse combination with space', () => {
      const result = parseStrength('500 / 125 mg');
      // Should fall back to simple pattern or return null
      expect(result).not.toBeNull();
    });
  });

  describe('percentage strengths', () => {
    it('should parse percentage strength', () => {
      const result = parseStrength('0.05%');
      expect(result).toEqual({
        value: 0.05,
        unit: '%',
        raw: '0.05%',
      });
    });

    it('should parse percentage with volume', () => {
      const result = parseStrength('1% 15g');
      expect(result).toEqual({
        value: 1,
        unit: '%',
        raw: '1% 15g',
      });
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(parseStrength('')).toBeNull();
    });

    it('should return null for unparseable string', () => {
      expect(parseStrength('unknown')).toBeNull();
    });

    it('should handle whitespace', () => {
      const result = parseStrength('  500mg  ');
      expect(result?.value).toBe(500);
    });
  });
});

describe('getUnitDisplayName', () => {
  it('should return singular unit name', () => {
    expect(getUnitDisplayName('TABLET')).toBe('tablet');
    expect(getUnitDisplayName('CAPSULE')).toBe('capsule');
    expect(getUnitDisplayName('SYRUP')).toBe('ml');
    expect(getUnitDisplayName('INHALER')).toBe('puff');
    expect(getUnitDisplayName('DROPS')).toBe('drop');
  });

  it('should return plural unit name', () => {
    expect(getUnitDisplayName('TABLET', true)).toBe('tablets');
    expect(getUnitDisplayName('CAPSULE', true)).toBe('capsules');
    expect(getUnitDisplayName('DROPS', true)).toBe('drops');
    expect(getUnitDisplayName('INHALER', true)).toBe('puffs');
  });

  it('should handle ml forms consistently', () => {
    expect(getUnitDisplayName('SYRUP')).toBe('ml');
    expect(getUnitDisplayName('SYRUP', true)).toBe('ml');
    expect(getUnitDisplayName('INJECTION')).toBe('ml');
    expect(getUnitDisplayName('SUSPENSION')).toBe('ml');
  });
});

describe('generateDosageSuggestions', () => {
  describe('tablets and capsules', () => {
    it('should generate dosage options for tablets', () => {
      const drug = createMockDrug({
        form: 'TABLET',
        strength: '500mg',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.value === '500mg')).toBe(true);
      expect(suggestions.some((s) => s.isDefault)).toBe(true);

      // Check that 1 tablet is default
      const defaultSuggestion = suggestions.find((s) => s.isDefault);
      expect(defaultSuggestion?.value).toBe('500mg');
      expect(defaultSuggestion?.label).toContain('1 tablet');
    });

    it('should generate dosage options for capsules', () => {
      const drug = createMockDrug({
        form: 'CAPSULE',
        strength: '250mg',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === '250mg')).toBe(true);
      expect(suggestions.some((s) => s.value === '500mg')).toBe(true); // 2 capsules

      const twoCapsSuggestion = suggestions.find((s) => s.value === '500mg');
      expect(twoCapsSuggestion?.label).toContain('2 capsules');
    });

    it('should skip half tablet for very small doses', () => {
      const drug = createMockDrug({
        form: 'TABLET',
        strength: '5mg',
      });

      const suggestions = generateDosageSuggestions(drug);

      // Should not have 2.5mg suggestion
      expect(suggestions.some((s) => s.value === '2.5mg')).toBe(false);
    });
  });

  describe('liquid formulations', () => {
    it('should generate ml-based options for syrups', () => {
      const drug = createMockDrug({
        form: 'SYRUP',
        strength: '50mg/5ml',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.value === '5ml')).toBe(true);
      expect(suggestions.some((s) => s.value === '10ml')).toBe(true);

      // Check that 5ml shows the mg equivalent
      const fivemlSuggestion = suggestions.find((s) => s.value === '5ml');
      expect(fivemlSuggestion?.label).toContain('50mg');
    });

    it('should handle suspension formulations', () => {
      const drug = createMockDrug({
        form: 'SUSPENSION',
        strength: '125mg/5ml',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.length).toBeGreaterThan(0);
      const defaultSuggestion = suggestions.find((s) => s.isDefault);
      expect(defaultSuggestion?.value).toBe('5ml');
    });
  });

  describe('inhalers', () => {
    it('should generate puff-based options', () => {
      const drug = createMockDrug({
        form: 'INHALER',
        strength: '100mcg',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === '1 puff')).toBe(true);
      expect(suggestions.some((s) => s.value === '2 puffs')).toBe(true);

      // 2 puffs should be default for inhalers
      const defaultSuggestion = suggestions.find((s) => s.isDefault);
      expect(defaultSuggestion?.value).toBe('2 puffs');
    });
  });

  describe('drops', () => {
    it('should generate drop-based options', () => {
      const drug = createMockDrug({
        form: 'DROPS',
        strength: '0.5%',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === '1 drop')).toBe(true);
      expect(suggestions.some((s) => s.value === '2 drops')).toBe(true);

      // 2 drops should be default
      const defaultSuggestion = suggestions.find((s) => s.isDefault);
      expect(defaultSuggestion?.value).toBe('2 drops');
    });
  });

  describe('topicals', () => {
    it('should generate application-based options for creams', () => {
      const drug = createMockDrug({
        form: 'CREAM',
        strength: '1%',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === 'Apply thin layer')).toBe(true);
      expect(suggestions.some((s) => s.value === 'Apply liberally')).toBe(true);
    });

    it('should generate similar options for ointments', () => {
      const drug = createMockDrug({
        form: 'OINTMENT',
        strength: '0.05%',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value.includes('Apply'))).toBe(true);
    });
  });

  describe('injections', () => {
    it('should use strength directly for injections', () => {
      const drug = createMockDrug({
        form: 'INJECTION',
        strength: '250mg vial',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.value).toBe('250mg vial');
    });
  });

  describe('suppositories', () => {
    it('should generate unit-based options', () => {
      const drug = createMockDrug({
        form: 'SUPPOSITORY',
        strength: '500mg',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === '1 suppository')).toBe(true);
    });
  });

  describe('patches', () => {
    it('should generate patch-based options', () => {
      const drug = createMockDrug({
        form: 'PATCH',
        strength: '25mcg/hr',
      });

      const suggestions = generateDosageSuggestions(drug);

      expect(suggestions.some((s) => s.value === '1 patch')).toBe(true);
    });
  });
});

describe('getSuggestedRoute', () => {
  it('should return PO for oral forms', () => {
    expect(getSuggestedRoute('TABLET').value).toBe('PO');
    expect(getSuggestedRoute('CAPSULE').value).toBe('PO');
    expect(getSuggestedRoute('SYRUP').value).toBe('PO');
    expect(getSuggestedRoute('SUSPENSION').value).toBe('PO');
  });

  it('should return IM for injections', () => {
    expect(getSuggestedRoute('INJECTION').value).toBe('IM');
  });

  it('should return TOPICAL for creams and ointments', () => {
    expect(getSuggestedRoute('CREAM').value).toBe('TOPICAL');
    expect(getSuggestedRoute('OINTMENT').value).toBe('TOPICAL');
    expect(getSuggestedRoute('GEL').value).toBe('TOPICAL');
    expect(getSuggestedRoute('PATCH').value).toBe('TOPICAL');
  });

  it('should return INH for inhalers', () => {
    expect(getSuggestedRoute('INHALER').value).toBe('INH');
    expect(getSuggestedRoute('SPRAY').value).toBe('INH');
  });

  it('should return OPTH for drops', () => {
    expect(getSuggestedRoute('DROPS').value).toBe('OPTH');
  });

  it('should return PR for suppositories', () => {
    expect(getSuggestedRoute('SUPPOSITORY').value).toBe('PR');
  });

  it('should include isDefault flag', () => {
    const route = getSuggestedRoute('TABLET');
    expect(route.isDefault).toBe(true);
  });
});

describe('getRouteOptions', () => {
  it('should return all available routes', () => {
    const routes = getRouteOptions();

    expect(routes.length).toBeGreaterThan(8);
    expect(routes.some((r) => r.value === 'PO')).toBe(true);
    expect(routes.some((r) => r.value === 'IV')).toBe(true);
    expect(routes.some((r) => r.value === 'IM')).toBe(true);
    expect(routes.some((r) => r.value === 'SC')).toBe(true);
    expect(routes.some((r) => r.value === 'TOPICAL')).toBe(true);
  });

  it('should include labels', () => {
    const routes = getRouteOptions();
    const poRoute = routes.find((r) => r.value === 'PO');

    expect(poRoute?.label).toBe('Oral (PO)');
  });
});

describe('getFrequencyOptions', () => {
  it('should return standard medical frequencies', () => {
    const frequencies = getFrequencyOptions();

    expect(frequencies.length).toBeGreaterThan(10);
    expect(frequencies.some((f) => f.value === 'OD')).toBe(true);
    expect(frequencies.some((f) => f.value === 'BD')).toBe(true);
    expect(frequencies.some((f) => f.value === 'TDS')).toBe(true);
    expect(frequencies.some((f) => f.value === 'STAT')).toBe(true);
    expect(frequencies.some((f) => f.value === 'PRN')).toBe(true);
  });

  it('should include hourly intervals', () => {
    const frequencies = getFrequencyOptions();

    expect(frequencies.some((f) => f.value === 'Q4H')).toBe(true);
    expect(frequencies.some((f) => f.value === 'Q6H')).toBe(true);
    expect(frequencies.some((f) => f.value === 'Q8H')).toBe(true);
    expect(frequencies.some((f) => f.value === 'Q12H')).toBe(true);
  });

  it('should include time-specific options', () => {
    const frequencies = getFrequencyOptions();

    expect(frequencies.some((f) => f.value === 'NOCTE')).toBe(true);
    expect(frequencies.some((f) => f.value === 'MANE')).toBe(true);
  });
});

describe('getDurationOptions', () => {
  it('should return common prescription durations', () => {
    const durations = getDurationOptions();

    expect(durations.length).toBeGreaterThan(5);
    expect(durations.some((d) => d.value === '3 days')).toBe(true);
    expect(durations.some((d) => d.value === '7 days')).toBe(true);
    expect(durations.some((d) => d.value === '14 days')).toBe(true);
    expect(durations.some((d) => d.value === '30 days')).toBe(true);
  });

  it('should include chronic/ongoing option', () => {
    const durations = getDurationOptions();

    expect(durations.some((d) => d.value === 'Ongoing')).toBe(true);
  });
});

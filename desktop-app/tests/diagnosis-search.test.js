/**
 * Unit Tests for Sprint 1.1-1.2 - Diagnosis Search Component
 *
 * Tests for ICD-10 search, autocomplete, recent searches,
 * and diagnosis list management.
 *
 * TDD approach: These tests define the expected behavior BEFORE implementation.
 * Tests should FAIL initially (Red phase), then pass after implementation (Green phase).
 *
 * Functions under test (to be implemented in src/renderer/diagnosis.js):
 * - debounce(fn, delay)
 * - searchICD10(query, apiRequest)
 * - formatICD10Result(code)
 * - getRecentSearches()
 * - addRecentSearch(code)
 * - clearRecentSearches()
 * - createDiagnosisList()
 * - addDiagnosis(list, diagnosis, isPrincipal)
 * - removeDiagnosis(list, codeId)
 * - setPrincipalDiagnosis(list, codeId)
 * - getDiagnosisPayload(list)
 */

// Import functions from the diagnosis module (to be created)
const diagnosis = require('../src/renderer/diagnosis');

// ====================
// Mock localStorage for Node.js test environment
// ====================
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Inject mock before tests
beforeEach(() => {
  localStorageMock.clear();
  diagnosis.setLocalStorage(localStorageMock);
});

// ====================
// Tests: debounce
// ====================
describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should delay function execution', () => {
    const fn = jest.fn();
    const debouncedFn = diagnosis.debounce(fn, 300);

    debouncedFn();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should only execute once for rapid calls', () => {
    const fn = jest.fn();
    const debouncedFn = diagnosis.debounce(fn, 300);

    debouncedFn();
    debouncedFn();
    debouncedFn();

    jest.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should pass arguments to debounced function', () => {
    const fn = jest.fn();
    const debouncedFn = diagnosis.debounce(fn, 300);

    debouncedFn('test', 123);
    jest.advanceTimersByTime(300);

    expect(fn).toHaveBeenCalledWith('test', 123);
  });

  test('should reset timer on subsequent calls', () => {
    const fn = jest.fn();
    const debouncedFn = diagnosis.debounce(fn, 300);

    debouncedFn();
    jest.advanceTimersByTime(200);
    debouncedFn(); // Reset timer
    jest.advanceTimersByTime(200);

    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('should use default delay of 300ms', () => {
    const fn = jest.fn();
    const debouncedFn = diagnosis.debounce(fn);

    debouncedFn();
    jest.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ====================
// Tests: searchICD10
// ====================
describe('searchICD10', () => {
  test('should return empty array for empty query', async () => {
    const mockApiRequest = jest.fn();
    const results = await diagnosis.searchICD10('', mockApiRequest);

    expect(results).toEqual([]);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  test('should return empty array for query shorter than 2 characters', async () => {
    const mockApiRequest = jest.fn();
    const results = await diagnosis.searchICD10('A', mockApiRequest);

    expect(results).toEqual([]);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  test('should call API with search query', async () => {
    const mockApiRequest = jest.fn().mockResolvedValue({
      success: true,
      data: { results: [{ id: 1, code: 'A00.0', short_description: 'Cholera' }] },
    });

    await diagnosis.searchICD10('cholera', mockApiRequest);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/icd10-codes/?search=cholera'
    );
  });

  test('should return formatted results on success', async () => {
    const mockApiRequest = jest.fn().mockResolvedValue({
      success: true,
      data: {
        results: [
          { id: 1, code: 'A00.0', short_description: 'Cholera due to Vibrio cholerae' },
          { id: 2, code: 'A00.1', short_description: 'Cholera due to Vibrio cholerae eltor' },
        ],
      },
    });

    const results = await diagnosis.searchICD10('cholera', mockApiRequest);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      id: 1,
      code: 'A00.0',
      description: 'Cholera due to Vibrio cholerae',
    });
  });

  test('should return empty array on API failure', async () => {
    const mockApiRequest = jest.fn().mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    const results = await diagnosis.searchICD10('cholera', mockApiRequest);

    expect(results).toEqual([]);
  });

  test('should return empty array on API exception', async () => {
    const mockApiRequest = jest.fn().mockRejectedValue(new Error('Network error'));

    const results = await diagnosis.searchICD10('cholera', mockApiRequest);

    expect(results).toEqual([]);
  });

  test('should handle response without results array', async () => {
    const mockApiRequest = jest.fn().mockResolvedValue({
      success: true,
      data: [{ id: 1, code: 'A00.0', short_description: 'Cholera' }],
    });

    const results = await diagnosis.searchICD10('cholera', mockApiRequest);

    expect(results).toHaveLength(1);
    expect(results[0].code).toBe('A00.0');
  });

  test('should trim whitespace from query', async () => {
    const mockApiRequest = jest.fn().mockResolvedValue({
      success: true,
      data: { results: [] },
    });

    await diagnosis.searchICD10('  malaria  ', mockApiRequest);

    expect(mockApiRequest).toHaveBeenCalledWith(
      'GET',
      '/api/icd10-codes/?search=malaria'
    );
  });
});

// ====================
// Tests: formatICD10Result
// ====================
describe('formatICD10Result', () => {
  test('should format ICD-10 code with short_description', () => {
    const code = {
      id: 1,
      code: 'A00.0',
      short_description: 'Cholera due to Vibrio cholerae',
      long_description: 'Some longer description',
    };

    const formatted = diagnosis.formatICD10Result(code);

    expect(formatted).toMatchObject({
      id: 1,
      code: 'A00.0',
      description: 'Cholera due to Vibrio cholerae',
    });
  });

  test('should fallback to long_description if short_description missing', () => {
    const code = {
      id: 2,
      code: 'B50.0',
      long_description: 'Plasmodium falciparum malaria with cerebral complications',
    };

    const formatted = diagnosis.formatICD10Result(code);

    expect(formatted.description).toBe('Plasmodium falciparum malaria with cerebral complications');
  });

  test('should return empty description if both descriptions missing', () => {
    const code = { id: 3, code: 'Z00.0' };

    const formatted = diagnosis.formatICD10Result(code);

    expect(formatted.description).toBe('');
  });

  test('should preserve all original properties', () => {
    const code = {
      id: 4,
      code: 'J18.9',
      short_description: 'Pneumonia, unspecified',
      chapter: 'X',
      category: 'J10-J18',
      is_billable: true,
    };

    const formatted = diagnosis.formatICD10Result(code);

    expect(formatted.chapter).toBe('X');
    expect(formatted.is_billable).toBe(true);
  });
});

// ====================
// Tests: Recent Searches (localStorage)
// ====================
describe('Recent Searches', () => {
  describe('getRecentSearches', () => {
    test('should return empty array when no recent searches', () => {
      const recent = diagnosis.getRecentSearches();
      expect(recent).toEqual([]);
    });

    test('should return stored recent searches', () => {
      localStorageMock.setItem('vitora_recent_icd10', JSON.stringify([
        { code: 'A00.0', description: 'Cholera' },
      ]));

      const recent = diagnosis.getRecentSearches();

      expect(recent).toHaveLength(1);
      expect(recent[0].code).toBe('A00.0');
    });

    test('should return empty array on invalid JSON', () => {
      localStorageMock.setItem('vitora_recent_icd10', 'invalid json');

      const recent = diagnosis.getRecentSearches();

      expect(recent).toEqual([]);
    });
  });

  describe('addRecentSearch', () => {
    test('should add new code to recent searches', () => {
      const code = { id: 1, code: 'A00.0', description: 'Cholera' };

      diagnosis.addRecentSearch(code);

      const recent = diagnosis.getRecentSearches();
      expect(recent).toHaveLength(1);
      expect(recent[0].code).toBe('A00.0');
    });

    test('should add to beginning of list (most recent first)', () => {
      diagnosis.addRecentSearch({ id: 1, code: 'A00.0', description: 'Cholera' });
      diagnosis.addRecentSearch({ id: 2, code: 'B50.0', description: 'Malaria' });

      const recent = diagnosis.getRecentSearches();

      expect(recent[0].code).toBe('B50.0');
      expect(recent[1].code).toBe('A00.0');
    });

    test('should not add duplicates', () => {
      const code = { id: 1, code: 'A00.0', description: 'Cholera' };

      diagnosis.addRecentSearch(code);
      diagnosis.addRecentSearch(code);

      const recent = diagnosis.getRecentSearches();
      expect(recent).toHaveLength(1);
    });

    test('should move existing code to top on re-add', () => {
      diagnosis.addRecentSearch({ id: 1, code: 'A00.0', description: 'Cholera' });
      diagnosis.addRecentSearch({ id: 2, code: 'B50.0', description: 'Malaria' });
      diagnosis.addRecentSearch({ id: 1, code: 'A00.0', description: 'Cholera' });

      const recent = diagnosis.getRecentSearches();

      expect(recent[0].code).toBe('A00.0');
      expect(recent).toHaveLength(2);
    });

    test('should limit to 10 recent searches', () => {
      for (let i = 0; i < 15; i++) {
        diagnosis.addRecentSearch({ id: i, code: `A0${i}.0`, description: `Code ${i}` });
      }

      const recent = diagnosis.getRecentSearches();

      expect(recent).toHaveLength(10);
      expect(recent[0].code).toBe('A014.0'); // Most recent
    });
  });

  describe('clearRecentSearches', () => {
    test('should clear all recent searches', () => {
      diagnosis.addRecentSearch({ id: 1, code: 'A00.0', description: 'Cholera' });
      diagnosis.addRecentSearch({ id: 2, code: 'B50.0', description: 'Malaria' });

      diagnosis.clearRecentSearches();

      const recent = diagnosis.getRecentSearches();
      expect(recent).toEqual([]);
    });
  });
});

// ====================
// Tests: Diagnosis List Management
// ====================
describe('Diagnosis List Management', () => {
  describe('createDiagnosisList', () => {
    test('should create empty diagnosis list', () => {
      const list = diagnosis.createDiagnosisList();

      expect(list).toEqual([]);
    });
  });

  describe('addDiagnosis', () => {
    test('should add diagnosis to list', () => {
      const list = diagnosis.createDiagnosisList();
      const dx = { id: 1, code: 'A00.0', description: 'Cholera' };

      const updatedList = diagnosis.addDiagnosis(list, dx);

      expect(updatedList).toHaveLength(1);
      expect(updatedList[0].code).toBe('A00.0');
    });

    test('should mark first diagnosis as principal by default', () => {
      const list = diagnosis.createDiagnosisList();
      const dx = { id: 1, code: 'A00.0', description: 'Cholera' };

      const updatedList = diagnosis.addDiagnosis(list, dx);

      expect(updatedList[0].is_principal).toBe(true);
    });

    test('should mark subsequent diagnoses as secondary by default', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });

      expect(list[0].is_principal).toBe(true);
      expect(list[1].is_principal).toBe(false);
    });

    test('should allow explicit isPrincipal parameter', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' }, true);

      // New principal should demote old principal
      expect(list.find(d => d.code === 'A00.0').is_principal).toBe(false);
      expect(list.find(d => d.code === 'B50.0').is_principal).toBe(true);
    });

    test('should not add duplicate diagnosis codes', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });

      expect(list).toHaveLength(1);
    });

    test('should add certainty field with default CONFIRMED', () => {
      const list = diagnosis.createDiagnosisList();
      const dx = { id: 1, code: 'A00.0', description: 'Cholera' };

      const updatedList = diagnosis.addDiagnosis(list, dx);

      expect(updatedList[0].certainty).toBe('CONFIRMED');
    });

    test('should preserve custom certainty', () => {
      const list = diagnosis.createDiagnosisList();
      const dx = { id: 1, code: 'A00.0', description: 'Cholera', certainty: 'PROVISIONAL' };

      const updatedList = diagnosis.addDiagnosis(list, dx);

      expect(updatedList[0].certainty).toBe('PROVISIONAL');
    });
  });

  describe('removeDiagnosis', () => {
    test('should remove diagnosis by code', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });

      const updatedList = diagnosis.removeDiagnosis(list, 'A00.0');

      expect(updatedList).toHaveLength(1);
      expect(updatedList[0].code).toBe('B50.0');
    });

    test('should promote next diagnosis to principal if principal removed', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' }); // Principal
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });
      list = diagnosis.addDiagnosis(list, { id: 3, code: 'J18.9', description: 'Pneumonia' });

      const updatedList = diagnosis.removeDiagnosis(list, 'A00.0');

      expect(updatedList[0].is_principal).toBe(true); // B50.0 promoted
    });

    test('should return same list if code not found', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });

      const updatedList = diagnosis.removeDiagnosis(list, 'Z99.9');

      expect(updatedList).toEqual(list);
    });
  });

  describe('setPrincipalDiagnosis', () => {
    test('should set specified diagnosis as principal', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });

      const updatedList = diagnosis.setPrincipalDiagnosis(list, 'B50.0');

      expect(updatedList.find(d => d.code === 'A00.0').is_principal).toBe(false);
      expect(updatedList.find(d => d.code === 'B50.0').is_principal).toBe(true);
    });

    test('should ensure only one principal diagnosis', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });
      list = diagnosis.addDiagnosis(list, { id: 3, code: 'J18.9', description: 'Pneumonia' });

      const updatedList = diagnosis.setPrincipalDiagnosis(list, 'J18.9');

      const principalCount = updatedList.filter(d => d.is_principal).length;
      expect(principalCount).toBe(1);
    });

    test('should return same list if code not found', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });

      const updatedList = diagnosis.setPrincipalDiagnosis(list, 'Z99.9');

      expect(updatedList).toEqual(list);
    });
  });

  describe('getDiagnosisPayload', () => {
    test('should return empty array for empty list', () => {
      const list = diagnosis.createDiagnosisList();
      const payload = diagnosis.getDiagnosisPayload(list);

      expect(payload).toEqual([]);
    });

    test('should format diagnoses for API submission', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, { id: 1, code: 'A00.0', description: 'Cholera' });
      list = diagnosis.addDiagnosis(list, { id: 2, code: 'B50.0', description: 'Malaria' });

      const payload = diagnosis.getDiagnosisPayload(list);

      expect(payload).toHaveLength(2);
      expect(payload[0]).toEqual({
        icd10_code: 1,
        is_principal: true,
        certainty: 'CONFIRMED',
      });
      expect(payload[1]).toEqual({
        icd10_code: 2,
        is_principal: false,
        certainty: 'CONFIRMED',
      });
    });

    test('should include certainty in payload', () => {
      let list = diagnosis.createDiagnosisList();
      list = diagnosis.addDiagnosis(list, {
        id: 1,
        code: 'A00.0',
        description: 'Cholera',
        certainty: 'PROVISIONAL',
      });

      const payload = diagnosis.getDiagnosisPayload(list);

      expect(payload[0].certainty).toBe('PROVISIONAL');
    });
  });
});

// ====================
// Tests: Certainty Levels
// ====================
describe('Diagnosis Certainty', () => {
  test('CERTAINTY_LEVELS should contain valid options', () => {
    expect(diagnosis.CERTAINTY_LEVELS).toContain('CONFIRMED');
    expect(diagnosis.CERTAINTY_LEVELS).toContain('PROVISIONAL');
    expect(diagnosis.CERTAINTY_LEVELS).toContain('DIFFERENTIAL');
    expect(diagnosis.CERTAINTY_LEVELS).toContain('RULED_OUT');
  });

  test('isValidCertainty should validate certainty levels', () => {
    expect(diagnosis.isValidCertainty('CONFIRMED')).toBe(true);
    expect(diagnosis.isValidCertainty('PROVISIONAL')).toBe(true);
    expect(diagnosis.isValidCertainty('INVALID')).toBe(false);
    expect(diagnosis.isValidCertainty('')).toBe(false);
  });
});

// ====================
// Tests: Common Diagnoses (Kenya context)
// ====================
describe('Common Diagnoses', () => {
  test('getCommonDiagnoses should return predefined list', () => {
    const common = diagnosis.getCommonDiagnoses();

    expect(Array.isArray(common)).toBe(true);
    expect(common.length).toBeGreaterThan(0);
  });

  test('common diagnoses should include Kenya-prevalent conditions', () => {
    const common = diagnosis.getCommonDiagnoses();
    const codes = common.map(d => d.code);

    // Common conditions in Kenya
    expect(codes).toContain('B50.9'); // Malaria, unspecified
    expect(codes).toContain('A09'); // Diarrhea/gastroenteritis
    expect(codes).toContain('J06.9'); // Upper respiratory infection
  });

  test('each common diagnosis should have code and description', () => {
    const common = diagnosis.getCommonDiagnoses();

    common.forEach(dx => {
      expect(dx).toHaveProperty('code');
      expect(dx).toHaveProperty('description');
      expect(dx.code).toBeTruthy();
      expect(dx.description).toBeTruthy();
    });
  });
});

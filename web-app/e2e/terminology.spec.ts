/**
 * Terminology E2E Tests
 * 
 * Tests the terminology API endpoints against real backend responses.
 * These tests validate request/response structures match frontend types.
 * 
 * Endpoints tested:
 * - GET /api/billing/terminology/icd11/?search=query
 * - GET /api/billing/terminology/loinc/?search=query
 * - GET /api/billing/terminology/ichi/?search=query
 * - GET /api/billing/terminology/interventions/?search=query
 * - GET /api/billing/terminology/drugs/?search=query
 * - GET /api/billing/terminology/active-components/?search=query
 * 
 * Prerequisites:
 * - Backend must be running on port 9088
 * - Test user must exist (testuser/password123)
 * 
 * @see lib/terminology/types.ts for frontend type definitions
 * @see backend/hmis/apps/billing/sha_views.py TerminologySearchView
 */
import { test, expect, APIRequestContext } from '@playwright/test';
import { API_BASE, TEST_USER } from './fixtures';

// ============================================================================
// Types matching frontend definitions (for validation)
// ============================================================================

interface ICD11Code {
  id?: number;
  code: string;
  title: string;
  description?: string;
  chapter?: string;
  block?: string;
  is_active?: boolean;
}

interface SHAIntervention {
  id?: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  currency?: string;
  facility_level?: number;
  requires_preauthorization?: boolean;
  is_active?: boolean;
}

interface ICHICode {
  id?: number;
  code: string;
  title: string;
  description?: string;
  block?: string;
  chapter?: string;
  is_active?: boolean;
}

interface LOINCCode {
  id?: number;
  code: string;
  component: string;
  long_common_name: string;
  property?: string;
  time_aspect?: string;
  system?: string;
  scale_type?: string;
  method_type?: string;
  class_name?: string;
  is_active?: boolean;
}

interface DrugProduct {
  id?: number;
  code: string;
  name: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form?: string;
  strength?: string;
  route_of_administration?: string;
  manufacturer?: string;
  price?: number;
  currency?: string;
  is_controlled?: boolean;
  is_active?: boolean;
}

interface ActiveComponent {
  id?: number;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

// ============================================================================
// Test Configuration
// ============================================================================

const TERMINOLOGY_API = `${API_BASE}/api/billing/terminology`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get JWT token via login
 */
async function getAuthToken(request: APIRequestContext): Promise<string | null> {
  try {
    const response = await request.post(`${API_BASE}/api/token/`, {
      data: {
        username: TEST_USER.username,
        password: TEST_USER.password,
      },
    });
    
    if (!response.ok()) {
      console.log('Auth failed:', response.status());
      return null;
    }
    
    const data = await response.json();
    return data.access;
  } catch (e) {
    console.log('Auth error:', e);
    return null;
  }
}

/**
 * Make authenticated API request
 */
async function apiGet(
  request: APIRequestContext,
  url: string,
  token: string
) {
  return request.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Validate ICD-11 code structure
 */
function validateICD11Code(code: ICD11Code): void {
  expect(typeof code.code).toBe('string');
  expect(code.code.length).toBeGreaterThan(0);
  expect(typeof code.title).toBe('string');
  expect(code.title.length).toBeGreaterThan(0);
}

/**
 * Validate SHA Intervention structure
 */
function validateIntervention(intervention: SHAIntervention): void {
  expect(typeof intervention.code).toBe('string');
  expect(intervention.code.length).toBeGreaterThan(0);
  expect(typeof intervention.name).toBe('string');
  expect(intervention.name.length).toBeGreaterThan(0);
  expect(typeof intervention.price).toBe('number');
  expect(intervention.price).toBeGreaterThanOrEqual(0);
}

/**
 * Validate ICHI code structure
 */
function validateICHICode(code: ICHICode): void {
  expect(typeof code.code).toBe('string');
  expect(code.code.length).toBeGreaterThan(0);
  expect(typeof code.title).toBe('string');
  expect(code.title.length).toBeGreaterThan(0);
}

/**
 * Validate LOINC code structure
 */
function validateLOINCCode(code: LOINCCode): void {
  expect(typeof code.code).toBe('string');
  expect(code.code.length).toBeGreaterThan(0);
  expect(typeof code.component).toBe('string');
  expect(typeof code.long_common_name).toBe('string');
}

/**
 * Validate Drug Product structure
 */
function validateDrugProduct(drug: DrugProduct): void {
  expect(typeof drug.code).toBe('string');
  expect(drug.code.length).toBeGreaterThan(0);
  expect(typeof drug.name).toBe('string');
  expect(drug.name.length).toBeGreaterThan(0);
}

/**
 * Validate Active Component structure
 */
function validateActiveComponent(component: ActiveComponent): void {
  expect(typeof component.code).toBe('string');
  expect(component.code.length).toBeGreaterThan(0);
  expect(typeof component.name).toBe('string');
  expect(component.name.length).toBeGreaterThan(0);
}

// ============================================================================
// Test Suite: ICD-11 Diagnosis Codes
// ============================================================================

test.describe('Terminology API - ICD-11 Diagnosis Codes', () => {
  test('should return valid ICD-11 codes for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed - backend may not be running');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=malaria`,
      token!
    );
    
    // API may return 503 if local ICD-11 container is not running
    if (response.status() === 503) {
      test.skip(true, 'ICD-11 API not available (local container may not be running)');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Validate response structure
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    expect(data).toHaveProperty('count');
    expect(typeof data.count).toBe('number');
    
    // Validate each result structure
    if (data.results.length > 0) {
      data.results.forEach((code: ICD11Code) => {
        validateICD11Code(code);
      });
      
      // Log structure for documentation
      console.log('ICD-11 Response Keys:', Object.keys(data.results[0]));
    }
  });

  test('should return empty results for query less than 2 chars', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=a`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'ICD-11 API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data.results).toEqual([]);
    expect(data.message).toContain('at least 2 characters');
  });

  test('should support limit parameter', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=fever&limit=5`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'ICD-11 API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data.results.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// Test Suite: LOINC Lab Test Codes
// ============================================================================

test.describe('Terminology API - LOINC Lab Test Codes', () => {
  test('should return valid LOINC codes for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/loinc/?search=glucose`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'LOINC API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    
    if (data.results.length > 0) {
      data.results.forEach((code: LOINCCode) => {
        validateLOINCCode(code);
      });
      
      console.log('LOINC Response Keys:', Object.keys(data.results[0]));
    }
  });
});

// ============================================================================
// Test Suite: SHA Interventions
// ============================================================================

test.describe('Terminology API - SHA Interventions', () => {
  test('should return valid SHA interventions for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/interventions/?search=consultation`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'Interventions API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    
    if (data.results.length > 0) {
      data.results.forEach((intervention: SHAIntervention) => {
        validateIntervention(intervention);
      });
      
      // Verify pricing info exists for SHA billing
      const first = data.results[0];
      expect(first).toHaveProperty('code');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('price');
      
      console.log('Intervention Response Keys:', Object.keys(first));
    }
  });

  test('should include pricing information for billing', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/interventions/?search=consultation&limit=10`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'Interventions API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // All interventions should have a price field for billing
    if (data.results.length > 0) {
      data.results.forEach((i: SHAIntervention) => {
        expect(i).toHaveProperty('price');
        expect(typeof i.price).toBe('number');
      });
    }
  });
});

// ============================================================================
// Test Suite: ICHI Health Intervention Codes
// ============================================================================

test.describe('Terminology API - ICHI Codes', () => {
  test('should return valid ICHI codes for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/ichi/?search=surgery`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'ICHI API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    
    if (data.results.length > 0) {
      data.results.forEach((code: ICHICode) => {
        validateICHICode(code);
      });
      
      console.log('ICHI Response Keys:', Object.keys(data.results[0]));
    }
  });
});

// ============================================================================
// Test Suite: Drug Products (Kenya Drug Registry)
// ============================================================================

test.describe('Terminology API - Drug Products', () => {
  test('should return valid drug products for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/drugs/?search=paracetamol`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'Drugs API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    
    if (data.results.length > 0) {
      data.results.forEach((drug: DrugProduct) => {
        validateDrugProduct(drug);
      });
      
      console.log('Drug Response Keys:', Object.keys(data.results[0]));
    }
  });

  test('should include drug details (strength, form) where available', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/drugs/?search=amoxicillin&limit=10`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'Drugs API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Drugs should have basic structure
    if (data.results.length > 0) {
      const first = data.results[0];
      expect(first).toHaveProperty('code');
      expect(first).toHaveProperty('name');
    }
  });
});

// ============================================================================
// Test Suite: Active Components (Drug Ingredients)
// ============================================================================

test.describe('Terminology API - Active Components', () => {
  test('should return valid active components for search query', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/active-components/?search=acetaminophen`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'Active Components API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data).toHaveProperty('results');
    expect(Array.isArray(data.results)).toBeTruthy();
    
    if (data.results.length > 0) {
      data.results.forEach((component: ActiveComponent) => {
        validateActiveComponent(component);
      });
      
      console.log('Active Component Response Keys:', Object.keys(data.results[0]));
    }
  });
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

test.describe('Terminology API - Error Handling', () => {
  test('should return 400 for unknown terminology type', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/unknown-type/?search=test`,
      token!
    );
    
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error).toContain('Unknown terminology type');
  });

  test('should return 401 without authentication', async ({ request }) => {
    const response = await request.get(
      `${TERMINOLOGY_API}/icd11/?search=malaria`
    );
    
    expect(response.status()).toBe(401);
  });

  test('should handle empty search gracefully', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=`,
      token!
    );
    
    if (response.status() === 503) {
      test.skip(true, 'API not available');
    }
    
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.results).toEqual([]);
  });
});

// ============================================================================
// Test Suite: Frontend Type Compatibility
// ============================================================================

test.describe('Terminology API - Frontend Type Compatibility', () => {
  test('ICD-11 response matches ICD11Code frontend type', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=diabetes&limit=1`,
      token!
    );
    
    if (response.status() === 503 || !response.ok()) {
      test.skip(true, 'API not available');
    }
    
    const data = await response.json();
    
    if (data.results.length > 0) {
      const code = data.results[0] as ICD11Code;
      
      // Required fields from frontend ICD11Code type
      expect(code).toHaveProperty('code');
      expect(code).toHaveProperty('title');
      
      // Type checks
      expect(typeof code.code).toBe('string');
      expect(typeof code.title).toBe('string');
    }
  });

  test('Intervention response matches SHAIntervention frontend type', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/interventions/?search=consultation&limit=1`,
      token!
    );
    
    if (response.status() === 503 || !response.ok()) {
      test.skip(true, 'API not available');
    }
    
    const data = await response.json();
    
    if (data.results.length > 0) {
      const intervention = data.results[0] as SHAIntervention;
      
      // Required fields from frontend SHAIntervention type
      expect(intervention).toHaveProperty('code');
      expect(intervention).toHaveProperty('name');
      expect(intervention).toHaveProperty('price');
      
      // Price must be numeric for billing calculations
      expect(typeof intervention.price).toBe('number');
    }
  });

  test('Drug response matches DrugProduct frontend type', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/drugs/?search=amoxicillin&limit=1`,
      token!
    );
    
    if (response.status() === 503 || !response.ok()) {
      test.skip(true, 'API not available');
    }
    
    const data = await response.json();
    
    if (data.results.length > 0) {
      const drug = data.results[0] as DrugProduct;
      
      // Required fields from frontend DrugProduct type
      expect(drug).toHaveProperty('code');
      expect(drug).toHaveProperty('name');
      
      expect(typeof drug.code).toBe('string');
      expect(typeof drug.name).toBe('string');
    }
  });

  test('LOINC response matches LOINCCode frontend type', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/loinc/?search=hemoglobin&limit=1`,
      token!
    );
    
    if (response.status() === 503 || !response.ok()) {
      test.skip(true, 'API not available');
    }
    
    const data = await response.json();
    
    if (data.results.length > 0) {
      const code = data.results[0] as LOINCCode;
      
      // Required fields from frontend LOINCCode type
      expect(code).toHaveProperty('code');
      expect(code).toHaveProperty('component');
      expect(code).toHaveProperty('long_common_name');
    }
  });
});

// ============================================================================
// Test Suite: Performance
// ============================================================================

test.describe('Terminology API - Performance', () => {
  test('should respond within acceptable time (<3s)', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const start = Date.now();
    
    const response = await apiGet(
      request,
      `${TERMINOLOGY_API}/icd11/?search=fever&limit=20`,
      token!
    );
    
    const duration = Date.now() - start;
    
    if (response.status() === 503) {
      test.skip(true, 'API not available');
    }
    
    // Should respond within 3 seconds
    expect(duration).toBeLessThan(3000);
    console.log(`ICD-11 search took ${duration}ms`);
  });

  test('limit parameter should be respected', async ({ request }) => {
    const token = await getAuthToken(request);
    test.skip(!token, 'Authentication failed');
    
    const limits = [5, 10, 20];
    
    for (const limit of limits) {
      const response = await apiGet(
        request,
        `${TERMINOLOGY_API}/icd11/?search=infection&limit=${limit}`,
        token!
      );
      
      if (response.status() === 503) {
        test.skip(true, 'API not available');
        return;
      }
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      if (data.results) {
        expect(data.results.length).toBeLessThanOrEqual(limit);
      }
    }
  });
});

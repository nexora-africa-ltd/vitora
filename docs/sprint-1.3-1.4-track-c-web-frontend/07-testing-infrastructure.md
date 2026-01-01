# Sprint 1.3-1.4 Track C: Testing Infrastructure

**Part of**: Web Frontend Foundation (Next.js)
**Priority**: P0 (Critical Path)
**Estimated Tests**: Infrastructure tests
**Parallel Track**: 🅰️ Track A (Days 1-2)

---

## Overview

This document covers the testing infrastructure setup including Jest configuration, React Testing Library setup, MSW (Mock Service Worker) for API mocking, test utilities, and Playwright E2E configuration.

---

## 1. Jest Configuration

**jest.config.js**:
```javascript
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  // Add setup file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Test environment
  testEnvironment: 'jsdom',
  
  // Module path aliases matching tsconfig
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  
  // Test patterns
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/e2e/',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  
  // Transform ESM modules
  transformIgnorePatterns: [
    '/node_modules/(?!(axios|@tanstack/react-query)/)',
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './coverage',
      outputName: 'junit.xml',
    }],
  ],
  
  // Max workers for CI
  maxWorkers: process.env.CI ? 2 : '50%',
};

module.exports = createJestConfig(customJestConfig);
```

---

## 2. Jest Setup File

**jest.setup.js**:
```javascript
import '@testing-library/jest-dom';
import { server } from './__tests__/mocks/server';

// Establish API mocking before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after tests
afterAll(() => {
  server.close();
});

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => ({
    get: jest.fn(),
    getAll: jest.fn(),
  }),
  useParams: () => ({}),
}));

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: jest.fn(),
    systemTheme: 'light',
  }),
  ThemeProvider: ({ children }) => children,
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Suppress console errors in tests (optional)
// const originalError = console.error;
// beforeAll(() => {
//   console.error = (...args) => {
//     if (
//       typeof args[0] === 'string' &&
//       args[0].includes('Warning: ReactDOM.render')
//     ) {
//       return;
//     }
//     originalError.call(console, ...args);
//   };
// });
// afterAll(() => {
//   console.error = originalError;
// });
```

---

## 3. MSW Server Setup

**__tests__/mocks/server.ts**:
```typescript
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Setup MSW server with default handlers
export const server = setupServer(...handlers);
```

**__tests__/mocks/handlers.ts**:
```typescript
import { http, HttpResponse } from 'msw';
import { mockPatients, mockEncounters, mockCounties } from './data';

const API_BASE = 'http://127.0.0.1:9088';

export const handlers = [
  // Auth endpoints
  http.post(`${API_BASE}/api/token/`, async ({ request }) => {
    const body = await request.json() as { username: string; password: string };
    
    if (body.username === 'testuser' && body.password === 'password123') {
      return HttpResponse.json({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
      });
    }
    
    return HttpResponse.json(
      { detail: 'Invalid credentials' },
      { status: 401 }
    );
  }),

  http.post(`${API_BASE}/api/token/refresh/`, async ({ request }) => {
    const body = await request.json() as { refresh: string };
    
    if (body.refresh === 'mock-refresh-token') {
      return HttpResponse.json({
        access: 'new-mock-access-token',
      });
    }
    
    return HttpResponse.json(
      { detail: 'Invalid token' },
      { status: 401 }
    );
  }),

  http.post(`${API_BASE}/api/token/verify/`, async ({ request }) => {
    const body = await request.json() as { token: string };
    
    if (body.token.includes('mock')) {
      return new HttpResponse(null, { status: 200 });
    }
    
    return HttpResponse.json(
      { detail: 'Invalid token' },
      { status: 401 }
    );
  }),

  // Patients endpoints
  http.get(`${API_BASE}/api/patients/`, ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('page_size') || '10');
    
    let filtered = mockPatients;
    
    if (search) {
      filtered = mockPatients.filter(
        (p) =>
          p.first_name.toLowerCase().includes(search.toLowerCase()) ||
          p.last_name.toLowerCase().includes(search.toLowerCase()) ||
          p.mrn.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    const start = (page - 1) * pageSize;
    const results = filtered.slice(start, start + pageSize);
    
    return HttpResponse.json({
      count: filtered.length,
      next: start + pageSize < filtered.length ? 'next-url' : null,
      previous: page > 1 ? 'prev-url' : null,
      results,
    });
  }),

  http.get(`${API_BASE}/api/patients/:id/`, ({ params }) => {
    const patient = mockPatients.find((p) => p.id === Number(params.id));
    
    if (!patient) {
      return HttpResponse.json(
        { detail: 'Not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json(patient);
  }),

  http.post(`${API_BASE}/api/patients/`, async ({ request }) => {
    const body = await request.json() as Record<string, any>;
    
    const newPatient = {
      id: mockPatients.length + 1,
      mrn: `MRN-${Date.now()}-0001`,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    return HttpResponse.json(newPatient, { status: 201 });
  }),

  http.patch(`${API_BASE}/api/patients/:id/`, async ({ params, request }) => {
    const patient = mockPatients.find((p) => p.id === Number(params.id));
    const body = await request.json() as Record<string, any>;
    
    if (!patient) {
      return HttpResponse.json(
        { detail: 'Not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json({ ...patient, ...body });
  }),

  http.delete(`${API_BASE}/api/patients/:id/`, ({ params }) => {
    const patient = mockPatients.find((p) => p.id === Number(params.id));
    
    if (!patient) {
      return HttpResponse.json(
        { detail: 'Not found' },
        { status: 404 }
      );
    }
    
    return new HttpResponse(null, { status: 204 });
  }),

  // Encounters endpoints
  http.get(`${API_BASE}/api/encounters/`, ({ request }) => {
    const url = new URL(request.url);
    const patientId = url.searchParams.get('patient');
    
    let filtered = mockEncounters;
    
    if (patientId) {
      filtered = mockEncounters.filter((e) => e.patient === Number(patientId));
    }
    
    return HttpResponse.json({
      count: filtered.length,
      next: null,
      previous: null,
      results: filtered,
    });
  }),

  http.get(`${API_BASE}/api/encounters/:id/`, ({ params }) => {
    const encounter = mockEncounters.find((e) => e.id === Number(params.id));
    
    if (!encounter) {
      return HttpResponse.json(
        { detail: 'Not found' },
        { status: 404 }
      );
    }
    
    return HttpResponse.json(encounter);
  }),

  // Locations endpoints
  http.get(`${API_BASE}/api/locations/counties/`, () => {
    return HttpResponse.json(mockCounties);
  }),

  http.get(`${API_BASE}/api/locations/sub-counties/`, ({ request }) => {
    const url = new URL(request.url);
    const countyId = url.searchParams.get('county');
    
    return HttpResponse.json([
      { id: 1, county: Number(countyId), name: 'Mvita' },
      { id: 2, county: Number(countyId), name: 'Kisauni' },
    ]);
  }),

  http.get(`${API_BASE}/api/locations/wards/`, ({ request }) => {
    const url = new URL(request.url);
    const subCountyId = url.searchParams.get('sub_county');
    
    return HttpResponse.json([
      { id: 1, sub_county: Number(subCountyId), name: 'Tudor' },
      { id: 2, sub_county: Number(subCountyId), name: 'Tononoka' },
    ]);
  }),
];
```

---

## 4. Mock Data

**__tests__/mocks/data.ts**:
```typescript
import { Patient } from '@/lib/types/patient';
import { Encounter } from '@/lib/types/encounter';

export const mockPatients: Patient[] = [
  {
    id: 1,
    mrn: 'MRN-20260101-0001',
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: '1985-06-15',
    gender: 'M',
    phone_number: '+254700000001',
    national_id: '12345678',
    email: 'john.doe@example.com',
    county: 1,
    county_name: 'Mombasa',
    sub_county: 1,
    sub_county_name: 'Mvita',
    ward: 1,
    ward_name: 'Tudor',
    village: 'Tudor Estate',
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '+254700000002',
    emergency_contact_relationship: 'Spouse',
    referral_source: 'self',
    referred_from_facility: '',
    consent_given: true,
    consent_date: '2026-01-01T00:00:00Z',
    is_sensitive: false,
    registered_by: 1,
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  },
  {
    id: 2,
    mrn: 'MRN-20260101-0002',
    first_name: 'Jane',
    last_name: 'Smith',
    date_of_birth: '1990-03-20',
    gender: 'F',
    phone_number: '+254700000003',
    national_id: '87654321',
    email: 'jane.smith@example.com',
    county: 1,
    county_name: 'Mombasa',
    sub_county: 1,
    sub_county_name: 'Kisauni',
    ward: 2,
    ward_name: 'Mtongwe',
    village: 'Mtongwe',
    emergency_contact_name: 'John Smith',
    emergency_contact_phone: '+254700000004',
    emergency_contact_relationship: 'Sibling',
    referral_source: 'clinic',
    referred_from_facility: 'Mombasa Clinic',
    consent_given: true,
    consent_date: '2026-01-01T00:00:00Z',
    is_sensitive: true, // HIV patient
    registered_by: 1,
    created_at: '2026-01-01T11:00:00Z',
    updated_at: '2026-01-01T11:00:00Z',
  },
];

export const mockEncounters: Encounter[] = [
  {
    id: 1,
    patient: 1,
    patient_name: 'John Doe',
    patient_mrn: 'MRN-20260101-0001',
    encounter_type: 'OPD',
    encounter_date: '2026-01-01',
    chief_complaint: 'Persistent headache for 3 days',
    status: 'COMPLETED',
    temperature: 37.2,
    pulse: 78,
    blood_pressure: '120/80',
    respiratory_rate: 16,
    spo2: 98,
    weight: 75,
    height: 175,
    allergies: 'Penicillin',
    chronic_conditions: 'None',
    current_medications: 'None',
    past_surgeries: 'Appendectomy 2010',
    family_history: 'Father had diabetes',
    social_history: 'Non-smoker, occasional alcohol',
    history_of_present_illness: 'Patient reports headache starting 3 days ago...',
    physical_examination: 'Alert and oriented. No focal deficits.',
    assessment: 'Tension headache',
    plan: 'Analgesics and follow-up in 1 week',
    created_by: 1,
    created_by_name: 'Dr. Admin',
    created_at: '2026-01-01T10:30:00Z',
    updated_at: '2026-01-01T11:00:00Z',
  },
  {
    id: 2,
    patient: 1,
    patient_name: 'John Doe',
    patient_mrn: 'MRN-20260101-0001',
    encounter_type: 'EMERGENCY',
    encounter_date: '2025-12-15',
    chief_complaint: 'Chest pain and difficulty breathing',
    status: 'COMPLETED',
    temperature: 36.8,
    pulse: 95,
    blood_pressure: '140/90',
    respiratory_rate: 22,
    spo2: 92, // Critical!
    weight: 75,
    height: 175,
    allergies: 'Penicillin',
    chronic_conditions: 'None',
    current_medications: 'None',
    past_surgeries: 'Appendectomy 2010',
    family_history: 'Father had diabetes',
    social_history: 'Non-smoker, occasional alcohol',
    history_of_present_illness: 'Patient came in with acute onset chest pain...',
    physical_examination: 'Tachycardic, bilateral crackles',
    assessment: 'Suspected acute coronary syndrome',
    plan: 'Admit for observation and workup',
    created_by: 1,
    created_by_name: 'Dr. Admin',
    created_at: '2025-12-15T14:00:00Z',
    updated_at: '2025-12-15T18:00:00Z',
  },
];

export const mockCounties = [
  { id: 1, code: 1, name: 'Mombasa' },
  { id: 2, code: 2, name: 'Kwale' },
  { id: 3, code: 3, name: 'Kilifi' },
  { id: 47, code: 47, name: 'Nairobi' },
];

export const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  is_staff: false,
  is_superuser: false,
};
```

---

## 5. Test Utilities

**__tests__/utils/test-utils.tsx**:
```typescript
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth/context';
import { ThemeProvider } from 'next-themes';

// Create a query client for testing
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface WrapperProps {
  children: React.ReactNode;
}

// Wrapper component with all providers
function AllProviders({ children }: WrapperProps) {
  const testQueryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={testQueryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Custom render that wraps with providers
function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render method
export { customRender as render };

// Helper to create query client for specific tests
export { createTestQueryClient };

// Helper to wait for loading to finish
export async function waitForLoadingToFinish() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
```

**__tests__/utils/test-fixtures.ts**:
```typescript
import { Patient } from '@/lib/types/patient';
import { Encounter } from '@/lib/types/encounter';

export const createMockPatient = (overrides?: Partial<Patient>): Patient => ({
  id: 1,
  mrn: 'MRN-TEST-0001',
  first_name: 'Test',
  last_name: 'Patient',
  date_of_birth: '1990-01-01',
  gender: 'M',
  phone_number: '+254700000000',
  national_id: null,
  email: null,
  county: 1,
  county_name: 'Mombasa',
  sub_county: 1,
  sub_county_name: 'Mvita',
  ward: null,
  ward_name: undefined,
  village: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  referral_source: 'self',
  referred_from_facility: '',
  consent_given: false,
  consent_date: null,
  is_sensitive: false,
  registered_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

export const createMockEncounter = (overrides?: Partial<Encounter>): Encounter => ({
  id: 1,
  patient: 1,
  patient_name: 'Test Patient',
  patient_mrn: 'MRN-TEST-0001',
  encounter_type: 'OPD',
  encounter_date: new Date().toISOString().split('T')[0],
  chief_complaint: 'Test complaint',
  status: 'IN_PROGRESS',
  temperature: null,
  pulse: null,
  blood_pressure: null,
  respiratory_rate: null,
  spo2: null,
  weight: null,
  height: null,
  allergies: '',
  chronic_conditions: '',
  current_medications: '',
  past_surgeries: '',
  family_history: '',
  social_history: '',
  history_of_present_illness: '',
  physical_examination: '',
  assessment: '',
  plan: '',
  created_by: null,
  created_by_name: undefined,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});
```

---

## 6. Playwright E2E Configuration

**playwright.config.ts**:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  
  // Run tests in files in parallel
  fullyParallel: true,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
  ],
  
  // Shared settings for all projects
  use: {
    // Base URL for actions like `await page.goto('/')`
    baseURL: 'http://localhost:3000',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'on-first-retry',
  },

  // Configure projects for major browsers
  projects: [
    // Setup project - login once and save auth state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

---

## 7. E2E Auth Setup

**e2e/auth.setup.ts**:
```typescript
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // Go to login page
  await page.goto('/login');
  
  // Fill in login form
  await page.getByLabel(/username/i).fill('testuser');
  await page.getByLabel(/password/i).fill('password123');
  
  // Submit
  await page.getByRole('button', { name: /sign in/i }).click();
  
  // Wait for redirect to dashboard
  await page.waitForURL('/');
  
  // Ensure we're logged in
  await expect(page.getByText(/dashboard/i)).toBeVisible();
  
  // Save auth state
  await page.context().storageState({ path: authFile });
});
```

---

## 8. Sample E2E Tests

**e2e/patients.spec.ts**:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Patients Page', () => {
  test('should display patients list', async ({ page }) => {
    await page.goto('/patients');
    
    // Check page title
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible();
    
    // Check that table or list is visible
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should search patients', async ({ page }) => {
    await page.goto('/patients');
    
    // Enter search query
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('John');
    
    // Wait for results to update
    await page.waitForTimeout(500);
    
    // Results should be filtered
    // (specific assertions depend on test data)
  });

  test('should navigate to patient detail', async ({ page }) => {
    await page.goto('/patients');
    
    // Click on first patient row
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    
    // Should navigate to detail page
    await expect(page).toHaveURL(/\/patients\/\d+/);
  });

  test('should navigate to register new patient', async ({ page }) => {
    await page.goto('/patients');
    
    // Click register button
    await page.getByRole('button', { name: /register patient/i }).click();
    
    // Should navigate to new patient form
    await expect(page).toHaveURL('/patients/new');
  });
});

test.describe('Patient Detail Page', () => {
  test('should display patient information', async ({ page }) => {
    await page.goto('/patients/1');
    
    // Check patient info sections
    await expect(page.getByText(/basic information/i)).toBeVisible();
    await expect(page.getByText(/address/i)).toBeVisible();
    await expect(page.getByText(/emergency contact/i)).toBeVisible();
  });

  test('should show encounters tab', async ({ page }) => {
    await page.goto('/patients/1');
    
    // Click encounters tab
    await page.getByRole('tab', { name: /encounters/i }).click();
    
    // Encounters content should be visible
    await expect(page.getByText(/encounters/i)).toBeVisible();
  });
});
```

**e2e/encounters.spec.ts**:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Encounters Page', () => {
  test('should display encounters list', async ({ page }) => {
    await page.goto('/encounters');
    
    await expect(page.getByRole('heading', { name: /encounters/i })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('should filter by status', async ({ page }) => {
    await page.goto('/encounters');
    
    // Open status filter
    await page.getByRole('combobox', { name: /status/i }).click();
    
    // Select a status
    await page.getByRole('option', { name: /completed/i }).click();
    
    // Results should be filtered
    await page.waitForTimeout(500);
  });

  test('should highlight critical vitals', async ({ page }) => {
    await page.goto('/encounters');
    
    // Look for critical vital indicator
    // (depends on test data having critical vitals)
    const criticalBadge = page.getByText(/SpO2.*9[0-4]%/);
    if (await criticalBadge.count() > 0) {
      await expect(criticalBadge.first()).toHaveClass(/destructive/);
    }
  });
});

test.describe('Encounter Detail Page', () => {
  test('should display vitals', async ({ page }) => {
    await page.goto('/encounters/1');
    
    await expect(page.getByText(/vital signs/i)).toBeVisible();
  });

  test('should display diagnoses tab', async ({ page }) => {
    await page.goto('/encounters/1');
    
    await page.getByRole('tab', { name: /diagnoses/i }).click();
    
    // Diagnoses content should be visible
  });
});
```

---

## 9. Package.json Scripts

Add these scripts to package.json:

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --reporters=default --reporters=jest-junit",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:debug": "playwright test --debug",
    "e2e:report": "playwright show-report"
  }
}
```

---

## 10. Dependencies

Add these dev dependencies to package.json:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "@testing-library/jest-dom": "^6.1.5",
    "@testing-library/react": "^14.1.2",
    "@testing-library/user-event": "^14.5.1",
    "@types/jest": "^29.5.11",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "jest-junit": "^16.0.0",
    "msw": "^2.0.11"
  }
}
```

---

## 11. Checklist

### Days 1-2: Testing Setup
- [ ] Configure Jest with Next.js
- [ ] Create jest.setup.js
- [ ] Set up MSW server
- [ ] Create mock handlers
- [ ] Create mock data fixtures
- [ ] Create test utilities
- [ ] Configure Playwright
- [ ] Create auth setup for E2E
- [ ] Add package.json scripts
- [ ] Install testing dependencies
- [ ] Write sample unit tests
- [ ] Write sample E2E tests

---

## Deliverables

| Deliverable | Status |
|-------------|--------|
| Jest configuration | 📋 |
| Jest setup file | 📋 |
| MSW server setup | 📋 |
| API mock handlers | 📋 |
| Mock data fixtures | 📋 |
| Test utilities | 📋 |
| Playwright configuration | 📋 |
| E2E auth setup | 📋 |
| Sample E2E tests | 📋 |
| Package.json scripts | 📋 |
| All testing deps installed | 📋 |

---

**Previous**: [06-api-state-management.md](./06-api-state-management.md)
**Next**: [00-overview.md](./00-overview.md) (return to overview)

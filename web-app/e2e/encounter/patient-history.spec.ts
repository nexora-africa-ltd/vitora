import { test, expect } from '@playwright/test';

function createMockJwt(userId: number, expSecondsFromNow: number) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({
      token_type: 'access',
      exp: nowSeconds + expSecondsFromNow,
      iat: nowSeconds,
      jti: 'e2e',
      user_id: userId,
    })
  ).toString('base64');
  return `${header}.${payload}.sig`;
}

const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@vitora.health',
  first_name: 'Test',
  last_name: 'User',
  is_staff: true,
  is_superuser: true,
  role: 'ADMIN',
  permissions: [
    'patients.view_patient',
    'patients.add_patient',
    'patients.change_patient',
    'encounters.view_encounter',
    'encounters.add_encounter',
  ],
};

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260101-0001',
  title: null,
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F',
  phone_number: '+254712345678',
  county: 47,
  county_name: 'Nairobi',
  sub_county: 1,
  sub_county_name: 'Westlands',
  is_sensitive: false,
  consent_given: true,
  referral_source: 'self',
  registered_by: 1,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
};

const mockEncountersResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 100,
      patient: 1,
      encounter_type: 'OPD',
      encounter_date: '2026-01-15',
      chief_complaint: 'Headache',
      status: 'COMPLETED',
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
      notes: '',
      created_at: '2026-01-15T08:00:00Z',
      updated_at: '2026-01-15T08:00:00Z',
    },
  ],
};

const mockAccessToken = createMockJwt(1, 60 * 60 * 24 * 7);
const mockRefreshToken = createMockJwt(1, 60 * 60 * 24 * 30);

test.describe('Patient History/Timeline', () => {
  test.beforeEach(async ({ page, context }) => {
    // Debug: Log network requests and console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // eslint-disable-next-line no-console
        console.log('[browser error]', msg.text());
      }
    });
    page.on('response', response => {
      const url = response.url();
      const status = response.status();
      if (status >= 400 || url.includes('/api/')) {
        // eslint-disable-next-line no-console
        console.log(`[response] ${status} ${url}`);
      }
    });

    // Set auth cookie at context level BEFORE navigation (bypasses server-side middleware redirect)
    await context.addCookies([
      {
        name: 'vitora_authenticated',
        value: 'true',
        domain: 'localhost',
        path: '/',
        sameSite: 'Lax',
      },
    ]);

    // Set localStorage tokens via addInitScript (runs on page load for client-side auth)
    await page.addInitScript(({ user, accessToken, refreshToken }) => {
      localStorage.setItem('vitora_access_token', accessToken);
      localStorage.setItem('vitora_refresh_token', refreshToken);
      localStorage.setItem('vitora_user', JSON.stringify(user));
    }, { user: mockUser, accessToken: mockAccessToken, refreshToken: mockRefreshToken });

    // Mock token refresh endpoint - CRITICAL: prevents auth redirect loop
    await page.route(/.*\/api\/token\/refresh\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access: mockAccessToken }),
      });
    });

    // Mock patient detail endpoint
    await page.route(/.*\/api\/patients\/1\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPatient),
      });
    });

    // Mock encounters list endpoint
    await page.route(/.*\/api\/encounters\/\?.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEncountersResponse),
      });
    });
    await page.route(/.*\/api\/encounters\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEncountersResponse),
      });
    });

    // Mock other dashboard endpoints to prevent 401s
    await page.route(/.*\/api\/notifications\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0 }),
      });
    });
    await page.route(/.*\/api\/pharmacy\/alerts\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], count: 0 }),
      });
    });
    await page.route(/.*\/api\/core\/dashboard\/stats\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          patients_today: 0,
          encounters_today: 0,
          pending_triage: 0,
        }),
      });
    });
    await page.route(/.*\/api\/encounters\/my_claimed\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], count: 0 }),
      });
    });
    await page.route(/.*\/api\/encounters\/all_claimed\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], count: 0 }),
      });
    });
  });

  test('should display patient history page', async ({ page }) => {
    // Navigate to a patient history page (patient ID 1)
    await page.goto('/patients/1/history');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Patient History');
  });

  test('should display summary cards', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for summary cards to load
    await page.waitForSelector('text=Total Visits', { timeout: 10000 });

    // Check summary cards are visible
    await expect(page.locator('text=Total Visits')).toBeVisible();
    await expect(page.locator('text=Lab Results')).toBeVisible();
    await expect(page.locator('text=Prescriptions')).toBeVisible();
    await expect(page.locator('text=Last Visit')).toBeVisible();
  });

  test('should display timeline', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for timeline to load
    await page.waitForSelector('text=Patient Timeline', { timeout: 10000 });

    // Check timeline header is visible
    await expect(page.locator('text=Patient Timeline')).toBeVisible();
  });

  test('should have search functionality', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for page to load
    await page.waitForSelector('input[placeholder="Search timeline..."]', { timeout: 10000 });

    // Check search input is visible
    await expect(page.locator('input[placeholder="Search timeline..."]')).toBeVisible();
  });

  test('should have filter functionality', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for page to load
    await page.waitForSelector('button:has-text("Filters")', { timeout: 10000 });

    // Click filter button
    await page.click('button:has-text("Filters")');

    // Check filter options are visible
    await expect(page.locator('text=Event Types')).toBeVisible();
    await expect(page.locator('text=Date Range')).toBeVisible();
  });

  test('should display event type filter options', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Open filter popover
    await page.click('button:has-text("Filters")');

    // Check event type checkbox options are visible (use checkbox role to avoid matching summary cards)
    await expect(page.getByRole('checkbox', { name: 'Visits' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Lab Results' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Prescriptions' })).toBeVisible();
  });

  test('should have print button', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for page to load
    await page.waitForSelector('button:has-text("Print")', { timeout: 10000 });

    // Check print button is visible
    await expect(page.locator('button:has-text("Print")')).toBeVisible();
  });

  test('should have link back to patient profile', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for page to load
    await page.waitForSelector('text=View Profile', { timeout: 10000 });

    // Check View Profile button exists
    await expect(page.locator('text=View Profile')).toBeVisible();
  });

  test('should have link to create new encounter', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for page to load
    await page.waitForSelector('text=New Encounter', { timeout: 10000 });

    // Check New Encounter button exists
    await expect(page.locator('text=New Encounter')).toBeVisible();
  });

  test('should navigate back to patient detail', async ({ page }) => {
    await page.goto('/patients/1/history');

    // Wait for View Profile button
    await page.waitForSelector('text=View Profile', { timeout: 10000 });

    // Click View Profile
    await page.click('text=View Profile');

    // Should navigate to patient detail page
    await expect(page).toHaveURL(/.*\/patients\/1$/);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/patients/1/history');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Patient History');

    // Timeline should still be visible
    await page.waitForSelector('text=Patient Timeline', { timeout: 10000 });
  });
});

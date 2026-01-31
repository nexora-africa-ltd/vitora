/**
 * Patient Management E2E Tests
 * Tests for patient CRUD operations
 */
import { test, expect } from '@playwright/test';
import { API_BASE, TEST_USER } from '../fixtures';

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

const mockAccessToken = createMockJwt(1, 60 * 60 * 24 * 7);
const mockRefreshToken = createMockJwt(1, 60 * 60 * 24 * 30);

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260101-0001',
  title: null,
  cr_number: null,
  sha_number: null,
  first_name: 'Jane',
  last_name: 'Doe',
  middle_name: null,
  date_of_birth: '1985-05-20',
  gender: 'F',
  phone_number: '+254712345678',
  email: null,
  address: null,
  county: 47,
  county_name: 'Nairobi',
  sub_county: 1,
  sub_county_name: 'Westlands',
  ward: null,
  ward_name: null,
  village: null,
  is_sensitive: false,
  consent_given: true,
  consent_date: null,
  consent_deferred: false,
  referral_source: 'self',
  referred_from_facility: null,
  emergency_contacts: [],
  emergency_contact_name: null,
  emergency_contact_phone: null,
  emergency_contact_relationship: null,
  registered_by: 1,
  registered_by_username: 'testuser',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
};

const mockPatients = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: mockPatient.id,
      mrn: mockPatient.mrn,
      title: mockPatient.title,
      cr_number: mockPatient.cr_number,
      sha_number: mockPatient.sha_number,
      first_name: mockPatient.first_name,
      middle_name: mockPatient.middle_name,
      last_name: mockPatient.last_name,
      date_of_birth: mockPatient.date_of_birth,
      gender: mockPatient.gender,
      phone_number: mockPatient.phone_number,
      county_name: mockPatient.county_name,
      sub_county_name: mockPatient.sub_county_name,
      is_sensitive: mockPatient.is_sensitive,
      created_at: mockPatient.created_at,
    },
    {
      id: 2,
      mrn: 'MRN-20260101-0002',
      title: null,
      cr_number: null,
      sha_number: null,
      first_name: 'John',
      middle_name: null,
      last_name: 'Smith',
      date_of_birth: '1990-03-15',
      gender: 'M',
      phone_number: '+254712345679',
      county_name: 'Mombasa',
      sub_county_name: 'Nyali',
      is_sensitive: false,
      created_at: '2026-01-01T11:00:00Z',
    },
  ],
};

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth endpoint - matches http://127.0.0.1:9088/api/token/
    await page.route('**/api/token/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: mockAccessToken,
          refresh: mockRefreshToken,
          user: {
            id: 1,
            username: TEST_USER.username,
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
            ],
          },
        }),
      });
    });

    // Mock patients list - use regex to match with query params
    await page.route(/.*\/api\/patients\/(\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search');

      let results = [...mockPatients.results];
      if (search) {
        results = results.filter(p =>
          p.first_name.toLowerCase().includes(search.toLowerCase()) ||
          p.last_name.toLowerCase().includes(search.toLowerCase()) ||
          p.mrn.toLowerCase().includes(search.toLowerCase())
        );
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockPatients,
          results,
          count: results.length,
        }),
      });
    });

    // Mock patient detail - matches /api/patients/1/
    await page.route(/.*\/api\/patients\/\d+\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPatient),
      });
    });

    // Mock locations
    await page.route(/.*\/api\/locations\/counties\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, code: 47, name: 'Nairobi' },
          { id: 2, code: 1, name: 'Mombasa' },
        ]),
      });
    });

    await page.route(/.*\/api\/locations\/sub-counties\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, county: 1, name: 'Westlands' },
          { id: 2, county: 1, name: 'Dagoretti' },
        ]),
      });
    });

    // Login and navigate to patients
    await page.goto('/login');
    const usernameInput = page.locator('input[name="username"]');
    const passwordInput = page.locator('input[name="password"]');
    await usernameInput.waitFor({ state: 'visible' });
    await usernameInput.clear();
    await usernameInput.fill(TEST_USER.username);
    await passwordInput.clear();
    await passwordInput.fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*dashboard.*/, { timeout: 15000 });
  });

  test('should display patient list', async ({ page }) => {
    // Navigate using click from dashboard to ensure auth state is maintained
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Click sidebar Patients link (stable: role-based, scoped to the sidebar)
    await page.getByRole('complementary').getByRole('link', { name: /^patients$/i }).click();
    await expect(page).toHaveURL(/.*patients.*/);

    // Wait for the page to settle and API to respond
    await page.waitForLoadState('networkidle');

    // Should show patient table with mocked data
    await expect(page.getByText('Jane Doe')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('John Smith')).toBeVisible();
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();
  });

  test('should search patients', async ({ page }) => {
    // Navigate using click from dashboard
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.getByRole('complementary').getByRole('link', { name: /^patients$/i }).click();
    await expect(page).toHaveURL(/.*patients.*/);
    await page.waitForLoadState('networkidle');

    // Enter search query (page has multiple search inputs)
    await page.getByPlaceholder(/search by name, mrn, or phone/i).fill('Jane');
    await page.waitForTimeout(500); // Debounce wait

    // Should filter results
    await expect(page.getByText('Jane Doe')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to patient detail', async ({ page }) => {
    // Navigate using click from dashboard
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.getByRole('complementary').getByRole('link', { name: /^patients$/i }).click();
    await expect(page).toHaveURL(/.*patients.*/);
    await page.waitForLoadState('networkidle');

    // Wait for patient data to load
    await expect(page.getByText('Jane Doe')).toBeVisible({ timeout: 10000 });

    // Click on the table row containing Jane Doe - use the row itself for better click targeting
    const patientRow = page.locator('tr').filter({ hasText: 'Jane Doe' });
    await patientRow.click();

    // Should navigate to detail page
    await expect(page).toHaveURL(/.*patients\/1.*/, { timeout: 10000 });
  });

  test('should show new patient form', async ({ page }) => {
    // Navigate using click from dashboard
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.getByRole('complementary').getByRole('link', { name: /^patients$/i }).click();
    await expect(page).toHaveURL(/.*patients.*/);
    await page.waitForLoadState('networkidle');

    // Click new patient button and wait for navigation
    await Promise.all([
      page.waitForURL(/.*patients\/new.*/, { timeout: 10000 }),
      page.getByRole('button', { name: /new patient|add patient|register/i }).click(),
    ]);

    // Should show form
    await expect(page.getByLabel(/first name/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByText(/date of birth/i)).toBeVisible();
  });

  test('should validate required fields on new patient form', async ({ page }) => {
    // Navigate using click from dashboard
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.getByRole('complementary').getByRole('link', { name: /^patients$/i }).click();
    await expect(page).toHaveURL(/.*patients.*/);
    await page.waitForLoadState('networkidle');

    // Click new patient button and wait for navigation
    await Promise.all([
      page.waitForURL(/.*patients\/new.*/, { timeout: 10000 }),
      page.getByRole('button', { name: /new patient|add patient|register/i }).click(),
    ]);

    // Wait for form to be visible
    await expect(page.getByLabel(/first name/i)).toBeVisible({ timeout: 10000 });

    // Try to submit empty form - click the Register Patient button in the form
    await page.getByRole('button', { name: /register patient/i }).click();

    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });
});

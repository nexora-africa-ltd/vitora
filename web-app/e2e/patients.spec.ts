/**
 * Patient Management E2E Tests
 * Tests for patient CRUD operations
 */
import { test, expect } from '@playwright/test';
import { API_BASE, TEST_USER } from './fixtures';

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260101-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F',
  phone_number: '+254712345678',
  county_name: 'Nairobi',
  sub_county_name: 'Westlands',
};

const mockPatients = {
  count: 2,
  next: null,
  previous: null,
  results: [
    mockPatient,
    {
      id: 2,
      mrn: 'MRN-20260101-0002',
      first_name: 'John',
      last_name: 'Smith',
      date_of_birth: '1990-03-15',
      gender: 'M',
      phone_number: '+254712345679',
      county_name: 'Mombasa',
      sub_county_name: 'Nyali',
    },
  ],
};

test.describe('Patient Management', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route(`${API_BASE}/api/token/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock-access-token',
          refresh: 'mock-refresh-token',
          user: { id: 1, username: TEST_USER.username },
        }),
      });
    });

    // Mock patients list
    await page.route(`${API_BASE}/api/patients/`, async (route) => {
      const url = new URL(route.request().url());
      const search = url.searchParams.get('search');
      
      let results = mockPatients.results;
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

    // Mock patient detail
    await page.route(`${API_BASE}/api/patients/1/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPatient),
      });
    });

    // Mock locations
    await page.route(`${API_BASE}/api/locations/counties/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, code: 47, name: 'Nairobi' },
          { id: 2, code: 1, name: 'Mombasa' },
        ]),
      });
    });

    await page.route(`${API_BASE}/api/locations/sub-counties/**`, async (route) => {
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
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/.*dashboard.*/);
  });

  test('should display patient list', async ({ page }) => {
    await page.goto('/patients');
    
    // Should show patient table
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('John Smith')).toBeVisible();
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();
  });

  test('should search patients', async ({ page }) => {
    await page.goto('/patients');
    
    // Enter search query
    await page.getByPlaceholder(/search/i).fill('Jane');
    await page.keyboard.press('Enter');
    
    // Should filter results
    await expect(page.getByText('Jane Doe')).toBeVisible();
  });

  test('should navigate to patient detail', async ({ page }) => {
    await page.goto('/patients');
    
    // Click on patient row or view button
    await page.getByText('Jane Doe').click();
    
    // Should navigate to detail page
    await expect(page).toHaveURL(/.*patients\/1.*/);
  });

  test('should show new patient form', async ({ page }) => {
    await page.goto('/patients');
    
    // Click new patient button
    await page.getByRole('button', { name: /new patient|add patient|register/i }).click();
    
    // Should show form
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/date of birth/i)).toBeVisible();
  });

  test('should validate required fields on new patient form', async ({ page }) => {
    await page.goto('/patients/new');
    
    // Try to submit empty form
    await page.getByRole('button', { name: /save|submit|register/i }).click();
    
    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible();
  });
});

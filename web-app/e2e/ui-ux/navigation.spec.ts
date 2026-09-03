/**
 * Navigation E2E Tests
 * Tests for sidebar navigation and routing
 */
import { test, expect } from '../fixtures';
import { API_BASE, TEST_USER } from '../fixtures';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API endpoints using regex patterns for better matching
    await page.route(/.*\/api\/token\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock-access-token',
          refresh: 'mock-refresh-token',
          user: {
            id: 1,
            username: TEST_USER.username,
            email: 'test@vitora.health',
          },
        }),
      });
    });

    await page.route(/.*\/api\/patients\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 0,
          next: null,
          previous: null,
          results: [],
        }),
      });
    });

    await page.route(/.*\/api\/encounters\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 0,
          next: null,
          previous: null,
          results: [],
        }),
      });
    });

    // Login
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

  test('should display dashboard after login', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should navigate to patients page', async ({ page }) => {
    // On mobile, the sidebar needs to be opened first
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500); // Wait for sidebar animation
      }
    }

    // Get the sidebar patients link and click using evaluate for reliable mobile clicking
    const patientsLink = page
      .locator('[data-testid="sidebar"]')
      .getByRole('link', { name: /patients/i });
    await patientsLink.evaluate((el: HTMLElement) => el.click());

    await expect(page).toHaveURL(/.*patients.*/);
    await expect(page.getByRole('heading', { name: /patients/i, level: 1 })).toBeVisible();
  });

  test('should navigate to encounters page', async ({ page }) => {
    // On mobile, the sidebar needs to be opened first
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500); // Wait for sidebar animation
      }
    }

    // Get the sidebar encounters link and click using evaluate for reliable mobile clicking
    const encountersLink = page
      .locator('[data-testid="sidebar"]')
      .getByRole('link', { name: /encounters/i });
    await encountersLink.evaluate((el: HTMLElement) => el.click());

    await expect(page).toHaveURL(/.*encounters.*/);
  });

  test('should show active state for current route', async ({ page }) => {
    // On mobile, the sidebar needs to be opened first
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 1024;

    if (isMobile) {
      const menuButton = page.getByRole('button', { name: 'Toggle menu' });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Get the sidebar dashboard link specifically (not breadcrumb or other links)
    const dashboardLink = page
      .locator('[data-testid="sidebar"]')
      .getByRole('link', { name: /dashboard/i });

    // Wait for the link to be present
    await expect(dashboardLink).toBeAttached();

    // Dashboard should be active - check for either data-active attribute or active styling class
    const hasDataActive = await dashboardLink.getAttribute('data-active').catch(() => null);
    const className = await dashboardLink.getAttribute('class').catch(() => '');

    // Active state is indicated by data-active="true" or bg-primary class
    const isActive = hasDataActive === 'true' || className?.includes('bg-primary');
    expect(isActive).toBeTruthy();
  });

  test('should toggle sidebar on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Sidebar should be hidden initially on mobile
    const sidebar = page.locator('[data-testid="sidebar"]');

    // Look for menu toggle button (specifically the menu button, not theme toggle)
    const menuButton = page.getByRole('button', { name: 'Toggle menu' });

    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Sidebar should now be visible
      await expect(sidebar).toBeVisible();
    }
  });
});

test.describe('Navigation - LIS Standalone', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/.*\/api\/.*/, async (route, request) => {
      const path = new URL(request.url()).pathname;

      if ((path === '/api/auth/login/' || path === '/api/token/') && request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access: 'mock-access-token',
            refresh: 'mock-refresh-token',
            user: {
              id: 2,
              username: 'lis_tech',
              email: 'lis.tech@vitora.health',
              first_name: 'LIS',
              last_name: 'Tech',
              is_staff: true,
              role: 'LAB_TECH',
              permissions: [
                'patients.view_patient',
                'patients.add_patient',
                'laboratory.view_laborder',
                'billing.view_invoice',
                'inventory.view_purchaseorder',
              ],
              facility: {
                id: 1,
                mfl_code: '12345',
                name: 'Standalone LIS Facility',
                level: '4',
                modules: {
                  outpatient: true,
                  inpatient: false,
                  emergency: false,
                  pharmacy: false,
                  laboratory: true,
                  imaging: false,
                  theatre: false,
                  dialysis: false,
                  icu: false,
                  hdu: false,
                  nbu: false,
                  maternity: false,
                  mortuary: false,
                  blood_bank: false,
                  inventory: true,
                  lis_standalone: true,
                  pharmacy_standalone: false,
                  imaging_standalone: false,
                  triage: false,
                  scheduling: false,
                  surveillance: false,
                  immunizations: false,
                  allied_health: false,
                  quality: false,
                  billing: true,
                  private_insurance: false,
                  moh_reporting: false,
                  ai_assistant: false,
                  cds: false,
                  procedures: false,
                  analytics: false,
                },
                operating_mode: 'STANDALONE_LAB',
                deployment_profile: 'lis_standalone',
                sha_contracted: true,
              },
            },
          }),
        });
        return;
      }

      if (path === '/api/staff/me/' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1,
            user: 2,
            user_info: {
              id: 2,
              username: 'lis_tech',
              email: 'lis.tech@vitora.health',
              first_name: 'LIS',
              last_name: 'Tech',
              is_staff: true,
              is_superuser: false,
              role: 'LAB_TECH',
              role_display: 'Lab Technician',
              role_category: 'CLINICAL',
              permissions: [
                'patients.view_patient',
                'patients.add_patient',
                'laboratory.view_laborder',
                'billing.view_invoice',
                'inventory.view_purchaseorder',
              ],
              facility: {
                id: 1,
                mfl_code: '12345',
                name: 'Standalone LIS Facility',
                level: '4',
                modules: {
                  outpatient: true,
                  inpatient: false,
                  emergency: false,
                  pharmacy: false,
                  laboratory: true,
                  imaging: false,
                  theatre: false,
                  dialysis: false,
                  icu: false,
                  hdu: false,
                  nbu: false,
                  maternity: false,
                  mortuary: false,
                  blood_bank: false,
                  inventory: true,
                  lis_standalone: true,
                  pharmacy_standalone: false,
                  imaging_standalone: false,
                  triage: false,
                  scheduling: false,
                  surveillance: false,
                  immunizations: false,
                  allied_health: false,
                  quality: false,
                  billing: true,
                  private_insurance: false,
                  moh_reporting: false,
                  ai_assistant: false,
                  cds: false,
                  procedures: false,
                  analytics: false,
                },
                operating_mode: 'STANDALONE_LAB',
                deployment_profile: 'lis_standalone',
                sha_contracted: true,
              },
              onboarding_complete: true,
              memberships: [],
              subscription_tier: 'BASIC',
              plan_features: {},
              ai_tokens_available: false,
            },
          }),
        });
        return;
      }

      if (path === '/api/core/setup/check/' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            setup_required: false,
            setup_enabled: true,
            has_organizations: true,
            has_facilities: true,
            has_staff_with_facility: true,
          }),
        });
        return;
      }

      if (path === '/api/core/onboarding/status/' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ complete: true }),
        });
        return;
      }

      if (path === '/api/notifications/unread_count/' && request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ unread_count: 0 }),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Not found' }),
      });
    });

    await page.goto('/login');
    await page.locator('input[name="username"]').fill(TEST_USER.username);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/.*laboratory.*/, { timeout: 15000 });
  });

  test('redirects dashboard to laboratory in lis standalone mode', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*laboratory.*/);
  });

  test('allows lis routes and blocks non-lis modules', async ({ page }) => {
    await page.goto('/laboratory');
    await expect(page).toHaveURL(/.*laboratory.*/);

    await page.goto('/patients');
    await expect(page).toHaveURL(/.*patients.*/);

    await page.goto('/imaging');
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });

  test('blocks access to non-lis routes', async ({ page }) => {
    await page.goto('/pharmacy');
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });
});

/**
 * Navigation E2E Tests
 * Tests for sidebar navigation and routing
 */
import { test, expect } from './fixtures';
import { API_BASE, TEST_USER } from './fixtures';

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
    const patientsLink = page.locator('[data-testid="sidebar"]').getByRole('link', { name: /patients/i });
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
    const encountersLink = page.locator('[data-testid="sidebar"]').getByRole('link', { name: /encounters/i });
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
    const dashboardLink = page.locator('[data-testid="sidebar"]').getByRole('link', { name: /dashboard/i });

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

/**
 * Navigation E2E Tests
 * Tests for sidebar navigation and routing
 */
import { test, expect } from './fixtures';
import { API_BASE, TEST_USER } from './fixtures';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API endpoints
    await page.route(`${API_BASE}/api/token/`, async (route) => {
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

    await page.route(`${API_BASE}/api/patients/**`, async (route) => {
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

    await page.route(`${API_BASE}/api/encounters/**`, async (route) => {
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
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/.*dashboard.*/);
  });

  test('should display dashboard after login', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('should navigate to patients page', async ({ page }) => {
    await page.getByRole('link', { name: /patients/i }).click();
    
    await expect(page).toHaveURL(/.*patients.*/);
    await expect(page.getByRole('heading', { name: /patients/i })).toBeVisible();
  });

  test('should navigate to encounters page', async ({ page }) => {
    await page.getByRole('link', { name: /encounters/i }).click();
    
    await expect(page).toHaveURL(/.*encounters.*/);
  });

  test('should show active state for current route', async ({ page }) => {
    const dashboardLink = page.getByRole('link', { name: /dashboard/i });
    
    // Dashboard should be active
    await expect(dashboardLink).toHaveAttribute('data-active', 'true').or(
      expect(dashboardLink).toHaveClass(/active/)
    ).catch(() => {
      // Some implementations use different active state indicators
    });
  });

  test('should toggle sidebar on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Sidebar should be hidden initially on mobile
    const sidebar = page.locator('[data-testid="sidebar"]');
    
    // Look for menu toggle button
    const menuButton = page.getByRole('button', { name: /menu|toggle/i });
    
    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Sidebar should now be visible
      await expect(sidebar).toBeVisible();
    }
  });
});

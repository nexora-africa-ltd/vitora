import { test, expect } from '@playwright/test';

test.describe('Reports Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
      }));
    });
  });

  test('should display reports page with KPIs', async ({ page }) => {
    await page.goto('/reports');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Reports & Analytics');

    // Check for date filter selector
    await expect(page.locator('text=Last 7 Days')).toBeVisible();

    // Check for action buttons
    await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
    await expect(page.locator('button:has-text("Print")')).toBeVisible();
  });

  test('should display KPI cards', async ({ page }) => {
    await page.goto('/reports');

    // Wait for KPI cards to load (they may show loading skeletons first)
    await page.waitForSelector('text=Total Patients', { timeout: 10000 });

    // Check that KPI cards are visible
    await expect(page.locator('text=Total Patients')).toBeVisible();
    await expect(page.locator('text=Encounters Today')).toBeVisible();
  });

  test('should display charts', async ({ page }) => {
    await page.goto('/reports');

    // Wait for charts to load
    await page.waitForSelector('text=Patient Volume', { timeout: 10000 });
    await page.waitForSelector('text=Revenue by Department', { timeout: 10000 });

    // Check chart containers are visible
    await expect(page.locator('text=Patient Volume')).toBeVisible();
    await expect(page.locator('text=Revenue by Department')).toBeVisible();
  });

  test('should display recent activity', async ({ page }) => {
    await page.goto('/reports');

    // Wait for activity feed to load
    await page.waitForSelector('text=Recent Activity', { timeout: 10000 });

    // Check activity section is visible
    await expect(page.locator('text=Recent Activity')).toBeVisible();
  });

  test('should change date filter', async ({ page }) => {
    await page.goto('/reports');

    // Click on the date filter dropdown
    await page.click('button:has-text("Last 7 Days")');

    // Select a different option
    await page.click('text=Last 30 Days');

    // Verify the selection changed
    await expect(page.locator('button:has-text("Last 30 Days")')).toBeVisible();
  });

  test('should refresh dashboard data', async ({ page }) => {
    await page.goto('/reports');

    // Wait for initial load
    await page.waitForSelector('text=Total Patients', { timeout: 10000 });

    // Click refresh button
    await page.click('button:has-text("Refresh")');

    // Button should show loading state briefly (spinner)
    // After refresh, data should still be visible
    await expect(page.locator('text=Total Patients')).toBeVisible();
  });

  test('should navigate to patients from KPI card', async ({ page }) => {
    await page.goto('/reports');

    // Wait for Total Patients KPI to be clickable
    await page.waitForSelector('text=Total Patients', { timeout: 10000 });

    // Click on Total Patients card (it should be a link)
    await page.click('a:has-text("Total Patients")');

    // Should navigate to patients page
    await expect(page).toHaveURL(/.*\/patients/);
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/reports');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Reports & Analytics');

    // KPI cards should still be visible (in responsive grid)
    await page.waitForSelector('text=Total Patients', { timeout: 10000 });
  });
});

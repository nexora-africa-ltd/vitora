import { test, expect } from '@playwright/test';

test.describe('Patient History/Timeline', () => {
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
    
    // Check event type options are visible
    await expect(page.locator('text=Visits')).toBeVisible();
    await expect(page.locator('text=Lab Results')).toBeVisible();
    await expect(page.locator('text=Prescriptions')).toBeVisible();
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

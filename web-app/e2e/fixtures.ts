/**
 * E2E Test Fixtures
 * Reusable test fixtures and page objects for Playwright tests
 */
import { test as base, expect, Page } from '@playwright/test';

// Test user credentials
export const TEST_USER = {
  username: 'testuser',
  password: 'password123',
};

// API endpoints
export const API_BASE = 'http://127.0.0.1:9088';

/**
 * Login helper function
 */
export async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  
  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/.*dashboard.*/);
}

/**
 * Logout helper function  
 */
export async function logout(page: Page) {
  await page.getByRole('button', { name: /logout|sign out/i }).click();
  await expect(page).toHaveURL(/.*login.*/);
}

/**
 * Mock API response helper
 */
export async function mockApiResponse(
  page: Page,
  url: string,
  response: Record<string, unknown>,
  status = 200
) {
  await page.route(url, async (route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

/**
 * Extended test fixture with authenticated user
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Set up auth state
    await page.goto('/login');
    
    // Mock the login API
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
            first_name: 'Test',
            last_name: 'User',
          },
        }),
      });
    });

    // Perform login
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for navigation
    await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });

    // Use the authenticated page
    await use(page);
  },
});

export { expect };

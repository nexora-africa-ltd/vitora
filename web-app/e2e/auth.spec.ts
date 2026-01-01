/**
 * Authentication E2E Tests
 * Tests for login, logout, and protected routes
 */
import { test, expect } from '@playwright/test';
import { TEST_USER, API_BASE } from './fixtures';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints using glob pattern to match any host/port
    await page.route('**/api/token/', async (route, request) => {
      const body = request.postDataJSON();
      
      if (body.username === TEST_USER.username && body.password === TEST_USER.password) {
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
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Invalid credentials' }),
        });
      }
    });
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    // Check for login form presence
    await expect(page.locator('form').first()).toBeVisible();
    await expect(page.getByLabel(/username/i)).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.goto('/login');
    
    await page.locator('button[type="submit"]').click();
    
    // Should show validation messages
    await expect(page.getByText(/username.*required|required.*username/i)).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard.*/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByLabel(/username/i).fill('wronguser');
    await page.locator('input[name="password"]').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    
    // Should show error message
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('should persist session across page reloads', async ({ page }) => {
    await page.goto('/login');
    
    // Login
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();
    
    await expect(page).toHaveURL(/.*dashboard.*/);
    
    // Reload the page
    await page.reload();
    
    // Should still be on dashboard (session persisted)
    await expect(page).toHaveURL(/.*dashboard.*/);
  });
});

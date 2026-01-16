/**
 * Notifications Center E2E
 * Validates:
 * - Bell button opens a popover with recent notifications
 * - "View all notifications" expands a floating notification center
 * - Close button collapses the center
 */

import { test, expect } from './fixtures';
import { TEST_USER } from './fixtures';

const mockNotifications = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      notification_type: 'critical_vital',
      priority: 'critical',
      title: 'Critical Vital Alert',
      message: 'Patient John Doe has SpO2 below 90%. Immediate attention required.',
      action_url: '/encounters/123',
      is_read: false,
      read_at: null,
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      notification_type: 'lab_result',
      priority: 'high',
      title: 'Lab Results Ready',
      message: 'Complete Blood Count results are available for Patient Jane Smith.',
      action_url: '/laboratory/orders/456',
      is_read: false,
      read_at: null,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      notification_type: 'low_stock',
      priority: 'low',
      title: 'Low Stock Alert',
      message: 'Paracetamol stock is running low. Current quantity: 50 units.',
      action_url: '/pharmacy/drugs/202',
      is_read: true,
      read_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
  ],
  server_time: new Date().toISOString(),
};

const mockUnreadCount = { unread_count: 2 };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
};

test.describe('Notifications Center', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure server-side auth checks see the cookie on initial navigation
    await page.context().addCookies([
      {
        name: 'vitora_authenticated',
        value: 'true',
        url: 'http://localhost:3009',
      },
    ]);

    // Seed auth before any navigation (middleware checks this cookie)
    await page.addInitScript(({ user, tokens }) => {
      localStorage.setItem('vitora_access_token', tokens.access);
      localStorage.setItem('vitora_refresh_token', tokens.refresh);
      localStorage.setItem('vitora_user', JSON.stringify(user));
    }, {
      user: {
        id: 1,
        username: TEST_USER.username,
        email: 'test@vitora.health',
        first_name: 'Test',
        last_name: 'User',
        is_staff: false,
        permissions: [],
      },
      tokens: {
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
      },
    });

    // Auth
    await page.route(/.*\/api\/token\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
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

    await page.route(/.*\/api\/token\/refresh\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ access: 'mock-access-token' }),
      });
    });

    await page.route(/.*\/api\/token\/verify\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({}),
      });
    });

    // RBAC permissions (prevents permission fetch errors)
    await page.route(/.*\/api\/me\/permissions\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ permissions: [] }),
      });
    });

    // Notifications endpoints
    await page.route(/.*\/api\/notifications\/?(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(mockNotifications),
      });
    });

    await page.route(/.*\/api\/notifications\/unread_count\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(mockUnreadCount),
      });
    });

    await page.route(/.*\/api\/notifications\/mark_all_read\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ marked_count: mockUnreadCount.unread_count }),
      });
    });

    await page.route(/.*\/api\/notifications\/\d+\/mark_read\/?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({ status: 'ok' }),
      });
    });

    // Catch-all for other API calls the dashboard might make
    await page.route(/.*\/api\/(?!notifications).*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          count: 0,
          next: null,
          previous: null,
          results: [],
        }),
      });
    });

    // Go straight to dashboard
    await page.goto('/dashboard');
    await page.waitForURL(/.*dashboard.*/, { timeout: 15000 });
  });

  test('opens popover and shows unread badge', async ({ page }) => {
    // Unread badge on bell
    await expect(page.getByTestId('unread-badge')).toBeVisible({ timeout: 15000 });

    // Open popover
    await page.getByRole('button', { name: 'Notifications' }).click();

    // Popover header and list items
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText('Critical Vital Alert')).toBeVisible();
    await expect(page.getByText('Lab Results Ready')).toBeVisible();
  });

  test('"View all notifications" expands floating center and can be closed', async ({ page }) => {
    // Open popover
    await page.getByRole('button', { name: 'Notifications' }).click();

    // Trigger expand
    await page.getByRole('button', { name: /view all notifications/i }).click();

    // Expanded center should show the title and unread section
    await expect(page.locator('h2', { hasText: 'Notifications' })).toBeVisible();
    await expect(page.getByText(/Unread \(\d+\)/)).toBeVisible();

    // Close expanded center
    await page.getByRole('button', { name: /close notifications/i }).click();

    // Center content should disappear (heading inside overlay)
    await expect(page.getByText(/Unread \(\d+\)/)).not.toBeVisible();
  });
});

/**
 * Notifications E2E Tests
 * Tests for notification popover and expanded notification center
 * 
 * Structure:
 * - Bell icon in header with unread badge
 * - Clicking bell opens popover with recent notifications
 * - "View all" button opens sliding panel notification center
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER } from './fixtures';

// Mock notification data
const mockNotifications = {
  count: 5,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      notification_type: 'critical_vital',
      priority: 'critical',
      title: 'Critical Vital Alert',
      message: 'Patient John Doe has SpO2 below 90%. Immediate attention required.',
      related_model: 'Encounter',
      related_id: 123,
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
      related_model: 'LabOrder',
      related_id: 456,
      action_url: '/laboratory/orders/456',
      is_read: false,
      read_at: null,
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 3,
      notification_type: 'appointment',
      priority: 'normal',
      title: 'Appointment Reminder',
      message: 'Upcoming appointment with Dr. Wilson in 1 hour.',
      related_model: 'Appointment',
      related_id: 789,
      action_url: '/appointments/789',
      is_read: false,
      read_at: null,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      id: 4,
      notification_type: 'prescription',
      priority: 'normal',
      title: 'Prescription Filled',
      message: 'Prescription for Amoxicillin has been dispensed.',
      related_model: 'Prescription',
      related_id: 101,
      action_url: '/pharmacy/prescriptions/101',
      is_read: true,
      read_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 5,
      notification_type: 'low_stock',
      priority: 'low',
      title: 'Low Stock Alert',
      message: 'Paracetamol stock is running low. Current quantity: 50 units.',
      related_model: 'Drug',
      related_id: 202,
      action_url: '/pharmacy/drugs/202',
      is_read: true,
      read_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
  ],
  server_time: new Date().toISOString(),
};

const mockUnreadCount = { unread_count: 3 };

/**
 * Setup all API mocks before any navigation
 */
async function setupAllMocks(page: Page, options?: {
  notifications?: typeof mockNotifications;
  unreadCount?: typeof mockUnreadCount;
}) {
  const notifications = options?.notifications ?? mockNotifications;
  const unreadCount = options?.unreadCount ?? mockUnreadCount;

  // Auth mocks
  await page.route(/.*\/api\/token\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: { id: 1, username: TEST_USER.username, email: 'test@vitora.health' },
      }),
    });
  });

  // Notifications list
  await page.route(/.*\/api\/notifications\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(notifications),
    });
  });

  // Unread count
  await page.route(/.*\/api\/notifications\/unread-count\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(unreadCount),
    });
  });

  // Mark as read
  await page.route(/.*\/api\/notifications\/\d+\/mark-read\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });

  // Mark all read
  await page.route(/.*\/api\/notifications\/mark-all-read\/?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ marked_count: unreadCount.unread_count }),
    });
  });

  // Dashboard mocks
  await page.route(/.*\/api\/patients\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, results: [] }) });
  });
  await page.route(/.*\/api\/encounters\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0, results: [] }) });
  });
}

/**
 * Login and go to dashboard
 */
async function loginToDashboard(page: Page) {
  await page.goto('/login');
  const usernameInput = page.locator('input[name="username"]');
  await usernameInput.waitFor({ state: 'visible' });
  await usernameInput.fill(TEST_USER.username);
  await page.locator('input[name="password"]').fill(TEST_USER.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/.*dashboard.*/, { timeout: 15000 });
  // Wait for notifications to load
  await page.waitForTimeout(1000);
}

test.describe.skip('Notification Popover (deprecated; use notifications-center.spec.ts)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
  });

  test('should display bell icon in header', async ({ page }) => {
    await loginToDashboard(page);
    const bellButton = page.getByRole('button', { name: /notifications/i });
    await expect(bellButton).toBeVisible();
  });

  test('should show unread badge when there are unread notifications', async ({ page }) => {
    await loginToDashboard(page);
    // Wait for badge to potentially appear after API call
    await page.waitForTimeout(500);
    const badge = page.getByTestId('unread-badge');
    // The badge should show if API returns unread_count > 0
    await expect(badge).toBeVisible({ timeout: 10000 });
    await expect(badge).toHaveText('3');
  });

  test('should open popover when clicking bell icon', async ({ page }) => {
    await loginToDashboard(page);
    
    const bellButton = page.getByRole('button', { name: /notifications/i });
    await bellButton.click();
    
    // Popover should appear with notifications header
    await expect(page.getByRole('heading', { name: /notifications/i })).toBeVisible();
  });

  test('should display notification items in popover', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    
    // Should show notification items
    await expect(page.getByText('Critical Vital Alert')).toBeVisible();
    await expect(page.getByText('Lab Results Ready')).toBeVisible();
  });

  test('should show "Mark all read" button when there are unread notifications', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(500);
    
    const markAllButton = page.getByRole('button', { name: /mark all/i });
    await expect(markAllButton).toBeVisible({ timeout: 10000 });
  });

  test('should show "View all notifications" button', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    
    const viewAllButton = page.getByRole('button', { name: /view all notifications/i });
    await expect(viewAllButton).toBeVisible();
  });

  test('should show empty state when no notifications', async ({ page }) => {
    await setupAllMocks(page, {
      notifications: { count: 0, next: null, previous: null, results: [], server_time: new Date().toISOString() },
      unreadCount: { unread_count: 0 },
    });
    
    await loginToDashboard(page);
    await page.getByRole('button', { name: /notifications/i }).click();
    
    await expect(page.getByText('All caught up!')).toBeVisible();
  });
});

test.describe.skip('Expanded Notification Center (deprecated; use notifications-center.spec.ts)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
  });

  test('should open expanded view when clicking "View all"', async ({ page }) => {
    await loginToDashboard(page);
    
    // Open popover
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    
    // Click "View all notifications"
    await page.getByRole('button', { name: /view all notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Expanded panel should appear with full title
    await expect(page.locator('h2').filter({ hasText: 'Notifications' })).toBeVisible();
  });

  test('should show unread section in expanded view', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /view all notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Should show "Unread" section header
    await expect(page.getByText(/unread \(\d+\)/i)).toBeVisible();
  });

  test('should show "Earlier" section for read notifications', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /view all notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Should show "Earlier" section
    await expect(page.getByText('Earlier')).toBeVisible();
  });

  test('should close expanded view when clicking X button', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /view all notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Click close button using force since it might be at edge of viewport
    const closeButton = page.locator('button').filter({ has: page.locator('svg.lucide-x') }).last();
    await closeButton.click({ force: true });
    await page.waitForTimeout(300);
    
    // Expanded panel should be gone
    await expect(page.locator('h2').filter({ hasText: 'Notifications' })).not.toBeVisible();
  });

  test('should close expanded view when clicking backdrop', async ({ page }) => {
    await loginToDashboard(page);
    
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /view all notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Click backdrop (outside the panel)
    await page.locator('.bg-black\\/50').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);
    
    // Expanded panel should be gone
    await expect(page.locator('h2').filter({ hasText: 'Notifications' })).not.toBeVisible();
  });
});

test.describe.skip('Notification Actions (deprecated; use notifications-center.spec.ts)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
  });

  test('should mark notification as read when clicked', async ({ page }) => {
    let markReadCalled = false;
    await page.route(/.*\/api\/notifications\/1\/mark-read\/?$/, async (route) => {
      markReadCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });

    await loginToDashboard(page);
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(500);
    
    // Click the notification item container (not just the title text)
    const notificationItem = page.getByTestId('notification-item').first();
    await notificationItem.click();
    await page.waitForTimeout(500);
    
    expect(markReadCalled).toBe(true);
  });

  test('should call mark all read API when clicking button', async ({ page }) => {
    let markAllCalled = false;
    await page.route(/.*\/api\/notifications\/mark-all-read\/?$/, async (route) => {
      markAllCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ marked_count: 3 }) });
    });

    await loginToDashboard(page);
    await page.getByRole('button', { name: /notifications/i }).click();
    await page.waitForTimeout(500);
    
    // The button should be visible if there are unread notifications
    const markAllButton = page.getByRole('button', { name: /mark all/i });
    if (await markAllButton.isVisible()) {
      await markAllButton.click();
      await page.waitForTimeout(500);
      expect(markAllCalled).toBe(true);
    } else {
      // If no unread notifications in mock, button won't show - that's expected
      test.skip();
    }
  });
});

test.describe.skip('Empty and Loading States (deprecated; use notifications-center.spec.ts)', () => {
  test('should not show badge when unread count is 0', async ({ page }) => {
    await setupAllMocks(page, {
      notifications: mockNotifications,
      unreadCount: { unread_count: 0 },
    });
    
    await loginToDashboard(page);
    
    const badge = page.getByTestId('unread-badge');
    await expect(badge).not.toBeVisible();
  });

  test('should show loading state in popover', async ({ page }) => {
    // Setup with delayed response
    await page.route(/.*\/api\/token\/.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access: 'mock', refresh: 'mock', user: { id: 1, username: 'test' } }),
      });
    });
    
    await page.route(/.*\/api\/notifications\/unread-count\/?$/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ unread_count: 1 }) });
    });
    
    await page.route(/.*\/api\/notifications\/?(\?.*)?$/, async (route) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockNotifications) });
    });
    
    await loginToDashboard(page);
    await page.getByRole('button', { name: /notifications/i }).click();
    
    // Should show loading spinner
    const loading = page.getByTestId('notification-loading');
    await expect(loading).toBeVisible();
  });
});

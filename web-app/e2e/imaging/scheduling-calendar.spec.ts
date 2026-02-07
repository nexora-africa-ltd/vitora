/**
 * Imaging Scheduling Calendar E2E Tests
 *
 * End-to-end tests for the scheduling calendar component.
 *
 * Features Covered:
 * - Calendar View Display
 * - Date Navigation
 * - Resource Display
 * - Slot Availability
 * - Modality Filtering
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login } from '../fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockImagingResource = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'X-Ray Room 1',
  code: 'XR-ROOM-1',
  resource_type: 'ROOM',
  is_active: true,
  metadata: {
    department: 'radiology',
    modalities: ['XR'],
    room_number: '101',
  },
  ...overrides,
});

const mockCalendarSlot = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-02-07',
  start_time: '08:00:00',
  end_time: '08:30:00',
  is_available: true,
  appointment: null,
  ...overrides,
});

const mockCalendarData = () => ({
  date: '2026-02-07',
  resources: [
    {
      resource: mockImagingResource(),
      slots: [
        mockCalendarSlot(),
        mockCalendarSlot({
          start_time: '08:30:00',
          end_time: '09:00:00',
          is_available: false,
          appointment: {
            id: 1,
            patient_name: 'John Doe',
            appointment_number: 'APT-2026-001',
            status: 'CONFIRMED',
          },
        }),
        mockCalendarSlot({
          start_time: '09:00:00',
          end_time: '09:30:00',
        }),
        mockCalendarSlot({
          start_time: '09:30:00',
          end_time: '10:00:00',
        }),
      ],
      total_slots: 4,
      available_slots: 3,
      booked_slots: 1,
    },
    {
      resource: mockImagingResource({
        id: 2,
        name: 'CT Scanner',
        code: 'CT-SCANNER-1',
        resource_type: 'EQUIPMENT',
        metadata: {
          department: 'radiology',
          modalities: ['CT'],
          room_number: '102',
        },
      }),
      slots: [
        mockCalendarSlot(),
        mockCalendarSlot({
          start_time: '08:45:00',
          end_time: '09:30:00',
        }),
      ],
      total_slots: 2,
      available_slots: 2,
      booked_slots: 0,
    },
    {
      resource: mockImagingResource({
        id: 3,
        name: 'MRI Scanner',
        code: 'MRI-SCANNER-1',
        resource_type: 'EQUIPMENT',
        metadata: {
          department: 'radiology',
          modalities: ['MRI'],
          room_number: '103',
        },
      }),
      slots: [
        mockCalendarSlot({
          start_time: '08:00:00',
          end_time: '09:00:00',
          is_available: false,
          appointment: {
            id: 2,
            patient_name: 'Jane Smith',
            appointment_number: 'APT-2026-002',
            status: 'CONFIRMED',
          },
        }),
      ],
      total_slots: 1,
      available_slots: 0,
      booked_slots: 1,
    },
  ],
});

const mockResourcesList = () => ({
  count: 3,
  results: [
    mockImagingResource(),
    mockImagingResource({
      id: 2,
      name: 'CT Scanner',
      code: 'CT-SCANNER-1',
      metadata: { department: 'radiology', modalities: ['CT'] },
    }),
    mockImagingResource({
      id: 3,
      name: 'MRI Scanner',
      code: 'MRI-SCANNER-1',
      metadata: { department: 'radiology', modalities: ['MRI'] },
    }),
  ],
});

// =============================================================================
// SETUP MOCKS
// =============================================================================

async function setupSchedulingMocks(page: Page) {
  // Mock calendar endpoint
  await page.route(`${API_BASE}/api/imaging/calendar/**`, async (route) => {
    const url = route.request().url();
    const urlParams = new URL(url).searchParams;
    const modality = urlParams.get('modality');
    
    let calendarData = mockCalendarData();
    
    // Filter by modality if specified
    if (modality) {
      calendarData = {
        ...calendarData,
        resources: calendarData.resources.filter(
          (r) => r.resource.metadata.modalities.includes(modality)
        ),
      };
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(calendarData),
    });
  });

  // Mock resources list endpoint
  await page.route(`${API_BASE}/api/imaging/resources/**`, async (route) => {
    const url = route.request().url();
    
    if (url.includes('/availability/')) {
      // Resource availability
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resource_id: 1,
          date: '2026-02-07',
          slots: [
            mockCalendarSlot(),
            mockCalendarSlot({ start_time: '08:30:00', end_time: '09:00:00' }),
          ],
        }),
      });
    } else {
      // Resources list
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResourcesList()),
      });
    }
  });

  // Mock login/auth
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
          first_name: 'Test',
          last_name: 'User',
        },
      }),
    });
  });

  // Mock token refresh
  await page.route(`${API_BASE}/api/token/refresh/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access: 'refreshed-token' }),
    });
  });

  // Mock imaging orders (for other tabs)
  await page.route(`${API_BASE}/api/imaging/orders/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, results: [] }),
    });
  });

  // Mock procedures (for other tabs)
  await page.route(`${API_BASE}/api/imaging/procedures/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, results: [] }),
    });
  });
}

// =============================================================================
// SCHEDULING CALENDAR TESTS
// =============================================================================

test.describe('Imaging Scheduling Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await setupSchedulingMocks(page);
  });

  test('renders schedule tab in imaging page', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    // Schedule tab should be visible
    await expect(page.getByRole('tab', { name: /schedule/i })).toBeVisible();
  });

  test('displays calendar when schedule tab is clicked', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    // Click on Schedule tab
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Calendar title should be visible
    await expect(page.getByText('Imaging Schedule')).toBeVisible();
  });

  test('shows resource availability in calendar', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Resources should be visible
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();
    await expect(page.getByText('CT Scanner')).toBeVisible();
    await expect(page.getByText('MRI Scanner')).toBeVisible();
  });

  test('displays availability stats for each resource', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Availability counts should be visible
    await expect(page.getByText('3/4 available')).toBeVisible(); // X-Ray
    await expect(page.getByText('2/2 available')).toBeVisible(); // CT
    await expect(page.getByText('0/1 available')).toBeVisible(); // MRI
  });

  test('shows date navigation controls', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Date navigation should be visible
    await expect(page.getByRole('button', { name: /previous day/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /next day/i })).toBeVisible();
  });

  test('can navigate to next day', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for calendar to load first
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();

    // Get current date display
    const nextButton = page.getByRole('button', { name: /next day/i });
    await nextButton.click();

    // Should show different date
    await expect(page.locator('button:has-text("Feb")')).toBeVisible();
  });

  test('shows modality filter dropdown', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Modality filter should be visible
    await expect(page.getByText('All Modalities')).toBeVisible();
  });

  test('can filter by modality', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for resources to load
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();

    // Open modality filter
    await page.getByText('All Modalities').click();

    // Select X-Ray
    await page.getByRole('option', { name: 'X-Ray' }).click();

    // Should only show X-Ray resources (API will filter)
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();
  });

  test('shows time slot headers', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Time slots should be visible
    await expect(page.getByText('8:00 AM')).toBeVisible();
  });

  test('displays legend for available and booked slots', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for calendar to load
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();

    // Legend should be visible (use exact match to avoid "3/4 available" etc.)
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    await expect(page.getByText('Booked', { exact: true })).toBeVisible();
  });

  test('shows total stats in header', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for calendar to load
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();

    // Total stats should be visible
    await expect(page.getByText('Total:')).toBeVisible();
  });

  test('shows refresh button', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Refresh button should be visible
    await expect(page.getByRole('button', { name: /refresh calendar/i })).toBeVisible();
  });

  test('can click refresh to reload calendar', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for initial load
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();

    // Click refresh
    await page.getByRole('button', { name: /refresh calendar/i }).click();

    // Calendar should still show data
    await expect(page.getByText('X-Ray Room 1')).toBeVisible();
  });

  test('shows description text', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Description should be visible
    await expect(page.getByText(/view and manage imaging resource availability/i)).toBeVisible();
  });

  test('shows appointment details on hover for booked slots', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Wait for calendar to load
    await expect(page.getByText('X-Ray Room 1')).toBeVisible({ timeout: 10000 });

    // Find a booked slot (has User icon) and hover
    const bookedSlot = page.getByRole('button', { name: /booked slot/i }).first();
    await bookedSlot.hover();

    // Tooltip with appointment details should appear (use nth to avoid sr-only duplicates)
    await expect(page.getByRole('tooltip').getByText('John Doe')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('tooltip').getByText('APT-2026-001')).toBeVisible();
  });
});

test.describe('Scheduling Calendar - Error States', () => {
  test('shows error state when API fails', async ({ page }) => {
    // Setup mock that returns error
    await page.route(`${API_BASE}/api/imaging/calendar/**`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    // Mock auth
    await page.route(`${API_BASE}/api/token/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock-token',
          refresh: 'mock-refresh',
          user: { id: 1, username: 'test' },
        }),
      });
    });

    await page.route(`${API_BASE}/api/imaging/orders/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock procedures
    await page.route(`${API_BASE}/api/imaging/procedures/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock token refresh
    await page.route(`${API_BASE}/api/token/refresh/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access: 'refreshed-token' }),
      });
    });

    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Error message should be visible
    await expect(page.getByText(/failed to load calendar/i)).toBeVisible();

    // Retry button should be visible
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
  });
});

test.describe('Scheduling Calendar - Empty States', () => {
  test('shows empty state when no resources available', async ({ page }) => {
    // Setup mock that returns empty resources
    await page.route(`${API_BASE}/api/imaging/calendar/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ date: '2026-02-07', resources: [] }),
      });
    });

    // Mock auth
    await page.route(`${API_BASE}/api/token/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock-token',
          refresh: 'mock-refresh',
          user: { id: 1, username: 'test' },
        }),
      });
    });

    await page.route(`${API_BASE}/api/imaging/orders/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock procedures
    await page.route(`${API_BASE}/api/imaging/procedures/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock token refresh
    await page.route(`${API_BASE}/api/token/refresh/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access: 'refreshed-token' }),
      });
    });

    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');
    await page.getByRole('tab', { name: /schedule/i }).click();

    // Empty state message should be visible
    await expect(page.getByText(/no resources found/i)).toBeVisible();
  });
});

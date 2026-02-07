/**
 * Imaging Module E2E Tests
 *
 * End-to-end tests for imaging workflows: orders, worklist,
 * status updates, and encounter integration.
 *
 * Phase B: Frontend Order Management
 *
 * Features Covered:
 * - Imaging Order Creation
 * - Order Status Workflow
 * - Worklist Management
 * - Encounter Integration
 * - Procedure Catalog Navigation
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login, mockApiResponse } from '../fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockProcedure = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  code: 'XR-CHEST-PA',
  name: 'Chest X-Ray PA View',
  modality: 'XR',
  body_region: 'CHEST',
  cost: 1500,
  sha_claimable: true,
  available_in_house: true,
  is_active: true,
  cpt_code: '71045',
  ...overrides,
});

const mockImagingOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  order_number: 'IMG-2026-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  encounter: 1,
  ordered_by: 1,
  ordered_by_name: 'Dr. James Mwangi',
  priority: 'ROUTINE',
  clinical_indication: 'Rule out pneumonia. Patient presents with cough and fever.',
  relevant_clinical_history: 'No previous imaging.',
  status: 'ORDERED',
  scheduled_datetime: null,
  scheduled_room: null,
  total_cost: 1500,
  is_paid: false,
  items: [
    {
      id: 1,
      procedure: 1,
      procedure_name: 'Chest X-Ray PA View',
      procedure_code: 'XR-CHEST-PA',
      modality: 'XR',
      laterality: 'NA',
      specific_instructions: '',
      is_completed: false,
      unit_cost: 1500,
    },
  ],
  ordered_at: '2026-02-06T10:00:00Z',
  ...overrides,
});

const mockWorklistStats = () => ({
  total_pending: 5,
  total_in_progress: 3,
  total_completed_today: 12,
  stat_orders: 1,
  urgent_orders: 2,
});

// =============================================================================
// SETUP MOCKS
// =============================================================================

async function setupImagingMocks(page: Page) {
  // Mock procedures list (** matches any path including nested segments and trailing slashes)
  await page.route(`${API_BASE}/api/imaging/procedures/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('search=')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [mockProcedure(), mockProcedure({ id: 2, code: 'US-ABDOM', name: 'Abdominal Ultrasound', modality: 'US' })],
        }),
      });
    } else if (url.includes('/XR-CHEST-PA/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProcedure()),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 50,
          next: null,
          previous: null,
          results: [
            mockProcedure(),
            mockProcedure({ id: 2, code: 'US-ABDOM', name: 'Abdominal Ultrasound', modality: 'US', cost: 2500 }),
            mockProcedure({ id: 3, code: 'CT-HEAD', name: 'CT Head without Contrast', modality: 'CT', cost: 8000 }),
          ],
        }),
      });
    }
  });

  // Mock orders list (** matches any path including trailing slashes)
  await page.route(`${API_BASE}/api/imaging/orders/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'POST' && url.endsWith('/orders/')) {
      // Create order
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder({ status: 'DRAFT' })),
      });
    } else if (url.includes('/submit/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder({ status: 'ORDERED' })),
      });
    } else if (url.includes('/schedule/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          mockImagingOrder({
            status: 'SCHEDULED',
            scheduled_datetime: '2026-02-07T09:00:00Z',
            scheduled_room: 'Radiology Room 1',
          })
        ),
      });
    } else if (url.includes('/start/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder({ status: 'IN_PROGRESS' })),
      });
    } else if (url.includes('/complete/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder({ status: 'COMPLETED' })),
      });
    } else if (url.includes('/cancel/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder({ status: 'CANCELLED' })),
      });
    } else if (url.includes('/IMG-2026-0001')) {
      // Match order detail URL (with or without trailing slash)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockImagingOrder()),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 3,
          next: null,
          previous: null,
          results: [
            mockImagingOrder(),
            mockImagingOrder({
              id: 2,
              order_number: 'IMG-2026-0002',
              priority: 'STAT',
              status: 'IN_PROGRESS',
            }),
            mockImagingOrder({
              id: 3,
              order_number: 'IMG-2026-0003',
              status: 'COMPLETED',
            }),
          ],
        }),
      });
    }
  });

  // Mock worklist (registered after orders/ to take precedence)
  await page.route(`${API_BASE}/api/imaging/orders/worklist/**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 2,
        results: [
          mockImagingOrder({ priority: 'STAT', status: 'ORDERED' }),
          mockImagingOrder({
            id: 2,
            order_number: 'IMG-2026-0002',
            priority: 'ROUTINE',
            status: 'SCHEDULED',
          }),
        ],
      }),
    });
  });

  // Mock worklist stats
  await page.route(`${API_BASE}/api/imaging/orders/worklist-stats/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockWorklistStats()),
    });
  });
}

// =============================================================================
// IMAGING PAGE TESTS
// =============================================================================

test.describe('Imaging Module - Main Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupImagingMocks(page);
  });

  test('renders imaging page with tabs', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    // Page should load with title
    await expect(page.getByRole('heading', { name: /imaging/i })).toBeVisible();

    // Tabs should be visible
    await expect(page.getByRole('tab', { name: /orders/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /worklist/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /procedure catalog/i })).toBeVisible();
  });

  test('shows new order button', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    await expect(
      page.getByRole('button', { name: /new imaging order/i })
    ).toBeVisible();
  });

  test('displays orders in table', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    // Wait for orders to load
    await expect(page.getByText('IMG-2026-0001')).toBeVisible();
    await expect(page.getByText('IMG-2026-0002')).toBeVisible();
  });

  test('navigates to worklist tab', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    await page.getByRole('tab', { name: /worklist/i }).click();

    // Should show worklist stats (use exact match to avoid ambiguity)
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
  });

  test('navigates to procedure catalog', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging');

    await page.getByRole('tab', { name: /procedure catalog/i }).click();

    // Should show procedures
    await expect(page.getByText('Chest X-Ray PA View')).toBeVisible();
    await expect(page.getByText('Abdominal Ultrasound')).toBeVisible();
  });
});

// =============================================================================
// ORDER DETAIL TESTS
// =============================================================================

test.describe('Imaging Module - Order Detail', () => {
  test.beforeEach(async ({ page }) => {
    await setupImagingMocks(page);
  });

  test('displays order details', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/orders/IMG-2026-0001');

    // Wait for order to load (order number in h1)
    await expect(page.locator('h1', { hasText: 'IMG-2026-0001' })).toBeVisible();

    // Clinical indication should be visible
    await expect(page.getByText('Rule out pneumonia', { exact: false })).toBeVisible();

    // Procedure should be listed
    await expect(page.getByText('Chest X-Ray PA View').first()).toBeVisible();
  });

  test('shows status progress timeline', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/orders/IMG-2026-0001');

    // Wait for order to load first
    await expect(page.locator('h1', { hasText: 'IMG-2026-0001' })).toBeVisible();

    // Progress steps should be visible (use first() since status badge also contains these texts)
    await expect(page.getByText('Order Progress')).toBeVisible();
    await expect(page.getByText('Ordered', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
  });

  test('shows action buttons for pending order', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/orders/IMG-2026-0001');

    // Wait for order to load first
    await expect(page.locator('h1', { hasText: 'IMG-2026-0001' })).toBeVisible();

    // Should show schedule and start buttons
    await expect(page.getByRole('button', { name: 'Schedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: /start imaging/i })).toBeVisible();
  });
});

// =============================================================================
// WORKLIST TESTS
// =============================================================================

test.describe('Imaging Module - Worklist', () => {
  test.beforeEach(async ({ page }) => {
    await setupImagingMocks(page);
  });

  test('displays worklist stats', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/worklist');

    // Stats cards should show (use first() to avoid multiple matches)
    await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('STAT Orders', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed Today', { exact: true })).toBeVisible();
  });

  test('displays orders in worklist', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/worklist');

    // Orders should be visible (use first() as order ID appears multiple times)
    await expect(page.getByText('IMG-2026-0001').first()).toBeVisible();
  });

  test('shows start button for pending orders', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/worklist');

    // Start button should be visible
    await expect(page.getByRole('button', { name: /start/i }).first()).toBeVisible();
  });
});

// =============================================================================
// ORDER CREATION TESTS
// =============================================================================

test.describe('Imaging Module - Order Creation', () => {
  test.beforeEach(async ({ page }) => {
    await setupImagingMocks(page);

    // Mock patient and encounter for context
    await page.route(`${API_BASE}/api/patients/1/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          mrn: 'MRN-20260101-0001',
          first_name: 'Jane',
          last_name: 'Doe',
        }),
      });
    });

    await page.route(`${API_BASE}/api/encounters/1/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          patient: 1,
          patient_name: 'Jane Doe',
          encounter_type: 'OPD',
          status: 'IN_PROGRESS',
        }),
      });
    });
  });

  test('new order page loads with form', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/orders/new?patient=1&encounter=1');

    // Form elements should be visible (labels have asterisk for required fields)
    await expect(page.getByText('Order Details', { exact: true })).toBeVisible();
    await expect(page.getByText('Clinical Indication *')).toBeVisible();
    await expect(page.getByText('Imaging Procedures', { exact: true }).first()).toBeVisible();
  });

  test('can select priority', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/imaging/orders/new?patient=1&encounter=1');

    // Wait for form to load
    await expect(page.getByText('Order Details', { exact: true })).toBeVisible();

    // Priority selector is a button with label "Priority" (not a combobox)
    const priorityTrigger = page.getByRole('button', { name: 'Priority' });
    await priorityTrigger.click();

    // Priority options should appear in the dropdown (role="option" via custom Select component)
    // Labels from PRIORITY_LABELS: Routine, Urgent, STAT (Immediate)
    await expect(page.getByRole('option', { name: 'Routine' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Urgent' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'STAT (Immediate)' })).toBeVisible();
  });
});

// =============================================================================
// ENCOUNTER INTEGRATION TESTS
// =============================================================================

test.describe('Imaging Module - Encounter Integration', () => {
  test.beforeEach(async ({ page }) => {
    await setupImagingMocks(page);

    // Mock encounter detail
    await page.route(`${API_BASE}/api/encounters/1/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          patient: 1,
          patient_name: 'Jane Doe',
          patient_mrn: 'MRN-20260101-0001',
          encounter_type: 'OPD',
          encounter_date: '2026-02-06',
          status: 'IN_PROGRESS',
          chief_complaint: 'Cough and fever',
          created_by_name: 'Dr. James Mwangi',
        }),
      });
    });

    // Mock encounter diagnoses
    await page.route(`${API_BASE}/api/encounters/1/diagnoses/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock encounter treatment plan
    await page.route(`${API_BASE}/api/encounters/1/treatment-plan/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock encounter lab orders
    await page.route(`${API_BASE}/api/laboratory/orders/?encounter=1**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock encounter prescriptions
    await page.route(`${API_BASE}/api/pharmacy/prescriptions/?encounter=1**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, results: [] }),
      });
    });

    // Mock encounter imaging orders (for the tab count)
    await page.route(`${API_BASE}/api/imaging/orders/?encounter=1**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          results: [mockImagingOrder()],
        }),
      });
    });
  });

  test('shows imaging tab in encounter detail', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/encounters/1');

    // Imaging tab should be visible
    await expect(page.getByRole('tab', { name: /imaging/i })).toBeVisible();
  });

  test('displays imaging orders in encounter', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/encounters/1');

    // Click on imaging tab
    await page.getByRole('tab', { name: /imaging/i }).click();

    // Order should be visible
    await expect(page.getByText('IMG-2026-0001')).toBeVisible();
  });

  test('can navigate to create new imaging order from encounter', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/encounters/1');

    // Click on imaging tab
    await page.getByRole('tab', { name: /imaging/i }).click();

    // Click on order imaging button
    const orderButton = page.getByRole('button', { name: /order imaging/i });
    await orderButton.click();

    // Should navigate to new order page with encounter context
    await expect(page).toHaveURL(/\/imaging\/orders\/new\?.*encounter=1/);
  });
});

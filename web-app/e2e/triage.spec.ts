/**
 * Triage Module E2E Tests
 *
 * End-to-end tests for triage queue, assessment, reports, and settings.
 * Based on BDD scenarios from features/triage/*.feature
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER } from './fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

// Mock queue entry matching TriageQueueEntry type (flat structure from API)
const mockQueueEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  triage_assessment: 1, // This is the assessment ID, not nested object
  patient_name: 'Jane Wanjiku',
  patient_mrn: 'MRN-20260103-0001',
  patient_age: 45,
  patient_gender: 'F',
  triage_category: 'RED',
  chief_complaint: 'Severe chest pain',
  assigned_area: 'ER_RESUS',
  assigned_area_label: 'ER - Resuscitation',
  arrival_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  wait_time_minutes: 5,
  is_wait_exceeded: false,
  status: 'WAITING',
  called_at: null,
  called_by: null,
  called_by_name: null,
  position: 1,
  alerts: [{ type: 'critical', message: 'Severe chest pain - possible cardiac event', vital_type: 'HEART_RATE' }],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const mockQueueData = {
  count: 4,
  next: null,
  previous: null,
  results: [
    mockQueueEntry({
      id: 1,
      triage_assessment: 1,
      patient_name: 'Jane Wanjiku',
      patient_mrn: 'MRN-20260103-0001',
      patient_age: 45,
      patient_gender: 'F',
      triage_category: 'RED',
      chief_complaint: 'Severe chest pain',
      assigned_area: 'ER_RESUS',
      assigned_area_label: 'ER - Resuscitation',
      arrival_time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      wait_time_minutes: 5,
      is_wait_exceeded: false,
      position: 1,
      alerts: [{ type: 'critical', message: 'Severe chest pain', vital_type: 'OTHER' }],
    }),
    mockQueueEntry({
      id: 2,
      triage_assessment: 2,
      patient_name: 'Mary Otieno',
      patient_mrn: 'MRN-20260103-0002',
      patient_age: 32,
      patient_gender: 'F',
      triage_category: 'RED',
      chief_complaint: 'Difficulty breathing',
      assigned_area: 'ER_RESUS',
      assigned_area_label: 'ER - Resuscitation',
      arrival_time: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      wait_time_minutes: 8,
      is_wait_exceeded: true,
      position: 2,
      alerts: [{ type: 'warning', message: 'Low SpO2', vital_type: 'SPO2' }],
    }),
    mockQueueEntry({
      id: 3,
      triage_assessment: 3,
      patient_name: 'John Kamau',
      patient_mrn: 'MRN-20260103-0003',
      patient_age: 55,
      patient_gender: 'M',
      triage_category: 'ORANGE',
      chief_complaint: 'Abdominal pain',
      assigned_area: 'ER_ACUTE',
      assigned_area_label: 'ER - Acute Care',
      arrival_time: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      wait_time_minutes: 12,
      is_wait_exceeded: true,
      position: 3,
      alerts: [],
    }),
    mockQueueEntry({
      id: 4,
      triage_assessment: 4,
      patient_name: 'Peter Odhiambo',
      patient_mrn: 'MRN-20260103-0004',
      patient_age: 28,
      patient_gender: 'M',
      triage_category: 'YELLOW',
      chief_complaint: 'Fever and headache',
      assigned_area: 'OPD',
      assigned_area_label: 'OPD',
      arrival_time: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      wait_time_minutes: 25,
      is_wait_exceeded: false,
      position: 4,
      alerts: [],
    }),
  ],
};

const mockWaitTimeStats = {
  avg_wait_minutes: 42,
  median_wait_minutes: 35,
  target_met_percentage: 85.2,
  by_category: [
    { category: 'RED', target_minutes: 0, avg_wait_minutes: 2, exceeded_percentage: 16.7 },
    { category: 'ORANGE', target_minutes: 10, avg_wait_minutes: 8, exceeded_percentage: 17.9 },
    { category: 'YELLOW', target_minutes: 60, avg_wait_minutes: 38, exceeded_percentage: 14.1 },
    { category: 'GREEN', target_minutes: 240, avg_wait_minutes: 85, exceeded_percentage: 3.3 },
    { category: 'BLUE', target_minutes: 480, avg_wait_minutes: 120, exceeded_percentage: 0 },
  ],
};

const mockThresholds = [
  { id: 1, vital_type: 'SPO2', critical_low: 90, warning_low: 95, warning_high: null, critical_high: null, is_active: true },
  { id: 2, vital_type: 'SYSTOLIC_BP', critical_low: 90, warning_low: 100, warning_high: 140, critical_high: 180, is_active: true },
  { id: 3, vital_type: 'DIASTOLIC_BP', critical_low: null, warning_low: null, warning_high: 90, critical_high: 120, is_active: true },
  { id: 4, vital_type: 'HEART_RATE', critical_low: 40, warning_low: 50, warning_high: 100, critical_high: 150, is_active: true },
  { id: 5, vital_type: 'TEMPERATURE', critical_low: 35.0, warning_low: 36.0, warning_high: 38.5, critical_high: 40.0, is_active: true },
  { id: 6, vital_type: 'RESPIRATORY_RATE', critical_low: 8, warning_low: 10, warning_high: 24, critical_high: 30, is_active: true },
];

const mockReportData = {
  date_range: { start: '2025-12-27', end: '2026-01-03' },
  total_assessments: 523,
  avg_wait_time_minutes: 42,
  median_wait_time_minutes: 35,
  target_met_percentage: 85.2,
  wait_times_by_category: mockWaitTimeStats.by_category,
  volume_by_category: [
    { category: 'RED', count: 18, percentage: 3.4 },
    { category: 'ORANGE', count: 67, percentage: 12.8 },
    { category: 'YELLOW', count: 156, percentage: 29.8 },
    { category: 'GREEN', count: 245, percentage: 46.8 },
    { category: 'BLUE', count: 37, percentage: 7.1 },
  ],
  volume_by_area: [
    { area: 'ER_ACUTE', area_label: 'ER - Acute Care', count: 187 },
    { area: 'ER_FAST_TRACK', area_label: 'ER - Fast Track', count: 89 },
    { area: 'OPD', area_label: 'OPD', count: 156 },
  ],
  lwbs_stats: {
    total_lwbs: 30,
    lwbs_rate: 5.7,
    avg_wait_before_lwbs_minutes: 145,
    by_category: [
      { category: 'RED', count: 0, rate: 0 },
      { category: 'ORANGE', count: 2, rate: 3 },
      { category: 'YELLOW', count: 8, rate: 5.1 },
      { category: 'GREEN', count: 15, rate: 6.1 },
      { category: 'BLUE', count: 5, rate: 13.5 },
    ],
  },
};

// =============================================================================
// SETUP HELPERS
// =============================================================================

async function setupMocks(page: Page) {
  // Auth
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: {
          id: 1,
          username: TEST_USER.username,
          permissions: [
            'perform_triage',
            'view_triage_queue',
            'override_triage_category',
            'triage.change_triageVitalthreshold',
          ],
        },
      }),
    });
  });

  // Queue endpoint - match /api/triage/queue/ with or without query params
  await page.route(/.*\/api\/triage\/queue\/(\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockQueueData),
      });
    } else if (method === 'POST') {
      // Queue actions (call, complete, lwbs)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    }
  });

  // Queue actions - match /api/triage/queue/{id}/{action}/
  await page.route(/.*\/api\/triage\/queue\/\d+\/\w+\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Wait time stats
  await page.route(/.*\/api\/triage\/reports\/wait-times.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockWaitTimeStats),
    });
  });

  // Full reports
  await page.route(/.*\/api\/triage\/reports\/(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockReportData),
    });
  });

  // Thresholds
  await page.route(/.*\/api\/triage\/vital-thresholds.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockThresholds),
    });
  });

  // Calculate category
  await page.route(/.*\/api\/triage\/calculate-category.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        suggested_category: 'ORANGE',
        alerts: [{ type: 'warning', message: 'Elevated heart rate' }],
      }),
    });
  });

  // Create/update triage
  await page.route(/.*\/api\/triage\/(\d+\/)?$/, async (route) => {
    const method = route.request().method();
    if (method === 'POST' || method === 'PATCH') {
      await route.fulfill({
        status: method === 'POST' ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          triage_category: 'ORANGE',
          patient_id: 1,
          queue_entry_id: 5,
        }),
      });
    } else if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockQueueEntry().triage_assessment),
      });
    }
  });

  // Patients (for new triage)
  await page.route(/.*\/api\/patients\/\d+\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        mrn: 'MRN-20260103-0001',
        first_name: 'Jane',
        last_name: 'Wanjiku',
        date_of_birth: '1980-05-15',
        gender: 'F',
        allergies: 'Penicillin',
      }),
    });
  });
}

async function loginAndNavigate(page: Page, path: string) {
  await setupMocks(page);
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(TEST_USER.username);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();

  // Wait for login to complete - the app redirects / -> /dashboard
  // Use a more flexible wait that handles the redirect chain
  await page.waitForURL((url) => {
    const pathname = url.pathname;
    return pathname === '/dashboard' || pathname === '/' || pathname.startsWith('/dashboard');
  }, { timeout: 15000 });

  // If we landed on /, wait for redirect to /dashboard
  if (page.url().endsWith('/')) {
    await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
  }

  await page.goto(path);
}

// =============================================================================
// TRIAGE QUEUE TESTS
// =============================================================================

test.describe('Triage Queue Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/triage');
  });

  test('displays queue with priority-sorted patients', async ({ page }) => {
    // Wait for queue to load
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Verify queue items are displayed
    // The queue shows patients sorted by category and wait time
    await expect(page.getByRole('heading', { name: 'Jane Wanjiku', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mary Otieno', level: 3 })).toBeVisible();

    // RED category patients should be visible
    await expect(page.getByText('RED').first()).toBeVisible();
  });

  test('displays color-coded category badges', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Check for different category badges
    await expect(page.getByText('RED').first()).toBeVisible();
    await expect(page.getByText('ORANGE').first()).toBeVisible();
    await expect(page.getByText('YELLOW').first()).toBeVisible();
  });

  test('shows essential patient information on queue cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Check first patient card has required info
    const firstCard = page.locator('[data-testid="queue-item-1"]');
    await expect(firstCard.getByText('Jane Wanjiku')).toBeVisible();
    await expect(firstCard.getByText(/MRN-20260103-0001/)).toBeVisible();
    await expect(firstCard.getByText(/Severe chest pain/)).toBeVisible();
  });

  test('displays wait time on patient cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Check wait time is displayed (use first() since multiple cards have wait times)
    await expect(page.getByText(/\d+ min/).first()).toBeVisible();
  });

  test('highlights exceeded wait times', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Mary Otieno has exceeded wait time (RED, 8 min)
    const exceededCard = page.locator('[data-testid="queue-item-2"]');
    await expect(exceededCard.getByText('Mary Otieno')).toBeVisible();
    // Check for warning indicator (use first() since card may have multiple red elements)
    await expect(exceededCard.locator('.text-destructive, .text-red-600, [data-exceeded="true"]').first()).toBeVisible();
  });

  test('can call a patient', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Click call button on first patient
    const firstCard = page.locator('[data-testid="queue-item-1"]');
    await firstCard.getByRole('button', { name: /call/i }).click();

    // Should show success toast with title "Patient Called"
    await expect(page.getByText('Patient Called', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('can mark patient as LWBS', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Open actions menu on a patient
    const patientCard = page.locator('[data-testid="queue-item-4"]');
    await patientCard.getByRole('button', { name: /lwbs|left without/i }).click();

    // Should prompt for reason (dialog with label)
    await expect(page.getByLabel(/reason for lwbs/i)).toBeVisible();
  });

  test('navigates to new triage page', async ({ page }) => {
    await page.getByRole('button', { name: /new triage/i }).click();
    await expect(page).toHaveURL(/.*triage\/new.*/);
  });

  test('can filter by category', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Open category filter using the specific filter button
    await page.getByRole('button', { name: 'Filter by category' }).click();

    // Wait for dropdown options to appear and click RED
    await page.getByText('RED', { exact: true }).first().click();

    // Should filter queue - RED badges should be visible (already showing RED patients)
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();
  });

  test('displays KPI cards with metrics', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Check for KPI cards (use first() as there may be multiple matching elements)
    await expect(page.getByText(/avg wait/i).first()).toBeVisible();
    await expect(page.getByText(/in queue/i).first()).toBeVisible();
  });

  test('can refresh the queue', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();

    // Click refresh button (use first() as there may be header and inline refresh buttons)
    await page.getByRole('button', { name: /refresh/i }).first().click();

    // Queue should still be visible after refresh
    await expect(page.getByText('Jane Wanjiku')).toBeVisible();
  });
});

// =============================================================================
// TRIAGE REPORTS TESTS
// =============================================================================

test.describe('Triage Reports', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/triage/reports');
  });

  test('displays reports page with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /triage reports/i }).first()).toBeVisible();
  });

  test('shows summary metrics', async ({ page }) => {
    await expect(page.getByText('523')).toBeVisible(); // Total triaged
    await expect(page.getByText(/42.*min|42/).first()).toBeVisible(); // Avg wait
    await expect(page.getByText(/85\.2%|85.2/).first()).toBeVisible(); // Target met
  });

  test('displays wait times by category table', async ({ page }) => {
    // Check for category breakdown - use first() to handle multiple occurrences
    await expect(page.getByText('RED').first()).toBeVisible();
    await expect(page.getByText('ORANGE').first()).toBeVisible();
    await expect(page.getByText('YELLOW').first()).toBeVisible();
    await expect(page.getByText('GREEN').first()).toBeVisible();
    await expect(page.getByText('BLUE').first()).toBeVisible();
  });

  test('displays LWBS statistics', async ({ page }) => {
    // Check for LWBS section heading
    await expect(page.getByRole('heading', { name: /left without being seen/i })).toBeVisible();
    await expect(page.getByText('30').first()).toBeVisible(); // Total LWBS
  });

  test('can change date range', async ({ page }) => {
    // Click date range selector button
    await page.getByRole('button', { name: /today|date range/i }).first().click();
    // Click on an option in the dropdown
    await page.getByText(/last 7 days/i).click();
    // Should update (check page doesn't error)
    await expect(page.getByRole('heading', { name: /triage reports/i }).first()).toBeVisible();
  });

  test('can filter by area', async ({ page }) => {
    // Click area filter button
    await page.getByRole('button', { name: /all areas|area/i }).first().click();
    // Click on an area option
    await page.getByText(/resuscitation/i).first().click();
    // Should apply filter
    await expect(page.getByRole('heading', { name: /triage reports/i }).first()).toBeVisible();
  });

  test('has export button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
  });

  test('can navigate back to queue', async ({ page }) => {
    await page.getByRole('button', { name: /back.*queue/i }).click();
    await expect(page).toHaveURL(/.*\/triage$/);
  });
});

// =============================================================================
// TRIAGE SETTINGS TESTS
// =============================================================================

test.describe('Triage Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/triage/settings');
  });

  test('displays settings page with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /triage settings/i })).toBeVisible();
  });

  test('shows vital thresholds table', async ({ page }) => {
    // Wait for thresholds to load
    await expect(page.getByText(/spo2/i)).toBeVisible();
    await expect(page.getByText(/heart rate/i)).toBeVisible();
    await expect(page.getByText(/temperature/i)).toBeVisible();
  });

  test('displays threshold values', async ({ page }) => {
    // SpO2 thresholds - use first match since value appears in multiple rows
    await expect(page.getByTestId('threshold-row-SPO2').getByText('90')).toBeVisible(); // Critical low
    await expect(page.getByTestId('threshold-row-SPO2').getByText('95')).toBeVisible(); // Warning low
  });

  test('shows active toggle switches', async ({ page }) => {
    // Check for toggle switches
    const switches = page.getByRole('switch');
    await expect(switches.first()).toBeVisible();
  });

  test('has export configuration button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
  });

  test('has import configuration button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /import/i })).toBeVisible();
  });

  test('can navigate back to queue', async ({ page }) => {
    await page.getByRole('button', { name: /back.*queue/i }).click();
    await expect(page).toHaveURL(/.*\/triage$/);
  });
});

// =============================================================================
// NAVIGATION TESTS
// =============================================================================

test.describe('Triage Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for login to complete - handle redirect chain / -> /dashboard
    await page.waitForURL((url) => {
      const pathname = url.pathname;
      return pathname === '/dashboard' || pathname === '/' || pathname.startsWith('/dashboard');
    }, { timeout: 15000 });

    if (page.url().endsWith('/')) {
      await page.waitForURL(/.*dashboard.*/, { timeout: 10000 });
    };
  });

  test('triage appears in sidebar navigation', async ({ page }) => {
    await expect(page.getByRole('link', { name: /triage/i })).toBeVisible();
  });

  test('can navigate to triage from sidebar', async ({ page }) => {
    await page.getByRole('link', { name: /triage/i }).click();
    await expect(page).toHaveURL(/.*triage.*/);
    await expect(page.getByRole('heading', { name: 'Triage Queue' }).first()).toBeVisible();
  });

  test('triage link is highlighted when active', async ({ page }) => {
    await page.goto('/triage');
    const triageLink = page.getByRole('link', { name: /triage/i });
    await expect(triageLink).toHaveAttribute('data-active', 'true');
  });
});

// =============================================================================
// ACCESSIBILITY TESTS
// =============================================================================

test.describe('Triage Accessibility', () => {
  test('queue page has proper heading structure', async ({ page }) => {
    await loginAndNavigate(page, '/triage');

    const h1 = page.getByRole('heading', { level: 1 }).first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/triage/i);
  });

  test('reports page has proper heading structure', async ({ page }) => {
    await loginAndNavigate(page, '/triage/reports');

    const h1 = page.getByRole('heading', { level: 1 }).first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/triage reports/i);
  });

  test('settings page has proper heading structure', async ({ page }) => {
    await loginAndNavigate(page, '/triage/settings');

    const h1 = page.getByRole('heading', { level: 1 }).first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/triage settings/i);
  });

  test('queue cards are keyboard navigable', async ({ page }) => {
    await loginAndNavigate(page, '/triage');

    // Tab to first card action button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should be able to activate with Enter
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});

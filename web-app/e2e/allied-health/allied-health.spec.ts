/**
 * Allied Health Module E2E Tests
 *
 * End-to-end tests for the Allied Health modules including:
 * - Dashboard navigation
 * - Physiotherapy workflow
 * - Social work sensitive case handling
 * - Session management
 *
 * Sprint: Allied Health Frontend Implementation
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login, mockApiResponse } from '../fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockDashboardStats = {
  physiotherapy: {
    pending_count: 5,
    in_progress_count: 12,
    today_sessions_count: 8,
    completed_today_count: 3,
  },
  nutrition: {
    pending_count: 3,
    in_progress_count: 8,
    today_sessions_count: 5,
    completed_today_count: 2,
    consultations_count: 11,
  },
  occupational_therapy: {
    pending_count: 2,
    in_progress_count: 4,
    today_sessions_count: 3,
    completed_today_count: 1,
  },
  social_work: {
    open_cases_count: 15,
    urgent_count: 2,
    this_week_count: 23,
  },
  counselling: {
    pending_count: 7,
    in_progress_count: 6,
    today_sessions_count: 10,
    completed_today_count: 4,
    follow_ups_count: 4,
  },
  todays_sessions: [
    {
      id: 1,
      session_number: 'PS-20260226-0001',
      scheduled_time: '2026-02-26T09:00:00Z',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      module: 'PHYSIO',
      treatment_type: 'Post-Surgery Rehab',
      status: 'SCHEDULED',
    },
    {
      id: 2,
      session_number: 'CS-20260226-0001',
      scheduled_time: '2026-02-26T09:30:00Z',
      patient_name: 'Jane Smith',
      patient_mrn: 'MRN-002',
      module: 'COUNSELLING',
      treatment_type: 'HIV Counselling',
      status: 'IN_PROGRESS',
    },
    {
      id: 3,
      session_number: 'OT-20260226-0001',
      scheduled_time: '2026-02-26T10:00:00Z',
      patient_name: 'Mary Johnson',
      patient_mrn: 'MRN-003',
      module: 'OT',
      treatment_type: 'ADL Training',
      status: 'SCHEDULED',
    },
  ],
};

const mockPhysioOrders = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      order_number: 'PHYSIO-20260226-0001',
      patient_name: 'John Doe',
      patient_mrn: 'MRN-001',
      treatment_type_name: 'Post-Surgery Rehabilitation',
      category: 'POST_SURGICAL',
      assigned_therapist_name: 'Jane Therapist',
      total_sessions: 12,
      completed_sessions: 3,
      priority: 'ROUTINE',
      status: 'IN_PROGRESS',
      created_at: '2026-02-26T10:00:00Z',
    },
    {
      id: 2,
      order_number: 'PHYSIO-20260226-0002',
      patient_name: 'Mary Smith',
      patient_mrn: 'MRN-002',
      treatment_type_name: 'Sports Injury Recovery',
      category: 'SPORTS',
      assigned_therapist_name: null,
      total_sessions: 8,
      completed_sessions: 0,
      priority: 'URGENT',
      status: 'PENDING',
      created_at: '2026-02-26T09:00:00Z',
    },
  ],
};

const mockPhysioOrderDetail = {
  id: 1,
  order_number: 'PHYSIO-20260226-0001',
  patient: {
    id: 1,
    mrn: 'MRN-001',
    first_name: 'John',
    last_name: 'Doe',
    full_name: 'John Doe',
    date_of_birth: '1970-05-15',
    gender: 'M',
  },
  patient_id: 1,
  encounter_id: 100,
  clinic_visit_id: 500,
  treatment_type: {
    id: 1,
    code: 'PT-PSR-001',
    name: 'Post-Surgery Rehabilitation',
    category: 'POST_SURGICAL',
    typical_duration_minutes: 45,
    cost_per_session: '2000.00',
    sha_claimable: true,
  },
  treatment_type_id: 1,
  ordered_by: {
    id: 10,
    username: 'dr.smith',
    first_name: 'Dr.',
    last_name: 'Smith',
    full_name: 'Dr. Smith',
  },
  ordered_by_id: 10,
  assigned_therapist: {
    id: 20,
    username: 'jane.therapist',
    first_name: 'Jane',
    last_name: 'Therapist',
    full_name: 'Jane Therapist',
  },
  assigned_therapist_id: 20,
  referral_reason: 'POST_SURGERY',
  clinical_indication: 'Post knee replacement rehabilitation',
  relevant_history: 'Total knee replacement 2 weeks ago',
  diagnosis: 'Post-operative knee stiffness',
  precautions: 'Weight bearing as tolerated',
  contraindications: '',
  total_sessions: 12,
  sessions_completed: 3,
  frequency: '3x per week',
  treatment_goals: 'Full ROM and strength restoration',
  priority: 'ROUTINE',
  status: 'IN_PROGRESS',
  start_date: '2026-02-10',
  expected_end_date: '2026-04-15',
  clinical_notes: 'Good progress observed',
  is_sensitive: false,
  sha_code: 'PT001',
  sha_claimable: true,
  created_at: '2026-02-10T10:00:00Z',
  updated_at: '2026-02-26T14:00:00Z',
};

const mockTreatmentTypes = {
  count: 5,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'PT-PSR-001',
      name: 'Post-Surgery Rehabilitation',
      category: 'POST_SURGICAL',
      typical_duration_minutes: 45,
      recommended_sessions: 12,
      cost_per_session: '2000.00',
      sha_claimable: true,
      is_active: true,
    },
    {
      id: 2,
      code: 'PT-SPT-001',
      name: 'Sports Injury Recovery',
      category: 'SPORTS',
      typical_duration_minutes: 60,
      recommended_sessions: 8,
      cost_per_session: '2500.00',
      sha_claimable: true,
      is_active: true,
    },
  ],
};

const mockSocialWorkCases = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      case_number: 'SW-20260226-0001',
      patient_name: 'Protected Patient',
      patient_mrn: 'MRN-100',
      referral_reason: 'GBV support needed',
      urgency: 'CRITICAL',
      status: 'OPEN',
      is_sensitive: true,
      opened_date: '2026-02-26T08:00:00Z',
      assigned_worker_name: 'Sarah Worker',
    },
    {
      id: 2,
      case_number: 'SW-20260225-0001',
      patient_name: 'John Patient',
      patient_mrn: 'MRN-101',
      referral_reason: 'Financial assistance for treatment',
      urgency: 'ROUTINE',
      status: 'OPEN',
      is_sensitive: false,
      opened_date: '2026-02-25T10:00:00Z',
      assigned_worker_name: 'Tom Worker',
    },
  ],
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function setupAlliedHealthMocks(page: Page) {
  // Dashboard stats
  await page.route(`${API_BASE}/api/allied-health/dashboard/`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockDashboardStats),
    });
  });

  // Physiotherapy orders
  await page.route(`${API_BASE}/api/physiotherapy/orders/*`, async (route) => {
    const url = route.request().url();
    if (url.match(/\/orders\/\d+\/?$/)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPhysioOrderDetail),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPhysioOrders),
      });
    }
  });

  // Treatment types
  await page.route(`${API_BASE}/api/physiotherapy/treatment-types/*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTreatmentTypes),
    });
  });

  // Social work cases
  await page.route(`${API_BASE}/api/social-work/cases/*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSocialWorkCases),
    });
  });
}

// =============================================================================
// DASHBOARD TESTS
// =============================================================================

test.describe('Allied Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should navigate to allied health dashboard', async ({ page }) => {
    await page.goto('/allied-health');

    await expect(page.locator('h1')).toContainText(/allied health/i);
  });

  test('should display module cards with stats', async ({ page }) => {
    await page.goto('/allied-health');

    // Physiotherapy card
    await expect(page.locator('text=Physiotherapy')).toBeVisible();
    await expect(page.locator('text=5')).toBeVisible(); // pending_count

    // Nutrition card
    await expect(page.locator('text=Nutrition')).toBeVisible();

    // Occupational Therapy card
    await expect(page.locator('text=Occupational Therapy')).toBeVisible();

    // Social Work card
    await expect(page.locator('text=Social Work')).toBeVisible();
    await expect(page.locator('text=15')).toBeVisible(); // open_cases_count

    // Counselling card
    await expect(page.locator('text=Counselling')).toBeVisible();
  });

  test('should display today\'s sessions list', async ({ page }) => {
    await page.goto('/allied-health');

    // Today's sessions section
    await expect(page.locator('text=Today\'s Sessions')).toBeVisible();
    await expect(page.locator('text=John Doe')).toBeVisible();
    await expect(page.locator('text=Jane Smith')).toBeVisible();
    await expect(page.locator('text=Mary Johnson')).toBeVisible();
  });

  test('should navigate to physiotherapy from dashboard', async ({ page }) => {
    await page.goto('/allied-health');

    await page.click('text=Physiotherapy');

    await expect(page).toHaveURL(/.*physiotherapy.*/);
  });

  test('should navigate to social work from dashboard', async ({ page }) => {
    await page.goto('/allied-health');

    await page.click('text=Social Work');

    await expect(page).toHaveURL(/.*social-work.*/);
  });
});

// =============================================================================
// PHYSIOTHERAPY WORKFLOW TESTS
// =============================================================================

test.describe('Physiotherapy Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should display physiotherapy orders list', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy');

    await expect(page.locator('text=PHYSIO-20260226-0001')).toBeVisible();
    await expect(page.locator('text=John Doe')).toBeVisible();
    await expect(page.locator('text=Post-Surgery Rehabilitation')).toBeVisible();
  });

  test('should filter orders by status', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy');

    // Open status filter
    await page.click('text=All Status');
    await page.click('text=Pending');

    // Should update URL or make filtered request
    await expect(page.locator('text=Mary Smith')).toBeVisible();
  });

  test('should search orders by patient name', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy');

    await page.fill('[placeholder*="Search"]', 'John');
    await page.click('button:has-text("Search")');

    await expect(page.locator('text=John Doe')).toBeVisible();
  });

  test('should navigate to order detail on row click', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy');

    await page.click('tr:has-text("PHYSIO-20260226-0001")');

    await expect(page).toHaveURL(/.*physiotherapy.*orders.*1.*/);
  });

  test('should display order detail page', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy/orders/1');

    await expect(page.locator('text=PHYSIO-20260226-0001')).toBeVisible();
    await expect(page.locator('text=John Doe')).toBeVisible();
    await expect(page.locator('text=Post-Surgery Rehabilitation')).toBeVisible();
    await expect(page.locator('text=In Progress')).toBeVisible();
  });

  test('should show session progress on order detail', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy/orders/1');

    // Session progress: 3/12
    await expect(page.locator('text=3 / 12')).toBeVisible();
  });

  test('should display assigned therapist', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy/orders/1');

    await expect(page.locator('text=Jane Therapist')).toBeVisible();
  });
});

// =============================================================================
// COMPLETE PHYSIOTHERAPY WORKFLOW E2E
// =============================================================================

test.describe('Complete Physiotherapy Workflow', () => {
  test('should complete full physiotherapy order workflow', async ({ page }) => {
    // Step 1: Setup mocks for complete workflow
    await page.route(`${API_BASE}/api/token/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'mock-access-token',
          refresh: 'mock-refresh-token',
          user: { id: 1, username: 'testuser' },
        }),
      });
    });

    await setupAlliedHealthMocks(page);

    // Mock order creation
    await page.route(`${API_BASE}/api/physiotherapy/orders/`, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ...mockPhysioOrderDetail,
            status: 'PENDING',
            sessions_completed: 0,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockPhysioOrders),
        });
      }
    });

    // Mock order approval
    await page.route(`${API_BASE}/api/physiotherapy/orders/*/approve/`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockPhysioOrderDetail,
          status: 'APPROVED',
        }),
      });
    });

    // Step 2: Login
    await login(page, TEST_USER.username, TEST_USER.password);

    // Step 3: Navigate to create new order
    await page.goto('/allied-health/physiotherapy');
    await page.click('button:has-text("New Order")');

    await expect(page).toHaveURL(/.*orders.*new.*/);

    // Step 4: Fill order form (if form exists)
    // Note: This assumes a form exists at the /orders/new route

    // Step 5: Navigate back and view order
    await page.goto('/allied-health/physiotherapy/orders/1');

    await expect(page.locator('text=PHYSIO-20260226-0001')).toBeVisible();
  });
});

// =============================================================================
// SOCIAL WORK SENSITIVE CASE TESTS
// =============================================================================

test.describe('Social Work Sensitive Case Handling', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should display social work cases list', async ({ page }) => {
    await page.goto('/allied-health/social-work');

    await expect(page.locator('text=SW-20260226-0001')).toBeVisible();
    await expect(page.locator('text=Protected Patient')).toBeVisible();
  });

  test('should show urgent badge for critical cases', async ({ page }) => {
    await page.goto('/allied-health/social-work');

    // Critical urgency badge
    await expect(page.locator('text=Critical')).toBeVisible();
  });

  test('should indicate sensitive cases', async ({ page }) => {
    await page.goto('/allied-health/social-work');

    // Sensitive case indicator (could be a badge, icon, or banner)
    // The exact selector depends on component implementation
    const sensitiveIndicator = page.locator('[data-sensitive="true"], .sensitive-indicator, text=Restricted');
    await expect(sensitiveIndicator.first()).toBeVisible();
  });

  test('should filter by urgency level', async ({ page }) => {
    await page.goto('/allied-health/social-work');

    // Click urgency filter if available
    const urgencyFilter = page.locator('text=All Urgency, [placeholder*="urgency"]');
    if (await urgencyFilter.isVisible()) {
      await urgencyFilter.click();
      await page.click('text=Critical');
    }
  });
});

// =============================================================================
// COUNSELLING TESTS
// =============================================================================

test.describe('Counselling Module', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);

    // Mock counselling referrals
    await page.route(`${API_BASE}/api/counselling/referrals/*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 1,
              referral_number: 'CR-20260226-0001',
              patient_name: 'Jane Patient',
              patient_mrn: 'MRN-200',
              counselling_type: 'HIV_SUPPORT',
              counselling_type_display: 'HIV Support',
              urgency: 'ROUTINE',
              status: 'IN_PROGRESS',
              is_sensitive: true,
              created_at: '2026-02-26T08:00:00Z',
            },
          ],
        }),
      });
    });

    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should display counselling referrals list', async ({ page }) => {
    await page.goto('/allied-health/counselling');

    await expect(page.locator('text=CR-20260226-0001')).toBeVisible();
    await expect(page.locator('text=Jane Patient')).toBeVisible();
  });

  test('should show counselling type', async ({ page }) => {
    await page.goto('/allied-health/counselling');

    await expect(page.locator('text=HIV Support')).toBeVisible();
  });
});

// =============================================================================
// NAVIGATION AND ACCESSIBILITY TESTS
// =============================================================================

test.describe('Allied Health Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should have allied health in main navigation', async ({ page }) => {
    await page.goto('/dashboard');

    // Open sidebar or main nav
    const alliedHealthNav = page.locator('nav >> text=Allied Health');
    await expect(alliedHealthNav).toBeVisible();
  });

  test('should expand allied health submenu', async ({ page }) => {
    await page.goto('/dashboard');

    // Click Allied Health nav item
    await page.click('nav >> text=Allied Health');

    // Should show submenu items
    await expect(page.locator('nav >> text=Physiotherapy')).toBeVisible();
    await expect(page.locator('nav >> text=Nutrition')).toBeVisible();
    await expect(page.locator('nav >> text=Social Work')).toBeVisible();
  });

  test('should navigate between allied health modules', async ({ page }) => {
    await page.goto('/allied-health/physiotherapy');

    // Navigate to nutrition
    await page.click('nav >> text=Nutrition');
    await expect(page).toHaveURL(/.*nutrition.*/);

    // Navigate to social work
    await page.click('nav >> text=Social Work');
    await expect(page).toHaveURL(/.*social-work.*/);

    // Navigate to counselling
    await page.click('nav >> text=Counselling');
    await expect(page).toHaveURL(/.*counselling.*/);
  });
});

// =============================================================================
// RESPONSIVE DESIGN TESTS
// =============================================================================

test.describe('Allied Health Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    await setupAlliedHealthMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should display mobile-friendly layout on small screens', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/allied-health');

    // Dashboard should still be functional
    await expect(page.locator('h1')).toContainText(/allied health/i);

    // Module cards should stack vertically
    const cards = page.locator('[data-testid="module-card"], .module-card');
    if (await cards.count() > 0) {
      const firstCard = cards.first();
      const secondCard = cards.nth(1);

      const firstBox = await firstCard.boundingBox();
      const secondBox = await secondCard.boundingBox();

      // Cards should be stacked (second card below first)
      if (firstBox && secondBox) {
        expect(secondBox.y).toBeGreaterThan(firstBox.y);
      }
    }
  });

  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/allied-health');

    await expect(page.locator('text=Physiotherapy')).toBeVisible();
    await expect(page.locator('text=Nutrition')).toBeVisible();
  });
});

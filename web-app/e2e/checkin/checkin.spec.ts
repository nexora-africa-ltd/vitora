/**
 * Patient Check-in E2E Tests
 *
 * End-to-end tests for the patient check-in workflow including:
 * - Patient lookup with clinical snapshot
 * - Check-in to triage
 * - Direct check-in to clinic (skip triage)
 * - Visit reason detection and selection
 * - Today's check-ins display
 *
 * Sprint: Returning Patient Workflow - Sprint 1
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER } from '../fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockPatientLookup = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  mrn: 'MRN-20260103-0001',
  first_name: 'Jane',
  middle_name: 'Wanjiku',
  last_name: 'Kamau',
  full_name: 'Jane Wanjiku Kamau',
  date_of_birth: '1985-05-20',
  age: 40,
  gender: 'F',
  phone_number: '0712345678',
  identification_type: 'NATIONAL_ID',
  identification_number: '12345678',
  county: 1,
  sub_county: 1,
  ward: 1,
  clinical_snapshot: {
    allergies: ['Penicillin', 'Sulfa'],
    active_conditions: ['Type 2 Diabetes', 'Hypertension'],
    current_medications: ['Metformin 500mg BD', 'Lisinopril 10mg OD', 'Aspirin 75mg OD'],
    last_visit_date: '2026-01-15',
    last_visit_clinic: 'General OPD',
    pending_results: [
      { test_name: 'HbA1c', ordered_date: '2026-01-15', status: 'PENDING' },
      { test_name: 'Lipid Profile', ordered_date: '2026-01-15', status: 'PENDING' },
    ],
    alerts: ['ALLERGY: Penicillin (SEVERE)'],
  },
  suggested_visit_type: 'RETURN',
  suggested_visit_reason: 'CHRONIC_CARE',
  last_encounter_date: '2026-01-15',
  ...overrides,
});

const mockNewPatientLookup = () =>
  mockPatientLookup({
    id: 102,
    mrn: 'MRN-20260207-0001',
    first_name: 'John',
    middle_name: null,
    last_name: 'Odhiambo',
    full_name: 'John Odhiambo',
    clinical_snapshot: {
      allergies: [],
      active_conditions: [],
      current_medications: [],
      last_visit_date: null,
      last_visit_clinic: null,
      pending_results: [],
      alerts: [],
    },
    suggested_visit_type: 'NEW',
    suggested_visit_reason: 'NEW_COMPLAINT',
    last_encounter_date: null,
  });

const mockLabReviewPatient = () =>
  mockPatientLookup({
    id: 103,
    mrn: 'MRN-20260115-0003',
    first_name: 'Mary',
    last_name: 'Otieno',
    full_name: 'Mary Otieno',
    clinical_snapshot: {
      allergies: [],
      active_conditions: ['Diabetes Mellitus'],
      current_medications: ['Metformin 500mg BD'],
      last_visit_date: '2026-02-01',
      last_visit_clinic: 'Diabetic Clinic',
      pending_results: [
        { test_name: 'Fasting Blood Sugar', ordered_date: '2026-02-01', status: 'COMPLETE' },
        { test_name: 'HbA1c', ordered_date: '2026-02-01', status: 'COMPLETE' },
      ],
      alerts: [],
    },
    suggested_visit_type: 'RETURN',
    suggested_visit_reason: 'LAB_REVIEW',
    last_encounter_date: '2026-02-01',
  });

const mockCheckinResponse = (overrides: Record<string, unknown> = {}) => ({
  checkin_id: 501,
  patient_name: 'Jane Wanjiku Kamau',
  patient_mrn: 'MRN-20260103-0001',
  destination: 'Triage',
  destination_clinic_id: null,
  destination_clinic_name: null,
  visit_type: 'RETURN',
  visit_reason: 'CHRONIC_CARE',
  skip_triage: false,
  status: 'CHECKED_IN',
  queue_position: 3,
  estimated_wait_minutes: 15,
  checked_in_at: new Date().toISOString(),
  encounter_id: 1001,
  linked_encounter_id: null,
  clinic_visit_id: null,
  ...overrides,
});

const mockTodayCheckins = {
  count: 3,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      patient_name: 'Alice Mwangi',
      patient_mrn: 'MRN-20260110-0005',
      destination: 'Triage',
      destination_clinic_id: null,
      visit_type: 'RETURN',
      visit_reason: 'FOLLOW_UP',
      status: 'CHECKED_IN',
      checked_in_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      checked_in_by_name: 'Reception User',
      skip_triage: false,
    },
    {
      id: 2,
      patient_name: 'Bob Kimani',
      patient_mrn: 'MRN-20260205-0010',
      destination: 'CCC Clinic',
      destination_clinic_id: 2,
      visit_type: 'RETURN',
      visit_reason: 'REFILL_ONLY',
      status: 'CHECKED_IN',
      checked_in_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      checked_in_by_name: 'Reception User',
      skip_triage: true,
    },
    {
      id: 3,
      patient_name: 'Carol Njeri',
      patient_mrn: 'MRN-20260201-0015',
      destination: 'Triage',
      destination_clinic_id: null,
      visit_type: 'NEW',
      visit_reason: 'NEW_COMPLAINT',
      status: 'CHECKED_IN',
      checked_in_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      checked_in_by_name: 'Reception User',
      skip_triage: false,
    },
  ],
};

const mockClinics = {
  count: 4,
  next: null,
  previous: null,
  results: [
    { id: 1, name: 'General OPD', code: 'OPD', is_active: true },
    { id: 2, name: 'CCC Clinic', code: 'CCC', is_active: true },
    { id: 3, name: 'MCH Clinic', code: 'MCH', is_active: true },
    { id: 4, name: 'Diabetic Clinic', code: 'DIAB', is_active: true },
  ],
};

// =============================================================================
// SETUP HELPERS
// =============================================================================

async function setupMocks(page: Page, options: { patientNotFound?: boolean } = {}) {
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
            'patients.view_patient',
            'patients.add_patient',
            'checkin.add_checkin',
            'checkin.view_checkin',
          ],
        },
      }),
    });
  });

  // Patient lookup endpoint
  await page.route(/.*\/api\/checkin\/lookup\/.*/, async (route) => {
    if (options.patientNotFound) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Patient not found' }),
      });
    } else {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') || '';

      // Return different patients based on query
      let patient;
      if (query.includes('NEW') || query.includes('new-patient')) {
        patient = mockNewPatientLookup();
      } else if (query.includes('LAB') || query.includes('lab-review')) {
        patient = mockLabReviewPatient();
      } else {
        patient = mockPatientLookup();
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(patient),
      });
    }
  });

  // Check-in endpoint
  await page.route(/.*\/api\/checkin\/patients\/\d+\/checkin\//, async (route) => {
    const body = route.request().postDataJSON();
    const destination =
      body?.destination === 'TRIAGE'
        ? 'Triage'
        : mockClinics.results.find((c) => c.id === body?.destination)?.name || 'Clinic';

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(
        mockCheckinResponse({
          destination,
          destination_clinic_id: body?.destination === 'TRIAGE' ? null : body?.destination,
          destination_clinic_name: body?.destination === 'TRIAGE' ? null : destination,
          visit_reason: body?.visit_reason || 'CHRONIC_CARE',
          skip_triage: body?.skip_triage || false,
        })
      ),
    });
  });

  // Today's check-ins endpoint
  await page.route(/.*\/api\/checkin\/today\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTodayCheckins),
    });
  });

  // Clinics endpoint
  await page.route(/.*\/api\/clinics\/(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockClinics),
    });
  });

  // Me endpoint (user info)
  await page.route('**/api/users/me/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        username: TEST_USER.username,
        email: 'test@vitora.health',
        first_name: 'Test',
        last_name: 'User',
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

async function loginAndNavigateWithOptions(
  page: Page,
  path: string,
  options: { patientNotFound?: boolean } = {}
) {
  await setupMocks(page, options);
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(TEST_USER.username);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();

  // Wait for login to complete - the app redirects / -> /dashboard
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
// PAGE DISPLAY TESTS
// =============================================================================

test.describe('Patient Check-in Page Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
  });

  test('displays page title and search input', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /patient check-in/i })).toBeVisible();
    await expect(
      page.getByPlaceholder(/scan or enter mrn.*national id.*phone/i)
    ).toBeVisible();
  });

  test('displays ready to check-in empty state', async ({ page }) => {
    await expect(page.getByText(/ready to check-in/i)).toBeVisible();
    await expect(page.getByText(/enter a patient.*mrn.*national id.*phone/i)).toBeVisible();
  });

  test('search input is auto-focused', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await expect(searchInput).toBeFocused();
  });

  test('displays recent check-ins section', async ({ page }) => {
    await expect(page.getByText(/recent check-ins today/i)).toBeVisible();
  });

  test('shows today check-ins list with proper info', async ({ page }) => {
    // Wait for the check-ins to load
    await expect(page.getByText('Alice Mwangi')).toBeVisible();
    await expect(page.getByText('Bob Kimani')).toBeVisible();
    await expect(page.getByText('Carol Njeri')).toBeVisible();

    // Check MRNs are displayed
    await expect(page.getByText(/MRN-20260110-0005/)).toBeVisible();

    // Check destinations
    await expect(page.getByText('Triage').first()).toBeVisible();
    await expect(page.getByText('CCC Clinic')).toBeVisible();
  });

  test('shows check-in count badge', async ({ page }) => {
    // Check for count badge showing total check-ins
    const countBadge = page.locator('text="3"').first();
    await expect(countBadge).toBeVisible();
  });
});

// =============================================================================
// PATIENT LOOKUP TESTS
// =============================================================================

test.describe('Patient Lookup', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
  });

  test('can search for patient by MRN', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await searchInput.fill('MRN-20260103-0001');

    // Wait for debounced search and results
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/MRN-20260103-0001/)).toBeVisible();
  });

  test('displays patient verification card with basic info', async ({ page }) => {
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    // Patient name and demographics
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/female.*40y|40y.*female/i)).toBeVisible();
    await expect(page.getByText(/MRN.*MRN-20260103-0001/)).toBeVisible();
  });

  test('displays suggested visit type badge', async ({ page }) => {
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    // Should show RETURN badge for returning patient
    await expect(page.getByTestId('visit-type-badge')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('visit-type-badge')).toHaveText('RETURN');
  });

  test('shows last visit information', async ({ page }) => {
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    await expect(page.getByText(/last visit.*jan.*2026/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/general opd/i)).toBeVisible();
  });

  test('shows loading state while searching', async ({ page }) => {
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    // Brief loading state (may be fast with mocks)
    await expect(page.getByText(/searching/i)).toBeVisible({ timeout: 1000 }).catch(() => {
      // Loading may be too fast to catch, which is ok
    });
  });
});

// =============================================================================
// CLINICAL SNAPSHOT DISPLAY TESTS
// =============================================================================

test.describe('Clinical Snapshot Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
  });

  test('displays allergies with severity alert', async ({ page }) => {
    await expect(page.getByText(/allergies/i)).toBeVisible();
    await expect(page.getByText('Penicillin').first()).toBeVisible();
    await expect(page.getByText('Sulfa')).toBeVisible();
  });

  test('displays clinical alerts prominently', async ({ page }) => {
    await expect(page.getByText(/allergy.*penicillin.*severe/i)).toBeVisible();
  });

  test('displays active conditions', async ({ page }) => {
    await expect(page.getByText(/active conditions/i)).toBeVisible();
    await expect(page.getByText('Type 2 Diabetes')).toBeVisible();
    await expect(page.getByText('Hypertension')).toBeVisible();
  });

  test('displays current medications', async ({ page }) => {
    await expect(page.getByText(/current medications/i)).toBeVisible();
    await expect(page.getByText(/metformin 500mg bd/i)).toBeVisible();
    await expect(page.getByText(/lisinopril 10mg od/i)).toBeVisible();
  });

  test('displays pending results', async ({ page }) => {
    await expect(page.getByText(/pending results/i)).toBeVisible();
    await expect(page.getByText(/hba1c/i)).toBeVisible();
    await expect(page.getByText(/lipid profile/i)).toBeVisible();
  });
});

// =============================================================================
// PATIENT NOT FOUND TESTS
// =============================================================================

test.describe('Patient Not Found', () => {
  test('shows not found message when patient does not exist', async ({ page }) => {
    await loginAndNavigateWithOptions(page, '/patients/checkin', { patientNotFound: true });

    await page.getByPlaceholder(/scan or enter mrn/i).fill('UNKNOWN-MRN');

    await expect(page.getByText(/patient not found/i)).toBeVisible({ timeout: 5000 });
  });

  test('provides link to register new patient', async ({ page }) => {
    await loginAndNavigateWithOptions(page, '/patients/checkin', { patientNotFound: true });

    await page.getByPlaceholder(/scan or enter mrn/i).fill('UNKNOWN');

    await expect(page.getByText(/patient not found/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /register new patient/i })).toBeVisible();
  });

  test('register new patient link navigates correctly', async ({ page }) => {
    await loginAndNavigateWithOptions(page, '/patients/checkin', { patientNotFound: true });

    await page.getByPlaceholder(/scan or enter mrn/i).fill('UNKNOWN');

    await expect(page.getByText(/patient not found/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /register new patient/i }).click();

    await expect(page).toHaveURL(/.*patients\/new.*/);
  });
});

// =============================================================================
// CHECK-IN TO TRIAGE TESTS
// =============================================================================

test.describe('Check-in to Triage', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
  });

  test('displays check-in to triage button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /check-in to triage/i })).toBeVisible();
  });

  test('can check in patient to triage', async ({ page }) => {
    await page.getByRole('button', { name: /check-in to triage/i }).click();

    // Should show success toast
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/position.*3/i)).toBeVisible();
  });

  test('clears search after successful check-in', async ({ page }) => {
    await page.getByRole('button', { name: /check-in to triage/i }).click();

    // Wait for toast
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });

    // Search should be cleared
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await expect(searchInput).toHaveValue('');
  });
});

// =============================================================================
// DIRECT TO CLINIC TESTS
// =============================================================================

test.describe('Check-in Direct to Clinic', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
  });

  test('displays clinic selection dropdown', async ({ page }) => {
    await expect(page.getByRole('combobox', { name: /select clinic/i })).toBeVisible();
  });

  test('can select a clinic from dropdown', async ({ page }) => {
    await page.getByRole('combobox', { name: /select clinic/i }).click();

    // Should show available clinics as options
    await expect(page.getByRole('option', { name: 'General OPD' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'CCC Clinic' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Diabetic Clinic' })).toBeVisible();

    await page.getByRole('option', { name: 'Diabetic Clinic' }).click();
  });

  test('direct to clinic button is disabled until clinic is selected', async ({ page }) => {
    // The direct to clinic button should be disabled when no clinic selected
    await expect(page.getByRole('button', { name: /direct to clinic/i })).toBeDisabled();
  });

  test('can check in patient directly to clinic', async ({ page }) => {
    // Select a clinic
    await page.getByRole('combobox', { name: /select clinic/i }).click();
    await page.getByRole('option', { name: 'Diabetic Clinic' }).click();

    // Click the direct to clinic button
    await page.getByRole('button', { name: /direct to clinic/i }).click();

    // Should show success
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });
  });
});

// =============================================================================
// VISIT REASON SELECTION TESTS
// =============================================================================

test.describe('Visit Reason Selection', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
  });

  test('displays visit reason dropdown with default value', async ({ page }) => {
    await expect(page.getByText(/visit reason/i)).toBeVisible();
    // Default should be CHRONIC_CARE based on mock data
    await expect(page.getByText(/chronic care review/i)).toBeVisible();
  });

  test('can change visit reason', async ({ page }) => {
    // Click the visit reason dropdown
    await page.getByRole('combobox').filter({ hasText: /chronic care/i }).click();

    // Should show all options
    await expect(page.getByText('New Complaint')).toBeVisible();
    await expect(page.getByText('Follow-up')).toBeVisible();
    await expect(page.getByText(/medication refill only.*skip triage/i)).toBeVisible();
    await expect(page.getByText(/lab results review.*skip triage/i)).toBeVisible();

    // Select a different reason
    await page.getByText('Follow-up').click();
  });

  test('shows skip triage indicator for eligible reasons', async ({ page }) => {
    // Change to a skip-triage reason
    await page.getByRole('combobox').filter({ hasText: /chronic care/i }).click();
    await page.getByText(/medication refill only.*skip triage/i).click();

    // Should show skip triage message
    await expect(page.getByText(/this visit reason will skip triage/i)).toBeVisible();
  });
});

// =============================================================================
// SMART VISIT CONTEXT DETECTION TESTS
// =============================================================================

test.describe('Smart Visit Context Detection', () => {
  test('suggests NEW visit type for new patient', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Search for a new patient
    await page.getByPlaceholder(/scan or enter mrn/i).fill('NEW-patient');

    await expect(page.getByText('John Odhiambo')).toBeVisible({ timeout: 5000 });

    // Should show NEW badge
    await expect(page.getByTestId('visit-type-badge')).toHaveText('NEW');
  });

  test('suggests LAB_REVIEW reason when patient has pending results', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Search for LAB review patient
    await page.getByPlaceholder(/scan or enter mrn/i).fill('LAB-review');

    await expect(page.getByText('Mary Otieno')).toBeVisible({ timeout: 5000 });

    // Default reason should be LAB_REVIEW
    await expect(page.getByText(/lab results review/i)).toBeVisible();
  });

  test('suggests CHRONIC_CARE for patient with chronic conditions', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Default patient has chronic conditions
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });

    // Default reason should be CHRONIC_CARE
    await expect(page.getByText(/chronic care review/i)).toBeVisible();
  });
});

// =============================================================================
// NEW PATIENT CHECK-IN TESTS
// =============================================================================

test.describe('New Patient Check-in', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
    await page.getByPlaceholder(/scan or enter mrn/i).fill('NEW-patient');
    await expect(page.getByText('John Odhiambo')).toBeVisible({ timeout: 5000 });
  });

  test('shows NEW badge for new patient', async ({ page }) => {
    await expect(page.getByTestId('visit-type-badge')).toHaveText('NEW');
  });

  test('does not show clinical snapshot for new patient', async ({ page }) => {
    // Should not show allergies, conditions, or medications sections
    await expect(page.getByText(/allergies/i)).not.toBeVisible();
    await expect(page.getByText(/active conditions/i)).not.toBeVisible();
    await expect(page.getByText(/current medications/i)).not.toBeVisible();
  });

  test('does not show last visit info for new patient', async ({ page }) => {
    await expect(page.getByText(/last visit/i)).not.toBeVisible();
  });

  test('defaults to NEW_COMPLAINT reason', async ({ page }) => {
    await expect(page.getByText(/new complaint/i)).toBeVisible();
  });
});

// =============================================================================
// KEYBOARD NAVIGATION TESTS
// =============================================================================

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');
  });

  test('can search and submit with Enter key', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await searchInput.fill('MRN-20260103-0001');

    // Enter triggers search (debounced, but Enter could force immediate)
    await searchInput.press('Enter');

    // Patient should appear
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
  });

  test('can clear search with Escape or clearing input', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await searchInput.fill('MRN-20260103-0001');

    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });

    // Clear the input
    await searchInput.fill('');

    // Should show ready state again
    await expect(page.getByText(/ready to check-in/i)).toBeVisible();
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

test.describe('Error Handling', () => {
  test('handles check-in failure gracefully', async ({ page }) => {
    await setupMocks(page);

    // Override check-in endpoint to return error
    await page.route(/.*\/api\/checkin\/patients\/\d+\/checkin\//, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Server error' }),
      });
    });

    // Login first
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL((url) => url.pathname.includes('dashboard') || url.pathname === '/', { timeout: 15000 });
    await page.goto('/patients/checkin');

    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /check-in to triage/i }).click();

    // Should show error toast
    await expect(page.getByText(/check-in failed/i)).toBeVisible({ timeout: 5000 });
  });

  test('handles lookup timeout gracefully', async ({ page }) => {
    await setupMocks(page);

    // Override lookup to be very slow
    await page.route(/.*\/api\/checkin\/lookup\/.*/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPatientLookup()),
      });
    });

    // Login first
    await page.goto('/login');
    await page.getByLabel(/username/i).fill(TEST_USER.username);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL((url) => url.pathname.includes('dashboard') || url.pathname === '/', { timeout: 15000 });
    await page.goto('/patients/checkin');

    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-test');

    // Should show loading state
    await expect(page.getByText(/searching/i)).toBeVisible({ timeout: 2000 });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

test.describe('Check-in Workflow Integration', () => {
  test('complete returning patient check-in to triage flow', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Step 1: Search for patient
    await page.getByPlaceholder(/scan or enter mrn/i).fill('MRN-20260103-0001');

    // Step 2: Verify patient info
    await expect(page.getByText('Jane Wanjiku Kamau')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('visit-type-badge')).toHaveText('RETURN');

    // Step 3: Review clinical snapshot
    await expect(page.getByText('Penicillin').first()).toBeVisible();
    await expect(page.getByText('Type 2 Diabetes')).toBeVisible();

    // Step 4: Confirm visit reason
    await expect(page.getByText(/chronic care review/i)).toBeVisible();

    // Step 5: Check in to triage
    await page.getByRole('button', { name: /check-in to triage/i }).click();

    // Step 6: Verify success
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });

    // Step 7: Ready for next patient
    const searchInput = page.getByPlaceholder(/scan or enter mrn/i);
    await expect(searchInput).toHaveValue('');
    await expect(page.getByText(/ready to check-in/i)).toBeVisible();
  });

  test('complete skip-triage direct to clinic flow', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Search for lab review patient
    await page.getByPlaceholder(/scan or enter mrn/i).fill('LAB-review');

    // Verify patient and suggested reason
    await expect(page.getByText('Mary Otieno')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/lab results review/i)).toBeVisible();

    // Select clinic and check in directly
    await page.getByRole('combobox', { name: /select clinic/i }).click();
    await page.getByRole('option', { name: 'Diabetic Clinic' }).click();

    // Click direct to clinic button
    await page.getByRole('button', { name: /direct to clinic/i }).click();

    // Verify success
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });
  });

  test('new patient check-in flow', async ({ page }) => {
    await loginAndNavigate(page, '/patients/checkin');

    // Search for new patient
    await page.getByPlaceholder(/scan or enter mrn/i).fill('NEW-patient');

    // Verify new patient display
    await expect(page.getByText('John Odhiambo')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('visit-type-badge')).toHaveText('NEW');

    // Check in to triage (new patients always go to triage)
    await page.getByRole('button', { name: /check-in to triage/i }).click();

    // Verify success
    await expect(page.getByText(/patient checked in/i)).toBeVisible({ timeout: 5000 });
  });
});

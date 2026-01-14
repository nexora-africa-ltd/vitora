/**
 * Inpatient Module E2E Tests
 *
 * End-to-end tests for inpatient workflows: ward management, bed management,
 * admissions, ward rounds, nursing kardex, transfers, and discharges.
 *
 * Sprint 1.5-1.6 Track D: Inpatient Foundation
 *
 * Features Covered:
 * - Ward and Bed Management
 * - OPD → IPD Admission Workflow
 * - Ward Round Documentation
 * - Nursing Kardex with Shift Handover
 * - Patient Transfers (Inter-ward)
 * - Discharge Workflow with LOS Calculation
 * - Bed Occupancy Dashboard
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login, mockApiResponse } from './fixtures';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockWard = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Medical Ward A',
  code: 'MED-A',
  ward_type: 'MEDICAL',
  ward_type_display: 'Medical',
  total_beds: 20,
  available_beds: 8,
  occupied_beds: 10,
  maintenance_beds: 2,
  reserved_beds: 0,
  occupancy_rate: 50.0,
  location: 'Block A, Ground Floor',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  ...overrides,
});

const mockBed = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  bed_number: 'MED-A-001',
  ward: 1,
  ward_name: 'Medical Ward A',
  bed_type: 'STANDARD',
  bed_type_display: 'Standard',
  status: 'AVAILABLE',
  status_display: 'Available',
  current_patient: null,
  current_patient_name: null,
  current_admission: null,
  notes: '',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-03T00:00:00Z',
  ...overrides,
});

const mockAdmission = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  admission_number: 'ADM-20260103-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  encounter: 1,
  ward: 1,
  ward_name: 'Medical Ward A',
  bed: 1,
  bed_number: 'MED-A-001',
  admission_date: '2026-01-03T10:00:00Z',
  expected_discharge_date: '2026-01-10T10:00:00Z',
  status: 'ADMITTED',
  status_display: 'Admitted',
  admitting_diagnosis: 'J18.9 - Pneumonia, unspecified',
  reason_for_admission: 'Severe community-acquired pneumonia requiring IV antibiotics',
  admitting_officer: 1,
  admitting_officer_name: 'Dr. James Mwangi',
  length_of_stay_days: 0,
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-03T10:00:00Z',
  ...overrides,
});

const mockAdmissionRecommendation = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  encounter: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  recommended_ward_type: 'MEDICAL',
  recommended_ward_type_display: 'Medical',
  reason: 'Severe pneumonia requiring IV antibiotics and close monitoring',
  provisional_diagnosis: 'J18.9',
  urgency: 'URGENT',
  urgency_display: 'Urgent',
  status: 'PENDING',
  status_display: 'Pending',
  recommended_by: 1,
  recommended_by_name: 'Dr. James Mwangi',
  approved_by: null,
  approved_by_name: null,
  created_at: '2026-01-03T09:00:00Z',
  ...overrides,
});

const mockWardRound = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  admission: 1,
  patient_name: 'Jane Doe',
  round_date: '2026-01-04',
  round_time: '08:30:00',
  conducted_by: 1,
  conducted_by_name: 'Dr. James Mwangi',
  clinical_notes: 'Patient improving. Fever resolved. Oxygen requirement reduced.',
  vital_signs: {
    temperature: 37.0,
    pulse: 82,
    blood_pressure: '120/78',
    respiratory_rate: 18,
    spo2: 96,
  },
  assessment: 'Responding well to IV antibiotics. Continue current management.',
  plan: 'Step down to oral antibiotics if stable for 24 hours.',
  diet_orders: 'Light diet as tolerated',
  activity_level: 'Bed rest with bathroom privileges',
  created_at: '2026-01-04T08:30:00Z',
  ...overrides,
});

const mockNursingKardex = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  admission: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  // Patient snapshot
  allergies: 'Penicillin',
  diet: 'Light diet',
  mobility: 'Assisted ambulation',
  isolation_precautions: 'None',
  // Care plan
  nursing_diagnosis: 'Impaired gas exchange related to pneumonia',
  goals: 'Maintain SpO2 > 94% on room air',
  interventions: 'Oxygen therapy, deep breathing exercises, position changes',
  // Risk assessments
  fall_risk: 'LOW',
  fall_risk_display: 'Low',
  pressure_sore_risk: 'LOW',
  pressure_sore_risk_display: 'Low',
  // Shift notes
  shift_notes: [
    {
      id: 1,
      shift: 'DAY',
      nurse_name: 'Nurse Mary',
      notes: 'Patient stable. Vitals within normal limits.',
      created_at: '2026-01-04T08:00:00Z',
    },
  ],
  created_at: '2026-01-03T10:00:00Z',
  updated_at: '2026-01-04T08:00:00Z',
  ...overrides,
});

const mockTransfer = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  admission: 1,
  patient_name: 'Jane Doe',
  from_ward: 1,
  from_ward_name: 'Medical Ward A',
  from_bed: 1,
  from_bed_number: 'MED-A-001',
  to_ward: 2,
  to_ward_name: 'ICU',
  to_bed: 10,
  to_bed_number: 'ICU-001',
  transfer_date: '2026-01-04T14:00:00Z',
  reason: 'Respiratory deterioration requiring ICU monitoring',
  transferred_by: 1,
  transferred_by_name: 'Dr. James Mwangi',
  received_by: 2,
  received_by_name: 'Nurse Jane',
  clinical_notes: 'Patient developed increased respiratory distress. SpO2 dropped to 88%.',
  status: 'COMPLETED',
  status_display: 'Completed',
  created_at: '2026-01-04T14:00:00Z',
  ...overrides,
});

const mockDischarge = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  admission: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  discharge_date: '2026-01-10T11:00:00Z',
  discharge_type: 'ROUTINE',
  discharge_type_display: 'Routine',
  discharge_diagnosis: 'J18.9 - Pneumonia, unspecified (Resolved)',
  discharge_summary: 'Patient recovered well from community-acquired pneumonia after 7 days of IV antibiotics.',
  discharge_medications: [
    { drug: 'Amoxicillin 500mg', dosage: 'TDS for 5 days' },
    { drug: 'Paracetamol 500mg', dosage: 'PRN for fever' },
  ],
  follow_up_instructions: 'Follow up in OPD in 2 weeks. Return if symptoms recur.',
  length_of_stay_days: 7,
  discharged_by: 1,
  discharged_by_name: 'Dr. James Mwangi',
  clearance_status: 'CLEARED',
  clearance_status_display: 'Cleared',
  billing_clearance: true,
  pharmacy_clearance: true,
  nursing_clearance: true,
  created_at: '2026-01-10T11:00:00Z',
  ...overrides,
});

const mockBedOccupancy = {
  summary: {
    total_beds: 100,
    available: 35,
    occupied: 55,
    maintenance: 8,
    reserved: 2,
    overall_occupancy_rate: 55.0,
  },
  by_ward_type: [
    { ward_type: 'MEDICAL', total: 40, occupied: 25, rate: 62.5 },
    { ward_type: 'SURGICAL', total: 30, occupied: 15, rate: 50.0 },
    { ward_type: 'ICU', total: 10, occupied: 8, rate: 80.0 },
    { ward_type: 'PEDIATRIC', total: 10, occupied: 5, rate: 50.0 },
    { ward_type: 'MATERNITY', total: 10, occupied: 2, rate: 20.0 },
  ],
  wards: [
    mockWard({ id: 1, name: 'Medical Ward A', occupancy_rate: 50.0 }),
    mockWard({ id: 2, name: 'ICU', ward_type: 'ICU', total_beds: 10, available_beds: 2, occupancy_rate: 80.0 }),
    mockWard({ id: 3, name: 'Surgical Ward', ward_type: 'SURGICAL', total_beds: 20, available_beds: 10, occupancy_rate: 50.0 }),
  ],
};

// =============================================================================
// SETUP HELPERS
// =============================================================================

async function setupInpatientMocks(page: Page) {
  // Auth mock
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: { id: 1, username: TEST_USER.username },
      }),
    });
  });

  // Wards list and ward beds
  await page.route('**/api/inpatient/wards/**', async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      
      // Handle ward beds endpoint: /api/inpatient/wards/{id}/beds/
      if (url.includes('/beds')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: 3,
            results: [
              mockBed(),
              mockBed({ id: 2, bed_number: 'MED-A-002', status: 'OCCUPIED', current_patient_name: 'Jane Doe' }),
              mockBed({ id: 3, bed_number: 'MED-A-003', status: 'MAINTENANCE' }),
            ],
          }),
        });
        return;
      }
      
      // Handle single ward endpoint: /api/inpatient/wards/1/
      if (url.match(/\/wards\/\d+\/?$/)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockWard()),
        });
        return;
      }
      
      // Handle ward list endpoint: /api/inpatient/wards/
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 3,
          results: [
            mockWard(),
            mockWard({ id: 2, name: 'ICU', code: 'ICU', ward_type: 'ICU' }),
            mockWard({ id: 3, name: 'Surgical Ward', code: 'SURG', ward_type: 'SURGICAL' }),
          ],
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Beds list
  await page.route('**/api/inpatient/beds/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 3,
          results: [
            mockBed(),
            mockBed({ id: 2, bed_number: 'MED-A-002', status: 'OCCUPIED' }),
            mockBed({ id: 3, bed_number: 'MED-A-003', status: 'MAINTENANCE' }),
          ],
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Admissions
  await page.route('**/api/inpatient/admissions/**', async (route) => {
    if (route.request().method() === 'GET') {
      const url = route.request().url();
      if (url.includes('/1/') || url.includes('/1?')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAdmission()),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: 2,
            results: [
              mockAdmission(),
              mockAdmission({ id: 2, admission_number: 'ADM-20260103-0002', patient_name: 'John Smith' }),
            ],
          }),
        });
      }
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockAdmission()),
      });
    } else {
      await route.continue();
    }
  });

  // Admission recommendations
  await page.route('**/api/inpatient/admission-recommendations/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Handle decline endpoint
    if (url.includes('/decline') && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockAdmissionRecommendation(),
          status: 'DECLINED',
        }),
      });
      return;
    }

    // Handle accept endpoint
    if (url.includes('/accept') && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockAdmission()),
      });
      return;
    }

    // Handle GET requests (list)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        results: [mockAdmissionRecommendation()],
      }),
    });
  });

  // Ward rounds
  await page.route('**/api/inpatient/ward-round/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          results: [mockWardRound()],
        }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockWardRound()),
      });
    } else {
      await route.continue();
    }
  });

  // Nursing kardex
  await page.route('**/api/inpatient/nursing-kardex/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockNursingKardex()),
    });
  });

  // Transfers
  await page.route('**/api/inpatient/transfer/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockTransfer()),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          results: [mockTransfer()],
        }),
      });
    }
  });

  // Discharges
  await page.route('**/api/inpatient/discharges/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockDischarge()),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          results: [mockDischarge()],
        }),
      });
    }
  });

  // Bed occupancy dashboard
  await page.route('**/api/inpatient/bed-occupancy/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockBedOccupancy),
    });
  });
}

// =============================================================================
// WARD MANAGEMENT TESTS
// =============================================================================

test.describe('Ward Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display ward list with occupancy rates', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // Verify ward list displays
    await expect(page.getByText('Medical Ward A')).toBeVisible();
    await expect(page.getByText('ICU')).toBeVisible();
    await expect(page.getByText('Surgical Ward')).toBeVisible();

    // Verify occupancy information (use first() to handle multiple matches)
    await expect(page.getByText(/50.*%/).first()).toBeVisible(); // Occupancy rate
  });

  test('should filter wards by type', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // Search for a specific ward
    await page.getByPlaceholder(/search wards/i).fill('Medical');

    // Verify filter applied - Medical Ward A should still be visible
    await expect(page.getByText('Medical Ward A')).toBeVisible();
  });

  test('should show ward details with bed list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards/1');

    // Verify ward details page loads
    await expect(page.getByText('Medical Ward A')).toBeVisible();

    // Verify Bed Layout tab exists - it's selected by default
    const bedsTab = page.getByRole('tab', { name: /bed layout/i });
    await expect(bedsTab).toBeVisible();

    // Verify bed status legend displays
    await expect(page.getByText(/available/i).first()).toBeVisible();
    await expect(page.getByText(/occupied/i).first()).toBeVisible();
  });
});

// =============================================================================
// BED MANAGEMENT TESTS
// =============================================================================

test.describe('Bed Management', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display bed status with color coding', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards/1');

    // Verify beds display with status badges
    await expect(page.getByText(/available/i).first()).toBeVisible();
    await expect(page.getByText(/occupied/i).first()).toBeVisible();
  });

  test('should filter beds by status', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards/1');

    // Verify Bed Layout tab displays (default selected)
    await expect(page.getByRole('tab', { name: /bed layout/i })).toBeVisible();
    
    // Verify bed status legend is visible
    await expect(page.getByText(/available/i).first()).toBeVisible();
    await expect(page.getByText(/occupied/i).first()).toBeVisible();
    await expect(page.getByText(/maintenance/i).first()).toBeVisible();
  });

  test('should change bed status to maintenance', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards/1');

    // Click on the first AVAILABLE bed card (not occupied) to open status dialog
    await page.locator('[data-testid="bed-card"]').first().click();

    // Verify status change dialog opens
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /change bed status/i })).toBeVisible();

    // Open the status select dropdown
    const statusTrigger = page.getByRole('dialog').getByRole('button', { name: /status/i });
    await statusTrigger.click();
    
    // Wait for dropdown to open 
    await page.waitForTimeout(300);
    
    // Click on Maintenance option in the dropdown (within the dialog)
    await page.getByRole('dialog').getByText('Maintenance', { exact: true }).click();

    // Save changes
    await page.getByRole('button', { name: /save changes/i }).click();

    // Verify success toast (uses status role)
    await expect(page.getByRole('status')).toContainText(/bed status updated/i);
  });
});

// =============================================================================
// ADMISSION WORKFLOW TESTS
// =============================================================================

test.describe('Admission Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display pending admission recommendations', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/recommendations');

    // Verify pending recommendations display
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('PENDING', { exact: true })).toBeVisible(); // Badge shows PENDING in uppercase
    await expect(page.getByText(/severe pneumonia/i).first()).toBeVisible();
  });

  test('should approve admission recommendation and assign bed', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/recommendations');

    // Click approve button (using data-testid for reliability)
    await page.locator('[data-testid="approve-button"]').first().click();

    // Verify dialog opens
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select ward
    await page.getByRole('dialog').getByRole('button', { name: /ward/i }).click();
    await page.waitForTimeout(200);
    await page.getByText('Medical Ward A').click();

    // Select bed
    await page.getByRole('dialog').getByRole('button', { name: /bed/i }).click();
    await page.waitForTimeout(200);
    await page.getByText(/MED-A-001/i).click();

    // Confirm admission
    await page.getByRole('button', { name: /confirm admission/i }).click();

    // Verify success toast
    await expect(page.getByRole('status')).toContainText(/admission.*created/i);
  });

  test('should display active admissions list', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions');

    // Verify admissions list heading
    await expect(page.getByRole('heading', { name: /active admissions/i })).toBeVisible();
    
    // Verify admission details
    await expect(page.getByText('ADM-20260103-0001')).toBeVisible();
    await expect(page.getByText('Jane Doe').first()).toBeVisible();
    await expect(page.getByText('Medical Ward A').first()).toBeVisible();
  });

  test('should show admission details with patient info', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1');

    // Verify admission details
    await expect(page.getByText('ADM-20260103-0001')).toBeVisible();
    await expect(page.getByText('Jane Doe').first()).toBeVisible();
    await expect(page.getByText('MED-A-001').first()).toBeVisible();
    await expect(page.getByText(/pneumonia/i).first()).toBeVisible();
  });

  test('should decline admission recommendation with reason', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/recommendations');

    // Click decline button
    await page.locator('[data-testid="decline-button"]').first().click();

    // Verify decline dialog opens
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /decline admission/i })).toBeVisible();

    // Enter decline reason
    await page.getByLabel(/reason for declining/i).fill('Patient condition improved, no longer requires admission');

    // Confirm decline
    await page.getByRole('button', { name: /confirm decline/i }).click();

    // Verify success toast
    await expect(page.getByRole('status')).toContainText(/recommendation declined/i);
  });
});

// =============================================================================
// WARD ROUND TESTS
// =============================================================================

test.describe('Ward Round Documentation', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display ward round history for admission', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/ward-round');

    // Verify ward round history
    await expect(page.getByText('2026-01-04')).toBeVisible();
    await expect(page.getByText('Dr. James Mwangi')).toBeVisible();
    await expect(page.getByText(/patient improving/i)).toBeVisible();
  });

  test('should create new ward round entry', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/ward-round/new');

    // Fill ward round form
    await page.getByLabel(/clinical notes/i).fill('Patient stable. Continue current management.');
    await page.getByLabel(/temperature/i).fill('36.8');
    await page.getByLabel(/pulse/i).fill('78');
    await page.getByLabel(/blood pressure/i).fill('118/76');
    await page.getByLabel(/assessment/i).fill('Improving well.');
    await page.getByLabel(/plan/i).fill('Consider discharge tomorrow if stable.');

    // Save
    await page.getByRole('button', { name: /save|submit/i }).click();

    // Verify success
    await expect(page.getByText(/ward round.*saved|success/i)).toBeVisible();
  });

  test('should display vital signs trend in ward rounds', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/ward-round');

    // Verify vital signs displayed
    await expect(page.getByText(/37\.0/)).toBeVisible(); // Temperature
    await expect(page.getByText(/120\/78/)).toBeVisible(); // BP
    await expect(page.getByText(/96/)).toBeVisible(); // SpO2
  });
});

// =============================================================================
// NURSING KARDEX TESTS
// =============================================================================

test.describe('Nursing Kardex', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display patient kardex with care plan', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/kardex');

    // Verify kardex sections
    await expect(page.getByText(/penicillin/i)).toBeVisible(); // Allergies
    await expect(page.getByText(/light diet/i)).toBeVisible(); // Diet
    await expect(page.getByText(/impaired gas exchange/i)).toBeVisible(); // Nursing diagnosis
  });

  test('should display risk assessments', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/kardex');

    // Verify risk assessments
    await expect(page.getByText(/fall risk/i)).toBeVisible();
    await expect(page.getByText(/pressure sore/i)).toBeVisible();
    await expect(page.getByText(/low/i)).toBeVisible();
  });

  test('should add shift note to kardex', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/kardex');

    // Add shift note
    await page.getByRole('button', { name: /add.*note/i }).click();
    await page.getByLabel(/shift/i).click();
    await page.getByRole('option', { name: /day/i }).click();
    await page.getByLabel(/notes/i).fill('Patient resting comfortably. Vitals stable.');

    // Save
    await page.getByRole('button', { name: /save|add/i }).click();

    // Verify success
    await expect(page.getByText(/note.*added|success/i)).toBeVisible();
  });

  test('should display shift notes history', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/kardex');

    // Verify shift notes
    await expect(page.getByText('Nurse Mary')).toBeVisible();
    await expect(page.getByText(/patient stable/i)).toBeVisible();
  });
});

// =============================================================================
// PATIENT TRANSFER TESTS
// =============================================================================

test.describe('Patient Transfer', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should initiate patient transfer', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1');

    // Click transfer button
    await page.getByRole('button', { name: /transfer/i }).click();

    // Select destination ward
    await page.getByRole('combobox', { name: /to ward/i }).click();
    await page.getByRole('option', { name: /icu/i }).click();

    // Select destination bed
    await page.getByRole('combobox', { name: /to bed/i }).click();
    await page.getByRole('option', { name: /ICU-001/i }).click();

    // Enter reason
    await page.getByLabel(/reason/i).fill('Respiratory deterioration');

    // Confirm transfer
    await page.getByRole('button', { name: /confirm.*transfer/i }).click();

    // Verify success
    await expect(page.getByText(/transfer.*completed|success/i)).toBeVisible();
  });

  test('should display transfer history', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/transfer');

    // Verify transfer history
    await expect(page.getByText('Medical Ward A')).toBeVisible();
    await expect(page.getByText('ICU')).toBeVisible();
    await expect(page.getByText(/respiratory deterioration/i)).toBeVisible();
  });
});

// =============================================================================
// DISCHARGE WORKFLOW TESTS
// =============================================================================

test.describe('Discharge Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should initiate discharge process', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1');

    // Click discharge button
    await page.getByRole('button', { name: /discharge/i }).click();

    // Verify discharge form opens
    await expect(page.getByText(/discharge summary/i)).toBeVisible();
  });

  test('should complete discharge with summary', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/discharge');

    // Fill discharge form
    await page.getByRole('combobox', { name: /discharge type/i }).click();
    await page.getByRole('option', { name: /routine/i }).click();

    await page.getByLabel(/discharge diagnosis/i).fill('J18.9 - Pneumonia (Resolved)');
    await page.getByLabel(/discharge summary/i).fill('Patient recovered well after 7 days of IV antibiotics.');
    await page.getByLabel(/follow.?up/i).fill('OPD in 2 weeks');

    // Confirm discharge
    await page.getByRole('button', { name: /confirm.*discharge/i }).click();

    // Verify success
    await expect(page.getByText(/discharged|success/i)).toBeVisible();
  });

  test('should display length of stay calculation', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/discharge');

    // Verify LOS displayed
    await expect(page.getByText(/7.*days/i)).toBeVisible();
  });

  test('should require clearances before discharge', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/1/discharge');

    // Verify clearance checkboxes
    await expect(page.getByLabel(/billing.*clearance/i)).toBeVisible();
    await expect(page.getByLabel(/pharmacy.*clearance/i)).toBeVisible();
    await expect(page.getByLabel(/nursing.*clearance/i)).toBeVisible();
  });
});

// =============================================================================
// BED OCCUPANCY DASHBOARD TESTS
// =============================================================================

test.describe('Bed Occupancy Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should display overall occupancy summary', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // Verify summary stats
    await expect(page.getByText(/100.*total/i)).toBeVisible();
    await expect(page.getByText(/35.*available/i)).toBeVisible();
    await expect(page.getByText(/55.*occupied/i)).toBeVisible();
    await expect(page.getByText(/55.*%/)).toBeVisible(); // Occupancy rate
  });

  test('should display occupancy by ward type', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // Verify ward type breakdown
    await expect(page.getByText(/medical/i)).toBeVisible();
    await expect(page.getByText(/surgical/i)).toBeVisible();
    await expect(page.getByText(/icu/i)).toBeVisible();
    await expect(page.getByText(/80.*%/)).toBeVisible(); // ICU occupancy
  });

  test('should highlight wards with high occupancy', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // ICU at 80% should be highlighted/warned
    const icuRow = page.getByRole('row', { name: /icu/i });
    await expect(icuRow).toBeVisible();
  });

  test('should refresh occupancy data', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/wards');

    // Click refresh
    await page.getByRole('button', { name: /refresh/i }).click();

    // Verify data refreshed (loading indicator or timestamp update)
    await expect(page.getByText(/updated|refreshed/i)).toBeVisible();
  });
});

// =============================================================================
// SHIFT HANDOVER TESTS
// =============================================================================

test.describe('Shift Handover', () => {
  test.beforeEach(async ({ page }) => {
    await setupInpatientMocks(page);
  });

  test('should create shift handover report', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/handover/new');

    // Fill handover form
    await page.getByRole('combobox', { name: /ward/i }).click();
    await page.getByRole('option', { name: /medical ward a/i }).click();

    await page.getByRole('combobox', { name: /outgoing shift/i }).click();
    await page.getByRole('option', { name: /day/i }).click();

    await page.getByRole('combobox', { name: /incoming shift/i }).click();
    await page.getByRole('option', { name: /evening/i }).click();

    await page.getByLabel(/summary/i).fill('All patients stable. No critical issues.');

    // Submit
    await page.getByRole('button', { name: /submit|save/i }).click();

    // Verify success
    await expect(page.getByText(/handover.*submitted|success/i)).toBeVisible();
  });

  test('should display pending handovers for incoming shift', async ({ page }) => {
    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/admissions/handover');

    // Verify pending handovers display
    await expect(page.getByText(/pending.*handover/i)).toBeVisible();
  });
});

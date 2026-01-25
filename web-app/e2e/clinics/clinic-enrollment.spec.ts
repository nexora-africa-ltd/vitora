/**
 * Chronic Care Enrollment E2E Tests
 *
 * Matches "5.1 Test Scenarios" (clinic-enrollment.spec.ts):
 * - can enroll patient in CCC
 * - can enroll patient in ANC
 * - can view overdue patients
 * - can view defaulters list
 * - can record visit for enrolled patient
 */

import { test, expect, Page } from '@playwright/test';
import { TEST_USER } from '../fixtures';

type AnyRecord = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

const clinics = [
  {
    id: 10,
    name: 'CCC Clinic',
    clinic_type: 'CCC',
    clinic_type_display: 'Comprehensive Care Clinic',
    code: 'CCC-001',
    status: 'ACTIVE',
    status_display: 'Active',
    location: 'Block A',
    is_open_today: true,
  },
  {
    id: 20,
    name: 'MCH / Welfare',
    clinic_type: 'MCH',
    clinic_type_display: 'MCH / Welfare',
    code: 'MCH-001',
    status: 'ACTIVE',
    status_display: 'Active',
    location: 'Block B',
    is_open_today: true,
  },
];

function clinicDetail(id: number) {
  const base = clinics.find((c) => c.id === id);
  if (!base) return null;
  return {
    ...base,
    description: `${base.name} services`,
    max_daily_patients: 200,
    triage_required: false,
    eligibility_rules: null,
    default_service_fee: null,
    sha_service_code: 'SVC-001',
    dhis2_org_unit_id: 'OU-001',
    moh_code: base.code,
    default_clinical_template: null,
    is_sensitive: false,
    required_permission: 'clinics.view_clinic',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

const mockPatients = [
  {
    id: 11,
    mrn: 'MRN-20260125-0011',
    first_name: 'Jane',
    last_name: 'Wanjiku',
    age: 40,
    gender: 'F',
    phone_number: '+254700000011',
  },
  {
    id: 12,
    mrn: 'MRN-20260125-0012',
    first_name: 'Mary',
    last_name: 'Otieno',
    age: 32,
    gender: 'F',
    phone_number: '+254700000012',
  },
];

function makeEnrollment(overrides: AnyRecord = {}) {
  return {
    id: 900,
    clinic: 10,
    clinic_name: 'CCC Clinic',
    patient: 11,
    patient_mrn: 'MRN-20260125-0011',
    patient_name: 'Jane Wanjiku',
    enrollment_number: 'ENR-20260125-0001',
    enrollment_date: new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
    status_display: 'Active',
    program_data: {},
    next_appointment_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    last_visit_date: null,
    visit_count: 0,
    notes: '',
    enrolled_by: 1,
    enrolled_by_name: 'Test User',
    created_at: nowIso(),
    updated_at: nowIso(),
    ...overrides,
  };
}

async function setupMocks(page: Page) {
  let enrollmentsState = [makeEnrollment()];

  // Auth
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

  // Clinics list
  await page.route(/.*\/api\/clinics\/(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: clinics.length, next: null, previous: null, results: clinics }),
    });
  });

  // Clinic detail
  await page.route(/.*\/api\/clinics\/(\d+)\/$/, async (route) => {
    const match = route.request().url().match(/\/api\/clinics\/(\d+)\/$/);
    const id = match ? Number(match[1]) : NaN;
    const detail = clinicDetail(id);
    if (!detail) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) });
  });

  // Patients list (search)
  await page.route(/.*\/api\/patients\/(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const search = (url.searchParams.get('search') ?? '').toLowerCase();

    const results = mockPatients
      .filter((p) =>
        !search
          ? true
          : p.first_name.toLowerCase().includes(search) ||
            p.last_name.toLowerCase().includes(search) ||
            p.mrn.toLowerCase().includes(search)
      )
      .map((p) => ({
        id: p.id,
        mrn: p.mrn,
        first_name: p.first_name,
        last_name: p.last_name,
        age: p.age,
        gender: p.gender,
        phone_number: p.phone_number,
      }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: results.length, next: null, previous: null, results }),
    });
  });

  // Enrollments list/create
  await page.route(/.*\/api\/clinic-enrollments\/(\?.*)?$/, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: enrollmentsState.length, next: null, previous: null, results: enrollmentsState }),
      });
      return;
    }

    if (method === 'POST') {
      const body = (await route.request().postDataJSON()) as AnyRecord;
      const clinicId = Number(body.clinic_id);
      const patientId = Number(body.patient_id);

      const clinic = clinics.find((c) => c.id === clinicId);
      const patient = mockPatients.find((p) => p.id === patientId);

      if (!clinic || !patient) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid clinic_id or patient_id' }) });
        return;
      }

      const newId = Math.max(...enrollmentsState.map((e) => Number(e.id))) + 1;
      const enrollment = makeEnrollment({
        id: newId,
        clinic: clinic.id,
        clinic_name: clinic.name,
        patient: patient.id,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        patient_mrn: patient.mrn,
        enrollment_number: `ENR-20260125-${String(newId).padStart(4, '0')}`,
        next_appointment_date: (body.next_appointment_date as string) || null,
        notes: (body.notes as string) || '',
      });

      enrollmentsState = [enrollment, ...enrollmentsState];

      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(enrollment) });
      return;
    }

    await route.fulfill({ status: 405 });
  });

  // Enrollment detail
  await page.route(/.*\/api\/clinic-enrollments\/(\d+)\/$/, async (route) => {
    const match = route.request().url().match(/\/api\/clinic-enrollments\/(\d+)\/$/);
    const id = match ? Number(match[1]) : NaN;
    const enrollment = enrollmentsState.find((e) => Number(e.id) === id);

    if (!enrollment) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(enrollment) });
  });

  // Overdue
  await page.route(/.*\/api\/clinic-enrollments\/overdue\/(\?.*)?$/, async (route) => {
    const overdue = enrollmentsState.map((e, idx) => ({
      ...e,
      id: 700 + idx,
      next_appointment_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      last_visit_date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: overdue.length, next: null, previous: null, results: overdue }),
    });
  });

  // Defaulters
  await page.route(/.*\/api\/clinic-enrollments\/defaulters\/(\?.*)?$/, async (route) => {
    const defaulters = enrollmentsState.map((e, idx) => ({
      ...e,
      id: 800 + idx,
      status: 'LOST_TO_FOLLOW_UP',
      status_display: 'Lost to Follow-up',
      visit_count: 3,
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: defaulters.length, next: null, previous: null, results: defaulters }),
    });
  });

  // Record visit (adds to queue)
  await page.route(/.*\/api\/clinics\/\d+\/queue\/(\?.*)?$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    const body = (await route.request().postDataJSON()) as AnyRecord;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 555, patient_id: body.patient_id }),
    });
  });

  // Queue page dependencies after recording visit
  await page.route(/.*\/api\/clinics\/\d+\/sessions\/today\/$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'OPEN', status_display: 'Open' }) });
  });

  await page.route(/.*\/api\/clinics\/\d+\/queue\/stats\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_registered: 1,
        waiting: 1,
        called: 0,
        in_consultation: 0,
        completed: 0,
        referred: 0,
        no_show: 0,
        cancelled: 0,
        avg_wait_time_minutes: 0,
        by_priority: { EMERGENCY: 0, URGENT: 0, PRIORITY: 0, STANDARD: 1, NON_URGENT: 0 },
      }),
    });
  });

  await page.route(/.*\/api\/clinics\/\d+\/queue\/(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      // Return a queue containing the enrollment patient
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 777,
            session: 1,
            patient: {
              id: 11,
              mrn: 'MRN-20260125-0011',
              first_name: 'Jane',
              last_name: 'Wanjiku',
              full_name: 'Jane Wanjiku',
              date_of_birth: '1985-05-20',
              age: 40,
              gender: 'F',
              phone_number: '+254700000011',
            },
            queue_number: 1,
            status: 'WAITING',
            status_display: 'Waiting',
            priority: 'STANDARD',
            priority_display: 'Standard',
            visit_type: 'FOLLOW_UP',
            visit_type_display: 'Follow-up',
            source: 'APPOINTMENT',
            source_display: 'Appointment',
            chief_complaint: 'Follow-up visit',
            notes: '',
            registered_at: nowIso(),
            called_at: null,
            consultation_started_at: null,
            completed_at: null,
            wait_time_minutes: 0,
            encounter: null,
            triage_assessment: null,
            assigned_clinician: null,
            assigned_clinician_name: null,
            referred_from: null,
            referred_to_clinic: null,
            referral_reason: '',
            registered_by: 1,
            registered_by_name: 'Test User',
            created_at: nowIso(),
            updated_at: nowIso(),
          },
        ]),
      });
      return;
    }

    // POST already handled above
    await route.fallback();
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(TEST_USER.username);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await page.waitForURL(/.*dashboard.*/, { timeout: 15000 });
}

test.describe('Chronic Care Enrollment', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await login(page);
  });

  test('can enroll patient in CCC', async ({ page }) => {
    await page.goto('/clinics/enrollments/new?clinic=10');

    await expect(page.getByRole('heading', { name: /New Enrollment/i })).toBeVisible();

    // Clinic should be selectable
    await page.getByRole('button', { name: 'Clinic', exact: true }).click();
    await page.getByRole('option', { name: /CCC Clinic/i }).click();

    // Select patient via search
    await page.getByPlaceholder(/Search by name or MRN/i).fill('Jane');
    await expect(page.getByRole('button', { name: /Jane Wanjiku/i })).toBeVisible();
    await page.getByRole('button', { name: /Jane Wanjiku/i }).click();

    await page.getByRole('button', { name: /Create Enrollment/i }).click();

    await expect(page.getByRole('heading', { name: /Clinic Enrollments/i })).toBeVisible();
    await expect(page.locator('table').getByText('Jane Wanjiku').first()).toBeVisible();
  });

  test('can enroll patient in ANC', async ({ page }) => {
    await page.goto('/clinics/enrollments/new?clinic=20');

    await page.getByRole('button', { name: 'Clinic', exact: true }).click();
    await page.getByRole('option', { name: 'MCH / Welfare', exact: true }).click();

    await page.getByPlaceholder(/Search by name or MRN/i).fill('Mary');
    await expect(page.getByRole('button', { name: /Mary Otieno/i })).toBeVisible();
    await page.getByRole('button', { name: /Mary Otieno/i }).click();

    await page.getByRole('button', { name: /Create Enrollment/i }).click();

    await expect(page.getByRole('heading', { name: /Clinic Enrollments/i })).toBeVisible();
    await expect(page.getByText(/Mary Otieno/i)).toBeVisible();
  });

  test('can view overdue patients', async ({ page }) => {
    await page.goto('/clinics/enrollments/overdue');

    await expect(page.getByRole('heading', { name: /Overdue Appointments/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Days Overdue' })).toBeVisible();
  });

  test('can view defaulters list', async ({ page }) => {
    await page.goto('/clinics/enrollments/defaulters');

    await expect(page.getByRole('heading', { name: /Defaulters/i })).toBeVisible();
    await expect(page.getByText(/Patients Lost to Follow-up/i)).toBeVisible();
  });

  test('can record visit for enrolled patient', async ({ page }) => {
    await page.goto('/clinics/enrollments/900');

    await expect(page.getByRole('heading', { name: /Enrollment Detail/i })).toBeVisible();

    await page.getByRole('button', { name: /Record Visit/i }).click();

    // Should land on the clinic queue with the patient visible
    await expect(page).toHaveURL(/\/clinics\/\d+\/queue/);
    await expect(page.getByRole('cell', { name: /Jane Wanjiku/i })).toBeVisible();
  });
});

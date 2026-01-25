/**
 * Clinics Module E2E Tests
 *
 * Covers key Clinics flows from docs/clinics-module-implementation-plan.md:
 * - Clinics overview/list
 * - Open today's session
 * - Add patient to clinic queue
 * - Call/start/complete consultation
 * - Refer patient to another clinic
 */

import { test, expect, Page } from '@playwright/test';
import { TEST_USER } from './fixtures';

// =============================================================================
// Mock Data
// =============================================================================

type AnyRecord = Record<string, unknown>;

const nowIso = () => new Date().toISOString();

const mockClinicList = [
  {
    id: 1,
    name: 'Eye Clinic',
    clinic_type: 'EYE',
    clinic_type_display: 'Eye Clinic',
    code: 'EYE-001',
    status: 'ACTIVE',
    status_display: 'Active',
    location: 'Main Block - Room 2',
    is_open_today: false,
  },
  {
    id: 2,
    name: 'Dental Clinic',
    clinic_type: 'DENTAL',
    clinic_type_display: 'Dental Clinic',
    code: 'DEN-001',
    status: 'ACTIVE',
    status_display: 'Active',
    location: 'Main Block - Room 3',
    is_open_today: true,
  },
];

function mockClinicDetail(id: number) {
  const base = mockClinicList.find((c) => c.id === id);
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
    full_name: 'Jane Wanjiku',
    date_of_birth: '1985-05-20',
    age: 40,
    gender: 'F',
    phone_number: '+254700000011',
  },
  {
    id: 12,
    mrn: 'MRN-20260125-0012',
    first_name: 'John',
    last_name: 'Kamau',
    full_name: 'John Kamau',
    date_of_birth: '1990-03-15',
    age: 35,
    gender: 'M',
    phone_number: '+254700000012',
  },
];

function makeVisit(overrides: AnyRecord = {}) {
  return {
    id: 101,
    session: 201,
    patient: {
      id: 12,
      mrn: 'MRN-20260125-0012',
      first_name: 'John',
      last_name: 'Kamau',
      full_name: 'John Kamau',
      date_of_birth: '1990-03-15',
      age: 35,
      gender: 'M',
      phone_number: '+254700000012',
    },
    queue_number: 1,
    status: 'WAITING',
    status_display: 'Waiting',
    priority: 'STANDARD',
    priority_display: 'Standard',
    visit_type: 'NEW',
    visit_type_display: 'New',
    source: 'DIRECT',
    source_display: 'Direct',
    chief_complaint: 'Blurred vision',
    notes: '',
    registered_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    called_at: null,
    consultation_started_at: null,
    completed_at: null,
    wait_time_minutes: 10,
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
    ...overrides,
  };
}

function closedSession(clinicId: number) {
  return {
    id: 201,
    clinic: clinicId,
    clinic_name: mockClinicList.find((c) => c.id === clinicId)?.name ?? 'Clinic',
    session_date: new Date().toISOString().slice(0, 10),
    status: 'CLOSED',
    status_display: 'Closed',
    opened_at: null,
    closed_at: null,
    opened_by: null,
    opened_by_name: null,
    closed_by: null,
    closed_by_name: null,
    patients_registered: 0,
    patients_seen: 0,
    patients_waiting: 0,
    notes: '',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

function openSession(clinicId: number) {
  const session = closedSession(clinicId);
  return {
    ...session,
    status: 'OPEN',
    status_display: 'Open',
    opened_at: nowIso(),
    opened_by: 1,
    opened_by_name: 'Test User',
  };
}

// =============================================================================
// Setup Helpers
// =============================================================================

async function setupMocks(page: Page) {
  // Mutable state per test
  let sessionState = closedSession(1);
  let queueState = [makeVisit()];

  const patientById = new Map(mockPatients.map((p) => [p.id, p]));

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
          permissions: ['clinics.view_clinic', 'clinics.manage_queue'],
        },
      }),
    });
  });

  // Clinics list
  await page.route(/.*\/api\/clinics\/(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const search = (url.searchParams.get('search') ?? '').toLowerCase();

    const results = mockClinicList.filter((c) =>
      !search ? true : c.name.toLowerCase().includes(search) || c.code.toLowerCase().includes(search)
    );

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: results.length, next: null, previous: null, results }),
    });
  });

  // Clinic detail
  await page.route(/.*\/api\/clinics\/(\d+)\/$/, async (route) => {
    const match = route.request().url().match(/\/api\/clinics\/(\d+)\/$/);
    const id = match ? Number(match[1]) : NaN;
    const clinic = mockClinicDetail(id);

    if (!clinic) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(clinic) });
  });

  // Today session (GET)
  await page.route(/.*\/api\/clinics\/\d+\/sessions\/today\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionState),
    });
  });

  // Open today's session (POST)
  await page.route(/.*\/api\/clinics\/\d+\/sessions\/today\/open\/$/, async (route) => {
    sessionState = openSession(1);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionState) });
  });

  // Close today's session (POST)
  await page.route(/.*\/api\/clinics\/\d+\/sessions\/today\/close\/$/, async (route) => {
    sessionState = closedSession(1);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionState) });
  });

  // Queue stats
  await page.route(/.*\/api\/clinics\/\d+\/queue\/stats\/$/, async (route) => {
    const waiting = queueState.filter((v) => v.status === 'WAITING' || v.status === 'CALLED').length;
    const inConsult = queueState.filter((v) => v.status === 'IN_CONSULTATION').length;
    const completed = queueState.filter((v) => v.status === 'COMPLETED').length;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        waiting_count: waiting,
        in_consultation_count: inConsult,
        completed_count: completed,
        avg_wait_time_minutes: waiting ? 12.4 : 0,
        longest_wait_minutes: waiting ? 25 : 0,
        by_priority: {
          EMERGENCY: 0,
          URGENT: 0,
          PRIORITY: 0,
          STANDARD: waiting,
          NON_URGENT: 0,
        },
      }),
    });
  });

  // Queue (GET/POST)
  await page.route(/.*\/api\/clinics\/\d+\/queue\/(\?.*)?$/, async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(queueState) });
      return;
    }

    if (method === 'POST') {
      const body = (await route.request().postDataJSON()) as AnyRecord;
      const patientId = Number(body.patient_id);
      const patient = patientById.get(patientId);

      if (!patient) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid patient_id' }) });
        return;
      }

      const newId = Math.max(...queueState.map((v) => Number(v.id))) + 1;
      const newQueueNumber = queueState.length + 1;
      const visit = makeVisit({
        id: newId,
        queue_number: newQueueNumber,
        patient,
        status: 'WAITING',
        status_display: 'Waiting',
        priority: body.priority ?? 'STANDARD',
        priority_display: 'Standard',
        visit_type: body.visit_type ?? 'NEW',
        visit_type_display: 'New',
        source: body.source ?? 'DIRECT',
        source_display: 'Direct',
        chief_complaint: (body.chief_complaint as string) ?? '',
        notes: (body.notes as string) ?? '',
        registered_at: nowIso(),
        wait_time_minutes: 0,
      });

      queueState = [...queueState, visit];

      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(visit) });
      return;
    }

    await route.fulfill({ status: 405 });
  });

  // Patients list for search in AddToQueueDialog
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

  // Visit actions: call/start/complete/refer
  await page.route(/.*\/api\/clinic-visits\/(\d+)\/(call|start|complete|refer)\/$/, async (route) => {
    const url = route.request().url();
    const match = url.match(/\/api\/clinic-visits\/(\d+)\/(call|start|complete|refer)\/$/);
    const visitId = match ? Number(match[1]) : NaN;
    const action = match ? match[2] : '';

    const visitIndex = queueState.findIndex((v) => Number(v.id) === visitId);
    if (visitIndex < 0) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
      return;
    }

    const current = queueState[visitIndex];

    if (action === 'call') {
      const updated = { ...current, status: 'CALLED', status_display: 'Called', called_at: nowIso() };
      queueState = queueState.map((v, i) => (i === visitIndex ? updated : v));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (action === 'start') {
      const updated = {
        ...current,
        status: 'IN_CONSULTATION',
        status_display: 'In Consultation',
        consultation_started_at: nowIso(),
        // Keep encounter null to avoid navigating to encounter page in E2E.
        encounter: null,
      };
      queueState = queueState.map((v, i) => (i === visitIndex ? updated : v));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (action === 'complete') {
      const updated = {
        ...current,
        status: 'COMPLETED',
        status_display: 'Completed',
        completed_at: nowIso(),
      };
      queueState = queueState.map((v, i) => (i === visitIndex ? updated : v));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
      return;
    }

    if (action === 'refer') {
      // Remove from current clinic queue after referral.
      queueState = queueState.filter((v) => Number(v.id) !== visitId);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...current, status: 'REFERRED', status_display: 'Referred' }) });
      return;
    }

    await route.fulfill({ status: 400 });
  });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(TEST_USER.username);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await page.waitForURL(/.*dashboard.*/, { timeout: 15000 });
}

// =============================================================================
// Tests
// =============================================================================

test.describe('Clinics Module', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await login(page);
  });

  test('shows clinics overview and navigates to clinic dashboard', async ({ page }) => {
    await page.goto('/clinics');

    await expect(page.getByRole('heading', { name: 'Clinics' })).toBeVisible();
    // There is also a sidebar link to /clinics/eye; target the clinic card link.
    const eyeClinicCardLink = page.locator('a[href="/clinics/1"]');
    await expect(eyeClinicCardLink).toBeVisible();

    await eyeClinicCardLink.click();

    await expect(page.getByRole('heading', { name: /Eye Clinic/i })).toBeVisible();
    await expect(page.getByText(/Session Not Open/i)).toBeVisible();
  });

  test('opens session and adds a patient to the queue', async ({ page }) => {
    await page.goto('/clinics/1');

    // Open today session
    await page.getByRole('button', { name: /^Open Session$/i }).first().click();
    await expect(page.getByRole('button', { name: /Close Session/i })).toBeVisible();

    // Add patient to queue
    await page.getByRole('button', { name: /^Add Patient$/i }).click();
    await expect(page.getByRole('heading', { name: /Add Patient to Queue/i })).toBeVisible();

    await page.getByPlaceholder(/Search by name, MRN, or phone/i).fill('Ja');
    await expect(page.getByText('Jane Wanjiku')).toBeVisible();
    await page.getByText('Jane Wanjiku').click();

    await page.getByRole('button', { name: /^Add to Queue$/i }).click();

    // Queue should contain the newly added patient
    await expect(page.getByRole('cell', { name: /Jane Wanjiku/i })).toBeVisible();
  });

  test('call → start → complete visit updates queue tabs', async ({ page }) => {
    await page.goto('/clinics/1');

    // Open session so actions are enabled
    await page.getByRole('button', { name: /^Open Session$/i }).first().click();

    // Call patient from queue
    await expect(page.getByRole('cell', { name: /John Kamau/i })).toBeVisible();
    await page.getByRole('button', { name: /^Call$/i }).click();

    // Start consultation
    await expect(page.getByRole('button', { name: /^Start$/i })).toBeVisible();
    await page.getByRole('button', { name: /^Start$/i }).click();

    // Visit should appear in "In Consultation" tab
    await page.getByRole('tab', { name: /In Consultation/i }).click();
    const consultationGrid = page.locator('div.grid');
    await expect(consultationGrid.getByText('John Kamau', { exact: true })).toBeVisible();

    // Complete the visit
    await page.getByRole('button', { name: /^Complete$/i }).click();

    // Visit should appear in Completed tab
    await page.getByRole('tab', { name: /Completed/i }).click();
    await expect(page.getByRole('cell', { name: /John Kamau/i })).toBeVisible();
  });

  test('refers a patient to another clinic', async ({ page }) => {
    await page.goto('/clinics/1');

    // Open session
    await page.getByRole('button', { name: /^Open Session$/i }).first().click();

    // Open row actions menu and click "Refer to Clinic"
    await expect(page.getByRole('cell', { name: /John Kamau/i })).toBeVisible();
    const row = page.locator('tr', { hasText: 'John Kamau' });
    // The dropdown trigger is the last button in the row (after Call/Start).
    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /Refer to Clinic/i }).click();

    await expect(page.getByRole('heading', { name: /Refer Patient/i })).toBeVisible();

    const dialog = page.getByRole('dialog', { name: /Refer Patient/i });

    // Select target clinic
    await dialog.getByRole('button', { name: /Refer To Clinic/i }).click();
    await page.getByRole('option', { name: /Dental Clinic/i }).click();

    // Provide referral reason
    await page.getByPlaceholder(/Why is this patient being referred\?/i).fill('Needs specialist review');

    await page.getByRole('button', { name: /^Refer Patient$/i }).click();

    // Referred patient should no longer be in the waiting queue
    await expect(page.getByRole('cell', { name: /John Kamau/i })).toHaveCount(0);
  });
});

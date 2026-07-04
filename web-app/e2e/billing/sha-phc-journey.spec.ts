/**
 * SHA PHC Claim Journey — Level 2 Facility E2E Test
 *
 * Simulates the full patient journey at a Level 2 dispensary:
 * login → claim detail → PHC flow badge → intervention selection →
 * OTP consent → start visit → add virtual claim line → submit → payment.
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, login } from '../fixtures';

// =============================================================================
// Constants
// =============================================================================

const FACILITY_ID = 1;
const CLAIM_ID = 42;
const SHA_MEMBER_ID = 7;
const CONSENT_ID = 10;
const CONSENT_TOKEN = 'ct_abc123';
const PATIENT_CR_ID = 'CR-1001';
const PATIENT_NAME = 'Jane Wanjiku Kamau';

// =============================================================================
// Mock Data Builders
// =============================================================================

function buildAuthResponse() {
  return {
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
    user: {
      id: 1, username: TEST_USER.username, email: 'test@vitora.health',
      first_name: 'Test', last_name: 'User',
      is_staff: true, is_superuser: true, role: 'ADMIN', permissions: [],
      national_id: '12345678', license_number: 'LIC-001',
    },
  };
}

function buildFacilityResponse() {
  return {
    id: FACILITY_ID, organization: 1, organization_name: 'Kasarani Health Services',
    mfl_code: '12345', name: 'Kasarani Dispensary', level: '2',
    ownership: 'GOK', county: 1, county_name: 'Nairobi',
    sub_county: 1, sub_county_name: 'Westlands',
    is_headquarters: true, branch_code: '', sha_contracted: true,
    operating_mode: 'FULL_HMIS', is_active: true,
    ward: null, ward_name: null, logo: null, effective_logo_url: null,
    sha_contract_expiry: '2027-12-31', sha_facility_code: 'FAC-12345', dhis2_org_unit: '',
    modules: {}, enabled_module_names: [],
    dha_license_status: 'ACTIVE', dha_license_number: 'LIC-001',
    dha_license_expiry: '2027-12-31', dha_operational_status: 'OPERATIONAL',
    dha_sha_contract_status: 'ACTIVE', dha_facility_type: 'DISPENSARY',
    dha_keph_level: '2', dha_ownership: 'PUBLIC', dha_regulatory_body: 'KMPDC',
    has_billing: true,
    created_at: '2025-01-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
  };
}

function buildClaimResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: CLAIM_ID, claim_number: 'CLM-20260705-0042',
    sha_claim_reference: null, sha_reference: null,
    patient: 1, patient_id: 1,
    patient_name: PATIENT_NAME, patient_mrn: 'MRN-20260705-0001',
    sha_member: SHA_MEMBER_ID, sha_member_number: 'SHA-1001',
    encounter: 1001, encounter_id: 1001,
    invoice: 2001, invoice_id: 2001, invoice_number: 'INV-20260705-0001',
    submitted_by_username: null,
    claim_type: 'OUTPATIENT', status: 'draft',
    service_date: '2026-07-05', admission_date: null, discharge_date: null,
    primary_diagnosis_code: 'PENDING',
    primary_diagnosis_description: 'Awaiting diagnosis',
    secondary_diagnosis_codes: null,
    claimed_amount: null, total_amount: '0.00',
    approved_amount: null, paid_amount: null, rejected_amount: null,
    patient_copay: null, copay_amount: null,
    submission_method: null, submitted_at: null, submitted_by: null,
    adjudication_date: null, adjudication_notes: '', rejection_reason: '',
    rejection_code: '', rejection_codes: null,
    payment_date: null, payment_reference: '',
    preauth_number: null, preauth_date: null, preauth_valid_until: null,
    claim_flow: 'phc', is_emergency_claim: false,
    facility_code: '12345', facility_level: 'L2',
    version: null, parent_claim: null,
    items_count: null, attachments_count: null,
    created_at: '2026-07-05T08:00:00Z', updated_at: '2026-07-05T08:00:00Z',
    processed_at: null,
    fhir_bundle_id: null, created_by: 1,
    dha_external_id: PATIENT_CR_ID, dha_correlation_id: null,
    last_dha_status: null, last_dha_payload_at: null,
    dha_visit_started_at: null, consent_obtained: false,
    claim_interventions: [],
    missing_document_types: [],
    ...overrides,
  };
}

function buildInterventionsResponse() {
  return {
    count: 4,
    results: [
      { code: 'SHA-05-001', name: 'Consultation, prescription, and issuing of glasses',
        category: 'SHA-05-SC-01', price: 2500.00, facility_level: 2, is_active: true,
        effective_date: null, access_point: 'OP',
        payment_mechanism: 'FIXED FEE FOR SERVICE', schemes: ['PMF', 'UHC'],
        benefit_code: 'SHA-05-SC-01', requires_preauthorization: false },
      { code: 'SHA-08-004', name: 'Anti-D', category: 'SHA-08-SC-02', price: 1500.00,
        facility_level: 2, is_active: true, effective_date: null, access_point: 'OP',
        payment_mechanism: 'FIXED FEE FOR SERVICE', schemes: ['PMF', 'UHC'],
        benefit_code: 'SHA-08-SC-02', requires_preauthorization: false },
      { code: 'SHA-01-001', name: 'Ambulance service (Intra Metro <=25 km Radius)',
        category: 'SHA-01-SC-02', price: 3000.00, facility_level: 2, is_active: true,
        effective_date: null, access_point: 'OP and IP',
        payment_mechanism: 'FIXED FEE FOR SERVICE', schemes: ['PMF', 'UHC'],
        benefit_code: 'SHA-01-SC-02', requires_preauthorization: false },
      { code: 'SHA-01-002', name: 'Ambulance service (Extra Metro > 25km)',
        category: 'SHA-01-SC-02', price: 5000.00, facility_level: 2, is_active: true,
        effective_date: null, access_point: 'OP and IP',
        payment_mechanism: 'FIXED FEE FOR SERVICE', schemes: ['PMF', 'UHC'],
        benefit_code: 'SHA-01-SC-02', requires_preauthorization: false },
    ],
  };
}

// =============================================================================
// Mock Setup
// =============================================================================

async function setupMocks(page: Page) {
  // Mutable claim state — updated as the journey progresses
  let claimState = buildClaimResponse();

  // Catch-all for any unmocked API routes — returns 200 with empty JSON
  // Registered first so specific routes (below) override it.
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  // Login endpoint — called by the real login form
  await page.route('**/api/auth/login/**', async (route) => {
    const authResp = buildAuthResponse();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(authResp) });
  });
  // Token refresh (after page navigation)
  await page.route('**/api/auth/refresh/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'mock-access-token' }) });
  });
  // Auth verification — called on every page load by AuthProvider
  await page.route('**/api/staff/me/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_info: buildAuthResponse().user }) });
  });

  // ── 2. Facilities ────────────────────────────────────────────────────────
  await page.route('**/api/facilities/my-facilities/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: FACILITY_ID, name: 'Kasarani Dispensary', level: '2', mfl_code: '12345', is_active: true, sha_contracted: true }]),
    });
  });
  await page.route(`**/api/facilities/${FACILITY_ID}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildFacilityResponse()) });
  });

  // ── 3. Claim detail (dynamic — updated as journey progresses) ────────────
  await page.route(`**/api/billing/claims/${CLAIM_ID}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(claimState) });
  });

  // ── 4. Intervention search (ConsentPanel) ────────────────────────────────
  await page.route('**/api/sha/terminology/interventions/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildInterventionsResponse()) });
  });

  // ── 5. Consent (send OTP / validate) ─────────────────────────────────────
  // Get latest consent — return "not found" so ConsentPanel shows send-otp UI
  await page.route('**/api/sha/consent/latest/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false }) });
  });
  // Send OTP
  await page.route('**/api/sha/consent/send-otp/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ consent_id: CONSENT_ID, sandbox_otp: '123456' }),
    });
  });
  // Validate OTP
  await page.route('**/api/sha/consent/validate-otp/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ consent_token: CONSENT_TOKEN, id: CONSENT_ID }),
    });
  });

  // ── 6. DHA ILM ───────────────────────────────────────────────────────────
  // PreVisitChecksPanel calls
  await page.route('**/api/sha/ilm/**', async (route) => {
    const url = route.request().url();
    if (url.includes('patient-eligibility')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ eligibilityStatus: 'ELIGIBLE', fullName: PATIENT_NAME, schemes: [{ schemeName: 'UHC', status: 'ACTIVE' }] }),
      });
    } else if (url.includes('facility-search')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ count: 1, results: [{ code: 'FAC-12345', name: 'Kasarani Dispensary' }] }),
      });
    } else if (url.includes('practitioner-search')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ count: 1, results: [{ licence_number: 'LIC-001', name: 'Dr. Test' }] }),
      });
    } else if (url.includes('utilization')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ utilization: [], remaining_benefits: {} }),
      });
    } else if (url.includes('benefit-interventions')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
  });

  // Claim-level ILM endpoints
  await page.route(`**/api/sha/claims/${CLAIM_ID}/ilm/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/start-visit/')) {
      claimState = { ...claimState, dha_visit_started_at: '2026-07-05T08:35:00Z' };
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Visit started', status_code: 200, payload: { visit_id: 'VIS-001' } }),
      });
    } else if (url.includes('/virtual-claim-line/')) {
      claimState = {
        ...claimState,
        claim_interventions: [{
          id: 1, intervention_code: 'SHA-05-001',
          intervention_name: 'Consultation, prescription, and issuing of glasses',
          benefit_code: 'SHA-05-SC-01', status: 'active',
          required_document_types: [], dha_intervention_id: 'DHA-INT-001',
          tariff_amount: '2500.00',
          payment_mechanism: 'FIXED_FEE_FOR_SERVICE', access_point: 'OP',
          needs_preauth: false, needs_manual_preauth_approval: false,
          is_surgical_preauth: false, is_renal_preauth: false,
          is_oncology_preauth: false, is_imaging_preauth: false,
          is_optical_preauth: false, level2_tariff: '2500.00',
          created_at: '2026-07-05T08:30:00Z', updated_at: '2026-07-05T08:30:00Z',
        }],
      };
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, status_code: 200, payload: { claim_line_id: 'CL-001', authorization_code: 'AUTH-001' } }),
      });
    } else if (url.includes('/preview/')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, status_code: 200, payload: { total: 2500 } }),
      });
    } else if (url.includes('/submit/')) {
      claimState = {
        ...claimState,
        status: 'submitted', submitted_at: '2026-07-05T09:00:00Z',
        sha_claim_reference: 'SHA-REF-001',
        last_dha_status: 'SUBMITTED',
      };
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, status_code: 200, payload: { claim_reference: 'SHA-REF-001' }, message: 'Claim submitted' }),
      });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, status_code: 200, payload: {} }) });
    }
  });

  // ── 7. Capitation validation ─────────────────────────────────────────────
  await page.route('**/api/billing/capitation/validate/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ is_valid: true, provider_name: 'Kasarani Dispensary', provider_code: 'FAC-12345' }),
    });
  });

}

// =============================================================================
// Tests
// =============================================================================

test.describe('SHA PHC Claim Journey — Level 2 Facility', () => {
  test('full journey: PHC badge → intervention → consent → start visit → virtual claim line → submit', async ({ page }) => {
    await setupMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);

    // ── 1. Navigate to claim detail (workflow tab) ─────────────────────
    await page.goto(`/transactions/sha-claims/${CLAIM_ID}#workflow`);

    // Wait for the ConsentPanel to render
    await page.waitForSelector('text=Patient Consent', { timeout: 15000 });

    // ── 2. Verify PHC flow badge ──────────────────────────────────────
    await expect(page.locator('text=DHA HIE Workflow - PHC')).toBeVisible();
    await expect(page.locator('text=DHA HIE Workflow - SHIF')).toHaveCount(0);
    await expect(page.locator('text=PHC · simplified')).toBeVisible();
    await expect(page.locator('text=Uses virtual claim lines')).toBeVisible();

    // ── 3. Intervention select shows Level 2 codes with schemes ───────
    const interventionSelect = page.locator('text=Service / Intervention').locator('..').locator('button[role="combobox"]');
    await interventionSelect.click();

    await expect(page.locator('text=SHA-05-001')).toBeVisible();
    await expect(page.locator('text=SHA-08-004')).toBeVisible();
    await expect(page.locator('text=PMF, UHC')).toHaveCount(4);

    // Select SHA-05-001 (optical)
    await page.locator('text=SHA-05-001').first().click();

    // ── 4. Send OTP ────────────────────────────────────────────────────
    await page.locator('button:has-text("Send OTP")').click();

    // Wait for OTP entry screen
    await page.waitForSelector('text=Enter the OTP code sent', { timeout: 10000 });

    // ── 5. Validate OTP ────────────────────────────────────────────────
    await page.locator('button:has-text("Validate")').click();

    // Wait for consent to be validated
    await page.waitForSelector('text=Validated', { timeout: 10000 });

    // ── 6. Open visit (via ClaimILMPanel) ─────────────────────────────
    // After consent validation, the ClaimILMPanel should show "Validate & Open Visit"
    await page.locator('button:has-text("Validate & Open Visit")').click();

    // Wait for the visit to start — visit status pill appears
    await page.waitForSelector('text=Visit open', { timeout: 10000 });

    // ── 7. Add virtual claim line intervention ─────────────────────────
    // "Add intervention" button should be visible now that visit is started
    await page.locator('button:has-text("Add intervention")').click();

    // The Add intervention dialog opens — type the code
    await page.locator('input[id="new-intervention"]').fill('SHA-05-001');

    // Click Add
    await page.locator('button:has-text("Add")').click();

    // Wait for dialog to close — intervention added
    await page.waitForTimeout(2000);

    // ── 8. Submit claim ────────────────────────────────────────────────
    // The Submit claim button is in the Lifecycle section
    await page.locator('button:has-text("Submit claim")').click();

    // Wait for submission confirmation
    await page.waitForTimeout(2000);

    // ── 9. Verify submitted status ────────────────────────────────────
    // The claim refetch should update the claim status
    await page.locator('button:has-text("Refresh")').click();
    await expect(page.locator('text=submitted')).toBeVisible({ timeout: 10000 });

    // ── 10. Verify SHA reference appears in the page ──────────────────
    await expect(page.locator('text=SHA-REF-001')).toBeVisible();
  });
});

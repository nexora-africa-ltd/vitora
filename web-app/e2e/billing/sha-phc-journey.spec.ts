/**
 * SHA PHC Claim Journey — Level 2 Facility E2E Test
 *
 * Simulates the full patient journey at a Level 2 dispensary:
 * login → claim detail → PHC badge → select interventions → OTP consent →
 * open visit → add multiple virtual claim lines (consultation + lab +
 * pharmacy) → submit → verify.
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

/** SHA-12 is "Basic Outpatient Services" — the only prefix ConsentPanel shows. */
const INTERVENTIONS = {
  consultation: { code: 'SHA-12-001', name: 'General consultation', price: 500, mech: 'FEE FOR SERVICE' },
  lab:          { code: 'SHA-12-002', name: 'Rapid diagnostic test (Malaria)', price: 800, mech: 'FEE FOR SERVICE' },
  pharmacy:     { code: 'SHA-12-003', name: 'Antimalarial (Artemether-Lumefantrine)', price: 600, mech: 'FEE FOR SERVICE' },
} as const;

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
      facility: {
        id: FACILITY_ID, mfl_code: '12345', name: 'Kasarani Dispensary',
        level: '2', sha_contracted: true,
        modules: { billing: true, outpatient: true, pharmacy: true, laboratory: true, triage: true },
      },
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
  const results = Object.values(INTERVENTIONS).map((i) => ({
    code: i.code,
    name: i.name,
    category: i.code.replace(/-\d{2}$/, '-SC-01'),
    price: i.price,
    facility_level: 2,
    is_active: true,
    effective_date: null,
    access_point: 'OP',
    payment_mechanism: i.mech,
    schemes: ['PMF', 'UHC'],
    benefit_code: i.code.replace(/-\d{2}$/, '-SC-01'),
    requires_preauthorization: false,
  }));
  return { count: results.length, results };
}

/** Minimal intervention shape that claim.claim_interventions stores. */
function interventionLine(code: string, id: number) {
  const meta = Object.values(INTERVENTIONS).find((i) => i.code === code)!;
  return {
    id,
    intervention_code: code,
    intervention_name: meta.name,
    benefit_code: code.replace(/-\d{2}$/, '-SC-01'),
    status: 'active',
    required_document_types: [],
    dha_intervention_id: `DHA-INT-${String(id).padStart(3, '0')}`,
    tariff_amount: `${meta.price}.00`,
    payment_mechanism: meta.mech.replace(/ /g, '_'),
    access_point: 'OP',
    needs_preauth: false,
    needs_manual_preauth_approval: false,
    is_surgical_preauth: false,
    is_renal_preauth: false,
    is_oncology_preauth: false,
    is_imaging_preauth: false,
    is_optical_preauth: false,
    level2_tariff: `${meta.price}.00`,
    created_at: '2026-07-05T08:30:00Z',
    updated_at: '2026-07-05T08:30:00Z',
  };
}

// =============================================================================
// Mock Setup
// =============================================================================

async function setupMocks(page: Page) {
  let claimState = buildClaimResponse();
  let nextIntervId = 1;

  // Catch-all for any unmocked API routes
  await page.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  await page.route('**/api/auth/login/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAuthResponse()) });
  });
  await page.route('**/api/auth/refresh/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access: 'mock-access-token' }) });
  });
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

  // ── 3. Claim detail (dynamic) ────────────────────────────────────────────
  await page.route(`**/api/billing/claims/${CLAIM_ID}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(claimState) });
  });

  // ── 4. Intervention catalogue search ─────────────────────────────────────
  await page.route('**/api/sha/terminology/interventions/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildInterventionsResponse()) });
  });

  // ── 5. Consent ───────────────────────────────────────────────────────────
  await page.route('**/api/sha/consent/latest/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false }) });
  });
  await page.route('**/api/sha/consent/send-otp/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        consent_id: CONSENT_ID,
        otp_reference: 'OTP-REF-001',
        status: 'sent',
        message: 'OTP sent successfully',
        sandbox_otp: '123456',
      }),
    });
  });
  await page.route('**/api/sha/consent/validate-otp/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ consent_token: CONSENT_TOKEN, id: CONSENT_ID }),
    });
  });
  await page.route('**/api/sha/consent/start-visit/**', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: CONSENT_ID,
        status: 'VALIDATED',
        consent_token: CONSENT_TOKEN,
        expires_at: '2026-07-05T10:00:00Z',
        visit_data: {},
        message: 'Visit started',
      }),
    });
  });
  // Consent detail (refetched after start-visit successfully validates OTP)
  await page.route(`**/api/sha/consent/${CONSENT_ID}/**`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: CONSENT_ID,
        patient: 1,
        sha_member: SHA_MEMBER_ID,
        facility: FACILITY_ID,
        consent_method: 'OTP',
        status: 'VALIDATED',
        otp_reference: 'OTP-REF-001',
        consent_token: CONSENT_TOKEN,
        identification_type: 'national_id',
        identification_number: '12345678',
        created_at: '2026-07-05T08:30:00Z',
        validated_at: '2026-07-05T08:31:00Z',
        expires_at: '2026-07-05T10:00:00Z',
        is_valid: true,
      }),
    });
  });

  // ── 6. DHA ILM ───────────────────────────────────────────────────────────
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
      const interventions = buildInterventionsResponse().results;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { results: interventions }, http_status: 200 }),
      });
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
      // Parse the intervention code from the request body
      const body = route.request().postDataJSON() ?? {};
      const code: string = body.intervention_code ?? '';
      const existing = claimState.claim_interventions;
      const id = nextIntervId++;
      claimState = {
        ...claimState,
        claim_interventions: [...existing, interventionLine(code, id)],
      };
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, status_code: 200, payload: { claim_line_id: `CL-${String(id).padStart(3, '0')}`, authorization_code: `AUTH-${String(id).padStart(3, '0')}` } }),
      });
    } else if (url.includes('/preview/')) {
      const total = claimState.claim_interventions.reduce(
        (sum, i) => sum + parseFloat(i.tariff_amount || '0'), 0,
      );
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, status_code: 200, payload: { total } }),
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
  test('full journey: PHC badge → consent → open visit → add consultation + lab + pharmacy → submit', async ({ page }) => {
    await setupMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);

    // ── 1. Navigate to claim detail (workflow tab) ─────────────────────
    await page.goto(`/transactions/sha-claims/${CLAIM_ID}#workflow`);
    await page.waitForSelector('text=Patient Consent', { timeout: 15000 });

    // ── 2. Verify PHC flow badge ──────────────────────────────────────
    await expect(page.locator('text=DHA HIE Workflow - PHC')).toBeVisible();
    await expect(page.locator('text=DHA HIE Workflow - SHIF')).toHaveCount(0);
    await expect(page.locator('text=PHC · simplified')).toBeVisible();
    await expect(page.locator('text=Uses virtual claim lines')).toBeVisible();

    // ── 3. ConsentPanel: select intervention → send OTP → validate ────
    // Open the Service / Intervention dropdown
    await page.locator('text=Service / Intervention').locator('..').locator('button[role="combobox"]').click();

    // Wait for intervention options to appear in the popover
    const option = page.getByRole('option', { name: INTERVENTIONS.consultation.name });
    await expect(option).toBeVisible({ timeout: 10000 });

    // Verify all three Level 2 names are present
    await expect(page.getByRole('option', { name: INTERVENTIONS.lab.name })).toBeVisible();
    await expect(page.getByRole('option', { name: INTERVENTIONS.pharmacy.name })).toBeVisible();

    // Select consultation
    await option.click();

    // Send OTP — target the primary "Send OTP" button (not the resend variant)
    await page.getByRole('button', { name: 'Send OTP', exact: true }).first().click();
    await page.waitForSelector('text=Enter the OTP code sent', { timeout: 10000 });

    // Verify OTP (the ConsentPanel "Verify" button validates OTP + starts visit)
    await page.locator('button:has-text("Verify")').click();
    await page.waitForSelector('text=Validated', { timeout: 10000 });

    // ── 4. Open visit ─────────────────────────────────────────────────
    await page.locator('button:has-text("Validate & Open Visit")').click();
    await page.waitForSelector('text=Visit open', { timeout: 10000 });

    // ── 5. Add multiple virtual claim lines ───────────────────────────
    // 5a. Add consultation (already sent via consent code, but add as
    //     explicit virtual claim line for the record)
    await page.locator('#claim-workflow-section').getByRole('button', { name: 'Add intervention' }).click();
    await page.waitForTimeout(1000);
    await page.getByLabel('Intervention code').fill(INTERVENTIONS.consultation.code);
    await page.locator('div[role="dialog"]').getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(2000);

    // 5b. Add lab test
    await page.locator('#claim-workflow-section').getByRole('button', { name: 'Add intervention' }).click();
    await page.waitForTimeout(1000);
    await page.getByLabel('Intervention code').fill(INTERVENTIONS.lab.code);
    await page.locator('div[role="dialog"]').getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(2000);

    // 5c. Add pharmacy (prescription)
    await page.locator('#claim-workflow-section').getByRole('button', { name: 'Add intervention' }).click();
    await page.waitForTimeout(1000);
    await page.getByLabel('Intervention code').fill(INTERVENTIONS.pharmacy.code);
    await page.locator('div[role="dialog"]').getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(2000);

    // Verify the count reflects 3 interventions
    await expect(page.locator('text=3 active interventions')).toBeVisible();

    // ── 6. Submit claim ───────────────────────────────────────────────
    await page.locator('button:has-text("Submit claim")').click();
    await page.waitForTimeout(2000);

    // ── 7. Verify submitted status ────────────────────────────────────
    await page.locator('button:has-text("Refresh")').click();
    await expect(page.locator('text=submitted')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=SHA-REF-001')).toBeVisible();

    // ── 8. Switch to Interventions tab — all three lines should appear ─
    await page.getByRole('tab', { name: /Interventions/ }).click();
    await expect(page.locator(`text=${INTERVENTIONS.consultation.name}`)).toBeVisible();
    await expect(page.locator(`text=${INTERVENTIONS.lab.name}`)).toBeVisible();
    await expect(page.locator(`text=${INTERVENTIONS.pharmacy.name}`)).toBeVisible();
  });
});

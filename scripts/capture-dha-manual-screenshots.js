// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Captures sanitized, DHA manual evidence screenshots from a configured staging Vitora instance.
 * Run: DHA_CAPTURE_STORAGE_STATE=/secure/path/state.json node scripts/capture-dha-manual-screenshots.js
 * Inputs: DHA_CAPTURE_BASE_URL, DHA_CAPTURE_STORAGE_STATE or DHA_CAPTURE_USERNAME/DHA_CAPTURE_PASSWORD,
 * optional DHA_CAPTURE_OUTPUT_DIR, DHA_CAPTURE_PATIENT_ID, DHA_CAPTURE_LAB_RESULT_ID,
 * DHA_CAPTURE_CLAIM_ID, DHA_CAPTURE_MOH705_REPORT_ID,
 * DHA_CAPTURE_PATIENT_SEARCH, DHA_CAPTURE_WAIT_MS, DHA_CAPTURE_SLOW_WAIT_MS,
 * DHA_CAPTURE_LOGIN_RETRIES, and --headed.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const playwright = require(require.resolve('playwright', {
  paths: [path.resolve(__dirname, '../web-app')],
}));

const { chromium } = playwright;
const baseUrl = (process.env.DHA_CAPTURE_BASE_URL || 'https://staging.vitora.digital').replace(/\/$/, '');
const outputDir = path.resolve(
  process.env.DHA_CAPTURE_OUTPUT_DIR ||
    path.join(__dirname, '../docs/assets/system-user-manual/screenshots')
);
const storageState = process.env.DHA_CAPTURE_STORAGE_STATE;
const username = process.env.DHA_CAPTURE_USERNAME;
const password = process.env.DHA_CAPTURE_PASSWORD;
const patientId = process.env.DHA_CAPTURE_PATIENT_ID;
const labResultId = process.env.DHA_CAPTURE_LAB_RESULT_ID;
const claimId = process.env.DHA_CAPTURE_CLAIM_ID;
const moh705ReportId = process.env.DHA_CAPTURE_MOH705_REPORT_ID;
const prescriptionId = process.env.DHA_CAPTURE_PRESCRIPTION_ID || '28';
const encounterPatientId = process.env.DHA_CAPTURE_ENCOUNTER_PATIENT_ID || patientId;
const patientSearch = process.env.DHA_CAPTURE_PATIENT_SEARCH || 'Mary';
const bypassCsp = process.env.DHA_CAPTURE_BYPASS_CSP === '1';
const captureWaitMs = Number.parseInt(process.env.DHA_CAPTURE_WAIT_MS || '5000', 10);
const slowCaptureWaitMs = Number.parseInt(process.env.DHA_CAPTURE_SLOW_WAIT_MS || '20000', 10);
const loginRetries = Number.parseInt(process.env.DHA_CAPTURE_LOGIN_RETRIES || '3', 10);
const requestedFiles = new Set(
  (process.env.DHA_CAPTURE_ONLY || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const headed = process.argv.includes('--headed');
const fullPage = process.argv.includes('--full-page');

const captures = [
  ['02-dashboard.png', '/dashboard', 'Role-aware dashboard and navigation'],
  ['03-patient-lookup.png', '/patients/lookup', 'Patient lookup and duplicate prevention'],
  ['04-new-patient.png', '/patients/new', 'Patient registration and required fields'],
  ['05-check-in.png', '/patients/checkin', 'Patient check-in and clinic routing'],
  ['06-triage-queue.png', '/triage', 'Triage queue and prioritization'],
  [
    '07-new-encounter.png',
    encounterPatientId
      ? `/encounters/new/patient?patient=${encodeURIComponent(encounterPatientId)}`
      : '/encounters/new/patient',
    'Encounter data entry and clinical validation',
  ],
  ['08-cds-alerts.png', '/cds/alerts', 'Clinical decision support alert workflow'],
  ['09-laboratory.png', '/laboratory', 'Laboratory order and result workflow'],
  [
    '10-pharmacy-prescription-detail.png',
    `/pharmacy/prescriptions/${encodeURIComponent(prescriptionId)}`,
    'Prescription review and medication validation',
  ],
  [
    '11-pharmacy-dispensing.png',
    `/pharmacy/dispensing?prescription=${encodeURIComponent(prescriptionId)}`,
    'Dispensing and stock validation',
  ],
  ['12-billing.png', '/billing', 'Invoice, payment, and receipt workflow'],
  ['13-private-insurance.png', '/insurance', 'Private-insurance workflows and HealthCloud status'],
  ['13a-sha-claims.png', '/transactions/sha-claims', 'SHA claim validation and submission workflow'],
  ['14-moh-reporting.png', '/reports/moh', 'MOH, KHIS, and DHIS2 reporting'],
  ['15-scheduling.png', '/scheduling', 'Scheduling and active-shift workflow'],
  ['16-analytics.png', '/analytics', 'Analytics and report validation'],
  ['17-admin-staff.png', '/admin/staff', 'Role and access administration'],
  ['18-emergency-access.png', '/safety/emergency-access', 'Emergency access request workflow'],
];

if (patientId) {
  captures.splice(4, 0, [
    '04a-patient-profile.png',
    `/patients/${encodeURIComponent(patientId)}`,
    'Patient profile, alerts, and sensitive-record guidance',
  ]);
}

if (labResultId) {
  captures.splice(10, 0, [
    '09a-laboratory-result.png',
    `/laboratory/results/${encodeURIComponent(labResultId)}`,
    'Laboratory result verification and critical-result escalation',
  ]);
}

if (claimId) {
  captures.splice(16, 0, [
    '13b-sha-claim-detail.png',
    `/transactions/sha-claims/${encodeURIComponent(claimId)}`,
    'SHA claim validation and submission-status guidance',
  ]);
}

if (moh705ReportId) {
  captures.splice(19, 0, [
    '14a-moh705-report-detail.png',
    `/reports/moh/705/${encodeURIComponent(moh705ReportId)}`,
    'MOH 705 report review and DHIS2 submission guidance',
  ]);
}

function requireAuthenticationConfiguration() {
  if (storageState || (username && password)) {
    return;
  }

  throw new Error(
    'Set DHA_CAPTURE_STORAGE_STATE, or both DHA_CAPTURE_USERNAME and DHA_CAPTURE_PASSWORD. ' +
      'Use a dedicated staging account containing synthetic data only.'
  );
}

async function waitForScreen(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);

  // Most data-heavy pages render visible Tailwind skeletons while React Query loads.
  // Wait for those to clear instead of taking a screenshot at an arbitrary moment.
  try {
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('.animate-pulse')).some((element) => {
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }),
      { timeout: captureWaitMs }
    );
  } catch {
    // Some screens intentionally retain a pulse animation; preserve the configured upper bound.
  }

  await page.waitForTimeout(300);
}

async function waitForDataHeavyScreen(page) {
  await waitForScreen(page);
  try {
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes('Loading...') &&
        !Array.from(document.querySelectorAll('.animate-pulse')).some((element) => {
          const style = window.getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }),
      { timeout: slowCaptureWaitMs }
    );
  } catch {
    // The manifest records this capture for review; a persistent loading state is never silently hidden.
  }
}

async function positionCapture(page, file) {
  if (file === '03-patient-lookup.png') {
    await page.getByPlaceholder('Search by MRN, National ID, phone number, or name...').fill(patientSearch);
    await page.waitForTimeout(500);
    await waitForScreen(page);
    return;
  }

  if (file === '07-new-encounter.png' && encounterPatientId) {
    await page.getByRole('button', { name: /next: complaint/i }).click();
    await page.waitForURL(/\/encounters\/new\/details/, { timeout: captureWaitMs, waitUntil: 'commit' });
    await waitForScreen(page);
    return;
  }

  if (file === '10-pharmacy-prescription-detail.png') {
    await page.getByText('Prescription Items', { exact: true }).scrollIntoViewIfNeeded();
    return;
  }

  if (file === '13a-sha-claims.png') {
    await page.getByText(/^Claims \(/).scrollIntoViewIfNeeded();
    return;
  }

  const sectionHeading = {
    '06-triage-queue.png': 'Patients Awaiting Triage',
    '12-billing.png': 'Invoices',
  }[file];

  if (sectionHeading) {
    await page.getByText(sectionHeading, { exact: true }).last().scrollIntoViewIfNeeded();
    if (file === '06-triage-queue.png') {
      await page.evaluate(() => window.scrollBy(0, 220));
    }
  }
}

async function captureLoginGuidance(browser, manifest) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    bypassCSP: bypassCsp,
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForScreen(page);
    await page.screenshot({ path: path.join(outputDir, '00-login.png'), fullPage });
    manifest.captured.push({ file: '00-login.png', title: 'Sign in and access procedure', route: '/login' });

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outputDir, '01-login-validation.png'), fullPage });
    manifest.captured.push({ file: '01-login-validation.png', title: 'Required-field validation message', route: '/login' });
  } catch (error) {
    manifest.skipped.push({ file: '00-login.png', title: 'Login guidance', reason: error.message });
  } finally {
    await context.close();
  }
}

async function login(page) {
  let lastError;
  for (let attempt = 1; attempt <= loginRetries; attempt += 1) {
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
        timeout: 30000,
        waitUntil: 'commit',
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === loginRetries) {
        throw lastError;
      }
      console.warn(`Login attempt ${attempt} did not complete; retrying.`);
      await page.waitForTimeout(1000);
    }
  }

  if (page.url().includes('/mfa')) {
    throw new Error(
      'MFA verification is required. Create a short-lived authenticated storage state and set DHA_CAPTURE_STORAGE_STATE instead.'
    );
  }
}

async function captureRoute(page, definition, manifest) {
  const [file, route, title] = definition;
  console.log(`Capturing ${file}: ${route}`);

  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (
      new Set([
        '02-dashboard.png',
        '06-triage-queue.png',
        '09a-laboratory-result.png',
        '10-pharmacy-prescription-detail.png',
        '11-pharmacy-dispensing.png',
        '13-private-insurance.png',
        '16-analytics.png',
        '17-admin-staff.png',
        '18-emergency-access.png',
      ]).has(file)
    ) {
      await waitForDataHeavyScreen(page);
    } else {
      await waitForScreen(page);
    }

    if (new URL(page.url()).pathname.startsWith('/login')) {
      manifest.skipped.push({ file, title, route, reason: 'Redirected to login; account session or role is insufficient.' });
      return;
    }

    await positionCapture(page, file);

    await page.screenshot({ path: path.join(outputDir, file), fullPage });
    manifest.captured.push({ file, title, route, resolvedUrl: page.url() });
  } catch (error) {
    manifest.skipped.push({ file, title, route, reason: error.message });
  }
}

async function main() {
  requireAuthenticationConfiguration();
  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = {
    capturedAt: new Date().toISOString(),
    baseUrl,
    outputDir,
    captureWaitMs,
    slowCaptureWaitMs,
    loginRetries,
    safety: 'Capture only a dedicated staging facility populated with synthetic data. Review every image before DHA submission.',
    browserBypassedCsp: bypassCsp,
    captured: [],
    skipped: [],
  };

  const browser = await chromium.launch({ headless: !headed });
  try {
    await captureLoginGuidance(browser, manifest);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      bypassCSP: bypassCsp,
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();

    if (!storageState) {
      await login(page);
    }

    const selectedCaptures = requestedFiles.size
      ? captures.filter(([file]) => requestedFiles.has(file))
      : captures;

    if (requestedFiles.size && selectedCaptures.length !== requestedFiles.size) {
      const selectedFiles = new Set(selectedCaptures.map(([file]) => file));
      throw new Error(`Unknown capture file(s): ${[...requestedFiles].filter((file) => !selectedFiles.has(file)).join(', ')}`);
    }

    for (const definition of selectedCaptures) {
      await captureRoute(page, definition, manifest);
    }

    await context.close();
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outputDir, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Captured ${manifest.captured.length} screenshots; skipped ${manifest.skipped.length}.`);
  if (bypassCsp) {
    console.warn('CSP bypass was used. Treat these images as diagnostic only until staging CSP is corrected.');
  }
  console.log(`Review capture-manifest.json and all images before use: ${outputDir}`);
  process.exitCode = manifest.skipped.length > 0 ? 2 : 0;
}

main().catch((error) => {
  console.error(`DHA screenshot capture failed: ${error.message}`);
  process.exitCode = 1;
});

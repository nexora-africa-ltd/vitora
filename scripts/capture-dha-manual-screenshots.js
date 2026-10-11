// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Captures sanitized, DHA manual evidence screenshots from a configured staging Vitora instance.
 * Run: DHA_CAPTURE_STORAGE_STATE=/secure/path/state.json node scripts/capture-dha-manual-screenshots.js
 * Inputs: DHA_CAPTURE_BASE_URL, DHA_CAPTURE_STORAGE_STATE or DHA_CAPTURE_USERNAME/DHA_CAPTURE_PASSWORD,
 * optional DHA_CAPTURE_OUTPUT_DIR, DHA_CAPTURE_PATIENT_ID, DHA_CAPTURE_LAB_RESULT_ID, and --headed.
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
    path.join('/tmp', `vitora-dha-manual-screenshots-${new Date().toISOString().replace(/[:.]/g, '-')}`)
);
const storageState = process.env.DHA_CAPTURE_STORAGE_STATE;
const username = process.env.DHA_CAPTURE_USERNAME;
const password = process.env.DHA_CAPTURE_PASSWORD;
const patientId = process.env.DHA_CAPTURE_PATIENT_ID;
const labResultId = process.env.DHA_CAPTURE_LAB_RESULT_ID;
const headed = process.argv.includes('--headed');
const fullPage = process.argv.includes('--full-page');

const captures = [
  ['02-dashboard.png', '/dashboard', 'Role-aware dashboard and navigation'],
  ['03-patient-search.png', '/patients', 'Patient search and duplicate prevention'],
  ['04-new-patient.png', '/patients/new', 'Patient registration and required fields'],
  ['05-check-in.png', '/patients/checkin', 'Patient check-in and clinic routing'],
  ['06-triage-queue.png', '/triage', 'Triage queue and prioritization'],
  ['07-new-encounter.png', '/encounters/new', 'Encounter data entry and clinical validation'],
  ['08-cds-alerts.png', '/cds/alerts', 'Clinical decision support alert workflow'],
  ['09-laboratory.png', '/laboratory', 'Laboratory order and result workflow'],
  ['10-pharmacy-prescriptions.png', '/pharmacy/prescriptions', 'Prescription review workflow'],
  ['11-pharmacy-dispensing.png', '/pharmacy/dispensing', 'Dispensing and stock validation'],
  ['12-billing.png', '/billing', 'Invoice, payment, and receipt workflow'],
  ['13-insurance-sha.png', '/insurance', 'SHA/DHA eligibility, claims, and preauthorization'],
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
  await page.waitForTimeout(1800);
}

async function captureLoginGuidance(browser, manifest) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
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
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
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
    await waitForScreen(page);

    if (new URL(page.url()).pathname.startsWith('/login')) {
      manifest.skipped.push({ file, title, route, reason: 'Redirected to login; account session or role is insufficient.' });
      return;
    }

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
    safety: 'Capture only a dedicated staging facility populated with synthetic data. Review every image before DHA submission.',
    captured: [],
    skipped: [],
  };

  const browser = await chromium.launch({ headless: !headed });
  try {
    await captureLoginGuidance(browser, manifest);

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();

    if (!storageState) {
      await login(page);
    }

    for (const definition of captures) {
      await captureRoute(page, definition, manifest);
    }

    await context.close();
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outputDir, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`Captured ${manifest.captured.length} screenshots; skipped ${manifest.skipped.length}.`);
  console.log(`Review capture-manifest.json and all images before use: ${outputDir}`);
  process.exitCode = manifest.skipped.length > 0 ? 2 : 0;
}

main().catch((error) => {
  console.error(`DHA screenshot capture failed: ${error.message}`);
  process.exitCode = 1;
});

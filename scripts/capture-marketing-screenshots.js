/**
 * Script to capture real screenshots from the running web-app
 * for use in the marketing site.
 *
 * Prerequisites:
 * - Backend running on port 9088
 * - Web app running on port 3009
 * - npm install playwright (or use from web-app node_modules)
 *
 * Usage: node scripts/capture-marketing-screenshots.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../vitora-marketing/public/assets/images/screenshots');
const BASE_URL = 'http://localhost:3009';
const CREDENTIALS = { username: 'demo_admin', password: 'Demo@2026!' };

// Ensure output directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder="Enter your username or email"]', CREDENTIALS.username);
  await page.fill('input[placeholder="Enter your password"]', CREDENTIALS.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
  await page.waitForTimeout(3000);
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.documentElement.style.colorScheme = 'light';
    }
  }, theme);
  await page.waitForTimeout(500);
}

async function captureScreenshot(page, route, filename, options = {}) {
  const { waitTime = 4000, fullPage = false } = options;
  console.log(`  Capturing: ${filename} (${route})`);
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(waitTime);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage,
    timeout: 30000
  });
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // Retina quality
  });
  const page = await context.newPage();

  try {
    // Login
    console.log('Logging in...');
    await login(page);

    // === LIGHT MODE SCREENSHOTS (Desktop) ===
    console.log('\n=== Light Mode Desktop Screenshots ===');
    await setTheme(page, 'light');

    // Dashboard
    await captureScreenshot(page, '/dashboard', 'dashboard-light.png', { waitTime: 5000 });

    // Patients
    await captureScreenshot(page, '/patients', 'patients-list.png');

    // Triage
    await captureScreenshot(page, '/triage', 'triage-queue.png');

    // Scheduling
    await captureScreenshot(page, '/scheduling', 'scheduling.png');
    await captureScreenshot(page, '/scheduling/roster', 'scheduling-roster.png');

    // Billing
    await captureScreenshot(page, '/billing', 'billing.png');

    // Pharmacy
    await captureScreenshot(page, '/pharmacy', 'pharmacy.png');

    // Laboratory
    await captureScreenshot(page, '/laboratory', 'laboratory.png');

    // Insurance/SHA
    await captureScreenshot(page, '/insurance', 'sha-insurance.png');

    // Admissions
    await captureScreenshot(page, '/admissions', 'admissions.png');

    // AI Assistant (TibaBot)
    await captureScreenshot(page, '/ai', 'tibabot-light.png');

    // Admin
    await captureScreenshot(page, '/admin/overview', 'admin-overview.png');
    await captureScreenshot(page, '/admin/staff', 'admin-staff.png');

    // Clinics
    await captureScreenshot(page, '/clinics', 'clinics.png');

    // Analytics
    await captureScreenshot(page, '/analytics', 'analytics.png');

    // Wards
    await captureScreenshot(page, '/wards', 'wards.png');

    // Reports
    await captureScreenshot(page, '/reports/moh', 'reports-moh.png');

    // === DARK MODE SCREENSHOTS (Desktop) ===
    console.log('\n=== Dark Mode Desktop Screenshots ===');
    await setTheme(page, 'dark');

    await captureScreenshot(page, '/dashboard', 'dashboard-dark.png', { waitTime: 5000 });
    await captureScreenshot(page, '/ai', 'tibabot-dark.png');

    // === MOBILE SCREENSHOTS ===
    console.log('\n=== Mobile Screenshots ===');
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Login on mobile
    await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(1000);
    await mobilePage.fill('input[placeholder="Enter your username or email"]', CREDENTIALS.username);
    await mobilePage.fill('input[placeholder="Enter your password"]', CREDENTIALS.password);
    await mobilePage.click('button:has-text("Sign in")');
    await mobilePage.waitForURL('**/dashboard**', { timeout: 15000 });
    await mobilePage.waitForTimeout(3000);

    // Light mobile
    await setTheme(mobilePage, 'light');
    console.log('  Capturing: dashboard-mobile-light.png');
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-mobile-light.png'), timeout: 30000 });

    // Dark mobile
    await setTheme(mobilePage, 'dark');
    console.log('  Capturing: dashboard-mobile-dark.png');
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, 'dashboard-mobile-dark.png'), timeout: 30000 });

    await mobileContext.close();

    console.log(`\n✅ All screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log(`   Total files: ${fs.readdirSync(SCREENSHOT_DIR).length}`);

  } catch (error) {
    console.error('Error:', error.message);
    // Take a debug screenshot
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'debug-error.png') });
  } finally {
    await browser.close();
  }
}

main();

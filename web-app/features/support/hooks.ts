/**
 * BDD Test Support - Cucumber Hooks
 *
 * Before/After hooks for scenario setup and teardown.
 */

import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { VitoraWorld } from './world';

let browser: Browser;

/**
 * Global setup - runs once before all tests
 */
BeforeAll(async function () {
  // Launch browser for E2E tests
  browser = await chromium.launch({
    headless: process.env.CI === 'true',
  });

  console.log('🚀 BDD Test Suite Started');
});

/**
 * Global teardown - runs once after all tests
 */
AfterAll(async function () {
  // Close browser
  if (browser) {
    await browser.close();
  }

  console.log('✅ BDD Test Suite Completed');
});

/**
 * Scenario setup - runs before each scenario
 */
Before(async function (this: VitoraWorld) {
  // Reset world state
  this.reset();

  // Create new browser context for isolation
  this.browser = browser;
  this.context = await browser.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3009',
    viewport: { width: 1280, height: 720 },
  });

  // Create new page
  this.page = await this.context.newPage();
});

/**
 * Scenario teardown - runs after each scenario
 */
After(async function (this: VitoraWorld, scenario) {
  // Capture screenshot on failure
  if (scenario.result?.status === Status.FAILED && this.page) {
    const screenshotPath = `reports/screenshots/${scenario.pickle.name.replace(/\s+/g, '-')}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.attach(await this.page.screenshot(), 'image/png');
  }

  // Close page and context
  if (this.page) {
    await this.page.close();
  }
  if (this.context) {
    await this.context.close();
  }
});

/**
 * Tagged hooks for specific scenarios
 */

// Setup for offline scenarios
Before({ tags: '@offline' }, async function (this: VitoraWorld) {
  if (this.context) {
    await this.context.setOffline(true);
  }
});

// Cleanup for offline scenarios
After({ tags: '@offline' }, async function (this: VitoraWorld) {
  if (this.context) {
    await this.context.setOffline(false);
  }
});

// Setup for authenticated scenarios (most scenarios)
Before({ tags: 'not @unauthenticated' }, async function (this: VitoraWorld) {
  // Default user with basic permissions - can be overridden in Given steps
  this.currentUser = {
    id: 1,
    username: 'testuser',
    email: 'test@vitora.health',
    permissions: ['patients.view_patient'],
  };
});

// Setup for smoke tests - use faster timeout
Before({ tags: '@smoke' }, async function (this: VitoraWorld) {
  // Smoke tests should be fast
  this.page?.setDefaultTimeout(10000);
});

// Setup for E2E tests - use longer timeout
Before({ tags: '@e2e' }, async function (this: VitoraWorld) {
  // E2E tests may need more time
  this.page?.setDefaultTimeout(30000);
});

export { browser };

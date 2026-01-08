/**
 * Playwright-BDD Configuration
 * 
 * Separate config for BDD E2E tests using Gherkin feature files.
 * Run with: npx playwright test --config playwright-bdd.config.ts
 */

import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

/**
 * Define BDD test directory from feature files
 */
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: [
    'features/step-definitions/**/*.ts',
    'features/support/*.ts',
  ],
  // Generate step files if missing
  missingSteps: 'fail-on-gen', // Options: 'fail-on-gen' | 'skip-scenario' | 'generate'
});

export default defineConfig({
  testDir,
  
  /* Run tests in files in parallel */
  fullyParallel: true,
  
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Workers - reduce for BDD to avoid race conditions */
  workers: process.env.CI ? 1 : 2,
  
  /* Reporter to use */
  reporter: [
    cucumberReporter('html', { outputFile: 'reports/cucumber/cucumber-report.html' }),
    cucumberReporter('json', { outputFile: 'reports/cucumber/cucumber-report.json' }),
    ['list'],
  ],
  
  /* Shared settings for all the projects below */
  use: {
    /* Base URL for navigation actions */
    baseURL: 'http://localhost:3009',
    
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for BDD tests */
  projects: [
    {
      name: 'bdd-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3009',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results/bdd',

  /* Timeout for each test */
  timeout: 60 * 1000, // BDD tests may need more time

  /* Timeout for each assertion */
  expect: {
    timeout: 10 * 1000,
  },
});

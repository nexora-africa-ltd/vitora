/**
 * Cucumber BDD Configuration
 * 
 * This file configures Cucumber.js for running BDD feature tests.
 * Used alongside Playwright-BDD for E2E tests and Jest-Cucumber for integration tests.
 */

// Set ts-node to use the features-specific tsconfig
process.env.TS_NODE_PROJECT = 'features/tsconfig.json';

module.exports = {
  default: {
    // Feature file locations - all modules included
    paths: ['features/patients/**/*.feature', 'features/pharmacy/**/*.feature', 'features/triage/**/*.feature'],
    
    // Step definitions and support files
    require: [
      'features/step-definitions/**/*.ts',
      'features/support/**/*.ts',
    ],
    
    // TypeScript support with custom config
    requireModule: ['ts-node/register'],
    
    // Output formats
    format: [
      'progress-bar',
      'html:reports/cucumber/cucumber-report.html',
      'json:reports/cucumber/cucumber-report.json',
    ],
    
    // Parallel execution (adjust based on CI resources)
    parallel: process.env.CI ? 2 : 4,
    
    // Fail fast in CI
    failFast: !!process.env.CI,
    
    // Dry run mode (validate without execution)
    dryRun: false,
    
    // Strict mode (fail on pending/undefined steps)
    strict: true,
    
    // Default timeout per step (30 seconds)
    timeout: 30000,
  },
  
  // Smoke tests profile
  smoke: {
    paths: ['features/**/*.feature'],
    require: ['features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    tags: '@smoke',
    format: ['progress-bar', 'html:reports/cucumber/smoke-report.html'],
    parallel: 2,
  },
  
  // Patients module profile
  patients: {
    paths: ['features/patients/**/*.feature'],
    require: ['features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress-bar', 'html:reports/cucumber/patients-report.html'],
  },
  
  // Pharmacy module profile
  pharmacy: {
    paths: ['features/pharmacy/**/*.feature'],
    require: ['features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress-bar', 'html:reports/cucumber/pharmacy-report.html'],
  },
  
  // Triage module profile
  triage: {
    paths: ['features/triage/**/*.feature'],
    require: ['features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress-bar', 'html:reports/cucumber/triage-report.html'],
  },
};

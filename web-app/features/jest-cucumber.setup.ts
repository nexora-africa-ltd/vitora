/**
 * Jest-Cucumber Setup
 * 
 * Configuration and setup for Jest-Cucumber integration tests.
 */

import { setJestCucumberConfiguration } from 'jest-cucumber';

// Configure Jest-Cucumber globally
setJestCucumberConfiguration({
  // Load step definitions automatically
  loadRelativePath: true,
  
  // Error reporting
  errorOnMissingScenariosAndSteps: false, // Set to true after implementing steps
  
  // Tag filtering (can be overridden via env vars)
  tagFilter: process.env.BDD_TAGS || undefined,
  
  // Scenario name filter
  scenarioNameTemplate: (vars) => {
    return `${vars.scenarioTitle}`;
  },
});

// Global test timeout for BDD tests (longer for integration)
jest.setTimeout(30000);

// Console override for cleaner output
if (process.env.BDD_QUIET === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  };
}

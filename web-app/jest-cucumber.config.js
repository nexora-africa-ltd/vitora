/**
 * Jest-Cucumber Configuration
 *
 * Separate Jest config for BDD integration tests using Gherkin feature files.
 * Run with: npm run test:bdd:integration
 */

const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  displayName: 'BDD Integration Tests',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/features/jest-cucumber.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
    '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
    '^@mswjs/interceptors/ClientRequest$': '<rootDir>/node_modules/@mswjs/interceptors/lib/node/interceptors/ClientRequest/index.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(msw|@mswjs)/)/',
  ],
  // Only run jest-cucumber step definition tests
  testMatch: [
    '<rootDir>/features/**/*.steps.ts',
    '<rootDir>/features/**/*.steps.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/.next/',
  ],
  // Coverage for components/lib tested via BDD
  collectCoverageFrom: [
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage/bdd-integration',
};

module.exports = createJestConfig(customJestConfig);

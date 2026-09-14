const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
    '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
    '^@mswjs/interceptors/ClientRequest$':
      '<rootDir>/node_modules/@mswjs/interceptors/lib/node/interceptors/ClientRequest/index.js',
  },
  // MSW v2 delegates to ESM-only bundled modules. Markdown is mocked in setup
  // because transforming its complete unified dependency graph is unnecessary.
  transformIgnorePatterns: ['/node_modules/(?!(msw|@mswjs|@bundled-es-modules|until-async)/)'],
  collectCoverageFrom: [
    // Focus coverage on runtime layers with active unit/integration tests.
    'lib/api/billing.{js,jsx,ts,tsx}',
    'lib/api/client.{js,jsx,ts,tsx}',
    'lib/api/encounters.{js,jsx,ts,tsx}',
    'lib/api/facility-header.{js,jsx,ts,tsx}',
    'lib/api/imaging.{js,jsx,ts,tsx}',
    'lib/api/imaging-calendar.{js,jsx,ts,tsx}',
    'lib/api/inpatient.{js,jsx,ts,tsx}',
    'lib/api/laboratory.{js,jsx,ts,tsx}',
    'lib/api/locations.{js,jsx,ts,tsx}',
    'lib/api/notifications.{js,jsx,ts,tsx}',
    'lib/api/organizations.{js,jsx,ts,tsx}',
    'lib/api/patients.{js,jsx,ts,tsx}',
    'lib/api/pharmacy.{js,jsx,ts,tsx}',
    'lib/api/theatre.{js,jsx,ts,tsx}',
    'lib/api/triage.{js,jsx,ts,tsx}',
    'lib/hooks/billing.{js,jsx,ts,tsx}',
    'lib/hooks/use-allied-health.{js,jsx,ts,tsx}',
    'lib/hooks/use-clinics.{js,jsx,ts,tsx}',
    'lib/hooks/use-counselling.{js,jsx,ts,tsx}',
    'lib/hooks/use-dashboard-stats.{js,jsx,ts,tsx}',
    'lib/hooks/use-debounce.{js,jsx,ts,tsx}',
    'lib/hooks/use-draft-save.{js,jsx,ts,tsx}',
    'lib/hooks/use-encounter-form.{js,jsx,ts,tsx}',
    'lib/hooks/use-imaging.{js,jsx,ts,tsx}',
    'lib/hooks/use-laboratory.{js,jsx,ts,tsx}',
    'lib/hooks/use-locations.{js,jsx,ts,tsx}',
    'lib/hooks/use-nutrition.{js,jsx,ts,tsx}',
    'lib/hooks/use-occupational-therapy.{js,jsx,ts,tsx}',
    'lib/hooks/use-permissions.{js,jsx,ts,tsx}',
    'lib/hooks/use-smart-suggestions.{js,jsx,ts,tsx}',
    'lib/hooks/use-social-work.{js,jsx,ts,tsx}',
    'lib/hooks/use-toast.{js,jsx,ts,tsx}',
    'lib/hooks/use-toast-notification.{js,jsx,ts,tsx}',
    'lib/utils/**/*.{js,jsx,ts,tsx}',
    'lib/context/encounter-context.tsx',
    'lib/context/facility-context.tsx',
    'lib/context/navigation-mode-context.tsx',
    'lib/context/patient-context.tsx',
    'lib/auth/**/*.{js,jsx,ts,tsx}',
    'lib/permissions/**/*.{js,jsx,ts,tsx}',
    // Exclude non-executable declarations and barrels.
    '!lib/schemas/**/*.{js,jsx,ts,tsx}',
    '!lib/types/**/*.{js,jsx,ts,tsx}',
    '!lib/**/index.{js,jsx,ts,tsx}',
    // Exclude integration-heavy modules not exercised in Jest unit suites.
    // Exclude browser/printing or long-tail utility modules not covered in CI Jest suites.
    '!lib/utils/bmi.{js,jsx,ts,tsx}',
    '!lib/utils/kardex-status.{js,jsx,ts,tsx}',
    '!lib/utils/qr.{js,jsx,ts,tsx}',
    '!lib/utils/version-check.{js,jsx,ts,tsx}',
    '!lib/utils/print-invoice.{js,jsx,ts,tsx}',
    '!lib/utils/print-receipt.{js,jsx,ts,tsx}',
    '!lib/utils/obstetric-calculator.{js,jsx,ts,tsx}',
    '!lib/utils/ai-context-sufficiency.{js,jsx,ts,tsx}',
    '!lib/utils/rbac-permissions.{js,jsx,ts,tsx}',
    '!lib/utils/chunk-error-handler.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/__tests__/**/*.spec.[jt]s?(x)'],
  // Exclude E2E tests - run with Playwright separately
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/.next/',
    '/__tests__/mocks/',
    '/__tests__/utils/',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);

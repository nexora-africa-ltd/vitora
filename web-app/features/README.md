# Vitora HMIS - BDD Feature Files

This directory contains Behavior-Driven Development (BDD) Gherkin feature files for the Vitora Hospital Management Information System.

## Directory Structure

```
features/
├── patients/           # Patient registration, OPD, IPD, queue (~280 scenarios)
├── pharmacy/           # Drug catalog, inventory, prescriptions, dispensing (~290 scenarios)
├── triage/             # Triage assessment, categories, alerts (~180 scenarios)
├── step-definitions/   # Step implementation files (to be created)
├── support/            # Hooks, fixtures, utilities (to be created)
└── README.md           # This file
```

## Feature Summary

| Module | Feature Files | Scenarios | Description |
|--------|---------------|-----------|-------------|
| **Patients** | 5 | ~280 | Registration, search, OPD, IPD, queue management |
| **Pharmacy** | 6 | ~290 | Drug catalog, stock, prescriptions, dispensing, alerts |
| **Triage** | 6 | ~180 | Assessment, categories, alerts, queue, thresholds |
| **Total** | 17 | **~750** | |

## Tags Reference

### Module Tags
- `@patients` - Patient module scenarios
- `@pharmacy` - Pharmacy module scenarios
- `@triage` - Triage module scenarios

### Priority Tags
- `@smoke` - Critical path scenarios (run first, ~50 scenarios)
- `@regression` - Full regression suite

### Functional Tags
- `@offline` - Offline functionality
- `@sync` - Data synchronization
- `@validation` - Input validation
- `@audit` - Audit trail scenarios
- `@permissions` - Authorization tests

---

## Cucumber Setup Recommendations

### Option 1: Playwright-BDD (Recommended for E2E)

Best integration with existing Playwright setup. Generates Playwright tests from Gherkin.

**Installation:**
```bash
npm install -D playwright-bdd
```

**Configuration** (`playwright.config.ts`):
```typescript
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'features/step-definitions/**/*.ts',
});

export default defineConfig({
  testDir,
  // ... existing config
});
```

**Usage:**
```bash
npx bddgen                    # Generate test files from features
npx playwright test           # Run all tests
npx playwright test --grep @smoke  # Run smoke tests only
```

---

### Option 2: Jest-Cucumber (Recommended for Component/Integration)

Integrates Gherkin with existing Jest setup for component and integration testing.

**Installation:**
```bash
npm install -D jest-cucumber
```

**Step Definition Example:**
```typescript
// features/step-definitions/patients/registration.steps.ts
import { defineFeature, loadFeature } from 'jest-cucumber';
import { render, screen } from '@testing-library/react';

const feature = loadFeature('features/patients/patient-registration.feature');

defineFeature(feature, (test) => {
  test('Register a new patient with required fields', ({ given, when, then }) => {
    given('I am logged in as a user with "patients.add_patient" permission', () => {
      // Mock authentication
    });
    
    when(/^I fill in the registration form:$/, (table) => {
      // Fill form fields from data table
    });
    
    then('a new patient record should be created', () => {
      // Assert patient creation
    });
  });
});
```

**Jest Config Update** (`jest.config.js`):
```javascript
module.exports = {
  // ... existing config
  testMatch: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/step-definitions/**/*.steps.ts'
  ],
};
```

---

### Option 3: Native Cucumber.js (Traditional Approach)

Standard Cucumber implementation with full feature support.

**Installation:**
```bash
npm install -D @cucumber/cucumber ts-node
```

**Configuration** (`cucumber.js`):
```javascript
module.exports = {
  default: {
    paths: ['features/**/*.feature'],
    require: ['features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: [
      'progress',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json'
    ],
    parallel: 4,
  },
};
```

**Package.json Scripts:**
```json
{
  "scripts": {
    "test:bdd": "cucumber-js",
    "test:bdd:smoke": "cucumber-js --tags @smoke",
    "test:bdd:patients": "cucumber-js --tags @patients",
    "test:bdd:pharmacy": "cucumber-js --tags @pharmacy",
    "test:bdd:triage": "cucumber-js --tags @triage"
  }
}
```

---

## Recommended Hybrid Approach

| Test Type | Tool | Use For | Tags |
|-----------|------|---------|------|
| **E2E/UI** | Playwright-BDD | User journeys, smoke tests | `@smoke`, `@e2e` |
| **Integration** | Jest-Cucumber | API integration, component integration | `@integration` |
| **Unit** | Jest (existing) | Component logic, utilities | N/A |

---

## Step Definitions Structure

```
features/
├── step-definitions/
│   ├── common/
│   │   ├── auth.steps.ts           # Given I am logged in as...
│   │   ├── navigation.steps.ts     # When I am on the... page
│   │   ├── forms.steps.ts          # When I fill in... / I click...
│   │   └── assertions.steps.ts     # Then I should see...
│   ├── patients/
│   │   ├── registration.steps.ts
│   │   ├── search.steps.ts
│   │   ├── opd.steps.ts
│   │   ├── ipd.steps.ts
│   │   └── queue.steps.ts
│   ├── pharmacy/
│   │   ├── catalog.steps.ts
│   │   ├── inventory.steps.ts
│   │   ├── prescription.steps.ts
│   │   ├── dispensing.steps.ts
│   │   └── alerts.steps.ts
│   └── triage/
│       ├── assessment.steps.ts
│       ├── category.steps.ts
│       └── queue.steps.ts
├── support/
│   ├── hooks.ts                    # Before/After hooks
│   ├── world.ts                    # Custom World context
│   ├── fixtures.ts                 # Test data factories
│   └── api-helpers.ts              # API interaction helpers
└── reports/                        # Generated reports (gitignored)
```

---

## Common Step Patterns

### Authentication Steps
```gherkin
Given I am logged in as a user with "patients.add_patient" permission
Given I am logged in as a pharmacist
Given I am logged in as a nurse without prescribing rights
```

### Navigation Steps
```gherkin
Given I am on the patient registration page
When I navigate to the pharmacy dispensing screen
```

### Form Interaction Steps
```gherkin
When I fill in the registration form:
  | field      | value        |
  | First Name | Jane         |
  | Last Name  | Wanjiku      |
When I click "Register Patient"
When I select county "Nairobi"
```

### Assertion Steps
```gherkin
Then I should see a success message "Patient registered successfully"
Then the patient should appear in search results
Then an audit log entry "patient_create" should be recorded
```

---

## CI/CD Integration

### GitHub Actions Example
```yaml
# .github/workflows/bdd-tests.yml
name: BDD Tests

on: [push, pull_request]

jobs:
  bdd:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
        working-directory: web-app
      
      - name: Run smoke tests
        run: npm run test:bdd:smoke
        working-directory: web-app
      
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: cucumber-report
          path: web-app/reports/
```

---

## Best Practices

1. **Tag Strategically**: Use tags for selective test runs
2. **Share Steps**: Extract common patterns to `common/` directory
3. **Data Tables**: Use Gherkin tables for complex inputs
4. **Scenario Outlines**: Use Examples for data-driven tests
5. **Keep Steps Atomic**: One action per step for reusability
6. **Mock External Services**: Use MSW or similar for API mocking
7. **Parallel Execution**: Configure parallel runs for faster feedback

---

## Related Documentation

- [Patients Module README](./patients/README.md)
- [Pharmacy Module README](./pharmacy/README.md)
- [Triage Module README](./triage/README.md)
- [Testing Infrastructure](../../docs/testing-infrastructure.md)

---

## Document Information

| Field | Value |
|-------|-------|
| **Version** | 1.0 |
| **Created** | January 7, 2026 |
| **Status** | Setup Pending |

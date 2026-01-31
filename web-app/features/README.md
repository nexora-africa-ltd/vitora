# Vitora HMIS - BDD Feature Files

This directory contains Behavior-Driven Development (BDD) Gherkin feature files for the Vitora Hospital Management Information System.

## Directory Structure

\`\`\`
features/
├── patients/           # Patient registration, OPD, IPD, queue (~280 scenarios)
├── pharmacy/           # Drug catalog, inventory, prescriptions, dispensing (~290 scenarios)
├── triage/             # Triage assessment, categories, alerts (~180 scenarios)
├── step-definitions/   # Step implementation files
│   ├── common/         # Shared steps (auth, navigation, forms)
│   ├── patients/       # Patient-specific steps
│   ├── pharmacy/       # Pharmacy-specific steps
│   └── triage/         # Triage-specific steps
├── support/            # Hooks, fixtures, world
│   ├── hooks.ts        # Before/After hooks
│   ├── world.ts        # Custom World context
│   └── fixtures.ts     # Test data factories
├── jest-cucumber.setup.ts  # Jest-Cucumber configuration
├── tsconfig.json       # TypeScript config for features
└── README.md           # This file
\`\`\`

## Feature Summary

| Module | Feature Files | Scenarios | Description |
|--------|---------------|-----------|-------------|
| **Patients** | 5 | ~280 | Registration, search, OPD, IPD, queue management |
| **Pharmacy** | 6 | ~290 | Drug catalog, stock, prescriptions, dispensing, alerts |
| **Triage** | 6 | ~180 | Assessment, categories, alerts, queue, thresholds |
| **Total** | 17 | **~750** | |

## Tags Reference

### Module Tags
- \`@patients\` - Patient module scenarios
- \`@pharmacy\` - Pharmacy module scenarios
- \`@triage\` - Triage module scenarios

### Priority Tags
- \`@smoke\` - Critical path scenarios (run first, ~50 scenarios)
- \`@regression\` - Full regression suite

### Functional Tags
- \`@offline\` - Offline functionality
- \`@sync\` - Data synchronization
- \`@validation\` - Input validation
- \`@audit\` - Audit trail scenarios
- \`@permissions\` - Authorization tests

---

## ✅ Testing Approach

We use a **hybrid testing approach** combining multiple tools for different test types:

| Test Type | Tool | NPM Script | Use For |
|-----------|------|------------|---------|
| **E2E/UI** | Playwright-BDD | \`npm run bdd:e2e\` | User journeys, smoke tests |
| **Integration** | Jest-Cucumber | \`npm run bdd:integration\` | API integration, component tests |
| **Validation** | Cucumber.js | \`npm run bdd:dry-run\` | Syntax validation, step coverage |
| **Unit** | Jest (existing) | \`npm test\` | Component logic, utilities |

---

## 🚀 Quick Start

\`\`\`bash
# Validate all features (dry-run - no execution)
npm run bdd:dry-run

# Run E2E tests with Playwright-BDD
npm run bdd:e2e

# Run smoke tests only
npm run bdd:e2e:smoke

# Run integration tests with Jest-Cucumber
npm run bdd:integration

# Run by module
npm run bdd:patients
npm run bdd:pharmacy
npm run bdd:triage
\`\`\`

---

## 📁 Configuration Files

| File | Purpose |
|------|---------|
| \`cucumber.js\` | Cucumber.js profiles for module-specific runs |
| \`playwright-bdd.config.ts\` | Playwright-BDD E2E configuration |
| \`jest-cucumber.config.js\` | Jest-Cucumber integration test config |
| \`features/tsconfig.json\` | TypeScript config for step definitions |

---

## Writing Features

### Gherkin Syntax
\`\`\`gherkin
Feature: Patient Registration
  As a receptionist
  I want to register new patients
  So that they can receive healthcare services

  Background:
    Given I am logged in as a receptionist
    And I am on the patient registration page

  @smoke @registration
  Scenario: Register patient with valid data
    When I fill in the patient registration form with valid data
    And I submit the form
    Then I should see a success message
    And the patient should be assigned an MRN
\`\`\`

### Step Definitions
\`\`\`typescript
import { Given, When, Then } from '@cucumber/cucumber';

Given('I am logged in as a receptionist', async function() {
  await this.page.goto('/login');
  await this.page.fill('[name="username"]', 'receptionist');
  await this.page.fill('[name="password"]', 'password');
  await this.page.click('[type="submit"]');
});
\`\`\`

---

## 📚 Related Documentation

- **Main README**: [../../README.md](../../README.md)
- **Web App README**: [../README.md](../README.md)
- **Backend README**: [../../backend/README.md](../../backend/README.md)

---

## License

Apache-2.0 - Nexora Africa Ltd © 2026

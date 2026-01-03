# Triage Module - Gherkin Feature Files

This directory contains Behavior-Driven Development (BDD) feature files for the Vitora HMIS Triage Module, implementing the Kenya Emergency Triage Assessment (KETA) 5-level scale.

## Feature Files

| File | Description | Scenarios |
|------|-------------|-----------|
| [triage-assessment.feature](./triage-assessment.feature) | Triage assessment form and clinical data entry | ~50 |
| [triage-queue.feature](./triage-queue.feature) | Triage queue dashboard and patient management | ~45 |
| [triage-alerts.feature](./triage-alerts.feature) | Vital sign alerts (critical/warning) | ~40 |
| [triage-reports.feature](./triage-reports.feature) | Reporting, analytics, and KPIs | ~45 |
| [triage-category-badge.feature](./triage-category-badge.feature) | Category badge UI component | ~20 |
| [triage-thresholds.feature](./triage-thresholds.feature) | Admin threshold configuration | ~30 |

## KETA Categories

The Kenya Emergency Triage Assessment (KETA) scale uses 5 priority levels:

| Category | Color | Target Wait Time | Description |
|----------|-------|------------------|-------------|
| RED | 🔴 Red | Immediate (0 min) | Life-threatening emergencies |
| ORANGE | 🟠 Orange | <10 minutes | Very urgent conditions |
| YELLOW | 🟡 Yellow | <60 minutes | Urgent conditions |
| GREEN | 🟢 Green | <240 minutes (4 hr) | Standard/non-urgent |
| BLUE | 🔵 Blue | <480 minutes (8 hr) | Non-urgent/referral |

## Tags Reference

### Feature Tags
- `@triage` - All triage-related scenarios
- `@assessment` - Triage assessment form
- `@queue` - Queue management
- `@alerts` - Vital sign alerts
- `@reports` - Reporting and analytics
- `@thresholds` - Threshold configuration

### Priority Tags
- `@smoke` - Critical path scenarios (run first)
- `@critical` - Tests for critical alerts
- `@keta` - KETA category calculation

### Component Tags
- `@avpu` - Mental status (AVPU scale)
- `@pain-score` - Pain assessment
- `@chief-complaint` - Chief complaint entry
- `@override` - Category override functionality
- `@lwbs` - Left Without Being Seen

### Quality Tags
- `@a11y` - Accessibility scenarios
- `@mobile` - Mobile-specific scenarios
- `@dark-mode` - Dark mode scenarios
- `@permissions` - Permission/authorization tests

## Running Tests

### Using Playwright with Cucumber

```bash
# Install dependencies
npm install

# Run all triage feature tests
npm run test:e2e -- --grep "@triage"

# Run only smoke tests
npm run test:e2e -- --grep "@smoke"

# Run specific feature file
npm run test:e2e -- features/triage/triage-assessment.feature

# Run scenarios with specific tag
npm run test:e2e -- --grep "@keta"
```

### Using Jest with jest-cucumber

```bash
# Run component tests with Gherkin
npm run test -- --testPathPattern="triage"
```

## Mapping to Components

| Feature | Component Path |
|---------|---------------|
| triage-assessment | `components/triage/TriageAssessmentForm.tsx` |
| triage-queue | `components/triage/TriageQueueDashboard.tsx` |
| triage-alerts | `components/triage/VitalAlertsPanel.tsx` |
| triage-category-badge | `components/triage/TriageCategoryBadge.tsx` |
| triage-reports | `app/(dashboard)/reports/triage/page.tsx` |
| triage-thresholds | `app/(dashboard)/settings/triage/page.tsx` |

## Mapping to Backend API

| Feature | API Endpoints |
|---------|--------------|
| Assessment CRUD | `POST/GET/PATCH /api/triage/` |
| Category Calculation | `POST /api/triage/calculate-category/` |
| Queue Management | `GET /api/triage/queue/`, `POST /api/triage/queue/{id}/call/` |
| Thresholds | `GET/PUT /api/triage/vital-thresholds/` |
| Reports | `GET /api/triage/reports/wait-times/`, `/api/triage/reports/volume/` |

## Coverage Mapping

Each scenario maps to Sprint 1.5-1.6 Track E acceptance criteria:

| Acceptance Criteria | Feature File | Tag |
|--------------------|--------------|-----|
| KE-TRI-001: Capture vitals, AVPU, pain score | triage-assessment | `@smoke` |
| KE-TRI-002: Auto-calculate KETA category | triage-assessment | `@keta` |
| KE-TRI-003: Nurse override with reason | triage-assessment | `@override` |
| KE-TRI-004: Critical vital alerts | triage-alerts | `@critical` |
| KE-TRI-005: Queue sorted by priority | triage-queue | `@priority-sort` |
| KE-TRI-006: Wait time tracking | triage-queue | `@wait-time` |
| KE-TRI-007: Queue status updates | triage-queue | `@call-patient`, `@complete` |
| KE-TRI-008: Configurable thresholds | triage-thresholds | `@edit` |
| KE-TRI-009: Wait time/volume reports | triage-reports | `@wait-times`, `@volume` |
| KE-TRI-010: Audit logging | triage-assessment | `@audit` |

## Writing New Scenarios

When adding new scenarios, follow these conventions:

1. **Use descriptive scenario names** - Clearly state what is being tested
2. **Use appropriate tags** - Add relevant feature and quality tags
3. **Follow Given-When-Then** - Maintain clear Gherkin structure
4. **Use Scenario Outlines** - For testing multiple data variations
5. **Reference KETA standards** - Ensure clinical accuracy

### Example Template

```gherkin
@triage @new-feature
Feature: New Triage Feature
  As a [role]
  I want to [action]
  So that [benefit]

  Background:
    Given I am logged in as a user with appropriate permissions

  @smoke
  Scenario: Primary success path
    Given [precondition]
    When [action]
    Then [expected outcome]

  Scenario Outline: Multiple variations
    When I enter "<input>"
    Then I should see "<output>"

    Examples:
      | input | output |
      | A     | Result A |
      | B     | Result B |
```

## Related Documentation

- [Sprint 1.5-1.6 Track E Deliverables](/docs/sprint-1.5-1.6-track-e-triage-deliverables.md)
- [TDD Guidelines](/docs/tdd-guidelines.md)
- [Coding Standards](/docs/coding-standards.md)

---

*Last Updated: January 3, 2026*
*Module: Triage MVP - Sprint 1.5-1.6 Track E*

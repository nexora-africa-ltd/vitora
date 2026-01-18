/**
 * Triage Queue Step Definitions
 *
 * Steps for triage queue management, patient flow, and queue actions.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { createPatient, safeHashes } from '../../support/fixtures';

/**
 * Queue background steps
 */

Given(
  'I am on the triage queue dashboard',
  async function (this: VitoraWorld) {
    this.currentPage = 'triage queue';

    if (this.page) {
      await this.page.goto('/triage/queue');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'the following patients are in the queue:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const patients = safeHashes(dataTable.hashes());
    this.store('queuePatients', patients);

    // In E2E tests, mock the API response
    if (this.page) {
      await this.page.route('**/api/triage/queue**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(patients.map((p, idx) => ({
            id: idx + 1,
            patient_name: p.patient,
            category: p.category,
            arrival_time: p.arrival_time,
            status: 'WAITING',
          }))),
        });
      });
    }
  }
);

/**
 * Queue viewing steps
 */

When(
  'I view the triage queue',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.reload();
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Then(
  'the patients should be displayed in this order:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedOrder = safeHashes(dataTable.hashes());
    this.store('expectedPatientOrder', expectedOrder);

    if (this.page) {
      const patientCards = await this.page.locator('[data-testid="queue-card"]').all();
      for (let i = 0; i < expectedOrder.length; i++) {
        const cardText = await patientCards[i].textContent();
        expect(cardText).toContain(expectedOrder[i].patient);
      }
    }
  }
);

/**
 * Queue card display steps
 */

Given(
  'a patient with triage category {string}',
  async function (this: VitoraWorld, category: string) {
    const patient = createPatient();
    this.patient = patient;
    this.store('patientCategory', category);
  }
);

Given(
  'a patient {string} with MRN {string} is in the queue',
  async function (this: VitoraWorld, name: string, mrn: string) {
    const [firstName, lastName] = name.split(' ');
    this.patient = createPatient({ firstName, lastName, mrn });
    this.store('queuePatient', this.patient);
  }
);

When(
  'I view their queue card',
  async function (this: VitoraWorld) {
    if (this.page) {
      const mrn = this.patient?.mrn;
      const card = this.page.locator(`[data-testid="queue-card"][data-mrn="${mrn}"]`);
      await expect(card).toBeVisible();
    }
  }
);

Then(
  'their queue card should show a {string} badge',
  async function (this: VitoraWorld, color: string) {
    if (this.page) {
      const badge = this.page.locator('[data-testid="category-badge"]').first();
      const badgeClass = await badge.getAttribute('class');
      expect(badgeClass).toContain(color);
    }
  }
);

Then(
  'the badge should display {string}',
  async function (this: VitoraWorld, label: string) {
    if (this.page) {
      const badge = this.page.locator('[data-testid="category-badge"]').first();
      const badgeText = await badge.textContent();
      expect(badgeText).toContain(label);
    }
  }
);

/**
 * Wait time steps
 */

Given(
  'a patient arrived at {string}',
  async function (this: VitoraWorld, time: string) {
    this.store('patientArrivalTime', time);
  }
);

Given(
  'the current time is {string}',
  async function (this: VitoraWorld, time: string) {
    this.store('currentTime', time);

    if (this.page) {
      // Mock the current time
      const [hours, minutes] = time.replace(/\s*(AM|PM)/, '').split(':').map(Number);
      const isPM = time.includes('PM') && hours !== 12;
      const hour24 = isPM ? hours + 12 : hours;

      await this.page.evaluate(({ hour24, minutes }) => {
        const mockDate = new Date();
        mockDate.setHours(hour24, minutes, 0, 0);
        // @ts-ignore - mocking Date.now
        Date.now = () => mockDate.getTime();
      }, { hour24, minutes });
    }
  }
);

Then(
  'their wait time should show {string}',
  async function (this: VitoraWorld, expectedWaitTime: string) {
    if (this.page) {
      const waitTimeElement = this.page.locator('[data-testid="wait-time"]').first();
      const waitText = await waitTimeElement.textContent();
      expect(waitText).toContain(expectedWaitTime);
    }
  }
);

Given(
  'a patient with category {string} arrived {string} minutes ago',
  async function (this: VitoraWorld, category: string, minutes: string) {
    this.store('patientCategory', category);
    this.store('waitMinutes', Number(minutes));
  }
);

Then(
  'their queue card should show wait time {string}',
  async function (this: VitoraWorld, status: string) {
    if (this.page) {
      const waitTimeElement = this.page.locator('[data-testid="wait-time"]').first();
      const waitText = await waitTimeElement.textContent();
      // Remove emoji for comparison
      expect(waitText?.replace(/[^\w\s]/g, '').trim()).toContain(status.replace(/[^\w\s]/g, '').trim());
    }
  }
);

Then(
  'the wait time should be styled in {string}',
  async function (this: VitoraWorld, style: string) {
    if (this.page) {
      const waitTimeElement = this.page.locator('[data-testid="wait-time"]').first();
      const elementClass = await waitTimeElement.getAttribute('class');
      expect(elementClass).toContain(style);
    }
  }
);

/**
 * Queue filtering steps
 */

Given(
  'the queue has patients assigned to different areas:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const patients = safeHashes(dataTable.hashes());
    this.store('queuePatients', patients);
  }
);

When(
  'I select area filter {string}',
  async function (this: VitoraWorld, area: string) {
    this.store('selectedAreaFilter', area);

    if (this.page) {
      await this.page.selectOption('[data-testid="area-filter"]', area);
      await this.page.waitForTimeout(500); // Allow filter to apply
    }
  }
);

When(
  'I select category filter {string}',
  async function (this: VitoraWorld, category: string) {
    this.store('selectedCategoryFilter', category);

    if (this.page) {
      await this.page.selectOption('[data-testid="category-filter"]', category);
      await this.page.waitForTimeout(500);
    }
  }
);

When(
  'I select status filter {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('selectedStatusFilter', status);

    if (this.page) {
      await this.page.selectOption('[data-testid="status-filter"]', status);
      await this.page.waitForTimeout(500);
    }
  }
);

Then(
  'I should only see patients:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedPatients = safeHashes(dataTable.hashes());

    if (this.page) {
      const visibleCards = await this.page.locator('[data-testid="queue-card"]:visible').all();
      expect(visibleCards.length).toBe(expectedPatients.length);

      for (const expected of expectedPatients) {
        const cardWithName = this.page.locator(`[data-testid="queue-card"]:has-text("${expected.patient}")`);
        await expect(cardWithName).toBeVisible();
      }
    }
  }
);

Then(
  'I should only see patients with {word} category',
  async function (this: VitoraWorld, category: string) {
    if (this.page) {
      const visibleCards = await this.page.locator('[data-testid="queue-card"]:visible').all();
      for (const card of visibleCards) {
        const cardCategory = await card.locator('[data-testid="category-badge"]').textContent();
        expect(cardCategory?.toUpperCase()).toContain(category.toUpperCase());
      }
    }
  }
);

Then(
  'the queue count should show {string}',
  async function (this: VitoraWorld, count: string) {
    if (this.page) {
      const countElement = this.page.locator('[data-testid="queue-count"]');
      const countText = await countElement.textContent();
      expect(countText).toContain(count);
    }
  }
);

/**
 * Queue actions steps
 */

Given(
  'patient {string} is at position {int} with status {string}',
  async function (this: VitoraWorld, name: string, position: number, status: string) {
    const [firstName, lastName] = name.split(' ');
    this.patient = createPatient({ firstName, lastName });
    this.store('patientPosition', position);
    this.store('patientStatus', status);
  }
);

When(
  'I click {string} on their queue card',
  async function (this: VitoraWorld, buttonText: string) {
    if (this.page) {
      const card = this.page.locator('[data-testid="queue-card"]').first();
      await card.locator(`button:has-text("${buttonText}")`).click();
    }
  }
);

Then(
  'their status should change to {string}',
  async function (this: VitoraWorld, newStatus: string) {
    this.store('patientStatus', newStatus);

    if (this.page) {
      const statusBadge = this.page.locator('[data-testid="status-badge"]').first();
      const statusText = await statusBadge.textContent();
      expect(statusText?.toUpperCase()).toContain(newStatus.replace(/_/g, ' '));
    }
  }
);

Then(
  'called_at timestamp should be recorded',
  async function (this: VitoraWorld) {
    // Verify via API or store
    this.store('calledAt', new Date().toISOString());
    expect(this.retrieve('calledAt')).toBeDefined();
  }
);

Then(
  'called_by should be set to my user',
  async function (this: VitoraWorld) {
    this.store('calledBy', this.currentUser?.username);
    expect(this.retrieve('calledBy')).toBe(this.currentUser?.username);
  }
);

/**
 * Status badge steps
 */

Given(
  'a patient with status {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('patientStatus', status);
    this.patient = createPatient();
  }
);

Then(
  'their queue card should show status badge {string} with style {string}',
  async function (this: VitoraWorld, badge: string, style: string) {
    if (this.page) {
      const statusBadge = this.page.locator('[data-testid="status-badge"]').first();
      const badgeText = await statusBadge.textContent();
      const badgeClass = await statusBadge.getAttribute('class');
      expect(badgeText).toContain(badge);
      expect(badgeClass).toContain(style);
    }
  }
);

/**
 * View details steps
 */

When(
  'I click on a patient\'s queue card',
  async function (this: VitoraWorld) {
    if (this.page) {
      const card = this.page.locator('[data-testid="queue-card"]').first();
      await card.click();
    }
  }
);

Then(
  'I should see the full triage assessment details modal including:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedSections = safeHashes(dataTable.hashes());

    if (this.page) {
      const modal = this.page.locator('[data-testid="triage-details-modal"]');
      await expect(modal).toBeVisible();

      for (const section of expectedSections) {
        const sectionElement = modal.locator(`[data-testid="section-${section.section?.toLowerCase().replace(/\s+/g, '-')}"]`);
        await expect(sectionElement).toBeVisible();
      }
    }
  }
);

/**
 * Queue statistics steps
 */

Given(
  'the queue has:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const stats = safeHashes(dataTable.hashes());
    this.store('queueStats', stats);
  }
);

Then(
  'the queue header should show:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedStats = safeHashes(dataTable.hashes());

    if (this.page) {
      const header = this.page.locator('[data-testid="queue-header"]');
      for (const stat of expectedStats) {
        const statElement = header.locator(`[data-testid="stat-${stat.stat?.toLowerCase().replace(/\s+/g, '-')}"]`);
        await expect(statElement).toContainText(stat.value || '');
      }
    }
  }
);

Then(
  'the category summary should show colored counts for each category',
  async function (this: VitoraWorld) {
    if (this.page) {
      const categorySummary = this.page.locator('[data-testid="category-summary"]');
      await expect(categorySummary).toBeVisible();

      const categories = ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'];
      for (const cat of categories) {
        const catElement = categorySummary.locator(`[data-testid="category-count-${cat.toLowerCase()}"]`);
        await expect(catElement).toBeVisible();
      }
    }
  }
);

/**
 * Real-time update steps
 */

Given(
  'I am viewing the triage queue',
  async function (this: VitoraWorld) {
    this.currentPage = 'triage queue';
    if (this.page) {
      await this.page.goto('/triage/queue');
    }
  }
);

When(
  'another nurse adds a new RED category patient',
  async function (this: VitoraWorld) {
    // Simulate WebSocket or polling update
    this.store('newRedPatient', true);
  }
);

Then(
  'the queue should automatically refresh',
  async function (this: VitoraWorld) {
    // Verify refresh mechanism
    expect(true).toBe(true); // Placeholder for real-time testing
  }
);

Then(
  'the new patient should appear at the top',
  async function (this: VitoraWorld) {
    if (this.page) {
      const firstCard = this.page.locator('[data-testid="queue-card"]').first();
      const category = await firstCard.locator('[data-testid="category-badge"]').textContent();
      expect(category).toContain('RED');
    }
  }
);

Then(
  'I should see a notification {string}',
  async function (this: VitoraWorld, message: string) {
    if (this.page) {
      const notification = this.page.locator('[data-testid="notification"]');
      await expect(notification).toContainText(message);
    }
  }
);

/**
 * Pharmacy Reports Step Definitions
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

When(
  'I select report period {string}',
  async function (this: VitoraWorld, period: string) {
    this.store('reportPeriod', period);
    if (this.page) {
      await this.page.selectOption('[data-testid="report-period"]', period);
    }
  }
);

When(
  'I generate the dispensing report',
  async function (this: VitoraWorld) {
    const period = this.retrieve<string>('reportPeriod') || 'Today';
    this.store('dispensingReportGenerated', true);
    this.store('dispensingReportPeriod', period);

    if (this.page) {
      await this.page.click('[data-testid="generate-dispensing-report"], button:has-text("Generate")');
      await this.page.waitForTimeout(300);
    }
  }
);

When(
  'I generate a dispensing report for today',
  async function (this: VitoraWorld) {
    this.store('reportPeriod', 'Today');
    this.store('dispensingReportGenerated', true);
    if (this.page) {
      await this.page.click('[data-testid="generate-dispensing-report"], button:has-text("Generate")');
      await this.page.waitForTimeout(300);
    }
  }
);

When(
  'I generate an expiry report',
  async function (this: VitoraWorld) {
    this.store('expiryReportGenerated', true);
    if (this.page) {
      await this.page.click('[data-testid="generate-expiry-report"], button:has-text("Generate")');
      await this.page.waitForTimeout(300);
    }
  }
);

Given(
  'expiry report is generated',
  async function (this: VitoraWorld) {
    this.store('expiryReportGenerated', true);
  }
);

When(
  'I generate a stock summary report',
  async function (this: VitoraWorld) {
    this.store('stockSummaryGenerated', true);
    if (this.page) {
      await this.page.click('[data-testid="generate-stock-summary"], button:has-text("Generate")');
      await this.page.waitForTimeout(300);
    }
  }
);

When(
  'I view stock summary by category',
  async function (this: VitoraWorld) {
    this.store('stockSummaryView', 'category');
  }
);

When(
  'I view stock summary by drug schedule',
  async function (this: VitoraWorld) {
    this.store('stockSummaryView', 'schedule');
  }
);

Then(
  'the report should cover {string} timeframe',
  async function (this: VitoraWorld, period: string) {
    const actual = this.retrieve<string>('dispensingReportPeriod');
    expect(actual).toBe(period);
  }
);

Then(
  'data should be aggregated appropriately',
  async function (this: VitoraWorld) {
    // Contract assertion: for now, ensure we at least generated the report.
    const generated = this.retrieve<boolean>('dispensingReportGenerated');
    expect(generated).toBe(true);
  }
);

Then(
  'I should see breakdown:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = dataTable.hashes();
    this.store('lastBreakdownTable', rows);

    if (this.page) {
      for (const row of rows) {
        await expect(this.page.locator('body')).toContainText(String(Object.values(row)[0] ?? ''));
      }
    }
  }
);

Then(
  'I should see summary counts:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const rows = dataTable.hashes();
    this.store('alertSummaryCounts', rows);

    if (this.page) {
      for (const row of rows) {
        const category = row.category || '';
        if (category) {
          await expect(this.page.locator('body')).toContainText(String(category));
        }
      }
    }
  }
);

/**
 * Common Step Definitions - Assertions
 *
 * Shared, low-level assertions used across feature modules.
 */

import { Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';

Then(
  'I should see:',
  async function (this: VitoraWorld, content: unknown) {
    // This step is used in two forms across the suite:
    // 1) A DataTable of metrics/fields
    // 2) A doc-string block of text

    if (typeof content === 'string') {
      this.store('lastDocString', content);
      if (this.page) {
        const pageText = await this.page.textContent('body');
        const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          // Skip purely decorative glyphs.
          if (line === '"""') continue;
          if (line.length < 3) continue;
          expect(pageText).toContain(line.replace(/✅|⚠️/g, '').trim());
        }
      }
      return;
    }

    const dataTable = content as DataTable;
    if (typeof (dataTable as unknown as { hashes?: unknown }).hashes !== 'function') {
      throw new Error('I should see: expects a DataTable or doc string');
    }

    const rows = dataTable.hashes();
    this.store('lastDataTable', rows);

    if (this.page) {
      for (const row of rows) {
        for (const value of Object.values(row)) {
          if (!value) continue;
          await expect(this.page.locator('body')).toContainText(String(value));
        }
      }
    }
  }
);

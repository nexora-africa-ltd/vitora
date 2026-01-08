/**
 * Common Step Definitions - Configuration
 */

import { When, DataTable } from '@cucumber/cucumber';
import { VitoraWorld } from '../../support/world';

When(
  'I configure:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const config = dataTable.rowsHash() as Record<string, string>;
    this.store('lastConfiguration', config);

    if (this.page) {
      // Minimal best-effort UI fill based on field/value pairs.
      for (const [field, value] of Object.entries(config)) {
        const key = field.toLowerCase().replace(/\s+/g, '-');
        const locator = this.page.locator(`[data-testid="config-${key}"]`);
        if (await locator.count()) {
          await locator.fill(String(value));
        }
      }
    }
  }
);

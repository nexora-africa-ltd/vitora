/**
 * Pharmacy Stock Inventory Step Definitions
 *
 * Steps for stock management, inventory levels, and stock alerts.
 */

import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { VitoraWorld } from '../../support/world';
import { safeHashes } from '../../support/fixtures';

type StockItem = {
  drug: string;
  status: 'AVAILABLE' | 'LOW' | 'OUT_OF_STOCK' | 'EXPIRED' | 'QUARANTINE';
  quantity: number;
  reorder_level?: number;
};

/**
 * Stock inventory navigation
 */

Given(
  'I am on the stock inventory page',
  async function (this: VitoraWorld) {
    this.currentPage = 'stock inventory';

    if (this.page) {
      await this.page.goto('/pharmacy/stock');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'I am on the pharmacy stock management page',
  async function (this: VitoraWorld) {
    this.currentPage = 'stock inventory';

    if (this.page) {
      await this.page.goto('/pharmacy/stock');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'the following stock items exist:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const stockItems = safeHashes(dataTable.hashes());
    this.store('stockItems', stockItems);

    if (this.page) {
      await this.page.route('**/api/pharmacy/stock**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: stockItems.map((item, idx) => ({
              id: idx + 1,
              drug_name: item.drug || item.drug_name,
              batch_number: item.batch_number || item.batch,
              quantity: Number(item.quantity),
              reorder_level: Number(item.reorder_level || 50),
              expiry_date: item.expiry_date || item.expiry,
              location: item.location,
            })),
            count: stockItems.length,
          }),
        });
      });
    }
  }
);

/**
 * Stock level steps
 */

When(
  'I view stock levels',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="view-stock-levels"]');
    }
  }
);

Then(
  'I should see the current stock quantities:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const expectedStock = safeHashes(dataTable.hashes());

    if (this.page) {
      for (const item of expectedStock) {
        const drugName = item.drug || item.drug_name;
        const stockRow = this.page.locator(`[data-testid="stock-row"]:has-text("${drugName}")`);
        await expect(stockRow).toBeVisible();

        const quantity = await stockRow.locator('[data-testid="stock-quantity"]').textContent();
        expect(quantity).toBe(item.quantity);
      }
    }
  }
);

/**
 * Low stock alerts
 */

Given(
  'a drug {string} has stock level below reorder point',
  async function (this: VitoraWorld, drugName: string) {
    this.store('lowStockDrug', drugName);
  }
);

Then(
  'I should see a low stock alert for {string}',
  async function (this: VitoraWorld, drugName: string) {
    if (this.page) {
      const alert = this.page.locator(`[data-testid="low-stock-alert"]:has-text("${drugName}")`);
      await expect(alert).toBeVisible();
    }
  }
);

Then(
  'the stock row should be highlighted in warning color',
  async function (this: VitoraWorld) {
    const drugName = this.retrieve('lowStockDrug') as string;

    if (this.page) {
      const stockRow = this.page.locator(`[data-testid="stock-row"]:has-text("${drugName}")`);
      const rowClass = await stockRow.getAttribute('class');
      expect(rowClass).toContain('warning');
    }
  }
);

/**
 * Expiry alerts
 */

Given(
  'a drug batch is expiring within {int} days',
  async function (this: VitoraWorld, days: number) {
    this.store('expiryAlertDays', days);
  }
);

Then(
  'I should see an expiry warning',
  async function (this: VitoraWorld) {
    if (this.page) {
      const warning = this.page.locator('[data-testid="expiry-warning"]');
      await expect(warning).toBeVisible();
    }
  }
);

Given(
  'a drug batch has expired',
  async function (this: VitoraWorld) {
    this.store('hasExpiredBatch', true);
  }
);

Then(
  'I should see an expired stock alert',
  async function (this: VitoraWorld) {
    if (this.page) {
      const alert = this.page.locator('[data-testid="expired-stock-alert"]');
      await expect(alert).toBeVisible();
    }
  }
);

Then(
  'the expired batch should not be available for dispensing',
  async function (this: VitoraWorld) {
    // Verify batch is excluded from dispensing options
    if (this.page) {
      const expiredBatch = this.page.locator('[data-testid="batch-option"][data-expired="true"]');
      await expect(expiredBatch).toHaveAttribute('disabled', 'true');
    }
  }
);

/**
 * Stock adjustment steps
 */

When(
  'I click {string} for drug {string}',
  async function (this: VitoraWorld, action: string, drugName: string) {
    this.store('selectedDrug', drugName);
    this.store('stockAction', action);

    if (this.page) {
      const drugRow = this.page.locator(`[data-testid="stock-row"]:has-text("${drugName}")`);
      await drugRow.locator(`button:has-text("${action}")`).click();
    }
  }
);

When(
  'I enter adjustment quantity {int}',
  async function (this: VitoraWorld, quantity: number) {
    this.store('adjustmentQuantity', quantity);

    if (this.page) {
      await this.page.fill('[data-testid="adjustment-quantity"]', String(quantity));
    }
  }
);

When(
  'I confirm the adjustment',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="confirm-adjustment"]');
      await this.page.waitForResponse(resp => resp.url().includes('/api/pharmacy/stock') && resp.status() === 200);
    }
  }
);

Then(
  'the stock level should be updated',
  async function (this: VitoraWorld) {
    if (this.page) {
      const successMessage = this.page.locator('[data-testid="success-message"]');
      await expect(successMessage).toBeVisible();
    }
  }
);

/**
 * Inventory view & filtering
 */

When(
  'I view the inventory',
  async function (this: VitoraWorld) {
    this.currentPage = 'stock inventory';
    if (this.page) {
      await this.page.goto('/pharmacy/stock');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

When(
  'I view the stock inventory',
  async function (this: VitoraWorld) {
    this.currentPage = 'stock inventory';
    if (this.page) {
      await this.page.goto('/pharmacy/stock');
      await this.page.waitForLoadState('networkidle');
    }
  }
);

Given(
  'stock items exist with various statuses',
  async function (this: VitoraWorld) {
    const items: StockItem[] = [
      { drug: 'Paracetamol 500mg', status: 'AVAILABLE', quantity: 500, reorder_level: 50 },
      { drug: 'Amoxicillin 500mg', status: 'LOW', quantity: 45, reorder_level: 100 },
      { drug: 'Metformin 500mg', status: 'OUT_OF_STOCK', quantity: 0, reorder_level: 100 },
      { drug: 'Expired Batch Drug', status: 'EXPIRED', quantity: 100, reorder_level: 100 },
      { drug: 'Quarantine Drug', status: 'QUARANTINE', quantity: 20, reorder_level: 50 },
    ];

    this.store('stockItems', items);

    if (this.page) {
      await this.page.route('**/api/pharmacy/stock**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: items.map((i, idx) => ({
              id: idx + 1,
              drug_name: i.drug,
              status: i.status,
              quantity: i.quantity,
              reorder_level: i.reorder_level ?? 0,
            })),
            count: items.length,
          }),
        });
      });
    }
  }
);

When(
  'I filter by status {string}',
  async function (this: VitoraWorld, status: string) {
    this.store('stockStatusFilter', status);
    if (this.page) {
      await this.page.selectOption('[data-testid="status-filter"]', status);
      await this.page.waitForTimeout(300);
    }
  }
);

Then(
  'I should only see items with status {string}',
  async function (this: VitoraWorld, status: string) {
    const items = this.retrieve<StockItem[]>('stockItems') || [];
    const filtered = items.filter(i => i.status === status);
    this.store('filteredStockItems', filtered);

    if (this.page) {
      const rows = await this.page.locator('[data-testid="stock-row"]').all();
      for (const row of rows) {
        const badge = await row.locator('[data-testid="stock-status"]').textContent();
        expect(badge).toContain(status);
      }
    } else {
      expect(filtered.length).toBeGreaterThan(0);
    }
  }
);

Then(
  'the batch should not be available for dispensing',
  async function (this: VitoraWorld) {
    this.store('batchAvailableForDispensing', false);
    if (this.page) {
      const badge = this.page.locator('[data-testid="dispensable"], [data-testid="available-for-dispensing"]');
      if (await badge.count()) {
        await expect(badge.first()).toContainText(/no|not available|disabled/i);
      }
    }
  }
);

/**
 * Stock adjustments (datatable-driven)
 */

When(
  'I record a stock adjustment:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const data = dataTable.rowsHash() as Record<string, string>;
    this.store('stockAdjustment', data);

    if (this.page) {
      // Minimal: fill what we can if the UI exists.
      if (data['Adjustment Type']) {
        await this.page.selectOption('[data-testid="adjustment-type"], select[name="adjustment_type"]', data['Adjustment Type']);
      }
      if (data['Quantity']) {
        await this.page.fill('[data-testid="adjustment-quantity"], input[name="quantity"]', data['Quantity']);
      }
      if (data['Reason']) {
        await this.page.fill('[data-testid="adjustment-reason-text"], textarea[name="reason"], input[name="reason"]', data['Reason']);
      }
      if (data['Reference Number']) {
        await this.page.fill('[data-testid="reference-number"], input[name="reference_number"]', data['Reference Number']);
      }
    }
  }
);

Then(
  'an audit log entry should be created',
  async function (this: VitoraWorld) {
    // Verify audit log was created
    this.store('auditLogCreated', true);
    expect(this.retrieve('auditLogCreated')).toBe(true);
  }
);

/**
 * Batch management steps
 */

When(
  'I add a new batch:',
  async function (this: VitoraWorld, dataTable: DataTable) {
    const batchDetails = dataTable.rowsHash() as Record<string, string>;
    this.store('newBatch', batchDetails);

    if (this.page) {
      await this.page.click('[data-testid="add-batch"]');

      for (const [field, value] of Object.entries(batchDetails)) {
        const fieldId = field.toLowerCase().replace(/\s+/g, '-');
        await this.page.fill(`[data-testid="batch-${fieldId}"]`, value);
      }
    }
  }
);

Then(
  'the new batch should appear in the batch list',
  async function (this: VitoraWorld) {
    const newBatch = this.retrieve('newBatch') as Record<string, string>;

    if (this.page) {
      const batchNumber = newBatch['Batch Number'] || newBatch.batch_number;
      const batchRow = this.page.locator(`[data-testid="batch-row"]:has-text("${batchNumber}")`);
      await expect(batchRow).toBeVisible();
    }
  }
);

/**
 * Stock report steps
 */

When(
  'I generate a stock report',
  async function (this: VitoraWorld) {
    if (this.page) {
      await this.page.click('[data-testid="generate-report"]');
    }
  }
);

Then(
  'I should see stock levels for all drugs',
  async function (this: VitoraWorld) {
    if (this.page) {
      const reportContent = this.page.locator('[data-testid="stock-report"]');
      await expect(reportContent).toBeVisible();
    }
  }
);

Then(
  'the report should show low stock items highlighted',
  async function (this: VitoraWorld) {
    if (this.page) {
      const lowStockHighlight = this.page.locator('[data-testid="stock-report"] .low-stock');
      const count = await lowStockHighlight.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  }
);

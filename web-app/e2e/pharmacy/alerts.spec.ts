/**
 * Stock Alerts E2E Tests
 * 
 * End-to-end tests for stock alert management.
 * Tests should identify missing UI implementations.
 * 
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Backend API Endpoints Tested:
 * - GET /api/pharmacy/alerts/ - List alerts
 * - GET /api/pharmacy/alerts/{id}/ - Get alert details
 * - POST /api/pharmacy/alerts/{id}/acknowledge/ - Acknowledge alert
 * - POST /api/pharmacy/alerts/{id}/resolve/ - Resolve alert
 * - GET /api/pharmacy/alerts/low_stock/ - Get low stock alerts
 * - GET /api/pharmacy/alerts/expiring/ - Get expiring stock alerts
 */
import { test, expect } from '@playwright/test';
import {
  setupPharmacyMocks,
  loginAndGoToPharmacy,
  mockStockAlert,
  mockAlertsData,
} from './fixtures';

// =============================================================================
// ALERTS - PANEL VIEW
// =============================================================================

test.describe('Stock Alerts - Panel View', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
  });

  test('should display alerts tab on pharmacy page', async ({ page }) => {
    const alertsTab = page.getByRole('tab', { name: /alert/i });
    await expect(alertsTab).toBeVisible();
  });

  test('should show unresolved alert count badge', async ({ page }) => {
    // Alert tab should show count of unresolved alerts
    const alertsTab = page.getByRole('tab', { name: /alert/i });
    
    await expect(
      alertsTab.getByText(/\d+/).or(
        alertsTab.locator('[data-testid="alert-count"]')
      )
    ).toBeVisible();
  });

  test('should display alert list', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Wait for alerts to load
    await page.waitForSelector('[data-testid="alerts-panel"], [data-testid="alert-list"]', { timeout: 10000 });

    // Should show alerts
    await expect(page.getByText(/out.of.stock/i)).toBeVisible();
  });

  test('should display alert type', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Alert types should be shown
    await expect(page.getByText(/out.of.stock/i)).toBeVisible();
    await expect(page.getByText(/expiring.soon/i)).toBeVisible();
    await expect(page.getByText(/low.stock/i)).toBeVisible();
  });

  test('should display alert severity', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Severity badges
    await expect(page.getByText(/critical/i).first()).toBeVisible();
    await expect(page.getByText(/high/i)).toBeVisible();
    await expect(page.getByText(/medium/i)).toBeVisible();
  });

  test('should color-code alerts by severity', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Critical alerts should have red/destructive styling
    const criticalAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /critical/i }).first();
    await expect(criticalAlert).toHaveClass(/critical|destructive|red/i);
  });

  test('should display drug name in alert', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Drug name should be shown
    await expect(page.getByText(/metformin/i)).toBeVisible();
    await expect(page.getByText(/paracetamol/i).first()).toBeVisible();
  });

  test('should display alert message', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Alert messages
    await expect(page.getByText(/is.out.of.stock/i)).toBeVisible();
    await expect(page.getByText(/expires.in/i).or(page.getByText(/37.days/i))).toBeVisible();
  });

  test('should display batch number for batch-specific alerts', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Batch-specific alerts should show batch number
    await expect(page.getByText('BATCH-2025-010')).toBeVisible();
  });

  test('should show alert creation timestamp', async ({ page }) => {
    await page.getByRole('tab', { name: /alert/i }).click();
    
    // Should show when alert was created
    await expect(page.getByText(/jan|january|2026/i).first()).toBeVisible();
  });
});

// =============================================================================
// ALERTS - FILTERING
// =============================================================================

test.describe('Stock Alerts - Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should filter by alert type', async ({ page }) => {
    const typeFilter = page.getByRole('combobox', { name: /type/i }).or(
      page.getByLabel(/type/i)
    ).or(
      page.getByTestId('alert-type-filter')
    );
    
    await expect(typeFilter).toBeVisible();
  });

  test('should filter by severity', async ({ page }) => {
    const severityFilter = page.getByRole('combobox', { name: /severity/i }).or(
      page.getByLabel(/severity/i)
    ).or(
      page.getByTestId('severity-filter')
    );
    
    await expect(severityFilter).toBeVisible();
  });

  test('should toggle resolved/unresolved alerts', async ({ page }) => {
    const resolvedToggle = page.getByRole('checkbox', { name: /resolved|show.resolved/i }).or(
      page.getByRole('switch', { name: /resolved/i })
    ).or(
      page.getByTestId('resolved-toggle')
    );
    
    await expect(resolvedToggle).toBeVisible();
  });

  test('should have quick filter for low stock alerts', async ({ page }) => {
    const lowStockFilter = page.getByRole('button', { name: /low.stock/i }).or(
      page.getByTestId('low-stock-filter')
    );
    
    await expect(lowStockFilter).toBeVisible();
  });

  test('should have quick filter for expiring alerts', async ({ page }) => {
    const expiringFilter = page.getByRole('button', { name: /expiring/i }).or(
      page.getByTestId('expiring-filter')
    );
    
    await expect(expiringFilter).toBeVisible();
  });

  test('should filter to show only critical alerts', async ({ page }) => {
    const severityFilter = page.getByRole('combobox', { name: /severity/i }).first();
    await severityFilter.click();
    await page.getByRole('option', { name: /critical/i }).click();
    
    // Should only show critical alerts
    await expect(page.getByText(/critical/i)).toBeVisible();
    await expect(page.getByText(/medium/i)).not.toBeVisible();
  });
});

// =============================================================================
// ALERTS - ACKNOWLEDGE
// =============================================================================

test.describe('Stock Alerts - Acknowledge', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should have acknowledge button for unacknowledged alerts', async ({ page }) => {
    const unacknowledgedAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /out.of.stock/i }).first();
    
    const acknowledgeButton = unacknowledgedAlert.getByRole('button', { name: /acknowledge|ack/i }).or(
      unacknowledgedAlert.getByTestId('acknowledge-button')
    );
    
    await expect(acknowledgeButton).toBeVisible();
  });

  test('should acknowledge alert on click', async ({ page }) => {
    const acknowledgeButton = page.getByRole('button', { name: /acknowledge|ack/i }).first();
    await acknowledgeButton.click();
    
    // Should update alert status
    await expect(page.getByText(/acknowledged/i)).toBeVisible();
  });

  test('should show acknowledged by user', async ({ page }) => {
    // Alert that's already acknowledged
    const acknowledgedAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /low.stock/i });
    
    await expect(acknowledgedAlert.getByText(/acknowledged.*by|admin.user/i)).toBeVisible();
  });

  test('should show acknowledged timestamp', async ({ page }) => {
    const acknowledgedAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /low.stock/i });
    
    // Should show when acknowledged
    await expect(acknowledgedAlert.getByText(/acknowledged.*at|jan.*8/i)).toBeVisible();
  });

  test('should disable acknowledge button for already acknowledged alerts', async ({ page }) => {
    const acknowledgedAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /low.stock/i });
    const acknowledgeButton = acknowledgedAlert.getByRole('button', { name: /acknowledge/i });
    
    // Button should be disabled or not visible
    await expect(acknowledgeButton).not.toBeVisible();
  });
});

// =============================================================================
// ALERTS - RESOLVE
// =============================================================================

test.describe('Stock Alerts - Resolve', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should have resolve button for alerts', async ({ page }) => {
    const alert = page.locator('[data-testid="alert-item"]').first();
    
    const resolveButton = alert.getByRole('button', { name: /resolve/i }).or(
      alert.getByTestId('resolve-button')
    );
    
    await expect(resolveButton).toBeVisible();
  });

  test('should open resolve dialog with notes field', async ({ page }) => {
    const resolveButton = page.getByRole('button', { name: /resolve/i }).first();
    await resolveButton.click();
    
    // Should show dialog with notes
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/notes|resolution/i)).toBeVisible();
  });

  test('should resolve alert with notes', async ({ page }) => {
    const resolveButton = page.getByRole('button', { name: /resolve/i }).first();
    await resolveButton.click();
    
    // Enter resolution notes
    await page.getByLabel(/notes|resolution/i).fill('Stock has been replenished');
    await page.getByRole('button', { name: /confirm|resolve|save/i }).click();
    
    // Should show success
    await expect(page.getByText(/resolved|success/i)).toBeVisible();
  });

  test('should remove resolved alerts from default view', async ({ page }) => {
    const initialAlertCount = await page.locator('[data-testid="alert-item"]').count();
    
    // Resolve an alert
    const resolveButton = page.getByRole('button', { name: /resolve/i }).first();
    await resolveButton.click();
    await page.getByLabel(/notes|resolution/i).fill('Resolved');
    await page.getByRole('button', { name: /confirm|resolve|save/i }).click();
    
    // Wait for update
    await page.waitForTimeout(500);
    
    // Alert count should decrease
    const newAlertCount = await page.locator('[data-testid="alert-item"]').count();
    expect(newAlertCount).toBeLessThan(initialAlertCount);
  });

  test('should show resolved alerts when filter toggled', async ({ page }) => {
    // Toggle to show resolved
    const resolvedToggle = page.getByRole('checkbox', { name: /resolved|show.resolved/i }).or(
      page.getByRole('switch', { name: /resolved/i })
    );
    await resolvedToggle.click();
    
    // Should show resolved alerts
    await expect(page.locator('[data-testid="alert-item"]').filter({ hasText: /resolved/i })).toBeVisible();
  });
});

// =============================================================================
// ALERTS - NAVIGATION
// =============================================================================

test.describe('Stock Alerts - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should navigate to drug when clicking drug name', async ({ page }) => {
    const drugLink = page.getByRole('link', { name: /metformin/i }).or(
      page.locator('[data-testid="alert-item"]').filter({ hasText: /metformin/i }).getByRole('button', { name: /view.drug/i })
    );
    
    await expect(drugLink).toBeVisible();
  });

  test('should navigate to batch when clicking batch number', async ({ page }) => {
    const batchLink = page.getByRole('link', { name: /BATCH-2025-010/i }).or(
      page.locator('[data-testid="alert-item"]').filter({ hasText: /BATCH-2025-010/i }).getByRole('button', { name: /view.batch/i })
    );
    
    await expect(batchLink).toBeVisible();
  });

  test('should have quick action to reorder stock for low stock alerts', async ({ page }) => {
    const lowStockAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /low.stock|out.of.stock/i }).first();
    
    const reorderButton = lowStockAlert.getByRole('button', { name: /reorder|order/i }).or(
      lowStockAlert.getByTestId('reorder-button')
    );
    
    await expect(reorderButton).toBeVisible();
  });

  test('should have quick action to view expiring batches', async ({ page }) => {
    const expiringAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /expiring/i }).first();
    
    const viewBatchButton = expiringAlert.getByRole('button', { name: /view.batch|manage/i }).or(
      expiringAlert.getByTestId('view-batch-button')
    );
    
    await expect(viewBatchButton).toBeVisible();
  });
});

// =============================================================================
// ALERTS - DASHBOARD WIDGET
// =============================================================================

test.describe('Stock Alerts - Dashboard Widget', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
  });

  test('should show critical alerts on pharmacy dashboard', async ({ page }) => {
    await loginAndGoToPharmacy(page);
    
    // Dashboard should show critical alerts widget
    const alertsWidget = page.locator('[data-testid="alerts-widget"]').or(
      page.locator('.alerts-summary')
    );
    
    await expect(alertsWidget).toBeVisible();
  });

  test('should show alert count summary', async ({ page }) => {
    await loginAndGoToPharmacy(page);
    
    // Should show counts by severity or type
    await expect(page.getByText(/\d+.*critical/i).or(page.getByText(/critical.*\d+/i))).toBeVisible();
  });

  test('should link to full alerts view', async ({ page }) => {
    await loginAndGoToPharmacy(page);
    
    const viewAllLink = page.getByRole('link', { name: /view.all|see.all/i }).or(
      page.getByRole('button', { name: /view.all.alerts/i })
    );
    
    await expect(viewAllLink).toBeVisible();
  });
});

// =============================================================================
// ALERTS - AUTO-GENERATION INDICATORS
// =============================================================================

test.describe('Stock Alerts - Auto-Generation', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should indicate auto-generated alerts', async ({ page }) => {
    // Auto-generated alerts should have indicator
    const autoAlert = page.locator('[data-testid="alert-item"]').filter({ hasText: /auto|system/i });
    
    // Some alerts may be auto-generated
    await expect(autoAlert.or(page.getByText(/generated/i))).toBeVisible();
  });

  test('should have refresh alerts button', async ({ page }) => {
    // Manual refresh to regenerate alerts
    const refreshButton = page.getByRole('button', { name: /refresh|regenerate/i }).or(
      page.getByTestId('refresh-alerts-button')
    );
    
    await expect(refreshButton).toBeVisible();
  });

  test('should show last refresh timestamp', async ({ page }) => {
    // When alerts were last checked/generated
    await expect(page.getByText(/last.updated|refreshed/i)).toBeVisible();
  });
});

// =============================================================================
// ALERTS - NOTIFICATION SETTINGS
// =============================================================================

test.describe('Stock Alerts - Settings', () => {
  test.beforeEach(async ({ page }) => {
    await setupPharmacyMocks(page);
    await loginAndGoToPharmacy(page);
    await page.getByRole('tab', { name: /alert/i }).click();
  });

  test('should have alert settings button', async ({ page }) => {
    const settingsButton = page.getByRole('button', { name: /settings|configure/i }).or(
      page.getByTestId('alert-settings-button')
    );
    
    await expect(settingsButton).toBeVisible();
  });

  test('should configure expiry warning days', async ({ page }) => {
    await page.getByRole('button', { name: /settings|configure/i }).first().click();
    
    // Should have configurable expiry warning days
    await expect(page.getByLabel(/expiry.*days|warning.*days/i)).toBeVisible();
  });

  test('should configure low stock threshold', async ({ page }) => {
    await page.getByRole('button', { name: /settings|configure/i }).first().click();
    
    // Should have configurable stock threshold
    await expect(page.getByLabel(/stock.*threshold|reorder.*level/i)).toBeVisible();
  });
});

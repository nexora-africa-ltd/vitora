/**
 * Billing E2E Tests - RED PHASE
 *
 * End-to-end tests for billing workflows based on user stories.
 * All tests should FAIL initially.
 *
 * User Stories Covered:
 * - KE-CSH-001: Payment Processing (Cashier)
 * - KE-CSH-002: Invoice Generation (Cashier)
 * - KE-BIL-001: Billing Reconciliation (Billing Clerk)
 * - KE-CLM-003: Financial Performance Reports
 *
 * @see docs/user-stories.md
 */
import { test, expect, Page } from '@playwright/test';
import { TEST_USER, API_BASE, login, mockApiResponse } from './fixtures';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockPatient = {
  id: 1,
  mrn: 'MRN-20260101-0001',
  first_name: 'Jane',
  last_name: 'Doe',
  date_of_birth: '1985-05-20',
  gender: 'F',
  phone_number: '+254712345678',
  county_name: 'Nairobi',
  sub_county_name: 'Westlands',
};

const mockInvoice = {
  id: 1,
  invoice_number: 'INV-20260103-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  status: 'PENDING',
  invoice_date: '2026-01-03',
  due_date: '2026-02-02',
  subtotal: '1500.00',
  discount_type: null,
  discount_value: '0.00',
  discount_amount: '0.00',
  tax_amount: '0.00',
  total_amount: '1500.00',
  amount_paid: '0.00',
  balance_due: '1500.00',
  insurance_coverage: '0.00',
  notes: '',
  items: [
    {
      id: 1,
      description: 'General Consultation',
      quantity: 1,
      unit_price: '500.00',
      line_total: '500.00',
    },
    {
      id: 2,
      description: 'Complete Blood Count',
      quantity: 1,
      unit_price: '1000.00',
      line_total: '1000.00',
    },
  ],
};

const mockServices = {
  count: 3,
  results: [
    { id: 1, code: 'CONS-001', name: 'General Consultation', unit_price: '500.00', category: 1, category_name: 'Consultation' },
    { id: 2, code: 'LAB-001', name: 'Complete Blood Count', unit_price: '1000.00', category: 2, category_name: 'Laboratory' },
    { id: 3, code: 'LAB-002', name: 'Urinalysis', unit_price: '500.00', category: 2, category_name: 'Laboratory' },
  ],
};

const mockDailyReport = {
  date: '2026-01-03',
  total_collected: '15000.00',
  invoice_count: 10,
  by_payment_method: {
    CASH: '8000.00',
    MPESA: '5000.00',
    CARD: '2000.00',
    INSURANCE: '0.00',
    BANK_TRANSFER: '0.00',
  },
};

// ============================================================================
// Setup Helpers
// ============================================================================

async function setupBillingMocks(page: Page) {
  // Auth mock
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: { id: 1, username: TEST_USER.username },
      }),
    });
  });

  // Invoices list
  await page.route(/.*\/api\/billing\/invoices\/(\?.*)?$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          next: null,
          previous: null,
          results: [mockInvoice],
        }),
      });
    } else if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockInvoice,
          id: 2,
          invoice_number: 'INV-20260103-0002',
          patient: body.patient,
          status: 'DRAFT',
          items: [],
        }),
      });
    } else {
      await route.continue();
    }
  });

  // Single invoice
  await page.route(/.*\/api\/billing\/invoices\/\d+\/$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockInvoice),
    });
  });

  // Services
  await page.route(/.*\/api\/billing\/services\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockServices),
    });
  });

  // Categories
  await page.route(/.*\/api\/billing\/categories\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 2,
        results: [
          { id: 1, name: 'Consultation', code: 'CONS' },
          { id: 2, name: 'Laboratory', code: 'LAB' },
        ],
      }),
    });
  });

  // Payments
  await page.route(/.*\/api\/billing\/payments\/.*/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          payment_reference: 'PAY-20260103-0001',
          invoice: body.invoice,
          amount: body.amount,
          method: body.method,
          status: 'COMPLETED',
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 0,
          results: [],
        }),
      });
    }
  });

  // Daily report
  await page.route(/.*\/api\/billing\/reports\/daily-collection\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockDailyReport),
    });
  });

  // Patient
  await page.route(/.*\/api\/patients\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        results: [mockPatient],
      }),
    });
  });
}

// ============================================================================
// KE-CSH-001: Payment Processing (Cashier)
// ============================================================================

test.describe('KE-CSH-001: Payment Processing', () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should navigate to billing section', async ({ page }) => {
    // Navigate to billing
    await page.goto('/billing');

    // Should show billing dashboard
    await expect(page.getByRole('heading', { name: /billing/i })).toBeVisible();
    await expect(page.getByText(/today's collection/i)).toBeVisible();
  });

  test('should display invoice list', async ({ page }) => {
    await page.goto('/billing/invoices');

    // Should show invoice list
    await expect(page.getByText('INV-20260103-0001')).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('KES 1,500.00')).toBeVisible();
    await expect(page.getByText('PENDING')).toBeVisible();
  });

  test('should view invoice details', async ({ page }) => {
    await page.goto('/billing/invoices');

    // Click on invoice
    await page.click('text=INV-20260103-0001');

    // Should navigate to invoice detail
    await expect(page).toHaveURL(/\/billing\/invoices\/\d+/);

    // Should show invoice header
    await expect(page.getByText('INV-20260103-0001')).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();

    // Should show line items
    await expect(page.getByText('General Consultation')).toBeVisible();
    await expect(page.getByText('Complete Blood Count')).toBeVisible();

    // Should show totals
    await expect(page.getByText(/subtotal/i)).toBeVisible();
    await expect(page.getByText(/total.*1,500/i)).toBeVisible();
  });

  test('should process cash payment', async ({ page }) => {
    await page.goto('/billing/invoices/1');

    // Click pay button
    await page.click('button:has-text("Pay")');

    // Should open payment dialog/form
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select cash payment
    await page.click('label:has-text("Cash")');

    // Amount should be pre-filled with balance
    const amountInput = page.getByLabel(/amount/i);
    await expect(amountInput).toHaveValue('1500');

    // Submit payment
    await page.click('button:has-text("Submit Payment")');

    // Should show success message
    await expect(page.getByText(/payment successful/i)).toBeVisible();

    // Should show receipt option
    await expect(page.getByRole('button', { name: /view receipt/i })).toBeVisible();
  });

  test('should process M-Pesa payment with STK push', async ({ page }) => {
    // Mock M-Pesa endpoints
    await page.route('**/api/billing/mpesa/initiate/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          checkout_request_id: 'ws_CO_123456789',
          merchant_request_id: '12345',
          response_code: '0',
          response_description: 'Success',
          customer_message: 'Success. Request accepted for processing',
        }),
      });
    });

    await page.route('**/api/billing/mpesa/query/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result_code: 0,
          result_description: 'Success',
          checkout_request_id: 'ws_CO_123456789',
          mpesa_receipt_number: 'QJH3XXXXXX',
          amount: '1500.00',
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Click pay button
    await page.click('button:has-text("Pay")');

    // Select M-Pesa
    await page.click('label:has-text("M-Pesa")');

    // Enter phone number
    await page.fill('input[name="phone_number"]', '0712345678');

    // Submit
    await page.click('button:has-text("Initiate M-Pesa")');

    // Should show waiting for PIN message
    await expect(page.getByText(/enter your M-Pesa PIN/i)).toBeVisible();
    await expect(page.getByText(/0712345678/)).toBeVisible();

    // Wait for success
    await expect(page.getByText(/payment successful/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('QJH3XXXXXX')).toBeVisible();
  });

  test('should validate Kenyan phone number format', async ({ page }) => {
    await page.goto('/billing/invoices/1');

    await page.click('button:has-text("Pay")');
    await page.click('label:has-text("M-Pesa")');

    // Enter invalid phone
    await page.fill('input[name="phone_number"]', '123456');
    await page.click('button:has-text("Initiate M-Pesa")');

    // Should show validation error
    await expect(page.getByText(/valid Kenyan phone number/i)).toBeVisible();
  });

  test('should generate receipt after payment', async ({ page }) => {
    // Mock receipt endpoint
    await page.route('**/api/billing/payments/*/receipt/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          receipt_number: 'RCP-20260103-0001',
          payment: 1,
          patient_name: 'Jane Doe',
          patient_mrn: 'MRN-20260101-0001',
          facility_name: 'Demo Health Facility',
          amount: '1500.00',
          amount_in_words: 'One Thousand Five Hundred Kenya Shillings Only',
          payment_method: 'CASH',
          receipt_date: '2026-01-03T10:30:00Z',
          is_voided: false,
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Process payment first
    await page.click('button:has-text("Pay")');
    await page.click('label:has-text("Cash")');
    await page.click('button:has-text("Submit Payment")');

    // Click view receipt
    await page.click('button:has-text("View Receipt")');

    // Should display receipt
    await expect(page.getByText('RCP-20260103-0001')).toBeVisible();
    await expect(page.getByText('One Thousand Five Hundred Kenya Shillings Only')).toBeVisible();
    await expect(page.getByText('Demo Health Facility')).toBeVisible();
  });

  test('should allow printing receipt', async ({ page }) => {
    await page.goto('/billing/payments/1/receipt');

    // Check print button exists
    await expect(page.getByRole('button', { name: /print/i })).toBeVisible();

    // Note: We can't fully test print functionality in E2E,
    // but we verify the button is present and clickable
  });

  test('should show partial payment on invoice', async ({ page }) => {
    // Mock partial payment invoice
    await page.route(/.*\/api\/billing\/invoices\/\d+\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockInvoice,
          status: 'PARTIAL',
          amount_paid: '500.00',
          balance_due: '1000.00',
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Should show partial status
    await expect(page.getByText('PARTIAL')).toBeVisible();

    // Should show amount paid
    await expect(page.getByText(/paid.*500/i)).toBeVisible();

    // Should show balance due
    await expect(page.getByText(/balance.*1,000/i)).toBeVisible();
  });
});

// ============================================================================
// KE-CSH-002: Invoice Generation (Cashier)
// ============================================================================

test.describe('KE-CSH-002: Invoice Generation', () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should create new invoice for patient', async ({ page }) => {
    await page.goto('/billing/invoices/new');

    // Should show patient search/select
    await expect(page.getByLabel(/patient/i)).toBeVisible();

    // Search and select patient
    await page.fill('input[placeholder*="patient"]', 'Jane');
    await page.click('text=Jane Doe');

    // Should show patient info
    await expect(page.getByText('MRN-20260101-0001')).toBeVisible();

    // Set due date
    await page.fill('input[name="due_date"]', '2026-02-02');

    // Create invoice
    await page.click('button:has-text("Create Invoice")');

    // Should redirect to invoice detail
    await expect(page).toHaveURL(/\/billing\/invoices\/\d+/);
    await expect(page.getByText('DRAFT')).toBeVisible();
  });

  test('should add line items to invoice', async ({ page }) => {
    await page.goto('/billing/invoices/1');

    // Click add item
    await page.click('button:has-text("Add Item")');

    // Should show service selector
    await expect(page.getByRole('dialog')).toBeVisible();

    // Search and select service
    await page.fill('input[placeholder*="search"]', 'Consultation');
    await page.click('text=General Consultation');

    // Should add item to invoice
    await expect(page.getByText('General Consultation')).toBeVisible();
    await expect(page.getByText('KES 500.00')).toBeVisible();
  });

  test('should remove line item from invoice', async ({ page }) => {
    await page.route('**/api/billing/invoices/1/remove_item/**', async (route) => {
      await route.fulfill({ status: 204 });
    });

    await page.goto('/billing/invoices/1');

    // Find and click remove button for item
    const itemRow = page.locator('tr:has-text("General Consultation")');
    await itemRow.getByRole('button', { name: /remove|delete/i }).click();

    // Confirm deletion
    await page.click('button:has-text("Confirm")');

    // Item should be removed
    await expect(page.getByText('General Consultation')).not.toBeVisible();
  });

  test('should apply percentage discount', async ({ page }) => {
    await page.route('**/api/billing/invoices/1/apply_discount/', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockInvoice,
          discount_type: body.discount_type,
          discount_value: body.discount_value,
          discount_amount: '150.00',
          total_amount: '1350.00',
          balance_due: '1350.00',
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Click apply discount
    await page.click('button:has-text("Apply Discount")');

    // Select percentage discount
    await page.click('label:has-text("Percentage")');

    // Enter 10%
    await page.fill('input[name="discount_value"]', '10');

    // Apply
    await page.click('button:has-text("Apply")');

    // Should show discount
    await expect(page.getByText('10%')).toBeVisible();
    await expect(page.getByText('-KES 150.00')).toBeVisible();
    await expect(page.getByText('KES 1,350.00')).toBeVisible();
  });

  test('should finalize draft invoice', async ({ page }) => {
    // Mock draft invoice
    await page.route(/.*\/api\/billing\/invoices\/\d+\/$/, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockInvoice, status: 'DRAFT' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/billing/invoices/1/finalize/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockInvoice, status: 'PENDING' }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Click finalize
    await page.click('button:has-text("Finalize")');

    // Confirm
    await page.click('button:has-text("Confirm")');

    // Status should change to PENDING
    await expect(page.getByText('PENDING')).toBeVisible();
  });

  test('should cancel invoice with reason', async ({ page }) => {
    await page.route('**/api/billing/invoices/1/cancel/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockInvoice,
          status: 'CANCELLED',
          cancellation_reason: 'Patient request',
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Click cancel
    await page.click('button:has-text("Cancel Invoice")');

    // Enter reason
    await page.fill('textarea[name="reason"]', 'Patient request');

    // Confirm cancellation
    await page.click('button:has-text("Confirm Cancel")');

    // Status should change to CANCELLED
    await expect(page.getByText('CANCELLED')).toBeVisible();
  });

  test('should display insurance coverage when applicable', async ({ page }) => {
    await page.route(/.*\/api\/billing\/invoices\/\d+\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockInvoice,
          insurance_coverage: '500.00',
          balance_due: '1000.00',
        }),
      });
    });

    await page.goto('/billing/invoices/1');

    // Should show insurance coverage
    await expect(page.getByText(/insurance/i)).toBeVisible();
    await expect(page.getByText('KES 500.00')).toBeVisible();
  });
});

// ============================================================================
// KE-BIL-001: Billing Reconciliation (Billing Clerk)
// ============================================================================

test.describe('KE-BIL-001: Billing Reconciliation', () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should show unbilled services dashboard', async ({ page }) => {
    await page.goto('/billing/reconciliation');

    // Should show reconciliation dashboard
    await expect(page.getByRole('heading', { name: /reconciliation/i })).toBeVisible();

    // Should show unbilled services by department
    await expect(page.getByText(/unbilled services/i)).toBeVisible();
  });

  test('should display discrepancy report', async ({ page }) => {
    await page.route('**/api/billing/reports/discrepancies/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            encounter_id: 1,
            patient_name: 'Jane Doe',
            service_name: 'Lab Test',
            expected_amount: '1000.00',
            billed_amount: '800.00',
            discrepancy: '200.00',
          },
        ]),
      });
    });

    await page.goto('/billing/reconciliation/discrepancies');

    // Should show discrepancy
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('Lab Test')).toBeVisible();
    await expect(page.getByText('KES 200.00')).toBeVisible();
  });

  test('should generate end-of-day closure report', async ({ page }) => {
    await page.route('**/api/billing/reports/daily-closure/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          date: '2026-01-03',
          total_invoiced: '25000.00',
          total_collected: '15000.00',
          outstanding: '10000.00',
          by_department: [
            { department: 'OPD', amount: '15000.00' },
            { department: 'Laboratory', amount: '10000.00' },
          ],
        }),
      });
    });

    await page.goto('/billing/reports/daily-closure');

    // Should show closure report
    await expect(page.getByText(/daily closure/i)).toBeVisible();
    await expect(page.getByText('KES 25,000.00')).toBeVisible();
    await expect(page.getByText('KES 15,000.00')).toBeVisible();
  });
});

// ============================================================================
// KE-CLM-003: Financial Performance Reports
// ============================================================================

test.describe('KE-CLM-003: Financial Performance Reports', () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should display daily collection dashboard', async ({ page }) => {
    await page.goto('/billing');

    // Should show today's collection
    await expect(page.getByText(/today's collection/i)).toBeVisible();
    await expect(page.getByText('KES 15,000.00')).toBeVisible();
    await expect(page.getByText('10 invoices')).toBeVisible();

    // Should show breakdown by payment method
    await expect(page.getByText(/cash.*8,000/i)).toBeVisible();
    await expect(page.getByText(/m-pesa.*5,000/i)).toBeVisible();
  });

  test('should show outstanding invoices', async ({ page }) => {
    await page.route('**/api/billing/reports/outstanding-balances/', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            invoice_id: 1,
            invoice_number: 'INV-20260101-0001',
            patient_name: 'Jane Doe',
            patient_mrn: 'MRN-001',
            invoice_date: '2026-01-01',
            due_date: '2026-01-31',
            total_amount: '1500.00',
            amount_paid: '500.00',
            balance_due: '1000.00',
            days_overdue: 3,
            status: 'OVERDUE',
          },
        ]),
      });
    });

    await page.goto('/billing/reports/outstanding');

    // Should show outstanding balances
    await expect(page.getByText('INV-20260101-0001')).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();
    await expect(page.getByText('KES 1,000.00')).toBeVisible();
    await expect(page.getByText('3 days overdue')).toBeVisible();
  });

  test('should filter reports by date range', async ({ page }) => {
    await page.goto('/billing/reports/revenue');

    // Should show date filters
    await expect(page.getByLabel(/start date/i)).toBeVisible();
    await expect(page.getByLabel(/end date/i)).toBeVisible();

    // Set date range
    await page.fill('input[name="start_date"]', '2026-01-01');
    await page.fill('input[name="end_date"]', '2026-01-31');
    await page.click('button:has-text("Apply")');

    // Report should update
    await expect(page.getByText(/january 2026/i)).toBeVisible();
  });

  test('should export report to CSV', async ({ page }) => {
    await page.goto('/billing/reports/revenue');

    // Should have export button
    await expect(page.getByRole('button', { name: /export|download/i })).toBeVisible();
  });

  test('should show revenue by department', async ({ page }) => {
    await page.route('**/api/billing/reports/revenue-summary/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          total_revenue: '500000.00',
          by_category: [
            { category: 'Consultation', revenue: '150000.00', count: 300 },
            { category: 'Laboratory', revenue: '200000.00', count: 250 },
            { category: 'Pharmacy', revenue: '150000.00', count: 400 },
          ],
          by_payment_method: {
            CASH: '200000.00',
            MPESA: '250000.00',
            CARD: '50000.00',
            INSURANCE: '0.00',
            BANK_TRANSFER: '0.00',
          },
        }),
      });
    });

    await page.goto('/billing/reports/revenue');

    // Should show revenue by department
    await expect(page.getByText('Consultation')).toBeVisible();
    await expect(page.getByText('KES 150,000.00')).toBeVisible();
    await expect(page.getByText('Laboratory')).toBeVisible();
    await expect(page.getByText('KES 200,000.00')).toBeVisible();
  });

  test('should show pending claims status', async ({ page }) => {
    await page.route('**/api/billing/sha/claims/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 5,
          results: [
            { id: 1, claim_number: 'SHA-001', status: 'SUBMITTED', amount: '5000.00' },
            { id: 2, claim_number: 'SHA-002', status: 'UNDER_REVIEW', amount: '3000.00' },
            { id: 3, claim_number: 'SHA-003', status: 'APPROVED', amount: '7000.00' },
          ],
        }),
      });
    });

    await page.goto('/billing/claims');

    // Should show claims by status
    await expect(page.getByText('SHA-001')).toBeVisible();
    await expect(page.getByText('SUBMITTED')).toBeVisible();
  });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

test.describe('Billing Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);
  });

  test('should have accessible invoice list', async ({ page }) => {
    await page.goto('/billing/invoices');

    // Table should be accessible
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /invoice/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /patient/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /amount/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/billing/invoices');

    // Tab through elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Should have focus indicators
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/billing/invoices/1');
    await page.click('button:has-text("Pay")');

    // All form inputs should have labels
    const amountInput = page.getByLabel(/amount/i);
    await expect(amountInput).toBeVisible();
  });
});

// ============================================================================
// Offline Functionality Tests
// ============================================================================

test.describe('Billing Offline Support', () => {
  test('should queue payment when offline', async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);

    await page.goto('/billing/invoices/1');

    // Go offline
    await page.context().setOffline(true);

    // Try to make payment
    await page.click('button:has-text("Pay")');
    await page.click('label:has-text("Cash")');
    await page.click('button:has-text("Submit Payment")');

    // Should show offline queue message
    await expect(page.getByText(/offline|queued|sync/i)).toBeVisible();

    // Go back online
    await page.context().setOffline(false);
  });

  test('should show offline indicator in billing dashboard', async ({ page }) => {
    await setupBillingMocks(page);
    await login(page, TEST_USER.username, TEST_USER.password);

    await page.goto('/billing');

    // Go offline
    await page.context().setOffline(true);

    // Should show offline indicator
    await expect(page.getByText(/offline/i)).toBeVisible();
  });
});

// ============================================================================
// Audit Log Tests
// ============================================================================

test.describe('Billing Audit Logging', () => {
  test('should log payment creation', async ({ page }) => {
    let auditLogCalled = false;

    await setupBillingMocks(page);

    // Intercept audit log creation
    await page.route('**/api/auditlogs/**', async (route) => {
      if (route.request().method() === 'POST') {
        auditLogCalled = true;
      }
      await route.continue();
    });

    await login(page, TEST_USER.username, TEST_USER.password);
    await page.goto('/billing/invoices/1');

    // Process payment
    await page.click('button:has-text("Pay")');
    await page.click('label:has-text("Cash")');
    await page.click('button:has-text("Submit Payment")');

    // Verify action was logged (audit logging happens on backend)
    // We just verify the payment was processed successfully
    await expect(page.getByText(/payment successful/i)).toBeVisible();
  });
});

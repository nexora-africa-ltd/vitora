/**
 * Pharmacy E2E Test Fixtures
 *
 * Shared mock data and helper functions for pharmacy module E2E tests.
 * Based on backend models at hmis/apps/pharmacy/models.py
 *
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */
import { Page } from '@playwright/test';
import { TEST_USER, API_BASE } from '../fixtures';

// =============================================================================
// MOCK DRUGS
// =============================================================================

export const mockDrug = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  code: 'DRG-001',
  generic_name: 'Paracetamol',
  brand_names: ['Panadol', 'Hedex'],
  category: 'ANALGESIC',
  form: 'TABLET',
  strength: '500mg',
  unit: 'tablet',
  schedule: 'OTC',
  requires_prescription: false,
  is_controlled: false,
  is_narcotic: false,
  keml_code: 'KEML-001',
  is_essential: true,
  nhif_code: 'NHIF-001',
  default_reorder_level: 100,
  default_reorder_quantity: 500,
  shelf_life_months: 36,
  storage_requirements: 'Store below 25°C',
  reference_price: '5.00',
  is_active: true,
  current_stock: 450,
  display_name: 'Paracetamol 500mg Tablet',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

export const mockDrugsData = {
  count: 5,
  next: null,
  previous: null,
  results: [
    mockDrug({ id: 1 }),
    mockDrug({
      id: 2,
      code: 'DRG-002',
      generic_name: 'Amoxicillin',
      brand_names: ['Amoxil'],
      category: 'ANTIBIOTIC',
      form: 'CAPSULE',
      strength: '500mg',
      schedule: 'POM',
      requires_prescription: true,
      is_essential: true,
      current_stock: 200,
      display_name: 'Amoxicillin 500mg Capsule',
    }),
    mockDrug({
      id: 3,
      code: 'DRG-003',
      generic_name: 'Artemether-Lumefantrine',
      brand_names: ['Coartem', 'AL'],
      category: 'ANTIMALARIAL',
      form: 'TABLET',
      strength: '20/120mg',
      schedule: 'POM',
      requires_prescription: true,
      is_essential: true,
      current_stock: 150,
      display_name: 'Artemether-Lumefantrine 20/120mg Tablet',
    }),
    mockDrug({
      id: 4,
      code: 'DRG-004',
      generic_name: 'Morphine Sulphate',
      brand_names: ['MST Continus'],
      category: 'CONTROLLED',
      form: 'TABLET',
      strength: '10mg',
      schedule: 'CD',
      requires_prescription: true,
      is_controlled: true,
      is_narcotic: true,
      current_stock: 50,
      display_name: 'Morphine Sulphate 10mg Tablet',
    }),
    mockDrug({
      id: 5,
      code: 'DRG-005',
      generic_name: 'Metformin',
      brand_names: ['Glucophage'],
      category: 'ANTIDIABETIC',
      form: 'TABLET',
      strength: '500mg',
      schedule: 'POM',
      requires_prescription: true,
      current_stock: 0, // Out of stock
      display_name: 'Metformin 500mg Tablet',
    }),
  ],
};

// =============================================================================
// MOCK STOCK BATCHES
// =============================================================================

export const mockStockBatch = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  drug: 1,
  drug_name: 'Paracetamol 500mg Tablet',
  drug_code: 'DRG-001',
  batch_number: 'BATCH-2026-001',
  barcode: '1234567890123',
  quantity_received: 500,
  quantity_available: 450,
  quantity_dispensed: 50,
  quantity_damaged: 0,
  quantity_expired: 0,
  manufacture_date: '2025-06-01',
  expiry_date: '2028-06-01',
  received_date: '2026-01-01',
  cost_price: '3.00',
  selling_price: '5.00',
  supplier: 'Kenya Pharma Supplies',
  purchase_order: 'PO-2026-001',
  received_by: 1,
  received_by_name: 'Admin User',
  status: 'AVAILABLE',
  location: 'Shelf A1',
  days_to_expiry: 880,
  is_expired: false,
  is_low_stock: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

export const mockStockBatchesData = {
  count: 4,
  next: null,
  previous: null,
  results: [
    mockStockBatch({ id: 1 }),
    mockStockBatch({
      id: 2,
      drug: 2,
      drug_name: 'Amoxicillin 500mg Capsule',
      drug_code: 'DRG-002',
      batch_number: 'BATCH-2026-002',
      quantity_received: 300,
      quantity_available: 200,
      quantity_dispensed: 100,
      expiry_date: '2027-01-01',
      days_to_expiry: 357,
      status: 'AVAILABLE',
    }),
    mockStockBatch({
      id: 3,
      drug: 1,
      drug_name: 'Paracetamol 500mg Tablet',
      drug_code: 'DRG-001',
      batch_number: 'BATCH-2025-010',
      quantity_received: 200,
      quantity_available: 50,
      quantity_dispensed: 150,
      expiry_date: '2026-02-15', // Expiring soon
      days_to_expiry: 37,
      status: 'LOW',
      is_low_stock: true,
    }),
    mockStockBatch({
      id: 4,
      drug: 3,
      drug_name: 'Artemether-Lumefantrine 20/120mg Tablet',
      drug_code: 'DRG-003',
      batch_number: 'BATCH-2025-005',
      quantity_received: 100,
      quantity_available: 0,
      quantity_dispensed: 100,
      expiry_date: '2025-12-31', // Expired
      days_to_expiry: -9,
      status: 'EXPIRED',
      is_expired: true,
    }),
  ],
};

// =============================================================================
// MOCK STOCK ALERTS
// =============================================================================

export const mockStockAlert = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  drug: 5,
  drug_name: 'Metformin 500mg Tablet',
  drug_code: 'DRG-005',
  stock_batch: null,
  batch_number: null,
  alert_type: 'OUT_OF_STOCK',
  severity: 'CRITICAL',
  message: 'Metformin 500mg Tablet is out of stock',
  acknowledged: false,
  acknowledged_by: null,
  acknowledged_by_name: null,
  acknowledged_at: null,
  resolved: false,
  resolved_by: null,
  resolved_by_name: null,
  resolved_at: null,
  resolution_notes: null,
  created_at: '2026-01-09T08:00:00Z',
  updated_at: '2026-01-09T08:00:00Z',
  ...overrides,
});

export const mockAlertsData = {
  count: 4,
  next: null,
  previous: null,
  results: [
    mockStockAlert({ id: 1 }),
    mockStockAlert({
      id: 2,
      drug: 1,
      drug_name: 'Paracetamol 500mg Tablet',
      drug_code: 'DRG-001',
      stock_batch: 3,
      batch_number: 'BATCH-2025-010',
      alert_type: 'EXPIRING_SOON',
      severity: 'HIGH',
      message: 'Batch BATCH-2025-010 expires in 37 days',
    }),
    mockStockAlert({
      id: 3,
      drug: 3,
      drug_name: 'Artemether-Lumefantrine 20/120mg Tablet',
      drug_code: 'DRG-003',
      stock_batch: 4,
      batch_number: 'BATCH-2025-005',
      alert_type: 'EXPIRED',
      severity: 'CRITICAL',
      message: 'Batch BATCH-2025-005 has expired',
    }),
    mockStockAlert({
      id: 4,
      drug: 2,
      drug_name: 'Amoxicillin 500mg Capsule',
      drug_code: 'DRG-002',
      alert_type: 'LOW_STOCK',
      severity: 'MEDIUM',
      message: 'Amoxicillin stock below reorder level',
      acknowledged: true,
      acknowledged_by: 1,
      acknowledged_by_name: 'Admin User',
      acknowledged_at: '2026-01-08T10:00:00Z',
    }),
  ],
};

// =============================================================================
// MOCK PRESCRIPTIONS
// =============================================================================

export const mockPrescriptionItem = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  prescription: 1,
  drug: 1,
  drug_name: 'Paracetamol 500mg Tablet',
  drug_code: 'DRG-001',
  quantity_prescribed: 30,
  quantity_dispensed: 0,
  dosage: '2 tablets',
  frequency: 'Three times daily',
  duration: '5 days',
  route: 'Oral',
  instructions: 'Take after meals',
  is_substitutable: true,
  is_cancelled: false,
  cancelled_reason: null,
  remaining_quantity: 30,
  created_at: '2026-01-09T09:00:00Z',
  updated_at: '2026-01-09T09:00:00Z',
  ...overrides,
});

export const mockPrescription = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  prescription_number: 'RX-20260109-0001',
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  encounter: 1,
  prescriber: 1,
  prescriber_name: 'Dr. Test User',
  status: 'PENDING',
  prescribed_date: '2026-01-09',
  valid_until: '2026-02-08',
  clinical_notes: 'Patient presenting with headache and fever',
  cancelled_reason: null,
  cancelled_by: null,
  cancelled_at: null,
  items: [mockPrescriptionItem()],
  is_valid: true,
  is_fully_dispensed: false,
  created_at: '2026-01-09T09:00:00Z',
  updated_at: '2026-01-09T09:00:00Z',
  ...overrides,
});

export const mockPrescriptionsData = {
  count: 3,
  next: null,
  previous: null,
  results: [
    mockPrescription({ id: 1 }),
    mockPrescription({
      id: 2,
      prescription_number: 'RX-20260109-0002',
      patient: 2,
      patient_name: 'John Kamau',
      patient_mrn: 'MRN-20260102-0001',
      status: 'PARTIAL',
      items: [
        mockPrescriptionItem({
          id: 2,
          prescription: 2,
          drug: 2,
          drug_name: 'Amoxicillin 500mg Capsule',
          quantity_prescribed: 21,
          quantity_dispensed: 7,
          remaining_quantity: 14,
        }),
      ],
      is_fully_dispensed: false,
    }),
    mockPrescription({
      id: 3,
      prescription_number: 'RX-20260108-0001',
      patient: 1,
      patient_name: 'Jane Doe',
      patient_mrn: 'MRN-20260101-0001',
      status: 'DISPENSED',
      prescribed_date: '2026-01-08',
      items: [
        mockPrescriptionItem({
          id: 3,
          prescription: 3,
          quantity_prescribed: 20,
          quantity_dispensed: 20,
          remaining_quantity: 0,
        }),
      ],
      is_fully_dispensed: true,
    }),
  ],
};

// =============================================================================
// MOCK DISPENSING
// =============================================================================

export const mockDispensing = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  prescription_item: 1,
  drug: 1,
  drug_name: 'Paracetamol 500mg Tablet',
  drug_code: 'DRG-001',
  stock_batch: 1,
  batch_number: 'BATCH-2026-001',
  quantity: 30,
  patient: 1,
  patient_name: 'Jane Doe',
  patient_mrn: 'MRN-20260101-0001',
  dispensed_by: 1,
  dispensed_by_name: 'Pharmacist User',
  dispensed_at: '2026-01-09T10:00:00Z',
  status: 'COMPLETED',
  unit_price: '5.00',
  total_price: '150.00',
  payment_status: 'PAID',
  verified_by: null,
  verified_by_name: null,
  verified_at: null,
  counseling_notes: 'Advised on dosage timing',
  return_quantity: 0,
  return_reason: null,
  created_at: '2026-01-09T10:00:00Z',
  updated_at: '2026-01-09T10:00:00Z',
  ...overrides,
});

export const mockDispensingData = {
  count: 2,
  next: null,
  previous: null,
  results: [
    mockDispensing({ id: 1 }),
    mockDispensing({
      id: 2,
      prescription_item: 2,
      drug: 2,
      drug_name: 'Amoxicillin 500mg Capsule',
      drug_code: 'DRG-002',
      stock_batch: 2,
      batch_number: 'BATCH-2026-002',
      quantity: 7,
      patient: 2,
      patient_name: 'John Kamau',
      patient_mrn: 'MRN-20260102-0001',
      unit_price: '15.00',
      total_price: '105.00',
    }),
  ],
};

// =============================================================================
// MOCK STOCK ADJUSTMENTS
// =============================================================================

export const mockStockAdjustment = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  batch: 4,
  batch_number: 'BATCH-2025-005',
  drug_name: 'Artemether-Lumefantrine 20/120mg Tablet',
  adjustment_type: 'EXPIRED',
  quantity_change: -100,
  reason: 'Batch expired - disposed according to protocol',
  reference_number: 'ADJ-2026-001',
  adjusted_by: 1,
  adjusted_by_name: 'Pharmacist User',
  adjusted_at: '2026-01-02T08:00:00Z',
  requires_approval: false,
  approved_by: null,
  approved_by_name: null,
  approved_at: null,
  created_at: '2026-01-02T08:00:00Z',
  updated_at: '2026-01-02T08:00:00Z',
  ...overrides,
});

export const mockAdjustmentsData = {
  count: 2,
  next: null,
  previous: null,
  results: [
    mockStockAdjustment({ id: 1 }),
    mockStockAdjustment({
      id: 2,
      batch: 3,
      batch_number: 'BATCH-2025-010',
      drug_name: 'Paracetamol 500mg Tablet',
      adjustment_type: 'DAMAGED',
      quantity_change: -10,
      reason: 'Water damage during storage',
      reference_number: 'ADJ-2026-002',
      requires_approval: true,
      approved_by: 1,
      approved_by_name: 'Admin User',
      approved_at: '2026-01-08T14:00:00Z',
    }),
  ],
};

// =============================================================================
// MOCK REPORTS
// =============================================================================

export const mockStockSummaryReport = {
  results: [
    {
      drug_id: 1,
      drug_name: 'Paracetamol 500mg Tablet',
      total_quantity: 500,
      reorder_level: 100,
      is_below_reorder: false,
      batches: [
        { batch_number: 'BATCH-2026-001', quantity_available: 450, expiry_date: '2028-06-01', days_to_expiry: 880 },
        { batch_number: 'BATCH-2025-010', quantity_available: 50, expiry_date: '2026-02-15', days_to_expiry: 37 },
      ],
    },
    {
      drug_id: 2,
      drug_name: 'Amoxicillin 500mg Capsule',
      total_quantity: 200,
      reorder_level: 100,
      is_below_reorder: false,
      batches: [
        { batch_number: 'BATCH-2026-002', quantity_available: 200, expiry_date: '2027-01-01', days_to_expiry: 357 },
      ],
    },
    {
      drug_id: 5,
      drug_name: 'Metformin 500mg Tablet',
      total_quantity: 0,
      reorder_level: 100,
      is_below_reorder: true,
      batches: [],
    },
  ],
};

export const mockExpiryReport = {
  results: [
    {
      batch_id: 3,
      drug_name: 'Paracetamol 500mg Tablet',
      batch_number: 'BATCH-2025-010',
      expiry_date: '2026-02-15',
      days_to_expiry: 37,
      quantity_available: 50,
      status: 'LOW',
    },
  ],
};

export const mockDispensingReport = {
  results: [
    {
      dispensing_id: 1,
      drug_name: 'Paracetamol 500mg Tablet',
      quantity_dispensed: 30,
      dispensed_date: '2026-01-09',
      patient_name: 'Jane Doe',
      dispensed_by: 'Pharmacist User',
      batch_number: 'BATCH-2026-001',
      total_cost: '150.00',
    },
    {
      dispensing_id: 2,
      drug_name: 'Amoxicillin 500mg Capsule',
      quantity_dispensed: 7,
      dispensed_date: '2026-01-09',
      patient_name: 'John Kamau',
      dispensed_by: 'Pharmacist User',
      batch_number: 'BATCH-2026-002',
      total_cost: '105.00',
    },
  ],
};

export const mockStockMovementReport = {
  results: [
    {
      drug_name: 'Paracetamol 500mg Tablet',
      movement_type: 'RECEIVED',
      quantity: 500,
      date: '2026-01-01',
      reference: 'Batch BATCH-2026-001',
      user: 'Admin User',
    },
    {
      drug_name: 'Paracetamol 500mg Tablet',
      movement_type: 'DISPENSED',
      quantity: -30,
      date: '2026-01-09',
      reference: 'Dispensing #1',
      user: 'Pharmacist User',
    },
    {
      drug_name: 'Artemether-Lumefantrine 20/120mg Tablet',
      movement_type: 'ADJUSTED',
      quantity: -100,
      date: '2026-01-02',
      reference: 'EXPIRED - Batch expired - disposed according to protocol',
      user: 'Pharmacist User',
    },
  ],
};

// =============================================================================
// MOCK PATIENTS (for prescription creation)
// =============================================================================

export const mockPatient = {
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

export const mockPatientsData = {
  count: 2,
  next: null,
  previous: null,
  results: [
    mockPatient,
    {
      id: 2,
      mrn: 'MRN-20260102-0001',
      first_name: 'John',
      last_name: 'Kamau',
      date_of_birth: '1975-03-15',
      gender: 'M',
      phone_number: '+254722345678',
      county_name: 'Nairobi',
      sub_county_name: 'Kasarani',
    },
  ],
};

// =============================================================================
// SETUP HELPERS
// =============================================================================

/**
 * Setup authentication mocks for pharmacy tests
 */
export async function setupAuthMocks(page: Page) {
  await page.route('**/api/token/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access: 'mock-access-token',
        refresh: 'mock-refresh-token',
        user: {
          id: 1,
          username: TEST_USER.username,
          email: 'test@vitora.health',
          first_name: 'Test',
          last_name: 'User',
          permissions: [
            'pharmacy.view_drug',
            'pharmacy.add_drug',
            'pharmacy.change_drug',
            'pharmacy.delete_drug',
            'pharmacy.view_stockbatch',
            'pharmacy.add_stockbatch',
            'pharmacy.view_stockalert',
            'pharmacy.view_prescription',
            'pharmacy.add_prescription',
            'pharmacy.view_dispensing',
            'pharmacy.add_dispensing',
            'pharmacy.view_stockadjustment',
            'pharmacy.add_stockadjustment',
          ],
        },
      }),
    });
  });
}

/**
 * Setup common pharmacy API mocks
 */
export async function setupPharmacyMocks(page: Page) {
  await setupAuthMocks(page);

  // Drugs endpoint
  await page.route('**/api/pharmacy/drugs/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.match(/\/drugs\/\d+\/?$/)) {
        // Single drug
        const id = parseInt(url.match(/\/drugs\/(\d+)/)?.[1] || '1');
        const drug = mockDrugsData.results.find((d) => d.id === id) || mockDrug({ id });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(drug),
        });
      } else {
        // Drug list
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDrugsData),
        });
      }
    } else if (method === 'POST') {
      const postData = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockDrug({ id: 100, ...postData })),
      });
    } else if (method === 'PATCH' || method === 'PUT') {
      const patchData = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDrug(patchData)),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  // Stock batches endpoint
  await page.route('**/api/pharmacy/stock/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      // Handle by-drug filter (either as path segment or query param)
      if (url.includes('by_drug') || url.includes('drug=')) {
        // Return batches for the specified drug in paginated format
        const availableBatches = mockStockBatchesData.results.filter((b) => b.status === 'AVAILABLE');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: availableBatches.length,
            next: null,
            previous: null,
            results: availableBatches,
          }),
        });
      } else if (url.match(/\/stock\/\d+\/?$/)) {
        const id = parseInt(url.match(/\/stock\/(\d+)/)?.[1] || '1');
        const batch = mockStockBatchesData.results.find((b) => b.id === id) || mockStockBatch({ id });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(batch),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockStockBatchesData),
        });
      }
    } else if (method === 'POST') {
      const postData = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(mockStockBatch({ id: 100, ...postData })),
      });
    } else {
      await route.continue();
    }
  });

  // Alerts endpoint
  await page.route('**/api/pharmacy/alerts/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.includes('low_stock')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlertsData.results.filter((a) => a.alert_type === 'LOW_STOCK' || a.alert_type === 'OUT_OF_STOCK')),
        });
      } else if (url.includes('expiring')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlertsData.results.filter((a) => a.alert_type.includes('EXPIR'))),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlertsData),
        });
      }
    } else if (method === 'POST') {
      // Acknowledge or resolve
      const id = parseInt(url.match(/\/alerts\/(\d+)/)?.[1] || '1');
      const alert = mockAlertsData.results.find((a) => a.id === id) || mockStockAlert({ id });
      if (url.includes('acknowledge')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...alert, acknowledged: true, acknowledged_by: 1, acknowledged_by_name: 'Test User' }),
        });
      } else if (url.includes('resolve')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...alert, resolved: true, resolved_by: 1, resolved_by_name: 'Test User' }),
        });
      } else {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });

  // Prescriptions endpoint
  await page.route('**/api/pharmacy/prescriptions/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      if (url.includes('by_patient')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockPrescriptionsData.results.filter((p) => p.patient === 1)),
        });
      } else if (url.match(/\/prescriptions\/\d+\/?$/)) {
        const id = parseInt(url.match(/\/prescriptions\/(\d+)/)?.[1] || '1');
        const rx = mockPrescriptionsData.results.find((p) => p.id === id) || mockPrescription({ id });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rx),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockPrescriptionsData),
        });
      }
    } else if (method === 'POST') {
      if (url.includes('cancel')) {
        const id = parseInt(url.match(/\/prescriptions\/(\d+)/)?.[1] || '1');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockPrescription({ id, status: 'CANCELLED' })),
        });
      } else {
        const postData = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(mockPrescription({ id: 100, ...postData })),
        });
      }
    } else {
      await route.continue();
    }
  });

  // Dispensing endpoint
  await page.route('**/api/pharmacy/dispensings/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDispensingData),
      });
    } else if (method === 'POST') {
      if (url.includes('dispense')) {
        const postData = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([mockDispensing({ ...postData })]),
        });
      } else if (url.includes('return')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDispensing({ status: 'RETURNED' })),
        });
      } else if (url.includes('verify')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockDispensing({ verified_by: 1, verified_by_name: 'Verifier User' })),
        });
      } else {
        await route.continue();
      }
    } else {
      await route.continue();
    }
  });

  // Adjustments endpoint
  await page.route('**/api/pharmacy/adjustments/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAdjustmentsData),
      });
    } else if (method === 'POST') {
      if (url.includes('approve')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockStockAdjustment({ approved_by: 1, approved_by_name: 'Admin User' })),
        });
      } else {
        const postData = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(mockStockAdjustment({ id: 100, ...postData })),
        });
      }
    } else {
      await route.continue();
    }
  });

  // Reports endpoints
  await page.route('**/api/pharmacy/reports/stock-summary/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockStockSummaryReport),
    });
  });

  await page.route('**/api/pharmacy/reports/expiry-report/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockExpiryReport),
    });
  });

  await page.route('**/api/pharmacy/reports/dispensing/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockDispensingReport),
    });
  });

  await page.route('**/api/pharmacy/reports/movement/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockStockMovementReport),
    });
  });

  // Patients endpoint (for prescription creation)
  await page.route('**/api/patients/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/patients\/\d+\/?$/)) {
      const id = parseInt(url.match(/\/patients\/(\d+)/)?.[1] || '1');
      const patient = mockPatientsData.results.find((p) => p.id === id) || mockPatient;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(patient),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockPatientsData),
      });
    }
  });
}

/**
 * Login and navigate to pharmacy page
 */
export async function loginAndGoToPharmacy(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(TEST_USER.username);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();

  // Wait for dashboard
  await page.waitForURL((url) => url.pathname.includes('dashboard') || url.pathname === '/', { timeout: 15000 });

  // Navigate to pharmacy
  await page.goto('/pharmacy');
  await page.waitForLoadState('networkidle');
}

export { TEST_USER, API_BASE };

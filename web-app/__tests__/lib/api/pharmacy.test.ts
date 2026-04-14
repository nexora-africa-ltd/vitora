import { pharmacyApi } from '@/lib/api/pharmacy';
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/schemas/validation', () => ({
  parseResponse: jest.fn((_schema, data) => data),
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockParseResponse = parseResponse as jest.Mock;

describe('pharmacyApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers GET endpoints and result-unwrapping methods', async () => {
    const cases = [
      { fn: () => pharmacyApi.listDrugCategories(), args: ['/api/pharmacy/drug-categories/', { params: { page_size: 500 } }], input: { results: [{ value: 'ANTI', label: 'Antibiotics' }] }, output: [{ value: 'ANTI', label: 'Antibiotics' }] },
      { fn: () => pharmacyApi.listDrugs({ search: 'amo' } as never), args: ['/api/pharmacy/drugs/', { params: { search: 'amo' } }], input: { results: [{ id: 1 }] }, output: { results: [{ id: 1 }] } },
      { fn: () => pharmacyApi.getDrug(1), args: ['/api/pharmacy/drugs/1/'], input: { id: 1 }, output: { id: 1 } },
      { fn: () => pharmacyApi.searchDrugs('amo'), args: ['/api/pharmacy/drugs/', { params: { search: 'amo', page_size: 20 } }], input: { results: [{ id: 1 }] }, output: [{ id: 1 }] },
      { fn: () => pharmacyApi.listStockBatches({ drug: 1 } as never), args: ['/api/pharmacy/stock/', { params: { drug: 1 } }], input: { results: [{ id: 2 }] }, output: { results: [{ id: 2 }] } },
      { fn: () => pharmacyApi.getStockBatch(2), args: ['/api/pharmacy/stock/2/'], input: { id: 2 }, output: { id: 2 } },
      { fn: () => pharmacyApi.getDrugStockBatches(1), args: ['/api/pharmacy/stock/by_drug/', { params: { drug_id: 1 } }], input: [{ id: 2 }], output: [{ id: 2 }] },
      { fn: () => pharmacyApi.listAlerts({ severity: 'HIGH' } as never), args: ['/api/pharmacy/alerts/', { params: { severity: 'HIGH' } }], input: { results: [{ id: 3 }] }, output: { results: [{ id: 3 }] } },
      { fn: () => pharmacyApi.getAlert(3), args: ['/api/pharmacy/alerts/3/'], input: { id: 3 }, output: { id: 3 } },
      { fn: () => pharmacyApi.getLowStockAlerts(), args: ['/api/pharmacy/alerts/low_stock/'], input: [{ id: 3 }], output: [{ id: 3 }] },
      { fn: () => pharmacyApi.getExpiringAlerts(), args: ['/api/pharmacy/alerts/expiring/'], input: [{ id: 4 }], output: [{ id: 4 }] },
      { fn: () => pharmacyApi.listPrescriptions({ patient: 1 } as never), args: ['/api/pharmacy/prescriptions/', { params: { patient: 1 } }], input: { results: [{ id: 5 }] }, output: { results: [{ id: 5 }] } },
      { fn: () => pharmacyApi.getPrescription(5), args: ['/api/pharmacy/prescriptions/5/'], input: { id: 5 }, output: { id: 5 } },
      { fn: () => pharmacyApi.getPatientPrescriptions(1), args: ['/api/pharmacy/prescriptions/', { params: { patient: 1 } }], input: { results: [{ id: 5 }] }, output: [{ id: 5 }] },
      { fn: () => pharmacyApi.getEncounterPrescriptions(10), args: ['/api/pharmacy/prescriptions/', { params: { encounter: 10 } }], input: { results: [{ id: 5 }] }, output: [{ id: 5 }] },
      { fn: () => pharmacyApi.getPendingPrescriptions(), args: ['/api/pharmacy/prescriptions/', { params: { status: 'PENDING', page_size: 100 } }], input: { results: [{ id: 5 }] }, output: [{ id: 5 }] },
      { fn: () => pharmacyApi.listDispensings({ status: 'DISPENSED' } as never), args: ['/api/pharmacy/dispensings/', { params: { status: 'DISPENSED' } }], input: { results: [{ id: 6 }] }, output: { results: [{ id: 6 }] } },
      { fn: () => pharmacyApi.getDispensing(6), args: ['/api/pharmacy/dispensings/6/'], input: { id: 6 }, output: { id: 6 } },
      { fn: () => pharmacyApi.getBatchesForDrug(1), args: ['/api/pharmacy/stock/', { params: { drug: 1, status: 'AVAILABLE', page_size: 100, ordering: 'expiry_date' } }], input: { results: [{ id: 2 }] }, output: [{ id: 2 }] },
      { fn: () => pharmacyApi.listAdjustments({ stock_batch: 2 }), args: ['/api/pharmacy/adjustments/', { params: { stock_batch: 2 } }], input: { results: [{ id: 7 }] }, output: { results: [{ id: 7 }] } },
      { fn: () => pharmacyApi.getStockSummaryReport(), args: ['/api/pharmacy/reports/stock-summary/'], input: { results: [{ id: 8 }] }, output: { results: [{ id: 8 }] } },
      { fn: () => pharmacyApi.getExpiryReport({ days: 30 }), args: ['/api/pharmacy/reports/expiry-report/', { params: { days: 30 } }], input: { results: [{ id: 9 }] }, output: [{ id: 9 }] },
      { fn: () => pharmacyApi.getDispensingReport({ date_from: '2026-03-01' }), args: ['/api/pharmacy/reports/dispensing/', { params: { date_from: '2026-03-01' } }], input: { total: 1 }, output: { total: 1 } },
      { fn: () => pharmacyApi.getStockMovementReport({ date_to: '2026-03-15' }), args: ['/api/pharmacy/reports/movement/', { params: { date_to: '2026-03-15' } }], input: { results: [{ id: 10 }] }, output: { results: [{ id: 10 }] } },
      { fn: () => pharmacyApi.getAlertSettings(), args: ['/api/pharmacy/alert-settings/'], input: { low_stock_threshold: 5 }, output: { low_stock_threshold: 5 } },
      { fn: () => pharmacyApi.hptSearch('paracetamol'), args: ['/api/pharmacy/drugs/hpt-search/', { params: { q: 'paracetamol' } }], input: { count: 1, results: [{ id: 'x' }] }, output: { count: 1, results: [{ id: 'x' }] } },
    ];

    for (const testCase of cases) {
      mockApiClient.get.mockResolvedValueOnce({ data: testCase.input });
      const result = await testCase.fn();
      expect(mockApiClient.get).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual(testCase.output);
    }
  });

  it('covers POST, PATCH, and DELETE endpoints', async () => {
    const cases = [
      { fn: () => pharmacyApi.createDrugCategory({ name: 'Antibiotics' }), method: 'post', args: ['/api/pharmacy/drug-categories/', { name: 'Antibiotics' }], input: { value: 'ANTI', label: 'Antibiotics' }, output: { value: 'ANTI', label: 'Antibiotics' } },
      { fn: () => pharmacyApi.createDrug({ name: 'Amox' } as never), method: 'post', args: ['/api/pharmacy/drugs/', { name: 'Amox' }], input: { id: 1 }, output: { id: 1 } },
      { fn: () => pharmacyApi.updateDrug(1, { name: 'Amox+' } as never), method: 'patch', args: ['/api/pharmacy/drugs/1/', { name: 'Amox+' }], input: { id: 1 }, output: { id: 1 } },
      { fn: () => pharmacyApi.createStockBatch({ drug: 1 } as never), method: 'post', args: ['/api/pharmacy/stock/', { drug: 1 }], input: { id: 2 }, output: { id: 2 } },
      { fn: () => pharmacyApi.updateStockBatch(2, { quantity_received: 50 } as never), method: 'patch', args: ['/api/pharmacy/stock/2/', { quantity_received: 50 }], input: { id: 2 }, output: { id: 2 } },
      { fn: () => pharmacyApi.acknowledgeAlert(3), method: 'post', args: ['/api/pharmacy/alerts/3/acknowledge/'], input: { id: 3 }, output: { id: 3 } },
      { fn: () => pharmacyApi.resolveAlert(3, 'handled'), method: 'post', args: ['/api/pharmacy/alerts/3/resolve/', { notes: 'handled' }], input: { id: 3 }, output: { id: 3 } },
      { fn: () => pharmacyApi.createPrescription({ patient: 1 } as never), method: 'post', args: ['/api/pharmacy/prescriptions/', { patient: 1 }], input: { id: 5 }, output: { id: 5 } },
      { fn: () => pharmacyApi.cancelPrescription(5, 'changed'), method: 'post', args: ['/api/pharmacy/prescriptions/5/cancel/', { reason: 'changed' }], input: { id: 5 }, output: { id: 5 } },
      { fn: () => pharmacyApi.createDispensing({ patient: 1 } as never), method: 'post', args: ['/api/pharmacy/dispensings/', { patient: 1 }], input: { id: 6 }, output: { id: 6 } },
      { fn: () => pharmacyApi.dispenseFromPrescription({ drug_id: 1, quantity: 10, patient_id: 1 }), method: 'post', args: ['/api/pharmacy/dispensings/dispense/', { drug_id: 1, quantity: 10, patient_id: 1 }], input: [{ id: 6 }], output: [{ id: 6 }] },
      { fn: () => pharmacyApi.returnDispensing(6, 2, 'unused'), method: 'post', args: ['/api/pharmacy/dispensings/6/return_stock/', { quantity: 2, reason: 'unused' }], input: { id: 6 }, output: { id: 6 } },
      { fn: () => pharmacyApi.verifyDispensing(6), method: 'post', args: ['/api/pharmacy/dispensings/6/verify/'], input: { id: 6 }, output: { id: 6 } },
      { fn: () => pharmacyApi.createAdjustment({ stock_batch: 2 } as never), method: 'post', args: ['/api/pharmacy/adjustments/', { stock_batch: 2 }], input: { id: 7 }, output: { id: 7 } },
      { fn: () => pharmacyApi.updateAlertSettings({ low_stock_threshold: 5 }), method: 'patch', args: ['/api/pharmacy/alert-settings/', { low_stock_threshold: 5 }], input: { low_stock_threshold: 5 }, output: { low_stock_threshold: 5 } },
      { fn: () => pharmacyApi.mapHpt(1, { hpt_id: 'HPT-1' } as never), method: 'post', args: ['/api/pharmacy/drugs/1/map-hpt/', { hpt_id: 'HPT-1' }], input: { id: 1 }, output: { id: 1 } },
    ];

    for (const testCase of cases) {
      (mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock).mockResolvedValueOnce({ data: testCase.input });
      const result = await testCase.fn();
      expect((mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock)).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual(testCase.output);
    }

    mockApiClient.delete.mockResolvedValueOnce({});
    await pharmacyApi.deleteDrug(1);
    expect(mockApiClient.delete).toHaveBeenCalledWith('/api/pharmacy/drugs/1/');
  });

  it('passes parsed responses through parseResponse with contexts', async () => {
    mockApiClient.get.mockResolvedValue({ data: { results: [] } });
    await pharmacyApi.listDrugs();
    expect(mockParseResponse).toHaveBeenCalledWith(expect.anything(), { results: [] }, { context: 'pharmacyApi.listDrugs' });
  });
});

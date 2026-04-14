import { inpatientApi } from '@/lib/api/inpatient';
import { apiClient } from '@/lib/api/client';
import { parseResponse } from '@/lib/schemas/validation';

jest.mock('@/lib/api/client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
  },
}));

jest.mock('@/lib/schemas/validation', () => ({
  parseResponse: jest.fn((_schema, data) => data),
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockParseResponse = parseResponse as jest.Mock;

describe('inpatientApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers the primary GET endpoints and raw polling endpoints', async () => {
    const cases = [
      { fn: () => inpatientApi.listWards({ ward_type: 'MEDICAL' }), method: 'get', args: ['/api/inpatient/wards/', { params: { ward_type: 'MEDICAL' } }] },
      { fn: () => inpatientApi.getWard(1), method: 'get', args: ['/api/inpatient/wards/1/'] },
      { fn: () => inpatientApi.listBeds({ ward: 1 }), method: 'get', args: ['/api/inpatient/beds/', { params: { ward: 1 } }] },
      { fn: () => inpatientApi.getAdmissionRecommendation(1), method: 'get', args: ['/api/inpatient/admission-recommendations/1/'] },
      { fn: () => inpatientApi.listAdmissionRecommendations({ status: 'PENDING' } as never), method: 'get', args: ['/api/inpatient/admission-recommendations/', { params: { status: 'PENDING' } }] },
      { fn: () => inpatientApi.listAdmissions({ patient: 1 } as never), method: 'get', args: ['/api/inpatient/admissions/', { params: { patient: 1 } }] },
      { fn: () => inpatientApi.getAdmission(1), method: 'get', args: ['/api/inpatient/admissions/1/'] },
      { fn: () => inpatientApi.listDischarges({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/discharges/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getDischarge(1), method: 'get', args: ['/api/inpatient/discharges/1/'] },
      { fn: () => inpatientApi.listTransfers({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/transfers/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getTransfer(1), method: 'get', args: ['/api/inpatient/transfers/1/'] },
      { fn: () => inpatientApi.listWardRounds({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/ward-rounds/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getWardRound(1), method: 'get', args: ['/api/inpatient/ward-rounds/1/'] },
      { fn: () => inpatientApi.listReviewRequests({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/review-requests/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getReviewRequest(1), method: 'get', args: ['/api/inpatient/review-requests/1/'] },
      { fn: () => inpatientApi.listKardex({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/kardex/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getKardex(1), method: 'get', args: ['/api/inpatient/kardex/1/'] },
      { fn: () => inpatientApi.listShiftHandovers({ admission: 1 } as never), method: 'get', args: ['/api/inpatient/shift-handovers/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getShiftHandover(1), method: 'get', args: ['/api/inpatient/shift-handovers/1/'] },
      { fn: () => inpatientApi.getWardUpdates(1, '2026-03-15T10:00:00Z'), method: 'get', args: ['/api/inpatient/wards/1/updates/', { params: { since: '2026-03-15T10:00:00Z' } }] , raw: true},
      { fn: () => inpatientApi.getSupervisorAlerts('2026-03-15T10:00:00Z', 5), method: 'get', args: ['/api/inpatient/supervisor/alerts/', { params: { since: '2026-03-15T10:00:00Z', limit: 5 } }] , raw: true},
      { fn: () => inpatientApi.getAdmissionOrders(1), method: 'get', args: ['/api/inpatient/admissions/1/orders/'], raw: true },
      { fn: () => inpatientApi.getAdmissionLabOrders(1), method: 'get', args: ['/api/inpatient/admissions/1/lab-orders/'], raw: true },
      { fn: () => inpatientApi.getAdmissionImagingOrders(1), method: 'get', args: ['/api/inpatient/admissions/1/imaging-orders/'], raw: true },
      { fn: () => inpatientApi.getAdmissionPrescriptions(1), method: 'get', args: ['/api/inpatient/admissions/1/prescriptions/'], raw: true },
      { fn: () => inpatientApi.getAdmissionConsumableUsage(1), method: 'get', args: ['/api/inpatient/admissions/1/consumable-usage/'] },
      { fn: () => inpatientApi.getConstraintOverrideMetrics(7), method: 'get', args: ['/api/inpatient/supervisor/alerts/metrics/', { params: { days: 7 } }], raw: true },
      { fn: () => inpatientApi.listTemperatureReadings({ admission: 1 }), method: 'get', args: ['/api/inpatient/temperature-readings/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.listFluidBalanceSheets({ admission: 1 }), method: 'get', args: ['/api/inpatient/fluid-balance-sheets/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getFluidBalanceSheet(1), method: 'get', args: ['/api/inpatient/fluid-balance-sheets/1/'] },
      { fn: () => inpatientApi.listFluidBalanceEntries({ fluid_balance_sheet: 1 }), method: 'get', args: ['/api/inpatient/fluid-balance-entries/', { params: { fluid_balance_sheet: 1 } }] },
      { fn: () => inpatientApi.listBloodTransfusions({ admission: 1 }), method: 'get', args: ['/api/inpatient/blood-transfusions/', { params: { admission: 1 } }] },
      { fn: () => inpatientApi.getBloodTransfusion(1), method: 'get', args: ['/api/inpatient/blood-transfusions/1/'] },
      { fn: () => inpatientApi.listBPReadings({ admission: 1 }), method: 'get', args: ['/api/inpatient/bp-readings/', { params: { admission: 1 } }] },
    ];

    for (const testCase of cases) {
      const data = testCase.raw ? { ok: true } : { results: [{ id: 1 }] };
      (mockApiClient[testCase.method as 'get'] as jest.Mock).mockResolvedValueOnce({ data });
      const result = await testCase.fn();
      expect((mockApiClient[testCase.method as 'get'] as jest.Mock)).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual(data);
    }
  });

  it('handles listWardBeds paginated and array responses plus getKardexByAdmission null fallback', async () => {
    mockApiClient.get
      .mockResolvedValueOnce({ data: { count: 1, results: [{ id: 1 }] } })
      .mockResolvedValueOnce({ data: [{ id: 2 }] })
      .mockResolvedValueOnce({ data: { count: 1, results: [{ id: 3 }] } })
      .mockResolvedValueOnce({ data: { count: 0, results: [] } });

    expect(await inpatientApi.listWardBeds(1, { status: 'AVAILABLE' } as never)).toEqual({ count: 1, results: [{ id: 1 }] });
    expect(mockApiClient.get).toHaveBeenNthCalledWith(1, '/api/inpatient/wards/1/beds/', { params: { status: 'AVAILABLE' } });
    expect(await inpatientApi.listWardBeds(2)).toEqual([{ id: 2 }]);
    expect(await inpatientApi.getKardexByAdmission(1)).toEqual({ id: 3 });
    expect(await inpatientApi.getKardexByAdmission(2)).toBeNull();
  });

  it('covers the primary POST and PATCH endpoints', async () => {
    const cases = [
      { fn: () => inpatientApi.updateWard(1, { name: 'Updated' } as never), method: 'patch', args: ['/api/inpatient/wards/1/', { name: 'Updated' }] },
      { fn: () => inpatientApi.generateWardBeds(1), method: 'post', args: ['/api/inpatient/wards/1/generate_beds/'], raw: true },
      { fn: () => inpatientApi.updateBed(1, { status: 'OCCUPIED' } as never), method: 'patch', args: ['/api/inpatient/beds/1/', { status: 'OCCUPIED' }] },
      { fn: () => inpatientApi.createAdmissionRecommendation({ reason: 'Test' } as never), method: 'post', args: ['/api/inpatient/admission-recommendations/', { reason: 'Test' }] },
      { fn: () => inpatientApi.acceptAdmissionRecommendation(1, 2), method: 'post', args: ['/api/inpatient/admission-recommendations/1/accept/', { user: 2 }] },
      { fn: () => inpatientApi.declineAdmissionRecommendation(1, 2, 'No bed'), method: 'post', args: ['/api/inpatient/admission-recommendations/1/decline/', { user: 2, reason: 'No bed' }] },
      { fn: () => inpatientApi.createAdmission({ patient: 1 } as never), method: 'post', args: ['/api/inpatient/admissions/', { patient: 1 }] },
      { fn: () => inpatientApi.updateAdmission(1, { admission_status: 'ACTIVE' } as never), method: 'patch', args: ['/api/inpatient/admissions/1/', { admission_status: 'ACTIVE' }] },
      { fn: () => inpatientApi.createDischarge({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/discharges/', { admission: 1 }] },
      { fn: () => inpatientApi.updateDischarge(1, { disposition: 'HOME' } as never), method: 'patch', args: ['/api/inpatient/discharges/1/', { disposition: 'HOME' }] },
      { fn: () => inpatientApi.createTransfer({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/transfers/', { admission: 1 }] },
      { fn: () => inpatientApi.createWardRound({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/ward-rounds/', { admission: 1 }] },
      { fn: () => inpatientApi.updateWardRound(1, { notes: 'ok' } as never), method: 'patch', args: ['/api/inpatient/ward-rounds/1/', { notes: 'ok' }] },
      { fn: () => inpatientApi.createReviewRequest({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/review-requests/', { admission: 1 }] },
      { fn: () => inpatientApi.acknowledgeReviewRequest(1), method: 'post', args: ['/api/inpatient/review-requests/1/acknowledge/'] },
      { fn: () => inpatientApi.completeReviewRequest(1), method: 'post', args: ['/api/inpatient/review-requests/1/complete/'] },
      { fn: () => inpatientApi.cancelReviewRequest(1, 'done'), method: 'post', args: ['/api/inpatient/review-requests/1/cancel/', { reason: 'done' }] },
      { fn: () => inpatientApi.updateKardex(1, { diagnosis: 'Dx' } as never), method: 'patch', args: ['/api/inpatient/kardex/1/', { diagnosis: 'Dx' }] },
      { fn: () => inpatientApi.addKardexShiftNote(1, { note: 'shift' } as never), method: 'post', args: ['/api/inpatient/kardex/1/add-shift-note/', { note: 'shift' }] },
      { fn: () => inpatientApi.addKardexHandoverNote(1, { note: 'handover' } as never), method: 'post', args: ['/api/inpatient/kardex/1/add-handover-note/', { note: 'handover' }] },
      { fn: () => inpatientApi.addCarePlanEntry(1, { problem: 'Pain' } as never), method: 'post', args: ['/api/inpatient/kardex/1/add-care-plan-entry/', { problem: 'Pain' }] },
      { fn: () => inpatientApi.updateCarePlanEntry(1, 2, { status: 'DONE' } as never), method: 'patch', args: ['/api/inpatient/kardex/1/update-care-plan-entry/2/', { status: 'DONE' }] },
      { fn: () => inpatientApi.createShiftHandover({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/shift-handovers/', { admission: 1 }] },
      { fn: () => inpatientApi.acknowledgeShiftHandover(1), method: 'post', args: ['/api/inpatient/shift-handovers/1/acknowledge/'] },
      { fn: () => inpatientApi.autoPopulateShiftHandover(1), method: 'post', args: ['/api/inpatient/shift-handovers/1/auto-populate/'] },
      { fn: () => inpatientApi.checkWardCompatibility(1, 2, true), method: 'post', args: ['/api/inpatient/wards/1/check_compatibility/', { patient_id: 2, requires_isolation: true, requires_oxygen: false, requires_ventilator: false }] },
      { fn: () => inpatientApi.bulkCheckCompatibility([1, 2], [true, false]), method: 'post', args: ['/api/inpatient/wards/bulk_check_compatibility/', { patient_ids: [1, 2], requires_isolation: [true, false] }] },
      { fn: () => inpatientApi.recordAdmissionConsumableUsage(1, { stock_batch: 9 } as never), method: 'post', args: ['/api/inpatient/admissions/1/record-consumable-usage/', { stock_batch: 9 }] },
      { fn: () => inpatientApi.reverseAdmissionConsumableUsage(1, 2, { reason: 'undo' } as never), method: 'post', args: ['/api/inpatient/admissions/1/reverse-consumable-usage/2/', { reason: 'undo' }] },
      { fn: () => inpatientApi.acknowledgeAlert({ alert_id: 'a1' } as never), method: 'post', args: ['/api/inpatient/supervisor/alerts/acknowledge/', { alert_id: 'a1' }], raw: true },
      { fn: () => inpatientApi.createTemperatureReading({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/temperature-readings/', { admission: 1 }] },
      { fn: () => inpatientApi.createFluidBalanceSheet({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/fluid-balance-sheets/', { admission: 1 }] },
      { fn: () => inpatientApi.updateFluidBalanceSheet(1, { chart_date: '2026-03-15' } as never), method: 'patch', args: ['/api/inpatient/fluid-balance-sheets/1/', { chart_date: '2026-03-15' }] },
      { fn: () => inpatientApi.createFluidBalanceEntry({ fluid_balance_sheet: 1 } as never), method: 'post', args: ['/api/inpatient/fluid-balance-entries/', { fluid_balance_sheet: 1 }] },
      { fn: () => inpatientApi.createBloodTransfusion({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/blood-transfusions/', { admission: 1 }] },
      { fn: () => inpatientApi.addTransfusionObservation(1, { temperature: 37.2 } as never), method: 'post', args: ['/api/inpatient/blood-transfusions/1/add-observation/', { temperature: 37.2 }] },
      { fn: () => inpatientApi.markTransfusionReaction(1, { reaction_type: 'FEVER' }), method: 'post', args: ['/api/inpatient/blood-transfusions/1/mark-reaction/', { reaction_type: 'FEVER' }] },
      { fn: () => inpatientApi.completeTransfusion(1, { time_ended: '12:00' }), method: 'post', args: ['/api/inpatient/blood-transfusions/1/complete/', { time_ended: '12:00' }] },
      { fn: () => inpatientApi.createBPReading({ admission: 1 } as never), method: 'post', args: ['/api/inpatient/bp-readings/', { admission: 1 }] },
    ];

    for (const testCase of cases) {
      const data = testCase.raw ? { ok: true } : { id: 1 };
      (mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock).mockResolvedValueOnce({ data });
      const result = await testCase.fn();
      expect((mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock)).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual(data);
    }
  });

  it('passes every parsed response through parseResponse with a context', async () => {
    mockApiClient.get.mockResolvedValue({ data: { results: [] } });
    await inpatientApi.listWards();
    expect(mockParseResponse).toHaveBeenCalledWith(expect.anything(), { results: [] }, { context: 'inpatientApi.listWards' });
  });
});

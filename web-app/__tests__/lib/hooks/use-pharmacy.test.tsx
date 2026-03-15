import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAcknowledgeAlert,
  useAlertSettings,
  useBatchesForDrug,
  useCancelPrescription,
  useCreateDispensing,
  useCreateDrug,
  useCreatePrescription,
  useCreateStockAdjustment,
  useCreateStockBatch,
  useDeleteDrug,
  useDispenseFromPrescription,
  useDispensing,
  useDispensings,
  useDispensingReport,
  useDrug,
  useDrugs,
  useDrugSearch,
  useDrugStockBatches,
  useEncounterPrescriptions,
  useExpiryReport,
  useExpiringAlerts,
  useLowStockAlerts,
  usePatientPrescriptions,
  usePendingPrescriptions,
  usePrescription,
  usePrescriptions,
  useResolveAlert,
  useReturnDispensing,
  useReturnStock,
  useStockAdjustments,
  useStockAlerts,
  useStockBatch,
  useStockBatches,
  useStockMovementReport,
  useStockSummaryReport,
  useUpdateAlertSettings,
  useUpdateDrug,
  useUpdateStockBatch,
  useVerifyDispensing,
} from '@/lib/hooks/use-pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';

jest.mock('@/lib/api/pharmacy', () => ({
  pharmacyApi: {
    listDrugs: jest.fn(),
    getDrug: jest.fn(),
    searchDrugs: jest.fn(),
    createDrug: jest.fn(),
    updateDrug: jest.fn(),
    deleteDrug: jest.fn(),
    listStockBatches: jest.fn(),
    getStockBatch: jest.fn(),
    getDrugStockBatches: jest.fn(),
    createStockBatch: jest.fn(),
    updateStockBatch: jest.fn(),
    listAlerts: jest.fn(),
    getLowStockAlerts: jest.fn(),
    getExpiringAlerts: jest.fn(),
    acknowledgeAlert: jest.fn(),
    resolveAlert: jest.fn(),
    listPrescriptions: jest.fn(),
    getPrescription: jest.fn(),
    getPatientPrescriptions: jest.fn(),
    getEncounterPrescriptions: jest.fn(),
    getPendingPrescriptions: jest.fn(),
    createPrescription: jest.fn(),
    cancelPrescription: jest.fn(),
    listDispensings: jest.fn(),
    getDispensing: jest.fn(),
    createDispensing: jest.fn(),
    dispenseFromPrescription: jest.fn(),
    getBatchesForDrug: jest.fn(),
    returnDispensing: jest.fn(),
    verifyDispensing: jest.fn(),
    listAdjustments: jest.fn(),
    createAdjustment: jest.fn(),
    getStockSummaryReport: jest.fn(),
    getExpiryReport: jest.fn(),
    getDispensingReport: jest.fn(),
    getStockMovementReport: jest.fn(),
    getAlertSettings: jest.fn(),
    updateAlertSettings: jest.fn(),
  },
}));

const mockPharmacyApi = pharmacyApi as jest.Mocked<typeof pharmacyApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'PharmacyHookWrapper';
  return { wrapper, invalidateQueries };
}

describe('pharmacy hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches drug, stock, prescription, dispensing, report, and settings queries', async () => {
    mockPharmacyApi.listDrugs.mockResolvedValue({ count: 1, results: [{ id: 1 }] } as never);
    mockPharmacyApi.getDrug.mockResolvedValue({ id: 1 } as never);
    mockPharmacyApi.searchDrugs.mockResolvedValue([{ id: 1 }] as never);
    mockPharmacyApi.listStockBatches.mockResolvedValue({ count: 1, results: [{ id: 2 }] } as never);
    mockPharmacyApi.getStockBatch.mockResolvedValue({ id: 2 } as never);
    mockPharmacyApi.getDrugStockBatches.mockResolvedValue([{ id: 2 }] as never);
    mockPharmacyApi.listAlerts.mockResolvedValue({ count: 1, results: [{ id: 3 }] } as never);
    mockPharmacyApi.getLowStockAlerts.mockResolvedValue([{ id: 3 }] as never);
    mockPharmacyApi.getExpiringAlerts.mockResolvedValue([{ id: 4 }] as never);
    mockPharmacyApi.listPrescriptions.mockResolvedValue({ count: 1, results: [{ id: 5 }] } as never);
    mockPharmacyApi.getPrescription.mockResolvedValue({ id: 5 } as never);
    mockPharmacyApi.getPatientPrescriptions.mockResolvedValue([{ id: 5 }] as never);
    mockPharmacyApi.getEncounterPrescriptions.mockResolvedValue([{ id: 5 }] as never);
    mockPharmacyApi.getPendingPrescriptions.mockResolvedValue([{ id: 5 }] as never);
    mockPharmacyApi.listDispensings.mockResolvedValue({ count: 1, results: [{ id: 6 }] } as never);
    mockPharmacyApi.getDispensing.mockResolvedValue({ id: 6 } as never);
    mockPharmacyApi.getBatchesForDrug.mockResolvedValue([{ id: 2 }] as never);
    mockPharmacyApi.listAdjustments.mockResolvedValue({ count: 1, results: [{ id: 7 }] } as never);
    mockPharmacyApi.getStockSummaryReport.mockResolvedValue({ total: 10 } as never);
    mockPharmacyApi.getExpiryReport.mockResolvedValue({ total: 2 } as never);
    mockPharmacyApi.getDispensingReport.mockResolvedValue({ total: 3 } as never);
    mockPharmacyApi.getStockMovementReport.mockResolvedValue({ total: 4 } as never);
    mockPharmacyApi.getAlertSettings.mockResolvedValue({ low_stock_threshold: 10 } as never);

    const wrapper = createWrapper().wrapper;
    const hooks = [
      renderHook(() => useDrugs({ search: 'amo' } as never), { wrapper }),
      renderHook(() => useDrug(1), { wrapper }),
      renderHook(() => useDrugSearch('am'), { wrapper }),
      renderHook(() => useStockBatches({ status: 'ACTIVE' } as never), { wrapper }),
      renderHook(() => useStockBatch(2), { wrapper }),
      renderHook(() => useDrugStockBatches(1), { wrapper }),
      renderHook(() => useStockAlerts({ severity: 'HIGH' } as never), { wrapper }),
      renderHook(() => useLowStockAlerts(), { wrapper }),
      renderHook(() => useExpiringAlerts(), { wrapper }),
      renderHook(() => usePrescriptions({ status: 'PENDING' } as never), { wrapper }),
      renderHook(() => usePrescription(5), { wrapper }),
      renderHook(() => usePatientPrescriptions(1), { wrapper }),
      renderHook(() => useEncounterPrescriptions(10), { wrapper }),
      renderHook(() => usePendingPrescriptions(), { wrapper }),
      renderHook(() => useDispensings({ status: 'DISPENSED' } as never), { wrapper }),
      renderHook(() => useDispensing(6), { wrapper }),
      renderHook(() => useBatchesForDrug(1), { wrapper }),
      renderHook(() => useStockAdjustments({ stock_batch: 2 }), { wrapper }),
      renderHook(() => useStockSummaryReport(), { wrapper }),
      renderHook(() => useExpiryReport(30), { wrapper }),
      renderHook(() => useDispensingReport('2026-03-01', '2026-03-15'), { wrapper }),
      renderHook(() => useStockMovementReport('2026-03-01', '2026-03-15'), { wrapper }),
      renderHook(() => useAlertSettings(), { wrapper }),
    ];

    await waitFor(() => {
      hooks.forEach((hook) => expect(hook.result.current.isSuccess).toBe(true));
    });

    renderHook(() => useDrugSearch('a'), { wrapper });
    renderHook(() => useBatchesForDrug(undefined), { wrapper });
    expect(mockPharmacyApi.searchDrugs).toHaveBeenCalledTimes(1);
  });

  it('invalidates correct queries for pharmacy mutations', async () => {
    const cases = [
      { useHook: useCreateDrug, api: mockPharmacyApi.createDrug, input: { name: 'Amox' }, called: [{ name: 'Amox' }], keys: [['drugs']] },
      { useHook: useUpdateDrug, api: mockPharmacyApi.updateDrug, input: { id: 1, data: { name: 'Amox+' } }, called: [1, { name: 'Amox+' }], keys: [['drugs'], ['drugs', 1]] },
      { useHook: useDeleteDrug, api: mockPharmacyApi.deleteDrug, input: 1, called: [1], keys: [['drugs']] },
      { useHook: useCreateStockBatch, api: mockPharmacyApi.createStockBatch, input: { drug: 1, quantity_received: 100 }, called: [{ drug: 1, quantity_received: 100 }], keys: [['stock-batches'], ['drugs', 1, 'stock-batches'], ['stock-alerts']] },
      { useHook: useUpdateStockBatch, api: mockPharmacyApi.updateStockBatch, input: { id: 2, data: { unit_cost: 12 } }, called: [2, { unit_cost: 12 }], keys: [['stock-batches'], ['stock-batches', 2]] },
      { useHook: useAcknowledgeAlert, api: mockPharmacyApi.acknowledgeAlert, input: 3, called: [3], keys: [['stock-alerts']] },
      { useHook: useResolveAlert, api: mockPharmacyApi.resolveAlert, input: { id: 3, notes: 'Handled' }, called: [3, 'Handled'], keys: [['stock-alerts']] },
      { useHook: useCreatePrescription, api: mockPharmacyApi.createPrescription, input: { patient: 1 }, called: [{ patient: 1 }], keys: [['prescriptions'], ['patients', 1, 'prescriptions']] },
      { useHook: useCancelPrescription, api: mockPharmacyApi.cancelPrescription, input: { id: 5, reason: 'Changed' }, called: [5, 'Changed'], keys: [['prescriptions']] },
      { useHook: useCreateDispensing, api: mockPharmacyApi.createDispensing, input: { patient: 1 }, called: [{ patient: 1 }], keys: [['dispensings'], ['prescriptions'], ['stock-batches'], ['stock-alerts']] },
      { useHook: useDispenseFromPrescription, api: mockPharmacyApi.dispenseFromPrescription, input: { drug_id: 1, quantity: 10, patient_id: 1 }, called: [{ drug_id: 1, quantity: 10, patient_id: 1 }], keys: [['dispensings'], ['prescriptions'], ['stock-batches'], ['stock-alerts'], ['drugs']] },
      { useHook: useReturnDispensing, api: mockPharmacyApi.returnDispensing, input: { id: 6, quantity: 2, reason: 'Unused' }, called: [6, 2, 'Unused'], keys: [['dispensings'], ['prescriptions'], ['stock-batches']] },
      { useHook: useReturnStock, api: mockPharmacyApi.returnDispensing, input: { dispensing_id: 6, quantity: 1, reason: 'Correction' }, called: [6, 1, 'Correction'], keys: [['dispensings'], ['prescriptions'], ['stock-batches'], ['stock-alerts']] },
      { useHook: useVerifyDispensing, api: mockPharmacyApi.verifyDispensing, input: 6, called: [6], keys: [['dispensings']] },
      { useHook: useCreateStockAdjustment, api: mockPharmacyApi.createAdjustment, input: { stock_batch: 2, quantity: -5 }, called: [{ stock_batch: 2, quantity: -5 }], keys: [['stock-adjustments'], ['stock-batches'], ['stock-alerts']] },
      { useHook: useUpdateAlertSettings, api: mockPharmacyApi.updateAlertSettings, input: { low_stock_threshold: 5 }, called: [{ low_stock_threshold: 5 }], keys: [['alert-settings'], ['stock-alerts']] },
    ];

    for (const item of cases) {
      item.api.mockResolvedValueOnce(item.input as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => item.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(item.input as never);
      });
      expect(item.api).toHaveBeenCalledWith(...(item.called as []));
      item.keys.forEach((key) => expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key }));
    }
  });
});
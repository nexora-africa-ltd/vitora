import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAddLabResult,
  useAddOrderItem,
  useAmendDiagnosticReport,
  useAssignQueueEntry,
  useBarcodeLookup,
  useCancelDiagnosticReport,
  useCancelLabOrder,
  useCollectSample,
  useCollectSpecimen,
  useCreateDiagnosticReport,
  useCreateLabOrder,
  useCreateResultValidation,
  useCriticalAlerts,
  useDiagnosticReport,
  useDiagnosticReports,
  useEncounterLabOrders,
  useFinalizeDiagnosticReport,
  useGenerateReportPdf,
  useLabCriticalValuesReport,
  useLabOrder,
  useLabOrders,
  useLabQueue,
  useLabSampleRejectionReport,
  useLabTechnicians,
  useLabTurnaroundReport,
  useLabWorkloadReport,
  useOrderResults,
  usePatientLabOrders,
  usePatientLabResults,
  usePendingValidations,
  usePendingVerification,
  useReleaseResults,
  useRemoveOrderItem,
  useRejectSample,
  useResultValidations,
  useStartProcessing,
  useSubmitForReview,
  useSubmitLabOrder,
  useTest,
  useTestCatalog,
  useTestSearch,
  useUpdateDiagnosticReport,
  useUpdateLabOrder,
  useUpdateLabResult,
  useUpdateNotes,
  useUploadResultAttachment,
  useVerifyLabResult,
} from '@/lib/hooks/use-laboratory';
import { laboratoryApi } from '@/lib/api/laboratory';

jest.mock('@/lib/api/laboratory', () => ({
  laboratoryApi: {
    listTests: jest.fn(),
    getTest: jest.fn(),
    searchTests: jest.fn(),
    listOrders: jest.fn(),
    getOrder: jest.fn(),
    getPatientOrders: jest.fn(),
    getEncounterOrders: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    submitOrder: jest.fn(),
    collectSpecimen: jest.fn(),
    cancelOrder: jest.fn(),
    addOrderItem: jest.fn(),
    removeOrderItem: jest.fn(),
    getOrderResults: jest.fn(),
    getPatientResults: jest.fn(),
    addResult: jest.fn(),
    updateResult: jest.fn(),
    verifyResult: jest.fn(),
    uploadResultAttachment: jest.fn(),
    getPendingVerification: jest.fn(),
    getQueue: jest.fn(),
    collectSample: jest.fn(),
    assignQueueEntry: jest.fn(),
    startProcessing: jest.fn(),
    submitForReview: jest.fn(),
    releaseResults: jest.fn(),
    rejectSample: jest.fn(),
    updateNotes: jest.fn(),
    lookupByBarcode: jest.fn(),
    getTechnicians: jest.fn(),
    getCriticalAlerts: jest.fn(),
    getResultValidations: jest.fn(),
    createResultValidation: jest.fn(),
    listDiagnosticReports: jest.fn(),
    getDiagnosticReport: jest.fn(),
    createDiagnosticReport: jest.fn(),
    updateDiagnosticReport: jest.fn(),
    finalizeDiagnosticReport: jest.fn(),
    amendDiagnosticReport: jest.fn(),
    cancelDiagnosticReport: jest.fn(),
    downloadDiagnosticReportPdf: jest.fn(),
    getTurnaroundTimeReport: jest.fn(),
    getWorkloadReport: jest.fn(),
    getCriticalValuesReport: jest.fn(),
    getSampleRejectionReport: jest.fn(),
  },
}));

const mockLaboratoryApi = laboratoryApi as jest.Mocked<typeof laboratoryApi>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  wrapper.displayName = 'LaboratoryHookWrapper';
  return { wrapper, invalidateQueries };
}

describe('laboratory hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches catalog, orders, queue, reports, and detail queries', async () => {
    mockLaboratoryApi.listTests.mockResolvedValueOnce({ count: 1, results: [{ code: 'CBC' }] } as never);
    mockLaboratoryApi.getTest.mockResolvedValueOnce({ code: 'CBC' } as never);
    mockLaboratoryApi.searchTests.mockResolvedValueOnce([{ code: 'CBC' }] as never);
    mockLaboratoryApi.listOrders.mockResolvedValueOnce({ count: 1, results: [{ order_number: 'LAB-1' }] } as never);
    mockLaboratoryApi.getOrder.mockResolvedValueOnce({ order_number: 'LAB-1' } as never);
    mockLaboratoryApi.getPatientOrders.mockResolvedValueOnce([{ order_number: 'LAB-1' }] as never);
    mockLaboratoryApi.getEncounterOrders.mockResolvedValueOnce([{ order_number: 'LAB-1' }] as never);
    mockLaboratoryApi.getOrderResults.mockResolvedValueOnce([{ id: 1 }] as never);
    mockLaboratoryApi.getPatientResults.mockResolvedValueOnce([{ id: 2 }] as never);
    mockLaboratoryApi.getPendingVerification.mockResolvedValue([{ id: 3 }] as never);
    mockLaboratoryApi.getQueue.mockResolvedValueOnce([{ queue_number: 'Q1' }] as never);
    mockLaboratoryApi.getTechnicians.mockResolvedValueOnce([{ id: 1 }] as never);
    mockLaboratoryApi.getCriticalAlerts.mockResolvedValueOnce([{ id: 4 }] as never);
    mockLaboratoryApi.getResultValidations.mockResolvedValueOnce([{ id: 5 }] as never);
    mockLaboratoryApi.listDiagnosticReports.mockResolvedValueOnce([{ id: 6 }] as never);
    mockLaboratoryApi.getDiagnosticReport.mockResolvedValueOnce({ report_number: 'DR-1' } as never);
    mockLaboratoryApi.getTurnaroundTimeReport.mockResolvedValueOnce({ avg: 12 } as never);
    mockLaboratoryApi.getWorkloadReport.mockResolvedValueOnce({ total: 10 } as never);
    mockLaboratoryApi.getCriticalValuesReport.mockResolvedValueOnce({ total: 2 } as never);
    mockLaboratoryApi.getSampleRejectionReport.mockResolvedValueOnce({ total: 1 } as never);

    const wrappers = createWrapper();
    await waitFor(async () => {
      expect((await renderHook(() => useTestCatalog({ search: 'cbc' } as never), { wrapper: wrappers.wrapper }).result.current.data)?.count).toBeUndefined();
    });
  });

  it('covers enabled query behavior and report fetchers', async () => {
    mockLaboratoryApi.listTests.mockResolvedValue({ count: 1, results: [{ code: 'CBC' }] } as never);
    mockLaboratoryApi.getTest.mockResolvedValue({ code: 'CBC' } as never);
    mockLaboratoryApi.searchTests.mockResolvedValue([{ code: 'CBC' }] as never);
    mockLaboratoryApi.listOrders.mockResolvedValue({ count: 1, results: [{ order_number: 'LAB-1' }] } as never);
    mockLaboratoryApi.getOrder.mockResolvedValue({ order_number: 'LAB-1' } as never);
    mockLaboratoryApi.getPatientOrders.mockResolvedValue([{ order_number: 'LAB-1' }] as never);
    mockLaboratoryApi.getEncounterOrders.mockResolvedValue([{ order_number: 'LAB-1' }] as never);
    mockLaboratoryApi.getOrderResults.mockResolvedValue([{ id: 1 }] as never);
    mockLaboratoryApi.getPatientResults.mockResolvedValue([{ id: 2 }] as never);
    mockLaboratoryApi.getPendingVerification.mockResolvedValue([{ id: 3 }] as never);
    mockLaboratoryApi.getQueue.mockResolvedValue([{ queue_number: 'Q1' }] as never);
    mockLaboratoryApi.getTechnicians.mockResolvedValue([{ id: 1 }] as never);
    mockLaboratoryApi.getCriticalAlerts.mockResolvedValue([{ id: 4 }] as never);
    mockLaboratoryApi.getResultValidations.mockResolvedValue([{ id: 5 }] as never);
    mockLaboratoryApi.listDiagnosticReports.mockResolvedValue([{ id: 6 }] as never);
    mockLaboratoryApi.getDiagnosticReport.mockResolvedValue({ report_number: 'DR-1' } as never);
    mockLaboratoryApi.getTurnaroundTimeReport.mockResolvedValue({ avg: 12 } as never);
    mockLaboratoryApi.getWorkloadReport.mockResolvedValue({ total: 10 } as never);
    mockLaboratoryApi.getCriticalValuesReport.mockResolvedValue({ total: 2 } as never);
    mockLaboratoryApi.getSampleRejectionReport.mockResolvedValue({ total: 1 } as never);

    const wrapper = createWrapper().wrapper;
    const hooks = [
      renderHook(() => useTestCatalog({ search: 'cbc' } as never), { wrapper }),
      renderHook(() => useTest('CBC'), { wrapper }),
      renderHook(() => useTestSearch('cb'), { wrapper }),
      renderHook(() => useLabOrders({ status: 'PENDING' } as never), { wrapper }),
      renderHook(() => useLabOrder('LAB-1'), { wrapper }),
      renderHook(() => usePatientLabOrders(1), { wrapper }),
      renderHook(() => useEncounterLabOrders(10), { wrapper }),
      renderHook(() => useOrderResults('LAB-1'), { wrapper }),
      renderHook(() => usePatientLabResults(1), { wrapper }),
      renderHook(() => usePendingVerification(), { wrapper }),
      renderHook(() => usePendingValidations({ validationType: 'TECHNICAL' as never }), { wrapper }),
      renderHook(() => useLabQueue('PENDING'), { wrapper }),
      renderHook(() => useLabTechnicians(), { wrapper }),
      renderHook(() => useCriticalAlerts('LAB-1'), { wrapper }),
      renderHook(() => useResultValidations(1), { wrapper }),
      renderHook(() => useDiagnosticReports({ status: 'FINAL' as never }), { wrapper }),
      renderHook(() => useDiagnosticReport(1), { wrapper }),
      renderHook(() => useLabTurnaroundReport('2026-03-01', '2026-03-15'), { wrapper }),
      renderHook(() => useLabWorkloadReport('2026-03-01', '2026-03-15'), { wrapper }),
      renderHook(() => useLabCriticalValuesReport('2026-03-01', '2026-03-15'), { wrapper }),
      renderHook(() => useLabSampleRejectionReport('2026-03-01', '2026-03-15'), { wrapper }),
    ];

    await waitFor(() => {
      hooks.forEach((hook) => expect(hook.result.current.isSuccess).toBe(true));
    });

    renderHook(() => useTestSearch('c'), { wrapper });
    renderHook(() => useDiagnosticReport(''), { wrapper });
    expect(mockLaboratoryApi.searchTests).toHaveBeenCalledTimes(1);
  });

  it('invalidates correct queries for laboratory mutations', async () => {
    const cases = [
      { useHook: useCreateLabOrder, api: mockLaboratoryApi.createOrder, input: { patient: 1, encounter: 2 }, called: [{ patient: 1, encounter: 2 }], resolved: { patient: 1, encounter: 2 }, keys: [['lab-orders'], ['patients', 1, 'lab-orders'], ['encounters', 2, 'lab-orders']] },
      { useHook: useUpdateLabOrder, api: mockLaboratoryApi.updateOrder, input: { orderNumber: 'LAB-1', data: { status: 'DRAFT' } }, called: ['LAB-1', { status: 'DRAFT' }], resolved: { order_number: 'LAB-1' }, keys: [['lab-orders'], ['lab-orders', 'LAB-1']] },
      { useHook: useSubmitLabOrder, api: mockLaboratoryApi.submitOrder, input: 'LAB-1', called: ['LAB-1'], resolved: { order_number: 'LAB-1' }, keys: [['lab-orders'], ['lab-orders', 'LAB-1'], ['lab-queue']] },
      { useHook: useCollectSpecimen, api: mockLaboratoryApi.collectSpecimen, input: { orderNumber: 'LAB-1', sampleId: 'S1' }, called: ['LAB-1', 'S1'], resolved: { order_number: 'LAB-1' }, keys: [['lab-orders'], ['lab-orders', 'LAB-1'], ['lab-queue']] },
      { useHook: useCancelLabOrder, api: mockLaboratoryApi.cancelOrder, input: { orderNumber: 'LAB-1', reason: 'Error' }, called: ['LAB-1', 'Error'], resolved: { order_number: 'LAB-1' }, keys: [['lab-orders'], ['lab-orders', 'LAB-1']] },
      { useHook: useAddOrderItem, api: mockLaboratoryApi.addOrderItem, input: { orderNumber: 'LAB-1', testId: 1, specialInstructions: 'Urgent' }, called: ['LAB-1', 1, 'Urgent'], resolved: {}, keys: [['lab-orders', 'LAB-1']] },
      { useHook: useRemoveOrderItem, api: mockLaboratoryApi.removeOrderItem, input: { orderNumber: 'LAB-1', itemId: 8 }, called: ['LAB-1', 8], resolved: {}, keys: [['lab-orders', 'LAB-1']] },
      { useHook: useAddLabResult, api: mockLaboratoryApi.addResult, input: { orderNumber: 'LAB-1', data: { result_value: '5.0' } }, called: ['LAB-1', { result_value: '5.0' }], resolved: {}, keys: [['lab-orders', 'LAB-1'], ['lab-orders', 'LAB-1', 'results']] },
      { useHook: useUpdateLabResult, api: mockLaboratoryApi.updateResult, input: { resultId: 2, data: { result_value: '6.0' } }, called: [2, { result_value: '6.0' }], resolved: {}, keys: [['lab-orders'], ['lab-results']] },
      { useHook: useVerifyLabResult, api: mockLaboratoryApi.verifyResult, input: 2, called: [2], resolved: {}, keys: [['lab-orders'], ['lab-results'], ['lab-results', 'pending-verification']] },
      { useHook: useUploadResultAttachment, api: mockLaboratoryApi.uploadResultAttachment, input: { resultId: 2, file: new File(['x'], 'r.pdf') }, called: [2, expect.any(File)], resolved: {}, keys: [['lab-orders'], ['lab-results']] },
      { useHook: useCollectSample, api: mockLaboratoryApi.collectSample, input: { queueNumber: 'Q1', sampleId: 'S1' }, called: ['Q1', 'S1'], resolved: {}, keys: [['lab-queue']] },
      { useHook: useAssignQueueEntry, api: mockLaboratoryApi.assignQueueEntry, input: { queueNumber: 'Q1', technicianId: 4 }, called: ['Q1', 4], resolved: {}, keys: [['lab-queue']] },
      { useHook: useStartProcessing, api: mockLaboratoryApi.startProcessing, input: 'Q1', called: ['Q1'], resolved: {}, keys: [['lab-queue']] },
      { useHook: useSubmitForReview, api: mockLaboratoryApi.submitForReview, input: 'Q1', called: ['Q1'], resolved: {}, keys: [['lab-queue']] },
      { useHook: useReleaseResults, api: mockLaboratoryApi.releaseResults, input: 'Q1', called: ['Q1'], resolved: {}, keys: [['lab-queue'], ['lab-orders']] },
      { useHook: useRejectSample, api: mockLaboratoryApi.rejectSample, input: { queueNumber: 'Q1', reason: 'Bad sample' }, called: ['Q1', 'Bad sample'], resolved: {}, keys: [['lab-queue']] },
      { useHook: useUpdateNotes, api: mockLaboratoryApi.updateNotes, input: { queueNumber: 'Q1', notes: 'Done', append: true }, called: ['Q1', 'Done', true], resolved: {}, keys: [['lab-queue']] },
      { useHook: useBarcodeLookup, api: mockLaboratoryApi.lookupByBarcode, input: 'BC123', called: ['BC123'], resolved: {}, keys: [['lab-queue']] },
      { useHook: useCreateResultValidation, api: mockLaboratoryApi.createResultValidation, input: { resultId: 7, data: { validation_type: 'TECHNICAL' } }, called: [7, { validation_type: 'TECHNICAL' }], resolved: { result: 7 }, keys: [['lab-results', 7, 'validations'], ['lab-results', 'pending-validations'], ['lab-orders'], ['lab-results']] },
      { useHook: useCreateDiagnosticReport, api: mockLaboratoryApi.createDiagnosticReport, input: { lab_order: 1 }, called: [{ lab_order: 1 }], resolved: { lab_order_number: 'LAB-1' }, keys: [['diagnostic-reports'], ['lab-orders', 'LAB-1']] },
      { useHook: useUpdateDiagnosticReport, api: mockLaboratoryApi.updateDiagnosticReport, input: { id: 1, data: { conclusion: 'ok' } }, called: [1, { conclusion: 'ok' }], resolved: { report_number: 'DR-1' }, keys: [['diagnostic-reports'], ['diagnostic-reports', 'DR-1']] },
      { useHook: useFinalizeDiagnosticReport, api: mockLaboratoryApi.finalizeDiagnosticReport, input: 1, called: [1], resolved: { report_number: 'DR-1' }, keys: [['diagnostic-reports'], ['diagnostic-reports', 'DR-1']] },
      { useHook: useAmendDiagnosticReport, api: mockLaboratoryApi.amendDiagnosticReport, input: { id: 1, conclusion: 'amended' }, called: [1, 'amended'], resolved: { report_number: 'DR-1' }, keys: [['diagnostic-reports'], ['diagnostic-reports', 'DR-1']] },
      { useHook: useCancelDiagnosticReport, api: mockLaboratoryApi.cancelDiagnosticReport, input: { id: 1, reason: 'bad data' }, called: [1, 'bad data'], resolved: { report_number: 'DR-1' }, keys: [['diagnostic-reports'], ['diagnostic-reports', 'DR-1']] },
    ];

    for (const item of cases) {
      item.api.mockResolvedValueOnce(item.resolved as never);
      const ctx = createWrapper();
      const { result } = renderHook(() => item.useHook(), { wrapper: ctx.wrapper });
      await act(async () => {
        await result.current.mutateAsync(item.input as never);
      });
      if (item.called[1] && item.called[1] === expect.any(File)) {
        expect(item.api).toHaveBeenCalledWith(item.called[0], expect.any(File));
      } else {
        expect(item.api).toHaveBeenCalledWith(...(item.called as []));
      }
      item.keys.forEach((key) => {
        expect(ctx.invalidateQueries).toHaveBeenCalledWith({ queryKey: key });
      });
    }
  });

  it('downloads report PDFs via a temporary anchor', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:lab');
    URL.revokeObjectURL = jest.fn();
    const click = jest.fn();
    const appendSpy = jest.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    const removeSpy = jest.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tag);
    }) as typeof document.createElement);
    mockLaboratoryApi.downloadDiagnosticReportPdf.mockResolvedValueOnce(new Blob(['pdf']) as never);

    const { result } = renderHook(() => useGenerateReportPdf(), { wrapper: createWrapper().wrapper });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(click).toHaveBeenCalled();
    createElementSpy.mockRestore();
    appendSpy.mockRestore();
    removeSpy.mockRestore();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });
});

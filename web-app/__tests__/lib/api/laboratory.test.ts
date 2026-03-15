import { laboratoryApi } from '@/lib/api/laboratory';
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

describe('laboratoryApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('covers primary GET endpoints and array or paginated response fallbacks', async () => {
    const getCases = [
      { fn: () => laboratoryApi.listTests({ search: 'cbc' } as never), args: ['/api/lab/tests/', { params: { search: 'cbc' } }] },
      { fn: () => laboratoryApi.getTest('CBC'), args: ['/api/lab/tests/CBC/'] },
      { fn: () => laboratoryApi.searchTests('cbc'), args: ['/api/lab/tests/', { params: { search: 'cbc', is_active: true } }], resultFromResults: true },
      { fn: () => laboratoryApi.listOrders({ status: 'PENDING' } as never), args: ['/api/lab/orders/', { params: { status: 'PENDING' } }] },
      { fn: () => laboratoryApi.getOrder('LAB-1'), args: ['/api/lab/orders/LAB-1/'] },
      { fn: () => laboratoryApi.getCriticalAlerts('LAB-1'), args: ['/api/lab/orders/LAB-1/alerts/'] },
      { fn: () => laboratoryApi.getResult(1), args: ['/api/lab/results/1/'] },
      { fn: () => laboratoryApi.getOrderResults('LAB-1'), args: ['/api/lab/orders/LAB-1/results/'] },
      { fn: () => laboratoryApi.getPatientResults(1), args: ['/api/patients/1/lab-results/'] },
      { fn: () => laboratoryApi.getPendingVerification(), args: ['/api/lab/results/pending-verification/'] },
      { fn: () => laboratoryApi.getSpecimen('BC1'), args: ['/api/lab/specimens/BC1/'] },
      { fn: () => laboratoryApi.listOrderSpecimens('LAB-1'), args: ['/api/lab/orders/LAB-1/specimens/'] },
      { fn: () => laboratoryApi.getResultValidations(1), args: ['/api/lab/results/1/validations/'] },
      { fn: () => laboratoryApi.getInstrument(1), args: ['/api/lab/instruments/1/'] },
      { fn: () => laboratoryApi.getAnalyzerRun(1), args: ['/api/lab/analyzer-runs/1/'] },
      { fn: () => laboratoryApi.getDiagnosticReport(1), args: ['/api/lab/diagnostic-reports/1/'] },
      { fn: () => laboratoryApi.getTurnaroundTimeReport('2026-03-01', '2026-03-15'), args: ['/api/lab/reports/turnaround-time/', { params: { start: '2026-03-01', end: '2026-03-15' } }] },
      { fn: () => laboratoryApi.getWorkloadReport('2026-03-01', '2026-03-15'), args: ['/api/lab/reports/workload/', { params: { start: '2026-03-01', end: '2026-03-15' } }] },
      { fn: () => laboratoryApi.getCriticalValuesReport('2026-03-01', '2026-03-15'), args: ['/api/lab/reports/critical-values/', { params: { start: '2026-03-01', end: '2026-03-15' } }] },
      { fn: () => laboratoryApi.getSampleRejectionReport('2026-03-01', '2026-03-15'), args: ['/api/lab/reports/rejections/', { params: { start: '2026-03-01', end: '2026-03-15' } }] },
      { fn: () => laboratoryApi.lookupByBarcode('BC1'), args: ['/api/lab/queue/lookup/', { params: { barcode: 'BC1' } }] },
      { fn: () => laboratoryApi.getTechnicians(), args: ['/api/lab/queue/technicians/'] },
      { fn: () => laboratoryApi.getQueueStats(), args: ['/api/lab/queue/stats/'] },
    ];

    for (const testCase of getCases) {
      const data = testCase.resultFromResults ? { results: [{ id: 1 }] } : { id: 1, results: [{ id: 1 }] };
      mockApiClient.get.mockResolvedValueOnce({ data });
      const result = await testCase.fn();
      expect(mockApiClient.get).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual(testCase.resultFromResults ? data.results : data);
    }

    mockApiClient.get
      .mockResolvedValueOnce({ data: [{ id: 1 }] })
      .mockResolvedValueOnce({ data: { results: [{ id: 2 }] } })
      .mockResolvedValueOnce({ data: [{ id: 3 }] })
      .mockResolvedValueOnce({ data: { results: [{ id: 4 }] } })
      .mockResolvedValueOnce({ data: [{ id: 5 }] })
      .mockResolvedValueOnce({ data: { results: [{ id: 6 }] } })
      .mockResolvedValueOnce({ data: [{ id: 7 }] })
      .mockResolvedValueOnce({ data: { results: [{ id: 8 }] } })
      .mockResolvedValueOnce({ data: [{ id: 9 }] })
      .mockResolvedValueOnce({ data: { results: [{ id: 10 }] } });

    expect(await laboratoryApi.getPatientOrders(1)).toEqual([{ id: 1 }]);
    expect(await laboratoryApi.getPatientOrders(2)).toEqual([{ id: 2 }]);
    expect(await laboratoryApi.getEncounterOrders(1)).toEqual([{ id: 3 }]);
    expect(await laboratoryApi.getEncounterOrders(2)).toEqual([{ id: 4 }]);
    expect(await laboratoryApi.listInstruments()).toEqual([{ id: 5 }]);
    expect(await laboratoryApi.listInstruments({ is_active: true })).toEqual([{ id: 6 }]);
    expect(await laboratoryApi.listAnalyzerRuns()).toEqual([{ id: 7 }]);
    expect(await laboratoryApi.listAnalyzerRuns(1)).toEqual([{ id: 8 }]);
    expect(await laboratoryApi.listDiagnosticReports()).toEqual([{ id: 9 }]);
    expect(await laboratoryApi.listDiagnosticReports({ status: 'FINAL' as never })).toEqual([{ id: 10 }]);
  });

  it('covers POST, PATCH, DELETE, upload fallback, and PDF download flows', async () => {
    const postPatchCases = [
      { fn: () => laboratoryApi.createOrder({ patient: 1 } as never), method: 'post', args: ['/api/lab/orders/', { patient: 1 }] },
      { fn: () => laboratoryApi.updateOrder('LAB-1', { status: 'DRAFT' } as never), method: 'patch', args: ['/api/lab/orders/LAB-1/', { status: 'DRAFT' }] },
      { fn: () => laboratoryApi.submitOrder('LAB-1'), method: 'post', args: ['/api/lab/orders/LAB-1/submit/'] },
      { fn: () => laboratoryApi.collectSpecimen('LAB-1', 'S1'), method: 'post', args: ['/api/lab/orders/LAB-1/collect-specimen/', { sample_id: 'S1' }] },
      { fn: () => laboratoryApi.cancelOrder('LAB-1', 'bad'), method: 'post', args: ['/api/lab/orders/LAB-1/cancel/', { reason: 'bad' }] },
      { fn: () => laboratoryApi.addOrderItem('LAB-1', 2, 'urgent'), method: 'post', args: ['/api/lab/orders/LAB-1/items/', { test: 2, special_instructions: 'urgent' }] },
      { fn: () => laboratoryApi.addResult('LAB-1', { result_value: '5.0' } as never), method: 'post', args: ['/api/lab/orders/LAB-1/results/', { result_value: '5.0' }] },
      { fn: () => laboratoryApi.updateResult(1, { result_value: '6.0' } as never), method: 'patch', args: ['/api/lab/results/1/', { result_value: '6.0' }] },
      { fn: () => laboratoryApi.verifyResult(1, true, 'ok'), method: 'post', args: ['/api/lab/results/1/verify/', { approved: true, comments: 'ok' }] },
      { fn: () => laboratoryApi.createResultValidation(1, { validation_type: 'TECHNICAL' } as never), method: 'post', args: ['/api/lab/results/1/validate/', { validation_type: 'TECHNICAL' }] },
      { fn: () => laboratoryApi.createInstrument({ name: 'Analyzer' } as never), method: 'post', args: ['/api/lab/instruments/', { name: 'Analyzer' }] },
      { fn: () => laboratoryApi.updateInstrument(1, { name: 'Updated' } as never), method: 'patch', args: ['/api/lab/instruments/1/', { name: 'Updated' }] },
      { fn: () => laboratoryApi.markAnalyzerRunError(1, 'Oops'), method: 'post', args: ['/api/lab/analyzer-runs/1/mark_error/', { error_message: 'Oops' }] },
      { fn: () => laboratoryApi.createDiagnosticReport({ lab_order: 1 } as never), method: 'post', args: ['/api/lab/diagnostic-reports/', { lab_order: 1 }] },
      { fn: () => laboratoryApi.updateDiagnosticReport(1, { conclusion: 'Fine' } as never), method: 'patch', args: ['/api/lab/diagnostic-reports/1/', { conclusion: 'Fine' }] },
      { fn: () => laboratoryApi.finalizeDiagnosticReport(1), method: 'post', args: ['/api/lab/diagnostic-reports/1/finalize/'] },
      { fn: () => laboratoryApi.amendDiagnosticReport(1, 'Updated'), method: 'post', args: ['/api/lab/diagnostic-reports/1/amend/', { conclusion: 'Updated' }] },
      { fn: () => laboratoryApi.cancelDiagnosticReport(1, 'Bad'), method: 'post', args: ['/api/lab/diagnostic-reports/1/cancel/', { reason: 'Bad' }] },
      { fn: () => laboratoryApi.collectSample('Q1', 'S1'), method: 'post', args: ['/api/lab/queue/Q1/collect/', { sample_id: 'S1' }] },
      { fn: () => laboratoryApi.assignQueueEntry('Q1', 2), method: 'post', args: ['/api/lab/queue/Q1/assign/', { technician_id: 2 }] },
      { fn: () => laboratoryApi.startProcessing('Q1'), method: 'post', args: ['/api/lab/queue/Q1/start-processing/'] },
      { fn: () => laboratoryApi.submitForReview('Q1'), method: 'post', args: ['/api/lab/queue/Q1/submit-review/'] },
      { fn: () => laboratoryApi.releaseResults('Q1'), method: 'post', args: ['/api/lab/queue/Q1/release/'] },
      { fn: () => laboratoryApi.rejectSample('Q1', 'bad sample'), method: 'post', args: ['/api/lab/queue/Q1/reject/', { reason: 'bad sample' }] },
      { fn: () => laboratoryApi.updateNotes('Q1', 'done', true), method: 'post', args: ['/api/lab/queue/Q1/notes/', { notes: 'done', append: true }] },
    ];

    for (const testCase of postPatchCases) {
      (mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock).mockResolvedValueOnce({ data: { id: 1 } });
      const result = await testCase.fn();
      expect((mockApiClient[testCase.method as 'post' | 'patch'] as jest.Mock)).toHaveBeenCalledWith(...testCase.args);
      expect(result).toEqual({ id: 1 });
    }

    mockApiClient.delete.mockResolvedValueOnce({});
    await laboratoryApi.removeOrderItem('LAB-1', 9);
    expect(mockApiClient.delete).toHaveBeenCalledWith('/api/lab/orders/LAB-1/items/9/');

    const file = new File(['x'], 'result.pdf');
    mockApiClient.post
      .mockRejectedValueOnce(new Error('plural failed'))
      .mockResolvedValueOnce({ data: { id: 2 } });
    expect(await laboratoryApi.uploadResultAttachment(1, file)).toEqual({ id: 2 });
    const recentPostCalls = mockApiClient.post.mock.calls.slice(-2);
    expect(recentPostCalls[0]?.[0]).toBe('/api/lab/results/1/attachments/');
    expect(recentPostCalls[0]?.[1]).toBeInstanceOf(FormData);
    expect(recentPostCalls[0]?.[2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
    expect(recentPostCalls[1]?.[0]).toBe('/api/lab/results/1/attachment/');
    expect(recentPostCalls[1]?.[1]).toBeInstanceOf(FormData);
    expect(recentPostCalls[1]?.[2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

    mockApiClient.post.mockResolvedValueOnce({ data: { pdf_url: '/files/report.pdf' } });
    mockApiClient.get.mockResolvedValueOnce({ data: new Blob(['pdf']) });
    const blob = await laboratoryApi.downloadDiagnosticReportPdf(1);
    expect(mockApiClient.post).toHaveBeenLastCalledWith('/api/lab/diagnostic-reports/1/generate_pdf/');
    expect(mockApiClient.get).toHaveBeenLastCalledWith('/files/report.pdf', { responseType: 'blob' });
    expect(blob).toBeInstanceOf(Blob);

    mockApiClient.post.mockResolvedValueOnce({ data: { pdf_url: null } });
    await expect(laboratoryApi.downloadDiagnosticReportPdf(2)).rejects.toThrow('Diagnostic report PDF URL was not returned.');
  });

  it('passes parsed responses through parseResponse with contexts', async () => {
    mockApiClient.get.mockResolvedValue({ data: { results: [] } });
    await laboratoryApi.listTests();
    expect(mockParseResponse).toHaveBeenCalledWith(expect.anything(), { results: [] }, { context: 'laboratoryApi.listTests' });
  });
});
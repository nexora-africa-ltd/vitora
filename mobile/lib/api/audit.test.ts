import { auditApi } from './audit';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('auditApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('loads paginated audit log results', async () => {
    let capturedAction = '';
    let capturedUser = '';
    server.use(
      http.get(`${API_BASE_URL}/api/auditlogs/`, ({ request }) => {
        const url = new URL(request.url);
        capturedAction = url.searchParams.get('action') ?? '';
        capturedUser = url.searchParams.get('user') ?? '';
        return HttpResponse.json({
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 88,
              user: 14,
              username: 'jdoe',
              user_name: 'Jane Doe',
              action: 'patient_view',
              resource_type: 'Patient',
              resource_id: 55,
              timestamp: '2026-03-13T10:15:00Z',
              ip_address: '127.0.0.1',
              user_agent: 'Jest',
              details: { purpose: 'review' },
              patient_id: 55,
            },
          ],
        });
      })
    );

    const response = await auditApi.listAuditLogs({ action: 'patient_view', user: 14 });

    expect(capturedAction).toBe('patient_view');
    expect(capturedUser).toBe('14');
    expect(response.results[0]?.action).toBe('patient_view');
    expect(response.results[0]?.details).toEqual({ purpose: 'review' });
  });
});
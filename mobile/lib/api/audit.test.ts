import { auditApi } from './audit';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('auditApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads paginated audit log results', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
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
      },
    });

    const response = await auditApi.listAuditLogs({ action: 'patient_view', user: 14 });

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/auditlogs/', {
      params: { action: 'patient_view', user: 14 },
    });
    expect(response.results[0]?.action).toBe('patient_view');
    expect(response.results[0]?.details).toEqual({ purpose: 'review' });
  });
});
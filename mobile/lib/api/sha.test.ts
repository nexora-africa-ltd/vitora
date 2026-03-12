import { shaApi } from './sha';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('shaApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes patient eligibility responses with a covered status', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: {
        is_eligible: true,
        result: 'ELIGIBLE',
        eligible_until: '2026-12-31',
        benefit_balance: '3200.50',
        ineligibility_reason: null,
        sha_number: 'SHA-001',
      },
    });

    const result = await shaApi.checkPatientEligibility(14);

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/billing/eligibility/check/', {
      patient_id: 14,
    });
    expect(result.patient_id).toBe(14);
    expect(result.coverage_status).toBe('covered');
    expect(result.benefit_balance).toBe(3200.5);
  });

  it('loads direct eligibility checks by identification data', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
        is_eligible: false,
        sha_number: null,
        full_name: 'Jane Doe',
        coverage_end_date: null,
        reason: 'Membership inactive',
        error: null,
      },
    });

    const result = await shaApi.checkDirectEligibility({
      identification_type: 'national_id',
      identification_number: '12345678',
    });

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/billing/eligibility/direct/', {
      params: {
        identification_type: 'national_id',
        identification_number: '12345678',
      },
    });
    expect(result.is_eligible).toBe(false);
    expect(result.reason).toBe('Membership inactive');
  });
});
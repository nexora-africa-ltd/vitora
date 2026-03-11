import { laboratoryApi } from './laboratory';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('laboratoryApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unwraps laboratory tests from paginated backend payloads', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 2,
            code: 'FBC',
            name: 'Full Blood Count',
            short_name: 'FBC',
            category: 'HEMATOLOGY',
            specimen_type: 'BLOOD',
            cost: '450.00',
            sha_claimable: true,
            available_in_house: true,
            is_active: true,
          },
        ],
      },
    });

    const results = await laboratoryApi.listTests({ search: 'blood' });

    expect(mockedApiClient.get).toHaveBeenCalledWith('/api/lab/tests/', {
      params: { page_size: 100, search: 'blood' },
    });
    expect(results[0]?.code).toBe('FBC');
    expect(results[0]?.cost).toBe(450);
  });

  it('posts lab orders with selected tests and returns the full order payload', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: {
        id: 9,
        order_number: 'LAB-20260311-0009',
        patient: 14,
        patient_name: 'Jane Doe',
        patient_mrn: 'MRN-20260311-0001',
        encounter: 55,
        admission: null,
        ordered_by: 2,
        ordered_by_name: 'Dr One',
        order_type: 'IN_HOUSE',
        external_lab: '',
        priority: 'URGENT',
        clinical_notes: 'Fever and cough',
        status: 'DRAFT',
        specimen_collected: false,
        specimen_collected_at: null,
        specimen_collected_by: null,
        total_cost: 450,
        items: [
          {
            id: 44,
            lab_order: 9,
            test: 2,
            test_name: 'Full Blood Count',
            test_code: 'FBC',
            status: 'ORDERED',
            unit_cost: 450,
            special_instructions: '',
            has_result: false,
            result: null,
            created_at: '2026-03-11T10:00:00Z',
          },
        ],
        ordered_at: '2026-03-11T10:00:00Z',
        completed_at: null,
        cancellation_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        created_at: '2026-03-11T10:00:00Z',
        updated_at: '2026-03-11T10:00:00Z',
      },
    });

    const payload = {
      patient: 14,
      encounter: 55,
      order_type: 'IN_HOUSE' as const,
      priority: 'URGENT' as const,
      clinical_notes: 'Fever and cough',
      items: [{ test_code: 'FBC' }],
    };

    const order = await laboratoryApi.createOrder(payload);

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/lab/orders/', payload);
    expect(order.order_number).toBe('LAB-20260311-0009');
    expect(order.items[0]?.test_code).toBe('FBC');
  });
});
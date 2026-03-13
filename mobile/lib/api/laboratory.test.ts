import { laboratoryApi } from './laboratory';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('laboratoryApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('unwraps laboratory tests from paginated backend payloads', async () => {
    let capturedSearch = '';
    server.use(
      http.get(`${API_BASE_URL}/api/lab/tests/`, ({ request }) => {
        capturedSearch = new URL(request.url).searchParams.get('search') ?? '';
        return HttpResponse.json({
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
      });
      })
    );

    const results = await laboratoryApi.listTests({ search: 'blood' });

    expect(capturedSearch).toBe('blood');
    expect(results[0]?.code).toBe('FBC');
    expect(results[0]?.cost).toBe(450);
  });

  it('posts lab orders with selected tests and returns the full order payload', async () => {
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_BASE_URL}/api/lab/orders/`, async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
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
      });
      })
    );

    const payload = {
      patient: 14,
      encounter: 55,
      order_type: 'IN_HOUSE' as const,
      priority: 'URGENT' as const,
      clinical_notes: 'Fever and cough',
      items: [{ test_code: 'FBC' }],
    };

    const order = await laboratoryApi.createOrder(payload);

    expect(requestBody).toMatchObject(payload);
    expect(order.order_number).toBe('LAB-20260311-0009');
    expect(order.items[0]?.test_code).toBe('FBC');
  });
});
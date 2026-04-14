import { shaApi } from './sha';
import { http, HttpResponse } from 'msw';

import { server } from '@/__tests__/msw/server';

const API_BASE_URL = 'http://127.0.0.1:9088';

describe('shaApi', () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it('normalizes patient eligibility responses with a covered status', async () => {
    let requestBody: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API_BASE_URL}/api/billing/eligibility/check/`, async ({ request }) => {
        requestBody = await request.json() as Record<string, unknown>;
        return HttpResponse.json({
        is_eligible: true,
        result: 'ELIGIBLE',
        eligible_until: '2026-12-31',
        benefit_balance: '3200.50',
        ineligibility_reason: null,
        sha_number: 'SHA-001',
      });
      })
    );

    const result = await shaApi.checkPatientEligibility(14);

    expect(requestBody).toEqual({ patient_id: 14 });
    expect(result.patient_id).toBe(14);
    expect(result.coverage_status).toBe('covered');
    expect(result.benefit_balance).toBe(3200.5);
  });

  it('loads direct eligibility checks by identification data', async () => {
    let idType = '';
    let idNumber = '';
    server.use(
      http.get(`${API_BASE_URL}/api/billing/eligibility/direct/`, ({ request }) => {
        const url = new URL(request.url);
        idType = url.searchParams.get('identification_type') ?? '';
        idNumber = url.searchParams.get('identification_number') ?? '';
        return HttpResponse.json({
        is_eligible: false,
        sha_number: null,
        full_name: 'Jane Doe',
        coverage_end_date: null,
        reason: 'Membership inactive',
        error: null,
      });
      })
    );

    const result = await shaApi.checkDirectEligibility({
      identification_type: 'national_id',
      identification_number: '12345678',
    });

    expect(idType).toBe('national_id');
    expect(idNumber).toBe('12345678');
    expect(result.is_eligible).toBe(false);
    expect(result.reason).toBe('Membership inactive');
  });
});

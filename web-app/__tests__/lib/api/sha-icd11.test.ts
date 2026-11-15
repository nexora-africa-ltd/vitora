// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Verifies the SHA ICD-11 API client uses the canonical billing terminology
 * route and accepts normalized DHA Clinical Concepts responses.
 *
 * Run with:
 *   npm test -- --runInBand __tests__/lib/api/sha-icd11.test.ts
 *
 * Inputs:
 *   Mocked Axios API responses from `/api/billing/terminology/icd11/`.
 */

import { shaApi } from '@/lib/api/sha';
import { apiClient } from '@/lib/api/client';

jest.mock('@/lib/api/client');

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('shaApi.searchICD11', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the ICD-11 route and accepts a DHA-normalized record without a local ID', async () => {
    mockApiClient.get.mockResolvedValue({
      data: {
        count: 1,
        results: [
          {
            code: '1A00',
            title: 'Cholera',
            description: 'Cholera',
            is_active: true,
          },
        ],
        source: 'dha_terminology_api',
      },
    });

    const response = await shaApi.searchICD11({ search: 'cholera', page_size: 20 });

    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/api/billing/terminology/icd11/?search=cholera&page_size=20'
    );
    expect(response).toEqual({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          code: '1A00',
          title: 'Cholera',
          description: 'Cholera',
          is_active: true,
        },
      ],
      source: 'dha_terminology_api',
    });
  });
});

// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Setup API desktop routing regression tests.
 * Run with: npx jest __tests__/lib/api/onboarding-setup-api.test.ts --runInBand.
 * Inputs: mocked desktop API initialization and setup status response.
 */

import { setupApi } from '@/lib/api/onboarding';

const mockInitDesktopApiUrl = jest.fn().mockResolvedValue('http://192.168.100.88:9088');
const mockGetApiBaseUrl = jest.fn(() => 'http://192.168.100.88:9088');

jest.mock('@/lib/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  getApiBaseUrl: () => mockGetApiBaseUrl(),
  initDesktopApiUrl: () => mockInitDesktopApiUrl(),
}));

describe('setupApi.check', () => {
  it('waits for and checks the active desktop hub URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        setup_required: false,
        setup_enabled: true,
        has_organizations: true,
      }),
    });
    global.fetch = fetchMock;

    await setupApi.check();

    expect(mockInitDesktopApiUrl).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://192.168.100.88:9088/api/core/setup/check/', {
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

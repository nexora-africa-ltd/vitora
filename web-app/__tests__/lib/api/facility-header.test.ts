/**
 * Tests that switching facility updates the X-Facility-Id header on API requests.
 */
import { setActiveFacilityId, getActiveFacilityId, apiClient } from '@/lib/api/client';

// We only mock token storage so the interceptor doesn't blow up on missing tokens.
jest.mock('@/lib/auth/storage', () => ({
  tokenStorage: {
    getAccessToken: jest.fn().mockReturnValue('fake-token'),
    getRefreshToken: jest.fn().mockReturnValue(null),
    setTokens: jest.fn(),
    clearAll: jest.fn(),
  },
}));

describe('Facility header on API requests', () => {
  afterEach(() => {
    setActiveFacilityId(null);
  });

  it('setActiveFacilityId stores the facility id', () => {
    setActiveFacilityId(42);
    expect(getActiveFacilityId()).toBe(42);
  });

  it('setActiveFacilityId(null) clears the facility id', () => {
    setActiveFacilityId(42);
    setActiveFacilityId(null);
    expect(getActiveFacilityId()).toBeNull();
  });

  it('switches the X-Facility-Id header when facility changes', async () => {
    // Facility 1
    setActiveFacilityId(1);

    // Run the request interceptor manually (without actually sending a request)
    const interceptors = (apiClient.interceptors.request as unknown as { handlers: Array<{ fulfilled: (config: Record<string, unknown>) => unknown }> }).handlers;
    const interceptor = interceptors.find((h) => h.fulfilled);
    expect(interceptor).toBeDefined();

    const config1 = { headers: {} as Record<string, string>, url: '/api/patients/' };
    const result1 = await interceptor!.fulfilled(config1);
    expect((result1 as Record<string, Record<string, string>>).headers['X-Facility-Id']).toBe('1');

    // Switch to facility 2
    setActiveFacilityId(2);
    const config2 = { headers: {} as Record<string, string>, url: '/api/encounters/' };
    const result2 = await interceptor!.fulfilled(config2);
    expect((result2 as Record<string, Record<string, string>>).headers['X-Facility-Id']).toBe('2');
  });

  it('does not attach X-Facility-Id when no facility is set', async () => {
    setActiveFacilityId(null);

    const interceptors = (apiClient.interceptors.request as unknown as { handlers: Array<{ fulfilled: (config: Record<string, unknown>) => unknown }> }).handlers;
    const interceptor = interceptors.find((h) => h.fulfilled);

    const config = { headers: {} as Record<string, string>, url: '/api/patients/' };
    const result = await interceptor!.fulfilled(config);
    expect((result as Record<string, Record<string, string>>).headers['X-Facility-Id']).toBeUndefined();
  });
});

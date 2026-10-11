// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests cloud connection state changes from desktop config and cloud-session events.
 * Run with: npm test -- use-cloud-connection.test.ts.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useCloudConnection } from '@/lib/hooks/use-cloud-connection';
import { hasCloudSession } from '@/lib/api/client';
import { getAppConfig, isDesktop } from '@/lib/desktop';

jest.mock('@/lib/api/client', () => ({ hasCloudSession: jest.fn() }));
jest.mock('@/lib/desktop', () => ({ getAppConfig: jest.fn(), isDesktop: jest.fn() }));

const mockHasCloudSession = hasCloudSession as jest.MockedFunction<typeof hasCloudSession>;
const mockGetAppConfig = getAppConfig as jest.MockedFunction<typeof getAppConfig>;
const mockIsDesktop = isDesktop as jest.MockedFunction<typeof isDesktop>;

describe('useCloudConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDesktop.mockReturnValue(true);
    mockHasCloudSession.mockReturnValue(false);
    mockGetAppConfig.mockResolvedValue({
      api_url: 'http://hub.test',
      cloud_api_url: 'https://cloud.test/',
      deployment_mode: 'lan_client',
      client_id: 'client-1',
      sync_interval_secs: 60,
      backup_interval_mins: 60,
      hub_url: 'http://hub.test',
      facility_id: '1',
      organization_id: '1',
      setup_completed: true,
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('reports signed desktop config, a required cloud session, and reachability', async () => {
    const { result } = renderHook(() => useCloudConnection());

    await waitFor(() => {
      expect(result.current).toEqual({
        config: 'configured',
        session: 'required',
        reachability: 'available',
      });
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://cloud.test/api/health/?lite=1',
      expect.anything()
    );
  });

  it('refreshes session state after a cloud-session event without attempting a login', async () => {
    const { result } = renderHook(() => useCloudConnection());
    await waitFor(() => expect(result.current.session).toBe('required'));

    mockHasCloudSession.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('vitora:cloud-session-changed')));

    await waitFor(() => expect(result.current.session).toBe('connected'));
  });

  it('does not require cloud connection outside LAN desktop mode', async () => {
    mockIsDesktop.mockReturnValue(false);
    const { result } = renderHook(() => useCloudConnection());

    await waitFor(() => {
      expect(result.current).toEqual({
        config: 'not_required',
        session: 'not_required',
        reachability: 'not_required',
      });
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

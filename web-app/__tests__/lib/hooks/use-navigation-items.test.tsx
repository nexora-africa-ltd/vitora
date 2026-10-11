// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Regression tests for standard desktop navigation during hub manifest discovery.
 * Run with: npx jest "__tests__/lib/hooks/use-navigation-items.test.tsx" --runInBand.
 * Inputs: mocked LAN desktop configuration and pending or failed hub health requests.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useNavigationItems } from '@/lib/hooks/use-navigation-items';

const mockGetAppConfig = jest.fn();
const mockLoadHubRoutingManifest = jest.fn();

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { facility: { shr_enabled: false } } }),
}));
jest.mock('@/lib/hooks/use-permissions', () => ({
  usePermissions: () => ({
    canAccessModule: () => true,
    canPerformAction: () => true,
    hasPermission: () => true,
    isSuperuser: false,
  }),
}));
jest.mock('@/lib/context/facility-context', () => ({
  useFacility: () => ({ hasModule: () => true, facilityDetail: null, facility: null }),
}));
jest.mock('@/lib/context/navigation-mode-context', () => ({
  useNavigationMode: () => ({ navigationMode: 'standard', isClinicalNavigationEligible: true }),
}));
jest.mock('@/lib/hooks/use-subscription', () => ({ useSubscription: () => ({ hasFeature: () => true }) }));
jest.mock('@/lib/hooks/use-clinics', () => ({ useClinics: () => ({ data: undefined }) }));
jest.mock('@/lib/hooks/use-network-status', () => ({ useNetworkStatus: () => ({ isSustainedOffline: false }) }));
jest.mock('@/lib/hooks/use-interfacility-transfers-enabled', () => ({
  useInterfacilityTransfersEnabled: () => true,
}));
jest.mock('@/lib/hooks/use-cloud-availability', () => ({ useCloudAvailability: () => 'available' }));
const mockUseCloudConnection = jest.fn();
jest.mock('@/lib/hooks/use-cloud-connection', () => ({
  useCloudConnection: () => mockUseCloudConnection(),
}));
jest.mock('@/lib/desktop', () => ({ getAppConfig: () => mockGetAppConfig() }));
jest.mock('@/lib/desktop/hub-capabilities', () => ({
  getHubModuleCapability: (moduleKey?: string) =>
    moduleKey === 'ai' ? 'CLOUD_ONLY' : null,
  loadHubRoutingManifest: () => mockLoadHubRoutingManifest(),
}));

describe('useNavigationItems hub manifest fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAppConfig.mockResolvedValue({ deployment_mode: 'lan_client' });
    mockUseCloudConnection.mockReturnValue({
      config: 'configured',
      session: 'connected',
      reachability: 'available',
    });
  });

  it('keeps standard navigation rendered while hub health is pending', async () => {
    mockLoadHubRoutingManifest.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useNavigationItems());

    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });
    expect(result.current.items.some((item) => item.label === 'Patients')).toBe(true);
  });

  it('keeps standard navigation rendered when hub health fails', async () => {
    mockLoadHubRoutingManifest.mockResolvedValue(null);

    const { result } = renderHook(() => useNavigationItems());

    await waitFor(() => {
      expect(result.current.items.length).toBeGreaterThan(0);
    });
    expect(result.current.items.some((item) => item.label === 'Patients')).toBe(true);
  });

  it('shows cloud-only modules only with a connected reachable cloud session', async () => {
    mockLoadHubRoutingManifest.mockResolvedValue(null);

    const { result } = renderHook(() => useNavigationItems());

    await waitFor(() => {
      expect(result.current.items.some((item) => item.label === 'TibaBot®')).toBe(true);
    });
  });

  it('hides cloud-only modules when the cloud session is missing', async () => {
    mockLoadHubRoutingManifest.mockResolvedValue(null);
    mockUseCloudConnection.mockReturnValue({
      config: 'configured',
      session: 'required',
      reachability: 'available',
    });

    const { result } = renderHook(() => useNavigationItems());

    await waitFor(() => {
      expect(result.current.items.some((item) => item.label === 'Patients')).toBe(true);
    });
    expect(result.current.items.some((item) => item.label === 'TibaBot®')).toBe(false);
  });
});

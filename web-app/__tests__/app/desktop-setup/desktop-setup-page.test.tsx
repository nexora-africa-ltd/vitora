// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * First-install desktop setup discovery tests.
 * Run with: npx jest __tests__/app/desktop-setup/desktop-setup-page.test.tsx --runInBand.
 * Inputs: mocked Tauri bridge and hub health discovery responses.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DesktopSetupPage from '@/app/desktop-setup/page';

const mockDiscoverNativeHubs = jest.fn();
const mockDiscoverHub = jest.fn();
const mockProbeHub = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/desktop', () => ({
  isDesktop: () => true,
  discoverNativeHubs: (...args: unknown[]) => mockDiscoverNativeHubs(...args),
  setApiUrl: jest.fn(),
  setDeploymentMode: jest.fn(),
  saveHubConfig: jest.fn(),
}));
jest.mock('@/lib/desktop/hub-discovery', () => ({
  discoverHub: (...args: unknown[]) => mockDiscoverHub(...args),
  probeHub: (...args: unknown[]) => mockProbeHub(...args),
}));

describe('DesktopSetupPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses verified native UDP discovery before the HTTP scan on first install', async () => {
    mockDiscoverNativeHubs.mockResolvedValue([
      {
        url: 'http://192.168.100.88:9088',
        facility_id: 'facility-1',
        facility_name: 'Sample Clinic',
        hub_id: 'hub-1',
        version: '1.0.21',
      },
    ]);
    mockProbeHub.mockResolvedValue({
      url: 'http://192.168.100.88:9088',
      facilityId: 'facility-1',
      organizationId: 'organization-1',
      facilityName: 'Sample Clinic',
      hubId: 'hub-1',
      version: '1.0.21',
    });

    render(<DesktopSetupPage />);
    fireEvent.click(screen.getByLabelText(/facility workstation/i));
    fireEvent.click(screen.getByRole('button', { name: /scan network/i }));

    await waitFor(() => {
      expect(mockDiscoverNativeHubs).toHaveBeenCalledTimes(1);
      expect(mockProbeHub).toHaveBeenCalledWith('http://192.168.100.88:9088', 2000);
    });

    expect(mockDiscoverHub).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/api server url/i)).toHaveValue('http://192.168.100.88:9088');
    expect(screen.getByText(/hub found/i)).toBeInTheDocument();
  });
});

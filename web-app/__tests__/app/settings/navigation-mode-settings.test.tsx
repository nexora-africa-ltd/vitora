import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from '@/app/(dashboard)/settings/page';

const mockUseNavigationMode = jest.fn();

jest.mock('@/lib/context/navigation-mode-context', () => ({
  useNavigationMode: () => mockUseNavigationMode(),
}));

jest.mock('@/components/settings/sha-settings', () => ({
  SHASettingsTab: () => <div>SHA Settings</div>,
}));

jest.mock('@/components/settings/mfa-settings', () => ({
  MFASettingsTab: () => <div>MFA Settings</div>,
}));

jest.mock('@/components/settings/facility-settings', () => ({
  FacilitySettingsTab: () => <div>Facility Settings</div>,
}));

describe('Settings navigation mode controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNavigationMode.mockReturnValue({
      navigationMode: 'standard',
      setNavigationMode: jest.fn(),
      isClinicalNavigationEligible: true,
    });
  });

  it('renders navigation mode controls in the Appearance tab for eligible users', async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));

    expect(await screen.findByText('Navigation Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Clinical Mode')).toBeInTheDocument();
  });

  it('updates the navigation mode when the user selects Clinical Mode', async () => {
    const setNavigationMode = jest.fn();
    mockUseNavigationMode.mockReturnValue({
      navigationMode: 'standard',
      setNavigationMode,
      isClinicalNavigationEligible: true,
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));

    const clinicalMode = await screen.findByLabelText('Clinical Mode');
    fireEvent.click(clinicalMode);

    expect(setNavigationMode).toHaveBeenCalledWith('clinical');
  });

  it('shows rollout guidance instead of a broken control for ineligible users', async () => {
    mockUseNavigationMode.mockReturnValue({
      navigationMode: 'standard',
      setNavigationMode: jest.fn(),
      isClinicalNavigationEligible: false,
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));

    await waitFor(() => {
      expect(screen.getByText(/clinical mode is currently available to clinical roles/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Clinical Mode')).not.toBeInTheDocument();
  });
});

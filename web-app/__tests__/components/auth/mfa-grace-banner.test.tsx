// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/** Tests MFA grace-banner reconciliation against the authenticated MFA status endpoint. */
import { act, render, screen, waitFor } from '@testing-library/react';
import { MFAGraceBanner } from '@/components/auth/mfa-grace-banner';
import { mfaApi } from '@/lib/api/mfa';

jest.mock('@/lib/api/mfa', () => ({
  mfaApi: { getStatus: jest.fn() },
}));

describe('MFAGraceBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
  });

  it('removes stale grace state after MFA has been enabled', async () => {
    localStorage.setItem(
      'vitora_mfa_grace_deadline',
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );
    (mfaApi.getStatus as jest.Mock).mockResolvedValue({ mfa_enabled: true });

    render(<MFAGraceBanner />);

    await waitFor(() => {
      expect(localStorage.getItem('vitora_mfa_grace_deadline')).toBeNull();
    });
    expect(screen.queryByText(/multi-factor authentication is required for your role/i)).toBeNull();
  });

  it('hides immediately when MFA enrollment completes in the active page', async () => {
    localStorage.setItem(
      'vitora_mfa_grace_deadline',
      new Date(Date.now() + 60 * 60 * 1000).toISOString()
    );
    (mfaApi.getStatus as jest.Mock).mockResolvedValue({ mfa_enabled: false });

    render(<MFAGraceBanner />);
    await screen.findByText(/multi-factor authentication is required for your role/i);

    act(() => {
      window.dispatchEvent(new Event('vitora:mfa-enabled'));
    });

    await waitFor(() => {
      expect(screen.queryByText(/multi-factor authentication is required for your role/i)).toBeNull();
    });
  });
});

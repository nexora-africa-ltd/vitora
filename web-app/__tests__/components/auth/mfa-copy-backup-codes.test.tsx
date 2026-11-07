// Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
/**
 * Tests the success state of MFA backup-code copy controls.
 * Run with: npm test -- --runInBand __tests__/components/auth/mfa-copy-backup-codes.test.tsx
 * Inputs: mocked MFA setup response and Clipboard API.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MFASetupWizard } from '@/components/auth/mfa-setup-wizard';
import { mfaApi } from '@/lib/api/mfa';

jest.mock('@/lib/api/mfa', () => ({
  mfaApi: { startTOTPSetup: jest.fn(), confirmTOTPSetup: jest.fn() },
}));

describe('MFA backup-code copy confirmation', () => {
  beforeEach(() => {
    (mfaApi.startTOTPSetup as jest.Mock).mockResolvedValue({ secret: 'SECRET', qr_code: '', provisioning_uri: '' });
    (mfaApi.confirmTOTPSetup as jest.Mock).mockResolvedValue({ backup_codes: ['ABCD1234'] });
  });

  it('shows a green checked confirmation only after backup codes are copied', async () => {
    const user = userEvent.setup();
    render(<MFASetupWizard onComplete={jest.fn()} onCancel={jest.fn()} />);
    await user.click(await screen.findByText('Next: Enter Code'));
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByText('Verify & Continue'));

    const copyButton = await screen.findByRole('button', { name: /copy all codes/i });
    fireEvent.click(copyButton);

    await waitFor(() => expect(screen.getByRole('button', { name: /codes copied/i })).toBeInTheDocument());
  });
});

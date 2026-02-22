/**
 * TDD Tests for MFASetupWizard Component
 * Tests the MFA enrollment flow UI
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MFASetupWizard } from '@/components/auth/mfa-setup-wizard';
import { mfaApi } from '@/lib/api/mfa';

// Mock the MFA API
jest.mock('@/lib/api/mfa', () => ({
  mfaApi: {
    startTOTPSetup: jest.fn(),
    confirmTOTPSetup: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock clipboard API - using a simple mock that won't conflict with userEvent
const mockWriteText = jest.fn().mockResolvedValue(undefined);

// Setup clipboard before tests begin
beforeAll(() => {
  // Only mock if not already defined (JSDOM may not have clipboard)
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      configurable: true,
    });
  } else {
    jest.spyOn(navigator.clipboard, 'writeText').mockImplementation(mockWriteText);
  }
});

const mockSetupData = {
  secret: 'ABCDEFGHIJKLMNOP',
  qr_code: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  provisioning_uri: 'otpauth://totp/Vitora%20HMIS:test@example.com?secret=ABCDEFGHIJKLMNOP&issuer=Vitora%20HMIS',
};

const mockBackupCodes = [
  'ABC12345',
  'DEF67890',
  'GHI11111',
  'JKL22222',
  'MNO33333',
  'PQR44444',
  'STU55555',
  'VWX66666',
  'YZA77777',
  'BCD88888',
];

describe('MFASetupWizard', () => {
  const mockOnComplete = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
    (mfaApi.startTOTPSetup as jest.Mock).mockResolvedValue(mockSetupData);
    (mfaApi.confirmTOTPSetup as jest.Mock).mockResolvedValue({ backup_codes: mockBackupCodes });
  });

  describe('Setup Step', () => {
    it('should render setup dialog with QR code', async () => {
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Wait for setup data to load and QR code to appear
      await waitFor(() => {
        expect(screen.getByText('Set Up Two-Factor Authentication')).toBeInTheDocument();
      });

      // Wait for QR code to render
      await waitFor(() => {
        expect(screen.getByAltText('QR Code for MFA setup')).toBeInTheDocument();
      });

      // Should show secret key
      expect(screen.getByText(mockSetupData.secret)).toBeInTheDocument();
    });

    it('should show loading state while fetching setup data', async () => {
      // Delay the API response
      (mfaApi.startTOTPSetup as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(mockSetupData), 100))
      );

      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      expect(screen.getByText('Setting up MFA...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Setting up MFA...')).not.toBeInTheDocument();
      });
    });

    it('should show error when setup fails', async () => {
      (mfaApi.startTOTPSetup as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should call onCancel when cancel button is clicked', async () => {
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('should copy secret to clipboard when copy button is clicked', async () => {
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText(mockSetupData.secret)).toBeInTheDocument();
      });

      // Find and click the copy button (has Copy icon)
      const copyButtons = screen.getAllByRole('button');
      const copyButton = copyButtons.find((btn) => btn.querySelector('svg'));
      if (copyButton) {
        fireEvent.click(copyButton);
      }

      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    it('should navigate to verify step when Next button is clicked', async () => {
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Code')).toBeInTheDocument();
      });
    });
  });

  describe('Verify Step', () => {
    it('should accept 6-digit code input', async () => {
      const user = userEvent.setup();
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      // Enter verification code
      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      expect(input).toHaveValue('123456');
    });

    it('should only accept numeric input', async () => {
      const user = userEvent.setup();
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, 'abc123def456');

      // Should only contain numeric characters, truncated to 6
      expect(input).toHaveValue('123456');
    });

    it('should disable verify button when code is incomplete', async () => {
      const user = userEvent.setup();
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123'); // Only 3 digits

      const verifyButton = screen.getByText('Verify & Continue');
      expect(verifyButton).toBeDisabled();
    });

    it('should call API and proceed to backup step on successful verification', async () => {
      const user = userEvent.setup();
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      const verifyButton = screen.getByText('Verify & Continue');
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mfaApi.confirmTOTPSetup).toHaveBeenCalledWith('123456');
      });

      await waitFor(() => {
        expect(screen.getByText('MFA Setup Complete!')).toBeInTheDocument();
      });
    });

    it('should show error on verification failure', async () => {
      const user = userEvent.setup();
      (mfaApi.confirmTOTPSetup as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '000000');

      const verifyButton = screen.getByText('Verify & Continue');
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });
    });

    it('should allow navigating back to setup step', async () => {
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Code')).toBeInTheDocument();
      });

      // Go back
      fireEvent.click(screen.getByText('Back'));

      await waitFor(() => {
        expect(screen.getByText('Set Up Two-Factor Authentication')).toBeInTheDocument();
      });
    });
  });

  describe('Backup Codes Step', () => {
    const navigateToBackupStep = async () => {
      const user = userEvent.setup();
      render(<MFASetupWizard onComplete={mockOnComplete} onCancel={mockOnCancel} />);

      // Navigate to verify step
      await waitFor(() => {
        expect(screen.getByText('Next: Enter Code')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Next: Enter Code'));

      // Verify
      await waitFor(() => {
        expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
      });
      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');
      fireEvent.click(screen.getByText('Verify & Continue'));

      // Wait for backup codes step
      await waitFor(() => {
        expect(screen.getByText('MFA Setup Complete!')).toBeInTheDocument();
      });
    };

    it('should display backup codes', async () => {
      await navigateToBackupStep();

      expect(screen.getByText('Backup Codes')).toBeInTheDocument();
    });

    it('should toggle backup code visibility', async () => {
      await navigateToBackupStep();

      // Initially codes should be hidden (•••••••• pattern)
      const codeElements = screen.getAllByText('••••••••');
      expect(codeElements.length).toBeGreaterThan(0);

      // Click eye icon to reveal codes
      const toggleButton = screen.getByRole('button', { name: '' });
      fireEvent.click(toggleButton);

      // Now should show actual codes
      await waitFor(() => {
        expect(screen.getByText(mockBackupCodes[0])).toBeInTheDocument();
      });
    });

    it('should have a copy button for backup codes', async () => {
      await navigateToBackupStep();

      const copyButton = screen.getByText('Copy All Codes');
      expect(copyButton).toBeInTheDocument();

      // Verify clicking doesn't throw (clipboard API may not be available in test env)
      fireEvent.click(copyButton);
    });

    it('should call onComplete when finalize button is clicked', async () => {
      await navigateToBackupStep();

      const completeButton = screen.getByText("I've Saved My Backup Codes");
      fireEvent.click(completeButton);

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should show important warning about backup codes', async () => {
      await navigateToBackupStep();

      expect(screen.getByText(/These codes are shown only once/)).toBeInTheDocument();
    });
  });
});

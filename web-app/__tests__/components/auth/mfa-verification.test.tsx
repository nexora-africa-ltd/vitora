/**
 * TDD Tests for MFAVerification Component
 * Tests the MFA verification flow during login
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MFAVerification } from '@/components/auth/mfa-verification';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuth
const mockVerifyMFA = jest.fn();
jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    verifyMFA: mockVerifyMFA,
  }),
}));

describe('MFAVerification', () => {
  const mockMfaToken = 'test-mfa-token-12345';
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyMFA.mockResolvedValue(undefined);
  });

  describe('Rendering', () => {
    it('should render the verification dialog', () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
      expect(screen.getByText('Enter your authentication code to complete login')).toBeInTheDocument();
    });

    it('should show authenticator app and backup code tabs', () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      expect(screen.getByText('Authenticator App')).toBeInTheDocument();
      expect(screen.getByText('Backup Code')).toBeInTheDocument();
    });

    it('should default to authenticator app tab', () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
    });
  });

  describe('TOTP Token Input', () => {
    it('should accept 6-digit code input', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      expect(input).toHaveValue('123456');
    });

    it('should only accept numeric input', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, 'abc123xyz456');

      // Should only contain numeric characters, truncated to 6
      expect(input).toHaveValue('123456');
    });

    it('should truncate input to 6 digits', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456789');

      expect(input).toHaveValue('123456');
    });

    it('should disable verify button when code is incomplete', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123'); // Only 3 digits

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      expect(verifyButton).toBeDisabled();
    });

    it('should enable verify button when code is complete', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      expect(verifyButton).not.toBeDisabled();
    });
  });

  describe('TOTP Verification Flow', () => {
    it('should call verifyMFA with token on submit', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyMFA).toHaveBeenCalledWith(mockMfaToken, { token: '123456' });
      });
    });

    it('should redirect to home on successful verification', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('should show error message on verification failure', async () => {
      const user = userEvent.setup();
      mockVerifyMFA.mockRejectedValue(new Error('Invalid token'));

      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '000000');

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid token')).toBeInTheDocument();
      });
    });

    it('should show loading state during verification', async () => {
      const user = userEvent.setup();
      // Delay the verification
      mockVerifyMFA.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const input = screen.getByLabelText('6-digit code');
      await user.type(input, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Verifying...')).toBeInTheDocument();
      });
    });
  });

  describe('Backup Code Tab', () => {
    it('should switch to backup code tab', async () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });
    });

    it('should accept backup code input', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Backup code');
      await user.type(input, 'abcd1234');

      // Should convert to uppercase
      expect(input).toHaveValue('ABCD1234');
    });

    it('should disable backup verify button when code is empty', async () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const verifyButton = screen.getByRole('button', { name: /verify backup code/i });
      expect(verifyButton).toBeDisabled();
    });

    it('should enable backup verify button when code is entered', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Backup code');
      await user.type(input, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /verify backup code/i });
      expect(verifyButton).not.toBeDisabled();
    });
  });

  describe('Backup Code Verification Flow', () => {
    it('should call verifyMFA with backup code on submit', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Backup code');
      await user.type(input, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /verify backup code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyMFA).toHaveBeenCalledWith(mockMfaToken, { backupCode: 'ABCD1234' });
      });
    });

    it('should redirect to home on successful backup code verification', async () => {
      const user = userEvent.setup();
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Backup code');
      await user.type(input, 'ABCD1234');

      const verifyButton = screen.getByRole('button', { name: /verify backup code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('should show error on backup code verification failure', async () => {
      const user = userEvent.setup();
      mockVerifyMFA.mockRejectedValue(new Error('Invalid backup code'));

      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      fireEvent.click(screen.getByText('Backup Code'));

      await waitFor(() => {
        expect(screen.getByLabelText('Backup code')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Backup code');
      await user.type(input, 'INVALID1');

      const verifyButton = screen.getByRole('button', { name: /verify backup code/i });
      fireEvent.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid backup code')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Flow', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      render(<MFAVerification mfaToken={mockMfaToken} onCancel={mockOnCancel} />);

      const cancelButton = screen.getByText('Back to Login');
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });
});

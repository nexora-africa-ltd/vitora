'use client';

/**
 * MFA Toast Helpers
 *
 * Provides consistent toast notifications for MFA operations.
 * Uses sonner toast with semantic variants for different feedback types.
 */

import { toast } from 'sonner';

/**
 * Toast variants for MFA operations
 */
export type MFAToastVariant = 'success' | 'error' | 'warning' | 'info';

/**
 * Common MFA error codes and user-friendly messages
 */
const MFA_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  invalid_token: {
    title: 'Invalid Code',
    description: 'The code you entered is incorrect. Please check your authenticator app and try again.',
  },
  token_expired: {
    title: 'Code Expired',
    description: 'This code has expired. Wait for a new code in your authenticator app.',
  },
  invalid_backup_code: {
    title: 'Invalid Backup Code',
    description: 'This backup code is invalid or has already been used.',
  },
  mfa_required: {
    title: 'Verification Required',
    description: 'Please complete two-factor authentication to continue.',
  },
  too_many_attempts: {
    title: 'Too Many Attempts',
    description: 'You\'ve made too many attempts. Please wait a few minutes before trying again.',
  },
  session_expired: {
    title: 'Session Expired',
    description: 'Your session has expired. Please log in again.',
  },
  network_error: {
    title: 'Connection Error',
    description: 'Unable to verify. Please check your internet connection.',
  },
};

/**
 * Parse error message from backend response
 */
function parseErrorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Map common error patterns to codes
    if (message.includes('invalid') && message.includes('token')) {
      return { code: 'invalid_token', message: error.message };
    }
    if (message.includes('expired')) {
      return { code: 'token_expired', message: error.message };
    }
    if (message.includes('backup')) {
      return { code: 'invalid_backup_code', message: error.message };
    }
    if (message.includes('too many') || message.includes('rate limit')) {
      return { code: 'too_many_attempts', message: error.message };
    }
    if (message.includes('network') || message.includes('fetch')) {
      return { code: 'network_error', message: error.message };
    }

    return { code: 'unknown', message: error.message };
  }

  return { code: 'unknown', message: 'An unexpected error occurred' };
}

/**
 * Show MFA verification success toast
 */
export function showMFASuccess(message?: string) {
  toast.success(message || 'Verification successful', {
    description: 'You have been logged in securely.',
    duration: 3000,
  });
}

/**
 * Show MFA verification error toast with actionable guidance
 */
export function showMFAError(error: unknown) {
  const { code, message } = parseErrorMessage(error);
  const mapped = MFA_ERROR_MESSAGES[code];

  if (mapped) {
    toast.error(mapped.title, {
      description: mapped.description,
      duration: 6000,
    });
  } else {
    toast.error('Verification Failed', {
      description: message || 'Please try again or use a backup code.',
      duration: 6000,
    });
  }
}

/**
 * Show MFA info/guidance toast
 */
export function showMFAInfo(title: string, description: string) {
  toast.info(title, {
    description,
    duration: 4000,
  });
}

/**
 * Show toast when switching to backup code entry
 */
export function showBackupCodeHint() {
  toast.info('Using Backup Code', {
    description: 'Enter one of your backup codes. Each code can only be used once.',
    duration: 4000,
  });
}

/**
 * Show toast for code input guidance
 */
export function showCodeEntryHint() {
  toast.info('Enter Your Code', {
    description: 'Open your authenticator app and enter the 6-digit code shown.',
    duration: 4000,
  });
}

/**
 * Show warning for low backup codes remaining
 */
export function showLowBackupCodesWarning(remaining: number) {
  if (remaining <= 2) {
    toast.warning('Low Backup Codes', {
      description: `Only ${remaining} backup code${remaining === 1 ? '' : 's'} remaining. Consider generating new ones.`,
      duration: 5000,
    });
  }
}

/**
 * MFA Toast object for consistent API
 */
export const mfaToast = {
  success: showMFASuccess,
  error: showMFAError,
  info: showMFAInfo,
  backupCodeHint: showBackupCodeHint,
  codeEntryHint: showCodeEntryHint,
  lowBackupCodesWarning: showLowBackupCodesWarning,
  expired: () => {
    toast.warning('Verification Expired', {
      description: 'The verification window has expired. Please sign in again to generate a new code.',
      duration: 6000,
    });
  },
};

export default mfaToast;

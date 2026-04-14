import type { ApiError } from '@/lib/api/client';

export function isOfflineSyncError(error: ApiError): boolean {
  if (error.status === 0) {
    return true;
  }

  return /network|internet|timeout|socket/i.test(error.message);
}

export function isConflictError(error: ApiError): boolean {
  return error.status === 409;
}

export function getSyncFailureMessage(error: ApiError): string {
  return error.message || 'Sync failed.';
}

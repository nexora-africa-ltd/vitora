'use client';

/**
 * License degraded-mode banner.
 *
 * Shows a persistent warning banner when:
 * - License is expired or suspended (writes blocked)
 * - Check-in is overdue (offline for >30 days)
 *
 * Can be dismissed for the session but re-appears on page reload.
 */

import { useState } from 'react';
import { useLicense } from '@/lib/context/license-context';
import { AlertTriangle, X, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LicenseBanner() {
  const { license, isDegraded, isCheckInOverdue, isLoading } = useLicense();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if loading, valid, or dismissed
  if (isLoading || (!isDegraded && !isCheckInOverdue) || dismissed) {
    return null;
  }

  const isExpired = license?.subscription_status === 'EXPIRED';
  const isSuspended = license?.subscription_status === 'SUSPENDED';

  let message: string;
  let Icon = AlertTriangle;

  if (isSuspended) {
    message = 'Your license has been suspended. Contact Nexora to resolve.';
  } else if (isExpired) {
    message = 'Your subscription has expired. New records cannot be created until renewed.';
  } else if (isCheckInOverdue) {
    message =
      'This installation has not connected to the internet in over 30 days. Connect to refresh your license.';
    Icon = WifiOff;
  } else if (isDegraded && !license) {
    // Server-side degradation detected (web mode, no local token)
    message = 'Your subscription has expired. New records cannot be created until renewed.';
  } else {
    message = 'License verification failed. Some features may be limited.';
  }

  return (
    <div className="relative flex items-center gap-3 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2.5 text-sm rounded-md">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {isCheckInOverdue && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

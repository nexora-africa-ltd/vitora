'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { mfaApi } from '@/lib/api/mfa';

const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';
const MFA_BANNER_DISMISSED_KEY = 'vitora_mfa_banner_dismissed';

/**
 * Dismissible banner shown when MFA setup is required but the
 * grace period is still active. Reads the deadline from localStorage
 * (set during login when mfa_setup_required + mfa_grace_deadline are returned).
 */
export function MFAGraceBanner() {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [deadline, setDeadline] = useState<Date | null>(null);

  // Reconcile persisted grace state with the server so an MFA setup completed
  // in a previous page view cannot leave a stale warning after refresh.
  useEffect(() => {
    let isActive = true;

    const loadGraceState = async () => {
      try {
        const status = await mfaApi.getStatus();
        if (status.mfa_enabled) {
          localStorage.removeItem(MFA_GRACE_KEY);
          return;
        }
      } catch {
        // Preserve the local warning if status cannot be checked (for example, offline mode).
      }

      if (!isActive) return;
      const raw = localStorage.getItem(MFA_GRACE_KEY);
      if (!raw) return;

      const dl = new Date(raw);
      if (isNaN(dl.getTime()) || dl.getTime() <= Date.now()) return;

      if (sessionStorage.getItem(MFA_BANNER_DISMISSED_KEY) === 'true') {
        setDismissed(true);
      }
      setDeadline(dl);
    };

    void loadGraceState();
    const handleMfaEnabled = () => {
      localStorage.removeItem(MFA_GRACE_KEY);
      setDeadline(null);
      setTimeLeft(null);
    };
    window.addEventListener('vitora:mfa-enabled', handleMfaEnabled);
    return () => {
      isActive = false;
      window.removeEventListener('vitora:mfa-enabled', handleMfaEnabled);
    };
  }, []);

  // Update countdown every minute
  useEffect(() => {
    if (!deadline) return;

    const update = () => {
      const diff = deadline.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [deadline]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(MFA_BANNER_DISMISSED_KEY, 'true');
  }, []);

  if (!deadline || !timeLeft || dismissed) return null;

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
      <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-amber-800 dark:text-amber-200">
          Multi-factor authentication is required for your role. Please set it up within{' '}
          <strong>{timeLeft}</strong> to maintain access.
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            <Link href="/settings?tab=security">Set up MFA</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-amber-600 dark:text-amber-400"
            onClick={handleDismiss}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

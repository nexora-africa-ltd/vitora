'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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

  // Read the grace deadline from localStorage on mount
  useEffect(() => {
    const raw = localStorage.getItem(MFA_GRACE_KEY);
    if (!raw) return;

    const dl = new Date(raw);
    if (isNaN(dl.getTime())) return;

    // Already expired — don't show banner (interceptor will redirect)
    if (dl.getTime() <= Date.now()) return;

    // Check if previously dismissed this session
    if (sessionStorage.getItem(MFA_BANNER_DISMISSED_KEY) === 'true') {
      setDismissed(true);
    }

    setDeadline(dl);
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
        <span className="flex items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-400 dark:text-amber-300 dark:hover:bg-amber-900/30">
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

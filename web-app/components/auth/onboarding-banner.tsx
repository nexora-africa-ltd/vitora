'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

const ONBOARDING_BANNER_DISMISSED_KEY = 'vitora_onboarding_banner_dismissed';
const ADMIN_ROLES = ['ADMIN', 'ORG-ADMIN', 'OWNER'];

/**
 * Dismissible banner shown to org admins when onboarding is incomplete.
 * Only visible during the grace period (before middleware blocks access).
 */
export function OnboardingBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Only show for admin roles with incomplete onboarding
    const isAdmin = ADMIN_ROLES.includes(user.role || '');
    if (!isAdmin || user.onboarding_complete !== false) return;

    // Check if dismissed this session
    if (sessionStorage.getItem(ONBOARDING_BANNER_DISMISSED_KEY) === 'true') {
      setDismissed(true);
      return;
    }

    setVisible(true);
  }, [user]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    sessionStorage.setItem(ONBOARDING_BANNER_DISMISSED_KEY, 'true');
  }, []);

  if (!visible || dismissed) return null;

  return (
    <Alert className="mb-4 border-blue-500/50 bg-blue-50 dark:bg-blue-950/20">
      <ClipboardList className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-blue-800 dark:text-blue-200">
          Your organization setup is incomplete. Complete the onboarding checklist to unlock all features.
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <Button
            asChild
            size="sm"
            variant="outline"
            className="border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900/30"
          >
            <Link href="/onboarding">Complete Setup</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-blue-600 dark:text-blue-400"
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

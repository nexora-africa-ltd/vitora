'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { MFASetupWizard } from '@/components/auth/mfa-setup-wizard';

const MFA_GRACE_KEY = 'vitora_mfa_grace_deadline';

/**
 * Full-screen blocking overlay displayed when MFA setup is required and
 * the grace period has expired. Prevents any navigation or interaction
 * with the underlying application until MFA is configured.
 */
export function MFAEnforcementOverlay() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  useEffect(() => {
    const checkGraceExpired = () => {
      const raw = localStorage.getItem(MFA_GRACE_KEY);
      if (!raw) return false;

      const deadline = new Date(raw);
      if (isNaN(deadline.getTime())) return false;

      return deadline.getTime() <= Date.now();
    };

    if (checkGraceExpired()) {
      setShowOverlay(true);
    }

    // Also listen for the API interceptor 403 mfa_setup_required event
    const handleMfaRequired = () => {
      setShowOverlay(true);
    };
    window.addEventListener('vitora:mfa-enforcement', handleMfaRequired);

    // Re-check every minute in case the grace period expires while the user is active
    const interval = setInterval(() => {
      if (checkGraceExpired()) {
        setShowOverlay(true);
      }
    }, 60_000);

    return () => {
      window.removeEventListener('vitora:mfa-enforcement', handleMfaRequired);
      clearInterval(interval);
    };
  }, []);

  // Block browser back/forward navigation
  useEffect(() => {
    if (!showOverlay) return;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      // Push the current state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
    };

    // Push state so we can intercept back button
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    // Block keyboard shortcuts for navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Alt+Left/Right (browser back/forward)
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
      }
      // Block Ctrl+L / Cmd+L (address bar focus)
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [showOverlay]);

  const handleSetupComplete = useCallback(() => {
    setShowSetupWizard(false);
    setShowOverlay(false);
    // Clear the grace deadline since MFA is now set up
    localStorage.removeItem(MFA_GRACE_KEY);
    // Reload to clear any stale state
    window.location.reload();
  }, []);

  if (!showOverlay) return null;

  // When the setup wizard is open, render it without the enforcement backdrop.
  // The wizard uses a Radix Dialog (z-50) which provides its own overlay and
  // portals to <body>. Rendering it inside our z-[100] backdrop causes the
  // dialog content to sit behind that backdrop, dimming all text to near-invisible.
  if (showSetupWizard) {
    return (
      <MFASetupWizard onComplete={handleSetupComplete} onCancel={() => setShowSetupWizard(false)} />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md">
        <div className="rounded-lg border bg-card p-6 shadow-lg">
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <Shield className="h-8 w-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Multi-Factor Authentication Required</h2>
              <p className="text-sm text-muted-foreground">
                Your MFA setup grace period has expired. You must configure multi-factor
                authentication before you can continue using the system.
              </p>
            </div>

            <div className="flex w-full items-start gap-2 rounded-md border border-amber-500/50 bg-amber-50 p-3 dark:bg-amber-950/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-left text-xs text-amber-800 dark:text-amber-200">
                Access to all system features is blocked until MFA is enabled. This is required by
                your organization&apos;s security policy.
              </p>
            </div>

            <button
              onClick={() => setShowSetupWizard(true)}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Set Up MFA Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

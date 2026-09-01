'use client';

/**
 * New Version Toast
 *
 * Uses Sonner toast to notify users when a new app version is available.
 * Shows a toast with a circular countdown timer that auto-dismisses after 30s.
 * Mobile responsive — stacks vertically on small screens.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useVersionCheck } from '@/lib/hooks/use-version-check';
import { getPendingUserData } from '@/lib/utils/version-check';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOAST_DURATION_S = 30;

/* ---------- Circular countdown ring ---------- */
function CountdownRing({ durationS, onComplete }: { durationS: number; onComplete: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = Date.now();
    const tick = () => {
      const s = (Date.now() - startRef.current) / 1000;
      if (s >= durationS) {
        setElapsed(durationS);
        onComplete();
        return;
      }
      setElapsed(s);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [durationS, onComplete]);

  const remaining = Math.max(0, Math.ceil(durationS - elapsed));
  const progress = elapsed / durationS; // 0 → 1
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);

  return (
    <div className="relative flex shrink-0 items-center justify-center" aria-hidden="true">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        {/* Track */}
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-muted/30"
        />
        {/* Progress — depletes as time passes */}
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="text-emerald-500 transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-muted-foreground">
        {remaining}
      </span>
    </div>
  );
}

/* ---------- Toast content ---------- */
interface VersionToastProps {
  id: string | number;
  onRefresh: () => Promise<void>;
  onDismiss: () => void;
  pendingCount: number;
}

function VersionToastContent({ id, onRefresh, onDismiss, pendingCount }: VersionToastProps) {
  const handleRefresh = async () => {
    toast.dismiss(id);
    await onRefresh();
  };

  const handleDismiss = useCallback(() => {
    toast.dismiss(id);
    onDismiss();
  }, [id, onDismiss]);

  return (
    <div
      className={cn(
        'relative flex w-full items-start gap-2.5 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl',
        'p-3 pr-7 sm:gap-3 sm:p-4 sm:pr-8',
        'border-emerald-500/40 ring-1 ring-emerald-500/10',
        'mb-14 sm:mb-0' // clear floating buttons on mobile
      )}
    >
      {/* Accent gradient top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-500" />

      {/* Countdown ring — hidden on very small screens */}
      <div className="mt-0.5 hidden sm:flex">
        <CountdownRing durationS={TOAST_DURATION_S} onComplete={handleDismiss} />
      </div>

      {/* Icon on mobile (replaces ring) */}
      <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 sm:hidden" />

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight sm:text-base">
          New version available
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground sm:text-sm">
          Refresh to get the latest updates
          {pendingCount > 0 && (
            <span className="mt-0.5 block text-amber-500">
              {pendingCount} unsaved item{pendingCount !== 1 ? 's' : ''} will be preserved
            </span>
          )}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={handleRefresh}
            className="h-7 gap-1.5 bg-emerald-600 text-xs hover:bg-emerald-700"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-7 text-xs text-muted-foreground"
          >
            Dismiss
          </Button>
        </div>
      </div>

      {/* Close X */}
      <button
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-muted/50 hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Mobile countdown — thin bar at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-xl bg-muted/30 sm:hidden">
        <div className="h-full origin-left animate-shrinkBar rounded-full bg-emerald-500" />
      </div>
    </div>
  );
}

/* ---------- Controller ---------- */
export function NewVersionToast() {
  const { newVersionAvailable, refresh, dismiss } = useVersionCheck();
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (newVersionAvailable && !toastShownRef.current) {
      toastShownRef.current = true;
      const pendingData = getPendingUserData();

      toast.custom(
        (id) => (
          <VersionToastContent
            id={id}
            onRefresh={refresh}
            onDismiss={dismiss}
            pendingCount={pendingData.count}
          />
        ),
        {
          // Sonner duration handles auto-remove from DOM after countdown
          duration: (TOAST_DURATION_S + 1) * 1000,
          id: 'new-version-toast',
        }
      );
    }

    if (!newVersionAvailable) {
      toastShownRef.current = false;
    }
  }, [newVersionAvailable, refresh, dismiss]);

  return null;
}

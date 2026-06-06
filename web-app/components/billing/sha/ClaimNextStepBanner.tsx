/**
 * ClaimNextStepBanner — Single prioritized prompt for the SHA claim detail page.
 *
 * Replaces the trio of "rejected / missing docs / consent required" alerts
 * with one banner driven by `useClaimNextStep`.
 */
'use client';

import React from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ClaimNextStep } from '@/lib/hooks/use-claim-next-step';

interface ClaimNextStepBannerProps {
  step: ClaimNextStep;
  onCtaClick?: (step: ClaimNextStep) => void;
  isBusy?: boolean;
  /** Hidden when `false`. Useful for tabs that own their own action UI. */
  showCta?: boolean;
  className?: string;
}

const SEVERITY_STYLES: Record<ClaimNextStep['severity'], string> = {
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
  warning: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200',
  info: 'border-primary/30 bg-primary/5 text-foreground',
  success: 'border-emerald-300/60 bg-emerald-50 text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200',
};

const SEVERITY_ICON: Record<ClaimNextStep['severity'], React.ComponentType<{ className?: string }>> = {
  destructive: AlertCircle,
  warning: Clock,
  info: ArrowRight,
  success: CheckCircle2,
};

export function ClaimNextStepBanner({
  step,
  onCtaClick,
  isBusy = false,
  showCta = true,
  className,
}: ClaimNextStepBannerProps) {
  if (!step.title) return null;

  const Icon = SEVERITY_ICON[step.severity];
  const hasCta = showCta && !step.blocked && step.ctaLabel && onCtaClick;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4',
        SEVERITY_STYLES[step.severity],
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{step.title}</p>
          {step.description && (
            <p className="text-xs sm:text-sm opacity-90 mt-0.5">{step.description}</p>
          )}
        </div>
      </div>
      {hasCta && (
        <Button
          size="sm"
          variant={step.severity === 'destructive' ? 'destructive' : 'default'}
          onClick={() => onCtaClick?.(step)}
          disabled={isBusy}
          className="shrink-0 self-start sm:self-auto"
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {step.ctaLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * ClaimStatusTimeline — Horizontal pipeline showing the claim's lifecycle.
 *
 * Replaces the verbose 4-row "Timeline" card with a scannable pipeline:
 * Created → Submitted → Acknowledged → Processed → Paid
 */
'use client';

import React from 'react';
import { Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import type { Claim } from '@/lib/types/sha';

interface ClaimStatusTimelineProps {
  claim: Claim;
}

type StepState = 'done' | 'current' | 'pending' | 'failed';

interface Step {
  key: string;
  label: string;
  at?: string | null;
  state: StepState;
}

function fmt(at?: string | null): string | null {
  if (!at) return null;
  try {
    return format(parseISO(at), 'MMM d, h:mm a');
  } catch {
    return null;
  }
}

function deriveSteps(claim: Claim): Step[] {
  const isRejected = claim.status === 'rejected';
  const isCancelled = claim.status === 'cancelled';
  const isPaid = claim.status === 'paid' || claim.status === 'partial';

  // Determine "current" step
  const currentKey: string = (() => {
    if (isRejected) return 'processed';
    if (isCancelled) return 'submitted';
    if (isPaid) return 'paid';
    if (claim.status === 'approved' || claim.status === 'partial_approved') return 'processed';
    if (claim.status === 'under_review') return 'acknowledged';
    if (claim.status === 'acknowledged') return 'acknowledged';
    if (claim.status === 'submitted') return 'submitted';
    return 'created';
  })();

  const order = ['created', 'submitted', 'acknowledged', 'processed', 'paid'] as const;
  type Key = typeof order[number];
  const currentIdx = order.indexOf(currentKey as Key);

  const stateFor = (key: Key, idx: number, hasTimestamp: boolean): StepState => {
    if (key === 'processed' && isRejected) return 'failed';
    if (idx < currentIdx) return 'done';
    if (idx === currentIdx) return hasTimestamp || key === 'created' ? 'done' : 'current';
    return 'pending';
  };

  return [
    {
      key: 'created',
      label: 'Created',
      at: claim.created_at,
      state: stateFor('created', 0, !!claim.created_at),
    },
    {
      key: 'submitted',
      label: 'Submitted',
      at: claim.submitted_at,
      state: stateFor('submitted', 1, !!claim.submitted_at),
    },
    {
      key: 'acknowledged',
      label: 'Acknowledged',
      at: claim.last_dha_payload_at ?? null,
      state: stateFor('acknowledged', 2, !!claim.last_dha_payload_at),
    },
    {
      key: 'processed',
      label: isRejected ? 'Rejected' : 'Processed',
      at: claim.processed_at ?? claim.adjudication_date,
      state: stateFor('processed', 3, !!(claim.processed_at ?? claim.adjudication_date)),
    },
    {
      key: 'paid',
      label: 'Paid',
      at: claim.payment_date,
      state: stateFor('paid', 4, !!claim.payment_date),
    },
  ];
}

function StepIcon({ state }: { state: StepState }) {
  const base = 'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border';
  switch (state) {
    case 'done':
      return (
        <div className={cn(base, 'border-emerald-500 bg-emerald-500 text-white')}>
          <Check className="h-3.5 w-3.5" />
        </div>
      );
    case 'failed':
      return (
        <div className={cn(base, 'border-destructive bg-destructive text-destructive-foreground')}>
          <X className="h-3.5 w-3.5" />
        </div>
      );
    case 'current':
      return (
        <div className={cn(base, 'border-primary bg-primary/10 text-primary animate-pulse')}>
          <Circle className="h-2 w-2 fill-current" />
        </div>
      );
    default:
      return (
        <div className={cn(base, 'border-muted-foreground/30 bg-muted text-muted-foreground/50')}>
          <Circle className="h-2 w-2" />
        </div>
      );
  }
}

export function ClaimStatusTimeline({ claim }: ClaimStatusTimelineProps) {
  const steps = deriveSteps(claim);

  return (
    <div className="w-full">
      {/* Desktop: horizontal pipeline */}
      <ol className="hidden sm:flex items-start justify-between gap-1">
        {steps.map((step, idx) => (
          <li key={step.key} className="flex-1 flex flex-col items-center text-center min-w-0">
            <div className="flex items-center w-full">
              <div
                className={cn(
                  'h-0.5 flex-1',
                  idx === 0 ? 'invisible' : steps[idx - 1]?.state === 'done' ? 'bg-emerald-500' : 'bg-muted',
                )}
              />
              <StepIcon state={step.state} />
              <div
                className={cn(
                  'h-0.5 flex-1',
                  idx === steps.length - 1
                    ? 'invisible'
                    : step.state === 'done'
                      ? 'bg-emerald-500'
                      : 'bg-muted',
                )}
              />
            </div>
            <p
              className={cn(
                'mt-1.5 text-xs font-medium',
                step.state === 'done' && 'text-foreground',
                step.state === 'current' && 'text-primary',
                step.state === 'failed' && 'text-destructive',
                step.state === 'pending' && 'text-muted-foreground',
              )}
            >
              {step.label}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate w-full">
              {fmt(step.at) ?? '—'}
            </p>
          </li>
        ))}
      </ol>

      {/* Mobile: vertical pipeline */}
      <ol className="sm:hidden flex flex-col gap-3">
        {steps.map((step, idx) => (
          <li key={step.key} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <StepIcon state={step.state} />
              {idx < steps.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 flex-1 mt-1 min-h-[16px]',
                    step.state === 'done' ? 'bg-emerald-500' : 'bg-muted',
                  )}
                />
              )}
            </div>
            <div className="min-w-0 pb-2">
              <p
                className={cn(
                  'text-sm font-medium',
                  step.state === 'failed' && 'text-destructive',
                  step.state === 'current' && 'text-primary',
                  step.state === 'pending' && 'text-muted-foreground',
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{fmt(step.at) ?? 'pending'}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

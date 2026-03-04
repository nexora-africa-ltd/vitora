/**
 * Wait Time Breach Banner
 *
 * Alert banner shown on the ER dashboard when patients have exceeded
 * their KETA target wait times. Breach severity levels:
 *   - CRITICAL: RED patient waiting >0 min (immediate attention)
 *   - URGENT: ORANGE patient waiting >10 min
 *   - WARNING: YELLOW patient waiting >60 min
 *   - INFO: GREEN/BLUE patient waiting >120/240 min
 *
 * Phase 4: Auto-Escalation & Alerts
 */
'use client';

import React from 'react';
import {
  AlertTriangle,
  Clock,
  ChevronRight,
  Bell,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BREACH_SEVERITY_CONFIG } from '@/lib/types/triage';
import type { BreachSeverity } from '@/lib/types/triage';
import { cn } from '@/lib/utils/cn';

interface BreachEntry {
  id: number;
  triage_assessment: number;
  patient_name: string;
  patient_mrn: string;
  triage_category: string;
  severity: BreachSeverity;
  target_wait_minutes: number;
  actual_wait_minutes: number;
  assigned_area: string;
  assigned_area_display: string;
  acknowledged: boolean;
}

interface BreachSummaryEntry {
  severity: BreachSeverity;
  count: number;
}

interface WaitTimeBreachBannerProps {
  /** Array of active breach records */
  breaches: BreachEntry[];
  /** Summary counts by severity */
  summaryData?: BreachSummaryEntry[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Callback when a breach patient is clicked */
  onViewPatient?: (triageAssessmentId: number) => void;
  /** Callback when acknowledge is clicked */
  onAcknowledge?: (breachId: number) => void;
  /** Whether acknowledge action is in progress */
  acknowledgeLoading?: boolean;
}

function formatWaitExcess(actual: number, target: number): string {
  const excess = actual - target;
  if (excess < 60) return `${excess}m over`;
  const hours = Math.floor(excess / 60);
  const mins = excess % 60;
  return mins > 0 ? `${hours}h ${mins}m over` : `${hours}h over`;
}

const SEVERITY_STYLES: Record<BreachSeverity, { border: string; bg: string; icon: string }> = {
  CRITICAL: {
    border: 'border-red-500',
    bg: 'bg-red-50 dark:bg-red-900/10',
    icon: 'text-red-600 dark:text-red-400',
  },
  URGENT: {
    border: 'border-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/10',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  WARNING: {
    border: 'border-yellow-500',
    bg: 'bg-yellow-50 dark:bg-yellow-900/10',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  INFO: {
    border: 'border-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/10',
    icon: 'text-blue-600 dark:text-blue-400',
  },
};

export function WaitTimeBreachBanner({
  breaches,
  summaryData,
  isLoading,
  onViewPatient,
  onAcknowledge,
  acknowledgeLoading,
}: WaitTimeBreachBannerProps) {
  if (isLoading) return <BreachBannerSkeleton />;
  if (!breaches || breaches.length === 0) return null;

  // Group by severity for organized display
  const critical = breaches.filter((b) => b.severity === 'CRITICAL');
  const urgent = breaches.filter((b) => b.severity === 'URGENT');
  const warning = breaches.filter((b) => b.severity === 'WARNING');
  const info = breaches.filter((b) => b.severity === 'INFO');

  const highestSeverity: BreachSeverity = critical.length > 0
    ? 'CRITICAL'
    : urgent.length > 0
      ? 'URGENT'
      : warning.length > 0
        ? 'WARNING'
        : 'INFO';

  const style = SEVERITY_STYLES[highestSeverity];

  return (
    <Card className={cn('border-l-4', style.border, style.bg)}>
      <CardContent className="p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className={cn('h-5 w-5', style.icon)} />
          <h3 className="font-semibold text-sm">
            Wait Time Breaches
          </h3>
          {/* Summary badges */}
          <div className="flex gap-1 ml-auto">
            {summaryData?.map((s) => (
              <Badge
                key={s.severity}
                variant="outline"
                className={cn('text-xs', SEVERITY_STYLES[s.severity].icon)}
              >
                {s.count} {BREACH_SEVERITY_CONFIG[s.severity].label}
              </Badge>
            )) ??
              (breaches.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {breaches.length} active
                </Badge>
              ))}
          </div>
        </div>

        {/* Breach items — show up to 5 most critical */}
        <div className="space-y-2">
          {[...critical, ...urgent, ...warning, ...info].slice(0, 5).map((breach) => {
            const severityConfig = BREACH_SEVERITY_CONFIG[breach.severity];
            const severityStyle = SEVERITY_STYLES[breach.severity];

            return (
              <div
                key={breach.id}
                className={cn(
                  'flex items-center gap-3 p-2 rounded-md border cursor-pointer hover:bg-background/60 transition-colors',
                  !breach.acknowledged && severityStyle.bg,
                  breach.acknowledged && 'opacity-60',
                )}
                onClick={() => onViewPatient?.(breach.triage_assessment)}
              >
                <Bell className={cn('h-4 w-4 shrink-0', severityStyle.icon)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{breach.patient_name}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {breach.triage_category}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-xs shrink-0', severityStyle.icon)}
                    >
                      {severityConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3" />
                    <span>
                      Waiting {breach.actual_wait_minutes}m
                      (target {breach.target_wait_minutes}m) —{' '}
                      {formatWaitExcess(breach.actual_wait_minutes, breach.target_wait_minutes)}
                    </span>
                    <span className="hidden sm:inline">• {breach.assigned_area_display}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {!breach.acknowledged && onAcknowledge && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => onAcknowledge(breach.id)}
                      disabled={acknowledgeLoading}
                    >
                      {acknowledgeLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Ack'
                      )}
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}

          {breaches.length > 5 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              +{breaches.length - 5} more breach{breaches.length - 5 > 1 ? 'es' : ''}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BreachBannerSkeleton() {
  return (
    <Card className="border-l-4 border-muted">
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 ml-auto" />
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <Skeleton className="h-4 w-4" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export { BreachBannerSkeleton };

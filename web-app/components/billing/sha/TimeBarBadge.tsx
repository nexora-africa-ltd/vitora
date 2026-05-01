/**
 * Time-Bar Badge
 * Shows countdown badge for claims approaching or past DHA time-barring deadline.
 * - Emergency claims: 24h from service_date
 * - Query claims: 14 days from updated_at
 */
'use client';

import React from 'react';
import { AlertTriangle, Clock, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Claim } from '@/lib/types/sha';

interface TimeBarBadgeProps {
  claim: Claim;
  /** Show compact variant (icon only) in tables */
  compact?: boolean;
}

/**
 * Formats remaining hours into a human-readable string.
 */
function formatTimeRemaining(hours: number): string {
  if (hours <= 0) return 'Expired';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  if (remainingHours === 0) return `${days}d`;
  return `${days}d ${remainingHours}h`;
}

/**
 * Get severity level based on remaining hours.
 */
function getSeverity(hours: number | null | undefined, isTimeBarred: boolean | undefined): 'expired' | 'critical' | 'warning' | 'safe' | null {
  if (isTimeBarred) return 'expired';
  if (hours == null) return null;
  if (hours <= 0) return 'expired';
  if (hours <= 6) return 'critical';
  if (hours <= 12) return 'warning';
  return 'safe';
}

const severityConfig = {
  expired: {
    icon: XCircle,
    label: 'Time-Barred',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    tooltipText: 'This claim has exceeded the DHA time-barring deadline and can no longer be submitted.',
  },
  critical: {
    icon: AlertTriangle,
    label: 'Expiring Soon',
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    tooltipText: 'Less than 6 hours remaining before DHA time-barring deadline.',
  },
  warning: {
    icon: Clock,
    label: 'Deadline Near',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    tooltipText: 'Less than 12 hours remaining before DHA time-barring deadline.',
  },
  safe: {
    icon: Clock,
    label: 'On Track',
    className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
    tooltipText: 'Claim is within the DHA time-barring window.',
  },
};

export function TimeBarBadge({ claim, compact = false }: TimeBarBadgeProps) {
  const severity = getSeverity(claim.hours_until_time_barred, claim.is_time_barred);

  // Don't render if claim has no time-barring deadline
  if (!severity) return null;

  const config = severityConfig[severity];
  const Icon = config.icon;
  const timeText = claim.hours_until_time_barred != null
    ? formatTimeRemaining(claim.hours_until_time_barred)
    : config.label;

  if (compact) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${config.className}`}>
              <Icon className="h-3 w-3" />
              {timeText}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">{config.tooltipText}</p>
            {claim.time_barring_deadline && (
              <p className="text-xs text-muted-foreground mt-1">
                Deadline: {new Date(claim.time_barring_deadline).toLocaleString()}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
            <Icon className="h-3.5 w-3.5" />
            <span>{timeText}</span>
            {severity !== 'expired' && claim.time_barring_deadline && (
              <span className="text-[10px] opacity-75">
                ({new Date(claim.time_barring_deadline).toLocaleDateString()})
              </span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm font-medium">{config.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{config.tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

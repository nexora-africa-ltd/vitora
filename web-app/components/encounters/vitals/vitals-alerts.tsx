/**
 * VitalsAlerts - Alert cards for critical and warning vital signs
 * Compact, flexbox layout with high-contrast colors for medical legibility
 */
'use client';

import * as React from 'react';
import { AlertTriangle, AlertCircle, AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// Accept alerts with either 'critical'/'warning' or 'CRITICAL'/'WARNING' severity
interface VitalsAlert {
  field: string;
  message: string;
  severity: 'critical' | 'warning' | 'CRITICAL' | 'WARNING';
  clinical_note?: string;
}

interface VitalsAlertsProps {
  /** List of alerts to display */
  alerts: VitalsAlert[];
  /** Compact mode - smaller cards */
  compact?: boolean;
  /** Additional class names */
  className?: string;
}

export function VitalsAlerts({ alerts, compact = false, className }: VitalsAlertsProps) {
  // Normalize severity to lowercase for comparison
  const isCritical = (a: VitalsAlert) => 
    a.severity === 'critical' || a.severity === 'CRITICAL';
  const isWarning = (a: VitalsAlert) => 
    a.severity === 'warning' || a.severity === 'WARNING';

  const criticalAlerts = alerts.filter(isCritical);
  const warningAlerts = alerts.filter(isWarning);

  if (criticalAlerts.length === 0 && warningAlerts.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Critical Alerts - Red with high contrast */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
            <AlertOctagon className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Critical ({criticalAlerts.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalAlerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-lg border-2 border-red-600 dark:border-red-500',
                  'bg-red-600 dark:bg-red-600 text-white',
                  'shadow-sm',
                  compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
                  'max-w-xs'
                )}
              >
                <AlertCircle className={cn('shrink-0 mt-0.5', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                <div className="min-w-0">
                  <p className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-sm')}>
                    {alert.message}
                  </p>
                  {alert.clinical_note && !compact && (
                    <p className="text-xs mt-0.5 text-red-100">{alert.clinical_note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning Alerts - Orange/Amber with better contrast */}
      {warningAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-orange-700 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Warning ({warningAlerts.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {warningAlerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-lg border-2 border-orange-500 dark:border-orange-400',
                  'bg-orange-500 dark:bg-orange-600 text-white',
                  'shadow-sm',
                  compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
                  'max-w-xs'
                )}
              >
                <AlertTriangle className={cn('shrink-0 mt-0.5', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
                <div className="min-w-0">
                  <p className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-sm')}>
                    {alert.message}
                  </p>
                  {alert.clinical_note && !compact && (
                    <p className="text-xs mt-0.5 text-orange-100">{alert.clinical_note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VitalsAlerts;

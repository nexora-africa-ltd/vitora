/**
 * VitalsAlertsPanel - Shared vital sign alerts component
 *
 * Displays critical and warning alerts for abnormal vital signs.
 * Works with both triage and encounter modules.
 *
 * Features:
 * - Critical (red) and Warning (orange) severity levels
 * - Sorted by severity (critical first)
 * - Optional collapsible panel mode
 * - Clinical guidance notes
 * - Compact mode for smaller spaces
 * - Acknowledgement callback for warnings
 *
 * @module components/shared/vitals-alerts-panel
 */
'use client';

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { VitalAlert, AlertSeverity } from '@/lib/vitals';

// =============================================================================
// TYPES
// =============================================================================

export interface VitalsAlertsPanelProps {
  /** Array of alerts to display */
  alerts: VitalAlert[];
  /** Show clinical notes for each alert */
  showClinicalNotes?: boolean;
  /** Callback when an alert is acknowledged (only for warnings) */
  onAcknowledge?: (alertId: string) => void;
  /** Enable collapsible mode */
  collapsible?: boolean;
  /** Default expanded state (uncontrolled) */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Compact mode - smaller cards */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize severity to uppercase for comparison
 */
function normalizeSeverity(severity: string): 'CRITICAL' | 'WARNING' | 'OTHER' {
  const upper = severity.toUpperCase();
  if (upper === 'CRITICAL' || upper === 'EMERGENCY') return 'CRITICAL';
  if (upper === 'WARNING') return 'WARNING';
  return 'OTHER';
}

/**
 * Sort alerts by severity (CRITICAL first) then by vital type
 */
function sortAlerts(alerts: VitalAlert[]): VitalAlert[] {
  return [...alerts].sort((a, b) => {
    const aSev = normalizeSeverity(a.severity);
    const bSev = normalizeSeverity(b.severity);
    if (aSev === 'CRITICAL' && bSev !== 'CRITICAL') return -1;
    if (aSev !== 'CRITICAL' && bSev === 'CRITICAL') return 1;
    const aType = a.vital_type ?? 'GENERAL';
    const bType = b.vital_type ?? 'GENERAL';
    return aType.localeCompare(bType);
  });
}

/**
 * Count alerts by severity
 */
function countAlertsBySeverity(alerts: VitalAlert[]): {
  critical: number;
  warning: number;
  total: number;
} {
  const critical = alerts.filter((a) => normalizeSeverity(a.severity) === 'CRITICAL').length;
  const warning = alerts.filter((a) => normalizeSeverity(a.severity) === 'WARNING').length;
  return { critical, warning, total: alerts.length };
}

// =============================================================================
// ALERT ITEM COMPONENT
// =============================================================================

interface AlertItemProps {
  alert: VitalAlert;
  showClinicalNote?: boolean;
  onAcknowledge?: (alertId: string) => void;
  compact?: boolean;
}

function AlertItem({ alert, showClinicalNote, onAcknowledge, compact }: AlertItemProps) {
  const isCritical = normalizeSeverity(alert.severity) === 'CRITICAL';

  return (
    <div
      data-testid={`alert-${alert.id || alert.field}`}
      className={cn(
        'flex items-start gap-2 rounded-lg border-2 shadow-sm',
        isCritical
          ? 'border-red-600 dark:border-red-500 bg-red-600 dark:bg-red-600 text-white'
          : 'border-orange-500 dark:border-orange-400 bg-orange-500 dark:bg-orange-600 text-white',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
        'max-w-xs'
      )}
    >
      {/* Icon */}
      {isCritical ? (
        <AlertCircle className={cn('shrink-0 mt-0.5', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      ) : (
        <AlertTriangle className={cn('shrink-0 mt-0.5', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      )}

      <div className="flex-1 min-w-0">
        {/* Message */}
        <p className={cn('font-medium leading-tight', compact ? 'text-xs' : 'text-sm')}>
          {alert.message}
        </p>

        {/* Clinical Note */}
        {showClinicalNote && alert.clinical_note && !compact && (
          <p className={cn(
            'text-xs mt-0.5',
            isCritical ? 'text-red-100' : 'text-orange-100'
          )}>
            {alert.clinical_note}
          </p>
        )}
      </div>

      {/* Acknowledge Button (warnings only) */}
      {!isCritical && onAcknowledge && alert.id && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAcknowledge(alert.id!)}
          className="shrink-0 h-auto p-1 text-white hover:text-white hover:bg-white/20"
        >
          <CheckCircle className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function VitalsAlertsPanel({
  alerts,
  showClinicalNotes = false,
  onAcknowledge,
  collapsible = false,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  compact = false,
  className,
}: VitalsAlertsPanelProps) {
  // Managed expanded state
  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = () => {
    const newValue = !isExpanded;
    setInternalExpanded(newValue);
    onExpandedChange?.(newValue);
  };

  // Filter and sort alerts
  const sortedAlerts = sortAlerts(alerts);
  const { critical, warning, total } = countAlertsBySeverity(alerts);

  // No alerts - return null
  if (total === 0) {
    return null;
  }

  const criticalAlerts = sortedAlerts.filter((a) => normalizeSeverity(a.severity) === 'CRITICAL');
  const warningAlerts = sortedAlerts.filter((a) => normalizeSeverity(a.severity) === 'WARNING');

  // Collapsible mode
  if (collapsible) {
    return (
      <div className={cn('rounded-lg border', className)}>
        {/* Header */}
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'w-full flex items-center justify-between p-3 text-left',
            'hover:bg-muted/50 transition-colors',
            critical > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-orange-50 dark:bg-orange-950/30'
          )}
        >
          <div className="flex items-center gap-2">
            {critical > 0 ? (
              <AlertOctagon className="h-5 w-5 text-red-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            )}
            <span className="font-medium">
              {critical > 0 && (
                <Badge variant="destructive" className="mr-2">
                  {critical} Critical
                </Badge>
              )}
              {warning > 0 && (
                <Badge className="bg-orange-500 hover:bg-orange-600">
                  {warning} Warning
                </Badge>
              )}
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Content */}
        {isExpanded && (
          <div className="p-3 space-y-3 border-t">
            {criticalAlerts.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {criticalAlerts.map((alert, i) => (
                    <AlertItem
                      key={alert.id || `critical-${i}`}
                      alert={alert}
                      showClinicalNote={showClinicalNotes}
                      compact={compact}
                    />
                  ))}
                </div>
              </div>
            )}
            {warningAlerts.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {warningAlerts.map((alert, i) => (
                    <AlertItem
                      key={alert.id || `warning-${i}`}
                      alert={alert}
                      showClinicalNote={showClinicalNotes}
                      onAcknowledge={onAcknowledge}
                      compact={compact}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Non-collapsible mode (inline alerts)
  return (
    <div className={cn('space-y-3', className)}>
      {/* Critical Alerts */}
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
              <AlertItem
                key={alert.id || `critical-${i}`}
                alert={alert}
                showClinicalNote={showClinicalNotes}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {/* Warning Alerts */}
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
              <AlertItem
                key={alert.id || `warning-${i}`}
                alert={alert}
                showClinicalNote={showClinicalNotes}
                onAcknowledge={onAcknowledge}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VitalsAlertsPanel;

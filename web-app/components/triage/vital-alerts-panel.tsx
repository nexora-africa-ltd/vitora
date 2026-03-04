/**
 * VitalAlertsPanel Component
 *
 * Displays critical and warning alerts for abnormal vital signs.
 * Helps healthcare providers quickly identify patients requiring immediate attention.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-alerts.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TriageAlert, AlertSeverity } from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export interface VitalAlertsPanelProps {
  /** Array of alerts to display */
  alerts: TriageAlert[];
  /** Show clinical notes for each alert */
  showClinicalNotes?: boolean;
  /** Callback when an alert is acknowledged (only for warnings) */
  onAcknowledge?: (alertId: string) => void;
  /** Default expanded state (uncontrolled) */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Callback when expanded state changes */
  onExpandedChange?: (expanded: boolean) => void;
  /** Compact mode for smaller spaces */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sort alerts by severity (CRITICAL first) then by vital type
 */
function sortAlerts(alerts: TriageAlert[]): TriageAlert[] {
  return [...alerts].sort((a, b) => {
    // Critical alerts first
    if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
    if (a.severity !== 'CRITICAL' && b.severity === 'CRITICAL') return 1;
    // Then by vital type alphabetically (handle undefined)
    const aType = a.vital_type ?? 'GENERAL';
    const bType = b.vital_type ?? 'GENERAL';
    return aType.localeCompare(bType);
  });
}

/**
 * Count alerts by severity
 */
function countAlertsBySeverity(alerts: TriageAlert[]): {
  critical: number;
  warning: number;
  total: number;
} {
  const critical = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const warning = alerts.filter((a) => a.severity === 'WARNING').length;
  return { critical, warning, total: alerts.length };
}

/**
 * Get the highest severity from alerts
 */
function getHighestSeverity(alerts: TriageAlert[]): 'CRITICAL' | 'WARNING' | 'NONE' {
  if (alerts.some((a) => a.severity === 'CRITICAL')) return 'CRITICAL';
  if (alerts.some((a) => a.severity === 'WARNING')) return 'WARNING';
  return 'NONE';
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface AlertItemProps {
  alert: TriageAlert;
  showClinicalNote?: boolean;
  onAcknowledge?: (alertId: string) => void;
}

function AlertItem({ alert, showClinicalNote, onAcknowledge }: AlertItemProps) {
  const isCritical = alert.severity === 'CRITICAL';
  const source = alert.source ?? 'vitals';

  return (
    <div
      data-testid={`alert-${alert.id}`}
      className={cn(
        'rounded-lg border p-3 transition-colors',
        isCritical
          ? 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
          : 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1">
          {/* Severity Icon */}
          {isCritical ? (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            {/* Severity Badge + optional source indicator */}
            <div className="flex items-center gap-1.5 mb-1">
              <Badge
                variant={isCritical ? 'destructive' : 'default'}
                className={cn(
                  'text-xs',
                  !isCritical && 'bg-orange-500 hover:bg-orange-600'
                )}
              >
                {alert.severity}
              </Badge>

              {source !== 'vitals' && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium gap-0.5 cursor-default',
                          source === 'ai'
                            ? 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        )}
                      >
                        {source === 'ai' ? (
                          <Bot className="h-3 w-3" />
                        ) : (
                          <BrainCircuit className="h-3 w-3" />
                        )}
                        {source === 'ai' ? 'AI' : 'CDS'}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {source === 'ai'
                        ? 'Generated by AI clinical assistant'
                        : 'Generated by rule-based Clinical Decision Support'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {/* Alert Message */}
            <p
              className={cn(
                'text-sm font-medium',
                isCritical ? 'text-red-800 dark:text-red-200' : 'text-orange-800 dark:text-orange-200'
              )}
            >
              {alert.message}
            </p>

            {/* Clinical Note */}
            {showClinicalNote && alert.clinical_note && (
              <p
                className={cn(
                  'text-xs mt-1',
                  isCritical ? 'text-red-600 dark:text-red-300' : 'text-orange-600 dark:text-orange-300'
                )}
              >
                {alert.clinical_note}
              </p>
            )}

            {/* Critical alert notice */}
            {isCritical && onAcknowledge && (
              <p className="text-xs text-red-500 mt-2 italic">
                Critical alerts cannot be dismissed
              </p>
            )}
          </div>
        </div>

        {/* Acknowledge Button (warnings only) */}
        {!isCritical && onAcknowledge && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAcknowledge(alert.id)}
            className="shrink-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
          >
            Acknowledge
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * VitalAlertsPanel - Displays vital sign alerts with severity indicators
 *
 * Features:
 * - Critical (red) and Warning (orange) severity levels
 * - Sorted by severity (critical first)
 * - Collapsible panel with summary header
 * - Acknowledgement for warnings (not critical)
 * - Clinical guidance notes
 * - Empty state for normal vitals
 * - Accessible with ARIA labels
 *
 * @example
 * ```tsx
 * // Basic usage
 * <VitalAlertsPanel alerts={patientAlerts} />
 *
 * // With acknowledgement
 * <VitalAlertsPanel
 *   alerts={patientAlerts}
 *   onAcknowledge={(alertId) => markAcknowledged(alertId)}
 * />
 *
 * // With clinical notes
 * <VitalAlertsPanel alerts={patientAlerts} showClinicalNotes />
 * ```
 */
export function VitalAlertsPanel({
  alerts,
  showClinicalNotes = false,
  onAcknowledge,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  compact = false,
  className,
}: VitalAlertsPanelProps) {
  // Handle controlled vs uncontrolled expanded state
  const [uncontrolledExpanded, setUncontrolledExpanded] = React.useState(defaultExpanded);
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : uncontrolledExpanded;

  const handleToggleExpanded = () => {
    const newExpanded = !isExpanded;
    if (isControlled) {
      onExpandedChange?.(newExpanded);
    } else {
      setUncontrolledExpanded(newExpanded);
    }
  };

  // Sort and count alerts
  const sortedAlerts = sortAlerts(alerts);
  const { total } = countAlertsBySeverity(alerts);
  const highestSeverity = getHighestSeverity(alerts);

  // Determine panel styling based on alerts
  const panelBorderClass =
    highestSeverity === 'CRITICAL'
      ? 'border-red-200 dark:border-red-800'
      : highestSeverity === 'WARNING'
        ? 'border-orange-200 dark:border-orange-800'
        : 'border-green-200 dark:border-green-800';

  const iconColorClass =
    highestSeverity === 'CRITICAL'
      ? 'text-red-500'
      : highestSeverity === 'WARNING'
        ? 'text-orange-500'
        : 'text-green-500';

  // Build aria label
  const ariaLabel =
    total > 0
      ? `Vital signs alerts: ${total} alert${total !== 1 ? 's' : ''}`
      : 'Vital signs alerts: All normal';

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      data-testid="alerts-panel"
      className={cn(
        'rounded-lg border bg-white dark:bg-gray-900',
        panelBorderClass,
        compact && 'compact',
        className
      )}
    >
      {/* Header */}
      <button
        type="button"
        data-testid="alerts-header"
        onClick={handleToggleExpanded}
        className={cn(
          'w-full flex items-center justify-between p-3 text-left',
          'hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500',
          compact && 'p-2',
          isExpanded && 'sr-only'
        )}
      >
        <div className="flex items-center gap-2">
          {/* Severity Icon */}
          <div data-testid="alerts-severity-icon" className={iconColorClass}>
            {highestSeverity === 'CRITICAL' && <AlertCircle className="h-5 w-5" />}
            {highestSeverity === 'WARNING' && <AlertTriangle className="h-5 w-5" />}
            {highestSeverity === 'NONE' && <CheckCircle className="h-5 w-5" />}
          </div>

          {/* Collapsed: icon + count only */}
          <div>
            {total > 0 ? (
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {total}
              </span>
            ) : (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                ✅
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <div data-testid="chevron-icon" className="text-gray-400">
          <ChevronDown className="h-5 w-5" />
        </div>
      </button>

      {/* Content */}
      <div
        data-testid="alerts-content"
        className={cn(
          'overflow-hidden transition-all duration-200',
          isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0 invisible'
        )}
      >
        <div className={cn('p-3 space-y-2', compact && 'p-2')}>
          {total > 0 ? (
            sortedAlerts.map((alert, index) => (
              <AlertItem
                key={alert.id || `alert-fallback-${index}`}
                alert={alert}
                showClinicalNote={showClinicalNotes}
                onAcknowledge={onAcknowledge}
              />
            ))
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-green-600 dark:text-green-400">
              <CheckCircle data-testid="no-alerts-icon" className="h-5 w-5" />
              <span className="text-sm">No alerts at this time</span>
            </div>
          )}

          {/* Collapse button (inside expanded content) */}
          <button
            type="button"
            onClick={handleToggleExpanded}
            title="Collapse alerts"
            className="w-full flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { AlertItemProps };

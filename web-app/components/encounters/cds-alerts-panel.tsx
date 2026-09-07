/**
 * CDS Alerts Panel — Encounter-level clinical decision support alerts
 *
 * Tiered display:
 * - CRITICAL alerts: red, prominent, with override requirement
 * - HIGH alerts: amber, with accept/dismiss actions
 * - MEDIUM/LOW/INFO: collapsible section, dismiss-only
 *
 * Uses SystemBanner inline variant for individual alert rendering
 * and existing Card + Collapsible patterns.
 *
 * Advisory-only — never blocks clinical workflow.
 *
 * @module components/encounters/cds-alerts-panel
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ShieldOff,
  Lightbulb,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import SystemBanner from '@/components/ui/system-banner';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils/cn';
import {
  useEncounterCDSAlerts,
  useAcknowledgeCDSAlert,
  useAcceptCDSAlert,
  useOverrideCDSAlert,
  useDismissCDSAlert,
} from '@/lib/hooks/use-cds';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import type { CDSAlertListItem, CDSSuggestedAction } from '@/lib/types/cds';

// =============================================================================
// Priority Helpers
// =============================================================================

type CDSPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

function normalizePriority(p: string): CDSPriority {
  const upper = p.toUpperCase();
  if (upper === 'CRITICAL') return 'CRITICAL';
  if (upper === 'HIGH') return 'HIGH';
  if (upper === 'MEDIUM') return 'MEDIUM';
  if (upper === 'LOW') return 'LOW';
  return 'INFO';
}

const priorityOrder: Record<CDSPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const priorityConfig: Record<
  CDSPriority,
  {
    semanticColor: 'destructive' | 'warning' | 'info' | 'default' | 'success';
    icon: typeof ShieldAlert;
    label: string;
    badgeClass: string;
  }
> = {
  CRITICAL: {
    semanticColor: 'destructive',
    icon: ShieldAlert,
    label: 'Critical',
    badgeClass: 'bg-red-600 text-white hover:bg-red-700',
  },
  HIGH: {
    semanticColor: 'warning',
    icon: AlertTriangle,
    label: 'High',
    badgeClass: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  MEDIUM: {
    semanticColor: 'info',
    icon: Info,
    label: 'Medium',
    badgeClass: 'bg-blue-500 text-white hover:bg-blue-600',
  },
  LOW: {
    semanticColor: 'default',
    icon: Lightbulb,
    label: 'Low',
    badgeClass: 'bg-slate-500 text-white hover:bg-slate-600',
  },
  INFO: {
    semanticColor: 'default',
    icon: Info,
    label: 'Info',
    badgeClass: 'bg-slate-400 text-white hover:bg-slate-500',
  },
};

// =============================================================================
// Alert Action Buttons
// =============================================================================

interface AlertActionsProps {
  alert: CDSAlertListItem;
  onAccept: (id: number) => void;
  onOverride: (id: number) => void;
  onDismiss: (id: number) => void;
  isActing: boolean;
}

function AlertActions({ alert, onAccept, onOverride, onDismiss, isActing }: AlertActionsProps) {
  const priority = normalizePriority(alert.priority);

  if (!alert.is_pending) {
    return (
      <div className="mt-2 flex shrink-0 items-center gap-1.5 sm:ml-auto sm:mt-0">
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
          {alert.status.replace('_', ' ')}
        </Badge>
      </div>
    );
  }

  return (
    <div className="mt-2 flex shrink-0 items-center gap-1.5 sm:ml-auto sm:mt-0">
      {/* Accept recommendation */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onAccept(alert.id)}
        disabled={isActing}
        className="h-7 gap-1 px-2 text-xs"
        title="Accept recommendation"
      >
        <Check className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Accept</span>
      </Button>

      {/* Override (CRITICAL/HIGH only — requires reason) */}
      {(priority === 'CRITICAL' || priority === 'HIGH') && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onOverride(alert.id)}
          disabled={isActing}
          className="h-7 gap-1 px-2 text-xs"
          title="Override with reason"
        >
          <ShieldOff className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Override</span>
        </Button>
      )}

      {/* Dismiss (LOW/MEDIUM/INFO only) */}
      {priority !== 'CRITICAL' && priority !== 'HIGH' && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDismiss(alert.id)}
          disabled={isActing}
          className="h-7 gap-1 px-2 text-xs"
          title="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// =============================================================================
// Single Alert Row
// =============================================================================

interface AlertRowProps {
  alert: CDSAlertListItem;
  onAccept: (id: number) => void;
  onOverride: (id: number) => void;
  onDismiss: (id: number) => void;
  isActing: boolean;
}

function AlertRow({ alert, onAccept, onOverride, onDismiss, isActing }: AlertRowProps) {
  const priority = normalizePriority(alert.priority);
  const config = priorityConfig[priority];

  return (
    <SystemBanner
      variant="inline"
      semanticColor={config.semanticColor}
      text={alert.message}
      icon={<config.icon className="h-4 w-4" />}
      description={
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
          <span>{alert.suggestion}</span>
          <AlertActions
            alert={alert}
            onAccept={onAccept}
            onOverride={onOverride}
            onDismiss={onDismiss}
            isActing={isActing}
          />
        </div>
      }
      show={true}
    />
  );
}

// =============================================================================
// Override Dialog
// =============================================================================

interface OverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  alertMessage: string;
  isPending: boolean;
}

function OverrideDialog({
  open,
  onOpenChange,
  onConfirm,
  alertMessage,
  isPending,
}: OverrideDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim().length < 10) return;
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-amber-500" />
            <DialogTitle>Override CDS Alert</DialogTitle>
          </div>
          <DialogDescription>
            You are overriding a clinical decision support recommendation. This action is audited
            and requires a documented clinical rationale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SystemBanner
            variant="inline"
            semanticColor="warning"
            text="Alert being overridden"
            description={alertMessage}
            icon={<AlertTriangle className="h-4 w-4" />}
            show={true}
          />

          <div className="space-y-2">
            <Label htmlFor="override-reason">Clinical rationale (required, min 10 chars)</Label>
            <Textarea
              id="override-reason"
              placeholder="Document your clinical reasoning for overriding this recommendation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={reason.trim().length < 10 || isPending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isPending ? 'Overriding...' : 'Override & Document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main CDS Alerts Panel
// =============================================================================

interface CDSAlertsPanelProps {
  /** The encounter ID to fetch alerts for */
  encounterId: number;
  /** Called when user accepts an alert that has suggested_actions (smart_autopopulate) */
  onSuggestedAction?: (actions: CDSSuggestedAction[]) => void;
  /** Additional CSS classes */
  className?: string;
}

export function CDSAlertsPanel({ encounterId, onSuggestedAction, className }: CDSAlertsPanelProps) {
  const { data, isLoading } = useEncounterCDSAlerts(encounterId);
  const acknowledgeAlert = useAcknowledgeCDSAlert();
  const acceptAlert = useAcceptCDSAlert();
  const overrideAlert = useOverrideCDSAlert();
  const dismissAlert = useDismissCDSAlert();
  const smartAutopopulate = useFeatureFlag('smart_autopopulate');

  const [showLower, setShowLower] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<CDSAlertListItem | null>(null);

  const isActing =
    acknowledgeAlert.isPending ||
    acceptAlert.isPending ||
    overrideAlert.isPending ||
    dismissAlert.isPending;

  // Group alerts by priority tier
  const { critical, high, lower, resolved, totalCount } = useMemo(() => {
    const alerts = data?.results || [];
    const sorted = [...alerts].sort(
      (a, b) =>
        priorityOrder[normalizePriority(a.priority)] - priorityOrder[normalizePriority(b.priority)]
    );

    const pending = sorted.filter((a) => a.is_pending);

    return {
      critical: pending.filter((a) => normalizePriority(a.priority) === 'CRITICAL'),
      high: pending.filter((a) => normalizePriority(a.priority) === 'HIGH'),
      lower: pending.filter((a) => {
        const p = normalizePriority(a.priority);
        return p === 'MEDIUM' || p === 'LOW' || p === 'INFO';
      }),
      resolved: sorted.filter((a) => !a.is_pending),
      totalCount: sorted.length,
    };
  }, [data]);

  // Handlers
  const handleAccept = useCallback(
    (id: number) => {
      acceptAlert.mutate(id);
      // Emit suggested actions if smart_autopopulate is on
      if (smartAutopopulate && onSuggestedAction) {
        const alert = data?.results.find((a) => a.id === id);
        if (alert?.suggested_actions?.length) {
          onSuggestedAction(alert.suggested_actions);
        }
      }
    },
    [acceptAlert, smartAutopopulate, onSuggestedAction, data]
  );

  const handleOverride = useCallback(
    (id: number) => {
      const alert = data?.results.find((a) => a.id === id);
      if (alert) setOverrideTarget(alert);
    },
    [data]
  );

  const handleOverrideConfirm = useCallback(
    (reason: string) => {
      if (!overrideTarget) return;
      overrideAlert.mutate(
        { alertId: overrideTarget.id, reason },
        { onSuccess: () => setOverrideTarget(null) }
      );
    },
    [overrideTarget, overrideAlert]
  );

  const handleDismiss = useCallback(
    (id: number) => {
      dismissAlert.mutate(id);
    },
    [dismissAlert]
  );

  // Nothing to show
  if (isLoading || totalCount === 0) return null;

  return (
    <>
      <Card
        className={cn(
          critical.length > 0 && 'border-red-300 dark:border-red-800',
          critical.length === 0 && high.length > 0 && 'border-amber-300 dark:border-amber-800',
          className
        )}
      >
        <CardHeader className="px-3 py-3 pb-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="sm:hidden">CDS Alerts</span>
              <span className="hidden sm:inline">Clinical Decision Support</span>
              <HelpPopover content="Evidence-based advisories generated from clinical rules. These are recommendations only — they do not block your workflow. Accept, override (with reason), or dismiss each alert." />
            </CardTitle>
            <div className="flex items-center gap-1.5">
              {critical.length > 0 && (
                <Badge className={priorityConfig.CRITICAL.badgeClass}>
                  {critical.length} Critical
                </Badge>
              )}
              {high.length > 0 && (
                <Badge className={priorityConfig.HIGH.badgeClass}>{high.length} High</Badge>
              )}
              {lower.length > 0 && <Badge variant="secondary">{lower.length} Other</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6">
          {/* Critical alerts — always visible */}
          {critical.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAccept={handleAccept}
              onOverride={handleOverride}
              onDismiss={handleDismiss}
              isActing={isActing}
            />
          ))}

          {/* High alerts — always visible */}
          {high.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAccept={handleAccept}
              onOverride={handleOverride}
              onDismiss={handleDismiss}
              isActing={isActing}
            />
          ))}

          {/* Lower priority pending — collapsible */}
          {lower.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowLower(!showLower)}
                className="flex w-full items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {showLower ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {showLower ? 'Hide' : 'Show'} {lower.length} additional advisor
                {lower.length !== 1 ? 'ies' : 'y'}
              </button>
              {showLower && (
                <div className="mt-2 space-y-2">
                  {lower.map((alert) => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      onAccept={handleAccept}
                      onOverride={handleOverride}
                      onDismiss={handleDismiss}
                      isActing={isActing}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resolved history */}
          {resolved.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground">
                Resolved alerts ({resolved.length})
              </div>
              <div className="space-y-2">
                {resolved.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onAccept={handleAccept}
                    onOverride={handleOverride}
                    onDismiss={handleDismiss}
                    isActing={isActing}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override reason dialog */}
      <OverrideDialog
        open={!!overrideTarget}
        onOpenChange={(open) => !open && setOverrideTarget(null)}
        onConfirm={handleOverrideConfirm}
        alertMessage={overrideTarget?.message || ''}
        isPending={overrideAlert.isPending}
      />
    </>
  );
}

export default CDSAlertsPanel;

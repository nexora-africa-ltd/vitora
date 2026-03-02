/**
 * CDS Critical Interruptive Dialog
 *
 * Shown when finalizing an encounter that has unresolved CRITICAL or HIGH CDS alerts.
 * The clinician MUST resolve (accept, override, or dismiss) every alert before
 * the encounter can be finalized. This follows the standard EHR "hard stop" pattern
 * used by Epic/Cerner for patient-safety alerts.
 *
 * Advisory model: does NOT block saving or continuing — only blocks finalizing.
 *
 * @module components/encounters/cds-critical-dialog
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ShieldOff,
  Check,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import SystemBanner from '@/components/ui/system-banner';
import {
  useEncounterCDSAlerts,
  useAcceptCDSAlert,
  useOverrideCDSAlert,
} from '@/lib/hooks/use-cds';
import type { CDSAlertListItem } from '@/lib/types/cds';

// =============================================================================
// Single Alert Resolution Row
// =============================================================================

interface AlertResolutionRowProps {
  alert: CDSAlertListItem;
  onAccept: (id: number) => void;
  onStartOverride: (alert: CDSAlertListItem) => void;
  isActing: boolean;
}

function AlertResolutionRow({
  alert,
  onAccept,
  onStartOverride,
  isActing,
}: AlertResolutionRowProps) {
  const isCritical = alert.priority.toUpperCase() === 'CRITICAL';

  return (
    <SystemBanner
      variant="inline"
      semanticColor={isCritical ? 'destructive' : 'warning'}
      text={alert.message}
      icon={
        isCritical ? (
          <ShieldAlert className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )
      }
      description={
        <div className="space-y-2">
          {alert.suggestion && (
            <p className="text-xs">{alert.suggestion}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAccept(alert.id)}
              disabled={isActing}
              className="h-7 px-3 text-xs gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStartOverride(alert)}
              disabled={isActing}
              className="h-7 px-3 text-xs gap-1.5"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Override
            </Button>
          </div>
        </div>
      }
      show={true}
    />
  );
}

// =============================================================================
// Override Inline Form (inside the dialog)
// =============================================================================

interface OverrideFormProps {
  alert: CDSAlertListItem;
  onConfirm: (alertId: number, reason: string) => void;
  onCancel: () => void;
  isPending: boolean;
}

function OverrideForm({ alert, onConfirm, onCancel, isPending }: OverrideFormProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-800 p-3 bg-amber-50/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <ShieldOff className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium">Override: {alert.message}</span>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="override-reason-critical" className="text-xs">
          Clinical rationale (required, min 10 characters)
        </Label>
        <Textarea
          id="override-reason-critical"
          placeholder="Document your clinical reasoning..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
          className="text-xs"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onConfirm(alert.id, reason.trim())}
          disabled={reason.trim().length < 10 || isPending}
          className="text-xs bg-amber-600 hover:bg-amber-700"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5 mr-1" />
          )}
          Override & Document
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Dialog Component
// =============================================================================

interface CDSCriticalDialogProps {
  /** The encounter ID to check for unresolved critical alerts */
  encounterId: number;
  /** Whether the dialog is open */
  open: boolean;
  /** Called when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Called when all alerts are resolved and user confirms finalization */
  onProceed: () => void;
  /** Whether the finalization is in progress */
  isFinalizePending?: boolean;
}

export function CDSCriticalDialog({
  encounterId,
  open,
  onOpenChange,
  onProceed,
  isFinalizePending = false,
}: CDSCriticalDialogProps) {
  const { data, isLoading } = useEncounterCDSAlerts(open ? encounterId : null);
  const acceptAlert = useAcceptCDSAlert();
  const overrideAlert = useOverrideCDSAlert();

  const [overridingAlert, setOverridingAlert] = useState<CDSAlertListItem | null>(null);

  const isActing = acceptAlert.isPending || overrideAlert.isPending;

  // Filter to CRITICAL and HIGH unresolved alerts
  const unresolvedAlerts = useMemo(() => {
    const alerts = data?.results || [];
    return alerts.filter((a) => {
      const p = a.priority.toUpperCase();
      return (p === 'CRITICAL' || p === 'HIGH') && a.is_pending;
    });
  }, [data]);

  const criticalCount = unresolvedAlerts.filter(
    (a) => a.priority.toUpperCase() === 'CRITICAL'
  ).length;
  const highCount = unresolvedAlerts.filter(
    (a) => a.priority.toUpperCase() === 'HIGH'
  ).length;

  const allResolved = unresolvedAlerts.length === 0 && !isLoading;

  // Accept handler
  const handleAccept = useCallback(
    (id: number) => {
      acceptAlert.mutate(id);
    },
    [acceptAlert]
  );

  // Override handler
  const handleOverrideConfirm = useCallback(
    (alertId: number, reason: string) => {
      overrideAlert.mutate(
        { alertId, reason },
        { onSuccess: () => setOverridingAlert(null) }
      );
    },
    [overrideAlert]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <DialogTitle>Unresolved CDS Alerts</DialogTitle>
          </div>
          <DialogDescription>
            This encounter has unresolved clinical decision support alerts that
            require your attention before finalizing. Accept or override each
            alert with a documented rationale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Alert counts */}
          {!allResolved && (
            <div className="flex items-center gap-2">
              {criticalCount > 0 && (
                <Badge className="bg-red-600 text-white">
                  {criticalCount} Critical
                </Badge>
              )}
              {highCount > 0 && (
                <Badge className="bg-amber-500 text-white">
                  {highCount} High
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Resolve all to proceed
              </span>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Checking alerts...
            </div>
          )}

          {/* Alert list */}
          {unresolvedAlerts
            .filter((a) => a.id !== overridingAlert?.id)
            .map((alert) => (
              <AlertResolutionRow
                key={alert.id}
                alert={alert}
                onAccept={handleAccept}
                onStartOverride={setOverridingAlert}
                isActing={isActing}
              />
            ))}

          {/* Override form */}
          {overridingAlert && (
            <OverrideForm
              alert={overridingAlert}
              onConfirm={handleOverrideConfirm}
              onCancel={() => setOverridingAlert(null)}
              isPending={overrideAlert.isPending}
            />
          )}

          {/* All resolved */}
          {allResolved && (
            <SystemBanner
              variant="inline"
              semanticColor="success"
              text="All alerts resolved"
              description="All critical and high-priority CDS alerts have been addressed. You may now finalize the encounter."
              icon={<CheckCircle className="h-4 w-4" />}
              show={true}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isFinalizePending}
          >
            Cancel
          </Button>
          <Button
            onClick={onProceed}
            disabled={!allResolved || isFinalizePending}
            className="bg-green-600 hover:bg-green-700"
          >
            {isFinalizePending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Finalize Encounter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CDSCriticalDialog;

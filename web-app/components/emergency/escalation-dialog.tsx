/**
 * Escalation Dialog
 *
 * Self-contained dialog for escalating a queue entry to charge nurse,
 * additional staff, or supervisor. Manages its own mutation and toast
 * notifications so the parent only needs to provide the queue entry ID
 * and patient info.
 *
 * Phase 4: Auto-Escalation & Alerts
 */
'use client';

import { useState } from 'react';
import { Shield, UserCheck, Users, Loader2, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils/cn';
import type { EscalationType } from '@/lib/types/triage';
import { ESCALATION_TYPE_CONFIG } from '@/lib/types/triage';
import { useEscalatePatient } from '@/lib/hooks/use-triage';
import { useToast } from '@/lib/hooks/use-toast';

// =============================================================================
// Types
// =============================================================================

interface EscalationDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** Queue entry ID to escalate */
  queueEntryId: number;
  /** Patient name for display */
  patientName: string;
  /** Patient MRN for display */
  patientMrn: string;
  /** Current wait time in minutes */
  waitMinutes?: number;
  /** Callback after successful escalation (e.g. refetch queue) */
  onSuccess?: () => void;
}

// =============================================================================
// Escalation Type Icons
// =============================================================================

const TYPE_ICONS: Record<EscalationType, React.ReactNode> = {
  CHARGE_NURSE: <UserCheck className="h-5 w-5" />,
  ADDITIONAL_STAFF: <Users className="h-5 w-5" />,
  SUPERVISOR: <Shield className="h-5 w-5" />,
};

// =============================================================================
// Component
// =============================================================================

export function EscalationDialog({
  open,
  onOpenChange,
  queueEntryId,
  patientName,
  patientMrn,
  waitMinutes,
  onSuccess,
}: EscalationDialogProps) {
  const { toast } = useToast();
  const escalateMutation = useEscalatePatient();

  const [selectedType, setSelectedType] = useState<EscalationType | null>(null);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!selectedType || !reason.trim()) return;

    try {
      await escalateMutation.mutateAsync({
        queueEntryId,
        escalationType: selectedType,
        reason: reason.trim(),
      });

      toast({
        title: 'Escalation submitted',
        description: `${patientName} escalated to ${ESCALATION_TYPE_CONFIG[selectedType].shortLabel}`,
      });

      setSelectedType(null);
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast({
        title: 'Escalation failed',
        description: 'Unable to submit escalation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedType(null);
      setReason('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-orange-500" />
            <DialogTitle>Escalate Patient</DialogTitle>
            <HelpPopover content="Escalate a patient to a senior staff member or request additional resources. This creates an audit trail and notifies relevant personnel." />
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Patient Info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border text-sm">
            <div>
              <p className="font-medium">{patientName}</p>
              <p className="text-xs text-muted-foreground">{patientMrn}</p>
            </div>
            {waitMinutes !== undefined && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {waitMinutes} min wait
              </Badge>
            )}
          </div>

          {/* Escalation Type Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Escalation Type</Label>
            <div className="grid gap-2">
              {(Object.keys(ESCALATION_TYPE_CONFIG) as EscalationType[]).map((type) => {
                const config = ESCALATION_TYPE_CONFIG[type];
                const isSelected = selectedType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50',
                    )}
                  >
                    <div
                      className={cn(
                        'p-2 rounded-md',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {TYPE_ICONS[type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{config.shortLabel}</p>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="escalation-reason" className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="escalation-reason"
              placeholder="Describe the reason for escalation..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={escalateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedType || !reason.trim() || escalateMutation.isPending}
            className="gap-1"
          >
            {escalateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpCircle className="h-4 w-4" />
            )}
            Escalate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

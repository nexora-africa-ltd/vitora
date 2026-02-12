'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HelpPopover } from '@/components/shared/help-popover';
import type { CompatibilityViolation } from '@/lib/types/inpatient';

interface CompatibilityOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  violations: CompatibilityViolation[];
  wardName?: string;
  patientName?: string;
  onOverride: (reason: string) => void;
  onSelectDifferent: () => void;
  isSubmitting?: boolean;
}

export function CompatibilityOverrideDialog({
  open,
  onOpenChange,
  violations,
  wardName,
  patientName,
  onOverride,
  onSelectDifferent,
  isSubmitting = false,
}: CompatibilityOverrideDialogProps) {
  const [overrideReason, setOverrideReason] = useState('');

  const hasCriticalViolation = violations.some((v) => v.severity === 'CRITICAL');
  const canOverride = overrideReason.trim().length >= 10;

  const handleOverride = () => {
    if (canOverride) {
      onOverride(overrideReason.trim());
      setOverrideReason('');
    }
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOverrideReason('');
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <DialogTitle>Compatibility Warning</DialogTitle>
            <HelpPopover content="Ward compatibility rules help ensure patient safety. Override only when clinically justified." />
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Context */}
          {(wardName || patientName) && (
            <div className="text-sm text-muted-foreground">
              {patientName && <span className="font-medium">{patientName}</span>}
              {patientName && wardName && ' may not be compatible with '}
              {wardName && <span className="font-medium">{wardName}</span>}
              {!patientName && wardName && 'Patient may not be compatible with this ward'}
            </div>
          )}

          {/* Violations List */}
          <ul className="space-y-2">
            {violations.map((v, i) => (
              <li key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
                <Badge
                  variant={v.severity === 'CRITICAL' ? 'destructive' : 'secondary'}
                  className="shrink-0 mt-0.5"
                >
                  {v.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{v.message}</span>
                  {v.code && (
                    <span className="text-xs text-muted-foreground block mt-0.5">
                      Code: {v.code}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Critical Warning */}
          {hasCriticalViolation && (
            <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium">
                This admission has critical violations. Ensure you have clinical justification before proceeding.
              </p>
            </div>
          )}

          {/* Override Reason */}
          <div className="space-y-2">
            <Label htmlFor="override-reason">Override Reason (required)</Label>
            <Textarea
              id="override-reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Explain why this admission should proceed despite warnings (min 10 characters)..."
              rows={3}
              className="resize-none"
            />
            {overrideReason.length > 0 && overrideReason.length < 10 && (
              <p className="text-xs text-muted-foreground">
                {10 - overrideReason.length} more characters required
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onSelectDifferent();
              handleClose(false);
            }}
            className="w-full sm:w-auto"
          >
            Select Different Ward
          </Button>
          <Button
            type="button"
            variant={hasCriticalViolation ? 'destructive' : 'default'}
            onClick={handleOverride}
            disabled={!canOverride || isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting ? 'Processing...' : 'Override & Admit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

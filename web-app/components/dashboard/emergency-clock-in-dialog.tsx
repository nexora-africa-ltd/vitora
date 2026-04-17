'use client';

import { useState } from 'react';
import { AlertTriangle, LogIn, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { HelpPopover } from '@/components/shared/help-popover';
import type { EmergencyClockInPayload, ShiftType } from '@/lib/types/scheduling';

const SHIFT_TYPE_OPTIONS: { value: ShiftType; label: string }[] = [
  { value: 'DAY', label: 'Day Shift' },
  { value: 'NIGHT', label: 'Night Shift' },
  { value: 'MORNING', label: 'Morning Shift' },
  { value: 'AFTERNOON', label: 'Afternoon Shift' },
  { value: 'ON_CALL', label: 'On-Call' },
  { value: 'OVERTIME', label: 'Overtime' },
];

const DURATION_OPTIONS = [
  { value: '4', label: '4 hours' },
  { value: '6', label: '6 hours' },
  { value: '8', label: '8 hours (default)' },
  { value: '10', label: '10 hours' },
  { value: '12', label: '12 hours' },
];

interface EmergencyClockInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: EmergencyClockInPayload) => void;
  isPending: boolean;
}

export function EmergencyClockInDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: EmergencyClockInDialogProps) {
  const [reason, setReason] = useState('');
  const [shiftType, setShiftType] = useState<ShiftType>('DAY');
  const [durationHours, setDurationHours] = useState('8');

  const canSubmit = reason.trim().length >= 5 && !isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onConfirm({
      reason: reason.trim(),
      shift_type: shiftType,
      duration_hours: parseFloat(durationHours),
    });
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setReason('');
      setShiftType('DAY');
      setDurationHours('8');
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Emergency Clock-In</DialogTitle>
            <HelpPopover content="Create an ad-hoc shift and immediately clock in. Use when you need to work but have no scheduled shift (e.g. called in for emergency cover). This is logged in the audit trail." />
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning banner */}
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              This creates an unscheduled shift and is logged for audit purposes.
              Only use when no shift is available and you need to provide immediate care.
            </p>
          </div>

          {/* Reason (mandatory) */}
          <div className="space-y-2">
            <Label htmlFor="emergency-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="emergency-reason"
              placeholder="e.g. Called in for emergency surgery cover, covering for absent colleague..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 — minimum 5 characters
            </p>
          </div>

          {/* Shift type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Shift Type</Label>
              <Select value={shiftType} onValueChange={(v) => setShiftType(v as ShiftType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4 mr-1" />
            )}
            Emergency Clock-In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

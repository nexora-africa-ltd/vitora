/**
 * BypassTriageDialog Component
 *
 * Dialog for bypassing triage for OPTIONAL triage encounters.
 * Requires selecting a bypass reason before confirmation.
 *
 * Phase 3.2: Bypass Triage Dialog
 */
'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  type TriageBypassReason,
  TRIAGE_BYPASS_REASON_DISPLAY
} from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface BypassTriageEncounter {
  id: number;
  patient_name: string;
  patient_mrn: string;
  encounter_type: string;
  encounter_type_display: string;
  triage_requirement: string;
  triage_status: string;
}

export interface BypassTriageDialogProps {
  encounter: BypassTriageEncounter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBypass: (encounterId: number, reason: string, notes?: string) => Promise<void> | void;
  isLoading?: boolean;
  error?: string | null;
}

// =============================================================================
// Bypass Reason Options - derived from backend-aligned types
// =============================================================================

const BYPASS_REASONS = Object.entries(TRIAGE_BYPASS_REASON_DISPLAY).map(([value, label]) => ({
  value: value as Exclude<TriageBypassReason, null>,
  label,
}));

type BypassReasonValue = Exclude<TriageBypassReason, null>;

// =============================================================================
// Component
// =============================================================================

export function BypassTriageDialog({
  encounter,
  open,
  onOpenChange,
  onBypass,
  isLoading = false,
  error,
}: BypassTriageDialogProps) {
  const [selectedReason, setSelectedReason] = useState<BypassReasonValue | ''>('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedReason('');
      setNotes('');
      setValidationError(null);
    }
  }, [open]);

  // Clear validation error when reason is selected
  useEffect(() => {
    if (selectedReason) {
      setValidationError(null);
    }
  }, [selectedReason]);

  const handleConfirm = async () => {
    if (!selectedReason) {
      setValidationError('Please select a reason for bypassing triage.');
      return;
    }

    await onBypass(
      encounter.id,
      selectedReason,
      selectedReason === 'OTHER' ? notes : undefined
    );
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const showNotesField = selectedReason === 'OTHER';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Bypass Triage
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Warning message */}
              <p className="text-sm text-muted-foreground">
                You are about to bypass triage assessment for this patient.
                Please confirm and select a reason for bypassing triage.
              </p>

              {/* Patient Info */}
              <div className="rounded-md border p-3 bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{encounter.patient_name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="font-mono">{encounter.patient_mrn}</span>
                  <Badge variant="secondary">{encounter.encounter_type_display}</Badge>
                </div>
              </div>

              {/* Reason Selector */}
              <div className="space-y-2">
                <Label htmlFor="bypass-reason">
                  Reason for Bypass <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={selectedReason}
                  onValueChange={(value) => setSelectedReason(value as BypassReasonValue)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="bypass-reason" aria-label="Select a reason" disabled={isLoading}>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {BYPASS_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
              </div>

              {/* Notes field for "Other" reason */}
              {showNotesField && (
                <div className="space-y-2">
                  <Label htmlFor="bypass-notes">Additional Details</Label>
                  <Textarea
                    id="bypass-notes"
                    placeholder="Please specify the reason for bypassing triage..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={isLoading}
                    rows={3}
                  />
                </div>
              )}

              {/* Error message */}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'bg-orange-600 hover:bg-orange-700',
              isLoading && 'cursor-not-allowed opacity-50'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Bypassing...
              </>
            ) : (
              'Confirm Bypass'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default BypassTriageDialog;

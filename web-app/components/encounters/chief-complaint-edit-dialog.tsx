/**
 * Chief Complaint Edit Dialog
 * 
 * Shows a modal dialog that requires a reason before allowing
 * the clinician to edit a chief complaint that was set during triage.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Pencil } from 'lucide-react';

// Matches backend CHIEF_COMPLAINT_EDIT_REASON_CHOICES
export const CHIEF_COMPLAINT_EDIT_REASONS = [
  { value: 'ADDITIONAL_SYMPTOMS', label: 'Additional symptoms identified' },
  { value: 'PATIENT_DETAILS', label: 'Patient provided more details' },
  { value: 'INCORRECT_INITIAL', label: 'Incorrect initial assessment' },
  { value: 'CLARIFICATION', label: 'Clarification after examination' },
  { value: 'MISUNDERSTANDING', label: 'Triage miscommunication' },
  { value: 'OTHER', label: 'Other (specify)' },
] as const;

export type ChiefComplaintEditReason = typeof CHIEF_COMPLAINT_EDIT_REASONS[number]['value'];

interface ChiefComplaintEditDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog is closed */
  onOpenChange: (open: boolean) => void;
  /** Current chief complaint value */
  currentComplaint: string;
  /** Original complaint from triage (if any) */
  originalComplaint?: string;
  /** Callback when edit is confirmed */
  onConfirm: (data: {
    chief_complaint: string;
    edit_reason: ChiefComplaintEditReason;
    edit_reason_other: string;
  }) => void;
  /** Loading state */
  isLoading?: boolean;
}

export function ChiefComplaintEditDialog({
  open,
  onOpenChange,
  currentComplaint,
  originalComplaint,
  onConfirm,
  isLoading = false,
}: ChiefComplaintEditDialogProps) {
  const [editedComplaint, setEditedComplaint] = useState(currentComplaint);
  const [editReason, setEditReason] = useState<ChiefComplaintEditReason | ''>('');
  const [editReasonOther, setEditReasonOther] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEditedComplaint(currentComplaint);
      setEditReason('');
      setEditReasonOther('');
      setErrors({});
    }
    onOpenChange(newOpen);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!editedComplaint.trim()) {
      newErrors.complaint = 'Chief complaint is required';
    }

    if (!editReason) {
      newErrors.reason = 'Please select a reason for editing';
    }

    if (editReason === 'OTHER' && !editReasonOther.trim()) {
      newErrors.reasonOther = 'Please specify the reason';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!validate()) return;

    onConfirm({
      chief_complaint: editedComplaint.trim(),
      edit_reason: editReason as ChiefComplaintEditReason,
      edit_reason_other: editReason === 'OTHER' ? editReasonOther.trim() : '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Edit Chief Complaint
          </DialogTitle>
          <DialogDescription>
            The chief complaint was recorded during triage. Please provide a reason for editing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Show original complaint if different */}
          {originalComplaint && originalComplaint !== currentComplaint && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium text-muted-foreground mb-1">Original from triage:</p>
              <p className="text-foreground">{originalComplaint}</p>
            </div>
          )}

          {/* Warning */}
          <div className="flex items-start gap-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Audit Trail</p>
              <p className="text-amber-700 dark:text-amber-300">
                This change will be logged with your username and timestamp for compliance purposes.
              </p>
            </div>
          </div>

          {/* Edit Reason */}
          <div className="space-y-2">
            <Label htmlFor="edit-reason">
              Reason for Edit <span className="text-destructive">*</span>
            </Label>
            <Select
              value={editReason}
              onValueChange={(value) => {
                setEditReason(value as ChiefComplaintEditReason);
                if (errors.reason) {
                  setErrors((prev) => ({ ...prev, reason: '' }));
                }
              }}
            >
              <SelectTrigger id="edit-reason" className={errors.reason ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {CHIEF_COMPLAINT_EDIT_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason}</p>
            )}
          </div>

          {/* Other reason text */}
          {editReason === 'OTHER' && (
            <div className="space-y-2">
              <Label htmlFor="edit-reason-other">
                Specify Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-reason-other"
                placeholder="Please describe the reason for editing..."
                value={editReasonOther}
                onChange={(e) => {
                  setEditReasonOther(e.target.value);
                  if (errors.reasonOther) {
                    setErrors((prev) => ({ ...prev, reasonOther: '' }));
                  }
                }}
                rows={2}
                className={errors.reasonOther ? 'border-destructive' : ''}
              />
              {errors.reasonOther && (
                <p className="text-sm text-destructive">{errors.reasonOther}</p>
              )}
            </div>
          )}

          {/* Chief Complaint */}
          <div className="space-y-2">
            <Label htmlFor="chief-complaint-edit">
              Chief Complaint <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="chief-complaint-edit"
              placeholder="What brings the patient in today?"
              value={editedComplaint}
              onChange={(e) => {
                setEditedComplaint(e.target.value);
                if (errors.complaint) {
                  setErrors((prev) => ({ ...prev, complaint: '' }));
                }
              }}
              rows={3}
              className={errors.complaint ? 'border-destructive' : ''}
            />
            {errors.complaint && (
              <p className="text-sm text-destructive">{errors.complaint}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

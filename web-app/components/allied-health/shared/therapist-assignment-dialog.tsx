/**
 * Therapist Assignment Dialog
 *
 * A reusable dialog for assigning therapists to Allied Health orders.
 * Supports Physiotherapy, Occupational Therapy, and Counselling modules.
 */

'use client';

import * as React from 'react';
import { Loader2, User, Calendar, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { StaffSearchCombobox } from '@/components/clinics/staff-search-combobox';
import type { StaffProfile } from '@/lib/types/rbac';

// =============================================================================
// Types
// =============================================================================

/**
 * Module types supported by the dialog
 */
export type AlliedHealthModule = 'physiotherapy' | 'occupational-therapy' | 'counselling';

/**
 * Order information for display in the dialog
 */
export interface OrderInfo {
  id: number;
  orderNumber: string;
  patientName: string;
  patientMrn: string;
  treatmentTypeName?: string;
  priority: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  status: string;
  currentTherapistId?: number | null;
  currentTherapistName?: string | null;
}

/**
 * Assignment data returned by the dialog
 */
export interface AssignmentData {
  therapistId: number;
  therapist: StaffProfile;
  notes?: string;
  scheduledDate?: string;
}

// =============================================================================
// Props
// =============================================================================

export interface TherapistAssignmentDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog should close */
  onOpenChange: (open: boolean) => void;
  /** The module type */
  module: AlliedHealthModule;
  /** Order information */
  order: OrderInfo;
  /** Callback when assignment is confirmed */
  onAssign: (data: AssignmentData) => Promise<void>;
  /** Loading state from parent */
  isLoading?: boolean;
  /** Error message from parent */
  error?: string | null;
  /** List of user IDs to exclude (e.g., already assigned therapists) */
  excludeUserIds?: number[];
  /** Whether to show date scheduling */
  showScheduling?: boolean;
  /** Whether to show assignment notes */
  showNotes?: boolean;
}

// =============================================================================
// Module Configuration
// =============================================================================

const MODULE_CONFIG: Record<AlliedHealthModule, { title: string; therapistLabel: string }> = {
  physiotherapy: {
    title: 'Assign Physiotherapist',
    therapistLabel: 'Physiotherapist',
  },
  'occupational-therapy': {
    title: 'Assign Occupational Therapist',
    therapistLabel: 'Occupational Therapist',
  },
  counselling: {
    title: 'Assign Counsellor',
    therapistLabel: 'Counsellor',
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  ROUTINE: { label: 'Routine', className: 'bg-gray-100 text-gray-800' },
  URGENT: { label: 'Urgent', className: 'bg-orange-100 text-orange-800' },
  EMERGENCY: { label: 'Emergency', className: 'bg-red-100 text-red-800' },
};

// =============================================================================
// Component
// =============================================================================

/**
 * TherapistAssignmentDialog - Dialog for assigning therapists to orders
 *
 * Features:
 * - Searchable staff selection
 * - Order details display
 * - Optional scheduling date
 * - Assignment notes
 * - Current assignment indicator (for reassignment)
 */
export function TherapistAssignmentDialog({
  open,
  onOpenChange,
  module,
  order,
  onAssign,
  isLoading = false,
  error = null,
  excludeUserIds = [],
  showScheduling = true,
  showNotes = true,
}: TherapistAssignmentDialogProps) {
  const [selectedTherapistId, setSelectedTherapistId] = React.useState<number | undefined>();
  const [selectedTherapist, setSelectedTherapist] = React.useState<StaffProfile | null>(null);
  const [scheduledDate, setScheduledDate] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const config = MODULE_CONFIG[module];
  const priorityConfig = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG.ROUTINE;
  const isReassignment = !!order.currentTherapistId;

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedTherapistId(undefined);
      setSelectedTherapist(null);
      setScheduledDate('');
      setNotes('');
      setLocalError(null);
    }
  }, [open]);

  // Handle staff selection
  const handleStaffSelect = (userId: number, staff: StaffProfile) => {
    setSelectedTherapistId(userId);
    setSelectedTherapist(staff);
    setLocalError(null);
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!selectedTherapistId || !selectedTherapist) {
      setLocalError(`Please select a ${config.therapistLabel.toLowerCase()}`);
      return;
    }

    try {
      await onAssign({
        therapistId: selectedTherapistId,
        therapist: selectedTherapist,
        notes: notes || undefined,
        scheduledDate: scheduledDate || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      // Error is handled by parent
    }
  };

  const displayError = error || localError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {config.title}
          </DialogTitle>
          <DialogDescription>
            {isReassignment
              ? `Reassign this order from ${order.currentTherapistName || 'current therapist'}`
              : `Select a ${config.therapistLabel.toLowerCase()} to handle this order`}
          </DialogDescription>
        </DialogHeader>

        {/* Order Summary */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{order.orderNumber}</span>
            <Badge className={priorityConfig?.className ?? 'bg-gray-100 text-gray-800'}>
              {priorityConfig?.label ?? order.priority}
            </Badge>
          </div>
          <div className="text-sm">
            <span className="font-medium">{order.patientName}</span>
            <span className="text-muted-foreground ml-2">({order.patientMrn})</span>
          </div>
          {order.treatmentTypeName && (
            <div className="text-sm text-muted-foreground">
              Treatment: {order.treatmentTypeName}
            </div>
          )}
          {isReassignment && order.currentTherapistName && (
            <div className="text-sm text-muted-foreground">
              Currently assigned to: <span className="font-medium">{order.currentTherapistName}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Therapist Selection */}
          <div className="space-y-2">
            <Label htmlFor="therapist">{config.therapistLabel} *</Label>
            <StaffSearchCombobox
              value={selectedTherapistId}
              onSelect={handleStaffSelect}
              placeholder={`Search for ${config.therapistLabel.toLowerCase()}...`}
              excludeUserIds={excludeUserIds}
              className="w-full"
            />
          </div>

          {/* Scheduled Date */}
          {showScheduling && (
            <div className="space-y-2">
              <Label htmlFor="scheduledDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                First Session Date
              </Label>
              <Input
                id="scheduledDate"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
              <p className="text-xs text-muted-foreground">
                Optional: Schedule the first treatment session
              </p>
            </div>
          )}

          {/* Assignment Notes */}
          {showNotes && (
            <div className="space-y-2">
              <Label htmlFor="notes">Assignment Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any special instructions or notes for the therapist..."
                rows={3}
              />
            </div>
          )}

          {/* Error Display */}
          {displayError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{displayError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !selectedTherapistId}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : isReassignment ? (
              'Reassign'
            ) : (
              'Assign'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

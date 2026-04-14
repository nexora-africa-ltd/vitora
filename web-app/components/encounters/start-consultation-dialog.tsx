/**
 * StartConsultationDialog Component
 *
 * Confirmation dialog for starting a consultation with a patient.
 * Displays patient summary and initiates consultation workflow.
 *
 * Phase 3.4: Start Consultation
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  User,
  Clock,
  FileText,
  Stethoscope,
  Loader2,
  Play,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsultationQueueItem, TriageBypassReason } from '@/lib/types/encounter';
import { TRIAGE_BYPASS_REASON_DISPLAY } from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface StartConsultationDialogProps {
  queueItem: ConsultationQueueItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartConsultation: (encounterId: number) => Promise<unknown> | void;
  isLoading?: boolean;
  error?: string | null;
  /** Navigate to encounter edit page on success. Default: true */
  navigateOnSuccess?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

const getTriageBadgeStyles = (category: string | null): string => {
  switch (category) {
    case 'RED':
      return 'bg-red-500 text-white';
    case 'ORANGE':
      return 'bg-orange-500 text-white';
    case 'YELLOW':
      return 'bg-yellow-500 text-black';
    case 'GREEN':
      return 'bg-green-500 text-white';
    case 'BLUE':
      return 'bg-blue-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
};

const getBypassReasonDisplay = (reason: TriageBypassReason): string => {
  if (!reason) return 'Unknown';
  return TRIAGE_BYPASS_REASON_DISPLAY[reason] || reason;
};

const formatWaitTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

// =============================================================================
// Component
// =============================================================================

export function StartConsultationDialog({
  queueItem,
  open,
  onOpenChange,
  onStartConsultation,
  isLoading = false,
  error,
  navigateOnSuccess = true,
}: StartConsultationDialogProps) {
  const router = useRouter();

  const isBypassed = queueItem.triage_status === 'BYPASSED';
  const isDirect = queueItem.triage_status === 'NOT_APPLICABLE';

  const handleStartConsultation = async () => {
    try {
      await onStartConsultation(queueItem.id);

      if (navigateOnSuccess) {
        // Navigate to encounter edit page to document the consultation
        router.push(`/encounters/${queueItem.id}/edit`);
      }
    } catch {
      // Error is handled by the parent component
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md sm:max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertDialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-green-600 shrink-0" />
              <span className="truncate">Start Consultation</span>
            </AlertDialogTitle>
            <HelpPopover content="This will update the patient's status to 'In Consultation' and record the start time. You'll be navigated to document the encounter." />
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-3 sm:space-y-4">
              {/* Patient Info Card - Responsive */}
              <div className="rounded-md border p-3 sm:p-4 bg-muted/50 space-y-3">
                {/* Name and Demographics - Stack on mobile */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground truncate">
                      {queueItem.patient_name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-1">
                      <span className="font-mono text-xs sm:text-sm">{queueItem.patient_mrn}</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {queueItem.patient_age} {queueItem.patient_gender}
                      </span>
                    </div>
                  </div>

                  {/* Triage Badge - Fit width, don't stretch */}
                  <div className="shrink-0 self-start">
                    {isBypassed ? (
                      <Badge variant="secondary" className="bg-gray-200 text-gray-700 w-fit text-xs sm:text-sm">
                        Bypassed: {getBypassReasonDisplay(queueItem.triage_bypass_reason)}
                      </Badge>
                    ) : isDirect ? (
                      <Badge variant="secondary" className="bg-gray-200 text-gray-700 w-fit">
                        Direct
                      </Badge>
                    ) : queueItem.triage_category ? (
                      <Badge className={`${getTriageBadgeStyles(queueItem.triage_category)} w-fit`}>
                        {queueItem.triage_category}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Chief Complaint */}
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground mb-1">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="text-xs sm:text-sm">Chief Complaint</span>
                  </div>
                  <p className="text-foreground text-sm line-clamp-2 sm:line-clamp-none">{queueItem.chief_complaint}</p>
                </div>

                {/* Encounter Type & Wait Time - responsive */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                  <span className="text-muted-foreground text-xs sm:text-sm">
                    {queueItem.encounter_type_display}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground text-xs sm:text-sm">
                    <Clock className="h-3 w-3 shrink-0" />
                    Waiting: {formatWaitTime(queueItem.wait_time_minutes)}
                  </span>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Actions - Stack on mobile */}
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStartConsultation}
            disabled={isLoading}
            className={cn(
              'bg-green-600 hover:bg-green-700 w-full sm:w-auto',
              isLoading && 'cursor-not-allowed opacity-50'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Consultation
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default StartConsultationDialog;

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
import {
  User,
  Clock,
  FileText,
  Stethoscope,
  Loader2,
  Play,
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
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-green-600" />
            Start Consultation
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Confirmation message */}
              <p className="text-sm text-muted-foreground">
                You are about to begin a consultation with this patient.
                This will update their status and record the start time.
              </p>

              {/* Patient Info Card */}
              <div className="rounded-md border p-4 bg-muted/50 space-y-3">
                {/* Name and Demographics */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {queueItem.patient_name}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <span className="font-mono">{queueItem.patient_mrn}</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {queueItem.patient_age} {queueItem.patient_gender}
                      </span>
                    </div>
                  </div>

                  {/* Triage Badge */}
                  {isBypassed ? (
                    <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                      Bypassed: {getBypassReasonDisplay(queueItem.triage_bypass_reason)}
                    </Badge>
                  ) : isDirect ? (
                    <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                      Direct
                    </Badge>
                  ) : queueItem.triage_category ? (
                    <Badge className={getTriageBadgeStyles(queueItem.triage_category)}>
                      {queueItem.triage_category}
                    </Badge>
                  ) : null}
                </div>

                {/* Chief Complaint */}
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground mb-1">
                    <FileText className="h-3 w-3" />
                    Chief Complaint
                  </div>
                  <p className="text-foreground">{queueItem.chief_complaint}</p>
                </div>

                {/* Encounter Type & Wait Time */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {queueItem.encounter_type_display}
                  </span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Waiting: {formatWaitTime(queueItem.wait_time_minutes)}
                  </span>
                </div>
              </div>

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
            onClick={handleStartConsultation}
            disabled={isLoading}
            className={cn(
              'bg-green-600 hover:bg-green-700',
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

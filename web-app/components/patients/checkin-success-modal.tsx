'use client';

import { CheckCircle2, ArrowRight, X, Stethoscope, Building2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CheckInResponse } from '@/lib/types/checkin';

/**
 * Generic check-in result that can be constructed from different API responses
 */
export interface CheckinSuccessData {
  patientName: string;
  patientMrn: string;
  destination: 'triage' | 'clinic';
  destinationName: string;
  destinationUrl: string;
  queuePosition?: number;
  estimatedWaitMinutes?: number;
  skippedTriage?: boolean;
  warning?: string;
}

/**
 * Create CheckinSuccessData from CheckInResponse
 */
export function fromCheckInResponse(response: CheckInResponse): CheckinSuccessData {
  const isTriage = response.destination === 'TRIAGE' || response.destination === 'Triage';
  return {
    patientName: response.patient_name,
    patientMrn: response.patient_mrn,
    destination: isTriage ? 'triage' : 'clinic',
    destinationName: isTriage ? 'Triage' : (response.destination_clinic_name || response.destination),
    destinationUrl: isTriage ? '/triage' : `/clinics/${response.destination_clinic_id}/queue`,
    queuePosition: response.queue_position,
    estimatedWaitMinutes: response.estimated_wait_minutes,
    skippedTriage: response.skip_triage,
    warning: response.warning,
  };
}

interface CheckinSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Check-in result - can be from CheckInResponse or constructed manually */
  checkInResult: CheckinSuccessData | CheckInResponse | null;
  /** Optional callback when modal is dismissed */
  onDismiss?: () => void;
  /** Optional custom label for the dismiss button (defaults to "Stay Here") */
  dismissLabel?: string;
}

/**
 * Modal shown after successful patient check-in.
 * Provides navigation options to go to the triage queue or clinic queue.
 */
export function CheckinSuccessModal({
  open,
  onOpenChange,
  checkInResult,
  onDismiss,
  dismissLabel,
}: CheckinSuccessModalProps) {
  const router = useRouter();

  if (!checkInResult) return null;

  // Normalize the data - accept both CheckInResponse and CheckinSuccessData
  const data: CheckinSuccessData = 'patientName' in checkInResult
    ? checkInResult
    : fromCheckInResponse(checkInResult);

  const isTriage = data.destination === 'triage';

  const handleGoToDestination = () => {
    onOpenChange(false);
    router.push(data.destinationUrl);
  };

  const handleDismiss = () => {
    onOpenChange(false);
    onDismiss?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <DialogTitle className="text-center">Patient Checked In Successfully</DialogTitle>
          <DialogDescription className="text-center">
            {data.patientName} ({data.patientMrn}) has been added to the queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Queue Info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Destination</span>
              <div className="flex items-center gap-2">
                {isTriage ? (
                  <Stethoscope className="h-4 w-4 text-primary" />
                ) : (
                  <Building2 className="h-4 w-4 text-primary" />
                )}
                <span className="font-medium">{data.destinationName}</span>
              </div>
            </div>

            {data.queuePosition !== undefined && data.queuePosition > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Queue Position</span>
                <Badge variant="secondary" className="font-mono">
                  #{data.queuePosition}
                </Badge>
              </div>
            )}

            {data.estimatedWaitMinutes !== undefined && data.estimatedWaitMinutes > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated Wait</span>
                <span className="text-sm font-medium">
                  ~{data.estimatedWaitMinutes} min
                </span>
              </div>
            )}

            {data.skippedTriage && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Triage</span>
                <Badge variant="outline">Skipped</Badge>
              </div>
            )}
          </div>

          {data.warning && (
            <p className="text-sm text-warning text-center">{data.warning}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto">
            <X className="mr-2 h-4 w-4" />
            {dismissLabel || 'Stay Here'}
          </Button>
          <Button onClick={handleGoToDestination} className="w-full sm:w-auto">
            <ArrowRight className="mr-2 h-4 w-4" />
            Go to {data.destinationName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

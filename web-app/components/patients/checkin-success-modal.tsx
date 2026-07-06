'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, ArrowRight, X, Stethoscope, Building2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SHAConsentStep } from '@/components/patients/sha-consent-step';
import { useToast } from '@/lib/hooks/use-toast';
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
  /** Patient ID for SHA consent lookup */
  patientId?: number;
  /** Encounter ID created during check-in (for linking consent) */
  encounterId?: number | null;
  /** Patient date of birth (ISO string) — used for minor detection in OTP/whitelist flows */
  dateOfBirth?: string;
}

/**
 * Create CheckinSuccessData from CheckInResponse
 */
export function fromCheckInResponse(response: CheckInResponse, patientId?: number, dateOfBirth?: string): CheckinSuccessData {
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
    patientId,
    encounterId: response.encounter_id ?? response.linked_encounter_id ?? null,
    dateOfBirth,
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
  /** Skip SHA consent step (e.g., when consent was already obtained at check-in) */
  skipSHAConsent?: boolean;
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
  skipSHAConsent = false,
}: CheckinSuccessModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [shaConsentPending, setShaConsentPending] = useState(true);
  const [consentError, setConsentError] = useState<string | null>(null);

  // Reset consent state when modal opens with a new check-in result
  useEffect(() => {
    if (open && checkInResult) {
      setShaConsentPending(!skipSHAConsent);
      setConsentError(null);
    }
  }, [open, checkInResult, skipSHAConsent]);

  if (!checkInResult) return null;

  // Normalize the data - accept both CheckInResponse and CheckinSuccessData
  const data: CheckinSuccessData = 'patientName' in checkInResult
    ? checkInResult
    : fromCheckInResponse(checkInResult);

  const isTriage = data.destination === 'triage';

  const handleConsentError = (error: string) => {
    setConsentError(error);
    toast({
      title: 'Consent Error',
      description: error,
      variant: 'destructive',
    });
  };

  const handleGoToDestination = () => {
    onOpenChange(false);
    router.push(data.destinationUrl);
  };

  const handleDismiss = () => {
    onOpenChange(false);
    onDismiss?.();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <SheetTitle className="text-center">Patient Checked In</SheetTitle>
          <SheetDescription className="text-center">
            {data.patientName} ({data.patientMrn}) has been added to the queue.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
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

            {/* SHA Consent Step — shown for SHA-eligible patients (skip if already obtained) */}
            {data.patientId && !skipSHAConsent && (
              <SHAConsentStep
                patientId={data.patientId}
                encounterId={data.encounterId}
                patientDateOfBirth={data.dateOfBirth}
                onComplete={() => setShaConsentPending(false)}
                onError={handleConsentError}
              />
            )}

            {/* Inline consent error (in addition to toast) */}
            {consentError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">{consentError}</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-col gap-2 sm:flex-row sm:justify-end pt-4 border-t">
          <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto" disabled={data.patientId ? shaConsentPending : false}>
            <X className="mr-2 h-4 w-4" />
            {dismissLabel || 'Stay Here'}
          </Button>
          <Button onClick={handleGoToDestination} className="w-full sm:w-auto" disabled={data.patientId ? shaConsentPending : false}>
            <ArrowRight className="mr-2 h-4 w-4" />
            Go to {data.destinationName}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

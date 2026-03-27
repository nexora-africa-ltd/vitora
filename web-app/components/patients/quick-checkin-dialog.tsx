'use client';

import { useState, useMemo } from 'react';
import { UserCheck, Loader2, Stethoscope, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import { useCheckinPatient, usePatientLookup } from '@/lib/hooks/use-checkin';
import { useClinics } from '@/lib/hooks/use-clinics';
import { VISIT_REASON_OPTIONS, type VisitReason, type CheckInResponse } from '@/lib/types/checkin';
import { CheckinSuccessModal } from './checkin-success-modal';

const CHRONIC_CARE_CLINIC_TYPES = ['CCC', 'TB', 'DIABETIC', 'HYPERTENSION', 'MENTAL_HEALTH', 'ONCOLOGY', 'DIALYSIS'];

interface QuickCheckinDialogProps {
  patientId: number;
  patientName: string;
  patientMrn: string;
  onSuccess?: () => void;
}

export function QuickCheckinDialog({
  patientId,
  patientName,
  patientMrn,
  onSuccess,
}: QuickCheckinDialogProps) {
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<'TRIAGE' | number>('TRIAGE');
  const [visitReason, setVisitReason] = useState<VisitReason>('NEW_COMPLAINT');
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [referralFacility, setReferralFacility] = useState('');
  const [chronicClinicId, setChronicClinicId] = useState<number | undefined>(undefined);

  const { toast } = useToast();
  const checkinMutation = useCheckinPatient();
  const { data: clinicsData } = useClinics({});
  const { data: lookupData } = usePatientLookup(patientMrn, { enabled: open });

  const clinics = clinicsData?.results ?? [];

  // Use suggested values from lookup if available
  const suggestedReason = lookupData?.suggested_visit_reason;
  const suggestedType = lookupData?.suggested_visit_type;

  // Determine if this reason should skip triage
  const shouldSkipTriage = VISIT_REASON_OPTIONS.find((o) => o.value === visitReason)?.skipTriage ?? false;
  const isReferral = visitReason === 'REFERRAL_VISIT';
  const isChronicCare = visitReason === 'CHRONIC_CARE';
  const isEmergency = visitReason === 'EMERGENCY';

  // Chronic care clinics
  const chronicClinics = useMemo(
    () => clinics.filter((c) => CHRONIC_CARE_CLINIC_TYPES.includes(c.clinic_type)),
    [clinics]
  );

  // Validation
  const isReferralValid = !isReferral || referralFacility.trim().length > 0;
  const isChronicCareValid = !isChronicCare || chronicClinicId !== undefined;
  const canSubmit = isReferralValid && isChronicCareValid;

  const handleCheckin = async () => {
    // For chronic care, override destination with selected chronic clinic
    const finalDestination = isChronicCare && chronicClinicId ? chronicClinicId : destination;
    const finalSkipTriage = isChronicCare && chronicClinicId ? true : shouldSkipTriage;

    // Build notes with referral info
    const referralNote = isReferral && referralFacility.trim()
      ? `Referred from: ${referralFacility.trim()}`
      : '';

    try {
      const result = await checkinMutation.mutateAsync({
        patientId,
        data: {
          destination: finalDestination,
          visit_reason: visitReason,
          skip_triage: finalSkipTriage,
          ...(referralNote ? { notes: referralNote } : {}),
        },
      });

      // Store the result and show success modal
      setCheckInResult(result);
      setOpen(false);
      setShowSuccessModal(true);
    } catch (error) {
      toast({
        title: 'Check-in Failed',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleSuccessModalDismiss = () => {
    setCheckInResult(null);
    onSuccess?.();
  };

  return (
  <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <UserCheck className="mr-2 h-4 w-4" />
          Check-in Patient
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Check-in Patient</DialogTitle>
          <DialogDescription>
            Check in {patientName} ({patientMrn}) to the queue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Suggested Visit Type */}
          {suggestedType && (
            <Alert>
              <AlertTitle>Suggested Visit Type</AlertTitle>
              <AlertDescription className="flex items-center gap-2">
                <Badge variant={suggestedType === 'NEW' ? 'default' : 'secondary'}>
                  {suggestedType}
                </Badge>
                {suggestedReason && (
                  <span className="text-sm text-muted-foreground">
                    Reason: {VISIT_REASON_OPTIONS.find((o) => o.value === suggestedReason)?.label}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Visit Reason */}
          <div className="space-y-2">
            <Label>Visit Reason</Label>
            <Select
              value={visitReason}
              onValueChange={(value) => setVisitReason(value as VisitReason)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {VISIT_REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.skipTriage && ' (Skip Triage)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referral details */}
          {isReferral && (
            <div className="space-y-2">
              <Label>
                Referring Facility Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={referralFacility}
                onChange={(e) => setReferralFacility(e.target.value)}
                placeholder="e.g., Kenyatta National Hospital..."
              />
              {!referralFacility.trim() && (
                <p className="text-xs text-destructive">Referral facility name is required</p>
              )}
            </div>
          )}

          {/* Chronic care clinic selection */}
          {isChronicCare && (
            <div className="space-y-2">
              <Label>
                Chronic Care Clinic <span className="text-destructive">*</span>
              </Label>
              <Select
                value={chronicClinicId?.toString() ?? ''}
                onValueChange={(value) => setChronicClinicId(parseInt(value, 10))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select chronic care clinic" />
                </SelectTrigger>
                <SelectContent>
                  {chronicClinics.map((clinic) => (
                    <SelectItem key={clinic.id} value={clinic.id.toString()}>
                      {clinic.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!chronicClinicId && (
                <p className="text-xs text-destructive">Please select a chronic care clinic</p>
              )}
            </div>
          )}

          {/* Destination - hidden for chronic care (auto-routed) and skip-triage (must pick clinic) */}
          {!isChronicCare && (
            <div className="space-y-2">
              <Label>Destination</Label>
              <div className="flex gap-2">
                {!shouldSkipTriage && (
                  <Button
                    type="button"
                    variant={destination === 'TRIAGE' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setDestination('TRIAGE')}
                  >
                    <Stethoscope className="mr-2 h-4 w-4" />
                    Triage
                  </Button>
                )}
                <Select
                  value={typeof destination === 'number' ? destination.toString() : ''}
                  onValueChange={(value) => setDestination(parseInt(value, 10))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Direct to Clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {clinics.map((clinic) => (
                      <SelectItem key={clinic.id} value={clinic.id.toString()}>
                        {clinic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {shouldSkipTriage && typeof destination === 'number' && (
            <div className="text-sm text-muted-foreground">
              <Badge variant="outline">Skip Triage</Badge>{' '}
              This visit will go directly to the clinic.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCheckin} disabled={checkinMutation.isPending || !canSubmit}>
            {checkinMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking in...
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Check-in
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Success Modal with navigation options */}
    <CheckinSuccessModal
      open={showSuccessModal}
      onOpenChange={setShowSuccessModal}
      checkInResult={checkInResult}
      onDismiss={handleSuccessModalDismiss}
    />
  </>
  );
}

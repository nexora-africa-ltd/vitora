'use client';

import { useState, useMemo, useEffect } from 'react';
import { UserCheck, Loader2, Stethoscope, ArrowRight, Building2, Search, CheckCircle2 } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import { useCheckinPatient, usePatientLookup } from '@/lib/hooks/use-checkin';
import { useClinics } from '@/lib/hooks/use-clinics';
import { VISIT_REASON_OPTIONS, type VisitReason, type CheckInResponse } from '@/lib/types/checkin';
import { cn } from '@/lib/utils';
import { HelpPopover } from '@/components/shared/help-popover';
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
  const [destinationMode, setDestinationMode] = useState<'TRIAGE' | 'CLINIC'>('TRIAGE');
  const [visitReason, setVisitReason] = useState<VisitReason>('NEW_COMPLAINT');
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [referralFacility, setReferralFacility] = useState('');
  const [chronicClinicId, setChronicClinicId] = useState<number | undefined>(undefined);
  const [selectedClinicId, setSelectedClinicId] = useState<number | undefined>(undefined);
  const [clinicSearch, setClinicSearch] = useState('');

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

  // Chronic care clinics
  const chronicClinics = useMemo(
    () => clinics.filter((c) => CHRONIC_CARE_CLINIC_TYPES.includes(c.clinic_type)),
    [clinics]
  );

  const clinicOptions = isChronicCare ? chronicClinics : clinics;
  const normalizedClinicSearch = clinicSearch.trim().toLowerCase();
  const filteredClinics = useMemo(() => {
    if (!normalizedClinicSearch) {
      return clinicOptions;
    }

    return clinicOptions.filter((clinic) => {
      const haystack = [clinic.name, clinic.clinic_type, clinic.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedClinicSearch);
    });
  }, [clinicOptions, normalizedClinicSearch]);

  const selectedClinic = clinicOptions.find((clinic) => clinic.id === selectedClinicId);

  // Validation
  const isReferralValid = !isReferral || referralFacility.trim().length > 0;
  const isChronicCareValid = !isChronicCare || chronicClinicId !== undefined;
  const requiresClinicSelection = shouldSkipTriage && !isChronicCare;
  const isClinicMode = isChronicCare || requiresClinicSelection || destinationMode === 'CLINIC';
  const resolvedClinicId = isChronicCare ? chronicClinicId : selectedClinicId;
  const canSubmit = isReferralValid && isChronicCareValid && (!isClinicMode || resolvedClinicId !== undefined);
  const submitLabel = isChronicCare
    ? 'Route to Chronic Care Clinic'
    : isClinicMode
      ? 'Route to Clinic'
      : 'Check-in to Triage';

  const selectedReasonMeta = VISIT_REASON_OPTIONS.find((option) => option.value === visitReason);

  useEffect(() => {
    if (!open) {
      setDestinationMode('TRIAGE');
      setVisitReason('NEW_COMPLAINT');
      setReferralFacility('');
      setChronicClinicId(undefined);
      setSelectedClinicId(undefined);
      setClinicSearch('');
    }
  }, [open]);

  useEffect(() => {
    if (isChronicCare || requiresClinicSelection) {
      setDestinationMode('CLINIC');
    }
  }, [isChronicCare, requiresClinicSelection]);

  useEffect(() => {
    if (!isChronicCare) {
      setChronicClinicId(undefined);
    }
  }, [isChronicCare]);

  useEffect(() => {
    if (destinationMode !== 'CLINIC' && !requiresClinicSelection) {
      setSelectedClinicId(undefined);
      setClinicSearch('');
    }
  }, [destinationMode, requiresClinicSelection]);

  const handleCheckin = async () => {
    const finalDestination = isChronicCare && chronicClinicId
      ? chronicClinicId
      : isClinicMode && selectedClinicId
        ? selectedClinicId
        : 'TRIAGE';
    const finalSkipTriage = isChronicCare && chronicClinicId ? true : shouldSkipTriage;

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
      <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[min(90vh,44rem)] sm:max-h-[90vh] sm:max-w-[680px]">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-0 bg-background">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 sm:h-40 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_55%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.1),transparent_50%)]"
          />

          <DialogHeader className="relative border-b px-3 py-3 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <UserCheck className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  Quick Check-in
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Review the visit reason, choose triage or a clinic destination, then confirm the patient check-in.
                </DialogDescription>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:gap-2 sm:text-sm">
                  <span className="font-medium text-foreground">{patientName}</span>
                  <Badge variant="outline" className="font-mono text-[11px] sm:text-xs">
                    {patientMrn}
                  </Badge>
                </div>
              </div>
              <Badge variant="secondary" className="w-fit self-start text-[11px] sm:text-xs">
                Front Desk Workflow
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 px-3 py-3 sm:space-y-5 sm:px-6 sm:py-4">
              {suggestedType && (
                <Alert className="border-primary/20 bg-primary/5">
                  <AlertTitle className="flex items-center gap-2 text-xs sm:text-sm">
                    Suggested intake context
                    <Badge variant={suggestedType === 'NEW' ? 'default' : 'secondary'} className="text-[10px] sm:text-xs">
                      {suggestedType}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="text-xs sm:text-sm">
                    {suggestedReason
                      ? `Most recent lookup suggests ${VISIT_REASON_OPTIONS.find((o) => o.value === suggestedReason)?.label ?? suggestedReason}.`
                      : 'Use the last known visit context as a starting point and adjust if needed.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
                <section className="space-y-3 rounded-xl border bg-card p-3 shadow-sm sm:space-y-4 sm:p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-sm">
                      Visit Details
                    </h3>
                    <HelpPopover content="Record why the patient is visiting and capture any required referral information before choosing the destination." />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="quick-checkin-visit-reason">Visit Reason</Label>
                    <HelpPopover content="Choose the workflow that best matches the patient's current visit. Some reasons force a direct clinic route instead of triage." />
                  </div>
                  <Select
                    value={visitReason}
                    onValueChange={(value) => setVisitReason(value as VisitReason)}
                  >
                    <SelectTrigger id="quick-checkin-visit-reason">
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIT_REASON_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                          {option.skipTriage ? ' (Skip Triage)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isReferral && (
                  <div className="space-y-2">
                    <Label htmlFor="quick-checkin-referral-facility">
                      Referring Facility Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="quick-checkin-referral-facility"
                      value={referralFacility}
                      onChange={(e) => setReferralFacility(e.target.value)}
                      placeholder="e.g., Kenyatta National Hospital"
                    />
                    {!referralFacility.trim() && (
                      <p className="text-xs text-destructive">Referral facility name is required.</p>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground sm:text-sm">
                  <span className="font-medium text-foreground">Current action:</span>{' '}
                  {submitLabel}
                  {selectedClinic ? ` to ${selectedClinic.name}` : ''}
                </div>
                </section>

                <section className="space-y-3 rounded-xl border bg-card p-3 shadow-sm sm:space-y-4 sm:p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-sm">
                      Routing
                    </h3>
                    <HelpPopover content="Select whether the patient should go through triage first or be routed straight to a clinic. The selected option drives the primary action button below." />
                  </div>
                </div>

                {!isChronicCare && (
                  <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setDestinationMode('TRIAGE')}
                      disabled={requiresClinicSelection}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all duration-200 sm:p-4',
                        !requiresClinicSelection && destinationMode === 'TRIAGE'
                          ? 'scale-[1.05] border-success bg-success text-success-foreground shadow-lg'
                          : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5',
                        requiresClinicSelection && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Stethoscope className={cn('h-4 w-4', !requiresClinicSelection && destinationMode === 'TRIAGE' ? 'text-success-foreground' : 'text-primary')} />
                        Triage
                        {!requiresClinicSelection && destinationMode === 'TRIAGE' && (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-success-foreground" />
                        )}
                      </div>
                      <p className={cn('mt-2 text-xs', !requiresClinicSelection && destinationMode === 'TRIAGE' ? 'text-success-foreground/90' : 'text-muted-foreground')}>
                        Default workflow for assessment and vitals capture.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDestinationMode('CLINIC')}
                      className={cn(
                        'rounded-xl border p-3 text-left transition-all duration-200 sm:p-4',
                        isClinicMode
                          ? 'scale-[1.05] border-success bg-success text-success-foreground shadow-lg'
                          : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Building2 className={cn('h-4 w-4', isClinicMode ? 'text-success-foreground' : 'text-primary')} />
                        Direct to Clinic
                        {isClinicMode && (
                          <CheckCircle2 className="ml-auto h-4 w-4 text-success-foreground" />
                        )}
                      </div>
                      <p className={cn('mt-2 text-xs', isClinicMode ? 'text-success-foreground/90' : 'text-muted-foreground')}>
                        Skip triage when the visit reason or workflow already determines the destination.
                      </p>
                    </button>
                  </div>
                )}

                {(requiresClinicSelection || isChronicCare) && (
                  <Alert className="border-amber-300/40 bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                    <AlertTitle>
                      {isChronicCare ? 'Select a chronic care clinic' : 'Clinic selection required'}
                    </AlertTitle>
                    <AlertDescription>
                      {isChronicCare
                        ? 'Chronic care reviews route directly to a specialty clinic.'
                        : 'This visit reason bypasses triage, so choose the destination clinic below.'}
                    </AlertDescription>
                  </Alert>
                )}

                {isClinicMode && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="quick-checkin-clinic-search">
                          {isChronicCare ? 'Find Chronic Care Clinic' : 'Find Clinic'}
                        </Label>
                        <HelpPopover content="Filter the available clinics, then tap a card to select the destination. The selected clinic becomes part of the primary action." />
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="quick-checkin-clinic-search"
                          value={clinicSearch}
                          onChange={(e) => setClinicSearch(e.target.value)}
                          placeholder={isChronicCare ? 'Search chronic care clinics...' : 'Search clinics by name or type...'}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {filteredClinics.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-3 py-5 text-center text-xs text-muted-foreground sm:text-sm">
                          No clinics match the current filter.
                        </div>
                      ) : (
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1 sm:max-h-64">
                          {filteredClinics.map((clinic) => {
                            const isSelected = clinic.id === resolvedClinicId;
                            return (
                              <button
                                key={clinic.id}
                                type="button"
                                aria-label={`Select ${clinic.name}`}
                                onClick={() => {
                                  if (isChronicCare) {
                                    setChronicClinicId(clinic.id);
                                  } else {
                                    setSelectedClinicId(clinic.id);
                                    setDestinationMode('CLINIC');
                                  }
                                }}
                                className={cn(
                                  'w-full rounded-lg border px-3 py-3 text-left transition-all duration-200',
                                  isSelected
                                    ? 'scale-[1.02] border-success bg-success/10 shadow-sm'
                                    : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5'
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className={cn('truncate text-sm font-medium', isSelected ? 'text-success' : 'text-foreground')}>
                                      {clinic.name}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {clinic.clinic_type?.replace(/_/g, ' ') || 'Clinic'}
                                      {clinic.code ? ` • ${clinic.code}` : ''}
                                    </p>
                                  </div>
                                  {isSelected && (
                                    <div className="flex items-center gap-1 text-success">
                                      <Badge className="bg-success text-success-foreground hover:bg-success">Selected</Badge>
                                      <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </section>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t bg-background px-3 py-3 sm:px-6 sm:py-4">
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
                  {submitLabel}
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
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

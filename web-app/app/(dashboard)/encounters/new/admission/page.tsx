/**
 * New Encounter - Admission Step (IPD Only)
 *
 * Shown only when encounter type is IPD.
 * Captures ward, bed, payer, and special requirements inline.
 *
 * Route: /encounters/new/admission
 */
'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, BedDouble, AlertTriangle, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNewEncounterStore } from '@/lib/stores/new-encounter-store';
import {
  useInpatientWards,
  useBeds,
  useRecommendWard,
  useSmartRecommendBed,
} from '@/lib/hooks/use-inpatient';
import { BedSelectionGrid } from '@/components/inpatient';
import { cn } from '@/lib/utils/cn';
import { useFacility } from '@/lib/context/facility-context';
import { shaApi } from '@/lib/api/sha';

export default function NewEncounterAdmissionPage() {
  const router = useRouter();
  const { getPatient, getDetails, getAdmission, setAdmission, markSectionComplete } =
    useNewEncounterStore();

  const { data: patientData, id: patientId } = getPatient();
  const details = getDetails();
  const admission = getAdmission();
  const { facilityDetail } = useFacility();
  const [wardAssignmentMode, setWardAssignmentMode] = useState<'auto' | 'manual'>(
    admission.wardId ? 'manual' : 'auto'
  );

  // SHA eligibility check when payer type is SHA
  const [shaEligibility, setShaEligibility] = useState<{
    status: 'idle' | 'checking' | 'eligible' | 'ineligible' | 'blocked';
    message?: string;
  }>({ status: 'idle' });
  const shaCheckAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (admission.payerType !== 'SHA' || !patientId) {
      setShaEligibility({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    shaCheckAbortRef.current = controller;

    setShaEligibility({ status: 'checking' });

    shaApi
      .checkPatientEligibility(patientId)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.is_eligible) {
          setShaEligibility({
            status: 'ineligible',
            message:
              'Patient is not SHA-eligible. Claims will be rejected. Consider using Cash payment.',
          });
          return;
        }
        // Check facility-level coverage
        const responseData = (
          result as {
            response_data?: { coverage_blocked?: boolean; coverage_caveat?: string };
          }
        ).response_data;
        const coverageBlocked = responseData?.coverage_blocked;
        const coverageCaveat = responseData?.coverage_caveat;
        if (coverageBlocked && coverageCaveat) {
          setShaEligibility({ status: 'blocked', message: coverageCaveat });
        } else {
          setShaEligibility({ status: 'eligible' });
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setShaEligibility({ status: 'idle' });
      });

    return () => {
      controller.abort();
    };
  }, [admission.payerType, patientId]);

  // Redirect if not IPD or no patient
  useEffect(() => {
    if (!patientData) {
      router.push('/encounters/new/patient');
    } else if (details.encounter_type !== 'IPD') {
      router.push('/encounters/new/review');
    }
  }, [patientData, details.encounter_type, router]);

  // Data fetching
  const { data: wards } = useInpatientWards();
  const selectedWardId = admission.wardId ?? undefined;
  const { data: beds } = useBeds({ ward: selectedWardId });
  const wardRecommendation = useRecommendWard();
  const smartRecommendBed = useSmartRecommendBed();

  const wardsList = useMemo(() => {
    return wards?.results ?? [];
  }, [wards]);

  const selectedWard = useMemo(
    () => wardsList.find((w) => w.id === admission.wardId) ?? null,
    [wardsList, admission.wardId]
  );
  const recommendationAdmissionType = useMemo(() => {
    const urgency = details.admission_urgency || 'ROUTINE';
    if (urgency === 'EMERGENCY' || urgency === 'URGENT') return 'EMERGENCY' as const;
    return 'ELECTIVE' as const;
  }, [details.admission_urgency]);

  // Ward recommendation
  const [wardRecData, setWardRecData] = useState<typeof wardRecommendation.data>(undefined);
  const [wardRecLoading, setWardRecLoading] = useState(false);

  useEffect(() => {
    if (!patientId || wardAssignmentMode !== 'auto') return;

    let cancelled = false;
    setWardRecLoading(true);

    wardRecommendation
      .mutateAsync({
        patient_id: patientId,
        requires_isolation: admission.requiresIsolation,
        requires_oxygen: admission.requiresOxygen,
        requires_ventilator: admission.requiresVentilator,
        admission_type: recommendationAdmissionType,
      })
      .then((result) => {
        if (!cancelled) {
          setWardRecData(result);
          setWardRecLoading(false);
          if (result.success && result.recommended_ward_id) {
            handleWardChange(result.recommended_ward_id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setWardRecLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    patientId,
    wardAssignmentMode,
    admission.requiresIsolation,
    admission.requiresOxygen,
    admission.requiresVentilator,
  ]);

  // Bed recommendation
  useEffect(() => {
    if (!patientId || !selectedWardId) return;

    smartRecommendBed.mutate({
      wardId: selectedWardId,
      data: {
        patient_id: patientId,
        requires_isolation: admission.requiresIsolation || undefined,
        requires_oxygen: admission.requiresOxygen || undefined,
        requires_ventilator: admission.requiresVentilator || undefined,
        admission_type: recommendationAdmissionType,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, selectedWardId, recommendationAdmissionType]);

  // Auto-select recommended bed
  useEffect(() => {
    if (smartRecommendBed.data?.success && smartRecommendBed.data.assigned_bed_id) {
      setAdmission({
        bedId: smartRecommendBed.data.assigned_bed_id,
        bedNumber: smartRecommendBed.data.assigned_bed_number || undefined,
      });
    }
  }, [smartRecommendBed.data, setAdmission]);

  const handleWardChange = useCallback(
    (wardId: number) => {
      const ward = wardsList.find((w) => w.id === wardId);
      setAdmission({
        wardId,
        wardName: ward?.name,
        bedId: null,
        bedNumber: undefined,
      });
      smartRecommendBed.reset();
    },
    [wardsList, setAdmission, smartRecommendBed]
  );

  const handleBedSelect = useCallback(
    (bedId: number, bedNumber?: string) => {
      setAdmission({ bedId, bedNumber });
    },
    [setAdmission]
  );

  // Navigation
  const handlePrevious = useCallback(() => {
    router.push('/encounters/new/diagnosis');
  }, [router]);

  const handleNext = useCallback(() => {
    if (admission.wardId && admission.bedId) {
      markSectionComplete('admission');
      router.push('/encounters/new/review');
    }
  }, [admission.wardId, admission.bedId, markSectionComplete, router]);

  const canProceed = !!admission.wardId && !!admission.bedId;

  if (!patientData || details.encounter_type !== 'IPD') return null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Ward Selection */}
      <Card>
        <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BedDouble className="h-4 w-4 sm:h-5 sm:w-5" />
            Ward & Bed Assignment
          </CardTitle>
          <CardDescription>Select a ward and bed for this inpatient admission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          {/* Special Requirements */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="requires-isolation" className="text-sm">
                Isolation
              </Label>
              <Switch
                id="requires-isolation"
                checked={admission.requiresIsolation}
                onCheckedChange={(v) => setAdmission({ requiresIsolation: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="requires-oxygen" className="text-sm">
                Oxygen
              </Label>
              <Switch
                id="requires-oxygen"
                checked={admission.requiresOxygen}
                onCheckedChange={(v) => setAdmission({ requiresOxygen: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label htmlFor="requires-ventilator" className="text-sm">
                Ventilator
              </Label>
              <Switch
                id="requires-ventilator"
                checked={admission.requiresVentilator}
                onCheckedChange={(v) => setAdmission({ requiresVentilator: v })}
              />
            </div>
          </div>

          {/* Payer Type */}
          <div className="space-y-2">
            <Label>Payer Type</Label>
            <Select
              value={admission.payerType}
              onValueChange={(v) => setAdmission({ payerType: v as 'CASH' | 'SHA' | 'CORPORATE' })}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="SHA">SHA Insurance</SelectItem>
                <SelectItem value="CORPORATE">Corporate</SelectItem>
              </SelectContent>
            </Select>
            {/* SHA eligibility warning */}
            {admission.payerType === 'SHA' && shaEligibility.status === 'checking' && (
              <p className="text-xs text-muted-foreground">Checking SHA eligibility...</p>
            )}
            {admission.payerType === 'SHA' && shaEligibility.status === 'ineligible' && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  {shaEligibility.message}
                </AlertDescription>
              </Alert>
            )}
            {admission.payerType === 'SHA' && shaEligibility.status === 'blocked' && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  {shaEligibility.message}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Ward Assignment Mode */}
          <div className="flex items-center justify-between">
            <Label>Ward Placement</Label>
            <div className="flex items-center gap-2">
              <Badge
                variant={wardAssignmentMode === 'auto' ? 'default' : 'outline'}
                className="text-xs"
              >
                {wardAssignmentMode === 'auto' ? 'Smart' : 'Manual'}
              </Badge>
              <Switch
                checked={wardAssignmentMode === 'auto'}
                onCheckedChange={(checked) => {
                  setWardAssignmentMode(checked ? 'auto' : 'manual');
                  if (checked) {
                    setAdmission({
                      wardId: null,
                      bedId: null,
                      wardName: undefined,
                      bedNumber: undefined,
                    });
                    setWardRecData(undefined);
                  }
                }}
              />
            </div>
          </div>

          {wardAssignmentMode === 'auto' ? (
            <div className="space-y-2">
              {wardRecLoading && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                    <p className="text-sm text-muted-foreground">Evaluating wards...</p>
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              )}
              {!wardRecLoading && wardRecData && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium">
                    {wardRecData.success
                      ? `Recommended: ${wardRecData.recommended_ward_name}`
                      : 'No compatible ward found'}
                  </p>
                  {wardRecData.ranked_wards.length > 0 && (
                    <div className="space-y-1">
                      {wardRecData.ranked_wards.slice(0, 3).map((rw, idx) => (
                        <button
                          key={rw.ward_id}
                          type="button"
                          onClick={() => handleWardChange(rw.ward_id)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-md border p-2 text-left text-sm transition-colors hover:bg-accent',
                            idx === 0 && 'border-primary/30 bg-primary/5',
                            rw.ward_id === admission.wardId && 'ring-2 ring-primary'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold',
                                idx === 0
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              {idx + 1}
                            </span>
                            <span className="truncate font-medium">{rw.ward_name}</span>
                            <span className="text-xs text-muted-foreground">{rw.ward_type}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {rw.available_beds} beds
                            </span>
                            <Badge variant="outline" className="text-xs">
                              Score {rw.score.toFixed(1)}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Select
              value={admission.wardId ? String(admission.wardId) : ''}
              onValueChange={(v) => handleWardChange(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select ward" />
              </SelectTrigger>
              <SelectContent>
                {wardsList.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    {w.name} ({w.ward_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Bed Selection */}
          {admission.wardId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Bed Assignment</Label>
                {smartRecommendBed.data?.success && smartRecommendBed.data.assigned_bed_number && (
                  <Badge variant="secondary" className="text-xs">
                    Recommended: {smartRecommendBed.data.assigned_bed_number}
                  </Badge>
                )}
              </div>
              {beds ? (
                <BedSelectionGrid
                  beds={beds?.results ?? []}
                  selectedBedId={admission.bedId ?? undefined}
                  onSelectBed={(bedId: number) => handleBedSelect(bedId)}
                />
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full rounded-md" />
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {admission.wardId && admission.bedId && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
              <BedDouble className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                Ward:{' '}
                <strong>
                  {admission.wardName || selectedWard?.name || `Ward #${admission.wardId}`}
                </strong>
                {' • '}
                Bed: <strong>{admission.bedNumber || `#${admission.bedId}`}</strong>
                {' • '}
                Payer: <strong>{admission.payerType}</strong>
              </AlertDescription>
            </Alert>
          )}

          {!canProceed && admission.wardId && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                Please select a bed to continue.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handlePrevious}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={!canProceed}>
          Next: Review
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Triage Assess - Route Tab
 *
 * Final step in triage assessment workflow.
 * Routes patient to appropriate clinic or emergency area.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/route
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  User,
  MapPin,
  Activity,
  Heart,
  Thermometer,
  Clock,
  Stethoscope,
  Siren,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ShiftGate } from '@/components/shared/shift-gate';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import { TriageCategoryBadge } from '@/components/triage';
import { CheckinSuccessModal, type CheckinSuccessData } from '@/components/patients/checkin-success-modal';
import { usePatientContext } from '@/lib/context/patient-context';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { useCreateTriageAssessment, useCompleteTriageAssessment } from '@/lib/hooks/use-triage';
import { useTriageAssessHistoryAvailability } from '@/lib/hooks/use-triage-assess-history-availability';
import { triageApi } from '@/lib/api/triage';
import { useClinics } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import {
  ASSIGNED_AREA_CONFIG,
  EMERGENCY_AREA_OPTIONS,
  TRIAGE_CATEGORY_CONFIG,
  type AssignedArea,
  type TriageCategory,
} from '@/lib/types/triage';
import { ZONE_ROUTES } from '@/lib/config/emergency';

// =============================================================================
// Schema
// =============================================================================

const routingSchema = z.object({
  routing_type: z.enum(['emergency', 'clinic'], {
    required_error: 'Select where to route the patient',
  }),
  assigned_area: z.string().optional(),
  assigned_clinic: z.number().nullable().optional(),
}).refine(
  (data) => {
    if (data.routing_type === 'emergency') {
      return !!data.assigned_area && data.assigned_area.trim() !== '';
    }
    return data.assigned_clinic != null;
  },
  {
    message: 'Select a routing destination',
    path: ['assigned_area'],
  }
);

type RoutingFormData = z.infer<typeof routingSchema>;

// =============================================================================
// Component
// =============================================================================

export default function TriageRoutePage() {
  const router = useRouter();
  const params = useParams();
  const { patient } = usePatientContext();
  const { encounter } = useEncounterContext();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;
  const patientIdNum = parseInt(patientId, 10);
  const encounterIdNum = parseInt(encounterId, 10);
  const { showHistoryStep } = useTriageAssessHistoryAvailability(patientIdNum, encounterIdNum);

  // Get triage store data
  const {
    getVitals,
    getAssessment,
    getRouting,
    setRouting,
    markSectionComplete,
    markSectionVisited,
    clearSession,
  } = useTriageAssessStore();

  const currentVitals = getVitals(parseInt(encounterId, 10));
  const currentAssessment = getAssessment(parseInt(encounterId, 10));
  const currentRouting = getRouting(parseInt(encounterId, 10));

  // Mark route as visited when leaving the tab
  useEffect(() => {
    return () => {
      markSectionVisited(encounterIdNum, 'route');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterIdNum]);

  // Hooks
  const { mutateAsync: createAssessment, isPending: isCreating } = useCreateTriageAssessment();
  const { mutateAsync: completeAssessment, isPending: isCompleting } = useCompleteTriageAssessment();
  const { data: clinicsData, isLoading: isClinicsLoading } = useClinics({ page_size: 100 });

  // Local state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<CheckinSuccessData | null>(null);

  // Determine default routing type based on current state or triage category
  const triageCategory = currentAssessment?.triage_category;
  const isEmergencyCategory = triageCategory === 'RED' || triageCategory === 'ORANGE';
  const defaultRoutingType = currentRouting?.assigned_area
    ? 'emergency'
    : currentRouting?.assigned_clinic
    ? 'clinic'
    : isEmergencyCategory
    ? 'emergency'
    : 'clinic';

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RoutingFormData>({
    resolver: zodResolver(routingSchema),
    defaultValues: {
      routing_type: defaultRoutingType,
      assigned_area: currentRouting?.assigned_area || '',
      assigned_clinic: currentRouting?.assigned_clinic ?? null,
    },
  });

  const routingType = watch('routing_type');
  const selectedArea = watch('assigned_area');
  const selectedClinic = watch('assigned_clinic');

  // Auto-select General OPD clinic when clinics load and no clinic is pre-selected
  useEffect(() => {
    if (routingType === 'clinic' && !selectedClinic && clinicsData?.results?.length) {
      // Priority 1: Match by name containing "general opd" (most specific)
      const byName = clinicsData.results.find(
        (c) => c.name.toLowerCase().includes('general opd')
      );
      // Priority 2: Match by clinic_type, preferring non-test clinics
      const byType = !byName
        ? clinicsData.results.find(
            (c) => c.clinic_type === 'GENERAL_OPD' && !c.name.toLowerCase().includes('test')
          )
        : undefined;
      const match = byName || byType;
      if (match) {
        setValue('assigned_clinic', match.id);
      }
    }
  }, [routingType, selectedClinic, clinicsData, setValue]);

  const onSubmit = useCallback(
    async (data: RoutingFormData) => {
      // Validation: need assessment data
      if (!currentAssessment) {
        toast({
          title: 'Missing Assessment',
          description: 'Please complete the assessment tab first.',
          variant: 'destructive',
        });
        router.push(`/triage/assess/${patientId}/${encounterId}/assessment`);
        return;
      }

      // Store routing
      setRouting(parseInt(encounterId, 10), {
        assigned_area: data.routing_type === 'emergency' ? (data.assigned_area as AssignedArea) : '',
        assigned_clinic: data.routing_type === 'clinic' ? data.assigned_clinic ?? undefined : undefined,
      });

      try {
        // Build assessment payload
        // Filter out placeholder chief complaints
        const PLACEHOLDER_COMPLAINTS = ['Triage assessment', 'Check-in', 'check-in', 'Checkin'];
        const getChiefComplaint = () => {
          if (currentAssessment.chief_complaint) return currentAssessment.chief_complaint;
          if (
            encounter?.chief_complaint &&
            !PLACEHOLDER_COMPLAINTS.includes(encounter.chief_complaint)
          ) {
            return encounter.chief_complaint;
          }
          return 'Patient presenting for evaluation';
        };

        const payload = {
          encounter: parseInt(encounterId, 10),
          arrival_mode: currentAssessment.arrival_mode || 'WALK_IN',
          referring_facility_name: currentAssessment.referring_facility_name || '',
          arrival_time: currentAssessment.arrival_time || new Date().toISOString(),
          chief_complaint_category: currentAssessment.chief_complaint_category || 'OTHER',
          chief_complaint: getChiefComplaint(),
          pain_score: currentAssessment.pain_score ?? 0,
          mental_status: currentAssessment.mental_status || 'A',
          mobility: currentAssessment.mobility || 'AMBULATORY',
          triage_category: currentAssessment.triage_category || 'GREEN',
          auto_calculated_category: currentAssessment.auto_calculated_category,
          category_override_reason: currentAssessment.category_override_reason,
          // Vitals
          spo2: currentVitals?.spo2,
          heart_rate: currentVitals?.heart_rate,
          systolic_bp: currentVitals?.systolic_bp,
          diastolic_bp: currentVitals?.diastolic_bp,
          temperature: currentVitals?.temperature,
          respiratory_rate: currentVitals?.respiratory_rate,
          weight: currentVitals?.weight,
          height: currentVitals?.height,
          // Routing
          assigned_area: (data.routing_type === 'emergency' ? data.assigned_area : '') as AssignedArea | '',
          assigned_clinic: data.routing_type === 'clinic' ? data.assigned_clinic : null,
        };

        // Create the assessment (sets triage_start_time, status = IN_PROGRESS)
        let assessment = await createAssessment(payload);
        // Offline mutation returns null — fall back to direct API call
        // because completeAssessment and routing need a server-generated ID.
        if (!assessment) {
          assessment = await triageApi.createAssessment(payload);
        }

        // Complete the assessment (sets triage_end_time, status = COMPLETED)
        await completeAssessment(assessment.id);

        // Mark route section as complete before clearing session
        markSectionComplete(parseInt(encounterId, 10), 'route');

        // Clear triage session
        clearSession(parseInt(encounterId, 10));

        // Get destination info for success modal
        let destinationName = '';
        let destinationUrl = '/triage';

        if (data.routing_type === 'clinic' && data.assigned_clinic) {
          const clinic = clinicsData?.results?.find((c) => c.id === data.assigned_clinic);
          destinationName = clinic?.name || 'Clinic';
          destinationUrl = `/clinics/${data.assigned_clinic}/queue`;
        } else if (data.routing_type === 'emergency' && data.assigned_area) {
          const areaConfig = ASSIGNED_AREA_CONFIG[data.assigned_area as Exclude<AssignedArea, ''>];
          destinationName = areaConfig?.label || data.assigned_area;
          // Route to the emergency zone page
          const zoneRoute = ZONE_ROUTES[data.assigned_area];
          if (zoneRoute) {
            destinationUrl = `/emergency/${zoneRoute}`;
          } else {
            destinationUrl = '/emergency';
          }
        }

        // Show success modal
        setSuccessData({
          patientName: patient ? `${patient.first_name} ${patient.last_name}` : 'Patient',
          patientMrn: patient?.mrn || '',
          destination: data.routing_type === 'clinic' ? 'clinic' : 'triage',
          destinationName,
          destinationUrl,
        });
        setShowSuccessModal(true);
      } catch (error: unknown) {
        let errorMessage = 'Failed to complete triage assessment. Please try again.';

        if (error && typeof error === 'object' && 'response' in error) {
          const axiosError = error as { response?: { data?: Record<string, string[]> } };
          const errorData = axiosError.response?.data;

          if (errorData) {
            const firstKey = Object.keys(errorData)[0];
            if (firstKey && Array.isArray(errorData[firstKey])) {
              errorMessage = errorData[firstKey][0] || errorMessage;
            }
          }
        }

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    },
    [
      router,
      patientId,
      encounterId,
      currentAssessment,
      currentVitals,
      encounter,
      patient,
      clinicsData,
      createAssessment,
      completeAssessment,
      setRouting,
      clearSession,
    ]
  );

  const handleBack = useCallback(() => {
    router.push(`/triage/assess/${patientId}/${encounterId}/assessment`);
  }, [router, patientId, encounterId]);

  const handleSuccessClose = useCallback(() => {
    setShowSuccessModal(false);
    router.push('/triage');
  }, [router]);

  // Pre-requisites check
  const hasVitals = currentVitals && Object.keys(currentVitals).length > 0;
  const hasAssessment = currentAssessment && currentAssessment.triage_category;

  return (
    <div className="space-y-6">
      {/* Pre-requisites Warning */}
      {(!hasVitals || !hasAssessment) && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Incomplete Assessment</AlertTitle>
          <AlertDescription className="space-y-1">
            {!hasVitals && (
              <p>
                <strong>Vitals not recorded:</strong> Vital signs were not captured during registration.
                Recording vitals is required before routing the patient to consultation.
              </p>
            )}
            {!hasAssessment && (
              <p>
                <strong>Assessment required:</strong> Please complete the triage assessment before proceeding.
              </p>
            )}
            <p className="text-sm mt-2">
              Complete the previous steps to continue.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Assessment Summary */}
      {hasAssessment && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-muted-foreground" />
                Assessment Summary
              </CardTitle>
              <Badge variant="secondary">Step {showHistoryStep ? 4 : 3} of {showHistoryStep ? 4 : 3}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Patient Info Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">
                    {patient?.first_name} {patient?.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{patient?.mrn}</p>
                </div>
              </div>
              <TriageCategoryBadge category={currentAssessment.triage_category!} size="lg" />
            </div>

            {/* Vitals Summary */}
            {currentVitals && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-b">
                {currentVitals.heart_rate && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30">
                    <Heart className="h-4 w-4 text-rose-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">HR</p>
                      <p className="font-semibold text-sm">{currentVitals.heart_rate} bpm</p>
                    </div>
                  </div>
                )}
                {currentVitals.spo2 && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-sky-50 dark:bg-sky-950/30">
                    <Activity className="h-4 w-4 text-sky-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">SpO2</p>
                      <p className="font-semibold text-sm">{currentVitals.spo2}%</p>
                    </div>
                  </div>
                )}
                {currentVitals.temperature && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                    <Thermometer className="h-4 w-4 text-amber-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Temp</p>
                      <p className="font-semibold text-sm">{currentVitals.temperature}°C</p>
                    </div>
                  </div>
                )}
                {(currentVitals.systolic_bp || currentVitals.diastolic_bp) && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/30">
                    <Activity className="h-4 w-4 text-violet-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">BP</p>
                      <p className="font-semibold text-sm">
                        {currentVitals.systolic_bp}/{currentVitals.diastolic_bp}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Chief Complaint */}
            {currentAssessment.chief_complaint && (
              <div className="pt-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Chief Complaint</p>
                <p className="text-sm">{currentAssessment.chief_complaint}</p>
              </div>
            )}

            {/* Category Description */}
            {currentAssessment.triage_category && (
              <div className="mt-4 p-3 rounded-lg border" style={{
                backgroundColor: `${TRIAGE_CATEGORY_CONFIG[currentAssessment.triage_category as TriageCategory].bgColor}10`,
                borderColor: `${TRIAGE_CATEGORY_CONFIG[currentAssessment.triage_category as TriageCategory].bgColor}30`,
              }}>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5" style={{
                    color: TRIAGE_CATEGORY_CONFIG[currentAssessment.triage_category as TriageCategory].bgColor
                  }} />
                  <div>
                    <p className="text-sm font-medium">
                      {TRIAGE_CATEGORY_CONFIG[currentAssessment.triage_category as TriageCategory].label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TRIAGE_CATEGORY_CONFIG[currentAssessment.triage_category as TriageCategory].description}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Routing Selection */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Route Patient</CardTitle>
              <HelpPopover content="Select where to route the patient based on their triage category and clinical needs. Emergency categories (RED/ORANGE) typically go to ER zones; others go to OPD clinics." />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Routing Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Where should this patient go?</Label>
              <Controller
                name="routing_type"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Emergency Option */}
                    <button
                      type="button"
                      onClick={() => field.onChange('emergency')}
                      className={`flex items-center gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 text-left ${
                        field.value === 'emergency'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/30 ring-2 ring-red-500/20 scale-[1.02] shadow-lg shadow-red-500/10'
                          : 'border-border bg-card hover:border-red-200 hover:bg-red-50/50 dark:hover:bg-red-950/10'
                      }`}
                    >
                      <div className={`p-3 rounded-lg ${
                        field.value === 'emergency'
                          ? 'bg-red-500 text-white'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        <Siren className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <span className={`font-semibold ${
                          field.value === 'emergency' ? 'text-red-700 dark:text-red-300' : ''
                        }`}>Emergency Area</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ER zones, Trauma, Resuscitation
                        </p>
                        {isEmergencyCategory && field.value !== 'emergency' && (
                          <Badge variant="outline" className="mt-2 text-xs border-red-300 text-red-600">
                            Recommended for {triageCategory}
                          </Badge>
                        )}
                      </div>
                      {field.value === 'emergency' && (
                        <CheckCircle2 className="h-5 w-5 text-red-500 shrink-0" />
                      )}
                    </button>

                    {/* Clinic Option */}
                    <button
                      type="button"
                      onClick={() => field.onChange('clinic')}
                      className={`flex items-center gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all duration-200 text-left ${
                        field.value === 'clinic'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20 scale-[1.02] shadow-lg shadow-emerald-500/10'
                          : 'border-border bg-card hover:border-emerald-200 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10'
                      }`}
                    >
                      <div className={`p-3 rounded-lg ${
                        field.value === 'clinic'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <span className={`font-semibold ${
                          field.value === 'clinic' ? 'text-emerald-700 dark:text-emerald-300' : ''
                        }`}>OPD Clinic</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          General or specialty outpatient clinic
                        </p>
                        {!isEmergencyCategory && field.value !== 'clinic' && (
                          <Badge variant="outline" className="mt-2 text-xs border-emerald-300 text-emerald-600">
                            Recommended for {triageCategory}
                          </Badge>
                        )}
                      </div>
                      {field.value === 'clinic' && (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      )}
                    </button>
                  </div>
                )}
              />
            </div>

            {/* Emergency Area Selection */}
            {routingType === 'emergency' && (
              <div className="space-y-3 p-4 rounded-lg border-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                <Label className="flex items-center gap-1.5 text-red-700 dark:text-red-300">
                  <MapPin className="h-4 w-4" />
                  Select Emergency Area *
                </Label>
                <Controller
                  name="assigned_area"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {EMERGENCY_AREA_OPTIONS.map((option) => {
                        const isSelected = field.value === option.value;
                        const categoryConfig = TRIAGE_CATEGORY_CONFIG[option.category as TriageCategory];
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => field.onChange(option.value)}
                            className={`flex items-center justify-between rounded-lg border-2 p-3 cursor-pointer transition-all duration-200 ${
                              isSelected
                                ? 'border-red-500 bg-white dark:bg-red-950/50 ring-2 ring-red-500/30 shadow-lg shadow-red-500/10 scale-[1.03]'
                                : 'border-red-200 dark:border-red-800 bg-white/50 dark:bg-red-950/10 hover:bg-white dark:hover:bg-red-950/30'
                            }`}
                          >
                            <span className={`text-sm font-medium ${isSelected ? 'text-red-700 dark:text-red-300' : ''}`}>
                              {option.label}
                            </span>
                            <div className="flex items-center gap-2">
                              {isSelected && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                              )}
                              <Badge
                                className="text-xs"
                                style={{
                                  backgroundColor: categoryConfig.bgColor,
                                  color: categoryConfig.textColor,
                                }}
                              >
                                {option.category}
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
                {errors.assigned_area && (
                  <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
                )}
              </div>
            )}

            {/* Clinic Selection */}
            {routingType === 'clinic' && (
              <div className="space-y-3 p-4 rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
                <Label className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                  <Building2 className="h-4 w-4" />
                  Select Clinic *
                </Label>
                <Controller
                  name="assigned_clinic"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value, 10))}
                      value={field.value?.toString() || ''}
                      disabled={isClinicsLoading}
                    >
                      <SelectTrigger className="bg-white dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700">
                        <SelectValue placeholder="Select a clinic" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {clinicsData?.results?.map((clinic) => (
                          <SelectItem key={clinic.id} value={clinic.id.toString()}>
                            {clinic.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.assigned_clinic && (
                  <p className="text-sm text-destructive">{errors.assigned_clinic.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={handleBack}>
            Back: Assessment
          </Button>
          <ShiftGate>
          <Button
            type="submit"
            disabled={isSubmitting || isCreating || isCompleting || !hasAssessment}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Complete Triage
          </Button>
          </ShiftGate>
        </div>
      </form>

      {/* Success Modal */}
      <CheckinSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        checkInResult={successData}
        onDismiss={handleSuccessClose}
        dismissLabel="Go to Queue"
      />
    </div>
  );
}

/**
 * Triage Assess - Route Tab
 *
 * Final step in triage assessment workflow.
 * Routes patient to appropriate clinic or emergency area.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/route
 */
'use client';

import { useState, useCallback } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { useClinics } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import {
  ASSIGNED_AREA_CONFIG,
  EMERGENCY_AREA_OPTIONS,
  type AssignedArea,
} from '@/lib/types/triage';

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

  // Get triage store data
  const {
    getVitals,
    getHistory,
    getAssessment,
    getRouting,
    setRouting,
    clearSession,
  } = useTriageAssessStore();

  const currentVitals = getVitals(parseInt(encounterId, 10));
  const currentHistory = getHistory(parseInt(encounterId, 10));
  const currentAssessment = getAssessment(parseInt(encounterId, 10));
  const currentRouting = getRouting(parseInt(encounterId, 10));

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
        const payload = {
          encounter: parseInt(encounterId, 10),
          arrival_mode: currentAssessment.arrival_mode || 'WALK_IN',
          arrival_time: currentAssessment.arrival_time || new Date().toISOString(),
          chief_complaint_category: currentAssessment.chief_complaint_category || 'OTHER',
          chief_complaint: currentAssessment.chief_complaint || encounter?.chief_complaint || 'Triage assessment',
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
          // History
          allergies_noted: currentHistory?.allergies_noted,
          // Routing
          assigned_area: (data.routing_type === 'emergency' ? data.assigned_area : '') as AssignedArea | '',
          assigned_clinic: data.routing_type === 'clinic' ? data.assigned_clinic : null,
        };

        // Create the assessment (sets triage_start_time, status = IN_PROGRESS)
        const assessment = await createAssessment(payload);

        // Complete the assessment (sets triage_end_time, status = COMPLETED)
        await completeAssessment(assessment.id);

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
      currentHistory,
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
          <AlertDescription>
            {!hasVitals && 'Vitals are required. '}
            {!hasAssessment && 'Assessment is required. '}
            Please complete the previous tabs first.
          </AlertDescription>
        </Alert>
      )}

      {/* Assessment Summary */}
      {hasAssessment && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Assessment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {patient?.first_name} {patient?.last_name}
                </span>
                <span className="text-sm text-muted-foreground">({patient?.mrn})</span>
              </div>
              <TriageCategoryBadge category={currentAssessment.triage_category!} size="lg" />
              {currentAssessment.chief_complaint && (
                <span className="text-sm text-muted-foreground">
                  {currentAssessment.chief_complaint.substring(0, 50)}
                  {currentAssessment.chief_complaint.length > 50 && '...'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Routing Selection */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Route Patient</CardTitle>
                <HelpPopover content="Select where to route the patient based on their triage category and clinical needs." />
              </div>
              <Badge variant="secondary">Step 4 of 4</Badge>
            </div>
            <CardDescription>
              {isEmergencyCategory
                ? 'Emergency category detected - consider routing to ER zone.'
                : 'Non-emergency category - consider routing to OPD clinic.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Routing Type */}
            <div className="space-y-3">
              <Label>Routing Destination Type</Label>
              <Controller
                name="routing_type"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    {/* Emergency Option */}
                    <div>
                      <RadioGroupItem
                        value="emergency"
                        id="routing-emergency"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="routing-emergency"
                        className="flex items-center gap-3 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-destructive peer-data-[state=checked]:bg-destructive/5 cursor-pointer transition-colors"
                      >
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <div>
                          <span className="font-medium">Emergency Area</span>
                          <p className="text-xs text-muted-foreground">
                            ER zones, Trauma, Resuscitation
                          </p>
                        </div>
                      </Label>
                    </div>

                    {/* Clinic Option */}
                    <div>
                      <RadioGroupItem
                        value="clinic"
                        id="routing-clinic"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="routing-clinic"
                        className="flex items-center gap-3 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-colors"
                      >
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <span className="font-medium">OPD Clinic</span>
                          <p className="text-xs text-muted-foreground">
                            General or specialty outpatient clinic
                          </p>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />
            </div>

            {/* Emergency Area Selection */}
            {routingType === 'emergency' && (
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Emergency Area *
                </Label>
                <Controller
                  name="assigned_area"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                    >
                      {EMERGENCY_AREA_OPTIONS.map((option) => (
                        <div key={option.value}>
                          <RadioGroupItem
                            value={option.value}
                            id={`area-${option.value}`}
                            className="peer sr-only"
                          />
                          <Label
                            htmlFor={`area-${option.value}`}
                            className="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent peer-data-[state=checked]:border-primary cursor-pointer"
                          >
                            <span className="text-sm">{option.label}</span>
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor:
                                  option.category === 'RED'
                                    ? '#DC2626'
                                    : option.category === 'ORANGE'
                                    ? '#F97316'
                                    : option.category === 'YELLOW'
                                    ? '#EAB308'
                                    : '#22C55E',
                              }}
                            >
                              {option.category}
                            </Badge>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                />
                {errors.assigned_area && (
                  <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
                )}
              </div>
            )}

            {/* Clinic Selection */}
            {routingType === 'clinic' && (
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select a clinic" />
                      </SelectTrigger>
                      <SelectContent>
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
          <Button
            type="submit"
            disabled={isSubmitting || isCreating || isCompleting || !hasAssessment}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Complete Triage
          </Button>
        </div>
      </form>

      {/* Success Modal */}
      <CheckinSuccessModal
        open={showSuccessModal}
        onOpenChange={setShowSuccessModal}
        checkInResult={successData}
        onDismiss={handleSuccessClose}
      />
    </div>
  );
}

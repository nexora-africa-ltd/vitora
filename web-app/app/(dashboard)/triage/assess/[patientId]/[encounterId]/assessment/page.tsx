/**
 * Triage Assess - Assessment Tab
 *
 * Third step in triage assessment workflow.
 * Calculates triage category based on vitals and symptoms using KETA scale.
 *
 * Route: /triage/assess/[patientId]/[encounterId]/assessment
 */
'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Ambulance,
  Activity,
  Calculator,
  MessageSquare,
  RefreshCw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils/cn';
import {
  TriageCategoryBadge,
  VitalAlertsPanel,
  PainScoreSlider,
  AVPUCardGroup,
  GCSScorePanel,
} from '@/components/triage';
import type { GCSScores } from '@/components/triage/gcs-score-panel';
import { useEncounterContext } from '@/lib/context/encounter-context';
import { usePatientContext } from '@/lib/context/patient-context';
import { calculateAge } from '@/lib/utils/format';
import { useTriageAssessStore } from '@/lib/stores/triage-assess-store';
import { useCalculateTriageCategory } from '@/lib/hooks/use-triage';
import {
  ARRIVAL_MODE_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
  MOBILITY_CONFIG,
  TRIAGE_CATEGORY_CONFIG,
  ETAT_DANGER_SIGNS_CONFIG,
  DEHYDRATION_CONFIG,
  FONTANELLE_CONFIG,
  BREASTFEEDING_CONFIG,
  getAgeGroup,
  isPediatric,
  isNeonateOrInfant,
  type TriageCategory,
  type TriageAlert,
  type AVPUStatus,
  type MobilityStatus,
  type ChiefComplaintCategory,
  type EtATDangerSign,
  type DehydrationLevel,
  type FontanelleStatus,
  type BreastfeedingAbility,
} from '@/lib/types/triage';

// =============================================================================
// Schema
// =============================================================================

const assessmentSchema = z.object({
  arrival_mode: z.enum(['WALK_IN', 'AMBULANCE', 'POLICE', 'REFERRAL', 'OTHER'], {
    required_error: 'Arrival mode is required',
  }),
  referring_facility_name: z.string().optional(),
  arrival_time: z.string().min(1, 'Arrival time is required'),
  chief_complaint_category: z.enum(
    [
      'CHEST_PAIN',
      'DIFFICULTY_BREATHING',
      'TRAUMA',
      'FEVER',
      'ABDOMINAL_PAIN',
      'HEADACHE',
      'ALTERED_CONSCIOUSNESS',
      'BLEEDING',
      'POISONING',
      'OBSTETRIC',
      'PEDIATRIC',
      // Neonatal-specific
      'NEONATAL_SEPSIS',
      'NEONATAL_JAUNDICE',
      'NEONATAL_RESPIRATORY_DISTRESS',
      'BIRTH_ASPHYXIA',
      // Pediatric-specific
      'FEBRILE_CONVULSION',
      'CROUP',
      'BRONCHIOLITIS',
      'SEVERE_MALARIA',
      'OTHER',
    ],
    { required_error: 'Chief complaint category is required' }
  ),
  chief_complaint: z.string().min(1, 'Chief complaint details are required'),
  pain_score: z.number().min(0).max(10).nullable().optional(),
  mental_status: z.enum(['A', 'V', 'P', 'U'], {
    required_error: 'Mental status (AVPU) is required',
  }),
  // Glasgow Coma Scale (optional - for trauma/neuro cases)
  gcs_eye: z.number().min(1).max(4).nullable().optional(),
  gcs_verbal: z.number().min(1).max(5).nullable().optional(),
  gcs_motor: z.number().min(1).max(6).nullable().optional(),
  mobility: z.enum(['AMBULATORY', 'WHEELCHAIR', 'STRETCHER', 'IMMOBILE'], {
    required_error: 'Mobility status is required',
  }),
  triage_category: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'], {
    required_error: 'Triage category is required',
  }),
  auto_calculated_category: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']).optional(),
  category_override_reason: z.string().optional(),
  // ETAT pediatric fields
  etat_danger_signs: z.array(z.string()).optional(),
  dehydration_level: z.string().optional(),
  fontanelle_status: z.string().optional(),
  breastfeeding_ability: z.string().optional(),
  capillary_refill_seconds: z.number().nullable().optional(),
  muac_cm: z.number().nullable().optional(),
}).refine(
  (data) => {
    // Referring facility name is required when arrival_mode is REFERRAL
    if (data.arrival_mode === 'REFERRAL') {
      return data.referring_facility_name && data.referring_facility_name.trim().length > 0;
    }
    return true;
  },
  {
    message: 'Referring facility name is required when arrival mode is "Referral from another facility"',
    path: ['referring_facility_name'],
  }
);

type AssessmentFormData = z.infer<typeof assessmentSchema>;

// =============================================================================
// Component
// =============================================================================

export default function TriageAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const { encounter } = useEncounterContext();
  const { patient } = usePatientContext();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;

  // Compute patient age group for ETAT conditional rendering
  const patientAge = patient ? calculateAge(patient.date_of_birth) : null;
  const patientAgeGroup = patient ? getAgeGroup(patient.date_of_birth) : null;
  const showPediatricSection = patientAgeGroup ? isPediatric(patientAgeGroup) : false;
  const showNeonatalFields = patientAgeGroup ? isNeonateOrInfant(patientAgeGroup) : false;

  // Get triage store data
  const { getVitals, getAssessment, setAssessment, markSectionComplete, markSectionVisited } = useTriageAssessStore();
  const currentVitals = getVitals(parseInt(encounterId, 10));
  const currentAssessment = getAssessment(parseInt(encounterId, 10));

  // Triage calculation mutation
  const calculateCategoryMutation = useCalculateTriageCategory();

  // Auto-save assessment to store when navigating away (e.g. via tab click)
  const encounterIdNum = parseInt(encounterId, 10);
  const getValuesRef = useRef<(() => AssessmentFormData) | null>(null);

  useEffect(() => {
    return () => {
      markSectionVisited(encounterIdNum, 'assessment');
      // Save current form values to store on unmount so tab navigation
      // doesn't lose entered data
      const currentValues = getValuesRef.current?.();
      if (currentValues) {
        setAssessment(encounterIdNum, {
          arrival_mode: currentValues.arrival_mode,
          referring_facility_name: currentValues.referring_facility_name,
          arrival_time: currentValues.arrival_time,
          chief_complaint_category: currentValues.chief_complaint_category,
          chief_complaint: currentValues.chief_complaint,
          pain_score: currentValues.pain_score ?? undefined,
          mental_status: currentValues.mental_status,
          gcs_eye: currentValues.gcs_eye,
          gcs_verbal: currentValues.gcs_verbal,
          gcs_motor: currentValues.gcs_motor,
          mobility: currentValues.mobility,
          triage_category: currentValues.triage_category,
          auto_calculated_category: currentValues.auto_calculated_category,
          category_override_reason: currentValues.category_override_reason,
          // ETAT pediatric fields
          etat_danger_signs: currentValues.etat_danger_signs as EtATDangerSign[] | undefined,
          dehydration_level: (currentValues.dehydration_level || undefined) as DehydrationLevel | '' | undefined,
          fontanelle_status: (currentValues.fontanelle_status || undefined) as FontanelleStatus | '' | undefined,
          breastfeeding_ability: (currentValues.breastfeeding_ability || undefined) as BreastfeedingAbility | '' | undefined,
          capillary_refill_seconds: currentValues.capillary_refill_seconds,
          muac_cm: currentValues.muac_cm,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterIdNum]);

  // Local state
  const [calculatedCategory, setCalculatedCategory] = useState<TriageCategory | null>(
    currentAssessment?.auto_calculated_category ?? null
  );
  const [alerts, setAlerts] = useState<TriageAlert[]>([]);
  const [hasOverridden, setHasOverridden] = useState(false);

  // Get current timestamp for default arrival time
  const now = new Date();
  const defaultArrivalTime = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm

  // Filter out placeholder chief complaints that aren't meaningful
  const PLACEHOLDER_COMPLAINTS = ['Triage assessment', 'Check-in', 'check-in', 'Checkin'];
  const getInitialChiefComplaint = () => {
    if (currentAssessment?.chief_complaint) return currentAssessment.chief_complaint;
    if (
      encounter?.chief_complaint &&
      !PLACEHOLDER_COMPLAINTS.includes(encounter.chief_complaint)
    ) {
      return encounter.chief_complaint;
    }
    return '';
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<AssessmentFormData>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: {
      arrival_mode: currentAssessment?.arrival_mode || 'WALK_IN',
      referring_facility_name: currentAssessment?.referring_facility_name || '',
      arrival_time: currentAssessment?.arrival_time || defaultArrivalTime,
      chief_complaint_category: currentAssessment?.chief_complaint_category || undefined,
      chief_complaint: getInitialChiefComplaint(),
      pain_score: currentAssessment?.pain_score ?? 0,
      mental_status: currentAssessment?.mental_status || 'A',
      // Glasgow Coma Scale (optional)
      gcs_eye: currentAssessment?.gcs_eye ?? null,
      gcs_verbal: currentAssessment?.gcs_verbal ?? null,
      gcs_motor: currentAssessment?.gcs_motor ?? null,
      mobility: currentAssessment?.mobility || 'AMBULATORY',
      triage_category: currentAssessment?.triage_category || calculatedCategory || 'GREEN',
      auto_calculated_category: currentAssessment?.auto_calculated_category,
      category_override_reason: currentAssessment?.category_override_reason || '',
      // ETAT pediatric fields
      etat_danger_signs: currentAssessment?.etat_danger_signs || [],
      dehydration_level: currentAssessment?.dehydration_level || '',
      fontanelle_status: currentAssessment?.fontanelle_status || '',
      breastfeeding_ability: currentAssessment?.breastfeeding_ability || '',
      capillary_refill_seconds: currentAssessment?.capillary_refill_seconds ?? null,
      muac_cm: currentAssessment?.muac_cm ?? null,
    },
  });

  // Keep getValuesRef in sync so cleanup effect can read current form values
  getValuesRef.current = getValues;

  // Watch for changes that affect category calculation
  const watchedFields = watch([
    'chief_complaint_category',
    'mental_status',
    'mobility',
    'pain_score',
    'triage_category',
    'gcs_eye',
    'gcs_verbal',
    'gcs_motor',
  ]);
  const [watchedChiefCategory, watchedMentalStatus, watchedMobility] = watchedFields;
  const selectedCategory = watch('triage_category');
  const overrideReason = watch('category_override_reason');
  const arrivalMode = watch('arrival_mode');
  const isReferral = arrivalMode === 'REFERRAL';

  // Check if category has been overridden
  const isOverridden = calculatedCategory && selectedCategory !== calculatedCategory;

  // Determine which fields are missing for triage calculation
  const missingCalculationFields = useMemo(() => {
    const missing: string[] = [];

    // Required fields for KETA calculation
    if (!watchedChiefCategory) missing.push('Chief Complaint Category');
    if (!watchedMentalStatus) missing.push('Mental Status (AVPU)');
    if (!watchedMobility) missing.push('Mobility');

    // Check if ANY vitals were captured (at least one is recommended)
    const hasAnyVitals = currentVitals && (
      currentVitals.spo2 !== null && currentVitals.spo2 !== undefined ||
      currentVitals.heart_rate !== null && currentVitals.heart_rate !== undefined ||
      currentVitals.systolic_bp !== null && currentVitals.systolic_bp !== undefined ||
      currentVitals.temperature !== null && currentVitals.temperature !== undefined ||
      currentVitals.respiratory_rate !== null && currentVitals.respiratory_rate !== undefined
    );
    if (!hasAnyVitals) missing.push('Vitals (at least one)');

    return missing;
  }, [watchedChiefCategory, watchedMentalStatus, watchedMobility, currentVitals]);

  const canCalculate = missingCalculationFields.length === 0;

  // Calculate triage category
  const handleCalculateCategory = useCallback(async () => {
    const formData = watch();

    // Calculate GCS total if all components are present
    const gcsTotal = (formData.gcs_eye && formData.gcs_verbal && formData.gcs_motor)
      ? formData.gcs_eye + formData.gcs_verbal + formData.gcs_motor
      : undefined;

    try {
      const result = await calculateCategoryMutation.mutateAsync({
        spo2: currentVitals?.spo2,
        systolic_bp: currentVitals?.systolic_bp,
        diastolic_bp: currentVitals?.diastolic_bp,
        heart_rate: currentVitals?.heart_rate,
        temperature: currentVitals?.temperature,
        respiratory_rate: currentVitals?.respiratory_rate,
        mental_status: formData.mental_status,
        chief_complaint_category: formData.chief_complaint_category,
        pain_score: formData.pain_score ?? undefined,
        mobility: formData.mobility,
        gcs_total: gcsTotal,
        // ETAT fields for pediatric category calculation
        patient_age_years: patientAge ?? undefined,
        etat_danger_signs: formData.etat_danger_signs?.length
          ? formData.etat_danger_signs
          : undefined,
        dehydration_level: formData.dehydration_level || undefined,
        fontanelle_status: formData.fontanelle_status || undefined,
        breastfeeding_ability: formData.breastfeeding_ability || undefined,
        capillary_refill_seconds:
          typeof formData.capillary_refill_seconds === 'number'
            ? formData.capillary_refill_seconds
            : undefined,
        muac_cm:
          typeof formData.muac_cm === 'number'
            ? formData.muac_cm
            : undefined,
      });

      setCalculatedCategory(result.suggested_category);
      setAlerts(result.alerts || []);
      setValue('auto_calculated_category', result.suggested_category);

      // Auto-set category if not overridden
      if (!hasOverridden) {
        setValue('triage_category', result.suggested_category);
      }
    } catch (error) {
      console.error('Failed to calculate triage category:', error);
    }
  }, [watch, calculateCategoryMutation, currentVitals, setValue, hasOverridden]);

  // Auto-calculate on initial load and when relevant fields change
  useEffect(() => {
    if (canCalculate) {
      handleCalculateCategory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedFields[0], watchedFields[1], watchedFields[2], watchedFields[5], watchedFields[6], watchedFields[7], canCalculate]);

  const onSubmit = useCallback(
    async (data: AssessmentFormData) => {
      // Validate override reason if category changed
      if (isOverridden && !data.category_override_reason?.trim()) {
        return; // TODO: Show error - handled by zod refinement
      }

      // Store assessment in triage store
      setAssessment(parseInt(encounterId, 10), {
        arrival_mode: data.arrival_mode,
        referring_facility_name: data.referring_facility_name,
        arrival_time: data.arrival_time,
        chief_complaint_category: data.chief_complaint_category,
        chief_complaint: data.chief_complaint,
        pain_score: data.pain_score ?? undefined,
        mental_status: data.mental_status,
        // Glasgow Coma Scale
        gcs_eye: data.gcs_eye,
        gcs_verbal: data.gcs_verbal,
        gcs_motor: data.gcs_motor,
        mobility: data.mobility,
        triage_category: data.triage_category,
        auto_calculated_category: data.auto_calculated_category,
        category_override_reason: data.category_override_reason,
        // ETAT pediatric fields
        etat_danger_signs: data.etat_danger_signs as EtATDangerSign[] | undefined,
        dehydration_level: (data.dehydration_level || undefined) as DehydrationLevel | '' | undefined,
        fontanelle_status: (data.fontanelle_status || undefined) as FontanelleStatus | '' | undefined,
        breastfeeding_ability: (data.breastfeeding_ability || undefined) as BreastfeedingAbility | '' | undefined,
        capillary_refill_seconds: data.capillary_refill_seconds,
        muac_cm: data.muac_cm,
      });

      // Mark assessment section as complete
      markSectionComplete(parseInt(encounterId, 10), 'assessment');

      // Navigate to next tab
      router.push(`/triage/assess/${patientId}/${encounterId}/route`);
    },
    [router, patientId, encounterId, setAssessment, isOverridden, markSectionComplete]
  );

  const handleBack = useCallback(() => {
    router.push(`/triage/assess/${patientId}/${encounterId}/history`);
  }, [router, patientId, encounterId]);

  return (
    <div className="space-y-6">
      {/* Alerts Panel */}
      {alerts.length > 0 && <VitalAlertsPanel alerts={alerts} />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Arrival Information */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Arrival & Presentation</CardTitle>
                <HelpPopover content="Document how and when the patient arrived and their presenting complaint." />
              </div>
              <Badge variant="secondary">Step 3 of 4</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Row 1: Arrival Mode, Arrival Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Arrival Mode */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Ambulance className="h-4 w-4 text-muted-foreground" />
                  Arrival Mode *
                </Label>
                <Controller
                  name="arrival_mode"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select arrival mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ARRIVAL_MODE_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            {config.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.arrival_mode && (
                  <p className="text-sm text-destructive">{errors.arrival_mode.message}</p>
                )}
              </div>

              {/* Arrival Time */}
              <div className="space-y-2">
                <Label htmlFor="arrival_time" className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Arrival Time *
                </Label>
                <Input
                  id="arrival_time"
                  type="datetime-local"
                  {...register('arrival_time')}
                />
                {errors.arrival_time && (
                  <p className="text-sm text-destructive">{errors.arrival_time.message}</p>
                )}
              </div>
            </div>

            {/* Referring Facility - Conditional */}
            {isReferral && (
              <div className="space-y-2 p-4 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                <Label htmlFor="referring_facility_name" className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                  <Ambulance className="h-4 w-4" />
                  Referring Facility Name *
                </Label>
                <Input
                  id="referring_facility_name"
                  placeholder="Enter the name of the referring facility"
                  className="bg-white dark:bg-blue-950/30 border-blue-300 dark:border-blue-700"
                  {...register('referring_facility_name')}
                />
                {errors.referring_facility_name && (
                  <p className="text-sm text-destructive">{errors.referring_facility_name.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  This information is required for SHA claims and continuity of care documentation.
                </p>
              </div>
            )}

            {/* Chief Complaint Category */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                Chief Complaint Category *
              </Label>
              <Controller
                name="chief_complaint_category"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CHIEF_COMPLAINT_CONFIG) as [
                        ChiefComplaintCategory,
                        { label: string; ageRestriction?: 'neonatal' | 'pediatric' },
                      ][])
                        .filter(([, config]) => {
                          // Filter categories by patient age
                          if (config.ageRestriction === 'neonatal') return showNeonatalFields;
                          if (config.ageRestriction === 'pediatric') return showPediatricSection;
                          return true;
                        })
                        .map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.chief_complaint_category && (
                <p className="text-sm text-destructive">{errors.chief_complaint_category.message}</p>
              )}
            </div>

            {/* Chief Complaint Details */}
            <div className="space-y-2">
              <Label htmlFor="chief_complaint">Chief Complaint Details *</Label>
              <Textarea
                id="chief_complaint"
                placeholder="Describe the patient's presenting complaint in detail..."
                rows={3}
                {...register('chief_complaint')}
              />
              {errors.chief_complaint && (
                <p className="text-sm text-destructive">{errors.chief_complaint.message}</p>
              )}
            </div>

            {/* Pain Score - Enhanced color-coded slider */}
            <Controller
              name="pain_score"
              control={control}
              render={({ field }) => (
                <PainScoreSlider
                  value={field.value ?? null}
                  onChange={field.onChange}
                />
              )}
            />
          </CardContent>
        </Card>

        {/* ETAT Pediatric Assessment - shown only for children <5 years */}
        {showPediatricSection && (
          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <ShieldAlert className="h-4 w-4" />
                Pediatric Assessment (ETAT)
                <Badge variant="outline" className="ml-auto text-xs">
                  {patientAgeGroup}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* ETAT Danger Signs */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  ETAT Danger Signs
                  <span className="text-xs text-muted-foreground ml-2">(check all that apply)</span>
                </Label>
                <Controller
                  name="etat_danger_signs"
                  control={control}
                  render={({ field }) => {
                    const selected = (field.value || []) as string[];
                    return (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(Object.entries(ETAT_DANGER_SIGNS_CONFIG) as [EtATDangerSign, { label: string; description: string }][]).map(
                          ([sign, config]) => (
                            <label
                              key={sign}
                              className={cn(
                                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                                selected.includes(sign)
                                  ? 'border-red-500 bg-red-50 dark:bg-red-950/30'
                                  : 'border-border hover:border-muted-foreground'
                              )}
                            >
                              <Checkbox
                                checked={selected.includes(sign)}
                                onCheckedChange={(checked) => {
                                  const next = checked
                                    ? [...selected, sign]
                                    : selected.filter((s: string) => s !== sign);
                                  field.onChange(next);
                                }}
                                className="mt-0.5"
                              />
                              <div>
                                <span className="text-sm font-medium">{config.label}</span>
                                <p className="text-xs text-muted-foreground">{config.description}</p>
                              </div>
                            </label>
                          )
                        )}
                      </div>
                    );
                  }}
                />
                {watch('etat_danger_signs') && (watch('etat_danger_signs') as string[]).length > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {(watch('etat_danger_signs') as string[]).length} danger sign(s) — auto-escalation to RED category
                    </span>
                  </div>
                )}
              </div>

              {/* Capillary Refill & MUAC */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="capillary_refill_seconds">Capillary Refill (seconds)</Label>
                  <Input
                    id="capillary_refill_seconds"
                    type="number"
                    min={0}
                    max={15}
                    step={1}
                    {...register('capillary_refill_seconds', { valueAsNumber: true })}
                    placeholder="e.g. 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="muac_cm">MUAC (cm)</Label>
                  <Input
                    id="muac_cm"
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    {...register('muac_cm', { valueAsNumber: true })}
                    placeholder="e.g. 12.5"
                  />
                  {watch('muac_cm') != null && (watch('muac_cm') as number) < 11.5 && (
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      ⚠ SAM: MUAC &lt; 11.5 cm
                    </p>
                  )}
                  {watch('muac_cm') != null && (watch('muac_cm') as number) >= 11.5 && (watch('muac_cm') as number) < 12.5 && (
                    <p className="text-sm text-orange-600 dark:text-orange-400">
                      MAM: MUAC 11.5-12.5 cm
                    </p>
                  )}
                </div>
              </div>

              {/* Dehydration Level */}
              <div className="space-y-2">
                <Label>Dehydration Level</Label>
                <Controller
                  name="dehydration_level"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assess dehydration" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(DEHYDRATION_CONFIG) as [DehydrationLevel, { label: string }][]).map(
                          ([value, config]) => (
                            <SelectItem key={value} value={value}>{config.label}</SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* Neonatal/Infant-specific fields */}
              {showNeonatalFields && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Fontanelle Status */}
                  <div className="space-y-2">
                    <Label>Fontanelle Status</Label>
                    <Controller
                      name="fontanelle_status"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || ''} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Assess fontanelle" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(FONTANELLE_CONFIG) as [FontanelleStatus, { label: string }][]).map(
                              ([value, config]) => (
                                <SelectItem key={value} value={value}>{config.label}</SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  {/* Breastfeeding Ability */}
                  <div className="space-y-2">
                    <Label>Breastfeeding Ability</Label>
                    <Controller
                      name="breastfeeding_ability"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || ''} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Assess feeding" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(BREASTFEEDING_CONFIG) as [BreastfeedingAbility, { label: string }][]).map(
                              ([value, config]) => (
                                <SelectItem key={value} value={value}>{config.label}</SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clinical Assessment */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Clinical Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mental Status (AVPU) - Enhanced card group */}
            <Controller
              name="mental_status"
              control={control}
              render={({ field }) => (
                <AVPUCardGroup
                  value={field.value as AVPUStatus | undefined}
                  onChange={field.onChange}
                  showInlineAlert
                />
              )}
            />
            {errors.mental_status && (
              <p className="text-sm text-destructive">{errors.mental_status.message}</p>
            )}

            {/* Glasgow Coma Scale - conditional for trauma/neuro cases or altered consciousness */}
            {/* Hidden for neonates/infants as GCS is unreliable in this age group */}
            {!showNeonatalFields && (watchedChiefCategory === 'TRAUMA' ||
              watchedChiefCategory === 'ALTERED_CONSCIOUSNESS' ||
              watchedMentalStatus === 'P' ||
              watchedMentalStatus === 'U') && (
              <Controller
                name="gcs_eye"
                control={control}
                render={({ field: eyeField }) => (
                  <Controller
                    name="gcs_verbal"
                    control={control}
                    render={({ field: verbalField }) => (
                      <Controller
                        name="gcs_motor"
                        control={control}
                        render={({ field: motorField }) => (
                          <GCSScorePanel
                            value={{
                              eye: eyeField.value ?? null,
                              verbal: verbalField.value ?? null,
                              motor: motorField.value ?? null,
                            }}
                            onChange={(gcs: GCSScores) => {
                              eyeField.onChange(gcs.eye);
                              verbalField.onChange(gcs.verbal);
                              motorField.onChange(gcs.motor);
                            }}
                          />
                        )}
                      />
                    )}
                  />
                )}
              />
            )}

            {/* Mobility */}
            <div className="space-y-3">
              <Label className="flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Mobility *
              </Label>
              <Controller
                name="mobility"
                control={control}
                render={({ field }) => {
                  const ringColorMap: Record<MobilityStatus, string> = {
                    AMBULATORY: 'ring-green-500',
                    WHEELCHAIR: 'ring-yellow-500',
                    STRETCHER: 'ring-orange-500',
                    IMMOBILE: 'ring-red-500',
                  };

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {(Object.entries(MOBILITY_CONFIG) as [MobilityStatus, typeof MOBILITY_CONFIG[MobilityStatus]][]).map(
                        ([key, config]) => {
                          const isSelected = field.value === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => field.onChange(key)}
                              className={`flex flex-col items-center justify-center rounded-xl border-2 p-3 cursor-pointer transition-all duration-200 min-h-[80px] ${
                                isSelected
                                  ? `${config.colors.bg} ${config.colors.border} ring-2 ring-offset-1 ${ringColorMap[key]} scale-[1.02] shadow-md`
                                  : 'bg-card border-border hover:border-primary/30'
                              }`}
                            >
                              <span
                                className={`text-sm font-medium ${
                                  isSelected ? config.colors.text : 'text-foreground'
                                }`}
                              >
                                {config.label}
                              </span>
                              <span className="text-xs text-muted-foreground text-center mt-1 hidden sm:block">
                                {config.description}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  );
                }}
              />
              {errors.mobility && (
                <p className="text-sm text-destructive">{errors.mobility.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Triage Category */}
        <Card className={!canCalculate ? 'relative' : ''}>
          {/* Overlay for missing fields */}
          {!canCalculate && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] z-10 rounded-lg flex items-center justify-center">
              <div className="bg-card border shadow-lg rounded-lg p-4 max-w-sm mx-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Cannot Calculate Triage Category</p>
                    <p className="text-sm text-muted-foreground mt-1">Complete the following fields first:</p>
                    <ul className="mt-2 space-y-1">
                      {missingCalculationFields.map((field) => (
                        <li key={field} className="text-sm text-destructive flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                          {field}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">Triage Category</CardTitle>
                <HelpPopover content="Uses the Kenya Emergency Triage Assessment (KETA) scale. Categories range from RED (immediate life-threatening) to BLUE (non-urgent). The system auto-calculates based on vitals and clinical assessment, but clinicians can override with documented reasoning." />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCalculateCategory}
                disabled={calculateCategoryMutation.isPending || !canCalculate}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${calculateCategoryMutation.isPending ? 'animate-spin' : ''}`} />
                Recalculate
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Calculated Category Display */}
            {calculatedCategory && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <Calculator className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">Calculated:</span>
                  <TriageCategoryBadge category={calculatedCategory} />
                </div>
                <p className="text-sm text-muted-foreground sm:ml-auto">
                  {TRIAGE_CATEGORY_CONFIG[calculatedCategory].description}
                </p>
              </div>
            )}

            {/* Category Selection */}
            <div className="space-y-3">
              <Label>Selected Category *</Label>
              <Controller
                name="triage_category"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== calculatedCategory) {
                        setHasOverridden(true);
                      }
                    }}
                    value={field.value}
                    className="grid grid-cols-2 sm:grid-cols-5 gap-3"
                  >
                    {Object.entries(TRIAGE_CATEGORY_CONFIG).map(([key, config]) => (
                      <div key={key}>
                        <RadioGroupItem
                          value={key}
                          id={`category-${key}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`category-${key}`}
                          className="flex flex-col items-center justify-center rounded-md border-2 border-muted p-3 hover:border-primary/50 peer-data-[state=checked]:border-primary cursor-pointer transition-colors"
                          style={{
                            backgroundColor:
                              field.value === key ? `${config.bgColor}20` : undefined,
                          }}
                        >
                          <TriageCategoryBadge category={key as TriageCategory} size="sm" />
                          <span className="text-xs text-muted-foreground mt-1">
                            {config.targetWaitMinutes === 0
                              ? 'Immediate'
                              : `≤ ${config.targetWaitMinutes} min`}
                          </span>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              />
              {errors.triage_category && (
                <p className="text-sm text-destructive">{errors.triage_category.message}</p>
              )}
            </div>

            {/* Override Reason (shown when category differs from calculated) */}
            {isOverridden && (
              <div className="space-y-2">
                <Label htmlFor="category_override_reason" className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Override Reason *
                </Label>
                <Textarea
                  id="category_override_reason"
                  placeholder="Explain why you're overriding the calculated category..."
                  rows={2}
                  {...register('category_override_reason')}
                />
                {errors.category_override_reason && (
                  <p className="text-sm text-destructive">{errors.category_override_reason.message}</p>
                )}
                {isOverridden && !overrideReason?.trim() && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Override reason is required when changing the calculated category.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={handleBack}>
            Back: History
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || Boolean(isOverridden && !overrideReason?.trim())}
          >
            Next: Route Patient
          </Button>
        </div>
      </form>
    </div>
  );
}

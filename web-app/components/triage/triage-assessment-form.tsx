/**
 * TriageAssessmentForm Component
 *
 * Main form for performing patient triage assessments according to
 * KETA (Kenya Emergency Triage Assessment) standards.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-assessment.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Clock,
  Ambulance,
  Activity,
  Brain,
  AlertCircle,
  MapPin,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TriageCategoryBadge } from './triage-category-badge';
import { VitalAlertsPanel } from './vital-alerts-panel';
import type {
  TriageAssessmentCreateData,
  ArrivalMode,
  ChiefComplaintCategory,
  AVPUStatus,
  MobilityStatus,
  TriageCategory,
  AssignedArea,
  TriageAlert,
} from '@/lib/types/triage';
import {
  ARRIVAL_MODE_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
  AVPU_CONFIG,
  MOBILITY_CONFIG,
  TRIAGE_CATEGORY_CONFIG,
  ASSIGNED_AREA_CONFIG,
} from '@/lib/types/triage';

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const triageFormSchema = z
  .object({
    arrival_mode: z.enum(['WALK_IN', 'AMBULANCE', 'POLICE', 'REFERRAL', 'OTHER'], {
      required_error: 'Arrival mode is required',
    }),
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
        'OTHER',
      ],
      { required_error: 'Chief complaint category is required' }
    ),
    chief_complaint: z.string().min(1, 'Chief complaint details are required'),
    pain_score: z.number().min(0).max(10).nullable().optional(),
    mental_status: z.enum(['A', 'V', 'P', 'U'], {
      required_error: 'Mental status (AVPU) is required',
    }),
    mobility: z.enum(['AMBULATORY', 'WHEELCHAIR', 'STRETCHER', 'IMMOBILE'], {
      required_error: 'Mobility status is required',
    }),
    allergies_noted: z.string().optional(),
    triage_category: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'], {
      required_error: 'Triage category is required',
    }),
    auto_calculated_category: z
      .enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'])
      .optional(),
    category_override_reason: z.string().optional(),
    assigned_area: z.enum(
      [
        'ER_RESUS',
        'ER_ACUTE',
        'ER_FAST_TRACK',
        'OBSERVATION',
        'OPD',
        'TRAUMA',
        'PEDIATRIC_ER',
        'MATERNITY',
        'SPECIALTY',
      ],
      { required_error: 'Assigned care area is required' }
    ),
    assigned_clinician: z.number().nullable().optional(),
  })
  .refine(
    (data) => {
      // If category differs from auto-calculated, require override reason
      if (
        data.auto_calculated_category &&
        data.triage_category !== data.auto_calculated_category
      ) {
        return !!data.category_override_reason?.trim();
      }
      return true;
    },
    {
      message: 'Override reason is required when changing category',
      path: ['category_override_reason'],
    }
  );

type TriageFormData = z.infer<typeof triageFormSchema>;

// =============================================================================
// TYPES
// =============================================================================

interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  allergies?: string;
}

interface Encounter {
  id: number;
  patient: number;
  encounter_type: 'OPD' | 'IPD' | 'EMERGENCY';
  spo2?: number;
  pulse?: number;
  blood_pressure?: string;
  temperature?: number;
  respiratory_rate?: number;
}

export interface TriageAssessmentFormProps {
  /** Patient data */
  patient: Patient;
  /** Active encounter */
  encounter: Encounter;
  /** Initial form data (for editing) */
  initialData?: Partial<TriageFormData>;
  /** Submit handler */
  onSubmit: (data: TriageAssessmentCreateData) => Promise<void> | void;
  /** Cancel handler */
  onCancel: () => void;
  /** Loading state */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate patient age from date of birth
 */
function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Get pain severity label from score
 */
function getPainSeverity(score: number | null | undefined): {
  label: string;
  color: string;
} {
  if (score === null || score === undefined) return { label: 'Not assessed', color: 'gray' };
  if (score === 0) return { label: 'None', color: 'green' };
  if (score <= 2) return { label: 'Minimal', color: 'green' };
  if (score <= 4) return { label: 'Mild', color: 'yellow' };
  if (score <= 6) return { label: 'Moderate', color: 'orange' };
  if (score <= 8) return { label: 'Severe', color: 'red' };
  return { label: 'Unbearable', color: 'red' };
}

/**
 * Generate triage alerts from assessment data and vitals
 */
function generateTriageAlerts(
  formData: Partial<TriageFormData>,
  encounter: Encounter
): TriageAlert[] {
  const alerts: TriageAlert[] = [];

  // Check for AVPU = U (Unresponsive)
  if (formData.mental_status === 'U') {
    alerts.push({
      id: 'avpu-unresponsive',
      severity: 'CRITICAL',
      vital_type: 'SPO2', // Using SPO2 as placeholder, ideally would have AVPU type
      message: 'CRITICAL: Unresponsive patient - Immediate attention required',
      value: 0,
      threshold: 0,
      clinical_note: 'Patient is unresponsive (AVPU = U). Immediate intervention required.',
    });
  }

  // Check SpO2
  if (encounter.spo2 !== undefined) {
    if (encounter.spo2 < 90) {
      alerts.push({
        id: 'spo2-critical',
        severity: 'CRITICAL',
        vital_type: 'SPO2',
        message: `Severe hypoxemia - SpO2 ${encounter.spo2}%`,
        value: encounter.spo2,
        threshold: 90,
        clinical_note: 'Immediate intervention required',
      });
    } else if (encounter.spo2 < 95) {
      alerts.push({
        id: 'spo2-warning',
        severity: 'WARNING',
        vital_type: 'SPO2',
        message: `Low oxygen saturation - SpO2 ${encounter.spo2}%`,
        value: encounter.spo2,
        threshold: 95,
        clinical_note: 'Monitor closely, consider supplemental oxygen',
      });
    }
  }

  return alerts;
}

/**
 * Calculate suggested triage category based on vitals and assessment
 */
function calculateSuggestedCategory(
  formData: Partial<TriageFormData>,
  encounter: Encounter
): TriageCategory {
  // Critical conditions → RED
  if (formData.mental_status === 'U') return 'RED';
  if (encounter.spo2 !== undefined && encounter.spo2 < 90) return 'RED';
  if (encounter.pulse !== undefined && (encounter.pulse < 40 || encounter.pulse > 150))
    return 'RED';

  // High-risk complaints or warning vitals → ORANGE
  const highRiskComplaints: ChiefComplaintCategory[] = [
    'CHEST_PAIN',
    'DIFFICULTY_BREATHING',
    'ALTERED_CONSCIOUSNESS',
  ];
  if (
    formData.chief_complaint_category &&
    highRiskComplaints.includes(formData.chief_complaint_category)
  ) {
    return 'ORANGE';
  }
  if (encounter.spo2 !== undefined && encounter.spo2 < 95) return 'ORANGE';
  if (formData.mental_status === 'P') return 'ORANGE';

  // Moderate conditions → YELLOW
  if (formData.pain_score !== null && formData.pain_score !== undefined && formData.pain_score >= 7)
    return 'YELLOW';
  if (formData.mental_status === 'V') return 'YELLOW';
  if (encounter.temperature !== undefined && encounter.temperature >= 38.5) return 'YELLOW';

  // Stable conditions → GREEN
  if (formData.mental_status === 'A') return 'GREEN';

  // Non-urgent → BLUE
  return 'BLUE';
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * TriageAssessmentForm - Main triage assessment form
 *
 * Features:
 * - Patient arrival information (mode, time)
 * - Chief complaint category and details
 * - Pain score with visual scale (0-10)
 * - AVPU mental status assessment
 * - Mobility status
 * - Allergies (pre-populated from patient record)
 * - KETA triage category selection with auto-suggestion
 * - Category override with mandatory reason
 * - Care area routing
 * - Form validation with error messages
 * - Accessibility support
 */
export function TriageAssessmentForm({
  patient,
  encounter,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  disabled = false,
}: TriageAssessmentFormProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Calculate initial suggested category
  const initialSuggested = calculateSuggestedCategory(initialData || {}, encounter);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TriageFormData>({
    resolver: zodResolver(triageFormSchema),
    defaultValues: {
      arrival_mode: initialData?.arrival_mode,
      arrival_time: initialData?.arrival_time || new Date().toISOString().slice(0, 16),
      chief_complaint_category: initialData?.chief_complaint_category,
      chief_complaint: initialData?.chief_complaint || '',
      pain_score: initialData?.pain_score ?? null,
      mental_status: initialData?.mental_status,
      mobility: initialData?.mobility,
      allergies_noted: initialData?.allergies_noted || patient.allergies || '',
      triage_category: initialData?.triage_category,
      auto_calculated_category: initialData?.auto_calculated_category || initialSuggested,
      category_override_reason: initialData?.category_override_reason || '',
      assigned_area: initialData?.assigned_area,
      assigned_clinician: initialData?.assigned_clinician || null,
    },
  });

  // Watch form values for dynamic updates
  const watchedValues = watch();
  const painScore = watchedValues.pain_score;
  const mentalStatus = watchedValues.mental_status;
  const selectedCategory = watchedValues.triage_category;
  const autoCalculatedCategory = watchedValues.auto_calculated_category;
  const chiefComplaintCategory = watchedValues.chief_complaint_category;

  // Recalculate suggested category when relevant fields change
  React.useEffect(() => {
    const newSuggested = calculateSuggestedCategory(
      { mental_status: mentalStatus, chief_complaint_category: chiefComplaintCategory, pain_score: painScore },
      encounter
    );
    if (newSuggested !== autoCalculatedCategory) {
      setValue('auto_calculated_category', newSuggested);
    }
  }, [
    mentalStatus,
    chiefComplaintCategory,
    painScore,
    encounter,
    setValue,
    autoCalculatedCategory,
  ]);

  // Generate alerts
  const alerts = generateTriageAlerts(watchedValues, encounter);

  // Check if category differs from suggested
  const categoryOverridden =
    autoCalculatedCategory && selectedCategory && selectedCategory !== autoCalculatedCategory;

  // Pain severity
  const painSeverity = getPainSeverity(painScore);

  // Form submission
  const onFormSubmit = async (data: TriageFormData) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        encounter: encounter.id,
        arrival_mode: data.arrival_mode,
        arrival_time: data.arrival_time,
        chief_complaint_category: data.chief_complaint_category,
        chief_complaint: data.chief_complaint,
        pain_score: data.pain_score,
        mental_status: data.mental_status,
        mobility: data.mobility,
        allergies_noted: data.allergies_noted,
        triage_category: data.triage_category,
        category_override_reason: data.category_override_reason,
        assigned_area: data.assigned_area,
        assigned_clinician: data.assigned_clinician,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const age = calculateAge(patient.date_of_birth);
  const genderDisplay = patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other';

  return (
    <form
      role="form"
      onSubmit={handleSubmit(onFormSubmit)}
      className="space-y-6"
    >
      {/* Patient Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {patient.first_name} {patient.last_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {patient.mrn} • {age} yrs • {genderDisplay}
                </p>
              </div>
            </div>
            {autoCalculatedCategory && (
              <div data-testid="suggested-category" className="text-right">
                <p className="text-xs text-muted-foreground mb-1">Suggested Category</p>
                <TriageCategoryBadge category={autoCalculatedCategory} showIcon />
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Alerts Panel */}
      {alerts.length > 0 && (
        <VitalAlertsPanel alerts={alerts} showClinicalNotes />
      )}

      {/* Arrival Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ambulance className="h-4 w-4" />
            Arrival Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* Arrival Mode */}
          <div className="space-y-2">
            <Label htmlFor="arrival_mode">
              Arrival Mode <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="arrival_mode"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="arrival_mode"
                    aria-required="true"
                    aria-invalid={!!errors.arrival_mode}
                  >
                    <SelectValue placeholder="Select arrival mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ARRIVAL_MODE_CONFIG) as [ArrivalMode, { label: string }][]).map(
                      ([value, config]) => (
                        <SelectItem key={value} value={value}>
                          {config.label}
                        </SelectItem>
                      )
                    )}
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
            <Label htmlFor="arrival_time">
              Arrival Time <span className="text-destructive">*</span>
            </Label>
            <Input
              id="arrival_time"
              type="datetime-local"
              {...register('arrival_time')}
              disabled={disabled}
              aria-required="true"
              aria-invalid={!!errors.arrival_time}
            />
            {errors.arrival_time && (
              <p className="text-sm text-destructive">{errors.arrival_time.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chief Complaint */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4" />
            Chief Complaint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="chief_complaint_category">
              Chief Complaint Category <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="chief_complaint_category"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="chief_complaint_category"
                    aria-required="true"
                    aria-invalid={!!errors.chief_complaint_category}
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(CHIEF_COMPLAINT_CONFIG) as [
                        ChiefComplaintCategory,
                        { label: string },
                      ][]
                    ).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.chief_complaint_category && (
              <p className="text-sm text-destructive">
                {errors.chief_complaint_category.message}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-2">
            <Label htmlFor="chief_complaint">
              Chief Complaint Details <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="chief_complaint"
              {...register('chief_complaint')}
              placeholder="Describe the chief complaint in detail..."
              disabled={disabled}
              aria-required="true"
              aria-invalid={!!errors.chief_complaint}
              rows={3}
            />
            {errors.chief_complaint && (
              <p className="text-sm text-destructive">{errors.chief_complaint.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Clinical Assessment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Clinical Assessment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pain Score */}
          <div className="space-y-3" data-testid="pain-score-section">
            <div className="flex items-center justify-between">
              <Label htmlFor="pain_score">Pain Score (0-10)</Label>
              <Badge
                className={cn(
                  painSeverity.color === 'green' && 'bg-green-500',
                  painSeverity.color === 'yellow' && 'bg-yellow-500 text-black',
                  painSeverity.color === 'orange' && 'bg-orange-500',
                  painSeverity.color === 'red' && 'bg-red-500',
                  painSeverity.color === 'gray' && 'bg-gray-400'
                )}
              >
                {painSeverity.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">0</span>
              <Controller
                name="pain_score"
                control={control}
                render={({ field }) => (
                  <input
                    type="range"
                    id="pain_score"
                    aria-label="Pain score"
                    min={0}
                    max={10}
                    value={field.value ?? 0}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                    disabled={disabled}
                    className="flex-1 h-2 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 rounded-lg appearance-none cursor-pointer"
                  />
                )}
              />
              <span className="text-sm font-medium">10</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Current: {painScore ?? 'Not assessed'} - {painSeverity.label}
            </p>
          </div>

          {/* AVPU Mental Status */}
          <div className="space-y-3">
            <Label>
              Mental Status (AVPU) <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="mental_status"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  aria-label="Mental status"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  disabled={disabled}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {(Object.entries(AVPU_CONFIG) as [AVPUStatus, { code: string; label: string; description: string }][]).map(
                    ([value, config]) => (
                      <div key={value} className="flex items-center space-x-2">
                        <RadioGroupItem
                          value={value}
                          id={`avpu-${value}`}
                          className={cn(
                            value === 'U' && field.value === 'U' && 'border-red-500'
                          )}
                        />
                        <Label
                          htmlFor={`avpu-${value}`}
                          className={cn(
                            'font-normal cursor-pointer',
                            value === 'U' && field.value === 'U' && 'text-red-600 font-medium'
                          )}
                        >
                          {config.label}
                        </Label>
                      </div>
                    )
                  )}
                </RadioGroup>
              )}
            />
            {errors.mental_status && (
              <p className="text-sm text-destructive">{errors.mental_status.message}</p>
            )}
            {mentalStatus === 'U' && (
              <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>CRITICAL: Unresponsive patient - Immediate attention required</span>
              </div>
            )}
          </div>

          {/* Mobility */}
          <div className="space-y-2">
            <Label htmlFor="mobility">
              Mobility Status <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="mobility"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="mobility"
                    aria-required="true"
                    aria-invalid={!!errors.mobility}
                  >
                    <SelectValue placeholder="Select mobility status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(MOBILITY_CONFIG) as [
                        MobilityStatus,
                        { label: string; description: string },
                      ][]
                    ).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.mobility && (
              <p className="text-sm text-destructive">{errors.mobility.message}</p>
            )}
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label htmlFor="allergies_noted">Allergies Noted</Label>
            <Input
              id="allergies_noted"
              {...register('allergies_noted')}
              placeholder="Enter known allergies or NKDA"
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Triage Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Triage Category (KETA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Controller
            name="triage_category"
            control={control}
            render={({ field }) => (
              <RadioGroup
                aria-label="Triage category"
                value={field.value ?? ''}
                onValueChange={field.onChange}
                disabled={disabled}
                className="space-y-2"
              >
                {(
                  Object.entries(TRIAGE_CATEGORY_CONFIG) as [
                    TriageCategory,
                    { category: string; label: string; description: string },
                  ][]
                ).map(([value, config]) => (
                  <div
                    key={value}
                    className={cn(
                      'flex items-center space-x-3 p-3 rounded-lg border transition-colors',
                      field.value === value && 'border-blue-500 bg-blue-50 dark:bg-blue-950',
                      value === autoCalculatedCategory &&
                        field.value !== value &&
                        'border-dashed border-green-400'
                    )}
                  >
                    <RadioGroupItem value={value} id={`category-${value}`} />
                    <Label
                      htmlFor={`category-${value}`}
                      className="flex-1 cursor-pointer flex items-center gap-3"
                    >
                      <TriageCategoryBadge category={value} size="sm" />
                      <span className="text-sm">{config.label}</span>
                      {value === autoCalculatedCategory && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          Suggested
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
          {errors.triage_category && (
            <p className="text-sm text-destructive">{errors.triage_category.message}</p>
          )}

          {/* Override Reason */}
          {categoryOverridden && (
            <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg">
              <Label htmlFor="category_override_reason" className="text-amber-800 dark:text-amber-200">
                Override Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="category_override_reason"
                {...register('category_override_reason')}
                placeholder="Explain why you're selecting a different category..."
                disabled={disabled}
                rows={2}
              />
              {errors.category_override_reason && (
                <p className="text-sm text-destructive">
                  {errors.category_override_reason.message}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Care Area Routing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Care Area Assignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="assigned_area">
              Assigned Area <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="assigned_area"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <SelectTrigger
                    id="assigned_area"
                    aria-required="true"
                    aria-invalid={!!errors.assigned_area}
                  >
                    <SelectValue placeholder="Select care area" />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(ASSIGNED_AREA_CONFIG) as [AssignedArea, { label: string }][]
                    ).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.assigned_area && (
              <p className="text-sm text-destructive">{errors.assigned_area.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || disabled}>
          {isSubmitting ? 'Saving...' : 'Complete Triage'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Triage Assessment Edit Form
 *
 * Form for editing an existing triage assessment.
 * Vitals editing is conditionally enabled based on:
 * - Encounter status (not CLOSED)
 * - User is encounter owner (created_by or assigned_clinician)
 * - User has triage.change_triageassessment permission
 */
'use client';

import { useMemo, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Droplets,
  Brain,
  AlertCircle,
  PersonStanding,
  Lock,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HelpPopover } from '@/components/shared/help-popover';
import { TriageCategoryBadge } from './triage-category-badge';
import { cn } from '@/lib/utils/cn';
import type { TriageAssessment, AVPUStatus, MobilityStatus, TriageCategory } from '@/lib/types/triage';
import type { TriageAssessmentUpdateData } from '@/lib/api/triage';
import {
  AVPU_CONFIG,
  MOBILITY_CONFIG,
  TRIAGE_CATEGORY_CONFIG,
  CHIEF_COMPLAINT_CONFIG,
} from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export interface TriageEditPermissions {
  /** User can edit assessment fields (mental status, mobility, etc.) */
  canEditAssessment: boolean;
  /** User can edit vital signs (requires ownership + permission) */
  canEditVitals: boolean;
  /** User can change triage category */
  canEditCategory: boolean;
  /** Reason why vitals editing is disabled (for display) */
  vitalsDisabledReason?: string;
}

interface TriageAssessmentEditFormProps {
  assessment: TriageAssessment;
  permissions: TriageEditPermissions;
  onSubmit: (data: TriageAssessmentUpdateData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const editFormSchema = z.object({
  // Clinical assessment (always editable with assessment permission)
  chief_complaint: z.string().min(1, 'Chief complaint is required'),
  pain_score: z.number().min(0).max(10).nullable().optional(),
  mental_status: z.enum(['A', 'V', 'P', 'U']),
  mobility: z.enum(['AMBULATORY', 'WHEELCHAIR', 'STRETCHER', 'IMMOBILE']),
  allergies_noted: z.string().optional(),

  // Vital signs (conditionally editable)
  spo2: z.union([z.literal(null), z.number().min(0).max(100)]).optional(),
  heart_rate: z.union([z.literal(null), z.number().min(0).max(300)]).optional(),
  systolic_bp: z.union([z.literal(null), z.number().min(0).max(300)]).optional(),
  diastolic_bp: z.union([z.literal(null), z.number().min(0).max(200)]).optional(),
  temperature: z.union([z.literal(null), z.number().min(30).max(45)]).optional(),
  respiratory_rate: z.union([z.literal(null), z.number().min(0).max(60)]).optional(),

  // Triage category (conditionally editable)
  triage_category: z.enum(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE']),
  category_override_reason: z.string().optional(),
});

type EditFormData = z.infer<typeof editFormSchema>;

// =============================================================================
// COMPONENT
// =============================================================================

export function TriageAssessmentEditForm({
  assessment,
  permissions,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: TriageAssessmentEditFormProps) {
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<EditFormData>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      chief_complaint: assessment.chief_complaint || '',
      pain_score: assessment.pain_score,
      mental_status: assessment.mental_status,
      mobility: assessment.mobility,
      allergies_noted: assessment.allergies_noted || '',
      spo2: assessment.spo2 ?? null,
      heart_rate: assessment.heart_rate ?? null,
      systolic_bp: assessment.systolic_bp ?? null,
      diastolic_bp: assessment.diastolic_bp ?? null,
      temperature: assessment.temperature ?? null,
      respiratory_rate: assessment.respiratory_rate ?? null,
      triage_category: assessment.triage_category,
      category_override_reason: assessment.category_override_reason || '',
    },
  });

  const currentCategory = watch('triage_category');
  const originalCategory = assessment.auto_calculated_category;
  const isOverridden = currentCategory !== originalCategory;

  // Handle form submission
  const handleFormSubmit = async (data: EditFormData) => {
    const updateData: TriageAssessmentUpdateData = {
      chief_complaint: data.chief_complaint,
      pain_score: data.pain_score,
      mental_status: data.mental_status,
      mobility: data.mobility,
      allergies_noted: data.allergies_noted,
      triage_category: data.triage_category,
    };

    // Only include vitals if user has permission
    if (permissions.canEditVitals) {
      updateData.spo2 = data.spo2;
      updateData.heart_rate = data.heart_rate;
      updateData.systolic_bp = data.systolic_bp;
      updateData.diastolic_bp = data.diastolic_bp;
      updateData.temperature = data.temperature;
      updateData.respiratory_rate = data.respiratory_rate;
    }

    // Include override reason if category changed
    if (isOverridden && data.category_override_reason) {
      updateData.category_override_reason = data.category_override_reason;
    }

    await onSubmit(updateData);
  };

  // Helper to parse number input
  const parseNumberInput = (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Vitals Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Vital Signs</CardTitle>
              <HelpPopover content="Vital signs captured during triage. Editing requires ownership of the encounter and appropriate permissions." />
            </div>
            {!permissions.canEditVitals && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>{permissions.vitalsDisabledReason || 'Vitals editing disabled'}</span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!permissions.canEditVitals && (
            <Alert variant="default" className="mb-4">
              <Info className="h-4 w-4" />
              <AlertTitle>Vitals are read-only</AlertTitle>
              <AlertDescription>
                {permissions.vitalsDisabledReason || 'You do not have permission to edit vitals for this assessment.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {/* SpO2 */}
            <div className="space-y-2">
              <Label htmlFor="spo2" className="flex items-center gap-1.5 text-xs">
                <Droplets className="h-3.5 w-3.5" />
                SpO2
              </Label>
              <Controller
                name="spo2"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="spo2"
                      type="number"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>%</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>

            {/* Heart Rate */}
            <div className="space-y-2">
              <Label htmlFor="heart_rate" className="flex items-center gap-1.5 text-xs">
                <Heart className="h-3.5 w-3.5" />
                HR
              </Label>
              <Controller
                name="heart_rate"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="heart_rate"
                      type="number"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>bpm</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>

            {/* Systolic BP */}
            <div className="space-y-2">
              <Label htmlFor="systolic_bp" className="flex items-center gap-1.5 text-xs">
                <Activity className="h-3.5 w-3.5" />
                Sys BP
              </Label>
              <Controller
                name="systolic_bp"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="systolic_bp"
                      type="number"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>mmHg</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>

            {/* Diastolic BP */}
            <div className="space-y-2">
              <Label htmlFor="diastolic_bp" className="flex items-center gap-1.5 text-xs">
                <Activity className="h-3.5 w-3.5" />
                Dia BP
              </Label>
              <Controller
                name="diastolic_bp"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="diastolic_bp"
                      type="number"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>mmHg</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <Label htmlFor="temperature" className="flex items-center gap-1.5 text-xs">
                <Thermometer className="h-3.5 w-3.5" />
                Temp
              </Label>
              <Controller
                name="temperature"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="temperature"
                      type="number"
                      step="0.1"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>°C</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2">
              <Label htmlFor="respiratory_rate" className="flex items-center gap-1.5 text-xs">
                <Wind className="h-3.5 w-3.5" />
                RR
              </Label>
              <Controller
                name="respiratory_rate"
                control={control}
                render={({ field }) => (
                  <InputGroup>
                    <InputGroupInput
                      id="respiratory_rate"
                      type="number"
                      placeholder="—"
                      disabled={!permissions.canEditVitals}
                      className={cn(!permissions.canEditVitals && 'bg-muted')}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                    />
                    <InputGroupAddon>/min</InputGroupAddon>
                  </InputGroup>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clinical Assessment Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Clinical Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Chief Complaint */}
          <div className="space-y-2">
            <Label htmlFor="chief_complaint">Chief Complaint *</Label>
            <Controller
              name="chief_complaint"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="chief_complaint"
                  placeholder="Describe the patient's main complaint..."
                  disabled={!permissions.canEditAssessment}
                  className={cn(!permissions.canEditAssessment && 'bg-muted')}
                  {...field}
                />
              )}
            />
            {errors.chief_complaint && (
              <p className="text-sm text-destructive">{errors.chief_complaint.message}</p>
            )}
          </div>

          {/* Pain Score */}
          <div className="space-y-2">
            <Label htmlFor="pain_score">Pain Score (0-10)</Label>
            <Controller
              name="pain_score"
              control={control}
              render={({ field }) => (
                <Input
                  id="pain_score"
                  type="number"
                  min={0}
                  max={10}
                  placeholder="0-10"
                  disabled={!permissions.canEditAssessment}
                  className={cn('w-24', !permissions.canEditAssessment && 'bg-muted')}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(parseNumberInput(e.target.value))}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Mental Status (AVPU) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Brain className="h-4 w-4" />
                Mental Status (AVPU) *
              </Label>
              <Controller
                name="mental_status"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!permissions.canEditAssessment}
                    className="flex flex-wrap gap-2"
                  >
                    {(Object.keys(AVPU_CONFIG) as AVPUStatus[]).map((status) => (
                      <div key={status} className="flex items-center">
                        <RadioGroupItem
                          value={status}
                          id={`avpu-${status}`}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={`avpu-${status}`}
                          className={cn(
                            'flex items-center justify-center px-3 py-2 text-sm border rounded-md cursor-pointer transition-colors',
                            'peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:border-primary',
                            'hover:bg-accent',
                            !permissions.canEditAssessment && 'opacity-50 cursor-not-allowed'
                          )}
                        >
                          {AVPU_CONFIG[status].label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              />
            </div>

            {/* Mobility */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <PersonStanding className="h-4 w-4" />
                Mobility *
              </Label>
              <Controller
                name="mobility"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={!permissions.canEditAssessment}
                  >
                    <SelectTrigger className={cn(!permissions.canEditAssessment && 'bg-muted')}>
                      <SelectValue placeholder="Select mobility status" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MOBILITY_CONFIG) as MobilityStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {MOBILITY_CONFIG[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label htmlFor="allergies_noted" className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Known Allergies
            </Label>
            <Controller
              name="allergies_noted"
              control={control}
              render={({ field }) => (
                <Input
                  id="allergies_noted"
                  placeholder="List any known allergies (NKDA if none)"
                  disabled={!permissions.canEditAssessment}
                  className={cn(!permissions.canEditAssessment && 'bg-muted')}
                  {...field}
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Triage Category Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Triage Category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-2">
            <div>
              <span className="text-sm text-muted-foreground mr-2">Auto-calculated:</span>
              <TriageCategoryBadge category={originalCategory} />
            </div>
          </div>

          <Controller
            name="triage_category"
            control={control}
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                disabled={!permissions.canEditCategory}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2"
              >
                {(Object.keys(TRIAGE_CATEGORY_CONFIG) as TriageCategory[]).map((category) => {
                  const config = TRIAGE_CATEGORY_CONFIG[category];
                  const isSelected = field.value === category;
                  return (
                    <div key={category}>
                      <RadioGroupItem
                        value={category}
                        id={`category-${category}`}
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor={`category-${category}`}
                        className={cn(
                          'flex flex-col items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-all',
                          isSelected && 'ring-2 ring-offset-2',
                          !permissions.canEditCategory && 'opacity-50 cursor-not-allowed'
                        )}
                        style={{
                          backgroundColor: isSelected ? config.bgColor : 'transparent',
                          borderColor: config.bgColor,
                          color: isSelected ? config.textColor : undefined,
                        }}
                      >
                        <span className="font-bold text-sm">{category}</span>
                        <span className="text-xs text-center mt-1" style={{ color: isSelected ? config.textColor : undefined }}>
                          {config.targetWaitMinutes === 0 ? 'Immediate' : `≤${config.targetWaitMinutes}min`}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          />

          {/* Override Reason (required if category changed) */}
          {isOverridden && (
            <div className="space-y-2 mt-4">
              <Label htmlFor="category_override_reason" className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                Override Reason (recommended)
              </Label>
              <Controller
                name="category_override_reason"
                control={control}
                render={({ field }) => (
                  <Textarea
                    id="category_override_reason"
                    placeholder="Explain why you're overriding the auto-calculated category..."
                    className="min-h-[80px]"
                    {...field}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Category changed from {originalCategory} to {currentCategory}. Please document the clinical rationale.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

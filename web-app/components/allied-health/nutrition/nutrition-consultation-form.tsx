/**
 * Nutrition Consultation Form
 * Form for creating and editing nutrition consultations
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { HelpPopover } from '@/components/shared/help-popover';
import { 
  User, 
  AlertCircle, 
  Check, 
  ChevronsUpDown,
  Apple,
  Scale,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCreateNutritionConsultation,
  useUpdateNutritionConsultation,
} from '@/lib/hooks/use-nutrition';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import { useEncounter, useEncounterDiagnoses } from '@/lib/hooks/use-encounters';
import { REFERRAL_REASON_LABELS, type NutritionReferralReason, type ActivityLevel } from '@/lib/types/nutrition';

// =============================================================================
// Types & Validation
// =============================================================================

const referralReasons: NutritionReferralReason[] = [
  'WEIGHT_MANAGEMENT',
  'DIABETES',
  'CARDIOVASCULAR',
  'RENAL',
  'GI_DISORDERS',
  'EATING_DISORDER',
  'MALNUTRITION',
  'PREGNANCY',
  'PEDIATRIC',
  'ONCOLOGY',
  'FOOD_ALLERGY',
  'TUBE_FEEDING',
  'TPN',
  'SPORTS',
  'GENERAL',
  'OTHER',
];

const priorities = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;

const priorityLabels: Record<string, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
};

const activityLevels = [
  'SEDENTARY',
  'LIGHTLY_ACTIVE',
  'MODERATELY_ACTIVE',
  'VERY_ACTIVE',
  'EXTREMELY_ACTIVE',
] as const;

const activityLevelLabels: Record<string, string> = {
  SEDENTARY: 'Sedentary (little/no exercise)',
  LIGHTLY_ACTIVE: 'Lightly Active (1-2 days/week)',
  MODERATELY_ACTIVE: 'Moderately Active (3-5 days/week)',
  VERY_ACTIVE: 'Very Active (6-7 days/week)',
  EXTREMELY_ACTIVE: 'Extremely Active (athlete/physical job)',
};

const consultationSchema = z.object({
  patient_id: z.number({ required_error: 'Patient is required' }).min(1, 'Patient is required'),
  referral_reason: z.string().min(1, 'Referral reason is required'),
  clinical_notes: z
    .string({ required_error: 'Clinical notes are required' })
    .min(10, 'Clinical notes must be at least 10 characters'),
  priority: z.enum(priorities).default('ROUTINE'),
  // Anthropometrics
  weight_kg: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  waist_cm: z.number().positive().optional().nullable(),
  hip_circumference: z.number().positive().optional().nullable(),
  muac_cm: z.number().positive().optional().nullable(),
  // Nutritional assessment
  activity_level: z.enum(activityLevels).optional(),
  dietary_restrictions: z.string().optional(),
  food_allergies: z.string().optional(),
  current_diet: z.string().optional(),
  nutritional_goals: z.string().optional(),
  encounter_id: z.number().optional(),
});

type ConsultationFormData = z.infer<typeof consultationSchema>;

interface NutritionConsultationFormProps {
  patientId?: number;
  encounterId?: number;
  consultation?: {
    id: number;
    patient_id: number;
    referral_reason: string;
    clinical_notes: string;
    priority: string;
    weight_kg?: number | null;
    height_cm?: number | null;
    waist_cm?: number | null;
    hip_circumference?: number | null;
    muac_cm?: number | null;
    activity_level?: string;
    dietary_restrictions?: string;
    food_allergies?: string;
    current_diet?: string;
    nutritional_goals?: string;
    status: string;
  };
}

export function NutritionConsultationForm({
  patientId,
  encounterId,
  consultation,
}: NutritionConsultationFormProps) {
  const router = useRouter();
  const isEditMode = !!consultation;

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(
    patientId || consultation?.patient_id
  );

  // Form state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Data fetching
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: patientSearch || undefined,
  });
  const { data: selectedPatient, isLoading: patientLoading } = usePatient(selectedPatientId!);

  // Fetch encounter vitals and diagnoses for auto-population (when referred from encounter/triage)
  const { data: encounter } = useEncounter(encounterId!);
  const { data: encounterDiagnoses } = useEncounterDiagnoses(encounterId!);

  const createMutation = useCreateNutritionConsultation();
  const updateMutation = useUpdateNutritionConsultation();

  const patients = patientsData?.results || [];

  // Form setup
  const form = useForm<ConsultationFormData>({
    resolver: zodResolver(consultationSchema),
    defaultValues: {
      patient_id: patientId || consultation?.patient_id || 0,
      referral_reason: consultation?.referral_reason || '',
      clinical_notes: consultation?.clinical_notes || '',
      priority: (consultation?.priority as typeof priorities[number]) || 'ROUTINE',
      weight_kg: consultation?.weight_kg ?? undefined,
      height_cm: consultation?.height_cm ?? undefined,
      waist_cm: consultation?.waist_cm ?? undefined,
      hip_circumference: consultation?.hip_circumference ?? undefined,
      muac_cm: consultation?.muac_cm ?? undefined,
      activity_level: (consultation?.activity_level as typeof activityLevels[number]) || 'SEDENTARY',
      dietary_restrictions: consultation?.dietary_restrictions || '',
      food_allergies: consultation?.food_allergies || '',
      current_diet: consultation?.current_diet || '',
      nutritional_goals: consultation?.nutritional_goals || '',
      encounter_id: encounterId,
    },
  });

  // Update patient_id when patientId prop changes
  useEffect(() => {
    if (patientId) {
      form.setValue('patient_id', patientId);
      setSelectedPatientId(patientId);
    }
  }, [patientId, form]);

  // Auto-populate anthropometrics from encounter/triage vitals
  useEffect(() => {
    if (!encounter || isEditMode) return;

    const currentWeight = form.getValues('weight_kg');
    const currentHeight = form.getValues('height_cm');

    if (!currentWeight && encounter.weight) {
      form.setValue('weight_kg', encounter.weight);
    }
    if (!currentHeight && encounter.height) {
      form.setValue('height_cm', encounter.height);
    }
  }, [encounter, form, isEditMode]);

  // Handle patient selection
  const handlePatientSelect = useCallback((id: number) => {
    setSelectedPatientId(id);
    form.setValue('patient_id', id);
    setPatientOpen(false);
    setPatientSearch('');
  }, [form]);

  // Calculate BMI dynamically
  const watchWeight = form.watch('weight_kg');
  const watchHeight = form.watch('height_cm');
  const bmi = useMemo(() => {
    if (watchWeight && watchHeight && watchHeight > 0) {
      const heightM = watchHeight / 100;
      return (watchWeight / (heightM * heightM)).toFixed(1);
    }
    return null;
  }, [watchWeight, watchHeight]);

  // Handle form submission
  const handleSubmit = async (data: ConsultationFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Transform form field names to backend field names
      const payload = {
        patient: data.patient_id,
        encounter: data.encounter_id,
        referral_reason: data.referral_reason as NutritionReferralReason,
        referral_notes: data.clinical_notes,
        priority: data.priority,
        weight: data.weight_kg || undefined,
        height: data.height_cm || undefined,
        waist_circumference: data.waist_cm || undefined,
        hip_circumference: data.hip_circumference || undefined,
        mid_upper_arm_circumference: data.muac_cm || undefined,
        activity_level: data.activity_level,
        food_allergies: data.food_allergies,
        current_diet: data.current_diet,
        nutrition_goals: data.nutritional_goals,
      };

      if (isEditMode && consultation) {
        await updateMutation.mutateAsync({
          id: consultation.id,
          data: payload,
        });
        setSubmitSuccess(true);
        router.push(`/allied-health/nutrition/consultations/${consultation.id}`);
      } else {
        const result = await createMutation.mutateAsync(payload as never);
        setSubmitSuccess(true);
        router.push(`/allied-health/nutrition/consultations/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to submit consultation:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit consultation');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success Message */}
      {submitSuccess && (
        <Alert variant="default">
          <Check className="h-4 w-4" />
          <AlertDescription>
            {isEditMode ? 'Consultation updated successfully!' : 'Consultation created successfully!'}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-6">
          {/* Patient Selection */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient *</FormLabel>
                    <FormControl>
                      {patientId ? (
                        <div className="space-y-1">
                          {patientLoading ? (
                            <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                              <LoadingSpinner className="h-4 w-4" />
                              <span className="text-sm text-muted-foreground">Loading patient...</span>
                            </div>
                          ) : selectedPatient ? (
                            <div className="p-2 border rounded-md bg-muted/50">
                              <p className="font-medium">{selectedPatient.full_name || `${selectedPatient.first_name} ${selectedPatient.last_name}`}</p>
                              <p className="text-sm text-muted-foreground">{selectedPatient.mrn}</p>
                            </div>
                          ) : (
                            <div className="p-2 border rounded-md bg-muted/50">
                              <p className="text-sm text-muted-foreground">Patient #{patientId}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Popover open={patientOpen} onOpenChange={setPatientOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={patientOpen}
                              className="w-full justify-between"
                            >
                              {selectedPatient
                                ? `${selectedPatient.full_name || `${selectedPatient.first_name} ${selectedPatient.last_name}`} (${selectedPatient.mrn})`
                                : 'Select patient...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search patients..."
                                value={patientSearch}
                                onValueChange={setPatientSearch}
                              />
                              <CommandList>
                                {patientsLoading ? (
                                  <div className="p-2 text-center">
                                    <LoadingSpinner className="h-4 w-4 mx-auto" />
                                  </div>
                                ) : patients.length === 0 ? (
                                  <CommandEmpty>No patients found.</CommandEmpty>
                                ) : (
                                  <CommandGroup>
                                    {patients.map((patient) => (
                                      <CommandItem
                                        key={patient.id}
                                        value={String(patient.id)}
                                        onSelect={() => handlePatientSelect(patient.id)}
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4',
                                            selectedPatientId === patient.id ? 'opacity-100' : 'opacity-0'
                                          )}
                                        />
                                        <div>
                                          <p className="font-medium">
                                            {patient.full_name || `${patient.first_name} ${patient.last_name}`}
                                          </p>
                                          <p className="text-sm text-muted-foreground">{patient.mrn}</p>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Referral Details */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Apple className="h-4 w-4 sm:h-5 sm:w-5" />
                Referral Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="referral_reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referral Reason *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {referralReasons.map((reason) => (
                            <SelectItem key={reason} value={reason}>
                              {REFERRAL_REASON_LABELS[reason]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {priorities.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              {priorityLabels[priority]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Encounter Diagnoses (read-only context from referring encounter) */}
              {encounterDiagnoses && encounterDiagnoses.length > 0 && (
                <div className="rounded-lg border p-3 sm:p-4 bg-muted/30 space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    Encounter Diagnoses
                    <HelpPopover content="Diagnoses from the referring encounter. These provide clinical context for the nutrition consultation." />
                  </h4>
                  <div className="space-y-1.5">
                    {encounterDiagnoses.map((dx) => (
                      <div key={dx.id} className="flex items-start gap-2 text-sm">
                        <Badge
                          variant={dx.diagnosis_type === 'PRIMARY' ? 'default' : 'outline'}
                          className="shrink-0 text-xs mt-0.5"
                        >
                          {dx.diagnosis_type}
                        </Badge>
                        <span>
                          {dx.icd10_code_display || dx.icd10_display || dx.free_text_diagnosis || 'Unknown'}
                          {dx.icd10_description && (
                            <span className="text-muted-foreground"> — {dx.icd10_description}</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="clinical_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinical Notes *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the reason for referral, relevant medical history, and nutritional concerns..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Anthropometrics */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Scale className="h-4 w-4 sm:h-5 sm:w-5" />
                Anthropometrics
                <HelpPopover content="Body measurements for nutritional assessment. BMI is calculated automatically. When opened from an encounter, weight and height are pre-filled from triage vitals." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {encounter && (encounter.weight || encounter.height) && !isEditMode && (
                <Alert>
                  <Scale className="h-4 w-4" />
                  <AlertDescription>
                    Weight and height have been pre-filled from {encounter.vitals_source === 'TRIAGE' ? 'triage' : 'encounter'} vitals. You can adjust if needed.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="weight_kg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Weight (kg)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 70.5"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="height_cm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Height (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 175"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {bmi && (
                  <div className="flex items-end">
                    <div className="p-2 border rounded-md bg-muted/50 w-full">
                      <p className="text-sm text-muted-foreground">Calculated BMI</p>
                      <p className="font-medium text-lg">{bmi}</p>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="waist_cm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Waist (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 80"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hip_circumference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hip (cm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 95"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="muac_cm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        MUAC (cm)
                        <HelpPopover content="Mid-Upper Arm Circumference - used for malnutrition screening" />
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 28"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="activity_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Activity Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select activity level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activityLevels.map((level) => (
                          <SelectItem key={level} value={level}>
                            {activityLevelLabels[level]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Dietary Information */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Dietary Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="food_allergies"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Food Allergies</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List any known food allergies or intolerances..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dietary_restrictions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dietary Restrictions</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Cultural, religious, or personal dietary restrictions..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="current_diet"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Diet</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the patient's current eating habits..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nutritional_goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nutritional Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Target outcomes for the nutrition consultation..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending && <LoadingSpinner className="mr-2 h-4 w-4" />}
              {isEditMode ? 'Update Consultation' : 'Create Consultation'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

/**
 * Occupational Therapy Order Form
 * Form for creating and editing OT orders
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Wrench,
  Target,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useOTTreatmentTypes,
  useCreateOTOrder,
  useUpdateOTOrder,
} from '@/lib/hooks/use-occupational-therapy';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import { FIM_LEVEL_LABELS, type FIMLevel } from '@/lib/types/occupational-therapy';

// =============================================================================
// Types & Validation
// =============================================================================

const priorities = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;

const priorityLabels: Record<string, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
};

const fimLevels = [1, 2, 3, 4, 5, 6, 7] as const;

const orderSchema = z.object({
  patient_id: z.number({ required_error: 'Patient is required' }).min(1, 'Patient is required'),
  treatment_type_id: z.number({ required_error: 'Treatment type is required' }).min(1, 'Treatment type is required'),
  clinical_notes: z
    .string({ required_error: 'Clinical notes are required' })
    .min(10, 'Clinical notes must be at least 10 characters'),
  priority: z.enum(priorities).default('ROUTINE'),
  recommended_sessions: z.number().min(1).max(52).default(8),
  frequency: z.string().optional(),
  duration_per_session: z.number().min(15).max(180).default(60),
  // Functional assessment
  baseline_adl_score: z.number().min(1).max(7).optional().nullable(),
  baseline_iadl_score: z.number().min(1).max(7).optional().nullable(),
  baseline_cognitive_score: z.number().min(1).max(7).optional().nullable(),
  // Goals
  short_term_goals: z.string().optional(),
  long_term_goals: z.string().optional(),
  discharge_criteria: z.string().optional(),
  // Equipment
  assistive_devices_needed: z.string().optional(),
  home_modifications_needed: z.string().optional(),
  encounter_id: z.number().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

interface OTOrderFormProps {
  patientId?: number;
  encounterId?: number;
  order?: {
    id: number;
    patient_id: number;
    treatment_type_id: number;
    clinical_notes: string;
    priority: string;
    recommended_sessions: number;
    frequency?: string;
    duration_per_session: number;
    baseline_adl_score?: number | null;
    baseline_iadl_score?: number | null;
    baseline_cognitive_score?: number | null;
    short_term_goals?: string;
    long_term_goals?: string;
    discharge_criteria?: string;
    assistive_devices_needed?: string;
    home_modifications_needed?: string;
    status: string;
  };
}

export function OTOrderForm({
  patientId,
  encounterId,
  order,
}: OTOrderFormProps) {
  const router = useRouter();
  const isEditMode = !!order;

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(
    patientId || order?.patient_id
  );

  // Treatment type selection state
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | undefined>(
    order?.treatment_type_id
  );

  // Form state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Data fetching
  const { data: typesData, isLoading: typesLoading } = useOTTreatmentTypes({ is_active: true });
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: patientSearch || undefined,
  });
  const { data: selectedPatient, isLoading: patientLoading } = usePatient(selectedPatientId!);

  const createMutation = useCreateOTOrder();
  const updateMutation = useUpdateOTOrder();

  const treatmentTypes = typesData?.results || [];
  const patients = patientsData?.results || [];
  const selectedType = treatmentTypes.find(t => t.id === selectedTypeId);

  // Form setup
  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      patient_id: patientId || order?.patient_id || 0,
      treatment_type_id: order?.treatment_type_id || 0,
      clinical_notes: order?.clinical_notes || '',
      priority: (order?.priority as typeof priorities[number]) || 'ROUTINE',
      recommended_sessions: order?.recommended_sessions || 8,
      frequency: order?.frequency || '',
      duration_per_session: order?.duration_per_session || 60,
      baseline_adl_score: order?.baseline_adl_score ?? undefined,
      baseline_iadl_score: order?.baseline_iadl_score ?? undefined,
      baseline_cognitive_score: order?.baseline_cognitive_score ?? undefined,
      short_term_goals: order?.short_term_goals || '',
      long_term_goals: order?.long_term_goals || '',
      discharge_criteria: order?.discharge_criteria || '',
      assistive_devices_needed: order?.assistive_devices_needed || '',
      home_modifications_needed: order?.home_modifications_needed || '',
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

  // Handle patient selection
  const handlePatientSelect = useCallback((id: number) => {
    setSelectedPatientId(id);
    form.setValue('patient_id', id);
    setPatientOpen(false);
    setPatientSearch('');
  }, [form]);

  // Handle type selection
  const handleTypeSelect = useCallback((id: number) => {
    setSelectedTypeId(id);
    form.setValue('treatment_type_id', id);
    setTypeOpen(false);
    
    // Auto-populate from type
    const type = treatmentTypes.find(t => t.id === id);
    if (type && !isEditMode) {
      form.setValue('recommended_sessions', type.recommended_sessions);
      form.setValue('duration_per_session', type.default_duration_minutes);
      if (type.recommended_frequency) {
        form.setValue('frequency', type.recommended_frequency);
      }
    }
  }, [form, treatmentTypes, isEditMode]);

  // Handle form submission
  const handleSubmit = async (data: OrderFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const payload = {
        patient_id: data.patient_id,
        encounter_id: data.encounter_id,
        treatment_type_id: data.treatment_type_id,
        clinical_notes: data.clinical_notes,
        priority: data.priority,
        recommended_sessions: data.recommended_sessions,
        frequency: data.frequency,
        duration_per_session: data.duration_per_session,
        baseline_adl_score: data.baseline_adl_score,
        baseline_iadl_score: data.baseline_iadl_score,
        baseline_cognitive_score: data.baseline_cognitive_score,
        short_term_goals: data.short_term_goals,
        long_term_goals: data.long_term_goals,
        discharge_criteria: data.discharge_criteria,
        assistive_devices_needed: data.assistive_devices_needed,
        home_modifications_needed: data.home_modifications_needed,
      };

      if (isEditMode && order) {
        await updateMutation.mutateAsync({
          id: order.id,
          data: payload,
        });
        setSubmitSuccess(true);
        router.push(`/allied-health/occupational-therapy/orders/${order.id}`);
      } else {
        const result = await createMutation.mutateAsync(payload as never);
        setSubmitSuccess(true);
        router.push(`/allied-health/occupational-therapy/orders/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to submit order:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit order');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (typesLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Success Message */}
      {submitSuccess && (
        <Alert variant="default">
          <Check className="h-4 w-4" />
          <AlertDescription>
            {isEditMode ? 'Order updated successfully!' : 'Order created successfully!'}
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

          {/* Treatment Type */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
                Treatment Type
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="treatment_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Treatment Type *</FormLabel>
                      <Popover open={typeOpen} onOpenChange={setTypeOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={typeOpen}
                              className="w-full justify-between"
                            >
                              {selectedType ? selectedType.name : 'Select type...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search types..." />
                            <CommandList>
                              <CommandEmpty>No types found.</CommandEmpty>
                              <CommandGroup>
                                {treatmentTypes.map((type) => (
                                  <CommandItem
                                    key={type.id}
                                    value={type.name}
                                    onSelect={() => handleTypeSelect(type.id)}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedTypeId === type.id ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <div>
                                      <p className="font-medium">{type.name}</p>
                                      <p className="text-sm text-muted-foreground capitalize">
                                        {type.category.toLowerCase().replace('_', ' ')}
                                      </p>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
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

              <FormField
                control={form.control}
                name="clinical_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinical Notes *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the reason for OT referral, functional limitations, and treatment needs..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="recommended_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sessions</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={52}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 2x/week" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="duration_per_session"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (min)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={15}
                          max={180}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Functional Assessment */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                Functional Assessment
                <HelpPopover content="FIM Levels: 1=Total Assistance to 7=Complete Independence" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="baseline_adl_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ADL Score (1-7)</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(parseInt(v))} 
                        value={field.value?.toString() || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fimLevels.map((level) => (
                            <SelectItem key={level} value={level.toString()}>
                              {level} - {FIM_LEVEL_LABELS[level].label}
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
                  name="baseline_iadl_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IADL Score (1-7)</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(parseInt(v))} 
                        value={field.value?.toString() || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fimLevels.map((level) => (
                            <SelectItem key={level} value={level.toString()}>
                              {level} - {FIM_LEVEL_LABELS[level].label}
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
                  name="baseline_cognitive_score"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cognitive Score (1-7)</FormLabel>
                      <Select 
                        onValueChange={(v) => field.onChange(parseInt(v))} 
                        value={field.value?.toString() || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fimLevels.map((level) => (
                            <SelectItem key={level} value={level.toString()}>
                              {level} - {FIM_LEVEL_LABELS[level].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Goals */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Target className="h-4 w-4 sm:h-5 sm:w-5" />
                Goals
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="short_term_goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short-Term Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Goals to achieve within 2-4 weeks..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="long_term_goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Long-Term Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Goals to achieve by end of treatment..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discharge_criteria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discharge Criteria</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Criteria that must be met for discharge..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Equipment & Modifications */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Home className="h-4 w-4 sm:h-5 sm:w-5" />
                Equipment & Modifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="assistive_devices_needed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assistive Devices Needed</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List any assistive devices or adaptive equipment..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="home_modifications_needed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Home Modifications Needed</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Recommended home modifications for safety and function..."
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
              {isEditMode ? 'Update Order' : 'Create Order'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

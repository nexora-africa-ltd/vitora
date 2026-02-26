/**
 * Physiotherapy Order Form
 * Form for creating and editing physiotherapy orders (referrals)
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
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  Shield 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePhysioTreatmentTypes,
  useCreatePhysioOrder,
  useUpdatePhysioOrder,
} from '@/lib/hooks/use-physiotherapy';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import { useEncounter } from '@/lib/hooks/use-encounters';
import type { PhysiotherapyOrder, PhysiotherapyTreatmentType } from '@/lib/types/physiotherapy';

// =============================================================================
// Types & Validation
// =============================================================================

const referralReasons = [
  'POST_SURGERY',
  'SPORTS_INJURY',
  'CHRONIC_PAIN',
  'NEUROLOGICAL',
  'ORTHOPEDIC',
  'RESPIRATORY',
  'GERIATRIC',
  'PEDIATRIC',
  'OTHER',
] as const;

const referralReasonLabels: Record<string, string> = {
  POST_SURGERY: 'Post-Surgery',
  SPORTS_INJURY: 'Sports Injury',
  CHRONIC_PAIN: 'Chronic Pain',
  NEUROLOGICAL: 'Neurological',
  ORTHOPEDIC: 'Orthopedic',
  RESPIRATORY: 'Respiratory',
  GERIATRIC: 'Geriatric',
  PEDIATRIC: 'Pediatric',
  OTHER: 'Other',
};

const priorities = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;

const priorityLabels: Record<string, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
};

const orderSchema = z.object({
  patient_id: z.number({ required_error: 'Patient is required' }).min(1, 'Patient is required'),
  treatment_type_id: z.number({ required_error: 'Treatment type is required' }).min(1, 'Treatment type is required'),
  referral_reason: z.enum(referralReasons).optional(),
  clinical_indication: z
    .string({ required_error: 'Clinical indication is required' })
    .min(10, 'Clinical indication must be at least 10 characters'),
  total_sessions: z
    .number({ required_error: 'Total sessions is required' })
    .min(1, 'Sessions must be between 1 and 52')
    .max(52, 'Sessions must be between 1 and 52'),
  frequency: z.string().optional(),
  priority: z.enum(priorities).default('ROUTINE'),
  treatment_goals: z.string().optional(),
  precautions: z.string().optional(),
  contraindications: z.string().optional(),
  relevant_history: z.string().optional(),
  diagnosis: z.string().optional(),
  encounter_id: z.number().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;

/**
 * Existing order data structure for edit mode
 */
interface ExistingOrder {
  id: number;
  order_number: string;
  patient_id: number;
  treatment_type_id: number;
  referral_reason?: string;
  clinical_indication: string;
  total_sessions: number;
  frequency?: string;
  priority: string;
  treatment_goals?: string;
  precautions?: string;
  contraindications?: string;
  relevant_history?: string;
  diagnosis?: string;
  status: string;
}

interface PhysioOrderFormProps {
  patientId?: number;
  encounterId?: number;
  order?: ExistingOrder;
}

// =============================================================================
// Main Component
// =============================================================================

export function PhysioOrderForm({
  patientId,
  encounterId,
  order,
}: PhysioOrderFormProps) {
  const router = useRouter();
  const isEditMode = !!order;
  const isCompleted = order?.status === 'COMPLETED';

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(
    patientId || order?.patient_id
  );

  // Treatment type selection state
  const [selectedTreatmentType, setSelectedTreatmentType] = useState<PhysiotherapyTreatmentType | null>(null);
  const [treatmentTypeOpen, setTreatmentTypeOpen] = useState(false);

  // Form state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Data fetching
  const { data: treatmentTypesData, isLoading: treatmentTypesLoading } = usePhysioTreatmentTypes({
    is_active: true,
  });
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: patientSearch || undefined,
  });
  const { data: selectedPatient, isLoading: patientLoading } = usePatient(selectedPatientId!);
  const { data: encounter, isLoading: encounterLoading } = useEncounter(encounterId!);

  const createMutation = useCreatePhysioOrder();
  const updateMutation = useUpdatePhysioOrder();

  const treatmentTypes = treatmentTypesData?.results || [];
  const patients = patientsData?.results || [];

  // Form setup
  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      patient_id: patientId || order?.patient_id || 0,
      treatment_type_id: order?.treatment_type_id || 0,
      referral_reason: (order?.referral_reason as typeof referralReasons[number]) || undefined,
      clinical_indication: order?.clinical_indication || '',
      total_sessions: order?.total_sessions || 1,
      frequency: order?.frequency || '',
      priority: (order?.priority as typeof priorities[number]) || 'ROUTINE',
      treatment_goals: order?.treatment_goals || '',
      precautions: order?.precautions || '',
      contraindications: order?.contraindications || '',
      relevant_history: order?.relevant_history || '',
      diagnosis: order?.diagnosis || '',
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

  // Update encounter_id when encounterId prop changes
  useEffect(() => {
    if (encounterId) {
      form.setValue('encounter_id', encounterId);
    }
  }, [encounterId, form]);

  // Pre-select treatment type for edit mode
  useEffect(() => {
    if (order?.treatment_type_id && treatmentTypes.length > 0) {
      const type = treatmentTypes.find(t => t.id === order.treatment_type_id);
      if (type) {
        setSelectedTreatmentType(type);
      }
    }
  }, [order?.treatment_type_id, treatmentTypes]);

  // Handle treatment type selection and auto-populate sessions
  const handleTreatmentTypeSelect = useCallback((treatmentType: PhysiotherapyTreatmentType) => {
    setSelectedTreatmentType(treatmentType);
    setTreatmentTypeOpen(false);
    form.setValue('treatment_type_id', treatmentType.id);
    
    // Auto-populate recommended sessions if not already set
    if (!form.getValues('total_sessions') || form.getValues('total_sessions') < 1) {
      form.setValue('total_sessions', treatmentType.recommended_sessions);
    } else if (!isEditMode) {
      // In create mode, always update to recommended
      form.setValue('total_sessions', treatmentType.recommended_sessions);
    }
  }, [form, isEditMode]);

  // Handle patient selection
  const handlePatientSelect = useCallback((id: number) => {
    setSelectedPatientId(id);
    form.setValue('patient_id', id);
    setPatientOpen(false);
    setPatientSearch('');
  }, [form]);

  // Handle form submission
  const handleSubmit = async (data: OrderFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      // Build payload matching API expectations
      const payload = {
        patient_id: data.patient_id,
        encounter_id: data.encounter_id,
        treatment_type_id: data.treatment_type_id,
        referral_reason: data.referral_reason,
        clinical_indication: data.clinical_indication,
        total_sessions: data.total_sessions,
        frequency: data.frequency,
        priority: data.priority,
        treatment_goals: data.treatment_goals,
        precautions: data.precautions,
        contraindications: data.contraindications,
        relevant_history: data.relevant_history,
        diagnosis: data.diagnosis,
      };

      if (isEditMode && order) {
        await updateMutation.mutateAsync({
          id: order.id,
          data: payload,
        });
        setSubmitSuccess(true);
        router.push(`/allied-health/physiotherapy/orders/${order.id}`);
      } else {
        const result = await createMutation.mutateAsync(payload as never);
        setSubmitSuccess(true);
        router.push(`/allied-health/physiotherapy/orders/${result.id}`);
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

  // Loading state
  if (treatmentTypesLoading) {
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
          <AlertDescription>
            {submitError}
          </AlertDescription>
        </Alert>
      )}

      {/* Encounter Context (if provided) */}
      {encounterId && encounter && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Encounter Context
              <HelpPopover content="This order is linked to a specific clinical encounter." />
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <p className="text-sm text-muted-foreground">
              {encounter.chief_complaint}
            </p>
          </CardContent>
        </Card>
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
                        // Pre-selected patient (read-only display)
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
                              <input type="hidden" aria-label="Patient" disabled value={selectedPatient.full_name || ''} />
                            </div>
                          ) : (
                            <div className="p-2 border rounded-md bg-muted/50">
                              <p className="text-sm text-muted-foreground">Patient #{patientId}</p>
                              <input type="hidden" aria-label="Patient" disabled value="" />
                            </div>
                          )}
                        </div>
                      ) : (
                        // Patient search/selection
                        <Popover open={patientOpen} onOpenChange={setPatientOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={patientOpen}
                              aria-label="Patient"
                              className="w-full justify-between"
                              disabled={!!patientId}
                            >
                              {selectedPatientId && selectedPatient
                                ? selectedPatient.full_name
                                : 'Select patient...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search by name or MRN..."
                                value={patientSearch}
                                onValueChange={setPatientSearch}
                              />
                              <CommandList>
                                {patientsLoading ? (
                                  <div className="p-4 text-center">
                                    <LoadingSpinner />
                                  </div>
                                ) : patients.length === 0 ? (
                                  <CommandEmpty>No patients found.</CommandEmpty>
                                ) : (
                                  <CommandGroup>
                                    {patients.map((patient) => (
                                      <CommandItem
                                        key={patient.id}
                                        value={patient.id.toString()}
                                        onSelect={() => handlePatientSelect(patient.id)}
                                        className="group"
                                      >
                                        <Check
                                          className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            selectedPatientId === patient.id
                                              ? 'opacity-100'
                                              : 'opacity-0'
                                          )}
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className="truncate">{patient.full_name || `${patient.first_name} ${patient.last_name}`}</span>
                                          <span className="text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground/70 truncate">
                                            {patient.mrn}
                                          </span>
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
                    {selectedPatient && selectedPatientId && !patientId && (
                      <p className="text-sm text-muted-foreground">
                        {selectedPatient.mrn}
                      </p>
                    )}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Treatment Details */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">Treatment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Treatment Type */}
              <FormField
                control={form.control}
                name="treatment_type_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treatment Type *</FormLabel>
                    <FormControl>
                      <Popover open={treatmentTypeOpen} onOpenChange={setTreatmentTypeOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={treatmentTypeOpen}
                            aria-label="Treatment Type"
                            className="w-full justify-between"
                            disabled={isCompleted}
                          >
                            {selectedTreatmentType
                              ? selectedTreatmentType.name
                              : 'Select treatment type...'}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search treatment types..." />
                            <CommandList>
                              <CommandEmpty>No treatment types found.</CommandEmpty>
                              <CommandGroup>
                                {treatmentTypes.map((type) => (
                                  <CommandItem
                                    key={type.id}
                                    value={type.name}
                                    onSelect={() => handleTreatmentTypeSelect(type)}
                                    className="group"
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4 shrink-0',
                                        selectedTreatmentType?.id === type.id
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      )}
                                    />
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate">{type.name}</span>
                                      <span className="text-xs text-muted-foreground group-data-[selected=true]:text-accent-foreground/70 truncate">
                                        {type.category} • {type.recommended_sessions} sessions recommended
                                      </span>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Treatment Type Info (SHA Claimable & Cost) */}
              {selectedTreatmentType && (
                <div className="flex flex-wrap gap-2 items-center">
                  {selectedTreatmentType.sha_claimable && (
                    <Badge variant="secondary" className="gap-1">
                      <Shield className="h-3 w-3" />
                      SHA Claimable
                    </Badge>
                  )}
                  <Badge variant="outline">
                    KES {Number((selectedTreatmentType as unknown as { cost_per_session?: string }).cost_per_session || selectedTreatmentType.unit_price).toLocaleString()}/session
                  </Badge>
                </div>
              )}

              {/* Referral Reason */}
              <FormField
                control={form.control}
                name="referral_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Reason</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Referral Reason">
                          <SelectValue placeholder="Select reason..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {referralReasons.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {referralReasonLabels[reason]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Clinical Indication */}
              <FormField
                control={form.control}
                name="clinical_indication"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinical Indication *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the clinical indication for physiotherapy..."
                        className="min-h-[100px]"
                        aria-label="Clinical Indication"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Diagnosis */}
              <FormField
                control={form.control}
                name="diagnosis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Diagnosis</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Primary diagnosis..."
                        aria-label="Diagnosis"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Session Planning */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">Session Planning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Total Sessions */}
                <FormField
                  control={form.control}
                  name="total_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Sessions *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={52}
                          aria-label="Total Sessions"
                          disabled={isCompleted}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Frequency */}
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 3x per week"
                          aria-label="Frequency"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Priority */}
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger aria-label="Priority">
                          <SelectValue placeholder="Select priority..." />
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

              {/* Treatment Goals */}
              <FormField
                control={form.control}
                name="treatment_goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Treatment Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Expected outcomes and goals..."
                        className="min-h-[80px]"
                        aria-label="Treatment Goals"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Clinical Considerations */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">Clinical Considerations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Relevant History */}
              <FormField
                control={form.control}
                name="relevant_history"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Relevant History</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Relevant medical history..."
                        className="min-h-[80px]"
                        aria-label="Relevant History"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Precautions */}
              <FormField
                control={form.control}
                name="precautions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precautions</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any precautions to consider..."
                        className="min-h-[80px]"
                        aria-label="Precautions"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Contraindications */}
              <FormField
                control={form.control}
                name="contraindications"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraindications</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any contraindications..."
                        className="min-h-[80px]"
                        aria-label="Contraindications"
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
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? (
                <>
                  <LoadingSpinner className="mr-2 h-4 w-4" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : isEditMode ? (
                'Update Order'
              ) : (
                'Create Order'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

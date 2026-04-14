/**
 * Counselling Referral Form
 * Form for creating and editing counselling referrals
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Heart,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCounsellingTypes,
  useCreateCounsellingReferral,
  useUpdateCounsellingReferral,
} from '@/lib/hooks/use-counselling';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import {
  COUNSELLING_CATEGORY_LABELS,
  MODALITY_LABELS,
  RISK_LEVEL_CONFIG,
  type SessionModality,
  type RiskLevel,
} from '@/lib/types/counselling';

// =============================================================================
// Types & Validation
// =============================================================================

const priorities = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;

const priorityLabels: Record<string, string> = {
  ROUTINE: 'Routine',
  URGENT: 'Urgent',
  EMERGENCY: 'Emergency',
};

const modalities: SessionModality[] = ['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP'];
const riskLevels: RiskLevel[] = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];

const referralSchema = z.object({
  patient_id: z.number({ required_error: 'Patient is required' }).min(1, 'Patient is required'),
  counselling_type_id: z.number({ required_error: 'Counselling type is required' }).min(1, 'Counselling type is required'),
  presenting_concern: z
    .string({ required_error: 'Presenting concern is required' })
    .min(10, 'Presenting concern must be at least 10 characters'),
  background_history: z.string().optional(),
  risk_assessment: z.string().optional(),
  risk_level: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).default('LOW'),
  priority: z.enum(priorities).default('ROUTINE'),
  recommended_sessions: z.number().min(1).max(52).default(6),
  preferred_modality: z.enum(['IN_PERSON', 'VIDEO', 'PHONE', 'GROUP']).optional(),
  special_considerations: z.string().optional(),
  encounter_id: z.number().optional(),
});

type ReferralFormData = z.infer<typeof referralSchema>;

interface CounsellingReferralFormProps {
  patientId?: number;
  encounterId?: number;
  referral?: {
    id: number;
    patient_id: number;
    counselling_type_id: number;
    presenting_concern: string;
    background_history?: string;
    risk_assessment?: string;
    risk_level: string;
    priority: string;
    recommended_sessions: number;
    preferred_modality?: string;
    special_considerations?: string;
    status: string;
  };
}

export function CounsellingReferralForm({
  patientId,
  encounterId,
  referral,
}: CounsellingReferralFormProps) {
  const router = useRouter();
  const isEditMode = !!referral;

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(
    patientId || referral?.patient_id
  );

  // Counselling type selection state
  const [typeOpen, setTypeOpen] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | undefined>(
    referral?.counselling_type_id
  );

  // Form state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Data fetching
  const { data: typesData, isLoading: typesLoading } = useCounsellingTypes({ is_active: true });
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: patientSearch || undefined,
  });
  const { data: selectedPatient, isLoading: patientLoading } = usePatient(selectedPatientId!);

  const createMutation = useCreateCounsellingReferral();
  const updateMutation = useUpdateCounsellingReferral();

  const counsellingTypes = useMemo(() => typesData?.results || [], [typesData?.results]);
  const patients = patientsData?.results || [];
  const selectedType = counsellingTypes.find(t => t.id === selectedTypeId);

  // Form setup
  const form = useForm<ReferralFormData>({
    resolver: zodResolver(referralSchema),
    defaultValues: {
      patient_id: patientId || referral?.patient_id || 0,
      counselling_type_id: referral?.counselling_type_id || 0,
      presenting_concern: referral?.presenting_concern || '',
      background_history: referral?.background_history || '',
      risk_assessment: referral?.risk_assessment || '',
      risk_level: (referral?.risk_level as RiskLevel) || 'LOW',
      priority: (referral?.priority as typeof priorities[number]) || 'ROUTINE',
      recommended_sessions: referral?.recommended_sessions || 6,
      preferred_modality: referral?.preferred_modality as SessionModality || undefined,
      special_considerations: referral?.special_considerations || '',
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
    form.setValue('counselling_type_id', id);
    setTypeOpen(false);

    // Auto-populate recommended sessions from type
    const type = counsellingTypes.find(t => t.id === id);
    if (type && !isEditMode) {
      form.setValue('recommended_sessions', type.recommended_sessions);
    }
  }, [form, counsellingTypes, isEditMode]);

  // Handle form submission
  const handleSubmit = async (data: ReferralFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const payload = {
        patient_id: data.patient_id,
        encounter_id: data.encounter_id,
        counselling_type_id: data.counselling_type_id,
        presenting_concern: data.presenting_concern,
        background_history: data.background_history,
        risk_assessment: data.risk_assessment,
        risk_level: data.risk_level,
        priority: data.priority,
        recommended_sessions: data.recommended_sessions,
        preferred_modality: data.preferred_modality,
        special_considerations: data.special_considerations,
      };

      if (isEditMode && referral) {
        await updateMutation.mutateAsync({
          id: referral.id,
          data: payload,
        });
        setSubmitSuccess(true);
        router.push(`/allied-health/counselling/referrals/${referral.id}`);
      } else {
        const result = await createMutation.mutateAsync(payload as never);
        setSubmitSuccess(true);
        router.push(`/allied-health/counselling/referrals/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to submit referral:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit referral');
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
            {isEditMode ? 'Referral updated successfully!' : 'Referral created successfully!'}
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

          {/* Counselling Type */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Heart className="h-4 w-4 sm:h-5 sm:w-5" />
                Counselling Type
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="counselling_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
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
                                {counsellingTypes.map((type) => (
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
                                      <p className="text-sm text-muted-foreground">
                                        {COUNSELLING_CATEGORY_LABELS[type.category] || type.category}
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
                name="presenting_concern"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Presenting Concern *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the patient's presenting concern and reason for counselling referral..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="background_history"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background History</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Relevant background and history..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Risk Assessment */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                Risk Assessment
                <HelpPopover content="Assess the patient's current risk level for safety planning." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="risk_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risk Level</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select risk level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {riskLevels.map((level) => (
                          <SelectItem key={level} value={level}>
                            {RISK_LEVEL_CONFIG[level].label}
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
                name="risk_assessment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Risk Assessment Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Document risk assessment findings, including any safety concerns..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Session Details */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">
                Session Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="recommended_sessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recommended Sessions</FormLabel>
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
                  name="preferred_modality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Modality</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select modality" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {modalities.map((modality) => (
                            <SelectItem key={modality} value={modality}>
                              {MODALITY_LABELS[modality]}
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
                name="special_considerations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Considerations</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Any special considerations for counselling sessions..."
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
              {isEditMode ? 'Update Referral' : 'Create Referral'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

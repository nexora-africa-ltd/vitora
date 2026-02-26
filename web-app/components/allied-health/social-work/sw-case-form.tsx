/**
 * Social Work Case Form
 * Form for creating and editing social work cases
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCreateSWCase,
  useUpdateSWCase,
} from '@/lib/hooks/use-social-work';
import { usePatients, usePatient } from '@/lib/hooks/use-patients';
import {
  REFERRAL_REASON_LABELS,
  URGENCY_CONFIG,
  SENSITIVE_REASONS,
  type SWReferralReason,
  type CaseUrgency,
} from '@/lib/types/social-work';

// =============================================================================
// Types & Validation
// =============================================================================

const referralReasons: SWReferralReason[] = [
  'GBV',
  'CHILD_PROTECTION',
  'CHILD_ABUSE',
  'ELDER_ABUSE',
  'HOUSING',
  'FINANCIAL',
  'SUBSTANCE_ABUSE',
  'MENTAL_HEALTH',
  'FAMILY_SUPPORT',
  'CHRONIC_ILLNESS',
  'DISABILITY',
  'END_OF_LIFE',
  'REFUGEE',
  'TRAFFICKING',
  'HOMELESSNESS',
  'FOOD_INSECURITY',
  'LEGAL',
  'EMPLOYMENT',
  'EDUCATION',
  'OTHER',
];

const urgencyLevels: CaseUrgency[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const caseSchema = z.object({
  patient_id: z.number({ required_error: 'Patient is required' }).min(1, 'Patient is required'),
  referral_reason: z.string().min(1, 'Referral reason is required'),
  presenting_issues: z
    .string({ required_error: 'Presenting issues are required' })
    .min(10, 'Presenting issues must be at least 10 characters'),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  safety_concerns: z.string().optional(),
  immediate_needs: z.string().optional(),
  support_network: z.string().optional(),
  goals: z.string().optional(),
  intervention_plan: z.string().optional(),
  external_referrals: z.string().optional(),
  encounter_id: z.number().optional(),
  referral_id: z.number().optional(),
});

type CaseFormData = z.infer<typeof caseSchema>;

interface SWCaseFormProps {
  patientId?: number;
  encounterId?: number;
  referralId?: number;
  swCase?: {
    id: number;
    patient_id: number;
    referral_reason: string;
    presenting_issues: string;
    urgency: string;
    safety_concerns?: string;
    immediate_needs?: string;
    support_network?: string;
    goals?: string;
    intervention_plan?: string;
    external_referrals?: string;
    status: string;
  };
}

export function SWCaseForm({
  patientId,
  encounterId,
  referralId,
  swCase,
}: SWCaseFormProps) {
  const router = useRouter();
  const isEditMode = !!swCase;

  // Patient search state
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | undefined>(
    patientId || swCase?.patient_id
  );

  // Form state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Data fetching
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: patientSearch || undefined,
  });
  const { data: selectedPatient, isLoading: patientLoading } = usePatient(selectedPatientId!);

  const createMutation = useCreateSWCase();
  const updateMutation = useUpdateSWCase();

  const patients = patientsData?.results || [];

  // Form setup
  const form = useForm<CaseFormData>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      patient_id: patientId || swCase?.patient_id || 0,
      referral_reason: swCase?.referral_reason || '',
      presenting_issues: swCase?.presenting_issues || '',
      urgency: (swCase?.urgency as CaseUrgency) || 'MEDIUM',
      safety_concerns: swCase?.safety_concerns || '',
      immediate_needs: swCase?.immediate_needs || '',
      support_network: swCase?.support_network || '',
      goals: swCase?.goals || '',
      intervention_plan: swCase?.intervention_plan || '',
      external_referrals: swCase?.external_referrals || '',
      encounter_id: encounterId,
      referral_id: referralId,
    },
  });

  // Watch referral reason for sensitive warning
  const watchReason = form.watch('referral_reason');
  const isSensitiveReason = SENSITIVE_REASONS.includes(watchReason as SWReferralReason);

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

  // Handle form submission
  const handleSubmit = async (data: CaseFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      const payload = {
        patient_id: data.patient_id,
        encounter_id: data.encounter_id,
        referral_id: data.referral_id,
        referral_reason: data.referral_reason,
        presenting_issues: data.presenting_issues,
        urgency: data.urgency,
        safety_concerns: data.safety_concerns,
        immediate_needs: data.immediate_needs,
        support_network: data.support_network,
        goals: data.goals,
        intervention_plan: data.intervention_plan,
        external_referrals: data.external_referrals,
      };

      if (isEditMode && swCase) {
        await updateMutation.mutateAsync({
          id: swCase.id,
          data: payload,
        });
        setSubmitSuccess(true);
        router.push(`/allied-health/social-work/cases/${swCase.id}`);
      } else {
        const result = await createMutation.mutateAsync(payload as never);
        setSubmitSuccess(true);
        router.push(`/allied-health/social-work/cases/${result.id}`);
      }
    } catch (err) {
      console.error('Failed to submit case:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit case');
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
            {isEditMode ? 'Case updated successfully!' : 'Case created successfully!'}
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

      {/* Sensitive Case Warning */}
      {isSensitiveReason && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            This case involves a sensitive issue ({REFERRAL_REASON_LABELS[watchReason as SWReferralReason]}). 
            Access will be restricted to authorized staff only.
          </AlertDescription>
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

          {/* Case Details */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">
                Case Details
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
                              {SENSITIVE_REASONS.includes(reason) && (
                                <Shield className="inline h-3 w-3 mr-1 text-muted-foreground" />
                              )}
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
                  name="urgency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Urgency Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select urgency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {urgencyLevels.map((level) => (
                            <SelectItem key={level} value={level}>
                              {URGENCY_CONFIG[level].label}
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
                name="presenting_issues"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Presenting Issues *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the presenting issues and reasons for social work involvement..."
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

          {/* Safety & Immediate Needs */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
                Safety & Immediate Needs
                <HelpPopover content="Document any safety concerns and immediate needs that require urgent attention." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="safety_concerns"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Safety Concerns</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Document any safety concerns for the patient or others..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="immediate_needs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Immediate Needs</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List any immediate needs (housing, food, safety, etc.)..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Support & Planning */}
          <Card>
            <CardHeader className="py-3 sm:py-4">
              <CardTitle className="text-base sm:text-lg">
                Support & Planning
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="support_network"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Support Network</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the patient's existing support network (family, friends, community)..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Goals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Treatment goals and desired outcomes..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="intervention_plan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervention Plan</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Planned interventions and actions..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="external_referrals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>External Referrals</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Referrals to external agencies or services..."
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
              {isEditMode ? 'Update Case' : 'Create Case'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

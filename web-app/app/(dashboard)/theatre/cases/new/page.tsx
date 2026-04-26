'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search, Syringe } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { PatientSelector } from '@/components/encounters/patient-selector';
import { DiagnosisCodeInput, type DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { proceduresApi } from '@/lib/api/procedures';
import { theatreApi } from '@/lib/api/theatre';
import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/format';
import type { Patient } from '@/lib/types/patient';
import type { ProcedureCatalogEntry } from '@/lib/types/procedure';
import type { OperatingTheatreList } from '@/lib/types/theatre';

// ============================================================================
// Form schema
// ============================================================================
const bookingSchema = z.object({
  patient: z.number({ required_error: 'Patient is required' }),
  primary_procedure: z.number({ required_error: 'Procedure is required' }),
  theatre: z.number({ required_error: 'Theatre is required' }),
  scheduled_date: z.string().min(1, 'Date is required'),
  scheduled_start_time: z.string().min(1, 'Start time is required'),
  estimated_duration_minutes: z.coerce.number().min(5, 'Minimum 5 minutes').max(1440),
  priority: z.enum(['ELECTIVE', 'URGENT', 'EMERGENCY']).default('ELECTIVE'),
  asa_class: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI', '']).default(''),
  anesthesia_type: z
    .enum(['GENERAL', 'SPINAL', 'EPIDURAL', 'REGIONAL', 'LOCAL', 'SEDATION', 'COMBINED', ''])
    .default(''),
  laterality: z.enum(['LEFT', 'RIGHT', 'BILATERAL', 'NA']).default('NA'),
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  procedure_notes: z.string().default(''),
});

type BookingFormData = z.infer<typeof bookingSchema>;

// ============================================================================
// Page component
// ============================================================================
export default function NewSurgeryCasePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [theatres, setTheatres] = useState<OperatingTheatreList[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [procedureSearch, setProcedureSearch] = useState('');
  const [procedureOpen, setProcedureOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<ProcedureCatalogEntry | null>(null);
  const [diagnosisValue, setDiagnosisValue] = useState<DiagnosisCodeValue>({
    icd10Code: null,
    icd10Display: '',
    icd11Code: '',
    icd11Display: '',
  });
  const debouncedProcedureSearch = useDebounce(procedureSearch, 300);

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      priority: 'ELECTIVE',
      laterality: 'NA',
      estimated_duration_minutes: 60,
      asa_class: '',
      anesthesia_type: '',
      diagnosis: '',
      procedure_notes: '',
    },
    mode: 'onChange',
  });

  useEffect(() => {
    theatreApi.listTheatres().then(data => setTheatres(data.results)).catch(() => {});
  }, []);

  const selectedPatientId = form.watch('patient');
  const { isValid, errors } = form.formState;

  // Build list of missing required fields for user feedback
  const missingFields: string[] = [];
  if (!selectedPatientId) missingFields.push('Patient');
  if (!selectedProcedure) missingFields.push('Procedure');
  if (errors.diagnosis || !form.watch('diagnosis')) missingFields.push('Diagnosis');
  if (errors.theatre || !form.watch('theatre')) missingFields.push('Theatre');
  if (errors.scheduled_date || !form.watch('scheduled_date')) missingFields.push('Date');
  if (errors.scheduled_start_time || !form.watch('scheduled_start_time')) missingFields.push('Start Time');

  const canSubmit = isValid && !!selectedPatientId && !!selectedProcedure;

  const { data: procedureResults, isLoading: isLoadingProcedures } = useQuery({
    queryKey: ['theatre-booking-procedure-search', debouncedProcedureSearch],
    queryFn: () =>
      proceduresApi.listCatalog({
        category: 'SURGICAL',
        is_active: 'true',
        page_size: '10',
        ...(debouncedProcedureSearch ? { search: debouncedProcedureSearch } : {}),
      }),
    staleTime: 30000,
  });

  const procedures = useMemo(
    () => (procedureResults?.results || []) as ProcedureCatalogEntry[],
    [procedureResults]
  );

  const onSubmit = async (data: BookingFormData) => {
    try {
      setSubmitting(true);
      const created = await theatreApi.createCase({
        ...data,
        asa_class: data.asa_class || undefined,
        anesthesia_type: data.anesthesia_type || undefined,
      });
      toast({ title: 'Surgery booked', description: `Case ${created.case_number} created.` });
      router.push(`/theatre/cases/${created.case_number}`);
    } catch {
      toast({ title: 'Failed to book surgery', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Book Surgery"
        helpContent="Create a new surgery case. Fill in patient, procedure, theatre, and scheduling details."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Patient & Procedure */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Patient &amp; Procedure</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="patient"
                  render={({ field, fieldState }) => (
                  <FormItem>
                      <FormLabel>Patient <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <PatientSelector
                          value={field.value ?? null}
                          selectedPatient={selectedPatient}
                          onChange={(patientId, patient) => {
                            field.onChange(patientId ?? undefined);
                            setSelectedPatient(patient);
                          }}
                          error={fieldState.error?.message}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="primary_procedure"
                  render={({ field }) => (
                  <FormItem>
                      <FormLabel>Procedure <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <Popover open={procedureOpen} onOpenChange={setProcedureOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={procedureOpen}
                              className={cn(
                                'w-full justify-between overflow-hidden px-3 font-normal',
                                !selectedProcedure && 'text-muted-foreground'
                              )}
                            >
                              {selectedProcedure ? (
                                <span className="flex min-w-0 items-center gap-2 overflow-hidden text-left">
                                  <Syringe className="h-4 w-4 shrink-0 text-primary" />
                                  <span className="truncate">{selectedProcedure.name}</span>
                                </span>
                              ) : (
                                'Search and select a surgical procedure'
                              )}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search by procedure name or code..."
                                value={procedureSearch}
                                onValueChange={setProcedureSearch}
                              />
                              <CommandList>
                                {isLoadingProcedures ? (
                                  <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading procedures...
                                  </div>
                                ) : (
                                  <>
                                    <CommandEmpty>No surgical procedures found.</CommandEmpty>
                                    <CommandGroup heading={debouncedProcedureSearch ? 'Search Results' : 'Surgical Procedures'}>
                                      {procedures.map((procedure) => (
                                        <CommandItem
                                          key={procedure.id}
                                          value={`${procedure.code} ${procedure.name}`}
                                          onSelect={() => {
                                            field.onChange(procedure.id);
                                            setSelectedProcedure(procedure);
                                            setProcedureSearch('');
                                            setProcedureOpen(false);
                                            if (!form.getValues('estimated_duration_minutes')) {
                                              form.setValue(
                                                'estimated_duration_minutes',
                                                procedure.typical_duration_minutes,
                                                { shouldDirty: true }
                                              );
                                            }
                                          }}
                                          className="items-start gap-3 py-3"
                                        >
                                          <Check
                                            className={cn(
                                              'mt-0.5 h-4 w-4 shrink-0',
                                              field.value === procedure.id ? 'opacity-100' : 'opacity-0'
                                            )}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-medium">{procedure.name}</span>
                                              <span className="font-mono text-xs text-muted-foreground">
                                                {procedure.code}
                                              </span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                                              <Badge variant="outline" className="text-[10px]">
                                                {procedure.category}
                                              </Badge>
                                              <span>{procedure.typical_duration_minutes} min</span>
                                              {procedure.base_fee != null && (
                                                <span>{formatCurrency(procedure.base_fee)}</span>
                                              )}
                                              {procedure.consent_required && (
                                                <Badge variant="outline" className="text-[10px] text-amber-700">
                                                  Consent required
                                                </Badge>
                                              )}
                                            </div>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                    </FormControl>
                      {selectedProcedure && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{selectedProcedure.category}</Badge>
                            <span className="text-muted-foreground">
                              {selectedProcedure.typical_duration_minutes} min typical duration
                            </span>
                            {selectedProcedure.consent_required && (
                              <Badge variant="outline" className="text-[10px] text-amber-700">
                                Written consent required
                              </Badge>
                            )}
                          </div>
                          {selectedProcedure.description && (
                            <p className="mt-2 text-xs text-muted-foreground">{selectedProcedure.description}</p>
                          )}
                        </div>
                      )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diagnosis"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormControl>
                      <DiagnosisCodeInput
                        label="Pre-operative Diagnosis *"
                        value={diagnosisValue}
                        onChange={(val) => {
                          setDiagnosisValue(val);
                          // Serialize to string for the form field
                          const display =
                            val.icd11Display || val.icd10Display || val.snomedDisplay || '';
                          field.onChange(display);
                        }}
                        placeholder="Search ICD-10, ICD-11, or SNOMED CT codes..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Scheduling */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scheduling</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="theatre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Theatre <span className="text-destructive">*</span></FormLabel>
                    <Select
                      value={field.value?.toString() ?? ''}
                      onValueChange={v => field.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select theatre" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {theatres.map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name} ({t.theatre_type})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduled_start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimated_duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" min={5} max={1440} {...field} />
                    </FormControl>
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
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ELECTIVE">Elective</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                        <SelectItem value="EMERGENCY">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="laterality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Laterality</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="NA">N/A</SelectItem>
                        <SelectItem value="LEFT">Left</SelectItem>
                        <SelectItem value="RIGHT">Right</SelectItem>
                        <SelectItem value="BILATERAL">Bilateral</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Clinical */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clinical Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="asa_class"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ASA Class</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Not specified</SelectItem>
                        <SelectItem value="I">I - Healthy</SelectItem>
                        <SelectItem value="II">II - Mild systemic</SelectItem>
                        <SelectItem value="III">III - Severe systemic</SelectItem>
                        <SelectItem value="IV">IV - Life-threatening</SelectItem>
                        <SelectItem value="V">V - Moribund</SelectItem>
                        <SelectItem value="VI">VI - Brain-dead</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="anesthesia_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anesthesia Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Not specified</SelectItem>
                        <SelectItem value="GENERAL">General</SelectItem>
                        <SelectItem value="SPINAL">Spinal</SelectItem>
                        <SelectItem value="EPIDURAL">Epidural</SelectItem>
                        <SelectItem value="REGIONAL">Regional</SelectItem>
                        <SelectItem value="LOCAL">Local</SelectItem>
                        <SelectItem value="SEDATION">Sedation</SelectItem>
                        <SelectItem value="COMBINED">Combined</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="procedure_notes"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Procedure Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional clinical notes..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Missing fields message */}
          {missingFields.length > 0 && (
            <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <AlertDescription className="text-sm text-amber-800 dark:text-amber-200">
                Please fill in the required fields: {missingFields.join(', ')}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Book Surgery
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

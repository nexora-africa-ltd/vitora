/**
 * New Clinic Enrollment Page
 *
 * Create a chronic care enrollment for a patient in a specific clinic.
 * Route: /clinics/enrollments/new
 */
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Save, Search, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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

import { useClinics, useCreateEnrollment } from '@/lib/hooks/use-clinics';
import { usePatients } from '@/lib/hooks/use-patients';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { toast } from '@/lib/hooks/use-toast';

const formSchema = z.object({
  clinic_id: z.number({ required_error: 'Please select a clinic' }),
  patient_id: z.number({ required_error: 'Please select a patient' }),
  next_appointment_date: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewEnrollmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialClinicId = useMemo(() => {
    const fromQuery = searchParams.get('clinic');
    const id = fromQuery ? Number(fromQuery) : NaN;
    return Number.isFinite(id) ? id : undefined;
  }, [searchParams]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clinic_id: initialClinicId,
      patient_id: undefined,
      next_appointment_date: '',
      notes: '',
    },
  });

  const { data: clinicsData, isLoading: clinicsLoading, refetch: refetchClinics } = useClinics({ status: 'ACTIVE' });
  const clinics = clinicsData?.results ?? [];

  // Patient search
  const [patientSearch, setPatientSearch] = useState('');
  const debouncedSearch = useDebounce(patientSearch, 300);
  const shouldSearchPatients = debouncedSearch.trim().length >= 2;

  const { data: patientsData, isLoading: patientsLoading } = usePatients(
    shouldSearchPatients ? { search: debouncedSearch } : undefined
  );

  const patients = patientsData?.results ?? [];

  const { mutateAsync: createEnrollment, isPending: creating } = useCreateEnrollment();

  const onSubmit = async (data: FormData) => {
    try {
      await createEnrollment({
        clinic_id: data.clinic_id,
        patient_id: data.patient_id,
        next_appointment_date: data.next_appointment_date || undefined,
        notes: data.notes || undefined,
      });

      toast({
        title: 'Enrollment Created',
        description: 'Patient has been enrolled successfully.',
      });

      router.push('/clinics/enrollments');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.detail || 'Failed to create enrollment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clinics/enrollments">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">New Enrollment</h1>
          <p className="text-muted-foreground">Enroll a patient into a chronic care program</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchClinics()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enrollment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="clinic_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clinic</FormLabel>
                    {clinicsLoading ? (
                      <Skeleton className="h-10" />
                    ) : (
                      <Select
                        onValueChange={(v) => field.onChange(Number(v))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select clinic" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clinics.map((c) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient</FormLabel>
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search by name or MRN..."
                          value={patientSearch}
                          onChange={(e) => setPatientSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>

                      {patientsLoading ? (
                        <Skeleton className="h-24" />
                      ) : shouldSearchPatients ? (
                        <div className="rounded-md border">
                          {patients.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground">No patients found</div>
                          ) : (
                            <div className="divide-y">
                              {patients.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className="w-full text-left p-3 hover:bg-muted"
                                  onClick={() => field.onChange(p.id)}
                                >
                                  <div className="font-medium">{p.first_name} {p.last_name}</div>
                                  <div className="text-xs text-muted-foreground">{p.mrn}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Type at least 2 characters to search.</div>
                      )}

                      {field.value ? (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Selected patient ID: </span>
                          <span className="font-mono">{field.value}</span>
                        </div>
                      ) : null}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="next_appointment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next Appointment Date (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional notes..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push('/clinics/enrollments')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  <Save className="h-4 w-4 mr-2" />
                  {creating ? 'Creating...' : 'Create Enrollment'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

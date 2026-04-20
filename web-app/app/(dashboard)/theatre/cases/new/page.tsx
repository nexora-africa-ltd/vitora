'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { theatreApi } from '@/lib/api/theatre';
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
  diagnosis: z.string().default(''),
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
  });

  useEffect(() => {
    theatreApi.listTheatres().then(data => setTheatres(data.results)).catch(() => {});
  }, []);

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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Patient ID</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter patient ID"
                        {...field}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="primary_procedure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Procedure ID</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter procedure catalog ID"
                        {...field}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="diagnosis"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Diagnosis</FormLabel>
                    <FormControl>
                      <Input placeholder="Pre-operative diagnosis" {...field} />
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
                    <FormLabel>Theatre</FormLabel>
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
                    <FormLabel>Date</FormLabel>
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
                    <FormLabel>Start Time</FormLabel>
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
                    <FormLabel>Duration (min)</FormLabel>
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

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Book Surgery
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

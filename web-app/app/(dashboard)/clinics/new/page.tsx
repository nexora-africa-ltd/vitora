/**
 * New Clinic Page
 *
 * Form for creating a new clinic.
 *
 * Route: /clinics/new
 */
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { ArrowLeft, Building2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
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
import { useCreateClinic } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicType } from '@/lib/types/clinic';

const CLINIC_TYPES: { value: ClinicType; label: string }[] = [
  { value: 'GENERAL_OPD', label: 'General OPD' },
  { value: 'FILTER_CLINIC', label: 'Filter/Screening Clinic' },
  { value: 'ANC', label: 'Antenatal Clinic' },
  { value: 'PNC', label: 'Postnatal Clinic' },
  { value: 'FP', label: 'Family Planning Clinic' },
  { value: 'CWC', label: 'Child Welfare Clinic' },
  { value: 'IMMUNIZATION', label: 'Immunization Clinic' },
  { value: 'NUTRITION', label: 'Nutrition Clinic' },
  { value: 'DENTAL', label: 'Dental Clinic' },
  { value: 'EYE', label: 'Eye/Ophthalmology Clinic' },
  { value: 'ENT', label: 'ENT Clinic' },
  { value: 'SURGICAL', label: 'Surgical Outpatient Clinic' },
  { value: 'ORTHO', label: 'Orthopedic Clinic' },
  { value: 'PHYSIO', label: 'Physiotherapy Clinic' },
  { value: 'DERM', label: 'Dermatology Clinic' },
  { value: 'CCC', label: 'Comprehensive Care Clinic (HIV)' },
  { value: 'TB', label: 'TB Clinic' },
  { value: 'DIABETIC', label: 'Diabetic Clinic' },
  { value: 'HYPERTENSION', label: 'Hypertension Clinic' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health Clinic' },
  { value: 'ONCOLOGY', label: 'Oncology Clinic' },
  { value: 'DIALYSIS', label: 'Dialysis Unit' },
  { value: 'PROCEDURE', label: 'Procedure Room' },
  { value: 'DRESSING', label: 'Dressing/Wound Care' },
  { value: 'INJECTION', label: 'Injection Room' },
  { value: 'OTHER', label: 'Other Clinic' },
];

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  clinic_type: z.string().min(1, 'Please select a clinic type'),
  code: z.string().min(2, 'Code must be at least 2 characters').regex(/^[A-Z0-9-]+$/, 'Code must be uppercase letters, numbers, and dashes only'),
  description: z.string().optional(),
  location: z.string().optional(),
  floor: z.string().optional(),
  capacity: z.number().min(1, 'Capacity must be at least 1').default(1),
  requires_appointment: z.boolean().default(false),
  requires_referral: z.boolean().default(false),
  accepts_walk_ins: z.boolean().default(true),
  triage_required: z.boolean().default(true),
  is_sensitive: z.boolean().default(false),
  default_service_fee: z.string().optional(),
  sha_service_code: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function NewClinicPage() {
  const router = useRouter();
  const { mutateAsync: createClinic, isPending } = useCreateClinic();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      clinic_type: '',
      code: '',
      description: '',
      location: '',
      floor: '',
      capacity: 1,
      requires_appointment: false,
      requires_referral: false,
      accepts_walk_ins: true,
      triage_required: true,
      is_sensitive: false,
      default_service_fee: '',
      sha_service_code: '',
    },
  });

  const handleSubmit = useCallback(
    async (data: FormData) => {
      try {
        const clinic = await createClinic({
          ...data,
          clinic_type: data.clinic_type as ClinicType,
          default_service_fee: data.default_service_fee || undefined,
        });
        toast({
          title: 'Clinic Created',
          description: `${data.name} has been created successfully.`,
        });
        router.push(`/clinics/${clinic.id}`);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.response?.data?.detail || 'Failed to create clinic.',
          variant: 'destructive',
        });
      }
    },
    [createClinic, router]
  );

  // Auto-generate code from name
  const generateCode = (name: string) => {
    const words = name.toUpperCase().split(' ');
    let code = words.map((w) => w.charAt(0)).join('');
    if (code.length < 3) {
      code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    }
    return `${code}-001`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/clinics">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">New Clinic</h1>
          <p className="text-muted-foreground">Create a new clinic or service delivery point</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Enter the clinic details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Eye Clinic"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            // Auto-generate code if empty
                            if (!form.getValues('code')) {
                              form.setValue('code', generateCode(e.target.value));
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., EYE-001" {...field} />
                      </FormControl>
                      <FormDescription>Unique identifier for the clinic</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clinic_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CLINIC_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
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
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormDescription>Number of patients seen simultaneously</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the services provided..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
              <CardDescription>Physical location of the clinic</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Block A, Room 12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="floor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Ground Floor" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Operational Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Operational Settings</CardTitle>
              <CardDescription>Configure how the clinic operates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="requires_appointment"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Requires Appointment</FormLabel>
                        <FormDescription>
                          Patients need prior appointment
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accepts_walk_ins"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Accepts Walk-ins</FormLabel>
                        <FormDescription>
                          Walk-in patients accepted
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="requires_referral"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Requires Referral</FormLabel>
                        <FormDescription>
                          Patients need referral from another clinic
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="triage_required"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Triage Required</FormLabel>
                        <FormDescription>
                          Patients must go through triage first
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="is_sensitive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Sensitive Clinic</FormLabel>
                      <FormDescription>
                        Handles sensitive data (HIV, GBV, Mental Health) - restricted access
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Billing & Integration */}
          <Card>
            <CardHeader>
              <CardTitle>Billing & Integration</CardTitle>
              <CardDescription>Billing and SHA integration settings</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="default_service_fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Consultation Fee (KES)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sha_service_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SHA Service Code</FormLabel>
                    <FormControl>
                      <Input placeholder="SHA tariff code" {...field} />
                    </FormControl>
                    <FormDescription>For SHA claims integration</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex items-center justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/clinics">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'Creating...' : 'Create Clinic'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

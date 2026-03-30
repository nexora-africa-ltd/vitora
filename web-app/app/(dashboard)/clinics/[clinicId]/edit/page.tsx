/**
 * Edit Clinic Page
 *
 * Form for editing an existing clinic's configuration.
 *
 * Route: /clinics/[clinicId]/edit
 */
'use client';

import { useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Save, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
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
import { useClinic, useUpdateClinic } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ClinicType, ClinicStatus } from '@/lib/types/clinic';

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

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'TEMPORARILY_CLOSED', label: 'Temporarily Closed' },
];

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  clinic_type: z.string().min(1, 'Please select a clinic type'),
  code: z.string().min(2, 'Code must be at least 2 characters').regex(/^[A-Z0-9-]+$/, 'Code must be uppercase letters, numbers, and dashes only'),
  description: z.string().optional(),
  location: z.string().optional(),
  floor: z.string().optional(),
  capacity: z.number().min(1, 'Capacity must be at least 1').default(1),
  status: z.string().default('ACTIVE'),
  requires_appointment: z.boolean().default(false),
  requires_referral: z.boolean().default(false),
  accepts_walk_ins: z.boolean().default(true),
  triage_required: z.boolean().default(true),
  is_sensitive: z.boolean().default(false),
  default_service_fee: z.string().optional(),
  sha_service_code: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function EditClinicPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);
  const router = useRouter();
  const { data: clinic, isLoading } = useClinic(clinicId);
  const { mutateAsync: updateClinic, isPending } = useUpdateClinic();

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
      status: 'ACTIVE',
      requires_appointment: false,
      requires_referral: false,
      accepts_walk_ins: true,
      triage_required: true,
      is_sensitive: false,
      default_service_fee: '',
      sha_service_code: '',
    },
  });

  // Populate form when clinic data loads
  useEffect(() => {
    if (clinic) {
      form.reset({
        name: clinic.name ?? '',
        clinic_type: clinic.clinic_type ?? '',
        code: clinic.code ?? '',
        description: clinic.description ?? '',
        location: clinic.location ?? '',
        floor: clinic.floor ?? '',
        capacity: clinic.capacity ?? 1,
        status: clinic.status ?? 'ACTIVE',
        requires_appointment: clinic.requires_appointment ?? false,
        requires_referral: clinic.requires_referral ?? false,
        accepts_walk_ins: clinic.accepts_walk_ins ?? true,
        triage_required: clinic.triage_required ?? true,
        is_sensitive: clinic.is_sensitive ?? false,
        default_service_fee: clinic.default_service_fee ?? '',
        sha_service_code: clinic.sha_service_code ?? '',
      });
    }
  }, [clinic, form]);

  const handleSubmit = useCallback(
    async (data: FormData) => {
      try {
        await updateClinic({
          id: clinicId,
          data: {
            ...data,
            clinic_type: data.clinic_type as ClinicType,
            status: data.status as ClinicStatus,
            default_service_fee: data.default_service_fee || undefined,
          },
        });
        toast({
          title: 'Clinic Updated',
          description: `${data.name} has been updated successfully.`,
        });
        router.push(`/clinics/${clinicId}/settings`);
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error?.response?.data?.detail || 'Failed to update clinic.',
          variant: 'destructive',
        });
      }
    },
    [updateClinic, clinicId, router]
  );

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Clinic not found.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${clinic.name}`}
        helpContent="Update clinic configuration including name, type, capacity, operational settings, and billing."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 sm:space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Basic Information</CardTitle>
                <HelpPopover content="Core clinic identity fields. Changing the clinic type may affect procedure assignments and patient routing." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Clinic Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Eye Clinic" {...field} />
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

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
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
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Location</CardTitle>
                <HelpPopover content="Physical location of the clinic within the facility." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 grid gap-4 sm:grid-cols-2">
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
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Operational Settings</CardTitle>
                <HelpPopover content="Configure patient flow requirements: appointments, walk-ins, referrals, and triage." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="requires_appointment"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 sm:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Requires Appointment</FormLabel>
                        <FormDescription className="text-xs sm:text-sm">
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 sm:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Accepts Walk-ins</FormLabel>
                        <FormDescription className="text-xs sm:text-sm">
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 sm:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Requires Referral</FormLabel>
                        <FormDescription className="text-xs sm:text-sm">
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
                    <FormItem className="flex items-center justify-between rounded-lg border p-3 sm:p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">Triage Required</FormLabel>
                        <FormDescription className="text-xs sm:text-sm">
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
                  <FormItem className="flex items-center justify-between rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 sm:p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-sm">Sensitive Clinic</FormLabel>
                      <FormDescription className="text-xs sm:text-sm">
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
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Billing & Integration</CardTitle>
                <HelpPopover content="Set default consultation fees and SHA service codes for claims integration." />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 grid gap-4 sm:grid-cols-2">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
              <Link href={`/clinics/${clinicId}/settings`}>Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

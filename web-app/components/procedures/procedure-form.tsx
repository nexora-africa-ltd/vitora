'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { proceduresApi } from '@/lib/api/procedures';
import { getApiErrorMessage } from '@/lib/api/client';
import { useClinics } from '@/lib/hooks/use-clinics';
import { toast } from '@/lib/hooks/use-toast';
import type { ProcedureCatalogDetail } from '@/lib/types/procedure';

const PROCEDURE_CLINIC_TYPES = ['PROCEDURE', 'DRESSING', 'INJECTION', 'SURGICAL', 'OT'];

const CATEGORIES = [
  { value: 'MINOR', label: 'Minor Procedure' },
  { value: 'DIAGNOSTIC', label: 'Diagnostic' },
  { value: 'THERAPEUTIC', label: 'Therapeutic' },
  { value: 'PREVENTIVE', label: 'Preventive' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'OPHTHALMIC', label: 'Ophthalmic' },
  { value: 'ENT', label: 'ENT' },
  { value: 'OBSTETRIC', label: 'Obstetric' },
  { value: 'WOUND_CARE', label: 'Wound Care' },
  { value: 'INJECTION', label: 'Injection/Infusion' },
  { value: 'OTHER', label: 'Other' },
];

const BODY_SYSTEMS = [
  { value: 'INTEGUMENTARY', label: 'Integumentary (Skin)' },
  { value: 'MUSCULOSKELETAL', label: 'Musculoskeletal' },
  { value: 'RESPIRATORY', label: 'Respiratory' },
  { value: 'CARDIOVASCULAR', label: 'Cardiovascular' },
  { value: 'DIGESTIVE', label: 'Digestive' },
  { value: 'URINARY', label: 'Urinary' },
  { value: 'REPRODUCTIVE', label: 'Reproductive' },
  { value: 'NERVOUS', label: 'Nervous' },
  { value: 'ENDOCRINE', label: 'Endocrine' },
  { value: 'LYMPHATIC', label: 'Lymphatic' },
  { value: 'SENSORY', label: 'Sensory (Eye/Ear)' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'GENERAL', label: 'General/Multiple' },
];

const RISK_LEVELS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

const procedureFormSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  category: z.string().min(1, 'Category is required'),
  body_system: z.string().min(1, 'Body system is required'),
  risk_level: z.string().min(1, 'Risk level is required'),
  // Coding
  ichi_code: z.string().optional().default(''),
  cpt_code: z.string().optional().default(''),
  icd10_pcs_code: z.string().optional().default(''),
  // Consent
  consent_required: z.boolean().default(true),
  guardian_consent_required: z.boolean().default(false),
  witness_required: z.boolean().default(false),
  consent_template: z.string().optional().default(''),
  // Clinical
  requires_anesthesia: z.boolean().default(false),
  anesthesia_type: z.string().optional().default(''),
  typical_duration_minutes: z.coerce.number().min(1, 'Must be at least 1').default(30),
  requires_fasting: z.boolean().default(false),
  pre_procedure_instructions: z.string().optional().default(''),
  post_procedure_instructions: z.string().optional().default(''),
  // Staffing
  required_qualifications: z.string().optional().default(''),
  minimum_staff_count: z.coerce.number().min(1).default(1),
  // Billing
  base_fee: z.coerce.number().min(0).nullable().optional(),
  sha_tariff_code: z.string().optional().default(''),
  sha_package_code: z.string().optional().default(''),
  // Follow-up
  requires_follow_up: z.boolean().default(false),
  default_follow_up_days: z.coerce.number().min(1).default(7),
  // Clinic Assignment
  default_clinics: z.array(z.number()).default([]),
  // Status
  is_active: z.boolean().default(true),
});

type ProcedureFormValues = z.infer<typeof procedureFormSchema>;

interface ProcedureFormProps {
  /** Existing procedure for edit mode; omit for create mode */
  procedure?: ProcedureCatalogDetail;
}

export function ProcedureForm({ procedure }: ProcedureFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEdit = !!procedure;

  const form = useForm<ProcedureFormValues>({
    resolver: zodResolver(procedureFormSchema),
    defaultValues: procedure
      ? {
          code: procedure.code,
          name: procedure.name,
          description: procedure.description || '',
          category: procedure.category,
          body_system: procedure.body_system,
          risk_level: procedure.risk_level,
          ichi_code: procedure.ichi_code || '',
          cpt_code: procedure.cpt_code || '',
          icd10_pcs_code: procedure.icd10_pcs_code || '',
          consent_required: procedure.consent_required,
          guardian_consent_required: procedure.guardian_consent_required,
          witness_required: procedure.witness_required,
          consent_template: procedure.consent_template || '',
          requires_anesthesia: procedure.requires_anesthesia,
          anesthesia_type: procedure.anesthesia_type || '',
          typical_duration_minutes: procedure.typical_duration_minutes,
          requires_fasting: procedure.requires_fasting,
          pre_procedure_instructions: procedure.pre_procedure_instructions || '',
          post_procedure_instructions: procedure.post_procedure_instructions || '',
          required_qualifications: procedure.required_qualifications || '',
          minimum_staff_count: procedure.minimum_staff_count,
          base_fee: procedure.base_fee ?? undefined,
          sha_tariff_code: procedure.sha_tariff_code || '',
          sha_package_code: procedure.sha_package_code || '',
          requires_follow_up: procedure.requires_follow_up,
          default_follow_up_days: procedure.default_follow_up_days,
          default_clinics: procedure.default_clinics ?? [],
          is_active: procedure.is_active,
        }
      : {
          code: '',
          name: '',
          description: '',
          category: 'MINOR',
          body_system: 'GENERAL',
          risk_level: 'LOW',
          ichi_code: '',
          cpt_code: '',
          icd10_pcs_code: '',
          consent_required: true,
          guardian_consent_required: false,
          witness_required: false,
          consent_template: '',
          requires_anesthesia: false,
          anesthesia_type: '',
          typical_duration_minutes: 30,
          requires_fasting: false,
          pre_procedure_instructions: '',
          post_procedure_instructions: '',
          required_qualifications: '',
          minimum_staff_count: 1,
          base_fee: null,
          sha_tariff_code: '',
          sha_package_code: '',
          requires_follow_up: false,
          default_follow_up_days: 7,
          default_clinics: [],
          is_active: true,
        },
  });

  const onSubmit = async (data: ProcedureFormValues) => {
    setIsSubmitting(true);
    try {
      if (isEdit && procedure) {
        await proceduresApi.updateCatalogEntry(procedure.id, data);
        toast({ title: 'Procedure updated' });
        router.push(`/procedures/catalog/${procedure.id}`);
      } else {
        const created = await proceduresApi.createCatalogEntry(data);
        toast({ title: 'Procedure created' });
        router.push(`/procedures/catalog/${created.id}`);
      }
    } catch (err) {
      toast({
        title: isEdit ? 'Update failed' : 'Create failed',
        description: getApiErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
        {/* Core Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="PROC-XX-001" {...field} disabled={isEdit} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Procedure name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body_system"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Body System *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BODY_SYSTEMS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="risk_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Risk Level *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RISK_LEVELS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-6">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Active</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Procedure description..." rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Coding */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Standard Coding</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="ichi_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ICHI Code</FormLabel>
                  <FormControl><Input placeholder="e.g., PZX.DB.AC" {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cpt_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPT Code</FormLabel>
                  <FormControl><Input placeholder="e.g., 12001" {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="icd10_pcs_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ICD-10-PCS</FormLabel>
                  <FormControl><Input placeholder="e.g., 0W9F0ZZ" {...field} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Clinical Requirements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Requirements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="typical_duration_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes) *</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="minimum_staff_count"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Staff</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requires_anesthesia"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-6">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Requires Anesthesia</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="anesthesia_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anesthesia Type</FormLabel>
                  <FormControl><Input placeholder="e.g., local, general" {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requires_fasting"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-6">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Requires Fasting</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="required_qualifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required Qualifications</FormLabel>
                  <FormControl><Input placeholder="e.g., Surgeon, Nurse" {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="pre_procedure_instructions"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Pre-Procedure Instructions</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="post_procedure_instructions"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Post-Procedure Instructions</FormLabel>
                  <FormControl><Textarea rows={2} {...field} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Consent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consent Requirements</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="consent_required"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Written Consent</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="guardian_consent_required"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Guardian Consent (Minors)</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="witness_required"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Witness Required</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="consent_template"
              render={({ field }) => (
                <FormItem className="sm:col-span-3">
                  <FormLabel>Consent Template Text</FormLabel>
                  <FormControl><Textarea rows={3} placeholder="Default consent form text..." {...field} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing & SHA</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="base_fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base Fee (KES)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sha_tariff_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SHA Tariff Code</FormLabel>
                  <FormControl><Input placeholder="SHA tariff code" {...field} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sha_package_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SHA Package Code</FormLabel>
                  <FormControl><Input placeholder="SHA package code" {...field} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Follow-up */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Follow-up</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="requires_follow_up"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 pt-2">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Requires Follow-up</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="default_follow_up_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Follow-up Days</FormLabel>
                  <FormControl><Input type="number" min={1} {...field} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Procedure Rooms / Clinics */}
        <ClinicAssignmentCard form={form} procedure={procedure} />

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Procedure'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// =============================================================================
// ClinicAssignmentCard — Multi-select for linking clinics to a catalog entry
// =============================================================================

function ClinicAssignmentCard({
  form,
  procedure,
}: {
  form: ReturnType<typeof useForm<ProcedureFormValues>>;
  procedure?: ProcedureCatalogDetail;
}) {
  const selectedIds: number[] = form.watch('default_clinics');

  // Fetch PROCEDURE-type clinics
  const { data: clinicsData } = useClinics({ status: 'ACTIVE', page_size: 100 });
  const procedureClinics = (clinicsData?.results ?? []).filter((c) =>
    PROCEDURE_CLINIC_TYPES.includes(c.clinic_type)
  );

  const selectedClinics = procedureClinics.filter((c) => selectedIds.includes(c.id));
  const availableClinics = procedureClinics.filter((c) => !selectedIds.includes(c.id));

  const addClinic = (id: number) => {
    form.setValue('default_clinics', [...selectedIds, id], { shouldDirty: true });
  };

  const removeClinic = (id: number) => {
    form.setValue(
      'default_clinics',
      selectedIds.filter((cid) => cid !== id),
      { shouldDirty: true }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Procedure Rooms</CardTitle>
        <p className="text-sm text-muted-foreground">
          Clinics where this procedure can be performed. When assigned, scheduling will auto-list available slots from these clinics.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Selected clinics */}
        {selectedClinics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedClinics.map((clinic) => (
              <Badge key={clinic.id} variant="secondary" className="gap-1 pr-1">
                {clinic.name}
                <button
                  type="button"
                  onClick={() => removeClinic(clinic.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                  aria-label={`Remove ${clinic.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Add clinic dropdown */}
        {availableClinics.length > 0 && (
          <Select onValueChange={(val) => addClinic(Number(val))}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Add a procedure room..." />
            </SelectTrigger>
            <SelectContent>
              {availableClinics.map((clinic) => (
                <SelectItem key={clinic.id} value={String(clinic.id)}>
                  {clinic.name} ({clinic.clinic_type_display})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {procedureClinics.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No procedure-type clinics have been created. Create a clinic with type Procedure Room, Dressing, Injection Room, Surgical, or OT first.
          </p>
        )}

        {selectedIds.length === 0 && procedureClinics.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No clinics assigned — scheduling for this procedure will be manual (date, time, and location entered by hand).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

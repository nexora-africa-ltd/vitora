'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import { laboratoryApi } from '@/lib/api/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { usePermissions } from '@/lib/hooks/use-permissions';
import { useToast } from '@/lib/hooks';
import { Pencil, Save, X, FlaskConical, DollarSign, Ruler, Clock } from 'lucide-react';

const TEST_CATEGORIES = [
  { value: 'HEMATOLOGY', label: 'Hematology' },
  { value: 'CHEMISTRY', label: 'Clinical Chemistry' },
  { value: 'MICROBIOLOGY', label: 'Microbiology' },
  { value: 'SEROLOGY', label: 'Serology' },
  { value: 'PARASITOLOGY', label: 'Parasitology' },
  { value: 'IMMUNOLOGY', label: 'Immunology' },
  { value: 'URINALYSIS', label: 'Urinalysis' },
  { value: 'HISTOPATHOLOGY', label: 'Histopathology' },
  { value: 'CYTOLOGY', label: 'Cytology' },
  { value: 'MOLECULAR', label: 'Molecular Diagnostics' },
  { value: 'OTHER', label: 'Other' },
];

const SPECIMEN_TYPES = [
  { value: 'BLOOD', label: 'Whole Blood' },
  { value: 'SERUM', label: 'Serum' },
  { value: 'PLASMA', label: 'Plasma' },
  { value: 'URINE', label: 'Urine' },
  { value: 'STOOL', label: 'Stool' },
  { value: 'CSF', label: 'Cerebrospinal Fluid' },
  { value: 'SPUTUM', label: 'Sputum' },
  { value: 'SWAB', label: 'Swab' },
  { value: 'TISSUE', label: 'Tissue' },
  { value: 'ASPIRATE', label: 'Aspirate' },
  { value: 'OTHER', label: 'Other' },
];

const RESULT_TYPES = [
  { value: 'NUMERIC', label: 'Numeric Value' },
  { value: 'TEXT', label: 'Text Result' },
  { value: 'OPTIONS', label: 'Predefined Options' },
  { value: 'PANEL', label: 'Multi-component Panel' },
];

const editSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  short_name: z.string().min(1, 'Short name is required'),
  loinc_code: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  specimen_type: z.string().min(1, 'Specimen type is required'),
  result_type: z.string().min(1, 'Result type is required'),
  result_unit: z.string().optional(),
  normal_range_male: z.string().optional(),
  normal_range_female: z.string().optional(),
  normal_range_child: z.string().optional(),
  result_options: z.string().optional(), // comma-separated, parsed before submit
  cost: z.coerce.number().min(0, 'Cost must be positive'),
  sha_claimable: z.boolean(),
  turnaround_hours: z.coerce.number().min(1).optional(),
  requires_fasting: z.boolean(),
  requires_clinical_signoff: z.boolean(),
  special_instructions: z.string().optional(),
  available_in_house: z.boolean(),
  external_lab_partner: z.string().optional(),
  is_panel: z.boolean(),
  is_active: z.boolean(),
});

type EditFormData = z.infer<typeof editSchema>;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(value);
}

export default function TestCatalogDetailPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canPerformAction } = usePermissions();
  const canManage = canPerformAction('laboratory.manage_catalog');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const testQuery = useQuery({
    queryKey: ['laboratoryTest', code],
    queryFn: () => laboratoryApi.getTest(code),
    enabled: !!code,
  });

  const test = testQuery.data;
  const errorMessage = testQuery.error instanceof Error ? testQuery.error.message : null;

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      short_name: '',
      category: '',
      specimen_type: '',
      result_type: 'NUMERIC',
      cost: 0,
      sha_claimable: true,
      turnaround_hours: 24,
      requires_fasting: false,
      requires_clinical_signoff: false,
      available_in_house: true,
      is_panel: false,
      is_active: true,
    },
  });

  const startEditing = () => {
    if (!test) return;
    form.reset({
      name: test.name,
      short_name: test.short_name,
      loinc_code: test.loinc_code || '',
      category: test.category,
      specimen_type: test.specimen_type,
      result_type: test.result_type,
      result_unit: test.result_unit || '',
      normal_range_male: test.normal_range_male || '',
      normal_range_female: test.normal_range_female || '',
      normal_range_child: test.normal_range_child || '',
      result_options: test.result_options?.join(', ') || '',
      cost: test.cost,
      sha_claimable: test.sha_claimable,
      turnaround_hours: test.turnaround_hours || 24,
      requires_fasting: test.requires_fasting,
      requires_clinical_signoff: test.requires_clinical_signoff,
      special_instructions: test.special_instructions || '',
      available_in_house: test.available_in_house,
      external_lab_partner: test.external_lab_partner || '',
      is_panel: test.is_panel,
      is_active: test.is_active,
    });
    setIsEditing(true);
  };

  const onSubmit = async (data: EditFormData) => {
    if (!test) return;
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...data,
        result_options:
          data.result_type === 'OPTIONS' && data.result_options
            ? data.result_options
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      };
      await laboratoryApi.updateTest(test.code, payload as never);
      toast({ title: 'Test updated', description: `${data.name} has been updated.` });
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['laboratoryTest', code] });
      await queryClient.invalidateQueries({ queryKey: ['laboratoryTests'] });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update test',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (testQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (errorMessage || !test) {
    return (
      <div className="space-y-6">
        <PageHeader title="Test Not Found" />
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {errorMessage || 'The requested test was not found.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={test.name}
        helpContent="View and manage test catalog entry details including reference ranges, pricing, and result configuration."
        actions={
          canManage && !isEditing ? (
            <Button onClick={startEditing} variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          ) : undefined
        }
      />

      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {test.code}
            <span className="text-muted-foreground"> • {test.short_name}</span>
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {test.category} • {test.specimen_type}
            {test.loinc_code && ` • LOINC: ${test.loinc_code}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={test.is_active ? 'default' : 'secondary'}>
            {test.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {test.sha_claimable && <Badge variant="outline">SHA Claimable</Badge>}
          {test.requires_fasting && <Badge variant="outline">Fasting Required</Badge>}
          {test.requires_clinical_signoff && (
            <Badge variant="outline">Pathologist Sign-off</Badge>
          )}
        </div>
      </div>

      {isEditing ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Test Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="short_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="loinc_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LOINC Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 26515-7" {...field} />
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
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TEST_CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
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
                  name="specimen_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specimen Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SPECIMEN_TYPES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Result Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Result Configuration</CardTitle>
                  <HelpPopover content="Configure how results are entered and what reference ranges are used for flagging." />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="result_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Result Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RESULT_TYPES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
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
                    name="result_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., mg/dL, mmol/L" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch('result_type') === 'OPTIONS' && (
                  <FormField
                    control={form.control}
                    name="result_options"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Result Options (comma-separated)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Positive, Negative, Indeterminate" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Reference Ranges */}
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Ruler className="h-4 w-4" />
                    Reference Ranges
                    <HelpPopover content="Set normal ranges per demographic group. Format: low-high (e.g., 4.5-5.5). These auto-populate during result entry." />
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="normal_range_male"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Male Range</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 4.5-5.5" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="normal_range_female"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Female Range</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 3.8-5.1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="normal_range_child"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Child Range (&lt;18y)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 4.0-5.2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing & Availability */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Billing & Availability</CardTitle>
                  <HelpPopover content="Configure pricing, SHA claimability, and facility availability." />
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost (KES)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="turnaround_hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Turnaround Time (hours)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="external_lab_partner"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>External Lab Partner</FormLabel>
                      <FormControl>
                        <Input placeholder="Lab name if external" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sha_claimable"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">SHA Claimable</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="available_in_house"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Available In-House</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Active</FormLabel>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Clinical Requirements */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Clinical Requirements</CardTitle>
                  <HelpPopover content="Set specimen preparation requirements and pathologist review rules." />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                  <FormField
                    control={form.control}
                    name="requires_fasting"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Requires Fasting</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="requires_clinical_signoff"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Requires Pathologist Sign-off
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_panel"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">Panel Test</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="special_instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Collect in EDTA tube, transport on ice..."
                          className="min-h-[60px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        /* Read-Only View */
        <div className="space-y-6">
          {/* Result Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Result Configuration</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Result Type</p>
                  <p className="font-medium">{test.result_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Unit</p>
                  <p className="font-medium">{test.result_unit || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Turnaround</p>
                  <p className="font-medium">
                    {test.turnaround_hours ? `${test.turnaround_hours} hours` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Specimen</p>
                  <p className="font-medium">{test.specimen_type}</p>
                </div>
              </div>
              {test.result_type === 'OPTIONS' && test.result_options?.length ? (
                <div className="mt-4">
                  <p className="text-muted-foreground text-xs mb-2">Result Options</p>
                  <div className="flex flex-wrap gap-1.5">
                    {test.result_options.map((opt) => (
                      <Badge key={opt} variant="outline">{opt}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {test.special_instructions && (
                <div className="mt-4 p-3 bg-muted/50 rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Special Instructions</p>
                  <p>{test.special_instructions}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reference Ranges */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Reference Ranges</CardTitle>
                <HelpPopover content="Normal reference ranges used to auto-flag abnormal results during result entry." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs mb-1">Male</p>
                  <p className="font-medium text-lg">
                    {test.normal_range_male || (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </p>
                  {test.result_unit && (
                    <p className="text-xs text-muted-foreground">{test.result_unit}</p>
                  )}
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs mb-1">Female</p>
                  <p className="font-medium text-lg">
                    {test.normal_range_female || (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </p>
                  {test.result_unit && (
                    <p className="text-xs text-muted-foreground">{test.result_unit}</p>
                  )}
                </div>
                <div className="p-3 rounded-lg border">
                  <p className="text-muted-foreground text-xs mb-1">Child (&lt;18y)</p>
                  <p className="font-medium text-lg">
                    {test.normal_range_child || (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </p>
                  {test.result_unit && (
                    <p className="text-xs text-muted-foreground">{test.result_unit}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Billing & Availability */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Billing & Availability</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Cost</p>
                  <p className="font-medium text-lg">{formatCurrency(test.cost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">SHA Claimable</p>
                  <Badge variant={test.sha_claimable ? 'default' : 'secondary'}>
                    {test.sha_claimable ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">In-House</p>
                  <Badge variant={test.available_in_house ? 'default' : 'secondary'}>
                    {test.available_in_house ? 'Yes' : 'No'}
                  </Badge>
                </div>
                {test.external_lab_partner && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">External Lab</p>
                    <p className="font-medium">{test.external_lab_partner}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Panel Components (if panel) */}
          {test.is_panel && test.panel_components?.length ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Panel Components</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {test.panel_components.map((comp) => (
                    <div
                      key={comp.id}
                      className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/laboratory/tests/${comp.code}`)}
                    >
                      <div>
                        <p className="font-medium text-sm">{comp.name}</p>
                        <p className="text-xs text-muted-foreground">{comp.code}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {comp.category}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

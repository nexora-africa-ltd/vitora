'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/lib/hooks';
import { Save, Ruler } from 'lucide-react';
import type { TestCatalogCreateData } from '@/lib/types/laboratory';

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

const createSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(200),
  short_name: z.string().min(1, 'Short name is required').max(50),
  loinc_code: z.string().optional(),
  category: z.string().min(1, 'Category is required'),
  specimen_type: z.string().min(1, 'Specimen type is required'),
  result_type: z.string().min(1, 'Result type is required'),
  result_unit: z.string().optional(),
  normal_range_male: z.string().optional(),
  normal_range_female: z.string().optional(),
  normal_range_child: z.string().optional(),
  result_options: z.string().optional(),
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

type CreateFormData = z.infer<typeof createSchema>;

export default function NewTestCatalogPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      code: '',
      name: '',
      short_name: '',
      loinc_code: '',
      category: '',
      specimen_type: '',
      result_type: 'NUMERIC',
      result_unit: '',
      normal_range_male: '',
      normal_range_female: '',
      normal_range_child: '',
      result_options: '',
      cost: 0,
      sha_claimable: true,
      turnaround_hours: 24,
      requires_fasting: false,
      requires_clinical_signoff: false,
      special_instructions: '',
      available_in_house: true,
      external_lab_partner: '',
      is_panel: false,
      is_active: true,
    },
  });

  const onSubmit = async (data: CreateFormData) => {
    setIsSaving(true);
    try {
      const payload: TestCatalogCreateData = {
        ...data,
        code: data.code.toUpperCase(),
        category: data.category as TestCatalogCreateData['category'],
        specimen_type: data.specimen_type as TestCatalogCreateData['specimen_type'],
        result_type: data.result_type as TestCatalogCreateData['result_type'],
        result_options:
          data.result_type === 'OPTIONS' && data.result_options
            ? data.result_options
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
      };
      const created = await laboratoryApi.createTest(payload);
      toast({ title: 'Test created', description: `${created.name} (${created.code}) has been added.` });
      await queryClient.invalidateQueries({ queryKey: ['laboratoryTests'] });
      router.push(`/laboratory/tests/${created.code}`);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create test',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Test"
        helpContent="Add a new test to the laboratory catalog with reference ranges, pricing, and result configuration."
      />

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
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., CBC, LFT, RBS" {...field} />
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
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Complete Blood Count" {...field} />
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
                      <Input placeholder="e.g., CBC" {...field} />
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
                          <SelectValue placeholder="Select category" />
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
                          <SelectValue placeholder="Select specimen" />
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
                  <HelpPopover content="Set normal ranges per demographic group. Format: low-high (e.g., 4.5-5.5)." />
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
                <HelpPopover content="Configure pricing, SHA claimability, and facility availability. Cost maps to billing invoice items." />
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
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
              <CardTitle className="text-base">Clinical Requirements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                <FormField
                  control={form.control}
                  name="requires_fasting"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
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
              onClick={() => router.push('/laboratory/tests')}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Creating...' : 'Create Test'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

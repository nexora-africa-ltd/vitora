/**
 * Drug Form Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Form for creating and editing drugs in the catalog.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { HelpCircle, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  MultiSelect,
  MultiSelectTrigger,
  MultiSelectContent,
  MultiSelectInput,
  MultiSelectList,
  MultiSelectEmpty,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectBadges,
} from '@/components/kibo-ui/multi-select';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Drug, DrugCreateData, DrugCategory, DrugForm as DrugFormType, DrugSchedule } from '@/lib/types/pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';

// Form validation schema
const drugFormSchema = z.object({
  code: z.string().min(1, 'Drug code is required'),
  generic_name: z.string().min(1, 'Generic name is required'),
  brand_names: z.array(z.string()).optional(),
  // Dynamic category codes (fetched from backend registry)
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  form: z.enum([
    'TABLET',
    'CAPSULE',
    'SYRUP',
    'INJECTION',
    'CREAM',
    'OINTMENT',
    'DROPS',
    'INHALER',
    'SUPPOSITORY',
    'POWDER',
    'SUSPENSION',
    'SOLUTION',
    'GEL',
    'PATCH',
    'SPRAY',
  ] as const, { required_error: 'Form is required' }),
  strength: z.string().min(1, 'Strength is required'),
  unit: z.string().min(1, 'Unit is required'),
  schedule: z.enum(['OTC', 'POM', 'P', 'CD'] as const).optional(),
  requires_prescription: z.boolean().optional(),
  is_controlled: z.boolean().optional(),
  is_narcotic: z.boolean().optional(),
  keml_code: z.string().optional(),
  is_essential: z.boolean().optional(),
  nhif_code: z.string().optional(),
  // Use coercion because number inputs can still emit strings
  default_reorder_level: z.coerce.number().min(0).optional(),
  default_reorder_quantity: z.coerce.number().min(0).optional(),
  shelf_life_months: z.coerce.number().min(0).optional(),
  storage_requirements: z.string().optional(),
  reference_price: z.coerce.number().min(0).optional(),
});

type DrugFormData = z.infer<typeof drugFormSchema>;

interface DrugFormProps {
  drug?: Drug;
  onSuccess?: (drug: Drug) => void;
  onCancel?: () => void;
}

const CATEGORY_LABELS: Record<DrugCategory, string> = {
  ANALGESIC: 'Analgesic',
  ANTIBIOTIC: 'Antibiotic',
  ANTIMALARIAL: 'Antimalarial',
  ANTIRETROVIRAL: 'Antiretroviral',
  ANTIHYPERTENSIVE: 'Antihypertensive',
  ANTIDIABETIC: 'Antidiabetic',
  ANTIHISTAMINE: 'Antihistamine',
  VITAMIN: 'Vitamin',
  VACCINE: 'Vaccine',
  CONTRACEPTIVE: 'Contraceptive',
  PSYCHOTROPIC: 'Psychotropic',
  CONTROLLED: 'Controlled',
  OTHER: 'Other',
};

const FORM_LABELS: Record<DrugFormType, string> = {
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SYRUP: 'Syrup',
  INJECTION: 'Injection',
  CREAM: 'Cream',
  OINTMENT: 'Ointment',
  DROPS: 'Drops',
  INHALER: 'Inhaler',
  SUPPOSITORY: 'Suppository',
  POWDER: 'Powder',
  SUSPENSION: 'Suspension',
  SOLUTION: 'Solution',
  GEL: 'Gel',
  PATCH: 'Patch',
  SPRAY: 'Spray',
};

export function DrugForm({ drug, onSuccess, onCancel }: DrugFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [brandNameInput, setBrandNameInput] = useState('');
  const [brandNames, setBrandNames] = useState<string[]>(drug?.brand_names ?? []);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>(
    Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
  );

  const form = useForm<DrugFormData>({
    resolver: zodResolver(drugFormSchema),
    defaultValues: {
      code: drug?.code ?? '',
      generic_name: drug?.generic_name ?? '',
      brand_names: drug?.brand_names ?? [],
      // Backward compatibility: if older payloads only include `category`
      categories: drug?.categories?.length
        ? drug.categories
        : (drug?.category ? [drug.category] : []),
      form: drug?.form ?? undefined,
      strength: drug?.strength ?? '',
      unit: drug?.unit ?? '',
      // Align with backend default (POM)
      schedule: drug?.schedule ?? 'POM',
      // Keep consistent with schedule when user can't edit directly
      requires_prescription: drug?.requires_prescription ?? (drug?.schedule === 'OTC' ? false : true),
      is_controlled: drug?.is_controlled ?? false,
      is_narcotic: drug?.is_narcotic ?? false,
      keml_code: drug?.keml_code ?? '',
      is_essential: drug?.is_essential ?? false,
      nhif_code: drug?.nhif_code ?? '',
      default_reorder_level: drug?.default_reorder_level ?? 100,
      default_reorder_quantity: drug?.default_reorder_quantity ?? 500,
      shelf_life_months: drug?.shelf_life_months ?? undefined,
      storage_requirements: drug?.storage_requirements ?? '',
      reference_price: drug?.reference_price ?? undefined,
    },
  });

  useEffect(() => {
    let isMounted = true;
    setIsLoadingCategories(true);

    pharmacyApi
      .listDrugCategories()
      .then((options) => {
        if (!isMounted) return;
        if (options.length > 0) {
          setCategoryOptions(options);
        }
      })
      .catch((err: unknown) => {
        console.warn('Failed to load drug categories from backend:', err);
        // Fall back to static labels
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoadingCategories(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;

    setIsCreatingCategory(true);
    try {
      const created = await pharmacyApi.createDrugCategory({ name });
      setCategoryOptions((prev) => {
        const exists = prev.some((o) => o.value === created.value);
        return exists ? prev : [...prev, created].sort((a, b) => a.label.localeCompare(b.label));
      });
      form.setValue('categories', Array.from(new Set([...(form.getValues('categories') ?? []), created.value])));
      setNewCategoryName('');

      toast({
        title: 'Category added',
        description: `${created.label} is now available.`,
      });
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err);
      toast({
        title: 'Failed to add category',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const addBrandName = () => {
    if (brandNameInput.trim()) {
      const newBrandNames = [...brandNames, brandNameInput.trim()];
      setBrandNames(newBrandNames);
      form.setValue('brand_names', newBrandNames);
      setBrandNameInput('');
    }
  };

  const removeBrandName = (index: number) => {
    const newBrandNames = brandNames.filter((_, i) => i !== index);
    setBrandNames(newBrandNames);
    form.setValue('brand_names', newBrandNames);
  };

  const onSubmit = async (data: DrugFormData) => {
    setIsSubmitting(true);

    try {
      const schedule: DrugSchedule = (data.schedule ?? 'POM') as DrugSchedule;
      const requiresPrescription = data.requires_prescription ?? (schedule !== 'OTC');

      const payload: DrugCreateData = {
        ...data,
        categories: data.categories as DrugCategory[],
        brand_names: brandNames,
        // Set defaults for optional fields
        schedule,
        requires_prescription: requiresPrescription,
        is_controlled: data.is_controlled ?? false,
        is_narcotic: data.is_narcotic ?? false,
        is_essential: data.is_essential ?? false,
        default_reorder_level: data.default_reorder_level ?? 100,
        default_reorder_quantity: data.default_reorder_quantity ?? 500,
      };

      let result: Drug;
      if (drug) {
        // Update existing drug
        result = await pharmacyApi.updateDrug(drug.id, payload);
      } else {
        // Create new drug
        result = await pharmacyApi.createDrug(payload);
      }

      toast({
        title: drug ? 'Drug Updated' : 'Drug Created',
        description: `${result.generic_name} has been ${drug ? 'updated' : 'added to the catalog'} successfully.`,
      });

      if (onSuccess) {
        onSuccess(result);
      } else {
        // Redirect to drug detail page after short delay
        setTimeout(() => {
          router.push(`/pharmacy/drugs/${result.id}`);
        }, 500);
      }
    } catch (err: unknown) {
      console.error('Error saving drug:', err);
      const errorMessage = getApiErrorMessage(err);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="drug-form">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Drug Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="DRG-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="generic_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Generic Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Paracetamol" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Brand Names */}
          <div className="space-y-2">
            <Label htmlFor="brand-names-input">Brand Names</Label>
            <div className="flex gap-2">
              <Input
                id="brand-names-input"
                placeholder="e.g., Panadol, Tylenol"
                value={brandNameInput}
                onChange={(e) => setBrandNameInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addBrandName();
                  }
                }}
                aria-label="Brand Names"
              />
              <Button type="button" variant="outline" onClick={addBrandName}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {brandNames.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {brandNames.map((name, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {name}
                    <button
                      type="button"
                      onClick={() => removeBrandName(index)}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full"
                      title={`Remove ${name}`}
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Categories (Multi-select with Kibo UI) */}
          <FormField
            control={form.control}
            name="categories"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categories *</FormLabel>
                <MultiSelect
                  data={categoryOptions}
                  type="category"
                  values={field.value || []}
                  onValuesChange={field.onChange}
                >
                  <FormControl>
                    <MultiSelectTrigger className="w-full" placeholder="Select categories..." />
                  </FormControl>
                  <MultiSelectContent>
                    <MultiSelectInput />
                    <MultiSelectList>
                      <MultiSelectEmpty>
                        {isLoadingCategories ? 'Loading categories...' : 'No categories found.'}
                      </MultiSelectEmpty>
                      <MultiSelectGroup>
                        {categoryOptions.map((option) => (
                          <MultiSelectItem key={option.value} value={option.value}>
                            {option.label}
                          </MultiSelectItem>
                        ))}
                      </MultiSelectGroup>
                    </MultiSelectList>
                  </MultiSelectContent>
                  <MultiSelectBadges />
                </MultiSelect>

                <FormDescription>
                  Categories are loaded from the backend. You can add a new one if needed.
                </FormDescription>

                <div className="flex gap-2">
                  <Input
                    placeholder="Add new category (e.g., Herbal Medicine)"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    disabled={isCreatingCategory}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addNewCategory}
                    disabled={isCreatingCategory || !newCategoryName.trim()}
                  >
                    {isCreatingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>

                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="form"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Form *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select form" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(FORM_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="strength"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strength *</FormLabel>
                  <FormControl>
                    <Input placeholder="500mg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit *</FormLabel>
                  <FormControl>
                    <Input placeholder="tablet" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Regulatory Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Regulatory Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="schedule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select schedule" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="OTC">OTC - Over The Counter</SelectItem>
                      <SelectItem value="POM">POM - Prescription Only Medicine</SelectItem>
                      <SelectItem value="P">P - Pharmacy Medicine</SelectItem>
                      <SelectItem value="CD">CD - Controlled Drug</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="keml_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>KEML ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Essential Medicines List code" {...field} />
                  </FormControl>
                  <FormDescription>
                    Kenya Essential Medicines List code
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nhif_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NHIF/SHA ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Insurance code" {...field} />
                  </FormControl>
                  <FormDescription>
                    NHIF (now SHA) code for insurance claims
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="is_essential"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Essential Medicine (KEML)</FormLabel>
                    <FormDescription>
                      Part of Kenya Essential Medicines List
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_controlled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Controlled Substance</FormLabel>
                    <FormDescription>
                      Requires special tracking and verification
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Inventory Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Inventory Settings</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="default_reorder_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Level</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="100"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum stock level before reordering
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="default_reorder_quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="500"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Quantity to order when restocking
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="shelf_life_months"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Shelf Life (Months)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="24"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    Reference Price (KES)
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex">
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-xs text-sm">
                        <p>
                          The standard unit cost for this drug, used as a baseline for pricing and reporting.
                          Actual selling prices are set per batch at stock receipt.
                        </p>
                      </PopoverContent>
                    </Popover>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="50.00"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="storage_requirements"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Storage Requirements</FormLabel>
                <FormControl>
                  <Input placeholder="Store below 25°C, protect from light" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {drug ? 'Update Drug' : 'Create Drug'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

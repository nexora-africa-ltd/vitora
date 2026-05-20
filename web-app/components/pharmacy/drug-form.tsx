/**
 * Drug/Item Form Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Two-step form: pick item type first, then show conditional fields.
 * Medications get full pharma fields; consumables/reagents get simplified fields.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Plus, X, Pill, Package, FlaskConical, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Drug, DrugCreateData, DrugCategory, DrugForm as DrugFormType, DrugSchedule, ItemType } from '@/lib/types/pharmacy';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';

// ---------- Constants ----------

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
  MEDICAL_SUPPLY: 'Medical Supply',
  SURGICAL_CONSUMABLE: 'Surgical Consumable',
  REAGENT: 'Reagent',
  PPE: 'PPE',
  WOUND_CARE: 'Wound Care',
  DISPOSABLE: 'Disposable',
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
  UNIT: 'Unit/Piece',
  OTHER: 'Other',
};

// Categories relevant to consumables/reagents
const CONSUMABLE_CATEGORIES: DrugCategory[] = [
  'MEDICAL_SUPPLY', 'SURGICAL_CONSUMABLE', 'PPE', 'WOUND_CARE', 'DISPOSABLE', 'OTHER',
];
const REAGENT_CATEGORIES: DrugCategory[] = ['REAGENT', 'OTHER'];

// ---------- Zod Schemas ----------

// Medication-specific schema
const medicationSchema = z.object({
  code: z.string().min(1, 'Item code is required'),
  generic_name: z.string().min(1, 'Generic name is required'),
  brand_names: z.array(z.string()).optional(),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  form: z.enum([
    'TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'OINTMENT', 'DROPS',
    'INHALER', 'SUPPOSITORY', 'POWDER', 'SUSPENSION', 'SOLUTION', 'GEL',
    'PATCH', 'SPRAY', 'UNIT', 'OTHER',
  ] as const, { required_error: 'Form is required' }),
  strength: z.string().min(1, 'Strength is required'),
  unit: z.string().min(1, 'Unit is required'),
  item_type: z.enum(['MEDICATION', 'CONSUMABLE', 'REAGENT'] as const),
  schedule: z.enum(['OTC', 'POM', 'P', 'CD'] as const).optional(),
  requires_prescription: z.boolean().optional(),
  is_controlled: z.boolean().optional(),
  is_narcotic: z.boolean().optional(),
  keml_code: z.string().optional(),
  is_essential: z.boolean().optional(),
  nhif_code: z.string().optional(),
  default_reorder_level: z.coerce.number().min(0).optional(),
  default_reorder_quantity: z.coerce.number().min(0).optional(),
  shelf_life_months: z.coerce.number().min(0).optional(),
  storage_requirements: z.string().optional(),
  reference_price: z.coerce.number().min(0).optional(),
});

// Consumable/Reagent schema (simpler — no brand, form, strength, schedule, controlled)
const consumableSchema = z.object({
  code: z.string().min(1, 'Item code is required'),
  generic_name: z.string().min(1, 'Name is required'),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  unit: z.string().min(1, 'Unit is required'),
  item_type: z.enum(['MEDICATION', 'CONSUMABLE', 'REAGENT'] as const),
  specification: z.string().optional(),
  default_reorder_level: z.coerce.number().min(0).optional(),
  default_reorder_quantity: z.coerce.number().min(0).optional(),
  shelf_life_months: z.coerce.number().min(0).optional(),
  storage_requirements: z.string().optional(),
  reference_price: z.coerce.number().min(0).optional(),
});

type MedicationFormData = z.infer<typeof medicationSchema>;
type ConsumableFormData = z.infer<typeof consumableSchema>;

// ---------- Component ----------

interface DrugFormProps {
  drug?: Drug;
  onSuccess?: (drug: Drug) => void;
  onCancel?: () => void;
}

export function DrugForm({ drug, onSuccess, onCancel }: DrugFormProps) {
  // Step 1: item type selection (skip if editing existing drug)
  const [selectedType, setSelectedType] = useState<ItemType | null>(
    drug?.item_type ?? null
  );

  const isMedication = selectedType === 'MEDICATION';

  // If editing, go directly to step 2
  const showTypeSelector = !drug && !selectedType;

  if (showTypeSelector) {
    return <ItemTypeSelector onSelect={setSelectedType} onCancel={onCancel} />;
  }

  if (!selectedType) return null;

  if (isMedication) {
    return (
      <MedicationForm
        drug={drug}
        onSuccess={onSuccess}
        onCancel={onCancel}
        onBack={drug ? undefined : () => setSelectedType(null)}
      />
    );
  }

  return (
    <ConsumableForm
      itemType={selectedType}
      drug={drug}
      onSuccess={onSuccess}
      onCancel={onCancel}
      onBack={drug ? undefined : () => setSelectedType(null)}
    />
  );
}

// ---------- Step 1: Item Type Selector ----------

function ItemTypeSelector({
  onSelect,
  onCancel,
}: {
  onSelect: (type: ItemType) => void;
  onCancel?: () => void;
}) {
  const typeCards: { type: ItemType; icon: typeof Pill; title: string; description: string }[] = [
    {
      type: 'MEDICATION',
      icon: Pill,
      title: 'Medication',
      description: 'Pharmaceutical drugs — tablets, syrups, injections. Includes schedule, controlled substance, and prescription tracking.',
    },
    {
      type: 'CONSUMABLE',
      icon: Package,
      title: 'Consumable',
      description: 'Medical supplies — gloves, syringes, sutures, gauze, PPE. No prescription or schedule required.',
    },
    {
      type: 'REAGENT',
      icon: FlaskConical,
      title: 'Reagent',
      description: 'Laboratory reagents and test kits — strips, solutions, culture media. Tracked by lot and expiry.',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">What are you adding?</h2>
        <p className="text-sm text-muted-foreground">Choose the type of item to add to your catalog.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {typeCards.map(({ type, icon: Icon, title, description }) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="group relative flex flex-col items-start gap-3 rounded-xl border-2 border-muted p-5 text-left transition-all hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {onCancel && (
        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Step 2a: Medication Form ----------

function MedicationForm({
  drug,
  onSuccess,
  onCancel,
  onBack,
}: {
  drug?: Drug;
  onSuccess?: (drug: Drug) => void;
  onCancel?: () => void;
  onBack?: () => void;
}) {
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

  const form = useForm<MedicationFormData>({
    resolver: zodResolver(medicationSchema),
    defaultValues: {
      code: drug?.code ?? '',
      generic_name: drug?.generic_name ?? '',
      brand_names: drug?.brand_names ?? [],
      categories: drug?.categories?.length
        ? drug.categories
        : (drug?.category ? [drug.category] : []),
      form: drug?.form ?? undefined,
      strength: drug?.strength ?? '',
      unit: drug?.unit ?? '',
      item_type: 'MEDICATION',
      schedule: drug?.schedule ?? 'POM',
      requires_prescription: drug?.requires_prescription ?? true,
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
        if (options.length > 0) setCategoryOptions(options);
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoadingCategories(false); });
    return () => { isMounted = false; };
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
      toast({ title: 'Category added', description: `${created.label} is now available.` });
    } catch (err: unknown) {
      toast({ title: 'Failed to add category', description: getApiErrorMessage(err), variant: 'destructive' });
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

  const onSubmit = async (data: MedicationFormData) => {
    setIsSubmitting(true);
    try {
      const schedule: DrugSchedule = (data.schedule ?? 'POM') as DrugSchedule;
      const payload: DrugCreateData = {
        ...data,
        categories: data.categories as DrugCategory[],
        brand_names: brandNames,
        schedule,
        requires_prescription: data.requires_prescription ?? (schedule !== 'OTC'),
        is_controlled: data.is_controlled ?? false,
        is_narcotic: data.is_narcotic ?? false,
        is_essential: data.is_essential ?? false,
        default_reorder_level: data.default_reorder_level ?? 100,
        default_reorder_quantity: data.default_reorder_quantity ?? 500,
      };

      let result: Drug;
      if (drug) {
        result = await pharmacyApi.updateDrug(drug.id, payload);
      } else {
        result = await pharmacyApi.createDrug(payload);
      }

      toast({
        title: drug ? 'Medication Updated' : 'Medication Created',
        description: `${result.generic_name} has been ${drug ? 'updated' : 'added to the catalog'} successfully.`,
      });

      if (onSuccess) {
        onSuccess(result);
      } else {
        setTimeout(() => router.push(`/pharmacy/drugs/${result.id}`), 500);
      }
    } catch (err: unknown) {
      toast({ title: 'Error', description: getApiErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6" data-testid="drug-form">
        {/* Back to type selector */}
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Change type
          </Button>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base sm:text-lg">Medication Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Code <span className="text-destructive">*</span></FormLabel>
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
                    <FormLabel>Generic Name <span className="text-destructive">*</span></FormLabel>
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
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrandName(); } }}
                />
                <Button type="button" variant="outline" size="icon" onClick={addBrandName}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {brandNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {brandNames.map((name, index) => (
                    <Badge key={index} variant="secondary" className="gap-1">
                      {name}
                      <button type="button" onClick={() => removeBrandName(index)} className="ml-0.5 hover:bg-secondary-foreground/20 rounded-full" aria-label={`Remove ${name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Categories */}
            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categories <span className="text-destructive">*</span></FormLabel>
                  <MultiSelect data={categoryOptions} type="category" values={field.value || []} onValuesChange={field.onChange}>
                    <FormControl>
                      <MultiSelectTrigger className="w-full" placeholder="Select categories..." />
                    </FormControl>
                    <MultiSelectContent>
                      <MultiSelectInput />
                      <MultiSelectList>
                        <MultiSelectEmpty>{isLoadingCategories ? 'Loading...' : 'No categories found.'}</MultiSelectEmpty>
                        <MultiSelectGroup>
                          {categoryOptions.map((option) => (
                            <MultiSelectItem key={option.value} value={option.value}>{option.label}</MultiSelectItem>
                          ))}
                        </MultiSelectGroup>
                      </MultiSelectList>
                    </MultiSelectContent>
                    <MultiSelectBadges />
                  </MultiSelect>
                  <div className="flex gap-2">
                    <Input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} disabled={isCreatingCategory} className="h-8 text-sm" />
                    <Button type="button" variant="outline" size="sm" onClick={addNewCategory} disabled={isCreatingCategory || !newCategoryName.trim()}>
                      {isCreatingCategory ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="form"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form <span className="text-destructive">*</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select form" /></SelectTrigger>
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
                    <FormLabel>Strength <span className="text-destructive">*</span></FormLabel>
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
                    <FormLabel>Unit <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="tablet" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Regulatory Information */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Regulatory</CardTitle>
              <HelpPopover content="Schedule, controlled substance status, KEML and SHA codes for regulatory compliance and insurance claims." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="schedule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Schedule</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="OTC">OTC</SelectItem>
                        <SelectItem value="POM">POM</SelectItem>
                        <SelectItem value="P">Pharmacy</SelectItem>
                        <SelectItem value="CD">Controlled</SelectItem>
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
                    <FormLabel>KEML Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 01.01.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nhif_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SHA Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Insurance code" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <FormField
                control={form.control}
                name="is_essential"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="text-sm font-normal">Essential (KEML)</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requires_prescription"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="text-sm font-normal">Requires Prescription</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_controlled"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="text-sm font-normal">Controlled</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_narcotic"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="text-sm font-normal">Narcotic</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Inventory Settings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Inventory</CardTitle>
              <HelpPopover content="Reorder levels trigger stock alerts. Reference price is the baseline unit cost for reporting." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField control={form.control} name="default_reorder_level" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Level</FormLabel>
                  <FormControl><Input type="number" placeholder="100" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="default_reorder_quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Qty</FormLabel>
                  <FormControl><Input type="number" placeholder="500" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shelf_life_months" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shelf Life (mo)</FormLabel>
                  <FormControl><Input type="number" placeholder="24" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reference_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Ref. Price (KES)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="50.00" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="storage_requirements" render={({ field }) => (
              <FormItem>
                <FormLabel>Storage Requirements</FormLabel>
                <FormControl><Input placeholder="Store below 25°C, protect from light" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="w-full sm:w-auto">Cancel</Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {drug ? 'Update Medication' : 'Create Medication'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ---------- Step 2b: Consumable/Reagent Form ----------

function ConsumableForm({
  itemType,
  drug,
  onSuccess,
  onCancel,
  onBack,
}: {
  itemType: ItemType;
  drug?: Drug;
  onSuccess?: (drug: Drug) => void;
  onCancel?: () => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Filter categories relevant to this item type
  const relevantCategories = itemType === 'REAGENT' ? REAGENT_CATEGORIES : CONSUMABLE_CATEGORIES;
  const defaultCategoryOptions = Object.entries(CATEGORY_LABELS)
    .filter(([key]) => relevantCategories.includes(key as DrugCategory))
    .map(([value, label]) => ({ value, label }));

  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>(defaultCategoryOptions);

  const form = useForm<ConsumableFormData>({
    resolver: zodResolver(consumableSchema),
    defaultValues: {
      code: drug?.code ?? '',
      generic_name: drug?.generic_name ?? '',
      categories: drug?.categories?.length
        ? drug.categories
        : (drug?.category ? [drug.category] : []),
      unit: drug?.unit ?? 'piece',
      item_type: itemType,
      specification: drug?.strength ?? '',
      default_reorder_level: drug?.default_reorder_level ?? 50,
      default_reorder_quantity: drug?.default_reorder_quantity ?? 200,
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
        if (options.length > 0) setCategoryOptions(options);
      })
      .catch(() => {})
      .finally(() => { if (isMounted) setIsLoadingCategories(false); });
    return () => { isMounted = false; };
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
      toast({ title: 'Category added', description: `${created.label} is now available.` });
    } catch (err: unknown) {
      toast({ title: 'Failed to add category', description: getApiErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const typeLabel = itemType === 'REAGENT' ? 'Reagent' : 'Consumable';
  const unitPlaceholder = itemType === 'REAGENT' ? 'ml, strip, kit' : 'piece, pair, box, roll';

  const onSubmit = async (data: ConsumableFormData) => {
    setIsSubmitting(true);
    try {
      // Map consumable data to DrugCreateData (reuses the Drug model)
      const payload: DrugCreateData = {
        code: data.code,
        generic_name: data.generic_name,
        categories: data.categories as DrugCategory[],
        unit: data.unit,
        item_type: data.item_type,
        // Backend requires form & strength — use sensible defaults for consumables
        form: 'UNIT',
        strength: data.specification || '-',
        requires_prescription: false,
        is_controlled: false,
        is_narcotic: false,
        is_essential: false,
        schedule: 'OTC',
        default_reorder_level: data.default_reorder_level ?? 50,
        default_reorder_quantity: data.default_reorder_quantity ?? 200,
        shelf_life_months: data.shelf_life_months,
        storage_requirements: data.storage_requirements,
        reference_price: data.reference_price,
      };

      let result: Drug;
      if (drug) {
        result = await pharmacyApi.updateDrug(drug.id, payload);
      } else {
        result = await pharmacyApi.createDrug(payload);
      }

      toast({
        title: drug ? `${typeLabel} Updated` : `${typeLabel} Created`,
        description: `${result.generic_name} has been ${drug ? 'updated' : 'added to the catalog'} successfully.`,
      });

      if (onSuccess) {
        onSuccess(result);
      } else {
        setTimeout(() => router.push(`/pharmacy/drugs/${result.id}`), 500);
      }
    } catch (err: unknown) {
      toast({ title: 'Error', description: getApiErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6" data-testid="drug-form">
        {/* Back to type selector */}
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" /> Change type
          </Button>
        )}

        {/* Item Information */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">{typeLabel} Information</CardTitle>
              <Badge variant="outline" className="text-xs">
                {itemType === 'REAGENT' ? <FlaskConical className="h-3 w-3 mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                {typeLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Code <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder={itemType === 'REAGENT' ? 'RGT-001' : 'CON-001'} {...field} />
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
                    <FormLabel>Item Name <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder={itemType === 'REAGENT' ? 'Glucose Test Strips' : 'Nitrile Gloves (Medium)'} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Categories */}
            <FormField
              control={form.control}
              name="categories"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category <span className="text-destructive">*</span></FormLabel>
                  <MultiSelect data={categoryOptions} type="category" values={field.value || []} onValuesChange={field.onChange}>
                    <FormControl>
                      <MultiSelectTrigger className="w-full" placeholder="Select category..." />
                    </FormControl>
                    <MultiSelectContent>
                      <MultiSelectInput />
                      <MultiSelectList>
                        <MultiSelectEmpty>{isLoadingCategories ? 'Loading...' : 'No categories found.'}</MultiSelectEmpty>
                        <MultiSelectGroup>
                          {categoryOptions.map((option) => (
                            <MultiSelectItem key={option.value} value={option.value}>{option.label}</MultiSelectItem>
                          ))}
                        </MultiSelectGroup>
                      </MultiSelectList>
                    </MultiSelectContent>
                    <MultiSelectBadges />
                  </MultiSelect>
                  <div className="flex gap-2">
                    <Input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} disabled={isCreatingCategory} className="h-8 text-sm" />
                    <Button type="button" variant="outline" size="sm" onClick={addNewCategory} disabled={isCreatingCategory || !newCategoryName.trim()}>
                      {isCreatingCategory ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      Unit of Measure <span className="text-destructive">*</span>
                      <HelpPopover content="The smallest countable unit for inventory tracking (piece, pair, box, roll, ml, strip, kit)." />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={unitPlaceholder} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="specification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      Size / Specification
                      <HelpPopover content="Optional size or spec, e.g. 'Medium', '100ml', '50 strips/box'." />
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Medium, 100ml, 50/box" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Inventory Settings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">Inventory</CardTitle>
              <HelpPopover content="Reorder levels trigger alerts when stock falls below threshold." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField control={form.control} name="default_reorder_level" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Level</FormLabel>
                  <FormControl><Input type="number" placeholder="50" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="default_reorder_quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Reorder Qty</FormLabel>
                  <FormControl><Input type="number" placeholder="200" {...field} onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="shelf_life_months" render={({ field }) => (
                <FormItem>
                  <FormLabel>Shelf Life (mo)</FormLabel>
                  <FormControl><Input type="number" placeholder="36" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="reference_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Price (KES)</FormLabel>
                  <FormControl><Input type="number" step="0.01" placeholder="25.00" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="storage_requirements" render={({ field }) => (
              <FormItem>
                <FormLabel>Storage Requirements</FormLabel>
                <FormControl><Input placeholder="Store in cool, dry place" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="w-full sm:w-auto">Cancel</Button>
          )}
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {drug ? `Update ${typeLabel}` : `Create ${typeLabel}`}
          </Button>
        </div>
      </form>
    </Form>
  );
}

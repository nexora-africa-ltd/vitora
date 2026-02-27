/**
 * Diet Plan Form Component
 * Create / edit a diet plan linked to a nutrition consultation
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
import {
  Apple,
  Flame,
  Calendar,
  Save,
  Loader2,
  UtensilsCrossed,
  Ban,
  ThumbsUp,
  Pill,
  FileText,
} from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import {
  useCreateDietPlan,
  useUpdateDietPlan,
  useDietPlan,
  useNutritionConsultations,
} from '@/lib/hooks/use-nutrition';
import { useToast } from '@/lib/hooks/use-toast';

const dietPlanFormSchema = z.object({
  consultation_id: z.number({ required_error: 'Consultation is required' }),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  // Targets
  target_calories: z.coerce.number().positive().optional().or(z.literal('')),
  target_protein_g: z.coerce.number().positive().optional().or(z.literal('')),
  target_carbs_g: z.coerce.number().positive().optional().or(z.literal('')),
  target_fat_g: z.coerce.number().positive().optional().or(z.literal('')),
  target_fiber_g: z.coerce.number().positive().optional().or(z.literal('')),
  target_sodium_mg: z.coerce.number().positive().optional().or(z.literal('')),
  // Meals
  breakfast: z.string().optional(),
  mid_morning_snack: z.string().optional(),
  lunch: z.string().optional(),
  afternoon_snack: z.string().optional(),
  dinner: z.string().optional(),
  bedtime_snack: z.string().optional(),
  // Additional
  foods_to_avoid: z.string().optional(),
  foods_to_include: z.string().optional(),
  special_instructions: z.string().optional(),
  supplements: z.string().optional(),
  // Dates
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional(),
  review_date: z.string().optional(),
});

type DietPlanFormValues = z.infer<typeof dietPlanFormSchema>;

interface DietPlanFormProps {
  /** If provided, pre-select this consultation */
  consultationId?: number;
  /** If provided, load existing diet plan for editing */
  dietPlanId?: number;
}

export function DietPlanForm({ consultationId, dietPlanId }: DietPlanFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isEditing = !!dietPlanId;

  const { data: existingPlan, isLoading: planLoading } = useDietPlan(dietPlanId);
  const { data: consultations, isLoading: consultationsLoading } =
    useNutritionConsultations({ page_size: 100, status: 'IN_PROGRESS' });
  const createMutation = useCreateDietPlan();
  const updateMutation = useUpdateDietPlan();

  const form = useForm<DietPlanFormValues>({
    resolver: zodResolver(dietPlanFormSchema),
    defaultValues: {
      consultation_id: consultationId,
      title: '',
      description: '',
      target_calories: '' as unknown as undefined,
      target_protein_g: '' as unknown as undefined,
      target_carbs_g: '' as unknown as undefined,
      target_fat_g: '' as unknown as undefined,
      target_fiber_g: '' as unknown as undefined,
      target_sodium_mg: '' as unknown as undefined,
      breakfast: '',
      mid_morning_snack: '',
      lunch: '',
      afternoon_snack: '',
      dinner: '',
      bedtime_snack: '',
      foods_to_avoid: '',
      foods_to_include: '',
      special_instructions: '',
      supplements: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      review_date: '',
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (existingPlan) {
      form.reset({
        consultation_id: existingPlan.consultation_id,
        title: existingPlan.title,
        description: existingPlan.description || '',
        target_calories: existingPlan.target_calories ?? ('' as unknown as undefined),
        target_protein_g: existingPlan.target_protein_g ?? ('' as unknown as undefined),
        target_carbs_g: existingPlan.target_carbs_g ?? ('' as unknown as undefined),
        target_fat_g: existingPlan.target_fat_g ?? ('' as unknown as undefined),
        target_fiber_g: existingPlan.target_fiber_g ?? ('' as unknown as undefined),
        target_sodium_mg: existingPlan.target_sodium_mg ?? ('' as unknown as undefined),
        breakfast: existingPlan.breakfast || '',
        mid_morning_snack: existingPlan.mid_morning_snack || '',
        lunch: existingPlan.lunch || '',
        afternoon_snack: existingPlan.afternoon_snack || '',
        dinner: existingPlan.dinner || '',
        bedtime_snack: existingPlan.bedtime_snack || '',
        foods_to_avoid: existingPlan.foods_to_avoid || '',
        foods_to_include: existingPlan.foods_to_include || '',
        special_instructions: existingPlan.special_instructions || '',
        supplements: existingPlan.supplements || '',
        start_date: existingPlan.start_date,
        end_date: existingPlan.end_date || '',
        review_date: existingPlan.review_date || '',
      });
    }
  }, [existingPlan, form]);

  const onSubmit = async (values: DietPlanFormValues) => {
    // Clean up empty string numeric fields
    const cleanedData = {
      ...values,
      target_calories: values.target_calories === '' ? undefined : Number(values.target_calories),
      target_protein_g: values.target_protein_g === '' ? undefined : Number(values.target_protein_g),
      target_carbs_g: values.target_carbs_g === '' ? undefined : Number(values.target_carbs_g),
      target_fat_g: values.target_fat_g === '' ? undefined : Number(values.target_fat_g),
      target_fiber_g: values.target_fiber_g === '' ? undefined : Number(values.target_fiber_g),
      target_sodium_mg: values.target_sodium_mg === '' ? undefined : Number(values.target_sodium_mg),
      end_date: values.end_date || undefined,
      review_date: values.review_date || undefined,
      description: values.description || undefined,
    };

    try {
      if (isEditing && dietPlanId) {
        await updateMutation.mutateAsync({
          id: dietPlanId,
          data: cleanedData,
        });
        toast({ title: 'Diet plan updated' });
        router.push(`/allied-health/nutrition/diet-plans/${dietPlanId}`);
      } else {
        const result = await createMutation.mutateAsync(cleanedData as Parameters<typeof createMutation.mutateAsync>[0]);
        toast({ title: 'Diet plan created' });
        router.push(`/allied-health/nutrition/diet-plans/${result.id}`);
      }
    } catch (err) {
      toast({
        title: isEditing ? 'Failed to update diet plan' : 'Failed to create diet plan',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  if (planLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5" />
              Plan Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Consultation Select */}
            <FormField
              control={form.control}
              name="consultation_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Consultation *</FormLabel>
                  <Select
                    value={field.value?.toString()}
                    onValueChange={(val) => field.onChange(Number(val))}
                    disabled={!!consultationId || isEditing}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select consultation..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {consultationsLoading ? (
                        <SelectItem value="loading">
                          Loading...
                        </SelectItem>
                      ) : (
                        consultations?.results.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.order_number} — {c.patient_name} ({c.patient_mrn})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Low Sodium Cardiac Diet, Diabetic Meal Plan..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the diet plan goals and rationale..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dates Row */}
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Leave empty for ongoing</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="review_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Review Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Nutritional Targets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-orange-500" />
              Nutritional Targets
              <HelpPopover content="Set daily nutritional targets for the patient. These are approximate goals based on the patient's assessment." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="target_calories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calories (kcal)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="2000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_protein_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Protein (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="60"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_carbs_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carbohydrates (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="250"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_fat_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fat (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="65"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_fiber_g"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fiber (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="25"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="target_sodium_mg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sodium (mg)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="2300"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Meal Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UtensilsCrossed className="h-5 w-5" />
              Meal Plan
              <HelpPopover content="Describe specific foods, portions, and preparation methods for each meal. Be specific about quantities where possible." />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="breakfast"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breakfast</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. 2 eggs, 1 slice whole wheat toast, 1 fruit..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mid_morning_snack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mid-Morning Snack</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. 1 cup yogurt, handful of nuts..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lunch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lunch</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Grilled chicken, brown rice, steamed vegetables..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="afternoon_snack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Afternoon Snack</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Fresh fruit, crackers with cheese..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dinner"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dinner</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Fish fillet, potato, salad..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bedtime_snack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedtime Snack</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g. Warm milk, 2 biscuits..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Food Guidance & Supplements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Apple className="h-5 w-5" />
              Food Guidance & Supplements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="foods_to_avoid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Ban className="h-3.5 w-3.5 text-destructive" />
                      Foods to Avoid
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List foods the patient should avoid..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="foods_to_include"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5 text-green-600" />
                      Foods to Include
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="List recommended foods to include..."
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="supplements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1">
                    <Pill className="h-3.5 w-3.5" />
                    Supplements
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Iron 100mg daily, Vitamin D 1000 IU..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="special_instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Special Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional instructions for the patient..."
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isEditing ? 'Update Diet Plan' : 'Create Diet Plan'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

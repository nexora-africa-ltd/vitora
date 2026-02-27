/**
 * Social Work Intervention Form
 * Form for creating and editing interventions on a social work case
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { HelpPopover } from '@/components/shared/help-popover';
import {
  HandHelping,
  AlertCircle,
  Check,
  CalendarIcon,
} from 'lucide-react';
import {
  useCreateIntervention,
  useUpdateIntervention,
} from '@/lib/hooks/use-social-work';
import type { SWIntervention } from '@/lib/types/social-work';
import { useToast } from '@/lib/hooks/use-toast';

// =============================================================================
// Constants
// =============================================================================

const INTERVENTION_TYPES = [
  { value: 'COUNSELLING', label: 'Counselling' },
  { value: 'CRISIS_INTERVENTION', label: 'Crisis Intervention' },
  { value: 'SAFETY_PLANNING', label: 'Safety Planning' },
  { value: 'RESOURCE_LINKING', label: 'Resource Linking/Referral' },
  { value: 'FINANCIAL_ASSISTANCE', label: 'Financial Assistance' },
  { value: 'MATERIAL_SUPPORT', label: 'Material Support (food, clothing, etc.)' },
  { value: 'HOUSING_SUPPORT', label: 'Housing Support' },
  { value: 'LEGAL_ADVOCACY', label: 'Legal Advocacy' },
  { value: 'EDUCATIONAL_SUPPORT', label: 'Educational Support' },
  { value: 'VOCATIONAL_SUPPORT', label: 'Vocational/Employment Support' },
  { value: 'FAMILY_MEDIATION', label: 'Family Mediation' },
  { value: 'CHILD_PROTECTION', label: 'Child Protection Action' },
  { value: 'GBV_SUPPORT', label: 'GBV Support Services' },
  { value: 'MENTAL_HEALTH', label: 'Mental Health Referral/Support' },
  { value: 'SUBSTANCE_ABUSE', label: 'Substance Abuse Referral/Support' },
  { value: 'CAREGIVER_TRAINING', label: 'Caregiver Training/Education' },
  { value: 'DISCHARGE_PLANNING', label: 'Discharge Planning' },
  { value: 'FOLLOW_UP', label: 'Follow-up Support' },
  { value: 'OTHER', label: 'Other' },
] as const;

// =============================================================================
// Validation
// =============================================================================

const interventionSchema = z.object({
  intervention_type: z.string().min(1, 'Intervention type is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  objectives: z.string().optional(),
  activities: z.string().optional(),
  planned_date: z.string().min(1, 'Planned date is required'),
  external_agency: z.string().optional(),
  external_contact: z.string().optional(),
  cost: z.coerce.number().min(0).optional().or(z.literal('')),
  cost_source: z.string().optional(),
  notes: z.string().optional(),
});

type InterventionFormData = z.infer<typeof interventionSchema>;

// =============================================================================
// Component
// =============================================================================

interface InterventionFormProps {
  /** The social work case ID this intervention belongs to */
  caseId: number;
  /** Case number for display */
  caseNumber?: string;
  /** Existing intervention for edit mode */
  existingIntervention?: SWIntervention;
  /** Callback on successful submission */
  onSuccess?: () => void;
  /** Callback to cancel/close the form */
  onCancel?: () => void;
}

export function InterventionForm({
  caseId,
  caseNumber,
  existingIntervention,
  onSuccess,
  onCancel,
}: InterventionFormProps) {
  const { toast } = useToast();
  const isEditMode = !!existingIntervention;

  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreateIntervention();
  const updateMutation = useUpdateIntervention();

  const form = useForm<InterventionFormData>({
    resolver: zodResolver(interventionSchema),
    defaultValues: {
      intervention_type: existingIntervention?.intervention_type || '',
      description: existingIntervention?.description || '',
      objectives: '',
      activities: '',
      planned_date:
        existingIntervention?.planned_date || format(new Date(), 'yyyy-MM-dd'),
      external_agency: '',
      external_contact: '',
      cost: undefined,
      cost_source: '',
      notes: existingIntervention?.notes || '',
    },
  });

  const handleSubmit = async (data: InterventionFormData) => {
    setSubmitError(null);

    try {
      const payload = {
        case_id: caseId,
        intervention_type: data.intervention_type,
        description: data.description,
        planned_date: data.planned_date,
        notes: data.notes,
      };

      if (isEditMode && existingIntervention) {
        await updateMutation.mutateAsync({
          id: existingIntervention.id,
          data: payload,
        });
        toast({ title: 'Intervention updated' });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: 'Intervention created' });
      }

      onSuccess?.();
    } catch (err) {
      console.error('Failed to save intervention:', err);
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to save intervention'
      );
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader className="py-3 sm:py-4">
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <HandHelping className="h-4 w-4 sm:h-5 sm:w-5" />
          {isEditMode ? 'Edit Intervention' : 'Add Intervention'}
          {caseNumber && (
            <span className="text-sm font-normal text-muted-foreground">
              — {caseNumber}
            </span>
          )}
          <HelpPopover content="Record a specific intervention such as counselling, crisis response, resource linking, or material support for this case." />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {submitError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4 sm:space-y-6"
          >
            {/* Intervention Type & Date */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="intervention_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Intervention Type *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INTERVENTION_TYPES.map((type) => (
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
                name="planned_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Planned Date *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="date" className="pl-10" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the intervention in detail..."
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Objectives */}
            <FormField
              control={form.control}
              name="objectives"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objectives</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Specific objectives for this intervention..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Activities */}
            <FormField
              control={form.control}
              name="activities"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activities</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Activities to be performed as part of this intervention..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* External Agency Section */}
            <div className="space-y-4 rounded-lg border p-4">
              <h4 className="text-sm font-medium">
                External Agency
                <span className="ml-1 text-muted-foreground font-normal">
                  (if applicable)
                </span>
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="external_agency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agency Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Kenya Red Cross, UNHCR"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="external_contact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Name of contact at agency"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Cost Section */}
            <div className="space-y-4 rounded-lg border p-4">
              <h4 className="text-sm font-medium">
                Cost
                <span className="ml-1 text-muted-foreground font-normal">
                  (for material/financial assistance)
                </span>
              </h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (KES)</FormLabel>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cost_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Funding Source</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Hospital fund, NGO grant"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any additional notes or observations..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {isEditMode ? 'Update Intervention' : 'Create Intervention'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

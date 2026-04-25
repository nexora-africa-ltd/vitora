/**
 * Social History Form Dialog
 *
 * Create/edit social history observations with structured fields.
 */

'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useCreateSocialHistory,
  useUpdateSocialHistory,
  useSocialHistoryObservation,
} from '@/lib/hooks/use-social-history';
import { OBSERVATION_TYPE_OPTIONS, USAGE_STATUS_OPTIONS } from '@/lib/types/social-history';
import type { ObservationType, UsageStatus } from '@/lib/types/social-history';

// =============================================================================
// Form Schema
// =============================================================================

const formSchema = z.object({
  observation_type: z.enum(['ALCOHOL_USE', 'TOBACCO_USE', 'OCCUPATION', 'LIFESTYLE']),
  status: z.enum(['CURRENT', 'FORMER', 'NEVER', 'UNKNOWN']),
  value_text: z.string().default(''),
  effective_date: z.string().min(1, 'Date is required'),
});

type FormValues = z.infer<typeof formSchema>;

// =============================================================================
// Component
// =============================================================================

interface SocialHistoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  observationId?: number;
}

export function SocialHistoryFormDialog({
  open,
  onOpenChange,
  patientId,
  observationId,
}: SocialHistoryFormDialogProps) {
  const isEditing = !!observationId;

  const { data: existing } = useSocialHistoryObservation(
    patientId,
    observationId ?? 0
  );
  const createMutation = useCreateSocialHistory(patientId);
  const updateMutation = useUpdateSocialHistory(patientId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      observation_type: 'ALCOHOL_USE',
      status: 'UNKNOWN',
      value_text: '',
      effective_date: new Date().toISOString().split('T')[0],
    },
  });

  // Pre-fill when editing
  useEffect(() => {
    if (isEditing && existing) {
      reset({
        observation_type: existing.observation_type,
        status: existing.status,
        value_text: existing.value_text,
        effective_date: existing.effective_date,
      });
    }
  }, [isEditing, existing, reset]);

  // Reset on open for new entries
  useEffect(() => {
    if (open && !isEditing) {
      reset({
        observation_type: 'ALCOHOL_USE',
        status: 'UNKNOWN',
        value_text: '',
        effective_date: new Date().toISOString().split('T')[0],
      });
    }
  }, [open, isEditing, reset]);

  const observationType = watch('observation_type');
  const statusValue = watch('status');

  const onSubmit = async (values: FormValues) => {
    if (isEditing && observationId) {
      await updateMutation.mutateAsync({ observationId, data: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    onOpenChange(false);
  };

  // Show status options only for substance-type observations
  const showStatusField = observationType === 'ALCOHOL_USE' || observationType === 'TOBACCO_USE';

  // Dynamic placeholder
  const valuePlaceholders: Record<ObservationType, string> = {
    ALCOHOL_USE: 'e.g., 2 beers/day on weekends',
    TOBACCO_USE: 'e.g., 10 cigarettes/day for 5 years, quit 2023',
    OCCUPATION: 'e.g., Teacher, sits 8 hours/day',
    LIFESTYLE: 'e.g., Regular exercise 3x/week, balanced diet',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEditing ? 'Edit' : 'Add'} Social History</DialogTitle>
            <HelpPopover content="Record structured social history observations. These map to FHIR Observation resources for interoperability." />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Observation Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={observationType}
              onValueChange={(v) => setValue('observation_type', v as ObservationType)}
              disabled={isEditing}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {OBSERVATION_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.observation_type && (
              <p className="text-sm text-destructive">{errors.observation_type.message}</p>
            )}
          </div>

          {/* Usage Status (for substance types) */}
          {showStatusField && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('status', v as UsageStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Details */}
          <div className="space-y-2">
            <Label htmlFor="value_text">Details</Label>
            <Textarea
              id="value_text"
              placeholder={valuePlaceholders[observationType]}
              {...register('value_text')}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Effective Date */}
          <div className="space-y-2">
            <Label htmlFor="effective_date">Date</Label>
            <Input
              id="effective_date"
              type="date"
              {...register('effective_date')}
              max={new Date().toISOString().split('T')[0]}
            />
            {errors.effective_date && (
              <p className="text-sm text-destructive">{errors.effective_date.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            >
              {isSubmitting || createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : isEditing
                  ? 'Update'
                  : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

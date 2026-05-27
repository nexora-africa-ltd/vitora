'use client';

import { useEffect } from 'react';
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
  useCreatePastSurgery,
  useUpdatePastSurgery,
} from '@/lib/hooks/use-past-surgeries';
import { SURGERY_OUTCOME_OPTIONS } from '@/lib/types/past-surgery';
import type { SurgeryOutcome } from '@/lib/types/past-surgery';

const formSchema = z.object({
  procedure_name: z.string().min(1, 'Procedure name is required'),
  procedure_date: z.string().default(''),
  outcome: z.enum(['SUCCESSFUL', 'COMPLICATED', 'UNKNOWN']),
  notes: z.string().default(''),
});

type FormValues = z.infer<typeof formSchema>;

interface PastSurgeryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  editData?: {
    id: number;
    procedure_name: string;
    procedure_date: string | null;
    outcome: SurgeryOutcome;
    notes: string;
  };
}

export function PastSurgeryFormDialog({
  open,
  onOpenChange,
  patientId,
  editData,
}: PastSurgeryFormDialogProps) {
  const isEditing = !!editData;
  const createMutation = useCreatePastSurgery(patientId);
  const updateMutation = useUpdatePastSurgery(patientId);

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
      procedure_name: '',
      procedure_date: '',
      outcome: 'UNKNOWN',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && editData) {
      reset({
        procedure_name: editData.procedure_name,
        procedure_date: editData.procedure_date || '',
        outcome: editData.outcome,
        notes: editData.notes,
      });
    } else if (open && !editData) {
      reset({
        procedure_name: '',
        procedure_date: '',
        outcome: 'UNKNOWN',
        notes: '',
      });
    }
  }, [open, editData, reset]);

  const outcomeValue = watch('outcome');

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      procedure_date: values.procedure_date || null,
    };
    if (isEditing && editData) {
      await updateMutation.mutateAsync({ id: editData.id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEditing ? 'Edit' : 'Add'} Past Surgery</DialogTitle>
            <HelpPopover content="Record a past surgical procedure including the date and outcome. This helps clinicians assess surgical risk and plan future interventions." />
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Procedure Name *</Label>
            <Input {...register('procedure_name')} placeholder="e.g., Appendectomy" />
            {errors.procedure_name && (
              <p className="text-xs text-destructive">{errors.procedure_name.message}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" {...register('procedure_date')} />
            </div>
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select
                value={outcomeValue}
                onValueChange={(v) => setValue('outcome', v as SurgeryOutcome)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURGERY_OUTCOME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea {...register('notes')} placeholder="Additional details..." rows={2} className="resize-none" />
          </div>
          <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

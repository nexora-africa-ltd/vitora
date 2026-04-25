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
import {
  useCreateChronicCondition,
  useUpdateChronicCondition,
} from '@/lib/hooks/use-chronic-conditions';
import { CONDITION_STATUS_OPTIONS } from '@/lib/types/chronic-condition';
import type { ConditionStatus } from '@/lib/types/chronic-condition';

const formSchema = z.object({
  condition_name: z.string().min(1, 'Condition name is required'),
  icd10_code: z.string().default(''),
  status: z.enum(['ACTIVE', 'REMISSION', 'RESOLVED', 'UNKNOWN']),
  onset_date: z.string().default(''),
  notes: z.string().default(''),
});

type FormValues = z.infer<typeof formSchema>;

interface ChronicConditionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  editData?: { id: number; condition_name: string; icd10_code: string; status: ConditionStatus; onset_date: string | null; notes: string };
}

export function ChronicConditionFormDialog({
  open,
  onOpenChange,
  patientId,
  editData,
}: ChronicConditionFormDialogProps) {
  const isEditing = !!editData;
  const createMutation = useCreateChronicCondition(patientId);
  const updateMutation = useUpdateChronicCondition(patientId);

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
      condition_name: '',
      icd10_code: '',
      status: 'ACTIVE',
      onset_date: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && editData) {
      reset({
        condition_name: editData.condition_name,
        icd10_code: editData.icd10_code,
        status: editData.status,
        onset_date: editData.onset_date || '',
        notes: editData.notes,
      });
    } else if (open && !editData) {
      reset({
        condition_name: '',
        icd10_code: '',
        status: 'ACTIVE',
        onset_date: '',
        notes: '',
      });
    }
  }, [open, editData, reset]);

  const statusValue = watch('status');

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      onset_date: values.onset_date || null,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Chronic Condition</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Condition Name *</Label>
            <Input {...register('condition_name')} placeholder="e.g., Type 2 Diabetes Mellitus" />
            {errors.condition_name && (
              <p className="text-xs text-destructive">{errors.condition_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>ICD-10 Code</Label>
              <Input {...register('icd10_code')} placeholder="e.g., E11" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('status', v as ConditionStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Onset Date</Label>
            <Input type="date" {...register('onset_date')} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea {...register('notes')} placeholder="Additional details..." rows={2} className="resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

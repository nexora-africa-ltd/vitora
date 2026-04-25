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
  useCreateCurrentMedication,
  useUpdateCurrentMedication,
} from '@/lib/hooks/use-current-medications';
import { MEDICATION_STATUS_OPTIONS } from '@/lib/types/current-medication';
import type { MedicationStatus } from '@/lib/types/current-medication';

const formSchema = z.object({
  medication_name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().default(''),
  frequency: z.string().default(''),
  route: z.string().default(''),
  status: z.enum(['ACTIVE', 'ON_HOLD', 'STOPPED', 'UNKNOWN']),
  start_date: z.string().default(''),
  notes: z.string().default(''),
});

type FormValues = z.infer<typeof formSchema>;

interface CurrentMedicationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  editData?: {
    id: number;
    medication_name: string;
    dosage: string;
    frequency: string;
    route: string;
    status: MedicationStatus;
    start_date: string | null;
    notes: string;
  };
}

export function CurrentMedicationFormDialog({
  open,
  onOpenChange,
  patientId,
  editData,
}: CurrentMedicationFormDialogProps) {
  const isEditing = !!editData;
  const createMutation = useCreateCurrentMedication(patientId);
  const updateMutation = useUpdateCurrentMedication(patientId);

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
      medication_name: '',
      dosage: '',
      frequency: '',
      route: '',
      status: 'ACTIVE',
      start_date: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && editData) {
      reset({
        medication_name: editData.medication_name,
        dosage: editData.dosage,
        frequency: editData.frequency,
        route: editData.route,
        status: editData.status,
        start_date: editData.start_date || '',
        notes: editData.notes,
      });
    } else if (open && !editData) {
      reset({
        medication_name: '',
        dosage: '',
        frequency: '',
        route: '',
        status: 'ACTIVE',
        start_date: '',
        notes: '',
      });
    }
  }, [open, editData, reset]);

  const statusValue = watch('status');

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      start_date: values.start_date || null,
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
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Current Medication</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Medication Name *</Label>
            <Input {...register('medication_name')} placeholder="e.g., Metformin" />
            {errors.medication_name && (
              <p className="text-xs text-destructive">{errors.medication_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Dosage</Label>
              <Input {...register('dosage')} placeholder="500mg" />
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Input {...register('frequency')} placeholder="BD" />
            </div>
            <div className="space-y-2">
              <Label>Route</Label>
              <Input {...register('route')} placeholder="Oral" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue('status', v as MedicationStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDICATION_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" {...register('start_date')} />
            </div>
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

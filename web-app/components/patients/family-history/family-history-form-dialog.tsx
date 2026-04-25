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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateFamilyHistory,
  useUpdateFamilyHistory,
} from '@/lib/hooks/use-family-history';
import { RELATIONSHIP_OPTIONS } from '@/lib/types/family-history';
import type { FamilyRelationship } from '@/lib/types/family-history';

const formSchema = z.object({
  relationship: z.enum([
    'FATHER',
    'MOTHER',
    'SIBLING',
    'GRANDPARENT',
    'CHILD',
    'UNCLE_AUNT',
    'COUSIN',
    'OTHER',
  ]),
  condition_name: z.string().min(1, 'Condition is required'),
  deceased: z.boolean().default(false),
  age_at_onset: z.string().default(''),
  notes: z.string().default(''),
});

type FormValues = z.infer<typeof formSchema>;

interface FamilyHistoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number;
  editData?: {
    id: number;
    relationship: FamilyRelationship;
    condition_name: string;
    deceased: boolean;
    age_at_onset: string;
    notes: string;
  };
}

export function FamilyHistoryFormDialog({
  open,
  onOpenChange,
  patientId,
  editData,
}: FamilyHistoryFormDialogProps) {
  const isEditing = !!editData;
  const createMutation = useCreateFamilyHistory(patientId);
  const updateMutation = useUpdateFamilyHistory(patientId);

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
      relationship: 'FATHER',
      condition_name: '',
      deceased: false,
      age_at_onset: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (open && editData) {
      reset({
        relationship: editData.relationship,
        condition_name: editData.condition_name,
        deceased: editData.deceased,
        age_at_onset: editData.age_at_onset,
        notes: editData.notes,
      });
    } else if (open && !editData) {
      reset({
        relationship: 'FATHER',
        condition_name: '',
        deceased: false,
        age_at_onset: '',
        notes: '',
      });
    }
  }, [open, editData, reset]);

  const relationshipValue = watch('relationship');
  const deceasedValue = watch('deceased');

  const onSubmit = async (values: FormValues) => {
    if (isEditing && editData) {
      await updateMutation.mutateAsync({ id: editData.id, data: values });
    } else {
      await createMutation.mutateAsync(values);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Family History</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Relationship *</Label>
            <Select
              value={relationshipValue}
              onValueChange={(v) => setValue('relationship', v as FamilyRelationship)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Condition *</Label>
            <Input {...register('condition_name')} placeholder="e.g., Type 2 Diabetes, Hypertension" />
            {errors.condition_name && (
              <p className="text-xs text-destructive">{errors.condition_name.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Age at Onset</Label>
              <Input {...register('age_at_onset')} placeholder="e.g., 55" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={deceasedValue}
                onCheckedChange={(v) => setValue('deceased', v)}
              />
              <Label className="text-sm">Deceased</Label>
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

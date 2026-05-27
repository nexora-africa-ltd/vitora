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
import { DiagnosisCodeInput, emptyDiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import type { DiagnosisCodeValue } from '@/components/shared/diagnosis-code-input';
import { HelpPopover } from '@/components/shared/help-popover';
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

  const [diagnosisCode, setDiagnosisCode] = useState<DiagnosisCodeValue>(emptyDiagnosisCodeValue());

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
      // Restore diagnosis code state for editing
      if (editData.icd10_code) {
        setDiagnosisCode({
          icd10Code: null,
          icd10Display: `${editData.icd10_code} - ${editData.condition_name}`,
          icd11Code: '',
          icd11Display: '',
          snomedCode: '',
          snomedDisplay: '',
        });
      } else {
        setDiagnosisCode(emptyDiagnosisCodeValue());
      }
    } else if (open && !editData) {
      reset({
        condition_name: '',
        icd10_code: '',
        status: 'ACTIVE',
        onset_date: '',
        notes: '',
      });
      setDiagnosisCode(emptyDiagnosisCodeValue());
    }
  }, [open, editData, reset]);

  // Sync diagnosis code selection to form fields
  const handleDiagnosisCodeChange = (val: DiagnosisCodeValue) => {
    setDiagnosisCode(val);
    // Extract the code string and description
    if (val.icd11Code) {
      setValue('icd10_code', val.icd11Code);
      const desc = val.icd11Display?.split(' - ').slice(1).join(' - ') || '';
      if (desc) setValue('condition_name', desc);
    } else if (val.icd10Display) {
      const code = val.icd10Display.split(' - ')[0] || '';
      const desc = val.icd10Display.split(' - ').slice(1).join(' - ') || '';
      setValue('icd10_code', code);
      if (desc) setValue('condition_name', desc);
    } else if (val.snomedCode) {
      setValue('icd10_code', val.snomedCode);
      if (val.snomedDisplay) setValue('condition_name', val.snomedDisplay);
    } else {
      setValue('icd10_code', '');
    }
  };

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
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEditing ? 'Edit' : 'Add'} Chronic Condition</DialogTitle>
            <HelpPopover content="Record a chronic or ongoing condition with ICD-10/ICD-11 coding. Use the diagnosis search to find the correct code, or type the condition name manually." />
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <DiagnosisCodeInput
            value={diagnosisCode}
            onChange={handleDiagnosisCodeChange}
            label="Diagnosis Code"
            showSNOMED={false}
          />
          <div className="space-y-2">
            <Label>Condition Name *</Label>
            <Input {...register('condition_name')} placeholder="e.g., Type 2 Diabetes Mellitus" />
            {errors.condition_name && (
              <p className="text-xs text-destructive">{errors.condition_name.message}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="space-y-2">
              <Label>Onset Date</Label>
              <Input type="date" {...register('onset_date')} />
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
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Condition' : 'Add Condition'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

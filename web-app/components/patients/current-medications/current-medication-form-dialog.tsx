'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, X } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  useCreateCurrentMedication,
  useUpdateCurrentMedication,
} from '@/lib/hooks/use-current-medications';
import { useDrugSearch } from '@/lib/hooks/use-pharmacy';
import { MEDICATION_STATUS_OPTIONS } from '@/lib/types/current-medication';
import type { MedicationStatus } from '@/lib/types/current-medication';
import type { Drug } from '@/lib/types/pharmacy';

const formSchema = z.object({
  drug: z.number().nullable().optional(),
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
    drug?: number | null;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);

  const { data: drugResults, isLoading: isDrugSearching } = useDrugSearch(searchQuery);

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
      drug: null,
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
        drug: editData.drug ?? null,
        medication_name: editData.medication_name,
        dosage: editData.dosage,
        frequency: editData.frequency,
        route: editData.route,
        status: editData.status,
        start_date: editData.start_date || '',
        notes: editData.notes,
      });
      setSelectedDrug(null);
      setSearchQuery('');
    } else if (open && !editData) {
      reset({
        drug: null,
        medication_name: '',
        dosage: '',
        frequency: '',
        route: '',
        status: 'ACTIVE',
        start_date: '',
        notes: '',
      });
      setSelectedDrug(null);
      setSearchQuery('');
    }
  }, [open, editData, reset]);

  const statusValue = watch('status');

  const handleDrugSelect = (drug: Drug) => {
    setSelectedDrug(drug);
    setValue('drug', drug.id);
    setValue('medication_name', `${drug.generic_name} ${drug.strength}`);
    setValue('dosage', drug.strength);
    const formToRoute: Record<string, string> = {
      TABLET: 'Oral',
      CAPSULE: 'Oral',
      SYRUP: 'Oral',
      SUSPENSION: 'Oral',
      SOLUTION: 'Oral',
      INJECTION: 'IM/IV',
      CREAM: 'Topical',
      OINTMENT: 'Topical',
      GEL: 'Topical',
      DROPS: 'Topical',
      INHALER: 'Inhalation',
      SPRAY: 'Nasal/Topical',
      PATCH: 'Transdermal',
      SUPPOSITORY: 'Rectal',
    };
    const route = formToRoute[drug.form] || '';
    if (route) setValue('route', route);
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  const handleClearDrug = () => {
    setSelectedDrug(null);
    setValue('drug', null);
    setValue('medication_name', '');
    setValue('dosage', '');
    setValue('route', '');
  };

  const onSubmit = async (values: FormValues) => {
    const payload = {
      ...values,
      drug: values.drug || undefined,
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
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{isEditing ? 'Edit' : 'Add'} Current Medication</DialogTitle>
            <HelpPopover content="Search the drug catalog to auto-fill medication details, or type a name manually for medications not in the catalog (imports, supplements, traditional medicine)." />
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Drug search with selected state */}
          <div className="space-y-2">
            <Label>Medication Name *</Label>
            {selectedDrug ? (
              <div className="flex flex-wrap items-center gap-2 p-3 rounded-md border bg-muted/50 min-w-0">
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedDrug.code}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {selectedDrug.form}
                  </Badge>
                </div>
                <span className="flex-1 text-sm truncate min-w-0">
                  {selectedDrug.generic_name} {selectedDrug.strength}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleClearDrug}
                  className="shrink-0 h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  {...register('medication_name')}
                  placeholder="Search drug catalog or type name..."
                  className="pl-9"
                  onChange={(e) => {
                    setValue('medication_name', e.target.value);
                    setSearchQuery(e.target.value);
                    if (e.target.value.length >= 2) {
                      setIsSearchOpen(true);
                    } else {
                      setIsSearchOpen(false);
                    }
                  }}
                  onFocus={() => {
                    const val = watch('medication_name');
                    if (val && val.length >= 2) setIsSearchOpen(true);
                  }}
                  onBlur={() => {
                    setTimeout(() => setIsSearchOpen(false), 200);
                  }}
                />

                {/* Drug search results dropdown */}
                {isSearchOpen && searchQuery.length >= 2 && (
                  <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-48 overflow-y-auto">
                    <CardContent className="p-2">
                      {isDrugSearching ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-2 p-2">
                              <Skeleton className="h-5 w-16" />
                              <Skeleton className="h-4 flex-1" />
                            </div>
                          ))}
                        </div>
                      ) : drugResults && drugResults.length > 0 ? (
                        <ul className="space-y-1">
                          {drugResults
                            .filter((d) => d.item_type === 'MEDICATION')
                            .slice(0, 8)
                            .map((drug) => (
                            <li key={drug.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleDrugSelect(drug);
                                }}
                                className="w-full flex items-start gap-2 p-2 rounded-md hover:bg-accent transition-colors text-left"
                              >
                                <Badge variant="outline" className="font-mono shrink-0 text-xs">
                                  {drug.code}
                                </Badge>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-medium truncate">
                                    {drug.generic_name} {drug.strength}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {drug.form}{drug.brand_names?.length ? ` • ${drug.brand_names[0]}` : ''}
                                  </span>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-center text-muted-foreground py-3 text-xs">
                          No drugs found — type the full name to add manually
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
            {errors.medication_name && !selectedDrug && (
              <p className="text-xs text-destructive">{errors.medication_name.message}</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'Saving...' : isEditing ? 'Update Medication' : 'Add Medication'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Direct Dispense Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for direct OTC/emergency dispensing without prescription.
 * Only allows OTC drugs to be dispensed without a prescription.
 */

'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Pill, AlertTriangle, Loader2, Search, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { HelpPopover } from '@/components/shared/help-popover';
import { useToast } from '@/lib/hooks/use-toast';
import { useDrugs, useBatchesForDrug, useCreateDispensing } from '@/lib/hooks/use-pharmacy';
import { usePatients } from '@/lib/hooks/use-patients';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { cn } from '@/lib/utils/cn';

// Form validation schema
const directDispenseSchema = z.object({
  patient_id: z.string().min(1, 'Patient is required'),
  drug_id: z.string().min(1, 'Drug is required'),
  quantity: z.coerce
    .number()
    .min(1, 'Quantity must be at least 1')
    .positive('Quantity must be positive'),
  batch_id: z.string().optional(),
  notes: z.string().optional(),
});

type DirectDispenseFormData = z.infer<typeof directDispenseSchema>;

interface DirectDispenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DirectDispenseDialog({
  isOpen,
  onClose,
  onSuccess,
}: DirectDispenseDialogProps) {
  const { toast } = useToast();
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [drugOpen, setDrugOpen] = useState(false);
  const [drugSearch, setDrugSearch] = useState('');
  const [selectedDrugId, setSelectedDrugId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string; mrn: string } | null>(null);

  // Debounce searches to avoid too many API calls
  const debouncedPatientSearch = useDebounce(patientSearch, 300);
  const debouncedDrugSearch = useDebounce(drugSearch, 300);

  // Fetch patients based on search
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: debouncedPatientSearch,
    page_size: 20,
  });
  const patients = patientsData?.results || [];

  // Fetch OTC drugs only (schedule = 'OTC')
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    schedule: 'OTC',
    is_active: true,
    search: debouncedDrugSearch,
  });
  const otcDrugs = useMemo(() => drugsData?.results || [], [drugsData?.results]);

  // Get selected drug info (need to search separately if not in current results)
  const selectedDrug = useMemo(() => {
    if (!selectedDrugId) return null;
    return otcDrugs.find(d => d.id.toString() === selectedDrugId);
  }, [selectedDrugId, otcDrugs]);

  // Fetch batches for selected drug
  const { data: batches } = useBatchesForDrug(selectedDrugId ? parseInt(selectedDrugId) : 0);

  // Create dispensing mutation
  const createDispensing = useCreateDispensing();

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<DirectDispenseFormData>({
    resolver: zodResolver(directDispenseSchema),
    defaultValues: {
      patient_id: '',
      drug_id: '',
      quantity: 1,
      notes: '',
    },
  });

  const quantity = watch('quantity');

  const availableBatches = batches?.filter(b => b.quantity_available > 0) || [];
  const selectedBatch = availableBatches[0]; // FEFO - first batch

  // Calculate total (use selling_price from batch or reference_price from drug)
  const unitPrice = selectedBatch?.selling_price || selectedDrug?.reference_price || 0;
  const totalCost = quantity * unitPrice;

  // Handle form submission
  const onSubmit = async (data: DirectDispenseFormData) => {
    if (!selectedBatch) {
      toast({
        title: 'No Stock Available',
        description: 'Please select a drug with available stock.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createDispensing.mutateAsync({
        patient: parseInt(data.patient_id),
        drug: parseInt(data.drug_id),
        stock_batch: selectedBatch.id,
        quantity: data.quantity,
        is_direct_sale: true,
        notes: data.notes,
      });

      toast({
        title: 'Dispensing Successful',
        description: `${data.quantity} units of ${selectedDrug?.generic_name} dispensed.`,
      });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Dispensing Failed',
        description: error.response?.data?.error || error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!createDispensing.isPending) {
      reset();
      setSelectedDrugId('');
      setSelectedPatient(null);
      setPatientSearch('');
      setDrugSearch('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" data-testid="direct-dispense-form">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            <DialogTitle>Direct Dispense (OTC)</DialogTitle>
            <HelpPopover content="Dispense over-the-counter medications directly without a prescription. Only OTC-scheduled drugs are available." />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Patient Selection */}
          <div className="space-y-2">
            <Label htmlFor="patient">Patient *</Label>
            <Popover open={patientOpen} onOpenChange={setPatientOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={patientOpen}
                  className="w-full justify-between"
                >
                  {selectedPatient
                    ? `${selectedPatient.name} (${selectedPatient.mrn})`
                    : "Select patient..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search patients by name or MRN..."
                    value={patientSearch}
                    onValueChange={setPatientSearch}
                  />
                  <CommandList>
                    {patientsLoading ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Searching...
                      </div>
                    ) : patients.length === 0 ? (
                      <CommandEmpty>
                        {patientSearch ? 'No patients found.' : 'Type to search patients...'}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {patients.map((patient) => (
                          <CommandItem
                            key={patient.id}
                            value={patient.mrn}
                            onSelect={() => {
                              const patientInfo = {
                                id: patient.id.toString(),
                                name: `${patient.first_name} ${patient.last_name}`,
                                mrn: patient.mrn,
                              };
                              setSelectedPatient(patientInfo);
                              setValue('patient_id', patientInfo.id);
                              setPatientOpen(false);
                            }}
                          >
                            <span>{patient.first_name} {patient.last_name}</span>
                            <span className="ml-2 text-muted-foreground">{patient.mrn}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.patient_id && (
              <p className="text-sm text-destructive">{errors.patient_id.message}</p>
            )}
          </div>

          {/* Drug Selection */}
          <div className="space-y-2">
            <Label htmlFor="drug">Drug (OTC Only) *</Label>
            <Popover open={drugOpen} onOpenChange={setDrugOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={drugOpen}
                  className="w-full justify-between"
                >
                  {selectedDrug
                    ? `${selectedDrug.generic_name} (${selectedDrug.form} ${selectedDrug.strength})`
                    : "Select OTC drug..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search drugs by name..."
                    value={drugSearch}
                    onValueChange={setDrugSearch}
                  />
                  <CommandList className="max-h-[200px]">
                    {drugsLoading ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                        Searching...
                      </div>
                    ) : otcDrugs.length === 0 ? (
                      <CommandEmpty>
                        {drugSearch ? 'No OTC drugs found.' : 'Type to search drugs...'}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {otcDrugs.map((drug) => (
                          <CommandItem
                            key={drug.id}
                            value={drug.id.toString()}
                            onSelect={() => {
                              setSelectedDrugId(drug.id.toString());
                              setValue('drug_id', drug.id.toString());
                              setDrugOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedDrugId === drug.id.toString() ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{drug.generic_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {drug.form} {drug.strength} • Stock: {drug.current_stock ?? 0}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.drug_id && (
              <p className="text-sm text-destructive">{errors.drug_id.message}</p>
            )}
            {selectedDrug && selectedDrug.requires_prescription && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                This drug requires a prescription
              </p>
            )}
          </div>

          {/* Batch Info */}
          {selectedBatch && (
            <div className="p-3 bg-secondary rounded-md text-sm space-y-1">
              <p>
                <span className="text-secondary-foreground/70">Batch:</span>{' '}
                {selectedBatch.batch_number}
              </p>
              <p>
                <span className="text-secondary-foreground/70">Available:</span>{' '}
                {selectedBatch.quantity_available} units
              </p>
              <p>
                <span className="text-secondary-foreground/70">Expiry:</span>{' '}
                {selectedBatch.expiry_date}
              </p>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={selectedBatch?.quantity_available || 999}
              {...register('quantity')}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
          </div>

          {/* Total Cost */}
          {selectedDrug && (
            <div className="p-3 bg-secondary rounded-md">
              <div className="flex justify-between text-sm text-secondary-foreground">
                <span>Unit Price:</span>
                <span>KSH {unitPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-secondary-foreground">
                <span>Total:</span>
                <span>KSH {totalCost.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes..."
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createDispensing.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createDispensing.isPending}>
              {createDispensing.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Dispensing...
                </>
              ) : (
                'Dispense'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

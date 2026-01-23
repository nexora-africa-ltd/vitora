/**
 * Direct Dispense Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for direct OTC/emergency dispensing without prescription.
 * Only allows OTC drugs to be dispensed without a prescription.
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Pill, AlertTriangle, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  const [selectedDrugId, setSelectedDrugId] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<{ id: string; name: string; mrn: string } | null>(null);

  // Debounce patient search to avoid too many API calls
  const debouncedPatientSearch = useDebounce(patientSearch, 300);

  // Fetch patients based on search
  const { data: patientsData, isLoading: patientsLoading } = usePatients({
    search: debouncedPatientSearch,
    page_size: 20,
  });
  const patients = patientsData?.results || [];

  // Fetch OTC drugs only (schedule = 'OTC')
  const { data: drugsData } = useDrugs({ schedule: 'OTC', is_active: true });
  const otcDrugs = drugsData?.results || [];

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

  // Get selected drug info
  const selectedDrug = otcDrugs.find(d => d.id.toString() === selectedDrugId);
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
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg" data-testid="direct-dispense-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Direct Dispense (OTC)
          </DialogTitle>
          <DialogDescription>
            Dispense over-the-counter medications directly without a prescription.
          </DialogDescription>
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
              <PopoverContent className="w-full p-0">
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
            <Select
              value={selectedDrugId}
              onValueChange={(value) => {
                setSelectedDrugId(value);
                setValue('drug_id', value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select OTC drug..." />
              </SelectTrigger>
              <SelectContent>
                {otcDrugs.map((drug) => (
                  <SelectItem key={drug.id} value={drug.id.toString()}>
                    {drug.generic_name} ({drug.form} {drug.strength})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Batch:</span>{' '}
                {selectedBatch.batch_number}
              </p>
              <p>
                <span className="text-muted-foreground">Available:</span>{' '}
                {selectedBatch.quantity_available} units
              </p>
              <p>
                <span className="text-muted-foreground">Expiry:</span>{' '}
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
            <div className="p-3 bg-primary/5 rounded-md">
              <div className="flex justify-between text-sm">
                <span>Unit Price:</span>
                <span>KSH {unitPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold">
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

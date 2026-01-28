/**
 * Dispense Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for dispensing drugs from prescriptions using FEFO logic.
 * Handles batch selection, quantity validation, and counseling notes.
 */

'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Pill, AlertTriangle, Check, Loader2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/lib/hooks/use-toast';
import { useDispenseFromPrescription, useBatchesForDrug } from '@/lib/hooks/use-pharmacy';
import { Prescription, PrescriptionItem, StockBatch } from '@/lib/types/pharmacy';

// Form validation schema
const dispenseSchema = z.object({
  quantity: z.coerce
    .number()
    .min(1, 'Quantity must be at least 1')
    .positive('Quantity must be positive'),
  batch_id: z.string().optional(),
  counseling_notes: z.string().optional(),
});

type DispenseFormData = z.infer<typeof dispenseSchema>;

interface DispenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  prescription: Prescription;
  prescriptionItem: PrescriptionItem;
  onSuccess?: () => void;
}

export function DispenseDialog({
  isOpen,
  onClose,
  prescription,
  prescriptionItem,
  onSuccess,
}: DispenseDialogProps) {
  const { toast } = useToast();
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null);

  // Fetch available batches for the drug
  const { data: batches, isLoading: batchesLoading } = useBatchesForDrug(prescriptionItem.drug);

  // Dispensing mutation
  const dispense = useDispenseFromPrescription();

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<DispenseFormData>({
    resolver: zodResolver(dispenseSchema),
    defaultValues: {
      quantity: prescriptionItem.remaining_quantity,
      counseling_notes: '',
    },
  });

  const quantity = watch('quantity');

  // Auto-select batch with earliest expiry (FEFO) when batches load
  useEffect(() => {
    if (batches && batches.length > 0 && !selectedBatch) {
      const fefoBatch = batches[0]; // Already sorted by expiry_date in API
      if (fefoBatch) {
        setSelectedBatch(fefoBatch);
        setValue('batch_id', fefoBatch.id.toString());
      }
    }
  }, [batches, selectedBatch, setValue]);

  // Handle batch selection change
  const handleBatchChange = (batchId: string) => {
    const batch = batches?.find((b) => b.id.toString() === batchId);
    if (batch) {
      setSelectedBatch(batch);
    }
  };

  // Calculate total price
  const totalPrice = selectedBatch ? (quantity || 0) * (Number(selectedBatch.selling_price) || 0) : 0;

  // Validation checks
  const exceedsStock = selectedBatch && quantity > selectedBatch.quantity_available;
  const exceedsPrescribed = quantity > prescriptionItem.remaining_quantity;

  // Handle form submission
  const onSubmit = async (data: DispenseFormData) => {
    if (exceedsStock) {
      toast({
        title: 'Insufficient Stock',
        description: `Only ${selectedBatch?.quantity_available} units available in selected batch.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await dispense.mutateAsync({
        drug_id: prescriptionItem.drug,
        quantity: data.quantity,
        patient_id: prescription.patient,
        prescription_item_id: prescriptionItem.id,
        counseling_notes: data.counseling_notes,
      });

      toast({
        title: 'Dispensing Successful',
        description: `Dispensed ${data.quantity} ${prescriptionItem.drug_name || 'units'}`,
      });

      reset();
      onSuccess?.();
      onClose();
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
    if (!dispense.isPending) {
      reset();
      setSelectedBatch(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dispensing-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Dispense Medication
          </DialogTitle>
          <DialogDescription>
            Dispensing for {prescription.patient_name} - {prescription.prescription_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Drug Information */}
          <div className="rounded-lg border p-4 space-y-2 bg-muted/50">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-lg">{prescriptionItem.drug_name}</p>
                <p className="text-sm text-muted-foreground">
                  {prescriptionItem.drug_code}
                </p>
              </div>
              {prescription.status === 'PARTIAL' && (
                <Badge variant="outline">Partially Dispensed</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Dosage:</span>{' '}
                <span className="font-medium">{prescriptionItem.dosage}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Frequency:</span>{' '}
                <span className="font-medium">{prescriptionItem.frequency}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Duration:</span>{' '}
                <span className="font-medium">{prescriptionItem.duration}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Prescribed:</span>{' '}
                <span className="font-medium">{prescriptionItem.quantity_prescribed} units</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Remaining:</span>{' '}
                <span className="font-semibold text-primary">
                  {prescriptionItem.remaining_quantity} units
                </span>
              </div>
            </div>

            {prescriptionItem.instructions && (
              <div className="pt-2 border-t">
                <p className="text-sm">
                  <span className="text-muted-foreground">Instructions:</span>{' '}
                  {prescriptionItem.instructions}
                </p>
              </div>
            )}
          </div>

          {/* Batch Selection */}
          <div className="space-y-2">
            <Label htmlFor="batch">
              Batch <span className="text-destructive">*</span>
            </Label>
            {batchesLoading ? (
              <div className="flex items-center gap-2 p-3 border rounded-md">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading batches...</span>
              </div>
            ) : batches && batches.length > 0 ? (
              <>
                <Select
                  {...register('batch_id')}
                  onValueChange={handleBatchChange}
                  value={selectedBatch?.id.toString()}
                  data-testid="batch-select"
                >
                  <SelectTrigger id="batch">
                    <SelectValue placeholder="Select batch (FEFO order)" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch, index) => (
                      <SelectItem key={batch.id} value={batch.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span className="font-medium">{batch.batch_number}</span>
                          {index === 0 && (
                            <Badge variant="outline" className="ml-2">
                              Auto-selected (Earliest Expiry)
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Batch Details */}
                {selectedBatch && (
                  <div className="p-3 border rounded-md bg-muted/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Batch Number:</span>
                      <span className="font-medium">{selectedBatch.batch_number}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Expiry Date:</span>
                      <span className="font-medium">
                        {format(new Date(selectedBatch.expiry_date), 'MMM dd, yyyy')}
                        {selectedBatch.days_to_expiry < 90 && (
                          <Badge variant="destructive" className="ml-2">
                            {selectedBatch.days_to_expiry} days left
                          </Badge>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Available:</span>
                      <span className="font-semibold">
                        {selectedBatch.quantity_available} units
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Unit Price:</span>
                      <span className="font-medium">
                        KSh {(Number(selectedBatch.selling_price) || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 border border-destructive rounded-md bg-destructive/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">No Stock Available</p>
                    <p className="text-sm text-muted-foreground">
                      There are no available batches for this drug. Please receive stock first.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quantity Input */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Quantity to Dispense <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              {...register('quantity')}
              placeholder="Enter quantity"
              disabled={!selectedBatch}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}

            {/* Validation Warnings */}
            {exceedsStock && (
              <div className="flex items-start gap-2 p-3 border border-destructive rounded-md bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">
                  Insufficient stock! Only {selectedBatch?.quantity_available} units available.
                </p>
              </div>
            )}

            {exceedsPrescribed && (
              <div className="flex items-start gap-2 p-3 border border-yellow-600 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <p className="text-sm text-yellow-700 dark:text-yellow-500">
                  Warning: Quantity exceeds prescribed amount ({prescriptionItem.remaining_quantity}{' '}
                  units).
                </p>
              </div>
            )}
          </div>

          {/* Price Display */}
          {selectedBatch && quantity > 0 && (
            <div className="p-4 border rounded-md bg-muted/50">
              <div className="flex items-center justify-between text-lg">
                <span className="text-muted-foreground">Total Cost:</span>
                <span className="font-bold">KSh {totalPrice.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {quantity} units × KSh {(Number(selectedBatch.selling_price) || 0).toFixed(2)}
              </p>
            </div>
          )}

          {/* Counseling Notes */}
          <div className="space-y-2">
            <Label htmlFor="counseling_notes">
              Counseling Notes / Patient Advice
            </Label>
            <Textarea
              id="counseling_notes"
              {...register('counseling_notes')}
              placeholder="Enter counseling notes, instructions, or advice for the patient..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Provide important information for the patient about how to take the medication.
            </p>
          </div>

          {/* Action Buttons */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={dispense.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                dispense.isPending ||
                !selectedBatch ||
                !quantity ||
                quantity <= 0 ||
                exceedsStock ||
                batchesLoading
              }
            >
              {dispense.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Dispensing...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm Dispense
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

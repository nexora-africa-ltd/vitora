/**
 * Dispense Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for dispensing drugs from prescriptions using FEFO logic.
 * Handles batch selection, quantity validation, and counseling notes.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { formatDate } from '@/lib/utils/format';
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
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/api/inventory';
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
  const [selectedStore, setSelectedStore] = useState<string>('');

  // Fetch available batches for the drug
  const { data: batches, isLoading: batchesLoading } = useBatchesForDrug(prescriptionItem.drug);

  // Fetch store locations
  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });

  const stores = useMemo(() => storesData?.results || [], [storesData]);

  // Auto-select store if only one exists
  useEffect(() => {
    if (stores.length === 1 && !selectedStore) {
      setSelectedStore(String(stores[0]!.id));
    }
  }, [stores, selectedStore]);

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
        // Auto-select the batch's store
        if (fefoBatch.store_location) {
          setSelectedStore(String(fefoBatch.store_location));
        }
      }
    }
  }, [batches, selectedBatch, setValue]);

  // Handle batch selection change
  const handleBatchChange = (batchId: string) => {
    const batch = batches?.find((b) => b.id.toString() === batchId);
    if (batch) {
      setSelectedBatch(batch);
      // Auto-set store from the batch
      if (batch.store_location) {
        setSelectedStore(String(batch.store_location));
      }
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
        ...(selectedStore ? { store_location_id: Number(selectedStore) } : {}),
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
      setSelectedStore('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl" data-testid="dispensing-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Dispense Medication
          </DialogTitle>
          <DialogDescription>
            Dispensing for {prescription.patient_name} - {prescription.prescription_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Drug Information */}
          <div className="rounded-md border p-3 bg-muted/50">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold">{prescriptionItem.drug_name}</p>
              {prescription.status === 'PARTIAL' && (
                <Badge variant="outline" className="text-xs">Partial</Badge>
              )}
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{prescriptionItem.dosage} · {prescriptionItem.frequency}</span>
              <span>{prescriptionItem.duration}</span>
              <span className="text-right font-medium text-primary">
                {prescriptionItem.remaining_quantity}/{prescriptionItem.quantity_prescribed} remaining
              </span>
            </div>
            {prescriptionItem.instructions && (
              <p className="text-xs text-muted-foreground mt-1.5 pt-1.5 border-t">
                {prescriptionItem.instructions}
              </p>
            )}
          </div>

          {/* Batch Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="batch" className="text-xs">
              Batch <span className="text-destructive">*</span>
            </Label>
            {batchesLoading ? (
              <div className="flex items-center gap-2 p-2 border rounded-md">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs text-muted-foreground">Loading batches...</span>
              </div>
            ) : batches && batches.length > 0 ? (
              <>
                <Select
                  {...register('batch_id')}
                  onValueChange={handleBatchChange}
                  value={selectedBatch?.id.toString()}
                  data-testid="batch-select"
                >
                  <SelectTrigger id="batch" className="h-9">
                    <SelectValue placeholder="Select batch (FEFO)" />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((batch, index) => (
                      <SelectItem key={batch.id} value={batch.id.toString()}>
                        {batch.batch_number}
                        {index === 0 ? ' (earliest expiry)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Batch Details - compact inline */}
                {selectedBatch && (
                  <div className="grid grid-cols-4 gap-2 p-2 border rounded-md bg-muted/30 text-xs">
                    <div>
                      <span className="text-muted-foreground">Expires</span>
                      <p className="font-medium">
                        {formatDate(selectedBatch.expiry_date, 'MMM dd, yyyy')}
                        {selectedBatch.days_to_expiry < 90 && (
                          <span className="text-destructive ml-1">({selectedBatch.days_to_expiry}d)</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Available</span>
                      <p className="font-semibold">{selectedBatch.quantity_available}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Unit Price</span>
                      <p className="font-medium">KSh {(Number(selectedBatch.selling_price) || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total</span>
                      <p className="font-bold">KSh {totalPrice.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 p-2 border border-destructive rounded-md bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <p className="text-xs text-destructive">No stock available. Receive stock first.</p>
              </div>
            )}
          </div>

          {/* Store Location */}
          {stores.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="store_location" className="text-xs">
                Dispensing From <span className="text-destructive">*</span>
              </Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger id="store_location" className="h-9">
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={String(store.id)}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quantity Input */}
          <div className="space-y-1.5">
            <Label htmlFor="quantity" className="text-xs">
              Quantity <span className="text-destructive">*</span>
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              className="h-9"
              {...register('quantity')}
              placeholder="Enter quantity"
              disabled={!selectedBatch}
            />
            {errors.quantity && (
              <p className="text-xs text-destructive">{errors.quantity.message}</p>
            )}
            {exceedsStock && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Only {selectedBatch?.quantity_available} available in batch.
              </p>
            )}
            {exceedsPrescribed && (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Exceeds prescribed ({prescriptionItem.remaining_quantity} remaining).
              </p>
            )}
          </div>

          {/* Counseling Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="counseling_notes" className="text-xs">Counseling Notes</Label>
            <Textarea
              id="counseling_notes"
              {...register('counseling_notes')}
              placeholder="Instructions or advice for the patient..."
              rows={2}
              className="resize-none"
            />
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
                batchesLoading ||
                (stores.length > 0 && !selectedStore)
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

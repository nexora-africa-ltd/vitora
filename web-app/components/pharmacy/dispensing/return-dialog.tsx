/**
 * Return Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Dialog for processing stock returns from dispensed items.
 * Validates return quantity and requires reason.
 */

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/lib/hooks/use-toast';
import { useReturnStock } from '@/lib/hooks/use-pharmacy';
import { Dispensing } from '@/lib/types/pharmacy';

// Form validation schema
const returnSchema = z.object({
  quantity: z.coerce
    .number()
    .min(1, 'Quantity must be at least 1')
    .positive('Quantity must be positive'),
  reason: z.string().min(1, 'Reason is required'),
});

type ReturnFormData = z.infer<typeof returnSchema>;

interface ReturnDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dispensing: Dispensing | null;
  onSuccess?: () => void;
}

export function ReturnDialog({
  isOpen,
  onClose,
  dispensing,
  onSuccess,
}: ReturnDialogProps) {
  const { toast } = useToast();

  // Return mutation
  const returnStock = useReturnStock();

  // Form setup
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      quantity: 1,
      reason: '',
    },
  });

  const quantity = watch('quantity');
  const maxReturn = dispensing?.quantity || 0;

  // Handle form submission
  const onSubmit = async (data: ReturnFormData) => {
    if (!dispensing) return;

    // Validate quantity doesn't exceed dispensed
    if (data.quantity > maxReturn) {
      toast({
        title: 'Invalid Quantity',
        description: `Cannot return more than ${maxReturn} units (amount dispensed).`,
        variant: 'destructive',
      });
      return;
    }

    try {
      await returnStock.mutateAsync({
        dispensing_id: dispensing.id,
        quantity: data.quantity,
        reason: data.reason,
      });

      toast({
        title: 'Return Processed',
        description: `${data.quantity} units returned to stock successfully.`,
      });

      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Return Failed',
        description: error.response?.data?.error || error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!returnStock.isPending) {
      reset();
      onClose();
    }
  };

  if (!dispensing) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="return-form">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Return Stock
          </DialogTitle>
          <DialogDescription>
            Process a return for dispensed medication. Stock will be restored to inventory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Dispensing Info */}
          <div className="p-3 bg-muted/50 rounded-md space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Drug:</span>
              <span className="font-medium">{dispensing.drug_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Patient:</span>
              <span>{dispensing.patient_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Batch:</span>
              <span className="font-mono text-sm">{dispensing.batch_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Quantity Dispensed:</span>
              <span className="font-semibold">{dispensing.quantity}</span>
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity to Return *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={maxReturn}
              {...register('quantity')}
            />
            {errors.quantity && (
              <p className="text-sm text-destructive">{errors.quantity.message}</p>
            )}
            {quantity > maxReturn && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cannot return more than {maxReturn} units (amount dispensed).
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Maximum: {maxReturn} units
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Return *</Label>
            <Textarea
              id="reason"
              placeholder="e.g., Patient adverse reaction, Wrong medication, Excess quantity..."
              {...register('reason')}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">{errors.reason.message}</p>
            )}
          </div>

          {/* Stock Restoration Notice */}
          <Alert>
            <RotateCcw className="h-4 w-4" />
            <AlertDescription>
              Returned stock will be added back to batch {dispensing.batch_number}.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={returnStock.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={returnStock.isPending || quantity > maxReturn}
            >
              {returnStock.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Return'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

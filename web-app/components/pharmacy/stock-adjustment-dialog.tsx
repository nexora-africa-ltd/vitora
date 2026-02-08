/**
 * Stock Adjustment Dialog Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StockBatch, AdjustmentType } from '@/lib/types/pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const adjustmentSchema = z.object({
  adjustment_type: z.enum([
    'DAMAGED',
    'EXPIRED',
    'LOST',
    'THEFT',
    'CORRECTION',
    'RETURN_TO_SUPPLIER',
    'DONATION',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'DAMAGE',
    'LOSS',
    'RETURN_SUPPLIER',
    'COUNT_CORRECTION',
    'SAMPLE',
    'OTHER',
  ]),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  reason: z.string().min(10, 'Please provide a detailed reason (min 10 characters)'),
  reference_number: z.string().optional(),
});

type AdjustmentFormValues = z.infer<typeof adjustmentSchema>;

interface StockAdjustmentDialogProps {
  batch: StockBatch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  defaultAdjustmentType?: AdjustmentType;
}

export function StockAdjustmentDialog({
  batch,
  open,
  onOpenChange,
  onSuccess,
  defaultAdjustmentType,
}: StockAdjustmentDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AdjustmentFormValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      adjustment_type: defaultAdjustmentType || 'CORRECTION',
      quantity: 0,
      reason: '',
      reference_number: '',
    },
  });

  const onSubmit = async (data: AdjustmentFormValues) => {
    if (!batch) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/pharmacy/adjustments/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stock_batch: batch.id,
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create adjustment');
      }

      const adjustment = await response.json();

      toast({
        title: 'Adjustment Created',
        description: `Stock adjustment for batch ${batch.batch_number} has been recorded.`,
      });

      form.reset();
      onOpenChange(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create adjustment',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!batch) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="adjustment-form">
        <DialogHeader>
          <DialogTitle>Stock Adjustment</DialogTitle>
          <DialogDescription>
            Adjust stock for batch {batch.batch_number} - {batch.drug_name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Current Available Quantity */}
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm text-muted-foreground">Current Available</div>
              <div className="text-2xl font-bold">{batch.quantity_available}</div>
            </div>

            {/* Adjustment Type */}
            <FormField
              control={form.control}
              name="adjustment_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adjustment Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DAMAGED">Damaged</SelectItem>
                      <SelectItem value="EXPIRED">Expired</SelectItem>
                      <SelectItem value="LOST">Lost</SelectItem>
                      <SelectItem value="THEFT">Theft</SelectItem>
                      <SelectItem value="CORRECTION">Stock Correction</SelectItem>
                      <SelectItem value="RETURN_TO_SUPPLIER">Return to Supplier</SelectItem>
                      <SelectItem value="DONATION">Donation</SelectItem>
                      <SelectItem value="TRANSFER_OUT">Transfer Out</SelectItem>
                      <SelectItem value="TRANSFER_IN">Transfer In</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity */}
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 10"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    For reductions, enter positive number. For additions (e.g., corrections), enter positive number.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide detailed reason for this adjustment..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reference Number */}
            <FormField
              control={form.control}
              name="reference_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., ADJ-2026-001" {...field} />
                  </FormControl>
                  <FormDescription>
                    Internal reference or document number
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Adjustment
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

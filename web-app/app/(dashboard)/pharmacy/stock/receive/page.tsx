/**
 * Receive Stock Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Form for receiving new stock batches into inventory
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDrugs } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { StockBatchCreateData } from '@/lib/types/pharmacy';

// Form validation schema
const receiveStockSchema = z.object({
  drug: z.number({ required_error: 'Please select a drug' }),
  batch_number: z.string().min(1, 'Batch number is required'),
  barcode: z.string().optional(),
  quantity_received: z.number().min(1, 'Quantity must be at least 1'),
  manufacture_date: z.string().optional(),
  expiry_date: z.string().min(1, 'Expiry date is required').refine((date) => {
    const expiryDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiryDate > today;
  }, 'Expiry date must be in the future'),
  received_date: z.string().min(1, 'Received date is required'),
  cost_price: z.number().min(0, 'Cost price must be positive'),
  selling_price: z.number().min(0, 'Selling price must be positive'),
  supplier: z.string().optional(),
  purchase_order: z.string().optional(),
  location: z.string().optional(),
});

type ReceiveStockFormValues = z.infer<typeof receiveStockSchema>;

export default function ReceiveStockPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch drugs for dropdown
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    is_active: true,
    page_size: 1000,
  });

  const form = useForm<ReceiveStockFormValues>({
    resolver: zodResolver(receiveStockSchema),
    defaultValues: {
      received_date: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = async (data: ReceiveStockFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/pharmacy/stock/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.batch_number && error.batch_number.includes('already exists')) {
          form.setError('batch_number', {
            type: 'manual',
            message: 'A batch with this number already exists for this drug',
          });
          throw new Error('Duplicate batch number');
        }
        throw new Error(error.message || 'Failed to receive stock');
      }

      const batch = await response.json();

      toast({
        title: 'Stock Received',
        description: `Batch ${batch.batch_number} has been successfully received.`,
      });

      router.push('/pharmacy');
    } catch (error) {
      if (error instanceof Error && error.message !== 'Duplicate batch number') {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/pharmacy')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pharmacy
            </Button>
          </div>
          <h1 className="text-2xl font-bold">Receive Stock</h1>
          <p className="text-muted-foreground">
            Add a new stock batch to inventory
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" role="form" data-testid="stock-receive-form">
            {/* Drug Selection */}
            <FormField
              control={form.control}
              name="drug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Drug</FormLabel>
                  <Select
                    disabled={drugsLoading}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    value={field.value?.toString()}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Select drug">
                        <SelectValue placeholder="Select a drug" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {drugsData?.results.map((drug) => (
                        <SelectItem key={drug.id} value={drug.id.toString()}>
                          {drug.generic_name} {drug.strength} {drug.form}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Batch Number */}
            <FormField
              control={form.control}
              name="batch_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Batch Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., BATCH-2026-001"
                      aria-label="Batch Number"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Unique identifier for this stock batch
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Quantity Received */}
            <FormField
              control={form.control}
              name="quantity_received"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity Received</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 500"
                      aria-label="Quantity"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="manufacture_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Manufacture Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        aria-label="Manufacture Date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        aria-label="Expiry Date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="received_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Received Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        aria-label="Received Date"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cost_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Price (KES)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 3.00"
                        aria-label="Cost Price"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price (KES)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 5.00"
                        aria-label="Selling Price"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Additional Details */}
            <FormField
              control={form.control}
              name="supplier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Kenya Pharma Supplies"
                      aria-label="Supplier"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="purchase_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase Order</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., PO-2026-001"
                      aria-label="Purchase Order"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Storage Location / Shelf</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Shelf A1"
                      aria-label="Location"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Barcode (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 1234567890123"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                aria-label="Save"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Receive Stock
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/pharmacy')}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

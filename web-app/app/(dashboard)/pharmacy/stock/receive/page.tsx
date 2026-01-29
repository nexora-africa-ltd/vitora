/**
 * Receive Stock Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Form for receiving new stock batches into inventory
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
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
import { DatePicker } from '@/components/ui/date-picker';
import {
  Combobox,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
} from '@/components/kibo-ui/combobox';
import { useDrugs, useCreateStockBatch } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { StockBatchCreateData } from '@/lib/types/pharmacy';

// Form validation schema - matches StockBatchCreateData type
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
}) satisfies z.ZodType<StockBatchCreateData>;

type ReceiveStockFormValues = z.infer<typeof receiveStockSchema>;

export default function ReceiveStockPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Drug search state with debounce
  const [drugSearch, setDrugSearch] = useState('');
  const debouncedDrugSearch = useDebounce(drugSearch, 300);

  // Fetch drugs with server-side search
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    is_active: true,
    search: debouncedDrugSearch || undefined,
    page_size: 50, // Reasonable page size with search
  });

  // Create stock batch mutation
  const createStockBatch = useCreateStockBatch();

  const form = useForm<ReceiveStockFormValues>({
    resolver: zodResolver(receiveStockSchema),
    defaultValues: {
      received_date: new Date().toISOString().split('T')[0],
      batch_number: '',
      barcode: '',
      supplier: '',
      purchase_order: '',
      location: '',
    },
  });

  // Prepare drug options for combobox
  const drugOptions = useMemo(() => {
    return (drugsData?.results || []).map((drug) => ({
      label: `${drug.generic_name} ${drug.strength} ${drug.form}`,
      value: drug.id.toString(),
    }));
  }, [drugsData?.results]);

  // Handle drug search input change
  const handleDrugSearchChange = useCallback((value: string) => {
    setDrugSearch(value);
  }, []);

  const onSubmit = async (data: ReceiveStockFormValues) => {
    try {
      const batch = await createStockBatch.mutateAsync(data);

      toast({
        variant: 'success',
        title: 'Stock Received',
        description: `Batch ${batch.batch_number} has been successfully received.`,
      });

      router.push('/pharmacy?tab=inventory');
    } catch (error) {
      // Check for duplicate batch number error
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('batch') && errorMessage.includes('exists')) {
          form.setError('batch_number', {
            type: 'manual',
            message: 'A batch with this number already exists for this drug',
          });
          return;
        }
      }

      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to receive stock',
        variant: 'destructive',
      });
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
            {/* Drug Selection with debounced search */}
            <FormField
              control={form.control}
              name="drug"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Drug <span className="text-destructive">*</span></FormLabel>
                  <Combobox
                    data={drugOptions}
                    type="drug"
                    value={field.value?.toString() || ''}
                    onValueChange={(value) => field.onChange(parseInt(value))}
                  >
                    <FormControl>
                      <ComboboxTrigger
                        className="w-full justify-between"
                        disabled={drugsLoading && !drugSearch}
                        aria-label="Select drug"
                      />
                    </FormControl>
                    <ComboboxContent shouldFilter={false}>
                      <ComboboxInput
                        placeholder="Search drugs..."
                        value={drugSearch}
                        onValueChange={handleDrugSearchChange}
                      />
                      <ComboboxList className="max-h-[300px]">
                        {drugsLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                          </div>
                        ) : drugOptions.length === 0 ? (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            {drugSearch ? 'No drugs found.' : 'Type to search for drugs...'}
                          </div>
                        ) : (
                          <ComboboxGroup>
                            {drugOptions.map((drug) => (
                              <ComboboxItem key={drug.value} value={drug.value}>
                                {drug.label}
                              </ComboboxItem>
                            ))}
                          </ComboboxGroup>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FormDescription>
                    Type to search for a drug from the catalog
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Batch Number */}
            <FormField
              control={form.control}
              name="batch_number"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Batch Number <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., BATCH-2026-001"
                      aria-label="Batch Number"
                      aria-invalid={!!fieldState.error}
                      className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
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
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>Quantity Received <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="e.g., 500"
                      aria-label="Quantity"
                      aria-invalid={!!fieldState.error}
                      className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                      {...field}
                      value={field.value || ''}
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
                      <DatePicker
                        value={field.value ? parseISO(field.value) : undefined}
                        onChange={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        placeholder="Select date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Expiry Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ? parseISO(field.value) : undefined}
                        onChange={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        placeholder="Select date"
                        allowFuture={true}
                        allowPast={false}
                        error={!!fieldState.error}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="received_date"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Received Date <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <DatePicker
                        value={field.value ? parseISO(field.value) : undefined}
                        onChange={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        placeholder="Select date"
                        error={!!fieldState.error}
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
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Cost Price (KES) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 3.00"
                        aria-label="Cost Price"
                        aria-invalid={!!fieldState.error}
                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                        {...field}
                        value={field.value || ''}
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
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Selling Price (KES) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 5.00"
                        aria-label="Selling Price"
                        aria-invalid={!!fieldState.error}
                        className={fieldState.error ? 'border-destructive focus-visible:ring-destructive' : ''}
                        {...field}
                        value={field.value || ''}
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
                disabled={createStockBatch.isPending}
                aria-label="Save"
              >
                {createStockBatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Receive Stock
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/pharmacy')}
                disabled={createStockBatch.isPending}
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

/**
 * Receive Stock Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Form for receiving new stock batches into inventory
 */

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { PageHeader } from '@/components/shared/page-header';
import { useDrugs, useCreateStockBatch } from '@/lib/hooks/use-pharmacy';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/api/inventory';
import { useToast } from '@/lib/hooks/use-toast';
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
  supplier: z.number().optional(),
  purchase_order: z.number().optional(),
  store_location: z.number({ required_error: 'Please select a store' }),
  location: z.string().optional(),
}) satisfies z.ZodType<StockBatchCreateData>;

type ReceiveStockFormValues = z.infer<typeof receiveStockSchema>;

export default function ReceiveStockPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Fetch all active drugs (client-side filtering via cmdk)
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    is_active: true,
    page_size: 100,
  });

  // Fetch store locations
  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });

  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['inventory-suppliers-active'],
    queryFn: () => inventoryApi.listSuppliers({ page_size: 200, is_active: true }),
  });

  // Fetch approved purchase orders (that can still receive stock)
  const { data: posData } = useQuery({
    queryKey: ['inventory-purchase-orders-receivable'],
    queryFn: () => inventoryApi.listPurchaseOrders({ page_size: 200, status: 'APPROVED' }),
  });

  const stores = useMemo(() => storesData?.results || [], [storesData]);
  const suppliers = useMemo(() => suppliersData?.results || [], [suppliersData]);
  const purchaseOrders = useMemo(() => posData?.results || [], [posData]);

  // Create stock batch mutation
  const createStockBatch = useCreateStockBatch();

  const form = useForm<ReceiveStockFormValues>({
    resolver: zodResolver(receiveStockSchema),
    defaultValues: {
      received_date: new Date().toISOString().split('T')[0],
      batch_number: '',
      barcode: '',
      location: '',
      ...(stores.length === 1 ? { store_location: stores[0]!.id } : {}),
    },
  });

  // Prepare drug options for combobox
  const drugOptions = useMemo(() => {
    return (drugsData?.results || []).map((drug) => ({
      label: `${drug.generic_name} ${drug.strength} ${drug.form}`,
      value: drug.id.toString(),
    }));
  }, [drugsData?.results]);

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
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Receive Stock"
        helpContent="Add a new stock batch to inventory. Select a drug from the catalog, enter batch details, pricing, and storage information."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 max-w-2xl mx-auto" role="form" data-testid="stock-receive-form">
          {/* Drug & Batch Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Drug & Batch Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                          disabled={drugsLoading}
                          aria-label="Select drug"
                        />
                      </FormControl>
                      <ComboboxContent>
                        <ComboboxInput placeholder="Search drugs..." />
                        <ComboboxList className="max-h-[300px]">
                          {drugsLoading ? (
                            <div className="flex items-center justify-center py-6">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              <span className="ml-2 text-sm text-muted-foreground">Loading drugs...</span>
                            </div>
                          ) : (
                            <>
                              <ComboboxEmpty>No drugs found.</ComboboxEmpty>
                              <ComboboxGroup>
                                {drugOptions.map((drug) => (
                                  <ComboboxItem key={drug.value} value={drug.value} keywords={[drug.label]}>
                                    {drug.label}
                                  </ComboboxItem>
                                ))}
                              </ComboboxGroup>
                            </>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <FormDescription>
                      Search from {drugsData?.count ?? '...'} drugs in catalog
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Pricing (KES)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cost_price"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Cost Price <span className="text-destructive">*</span></FormLabel>
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
                      <FormLabel>Selling Price <span className="text-destructive">*</span></FormLabel>
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
            </CardContent>
          </Card>

          {/* Supply & Storage Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Supply & Storage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <Select
                        value={field.value?.toString() || ''}
                        onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select supplier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        value={field.value?.toString() || ''}
                        onValueChange={(v) => field.onChange(v ? parseInt(v) : undefined)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select PO" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {purchaseOrders.map((po) => (
                            <SelectItem key={po.id} value={String(po.id)}>
                              {po.po_number} — {po.supplier_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="store_location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store <span className="text-destructive">*</span></FormLabel>
                      <Select
                        value={field.value?.toString() || ''}
                        onValueChange={(v) => field.onChange(parseInt(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select store" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stores.map((store) => (
                            <SelectItem key={store.id} value={String(store.id)}>
                              {store.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shelf / Bin</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Shelf A1, Bin 3"
                          aria-label="Shelf location"
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
                      <FormLabel>Barcode</FormLabel>
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
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/pharmacy')}
              disabled={createStockBatch.isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createStockBatch.isPending}
              className="w-full sm:w-auto"
            >
              {createStockBatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Receive Stock
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

/**
 * Receive Stock Page
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Form for receiving new stock batches into inventory
 */

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, parseISO } from 'date-fns';
import * as z from 'zod';
import { Check, Loader2, Search } from 'lucide-react';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { PageHeader } from '@/components/shared/page-header';
import { useDrugs, useCreateStockBatch } from '@/lib/hooks/use-pharmacy';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/api/inventory';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import type { Drug, StockBatchCreateData } from '@/lib/types/pharmacy';

// Form validation schema - matches StockBatchCreateData type
const receiveStockSchema = z.object({
  drug: z.number({ required_error: 'Please select an item' }),
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

  // Server-side drug search
  const [drugSearch, setDrugSearch] = useState('');
  const [drugOpen, setDrugOpen] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const debouncedDrugSearch = useDebounce(drugSearch, 300);

  // Fetch drugs with server-side search
  const { data: drugsData, isLoading: drugsLoading } = useDrugs({
    is_active: true,
    search: debouncedDrugSearch || undefined,
    page_size: 30,
  });
  const drugs = useMemo(() => drugsData?.results || [], [drugsData]);

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
            message: 'A batch with this number already exists for this item',
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
        title="Quick Receive"
        helpContent="Quickly add a stock batch without a formal purchase order. For procurement-linked receiving, use Inventory → Formal Goods Receipt instead."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6 max-w-2xl mx-auto" role="form" data-testid="stock-receive-form">
          {/* Drug & Batch Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base sm:text-lg">Item & Batch Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drug Selection with server-side search */}
              <FormField
                control={form.control}
                name="drug"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Item <span className="text-destructive">*</span></FormLabel>
                    <Popover open={drugOpen} onOpenChange={setDrugOpen}>
                      <FormControl>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={drugOpen}
                            className="w-full justify-between font-normal"
                          >
                            {selectedDrug
                              ? `${selectedDrug.generic_name} ${selectedDrug.strength || ''} ${selectedDrug.form || ''}`.trim()
                              : 'Select item...'}
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                      </FormControl>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search items by name or code..."
                            value={drugSearch}
                            onValueChange={setDrugSearch}
                          />
                          <CommandList className="max-h-[250px]">
                            {drugsLoading ? (
                              <div className="flex items-center justify-center py-6">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                              </div>
                            ) : drugs.length === 0 ? (
                              <CommandEmpty>
                                {drugSearch ? 'No items found.' : 'Type to search items...'}
                              </CommandEmpty>
                            ) : (
                              <CommandGroup>
                                {drugs.map((drug) => (
                                  <CommandItem
                                    key={drug.id}
                                    value={drug.id.toString()}
                                    onSelect={() => {
                                      setSelectedDrug(drug);
                                      field.onChange(drug.id);
                                      setDrugOpen(false);
                                      setDrugSearch('');
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        selectedDrug?.id === drug.id ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <div className="flex flex-col">
                                      <span>{drug.generic_name} {drug.strength || ''} {drug.form || ''}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {drug.code} · {drug.item_type} · Stock: {drug.current_stock ?? 0}
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
                    <FormDescription>
                      Search items by name, brand, or code
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
              Receive
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

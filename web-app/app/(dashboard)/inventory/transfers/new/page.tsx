'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PageHeader } from '@/components/shared/page-header';
import { inventoryApi } from '@/lib/api/inventory';
import { pharmacyApi } from '@/lib/api/pharmacy';
import { organizationsApi } from '@/lib/api/organizations';
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';
import { useFacility } from '@/lib/context/facility-context';

const transferItemSchema = z.object({
  drug: z.coerce.number().min(1, 'Select a drug'),
  source_batch: z.coerce.number().min(1, 'Select a batch'),
  quantity_requested: z.coerce.number().int().min(1, 'Quantity required'),
  notes: z.string().optional(),
});

const transferFormSchema = z.object({
  source_facility: z.coerce.number().min(1, 'Select source facility'),
  source_store: z.coerce.number().optional(),
  destination_facility: z.coerce.number().min(1, 'Select destination facility'),
  destination_store: z.coerce.number().optional(),
  notes: z.string().optional(),
  items: z.array(transferItemSchema).min(1, 'Add at least one item'),
});

type TransferFormValues = z.infer<typeof transferFormSchema>;

export default function NewStockTransferPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { facility, organization } = useFacility();

  // Batch options keyed by drug ID
  const [batchesByDrug, setBatchesByDrug] = useState<
    Record<number, { id: number; batch_number: string; quantity_available: number; expiry_date: string }[]>
  >({});

  // Fetch org facilities for source/destination
  const { data: facilitiesData } = useQuery({
    queryKey: ['org-facilities-list', organization?.id],
    queryFn: () => organizationsApi.listFacilities(organization!.id),
    enabled: !!organization?.id,
  });
  const facilities = facilitiesData ?? [];

  // Fetch store locations for source/destination stores
  const { data: storesData } = useQuery({
    queryKey: ['inventory-store-locations-all'],
    queryFn: () => inventoryApi.listStoreLocations({ page_size: 200, is_active: true }),
  });
  const stores = storesData?.results || [];

  // Fetch drugs for line items
  const { data: drugsData } = useQuery({
    queryKey: ['pharmacy-drugs-list'],
    queryFn: () => pharmacyApi.listDrugs({ page_size: 500 }),
  });
  const drugs = drugsData?.results || [];

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      source_facility: facility?.id || 0,
      source_store: undefined,
      destination_facility: 0,
      destination_store: undefined,
      notes: '',
      items: [{ drug: 0, source_batch: 0, quantity_requested: 1, notes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const isSubmitting = form.formState.isSubmitting;

  // Fetch batches when drug selection changes
  const fetchBatchesForDrug = useCallback(
    async (drugId: number) => {
      if (!drugId || batchesByDrug[drugId]) return;
      try {
        const batches = await pharmacyApi.getDrugStockBatches(drugId);
        setBatchesByDrug((prev) => ({
          ...prev,
          [drugId]: (batches || [])
            .filter((b: { quantity_available: number }) => b.quantity_available > 0)
            .map((b: { id: number; batch_number: string; quantity_available: number; expiry_date: string }) => ({
              id: b.id,
              batch_number: b.batch_number,
              quantity_available: b.quantity_available,
              expiry_date: b.expiry_date,
            })),
        }));
      } catch {
        // Silently fail — user can retry
      }
    },
    [batchesByDrug],
  );

  async function onSubmit(data: TransferFormValues) {
    try {
      const created = await inventoryApi.createTransfer({
        source_facility: data.source_facility,
        source_store: data.source_store || undefined,
        destination_facility: data.destination_facility,
        destination_store: data.destination_store || undefined,
        notes: data.notes,
        items: data.items.map((item) => ({
          drug: item.drug,
          source_batch: item.source_batch,
          quantity_requested: item.quantity_requested,
          notes: item.notes,
        })),
      });
      toast({ variant: 'success', title: 'Transfer created' });
      router.push(`/inventory/transfers/${created.id}`);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Failed to create transfer',
        description: getApiErrorMessage(err),
      });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="New Stock Transfer"
        helpContent="Create a transfer request to move stock between facilities or store locations. Select drugs and batches from available stock."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Transfer route */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transfer Route</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="source_facility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Facility *</FormLabel>
                      <SearchableSelect
                        options={facilities.map((f) => ({
                          value: String(f.id),
                          label: f.name,
                          sublabel: f.mfl_code,
                        }))}
                        value={String(field.value || '')}
                        onValueChange={field.onChange}
                        placeholder="Select source facility"
                        searchPlaceholder="Search facilities..."
                        emptyMessage="No facilities found."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="destination_facility"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination Facility *</FormLabel>
                      <SearchableSelect
                        options={facilities.map((f) => ({
                          value: String(f.id),
                          label: f.name,
                          sublabel: f.mfl_code,
                        }))}
                        value={String(field.value || '')}
                        onValueChange={field.onChange}
                        placeholder="Select destination facility"
                        searchPlaceholder="Search facilities..."
                        emptyMessage="No facilities found."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="source_store"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Store</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ? String(field.value) : ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Any store (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stores.map((s) => (
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
                  name="destination_store"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Destination Store</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ? String(field.value) : ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Any store (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stores.map((s) => (
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
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Transfer notes (optional)" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Transfer Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ drug: 0, source_batch: 0, quantity_requested: 1, notes: '' })
                }
                className="w-full sm:w-auto"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.formState.errors.items?.root && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.items.root.message}
                </p>
              )}

              {fields.map((field, index) => {
                const drugId = form.watch(`items.${index}.drug`);
                const batches = batchesByDrug[Number(drugId)] || [];

                return (
                  <Card key={field.id} className="border-dashed">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-medium text-muted-foreground">
                          Item {index + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => fields.length > 1 && remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <FormField
                          control={form.control}
                          name={`items.${index}.drug`}
                          render={({ field: drugField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Drug *</FormLabel>
                              <SearchableSelect
                                options={drugs.map((d) => ({
                                  value: String(d.id),
                                  label: d.generic_name,
                                  sublabel: d.code,
                                }))}
                                value={String(drugField.value || '')}
                                onValueChange={(val) => {
                                  drugField.onChange(val);
                                  // Reset batch when drug changes
                                  form.setValue(`items.${index}.source_batch`, 0);
                                  // Fetch batches for this drug
                                  fetchBatchesForDrug(Number(val));
                                }}
                                placeholder="Select drug"
                                searchPlaceholder="Search drugs..."
                                emptyMessage="No drugs found."
                                className="h-9"
                              />
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.source_batch`}
                          render={({ field: batchField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Source Batch *</FormLabel>
                              <Select
                                onValueChange={batchField.onChange}
                                value={batchField.value ? String(batchField.value) : ''}
                                disabled={!drugId || batches.length === 0}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-9">
                                    <SelectValue
                                      placeholder={
                                        !drugId
                                          ? 'Select drug first'
                                          : batches.length === 0
                                            ? 'No batches available'
                                            : 'Select batch'
                                      }
                                    />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {batches.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                      {b.batch_number} (Qty: {b.quantity_available}, Exp:{' '}
                                      {new Date(b.expiry_date).toLocaleDateString()})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity_requested`}
                          render={({ field: qtyField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Quantity *</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  className="h-9"
                                  {...qtyField}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.notes`}
                          render={({ field: notesField }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Notes</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Optional"
                                  className="h-9"
                                  {...notesField}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Transfer
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

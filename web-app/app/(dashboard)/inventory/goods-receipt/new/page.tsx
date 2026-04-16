'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { getApiErrorMessage } from '@/lib/api/client';
import { useToast } from '@/lib/hooks/use-toast';

const grnItemSchema = z.object({
  drug: z.coerce.number().min(1, 'Select a drug'),
  batch_number: z.string().min(1, 'Batch number required'),
  expiry_date: z.string().min(1, 'Expiry date required'),
  manufacture_date: z.string().optional(),
  quantity_received: z.coerce.number().int().min(1, 'Quantity required'),
  cost_price: z.coerce.number().min(0, 'Cost price required'),
  selling_price: z.coerce.number().min(0, 'Selling price required'),
  notes: z.string().optional(),
});

const grnFormSchema = z.object({
  purchase_order: z.coerce.number().optional(),
  supplier: z.coerce.number().min(1, 'Select a supplier'),
  received_date: z.string().min(1, 'Received date required'),
  delivery_note_number: z.string().optional(),
  invoice_number: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(grnItemSchema).min(1, 'Add at least one item'),
});

type GRNFormValues = z.infer<typeof grnFormSchema>;

function formatCurrency(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const emptyItem = {
  drug: 0,
  batch_number: '',
  expiry_date: '',
  manufacture_date: '',
  quantity_received: 1,
  cost_price: 0,
  selling_price: 0,
  notes: '',
};

export default function NewGoodsReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poIdParam = searchParams.get('po');
  const { toast } = useToast();

  // Fetch suppliers
  const { data: suppliersData } = useQuery({
    queryKey: ['inventory-suppliers-list'],
    queryFn: () => inventoryApi.listSuppliers({ page_size: 200, is_active: true }),
  });
  const suppliers = suppliersData?.results || [];

  // Fetch drugs
  const { data: drugsData } = useQuery({
    queryKey: ['pharmacy-drugs-list'],
    queryFn: () => pharmacyApi.listDrugs({ page_size: 500 }),
  });
  const drugs = drugsData?.results || [];

  // Fetch PO if linked
  const { data: linkedPO } = useQuery({
    queryKey: ['inventory-purchase-order', Number(poIdParam)],
    queryFn: () => inventoryApi.getPurchaseOrder(Number(poIdParam)),
    enabled: !!poIdParam,
  });

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<GRNFormValues>({
    resolver: zodResolver(grnFormSchema),
    defaultValues: {
      purchase_order: poIdParam ? Number(poIdParam) : undefined,
      supplier: 0,
      received_date: today,
      delivery_note_number: '',
      invoice_number: '',
      notes: '',
      items: [{ ...emptyItem }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const isSubmitting = form.formState.isSubmitting;

  // Pre-fill supplier from linked PO
  useEffect(() => {
    if (linkedPO) {
      form.setValue('supplier', linkedPO.supplier);
      // Pre-fill line items from PO items
      if (linkedPO.items && linkedPO.items.length > 0) {
        const poItems = linkedPO.items.map((item) => ({
          drug: item.drug,
          batch_number: '',
          expiry_date: '',
          manufacture_date: '',
          quantity_received: item.quantity_ordered,
          cost_price: Number(item.unit_cost),
          selling_price: 0,
          notes: '',
        }));
        form.setValue('items', poItems);
      }
    }
  }, [linkedPO, form]);

  const watchedItems = form.watch('items');
  const grandTotal = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity_received) || 0) * (Number(item.cost_price) || 0),
    0,
  );

  async function onSubmit(data: GRNFormValues) {
    try {
      const created = await inventoryApi.createGoodsReceipt({
        purchase_order: data.purchase_order || null,
        supplier: data.supplier,
        received_date: data.received_date,
        delivery_note_number: data.delivery_note_number,
        invoice_number: data.invoice_number,
        notes: data.notes,
        items: data.items.map((item) => ({
          drug: item.drug,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          manufacture_date: item.manufacture_date || null,
          quantity_received: item.quantity_received,
          cost_price: item.cost_price,
          selling_price: item.selling_price,
        })),
      });
      toast({ variant: 'success', title: 'Goods receipt created' });
      router.push(`/inventory/goods-receipt/${created.id}`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to create GRN', description: getApiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="New Goods Receipt"
        helpContent="Record a delivery of goods. Link to a purchase order or create a standalone receipt. Enter batch numbers and expiry dates for each item."
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Header */}
          <Card>
            <CardHeader><CardTitle className="text-base">Receipt Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier *</FormLabel>
                      <SearchableSelect
                        options={suppliers.map((s) => ({ value: String(s.id), label: s.name, sublabel: s.code }))}
                        value={String(field.value || '')}
                        onValueChange={field.onChange}
                        placeholder="Select supplier"
                        searchPlaceholder="Search suppliers..."
                        emptyMessage="No suppliers found."
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="received_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Received Date *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delivery_note_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Delivery Note #</FormLabel>
                      <FormControl><Input placeholder="DN number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoice_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice #</FormLabel>
                      <FormControl><Input placeholder="Invoice number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {linkedPO && (
                <p className="text-sm text-muted-foreground">
                  Linked to PO <span className="font-mono font-medium">{linkedPO.po_number}</span> — items pre-filled from order.
                </p>
              )}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl><Textarea placeholder="Additional notes" rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...emptyItem })}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {form.formState.errors.items?.root && (
                <p className="text-sm text-destructive">{form.formState.errors.items.root.message}</p>
              )}
              {fields.map((field, index) => {
                const qty = Number(watchedItems[index]?.quantity_received) || 0;
                const cost = Number(watchedItems[index]?.cost_price) || 0;
                const lineTotal = qty * cost;
                return (
                  <div key={field.id} className="rounded-lg border p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
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
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.drug`}
                        render={({ field: drugField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Drug *</FormLabel>
                            <SearchableSelect
                              options={drugs.map((d) => ({ value: String(d.id), label: d.generic_name, sublabel: d.code }))}
                              value={String(drugField.value || '')}
                              onValueChange={drugField.onChange}
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
                        name={`items.${index}.batch_number`}
                        render={({ field: batchField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Batch # *</FormLabel>
                            <FormControl><Input placeholder="e.g. BN2026001" className="h-9" {...batchField} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.expiry_date`}
                        render={({ field: expiryField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Expiry Date *</FormLabel>
                            <FormControl><Input type="date" className="h-9" {...expiryField} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity_received`}
                        render={({ field: qtyField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Quantity *</FormLabel>
                            <FormControl><Input type="number" min={1} className="h-9" {...qtyField} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.cost_price`}
                        render={({ field: costField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Cost Price *</FormLabel>
                            <FormControl><Input type="number" min={0} step="0.01" className="h-9" {...costField} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`items.${index}.selling_price`}
                        render={({ field: sellField }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Selling Price *</FormLabel>
                            <FormControl><Input type="number" min={0} step="0.01" className="h-9" {...sellField} /></FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                    <p className="text-xs text-right text-muted-foreground">
                      Line total: <span className="font-medium text-foreground">{formatCurrency(lineTotal)}</span>
                    </p>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2 border-t">
                <p className="text-sm font-bold">Grand Total: {formatCurrency(grandTotal)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Goods Receipt
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

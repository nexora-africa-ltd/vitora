'use client';

import { useState } from 'react';
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

const poItemSchema = z.object({
  drug: z.coerce.number().min(1, 'Select an item'),
  drug_name: z.string().optional(), // display only
  quantity_ordered: z.coerce.number().int().min(1, 'Quantity required'),
  unit_cost: z.coerce.number().min(0, 'Unit cost required'),
  notes: z.string().optional(),
});

const poFormSchema = z.object({
  supplier: z.coerce.number().min(1, 'Select a supplier'),
  order_date: z.string().min(1, 'Order date required'),
  expected_delivery_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1, 'Add at least one item'),
});

type POFormValues = z.infer<typeof poFormSchema>;

function formatCurrency(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
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

  const today = new Date().toISOString().split('T')[0];

  const form = useForm<POFormValues>({
    resolver: zodResolver(poFormSchema),
    defaultValues: {
      supplier: 0,
      order_date: today,
      expected_delivery_date: '',
      notes: '',
      items: [{ drug: 0, drug_name: '', quantity_ordered: 1, unit_cost: 0, notes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const isSubmitting = form.formState.isSubmitting;

  const watchedItems = form.watch('items');
  const grandTotal = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity_ordered) || 0) * (Number(item.unit_cost) || 0),
    0,
  );

  async function onSubmit(data: POFormValues) {
    try {
      const created = await inventoryApi.createPurchaseOrder({
        supplier: data.supplier,
        order_date: data.order_date,
        expected_delivery_date: data.expected_delivery_date || null,
        notes: data.notes,
        items: data.items.map((item) => ({
          drug: item.drug,
          quantity_ordered: item.quantity_ordered,
          unit_cost: item.unit_cost,
          notes: item.notes,
        })),
      });
      toast({ variant: 'success', title: 'Purchase order created' });
      router.push(`/inventory/purchase-orders/${created.id}`);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Failed to create PO', description: getApiErrorMessage(err) });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <PageHeader title="New Purchase Order" helpContent="Create a purchase order for a supplier. Add line items with items, quantities, and prices." />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Header info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
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
                  name="order_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order Date *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="expected_delivery_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
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
              <CardTitle className="text-base">Line Items</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ drug: 0, drug_name: '', quantity_ordered: 1, unit_cost: 0, notes: '' })}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {form.formState.errors.items?.root && (
                <p className="text-sm text-destructive mb-3 px-4 sm:px-0">{form.formState.errors.items.root.message}</p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Item *</th>
                      <th className="pb-2 pr-3 font-medium w-24 text-right">Qty *</th>
                      <th className="pb-2 pr-3 font-medium w-32 text-right">Unit Cost *</th>
                      <th className="pb-2 pr-3 font-medium w-32 text-right">Total</th>
                      <th className="pb-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const qty = Number(watchedItems[index]?.quantity_ordered) || 0;
                      const cost = Number(watchedItems[index]?.unit_cost) || 0;
                      const lineTotal = qty * cost;
                      return (
                        <tr key={field.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.drug`}
                              render={({ field: drugField }) => (
                                <FormItem className="space-y-0">
                                  <SearchableSelect
                                    options={drugs.map((d) => ({ value: String(d.id), label: d.generic_name, sublabel: d.code }))}
                                    value={String(drugField.value || '')}
                                    onValueChange={drugField.onChange}
                                    placeholder="Select item"
                                    searchPlaceholder="Search items..."
                                    emptyMessage="No items found."
                                    className="h-8 text-xs"
                                  />
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity_ordered`}
                              render={({ field: qtyField }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" min={1} className="h-8 text-xs text-right" {...qtyField} />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.unit_cost`}
                              render={({ field: costField }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Input type="number" min={0} step="0.01" className="h-8 text-xs text-right" {...costField} />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </td>
                          <td className="py-2 pr-3 text-right text-xs font-medium">{formatCurrency(lineTotal)}</td>
                          <td className="py-2">
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t">
                      <td colSpan={3} className="py-2.5 text-right font-medium">Grand Total</td>
                      <td className="py-2.5 text-right font-bold">{formatCurrency(grandTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
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
              Create Purchase Order
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

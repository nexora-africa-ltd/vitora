/**
 * Create Supplier Bill Page
 *
 * Form for manually creating a supplier bill. Optionally links to a GRN
 * (which auto-populates items). Also allows manual line item entry.
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { billingApi } from '@/lib/api/billing';
import { inventoryApi } from '@/lib/api/inventory';
import { useToast } from '@/lib/hooks/use-toast';
import type { SupplierBillCreateData, SupplierBillItemCreateData } from '@/lib/types/billing';

interface LineItem {
  description: string;
  quantity: string;
  unit_cost: string;
}

export default function NewSupplierBillPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = React.useState('');
  const [supplierInvoiceRef, setSupplierInvoiceRef] = React.useState('');
  const [issueDate, setIssueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [items, setItems] = React.useState<LineItem[]>([{ description: '', quantity: '1', unit_cost: '' }]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch suppliers for dropdown
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => inventoryApi.listSuppliers({ page_size: 100, is_active: true }),
  });

  const suppliers = suppliersData?.results ?? [];

  const addItem = () => {
    setItems([...items, { description: '', quantity: '1', unit_cost: '' }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    const updated = [...items];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, [field]: value };
      setItems(updated);
    }
  };

  const totalAmount = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const cost = parseFloat(item.unit_cost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) {
      toast({ title: 'Validation Error', description: 'Please select a supplier.', variant: 'destructive' });
      return;
    }
    if (items.length === 0 || !items[0]?.description) {
      toast({ title: 'Validation Error', description: 'Please add at least one line item.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const billItems: SupplierBillItemCreateData[] = items
        .filter((item) => item.description && item.unit_cost)
        .map((item) => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit_cost: item.unit_cost,
        }));

      const createData: SupplierBillCreateData = {
        supplier: Number(supplierId),
        issue_date: issueDate,
      };
      if (supplierInvoiceRef) createData.supplier_invoice_ref = supplierInvoiceRef;
      if (dueDate) createData.due_date = dueDate;
      if (notes) createData.notes = notes;
      if (billItems.length > 0) createData.items = billItems;

      const bill = await billingApi.supplierBills.create(createData);

      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] });
      toast({ title: 'Bill created', description: `Bill ${bill.bill_number} created successfully.` });
      router.push(`/transactions/supplier-bills/${bill.id}`);
    } catch {
      toast({ title: 'Error', description: 'Failed to create supplier bill.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Supplier Bill"
        helpContent="Create a new bill for goods or services received from a supplier. Link to GRN for automatic 3-way matching."
      />

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Bill Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplier">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="invoice-ref">Supplier Invoice Reference</Label>
                <Input
                  id="invoice-ref"
                  value={supplierInvoiceRef}
                  onChange={(e) => setSupplierInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-2024-001"
                />
              </div>
              <div>
                <Label htmlFor="issue-date">Issue Date *</Label>
                <Input
                  id="issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="due-date">Due Date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this bill"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Line Items</CardTitle>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5">
                  {index === 0 && <Label className="text-xs">Description</Label>}
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    placeholder="Item description"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  {index === 0 && <Label className="text-xs">Qty</Label>}
                  <Input
                    type="number"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  {index === 0 && <Label className="text-xs">Unit Cost</Label>}
                  <Input
                    type="number"
                    step="0.01"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2 flex items-center gap-2">
                  {index === 0 && <Label className="text-xs invisible">Actions</Label>}
                  <span className="text-sm font-medium flex-1 text-right">
                    {((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0)).toFixed(2)}
                  </span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2 border-t">
              <p className="text-sm font-semibold">
                Total: KES {totalAmount.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Bill'}
          </Button>
        </div>
      </form>
    </div>
  );
}

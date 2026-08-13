/**
 * Add Invoice Item Dialog
 * Dialog for adding a line item to an invoice
 */
'use client';

import React, { useState } from 'react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import type { BillingCatalogItem, InvoiceItemCreateData } from '@/lib/types/billing';

interface AddInvoiceItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItems: BillingCatalogItem[];
  onSubmit: (data: InvoiceItemCreateData) => void;
  isLoading?: boolean;
}

export function AddInvoiceItemDialog({
  open,
  onOpenChange,
  catalogItems,
  onSubmit,
  isLoading = false,
}: AddInvoiceItemDialogProps) {
  const [serviceOpen, setServiceOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BillingCatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleCatalogItemSelect = (item: BillingCatalogItem) => {
    setSelectedItem(item);
    setUnitPrice(item.unit_price);
    setServiceOpen(false);
  };

  const defaultUnitPrice = selectedItem ? parseFloat(selectedItem.unit_price || '0') : 0;
  const typedUnitPrice = parseFloat(unitPrice || '0');
  const useOverride = selectedItem
    ? Number.isFinite(typedUnitPrice) && Math.abs(typedUnitPrice - defaultUnitPrice) > 0.0001
    : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const payload: InvoiceItemCreateData = {
      catalog_ref: {
        kind: selectedItem.kind,
        id: selectedItem.id,
      },
      quantity,
    };

    if (useOverride) {
      payload.price_mode = 'override';
      payload.unit_price_override = unitPrice;
      payload.override_reason = 'Manual invoice price override';
    }

    onSubmit(payload);
  };

  const handleClose = () => {
    setSelectedItem(null);
    setQuantity(1);
    setUnitPrice('');
    setSearchQuery('');
    onOpenChange(false);
  };

  const filteredCatalogItems = catalogItems.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAmount = selectedItem
    ? parseFloat(unitPrice || '0') * quantity
    : 0;

  const kindLabel: Record<BillingCatalogItem['kind'], string> = {
    service: 'Service',
    procedure_catalog: 'Procedure',
    lab_test_catalog: 'Lab',
    imaging_procedure: 'Imaging',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
          <DialogDescription>
            Search and select a billable catalog item to add to the invoice
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catalog Selector */}
          <div className="space-y-2">
            <Label>Catalog Item *</Label>
            <Popover open={serviceOpen} onOpenChange={setServiceOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serviceOpen}
                  className="w-full justify-between"
                >
                  {selectedItem ? (
                    <span className="truncate">{selectedItem.name}</span>
                  ) : (
                    <span className="text-secondary-foreground">Select catalog item...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search services, procedures, lab, imaging..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No catalog items found.</CommandEmpty>
                    <CommandGroup>
                      {filteredCatalogItems.map((item) => (
                        <CommandItem
                          key={`${item.kind}-${item.id}`}
                          value={`${item.name} ${item.code}`}
                          onSelect={() => handleCatalogItemSelect(item)}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedItem?.id === item.id && selectedItem?.kind === item.kind
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-primary-foreground">
                              {kindLabel[item.kind]} {item.code ? `- ${item.code}` : ''}
                            </div>
                          </div>
                          <div className="text-sm text-secondary-foreground">
                            {formatCurrency(parseFloat(item.unit_price))}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity *</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
            />
          </div>

          {/* Unit Price */}
          <div className="space-y-2">
            <Label htmlFor="unit_price">Unit Price (KES) *</Label>
            <Input
              id="unit_price"
              type="number"
              step="0.01"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
            {selectedItem && useOverride && (
              <p className="text-xs text-amber-700">
                Price differs from catalog default; this will be sent as an override.
              </p>
            )}
          </div>

          {/* Total */}
          {selectedItem && (
            <div className="rounded-md bg-muted p-3">
              <div className="flex justify-between text-sm">
                <span>Total Amount:</span>
                <span className="font-semibold">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!selectedItem || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

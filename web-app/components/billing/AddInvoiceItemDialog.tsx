/**
 * Add Invoice Item Dialog
 * Dialog for adding a line item to an invoice
 */
'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { SearchableSelect, SearchableSelectOption } from '@/components/ui/searchable-select';
import { useBillingCatalogItems } from '@/lib/hooks/billing';
import type { BillingCatalogItem, InvoiceItemCreateData } from '@/lib/types/billing';

interface AddInvoiceItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItems: BillingCatalogItem[];
  invoiceId?: number;
  onSubmit: (data: InvoiceItemCreateData) => void;
  isLoading?: boolean;
}

export function AddInvoiceItemDialog({
  open,
  onOpenChange,
  catalogItems,
  invoiceId,
  onSubmit,
  isLoading = false,
}: AddInvoiceItemDialogProps) {
  const [selectedItem, setSelectedItem] = useState<BillingCatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loadedItems, setLoadedItems] = useState<BillingCatalogItem[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

  const { data: remoteCatalogItemsData, isLoading: isCatalogLoading } = useBillingCatalogItems({
    search: deferredSearchQuery || undefined,
    is_active: 'all',
    invoice_id: invoiceId,
    page,
    page_size: 150,
  });

  const kindLabel: Record<BillingCatalogItem['kind'], string> = {
    service: 'Service',
    procedure_catalog: 'Procedure',
    lab_test_catalog: 'Lab',
    imaging_procedure: 'Imaging',
  };

  const handleCatalogItemSelect = (item: BillingCatalogItem) => {
    setSelectedItem(item);
    setUnitPrice(item.unit_price || '');
  };

  const resetDialogState = useCallback(() => {
    setSelectedItem(null);
    setQuantity(1);
    setUnitPrice('');
    setSearchQuery('');
    setPage(1);
    setLoadedItems([]);
  }, []);

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
    resetDialogState();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      resetDialogState();
    }
  }, [open, resetDialogState]);

  useEffect(() => {
    setPage(1);
    setLoadedItems([]);
  }, [deferredSearchQuery, open]);

  useEffect(() => {
    const incoming = remoteCatalogItemsData?.results ?? [];
    if (incoming.length === 0) {
      if (!deferredSearchQuery && page === 1 && catalogItems.length > 0) {
        setLoadedItems(catalogItems);
      }
      return;
    }

    if (page === 1) {
      setLoadedItems(incoming);
      return;
    }

    setLoadedItems((prev) => {
      const seen = new Set(prev.map((item) => `${item.kind}:${item.id}`));
      const merged = [...prev];
      for (const item of incoming) {
        const key = `${item.kind}:${item.id}`;
        if (!seen.has(key)) {
          merged.push(item);
          seen.add(key);
        }
      }
      return merged;
    });
  }, [catalogItems, deferredSearchQuery, page, remoteCatalogItemsData?.results]);

  const availableCatalogItems = useMemo(() => {
    return loadedItems;
  }, [loadedItems]);

  const selectableItems = availableCatalogItems.filter(
    (item) => item.is_active || (item.kind === 'service' && item.unit_price === null)
  );

  const options: SearchableSelectOption[] = selectableItems.map((item) => ({
    value: `${item.kind}:${item.id}`,
    label: item.name,
    sublabel: `${kindLabel[item.kind]}${item.code ? ` - ${item.code}` : ''}${item.unit_price === null ? ' - Pending tariff' : ''}`,
  }));

  const selectedValue = selectedItem ? `${selectedItem.kind}:${selectedItem.id}` : undefined;

  const handleSelectValue = (value: string) => {
    const [kind, idText] = value.split(':');
    const id = Number(idText);
    const match = selectableItems.find((item) => item.kind === kind && item.id === id);
    if (match) {
      handleCatalogItemSelect(match);
    }
  };

  const selectedPendingTariff = selectedItem?.kind === 'service' && selectedItem.unit_price === null;
  const hasPendingPrice = Number(unitPrice) > 0;
  const canLoadMore = !!remoteCatalogItemsData?.next;
  const totalMatchingResults = remoteCatalogItemsData?.count ?? selectableItems.length;

  const totalAmount = selectedItem ? parseFloat(unitPrice || '0') * quantity : 0;

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
            <SearchableSelect
              options={options}
              value={selectedValue}
              onValueChange={handleSelectValue}
              placeholder="Select catalog item..."
              searchPlaceholder="Search services, procedures, lab, imaging..."
              emptyMessage="No catalog items found."
              isLoading={isCatalogLoading}
              maxVisibleOptions={500}
              onSearchChange={(nextQuery) => {
                setSearchQuery(nextQuery);
              }}
              footer={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={!canLoadMore || isCatalogLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  {isCatalogLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : canLoadMore ? (
                    'Load more results'
                  ) : (
                    'No more results'
                  )}
                </Button>
              }
            />
            <p className="text-xs text-muted-foreground">
              Showing {selectableItems.length.toLocaleString()} of{' '}
              {totalMatchingResults.toLocaleString()} matching results
            </p>
            {selectedItem && (
              <p className="text-xs text-muted-foreground">
                {kindLabel[selectedItem.kind]} {selectedItem.code ? `- ${selectedItem.code} - ` : ''}
                {selectedItem.unit_price
                  ? formatCurrency(parseFloat(selectedItem.unit_price))
                  : 'Pending tariff'}
              </p>
            )}
            {selectedPendingTariff && (
              <p className="text-xs text-amber-700">
                This service is pending tariff. Set a unit price to activate and bill it.
              </p>
            )}
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
                <span className="font-semibold">{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedItem || isLoading || (selectedPendingTariff && !hasPendingPrice)}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

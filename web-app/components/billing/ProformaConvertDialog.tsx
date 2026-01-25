/**
 * Proforma Convert Dialog
 * Dialog for converting proforma invoices to regular invoices
 * Supports full conversion (all items) and partial conversion (selected items)
 */
'use client';

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  ArrowRightCircle,
  FileText,
  Package,
  AlertCircle,
  Check,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Invoice, InvoiceItem } from '@/lib/types/billing';

// ============================================================================
// Types
// ============================================================================

interface ProformaConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onConvertFull: (invoice: Invoice) => void;
  onConvertPartial: (invoice: Invoice, itemIds: number[]) => void;
  isLoading?: boolean;
}

type ConversionMode = 'full' | 'partial';

// ============================================================================
// Helper: Format KES
// ============================================================================

function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ============================================================================
// Item Row Component
// ============================================================================

interface ItemRowProps {
  item: InvoiceItem;
  isSelected: boolean;
  onToggle: (itemId: number) => void;
  disabled?: boolean;
}

function ItemRow({ item, isSelected, onToggle, disabled }: ItemRowProps) {
  const isConverted = item.is_converted;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isConverted
          ? 'bg-gray-50 border-gray-200 opacity-60'
          : isSelected
          ? 'bg-purple-50 border-purple-200'
          : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <Checkbox
        id={`item-${item.id}`}
        checked={isSelected}
        onCheckedChange={() => onToggle(item.id)}
        disabled={disabled || isConverted}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`item-${item.id}`}
            className={`font-medium cursor-pointer ${isConverted ? 'line-through text-gray-400' : ''}`}
          >
            {item.service_name || item.description}
          </Label>
          {isConverted && (
            <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500">
              Already Converted
            </Badge>
          )}
        </div>
        {item.description && item.description !== item.service_name && (
          <p className="text-sm text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      <div className="text-right">
        <div className="text-sm text-muted-foreground">
          {item.quantity} × {formatKES(parseFloat(item.unit_price))}
        </div>
        <div className="font-medium">{formatKES(parseFloat(item.line_total))}</div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ProformaConvertDialog({
  open,
  onOpenChange,
  invoice,
  onConvertFull,
  onConvertPartial,
  isLoading = false,
}: ProformaConvertDialogProps) {
  const [mode, setMode] = useState<ConversionMode>('full');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());

  // Get convertible items (not already converted)
  const { convertibleItems, convertedItems, allItems } = useMemo(() => {
    const items = invoice?.items || [];
    return {
      allItems: items,
      convertibleItems: items.filter((item) => !item.is_converted),
      convertedItems: items.filter((item) => item.is_converted),
    };
  }, [invoice?.items]);

  // Calculate totals
  const selectedItems = useMemo(() => {
    if (mode === 'full') {
      return convertibleItems;
    }
    return convertibleItems.filter((item) => selectedItemIds.has(item.id));
  }, [mode, convertibleItems, selectedItemIds]);

  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + parseFloat(item.line_total), 0);
  }, [selectedItems]);

  const fullTotal = useMemo(() => {
    return convertibleItems.reduce((sum, item) => sum + parseFloat(item.line_total), 0);
  }, [convertibleItems]);

  // Handlers
  const handleToggleItem = (itemId: number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedItemIds(new Set(convertibleItems.map((item) => item.id)));
  };

  const handleDeselectAll = () => {
    setSelectedItemIds(new Set());
  };

  const handleSubmit = () => {
    if (!invoice) return;

    if (mode === 'full') {
      onConvertFull(invoice);
    } else {
      const itemIds = Array.from(selectedItemIds);
      if (itemIds.length > 0) {
        onConvertPartial(invoice, itemIds);
      }
    }
  };

  const handleClose = () => {
    setMode('full');
    setSelectedItemIds(new Set());
    onOpenChange(false);
  };

  // Validation
  const canSubmit =
    mode === 'full'
      ? convertibleItems.length > 0
      : selectedItemIds.size > 0;

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightCircle className="h-5 w-5 text-purple-600" />
            Convert Proforma to Invoice
          </DialogTitle>
          <DialogDescription>
            Convert proforma <span className="font-mono font-medium">{invoice.invoice_number}</span> to a regular invoice.
          </DialogDescription>
        </DialogHeader>

        {/* Conversion Mode Selection */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === 'full' ? 'default' : 'outline'}
            className={mode === 'full' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            onClick={() => setMode('full')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Full Conversion
          </Button>
          <Button
            type="button"
            variant={mode === 'partial' ? 'default' : 'outline'}
            className={mode === 'partial' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            onClick={() => setMode('partial')}
          >
            <Package className="h-4 w-4 mr-2" />
            Partial Conversion
          </Button>
        </div>

        <Separator />

        {/* Info Alert */}
        {mode === 'full' ? (
          <Alert className="bg-purple-50 border-purple-200">
            <Check className="h-4 w-4 text-purple-600" />
            <AlertDescription>
              All {convertibleItems.length} item(s) will be converted to a new invoice.
              {convertedItems.length > 0 && (
                <span className="block mt-1 text-muted-foreground">
                  {convertedItems.length} item(s) were already converted and will be skipped.
                </span>
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Select the items you want to convert. Remaining items will stay on the proforma.
            </AlertDescription>
          </Alert>
        )}

        {/* Items List */}
        {mode === 'partial' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedItemIds.size} of {convertibleItems.length} items selected
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={selectedItemIds.size === convertibleItems.length}
                >
                  Select All
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={selectedItemIds.size === 0}
                >
                  Deselect All
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 max-h-64 pr-4">
              <div className="space-y-2">
                {allItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isSelected={selectedItemIds.has(item.id)}
                    onToggle={handleToggleItem}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {/* Summary */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items to convert:</span>
            <span className="font-medium">{selectedItems.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Patient:</span>
            <span className="font-medium">{invoice.patient_name}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between">
            <span className="font-medium">New Invoice Total:</span>
            <span className="font-bold text-lg text-purple-700">
              {formatKES(mode === 'full' ? fullTotal : selectedTotal)}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <ArrowRightCircle className="h-4 w-4 mr-2" />
                Convert {mode === 'full' ? 'All Items' : `${selectedItemIds.size} Item(s)`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

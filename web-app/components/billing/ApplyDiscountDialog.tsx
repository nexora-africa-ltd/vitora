/**
 * Apply Discount Dialog
 * Dialog for applying a discount to an invoice
 */
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { HelpPopover } from '@/components/shared/help-popover';
import { formatCurrency } from '@/lib/utils/format';
import type { Invoice, ApplyDiscountData, DiscountType } from '@/lib/types/billing';

interface ApplyDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onSubmit: (data: ApplyDiscountData) => void;
  isLoading?: boolean;
}

export function ApplyDiscountDialog({
  open,
  onOpenChange,
  invoice,
  onSubmit,
  isLoading = false,
}: ApplyDiscountDialogProps) {
  const [discountType, setDiscountType] = useState<DiscountType>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountValue) return;

    onSubmit({
      discount_type: discountType,
      discount_value: discountValue,
      discount_reason: discountReason || undefined,
    });
  };

  const handleClose = () => {
    setDiscountType('PERCENTAGE');
    setDiscountValue('');
    setDiscountReason('');
    onOpenChange(false);
  };

  // Calculate discount preview
  const subtotal = invoice ? parseFloat(invoice.subtotal) : 0;
  const discountAmount =
    discountType === 'PERCENTAGE'
      ? (subtotal * (parseFloat(discountValue) || 0)) / 100
      : parseFloat(discountValue) || 0;
  const newTotal = Math.max(0, subtotal - discountAmount);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Apply Discount</DialogTitle>
            <HelpPopover content="Apply a percentage or fixed amount discount to this invoice. The discount will be reflected in the invoice total." />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Discount Type */}
          <div className="space-y-2">
            <Label>Discount Type</Label>
            <RadioGroup
              value={discountType}
              onValueChange={(value) => setDiscountType(value as DiscountType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="PERCENTAGE" id="percentage" />
                <Label htmlFor="percentage" className="cursor-pointer">
                  Percentage
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="FIXED" id="fixed" />
                <Label htmlFor="fixed" className="cursor-pointer">
                  Fixed Amount
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Discount Value */}
          <div className="space-y-2">
            <Label htmlFor="discount_value">
              {discountType === 'PERCENTAGE' ? 'Percentage (%)' : 'Amount (KES)'}
            </Label>
            <Input
              id="discount_value"
              name="discount_value"
              type="number"
              step={discountType === 'PERCENTAGE' ? '0.1' : '0.01'}
              min={0}
              max={discountType === 'PERCENTAGE' ? 100 : subtotal}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === 'PERCENTAGE' ? '10' : '500.00'}
            />
          </div>

          {/* Discount Reason */}
          <div className="space-y-2">
            <Label htmlFor="discount_reason">Reason (Optional)</Label>
            <Textarea
              id="discount_reason"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Enter reason for discount..."
              rows={2}
            />
          </div>

          {/* Preview */}
          {discountValue && (
            <div className="rounded-md bg-muted p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>
                  Discount ({discountType === 'PERCENTAGE' ? `${discountValue}%` : 'Fixed'}):
                </span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>New Total:</span>
                <span>{formatCurrency(newTotal)}</span>
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
            <Button type="submit" disabled={!discountValue || isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

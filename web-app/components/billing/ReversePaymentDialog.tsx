/**
 * Reverse Payment Dialog
 * Confirmation dialog with reason input for reversing a completed payment.
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HelpPopover } from '@/components/shared/help-popover';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { Payment } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

interface ReversePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
  onReverse: (paymentId: number, reason: string) => void;
  isLoading?: boolean;
}

export function ReversePaymentDialog({
  open,
  onOpenChange,
  payment,
  onReverse,
  isLoading = false,
}: ReversePaymentDialogProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!payment || !reason.trim()) return;
    onReverse(payment.id, reason.trim());
  };

  const handleClose = () => {
    setReason('');
    onOpenChange(false);
  };

  if (!payment) return null;

  const canSubmit = reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Reverse Payment</DialogTitle>
            <HelpPopover content="Reversing a payment marks it as reversed and restores the invoice balance. This action is audit-logged and cannot be undone." />
          </div>
        </DialogHeader>

        <Alert variant="destructive" className="mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You are about to reverse payment{' '}
            <span className="font-mono font-medium">{payment.payment_reference}</span>{' '}
            for <span className="font-medium">{formatCurrency(parseFloat(payment.amount))}</span>.
            This will restore the invoice balance.
          </AlertDescription>
        </Alert>

        <div className="grid gap-2 py-2">
          <Label htmlFor="reverse-reason">Reason *</Label>
          <Textarea
            id="reverse-reason"
            placeholder="e.g. Duplicate payment, incorrect amount, patient refund request…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          {reason.length > 0 && reason.trim().length < 3 && (
            <p className="text-xs text-destructive">Reason must be at least 3 characters</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reversing…
              </>
            ) : (
              'Reverse Payment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

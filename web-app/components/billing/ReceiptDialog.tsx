/**
 * Receipt Dialog Component
 * Displays payment receipt in a modal/dialog with print and export options
 * Uses ReceiptView as the single source of truth for receipt rendering
 */
'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, X } from 'lucide-react';
import { ReceiptView } from './ReceiptView';
import type { Receipt } from '@/lib/types/billing';

// Re-export ReceiptData for backwards compatibility
export type ReceiptData = Receipt;

interface ReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  receipt: Receipt | null;
  isLoading?: boolean;
}

export function ReceiptDialog({
  open,
  onClose,
  receipt,
  isLoading = false,
}: ReceiptDialogProps) {
  if (!receipt && !isLoading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Payment Receipt
          </DialogTitle>
          <DialogDescription>
            Receipt generated successfully
          </DialogDescription>
        </DialogHeader>

        {/* Use ReceiptView as the single source of truth */}
        <ReceiptView
          receipt={receipt}
          isLoading={isLoading}
          showActionButtons={false}
        />

        {/* Dialog-specific close button */}
        {!isLoading && receipt && (
          <div className="flex justify-end pt-4">
            <Button variant="default" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

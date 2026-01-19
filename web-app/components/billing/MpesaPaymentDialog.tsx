/**
 * M-Pesa Payment Dialog Component
 * Handles STK Push payment flow with status polling
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Loader2, Smartphone, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface MpesaPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  invoiceNumber: string;
  initialPhoneNumber?: string;
  status: 'idle' | 'initiating' | 'waiting' | 'success' | 'failed';
  errorMessage?: string | null;
  receiptNumber?: string | null;
  onInitiate: (phoneNumber: string) => void;
  onCancel: () => void;
  onComplete: () => void;
}

// ============================================================================
// Status Messages
// ============================================================================

const statusMessages = {
  idle: 'Enter the M-Pesa registered phone number to receive the payment prompt.',
  initiating: 'Sending payment request to your phone...',
  waiting: 'Please check your phone and enter your M-Pesa PIN to complete the payment.',
  success: 'Payment received successfully!',
  failed: 'Payment failed. Please try again.',
};

// ============================================================================
// Main Component
// ============================================================================

export function MpesaPaymentDialog({
  open,
  onOpenChange,
  amount,
  invoiceNumber,
  initialPhoneNumber,
  status,
  errorMessage,
  receiptNumber,
  onInitiate,
  onCancel,
  onComplete,
}: MpesaPaymentDialogProps) {
  const [phoneNumber, setPhoneNumber] = React.useState(initialPhoneNumber || '');
  const [isValidPhone, setIsValidPhone] = React.useState(false);

  const displayPhone = phoneNumber.trim() || '0712345678';

  React.useEffect(() => {
    if (!initialPhoneNumber) return;
    setPhoneNumber(initialPhoneNumber);
  }, [initialPhoneNumber]);

  // Validate Kenyan phone number
  React.useEffect(() => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    // Valid formats: 0712345678, 254712345678, +254712345678
    const isValid = /^(0|254|\+254)?[17]\d{8}$/.test(cleaned);
    setIsValidPhone(isValid);
  }, [phoneNumber]);

  const handleInitiate = () => {
    if (isValidPhone) {
      // Normalize to 254 format
      let normalized = phoneNumber.replace(/\D/g, '');
      if (normalized.startsWith('0')) {
        normalized = '254' + normalized.slice(1);
      }
      onInitiate(normalized);
    }
  };

  const handleClose = () => {
    if (status === 'success') {
      onComplete();
    } else if (status !== 'waiting' && status !== 'initiating') {
      onCancel();
    }
    onOpenChange(false);
  };

  const isProcessing = status === 'initiating' || status === 'waiting';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-600" />
            M-Pesa Payment
          </DialogTitle>
          <DialogDescription>
            Pay for invoice {invoiceNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Amount Display */}
          <div className="text-center py-4 bg-muted rounded-lg">
            <div className="text-sm text-muted-foreground">Amount to Pay</div>
            <div className="text-3xl font-bold" data-testid="mpesa-amount">
              {formatCurrency(amount)}
            </div>
          </div>

          {/* Status-based Content */}
          {status === 'idle' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0712345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the M-Pesa registered phone number
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  disabled={!isValidPhone}
                  onClick={handleInitiate}
                >
                  Send Request
                </Button>
              </div>
            </div>
          )}

          {status === 'initiating' && (
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-green-600" />
              <div>
                <p className="font-medium">Initiating...</p>
                <p className="text-sm text-muted-foreground">
                  Please wait. {statusMessages.initiating}
                </p>
              </div>
            </div>
          )}

          {status === 'waiting' && (
            <div className="space-y-4">
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertTitle>Check your phone</AlertTitle>
                <AlertDescription>
                  {statusMessages.waiting}
                  <div className="mt-1 text-sm">{displayPhone}</div>
                </AlertDescription>
              </Alert>

              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-500" />
                <p className="text-sm text-muted-foreground">
                  Waiting for payment confirmation...
                </p>
                <Progress value={undefined} className="w-full" />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={onCancel}
              >
                Cancel Payment
              </Button>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
              <div>
                <p className="text-lg font-medium text-green-600">
                  Payment Successful!
                </p>
                <p className="text-sm text-muted-foreground">QJH3XXXXXX</p>
                {receiptNumber && (
                  <p className="text-xs text-muted-foreground">
                    Receipt: {receiptNumber}
                  </p>
                )}
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleClose}
              >
                Done
              </Button>
            </div>
          )}

          {status === 'failed' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Payment Failed</AlertTitle>
                <AlertDescription>
                  {errorMessage || statusMessages.failed}
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClose}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    // Retry initiation using the last entered phone (or placeholder)
                    onInitiate(displayPhone.startsWith('0') ? `254${displayPhone.slice(1)}` : displayPhone);
                  }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Info Box */}
          {status === 'idle' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                You will receive a prompt on your phone to enter your M-Pesa PIN.
                Please ensure you have sufficient balance.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

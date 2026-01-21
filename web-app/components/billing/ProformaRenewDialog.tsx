/**
 * Proforma Renew Dialog
 * Dialog for renewing expired proforma invoices
 * Allows setting a custom validity period
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  RefreshCw,
  Calendar,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { addDays, format } from 'date-fns';
import type { Invoice } from '@/lib/types/billing';

// ============================================================================
// Types
// ============================================================================

interface ProformaRenewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onRenew: (invoice: Invoice, validityDays?: number) => void;
  isLoading?: boolean;
  defaultValidityDays?: number;
}

// ============================================================================
// Main Component
// ============================================================================

export function ProformaRenewDialog({
  open,
  onOpenChange,
  invoice,
  onRenew,
  isLoading = false,
  defaultValidityDays = 30,
}: ProformaRenewDialogProps) {
  const [validityDays, setValidityDays] = useState(defaultValidityDays.toString());
  const [useCustomValidity, setUseCustomValidity] = useState(false);

  // Calculate new expiry date
  const newExpiryDate = useMemo(() => {
    const days = parseInt(validityDays, 10);
    if (isNaN(days) || days <= 0) return null;
    return addDays(new Date(), days);
  }, [validityDays]);

  // Handlers
  const handleSubmit = () => {
    if (!invoice) return;
    
    const days = useCustomValidity ? parseInt(validityDays, 10) : undefined;
    onRenew(invoice, days);
  };

  const handleClose = () => {
    setValidityDays(defaultValidityDays.toString());
    setUseCustomValidity(false);
    onOpenChange(false);
  };

  const handleValidityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow positive integers
    if (value === '' || /^\d+$/.test(value)) {
      setValidityDays(value);
      setUseCustomValidity(true);
    }
  };

  // Validation
  const isValidDays = parseInt(validityDays, 10) > 0;
  const canSubmit = isValidDays;

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-amber-600" />
            Renew Proforma Invoice
          </DialogTitle>
          <DialogDescription>
            Renew expired proforma <span className="font-mono font-medium">{invoice.invoice_number}</span> with a new validity period.
          </DialogDescription>
        </DialogHeader>

        {/* Expired Info */}
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This proforma expired on{' '}
            <span className="font-medium">
              {invoice.valid_until ? formatDate(invoice.valid_until) : 'unknown date'}
            </span>
            . Renewing will create a new validity period.
          </AlertDescription>
        </Alert>

        <Separator />

        {/* Validity Period Input */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="validity-days">Validity Period (days)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="validity-days"
                type="text"
                inputMode="numeric"
                value={validityDays}
                onChange={handleValidityChange}
                placeholder="30"
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days from today</span>
            </div>
          </div>

          {/* Quick select buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={validityDays === '7' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setValidityDays('7');
                setUseCustomValidity(true);
              }}
            >
              7 days
            </Button>
            <Button
              type="button"
              variant={validityDays === '14' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setValidityDays('14');
                setUseCustomValidity(true);
              }}
            >
              14 days
            </Button>
            <Button
              type="button"
              variant={validityDays === '30' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setValidityDays('30');
                setUseCustomValidity(true);
              }}
            >
              30 days
            </Button>
            <Button
              type="button"
              variant={validityDays === '60' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setValidityDays('60');
                setUseCustomValidity(true);
              }}
            >
              60 days
            </Button>
          </div>
        </div>

        {/* New Expiry Preview */}
        {newExpiryDate && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <Calendar className="h-4 w-4" />
              <span className="font-medium">New Expiry Date</span>
            </div>
            <div className="mt-1 text-lg font-bold text-amber-800">
              {format(newExpiryDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-amber-600">
              <Clock className="h-3 w-3" />
              {validityDays} days from today
            </div>
          </div>
        )}

        {/* Original Proforma Info */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Patient:</span>
            <span className="font-medium">{invoice.patient_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items:</span>
            <span className="font-medium">{invoice.items?.length || 0}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium">
              KES {parseFloat(invoice.total_amount).toLocaleString('en-KE', {
                minimumFractionDigits: 2,
              })}
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
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Renewing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Renew Proforma
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

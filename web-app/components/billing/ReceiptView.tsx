/**
 * Receipt View Component
 * Displays printable receipt with amount in words
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Printer, Download } from 'lucide-react';
import type { Receipt } from '@/lib/types/billing';
import { formatDateTime } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface ReceiptViewProps {
  receipt: Receipt | null;
  isLoading: boolean;
  onPrint?: () => void;
  onDownload?: () => void;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
}

// ============================================================================
// Amount to Words Helper
// ============================================================================

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  
  if (num < 0) return 'Negative ' + numberToWords(-num);
  if (num < 20) return ones[num] || '';
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + (ones[num % 10] || '') : '');
  if (num < 1000) return (ones[Math.floor(num / 100)] || '') + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  if (num < 1000000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 1000000000) return numberToWords(Math.floor(num / 1000000)) + ' Million' + (num % 1000000 ? ' ' + numberToWords(num % 1000000) : '');
  
  return numberToWords(Math.floor(num / 1000000000)) + ' Billion' + (num % 1000000000 ? ' ' + numberToWords(num % 1000000000) : '');
}

export function amountToWords(amount: number, currency: string = 'KES'): string {
  const wholeAmount = Math.floor(amount);
  const cents = Math.round((amount - wholeAmount) * 100);
  
  let result = numberToWords(wholeAmount) + ' ' + (currency === 'KES' ? 'Kenya Shillings' : currency);
  
  if (cents > 0) {
    result += ' and ' + numberToWords(cents) + ' Cents';
  }
  
  return result + ' Only';
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ReceiptSkeleton() {
  return (
    <div role="status" aria-label="Loading receipt">
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 mx-auto" />
        <Skeleton className="h-4 w-64 mx-auto" />
        <Separator />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      <span className="sr-only">Loading receipt...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ReceiptView({
  receipt,
  isLoading,
  onPrint,
  onDownload,
  facilityName = 'Demo Health Facility',
  facilityAddress = '123 Health Street, Nairobi',
  facilityPhone = '+254 700 123 456',
}: ReceiptViewProps) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  if (isLoading) {
    return <ReceiptSkeleton />;
  }

  if (!receipt) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No receipt data available
      </div>
    );
  }

  const amount = parseFloat(receipt.amount);
  const amountDisplay = `KES ${amount.toFixed(2)}`;

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        {onDownload && (
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        )}
      </div>

      {/* Receipt Content */}
      <Card ref={printRef} className="max-w-md mx-auto print:shadow-none print:border-none">
        <CardHeader className="text-center pb-2">
          <h2 className="text-xl font-bold">{facilityName}</h2>
          <p className="text-sm text-muted-foreground">{facilityAddress}</p>
          <p className="text-sm text-muted-foreground">{facilityPhone}</p>
          <Separator className="my-4" />
          <h3 className="text-lg font-semibold">PAYMENT RECEIPT</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          {receipt.is_voided && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Voided</div>
              {receipt.void_reason && (
                <div className="text-muted-foreground">{receipt.void_reason}</div>
              )}
            </div>
          )}
          {/* Receipt Details */}
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <div className="text-muted-foreground">Receipt No:</div>
            <div className="font-medium text-right" data-testid="receipt-number">
              {receipt.receipt_number}
            </div>
            
            <div className="text-muted-foreground">Date:</div>
            <div className="text-right">{formatDateTime(receipt.receipt_date)}</div>
            
            <div className="text-muted-foreground">Invoice:</div>
            <div className="text-right">{receipt.payment_reference}</div>
            
            <div className="text-muted-foreground">Patient:</div>
            <div className="text-right">{receipt.patient_name}</div>
            
            {receipt.patient_mrn && (
              <>
                <div className="text-muted-foreground">MRN:</div>
                <div className="text-right">{receipt.patient_mrn}</div>
              </>
            )}
            
            <div className="text-muted-foreground">Payment Method:</div>
            <div className="text-right capitalize">
              {receipt.payment_method.replace('_', ' ')}
            </div>
          </div>

          <Separator />

          {/* Amount */}
          <div className="text-center space-y-2">
            <div className="text-sm text-muted-foreground">Amount Paid</div>
            <div className="text-3xl font-bold" data-testid="receipt-amount">
              {amountDisplay}
            </div>
            <div
              className="text-sm text-muted-foreground italic"
              data-testid="amount-in-words"
            >
              {amountToWords(amount)}
            </div>
          </div>

          <Separator />

          {/* Footer */}
          <div className="text-center text-xs text-muted-foreground space-y-1">
            <p>Thank you for your payment</p>
            <p>This is a computer-generated receipt</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Receipt View Component
 * Displays printable receipt with line items and amount in words
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Printer, Download } from 'lucide-react';
import type { Receipt, ReceiptLineItem } from '@/lib/types/billing';
import { formatDateTime } from '@/lib/utils/format';
import { printReceipt } from '@/lib/documents';

// ============================================================================
// Types
// ============================================================================

interface ReceiptViewProps {
  receipt: Receipt | null;
  isLoading: boolean;
  onDownload?: () => void;
  facilityName?: string;
  facilityAddress?: string;
  facilityPhone?: string;
  /** Hide action buttons (Print/Download) - useful when embedded in dialog */
  showActionButtons?: boolean;
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
  onDownload,
  facilityName = 'Demo Health Facility',
  facilityAddress = '123 Health Street, Nairobi',
  facilityPhone = '+254 700 123 456',
  showActionButtons = true,
}: ReceiptViewProps) {
  const printRef = React.useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (receipt) {
      // Use the centralized document print system
      printReceipt({
        receipt,
        facility: {
          name: facilityName,
          address: facilityAddress,
          phone: facilityPhone,
        },
      });
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

  // Use facility info from receipt if available, otherwise use defaults
  const displayFacilityName = receipt.facility_name || facilityName;
  const displayFacilityAddress = receipt.facility_address || facilityAddress;
  const displayFacilityPhone = receipt.facility_phone || facilityPhone;

  const amount = parseFloat(receipt.amount);
  const amountDisplay = `KES ${amount.toFixed(2)}`;
  // Use amount_in_words from receipt if available, otherwise calculate
  const amountInWords = receipt.amount_in_words || amountToWords(amount);

  return (
    <div className="space-y-4">
      {/* Action Buttons - conditionally rendered */}
      {showActionButtons && (
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
      )}

      {/* Receipt Content */}
      <Card ref={printRef} className="max-w-lg mx-auto print:shadow-none print:border-none">
        <CardHeader className="text-center pb-2">
          <h2 className="text-xl font-bold">{displayFacilityName}</h2>
          <p className="text-sm text-muted-foreground">{displayFacilityAddress}</p>
          <p className="text-sm text-muted-foreground">{displayFacilityPhone}</p>
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

            {receipt.payment_reference && (
              <>
                <div className="text-muted-foreground">Invoice:</div>
                <div className="text-right">{receipt.payment_reference}</div>
              </>
            )}

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

            {/* Served By */}
            {(receipt.received_by_username || receipt.issued_by_username) && (
              <>
                <div className="text-muted-foreground">Served By:</div>
                <div className="text-right">
                  {receipt.received_by_username || receipt.issued_by_username}
                </div>
              </>
            )}

            {/* Till/Payment Point */}
            {(receipt.payment_point_name || receipt.payment_point_code) && (
              <>
                <div className="text-muted-foreground">Till/Point:</div>
                <div className="text-right">
                  {receipt.payment_point_name || receipt.payment_point_code}
                </div>
              </>
            )}
          </div>

          <Separator />

          {/* Line Items Table */}
          {receipt.line_items && receipt.line_items.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Services</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-center w-16">Qty</TableHead>
                    <TableHead className="text-xs text-right w-24">Price</TableHead>
                    <TableHead className="text-xs text-right w-24">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipt.line_items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-sm py-2">{item.description}</TableCell>
                      <TableCell className="text-sm text-center py-2">{item.quantity}</TableCell>
                      <TableCell className="text-sm text-right py-2">
                        {parseFloat(item.unit_price).toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-right py-2 font-medium">
                        {parseFloat(item.line_total).toLocaleString('en-KE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm font-semibold">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-bold" data-testid="receipt-amount">
                      KES {amount.toLocaleString('en-KE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
              <div
                className="text-sm text-muted-foreground italic text-center pt-2"
                data-testid="amount-in-words"
              >
                {amountInWords}
              </div>
            </div>
          ) : (
            /* Fallback: Simple amount display when no line items */
            <div className="text-center space-y-2">
              <div className="text-sm text-muted-foreground">Amount Paid</div>
              <div className="text-3xl font-bold" data-testid="receipt-amount">
                {amountDisplay}
              </div>
              <div
                className="text-sm text-muted-foreground italic"
                data-testid="amount-in-words"
              >
                {amountInWords}
              </div>
            </div>
          )}

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

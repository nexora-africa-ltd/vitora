/**
 * Payment Receipt Page
 * Displays receipt for a completed payment with print/export functionality
 */
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Printer,
  AlertCircle,
  CheckCircle2,
  Building2,
  User,
  Calendar,
  CreditCard,
  FileText,
  UserCheck,
  Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/utils/format';
import { usePaymentReceipt } from '@/lib/hooks/billing';
import { ExportButton } from '@/components/shared/export-button';
import { PageHeader } from '@/components/shared/page-header';

function LoadingSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto px-1">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export default function ReceiptPage() {
  const params = useParams();
  const paymentId = Number(params.id);

  const { data: receipt, isLoading, error } = usePaymentReceipt(paymentId);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !receipt) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load receipt. The payment may not exist or the receipt has not been generated.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const receiptData = [
    { label: 'Receipt Number', value: receipt.receipt_number },
    { label: 'Patient', value: receipt.patient_name },
    { label: 'MRN', value: receipt.patient_mrn },
    { label: 'Amount', value: formatCurrency(parseFloat(receipt.amount)) },
    { label: 'Payment Method', value: receipt.payment_method },
    { label: 'Date', value: format(new Date(receipt.receipt_date), 'PPP p') },
    { label: 'Served By', value: receipt.received_by_username || receipt.issued_by_username || 'N/A' },
    { label: 'Till/Point', value: receipt.payment_point_name || receipt.payment_point_code || 'N/A' },
  ];

  return (
    <ScrollArea className="h-[calc(100vh-4rem)]">
      <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto print:max-w-full p-1">
        {/* Header - Hidden when printing */}
        <div className="print:hidden">
          <PageHeader
            title={`Receipt ${receipt.receipt_number}`}
            helpContent="View and print payment receipt. Export to PDF or print a physical copy for the patient."
            actions={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                <ExportButton
                  data={receiptData}
                  filename={`receipt-${receipt.receipt_number}`}
                  title={`Receipt ${receipt.receipt_number}`}
                />
              </div>
            }
          />
        </div>

      {/* Receipt Card */}
      <Card className="print:shadow-none print:border-none">
        <CardContent className="p-4 sm:p-8">
          {/* Voided Banner */}
          {receipt.is_voided && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This receipt has been voided
                {receipt.void_reason && `: ${receipt.void_reason}`}
              </AlertDescription>
            </Alert>
          )}

          {/* Facility Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Building2 className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">{receipt.facility_name}</h2>
            </div>
            {receipt.facility_address && (
              <p className="text-sm text-muted-foreground">
                {receipt.facility_address}
              </p>
            )}
            {receipt.facility_phone && (
              <p className="text-sm text-muted-foreground">
                Tel: {receipt.facility_phone}
              </p>
            )}
          </div>

          <Separator className="my-6" />

          {/* Receipt Title */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold uppercase tracking-wider">
              Official Receipt
            </h3>
            <div className="flex items-center justify-center gap-2 mt-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-lg">{receipt.receipt_number}</span>
            </div>
          </div>

          {/* Receipt Details */}
          <div className="space-y-4 mb-8">
            {/* Date */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium">
                {format(new Date(receipt.receipt_date), 'PPP p')}
              </span>
            </div>

            {/* Patient */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Received from:</span>
              <span className="font-medium">{receipt.patient_name}</span>
              {receipt.patient_mrn && (
                <Badge variant="outline" className="shrink-0">
                  {receipt.patient_mrn}
                </Badge>
              )}
            </div>

            {/* Payment Method */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Payment Method:</span>
              <Badge className="shrink-0">{receipt.payment_method}</Badge>
            </div>

            {/* Served By */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Served By:</span>
              <span className="font-medium">
                {receipt.received_by_username || receipt.issued_by_username || 'N/A'}
              </span>
            </div>

            {/* Till/Payment Point */}
            {(receipt.payment_point_name || receipt.payment_point_code) && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Till/Point:</span>
                <span className="font-medium">
                  {receipt.payment_point_name || receipt.payment_point_code}
                </span>
              </div>
            )}
          </div>

          <Separator className="my-4 sm:my-6" />

          {/* Amount Section */}
          <div className="bg-muted/50 rounded-lg p-4 sm:p-6 text-center">
            <div className="text-sm text-muted-foreground mb-2">Amount Received</div>
            <div className="text-2xl sm:text-3xl font-bold text-primary">
              {formatCurrency(parseFloat(receipt.amount))}
            </div>
            <div className="text-sm text-muted-foreground mt-2 italic">
              {receipt.amount_in_words}
            </div>
          </div>

          <Separator className="my-4 sm:my-6" />

          {/* Confirmation */}
          <div className="flex items-center justify-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Payment Confirmed</span>
          </div>

          {/* Footer */}
          <div className="mt-6 sm:mt-8 pt-4 border-t text-center text-xs text-muted-foreground">
            <p>Thank you for your payment.</p>
            <p className="mt-1">This is a computer-generated receipt.</p>
            {receipt.created_at && (
              <p className="mt-1">
                Generated: {format(new Date(receipt.created_at), 'PPP p')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    </ScrollArea>
  );
}

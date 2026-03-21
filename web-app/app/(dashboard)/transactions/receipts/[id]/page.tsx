/**
 * Receipt View Page
 * View and print a payment receipt
 */
'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { ReceiptView } from '@/components/billing/ReceiptView';
import { usePaymentReceipt } from '@/lib/hooks/billing';
import { billingApi } from '@/lib/api/billing';
import { toast } from 'sonner';

export default function ReceiptPage() {
  const params = useParams();
  const receiptId = Number(params.id);

  const { data: receipt, isLoading } = usePaymentReceipt(receiptId);

  const handleDownloadPdf = async () => {
    try {
      const blob = await billingApi.downloadReceiptPdf(receiptId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${receipt?.receipt_number || receiptId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download receipt PDF');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Receipt Not Found"
          helpContent="The requested receipt could not be found."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The receipt you&apos;re looking for doesn&apos;t exist or has been removed.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="print:hidden">
        <PageHeader
          title={`Receipt ${receipt.receipt_number}`}
          helpContent="View payment receipt details. Print or download a copy for the patient."
        />
      </div>

      <ReceiptView receipt={receipt} isLoading={false} onDownload={handleDownloadPdf} />
    </div>
  );
}

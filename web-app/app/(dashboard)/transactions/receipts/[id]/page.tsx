/**
 * Receipt View Page
 * View and print a payment receipt
 */
'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReceiptView } from '@/components/billing/ReceiptView';
import { usePaymentReceipt } from '@/lib/hooks/billing';

export default function ReceiptPage() {
  const router = useRouter();
  const params = useParams();
  const receiptId = Number(params.id);

  const { data: receipt, isLoading } = usePaymentReceipt(receiptId);

  const handlePrint = () => {
    window.print();
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
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Receipt not found</h2>
        <p className="text-muted-foreground mt-2">
          The receipt you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button className="mt-4" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receipt {receipt.receipt_number}</h1>
          <p className="text-muted-foreground">Payment receipt details</p>
        </div>
      </div>

      <ReceiptView receipt={receipt} isLoading={false} onPrint={handlePrint} />
    </div>
  );
}

/**
 * Invoice Detail Page
 * View and manage a specific invoice
 */
'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InvoiceDetail } from '@/components/billing/InvoiceDetail';
import { PaymentForm } from '@/components/billing/PaymentForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useInvoice,
  useCreatePayment,
  useFinalizeInvoice,
  useCancelInvoice,
} from '@/lib/hooks/billing';
import { useToast } from '@/lib/hooks/use-toast';
import type { Invoice, PaymentCreateData } from '@/lib/types/billing';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const invoiceId = Number(params.id);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Fetch invoice
  const { data: invoice, isLoading } = useInvoice(invoiceId);

  // Mutations
  const createPayment = useCreatePayment();
  const finalizeInvoice = useFinalizeInvoice();
  const cancelInvoice = useCancelInvoice();

  const handleRecordPayment = (inv: Invoice) => {
    setShowPaymentDialog(true);
  };

  const handlePaymentSubmit = async (data: PaymentCreateData) => {
    try {
      await createPayment.mutateAsync(data);
      toast({
        title: 'Payment recorded',
        description: 'Payment has been successfully recorded.',
      });
      setShowPaymentDialog(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to record payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleFinalize = async (inv: Invoice) => {
    try {
      await finalizeInvoice.mutateAsync(inv.id);
      toast({
        title: 'Invoice finalized',
        description: 'Invoice has been finalized and sent to patient.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to finalize invoice.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async (inv: Invoice) => {
    try {
      await cancelInvoice.mutateAsync({ invoiceId: inv.id, reason: 'Cancelled by user' });
      toast({
        title: 'Invoice cancelled',
        description: 'Invoice has been cancelled.',
      });
      router.push('/billing');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel invoice.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = (inv: Invoice) => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Invoice {invoice?.invoice_number || ''}
          </h1>
          <p className="text-muted-foreground">
            View and manage invoice details
          </p>
        </div>
      </div>

      {/* Invoice Detail */}
      <InvoiceDetail
        invoice={invoice || null}
        isLoading={isLoading}
        onRecordPayment={handleRecordPayment}
        onFinalize={handleFinalize}
        onCancel={handleCancel}
        onPrint={handlePrint}
      />

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {invoice && (
            <PaymentForm
              invoice={invoice}
              onSubmit={handlePaymentSubmit}
              onCancel={() => setShowPaymentDialog(false)}
              isLoading={createPayment.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

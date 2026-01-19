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
import { MpesaPaymentDialog } from '@/components/billing/MpesaPaymentDialog';
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
  useMpesaSTKPush,
  useMpesaQuery,
} from '@/lib/hooks/billing';
import { useClaims } from '@/lib/hooks/use-sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { Invoice, PaymentCreateData } from '@/lib/types/billing';
import type { Claim } from '@/lib/types/sha';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const invoiceId = Number(params.id);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [showMpesaDialog, setShowMpesaDialog] = useState(false);
  const [mpesaStatus, setMpesaStatus] = useState<
    'idle' | 'initiating' | 'waiting' | 'success' | 'failed'
  >('idle');
  const [mpesaErrorMessage, setMpesaErrorMessage] = useState<string | null>(null);
  const [mpesaReceiptNumber, setMpesaReceiptNumber] = useState<string | null>(null);
  const [mpesaPhoneNumber, setMpesaPhoneNumber] = useState<string>('');
  const [mpesaAmount, setMpesaAmount] = useState<number>(0);
  const [mpesaInvoiceNumber, setMpesaInvoiceNumber] = useState<string>('');
  const [mpesaPaymentPointId, setMpesaPaymentPointId] = useState<number>(0);
  const [mpesaCheckoutRequestId, setMpesaCheckoutRequestId] = useState<string | null>(null);

  const { data: invoice, isLoading, refetch: refetchInvoice } = useInvoice(invoiceId);

  const { data: claimsData, refetch: refetchClaims } = useClaims({ invoice: invoiceId });
  const linkedClaim = claimsData?.results?.[0] || null;

  const createPayment = useCreatePayment();
  const finalizeInvoice = useFinalizeInvoice();
  const cancelInvoice = useCancelInvoice();

  const mpesaSTKPush = useMpesaSTKPush();
  const mpesaQuery = useMpesaQuery(mpesaCheckoutRequestId, {
    refetchInterval: mpesaStatus === 'waiting' ? 2000 : false,
  });

  React.useEffect(() => {
    if (mpesaStatus !== 'waiting') return;
    const data = mpesaQuery.data;
    if (!data) return;

    if (data.success && data.result_code === 0) {
      setMpesaReceiptNumber(data.mpesa_receipt_number || null);
      setMpesaStatus('success');
      return;
    }

    // If the API reports a definite failure/cancel, surface it
    if (!data.success && typeof data.result_code === 'number' && data.result_code !== 0) {
      setMpesaErrorMessage(data.result_description || 'M-Pesa payment failed');
      setMpesaStatus('failed');
    }
  }, [mpesaQuery.data, mpesaStatus]);

  const handleRecordPayment = () => {
    setShowPaymentDialog(true);
  };

  const handleClaimSubmitted = (claim: Claim) => {
    toast({
      title: 'Claim submitted',
      description: `Claim ${claim.sha_reference || claim.id} submitted to SHA successfully.`,
    });
    refetchClaims();
    refetchInvoice();
  };

  const handlePaymentSubmit = async (data: PaymentCreateData) => {
    try {
      await createPayment.mutateAsync(data);
      toast({
        title: 'Payment recorded',
        description: 'Payment has been successfully recorded.',
      });
      setShowPaymentDialog(false);
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleMpesaPayment = async (data: {
    invoiceId: number;
    phoneNumber: string;
    amount: number;
    paymentPointId: number;
  }) => {
    if (!invoice) return;

    setShowPaymentDialog(false);
    setShowMpesaDialog(true);
    setMpesaStatus('initiating');
    setMpesaErrorMessage(null);
    setMpesaReceiptNumber(null);
    setMpesaCheckoutRequestId(null);
    setMpesaPhoneNumber(data.phoneNumber);
    setMpesaAmount(data.amount);
    setMpesaInvoiceNumber(invoice.invoice_number);
    setMpesaPaymentPointId(data.paymentPointId);

    try {
      const res = await mpesaSTKPush.mutateAsync({
        invoice_id: data.invoiceId,
        phone_number: data.phoneNumber,
        amount: data.amount.toFixed(2),
        payment_point: data.paymentPointId,
      });
      setMpesaCheckoutRequestId(res.checkout_request_id);
      setMpesaStatus('waiting');
    } catch (e: any) {
      const message =
        e?.response?.data?.error || e?.message || 'Failed to initiate M-Pesa payment';
      setMpesaErrorMessage(String(message));
      setMpesaStatus('failed');
    }
  };

  const resetMpesaState = () => {
    setShowMpesaDialog(false);
    setMpesaStatus('idle');
    setMpesaErrorMessage(null);
    setMpesaReceiptNumber(null);
    setMpesaCheckoutRequestId(null);
    setMpesaPhoneNumber('');
    setMpesaAmount(0);
    setMpesaInvoiceNumber('');
    setMpesaPaymentPointId(0);
  };

  const handleFinalize = async (inv: Invoice) => {
    try {
      await finalizeInvoice.mutateAsync(inv.id);
      toast({
        title: 'Invoice finalized',
        description: 'Invoice has been finalized and sent to patient.',
      });
    } catch {
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
      router.push('/transactions');
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to cancel invoice.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Invoice {invoice?.invoice_number || ''}
          </h1>
          <p className="text-muted-foreground">View and manage invoice details</p>
        </div>
      </div>

      <InvoiceDetail
        invoice={invoice || null}
        isLoading={isLoading}
        onRecordPayment={handleRecordPayment}
        onFinalize={handleFinalize}
        onCancel={handleCancel}
        onPrint={handlePrint}
        onClaimSubmitted={handleClaimSubmitted}
        linkedClaim={linkedClaim}
      />

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
              onMpesaPayment={handleMpesaPayment}
            />
          )}
        </DialogContent>
      </Dialog>

      <MpesaPaymentDialog
        open={showMpesaDialog}
        onOpenChange={(open) => {
          if (!open) {
            resetMpesaState();
            return;
          }
          setShowMpesaDialog(true);
        }}
        amount={mpesaAmount}
        invoiceNumber={mpesaInvoiceNumber}
        initialPhoneNumber={mpesaPhoneNumber}
        status={mpesaStatus}
        errorMessage={mpesaErrorMessage}
        receiptNumber={mpesaReceiptNumber}
        onInitiate={(phone) => {
          if (!invoice) return;
          // Retry uses the last known amount & the currently selected payment point on the form
          // (The backend will validate the phone and amount)
          handleMpesaPayment({
            invoiceId: invoice.id,
            phoneNumber: phone,
            amount: mpesaAmount,
            paymentPointId: mpesaPaymentPointId,
          });
        }}
        onCancel={() => {
          resetMpesaState();
          toast({
            title: 'M-Pesa cancelled',
            description: 'Payment request cancelled.',
          });
        }}
        onComplete={() => {
          resetMpesaState();
          toast({
            title: 'Payment received',
            description: 'M-Pesa payment completed successfully.',
          });
          refetchInvoice();
          refetchClaims();
        }}
      />
    </div>
  );
}

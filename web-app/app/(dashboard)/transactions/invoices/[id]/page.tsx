/**
 * Invoice Detail Page
 * View and manage a specific invoice
 */
'use client';

import React, { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { InvoiceDetail } from '@/components/billing/InvoiceDetail';
import { PaymentForm } from '@/components/billing/PaymentForm';
import { AddInvoiceItemDialog } from '@/components/billing/AddInvoiceItemDialog';
import { ApplyDiscountDialog } from '@/components/billing/ApplyDiscountDialog';
import { MpesaPaymentDialog } from '@/components/billing/MpesaPaymentDialog';
import { ReceiptDialog, ReceiptData } from '@/components/billing/ReceiptDialog';
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
  useAddInvoiceItem,
  useRemoveInvoiceItem,
  useApplyDiscount,
  useMpesaSTKPush,
  useMpesaQuery,
  usePaymentReceipt,
  useServices,
} from '@/lib/hooks/billing';
import { useClaims } from '@/lib/hooks/use-sha';
import { useToast } from '@/lib/hooks/use-toast';
import type { Invoice, PaymentCreateData, InvoiceItemCreateData, ApplyDiscountData } from '@/lib/types/billing';
import type { Claim } from '@/lib/types/sha';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const invoiceId = Number(params.id);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPaymentSuccessDialog, setShowPaymentSuccessDialog] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<number | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

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
  const { data: servicesData } = useServices();

  // Only fetch SHA claims for insurance invoices (avoid unnecessary API calls for cash invoices)
  const isInsuranceInvoice = invoice?.payment_type === 'insurance' || !!invoice?.sha_claim_number;
  const { data: claimsData, refetch: refetchClaims } = useClaims(
    { invoice: invoiceId },
    { enabled: isInsuranceInvoice }
  );
  const linkedClaim = isInsuranceInvoice ? (claimsData?.results?.[0] || null) : null;

  // Fetch receipt when we have a payment ID
  const { data: receiptData, isLoading: isReceiptLoading } = usePaymentReceipt(
    lastPaymentId ?? undefined
  );

  const createPayment = useCreatePayment();
  const finalizeInvoice = useFinalizeInvoice();
  const cancelInvoice = useCancelInvoice();
  const addInvoiceItem = useAddInvoiceItem();
  const removeInvoiceItem = useRemoveInvoiceItem();
  const applyDiscount = useApplyDiscount();

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
      const payment = await createPayment.mutateAsync(data);
      setShowPaymentDialog(false);
      setLastPaymentId(payment.id);
      setShowPaymentSuccessDialog(true);
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to record payment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleViewReceipt = () => {
    setShowPaymentSuccessDialog(false);
    setShowReceiptDialog(true);
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

  const handleAddItem = () => {
    setShowAddItemDialog(true);
  };

  const handleAddItemSubmit = async (data: InvoiceItemCreateData) => {
    try {
      await addInvoiceItem.mutateAsync({ invoiceId, item: data });
      toast({
        title: 'Item added',
        description: 'Line item has been added to the invoice.',
      });
      setShowAddItemDialog(false);
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add item to invoice.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveItem = async (inv: Invoice, itemId: number) => {
    try {
      await removeInvoiceItem.mutateAsync({ invoiceId: inv.id, itemId });
      toast({
        title: 'Item removed',
        description: 'Line item has been removed from the invoice.',
      });
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove item from invoice.',
        variant: 'destructive',
      });
    }
  };

  const handleApplyDiscount = () => {
    setShowDiscountDialog(true);
  };

  const handleApplyDiscountSubmit = async (data: ApplyDiscountData) => {
    try {
      await applyDiscount.mutateAsync({ invoiceId, discount: data });
      toast({
        title: 'Discount applied',
        description: 'Discount has been applied to the invoice.',
      });
      setShowDiscountDialog(false);
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to apply discount.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Invoice ${invoice?.invoice_number || ''}`}
        helpContent="View and manage invoice details. Record payments, add or remove line items, apply discounts, and submit SHA claims from this page."
      />

      <InvoiceDetail
        invoice={invoice || null}
        isLoading={isLoading}
        onRecordPayment={handleRecordPayment}
        onFinalize={handleFinalize}
        onCancel={handleCancel}
        onAddItem={handleAddItem}
        onRemoveItem={handleRemoveItem}
        onApplyDiscount={handleApplyDiscount}
        onClaimSubmitted={handleClaimSubmitted}
        linkedClaim={linkedClaim}
      />

      {/* Add Item Dialog */}
      <AddInvoiceItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        services={servicesData?.results || []}
        onSubmit={handleAddItemSubmit}
        isLoading={addInvoiceItem.isPending}
      />

      {/* Apply Discount Dialog */}
      <ApplyDiscountDialog
        open={showDiscountDialog}
        onOpenChange={setShowDiscountDialog}
        invoice={invoice || null}
        onSubmit={handleApplyDiscountSubmit}
        isLoading={applyDiscount.isPending}
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

      {/* Payment Success Dialog with View Receipt option */}
      <Dialog open={showPaymentSuccessDialog} onOpenChange={setShowPaymentSuccessDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Payment Recorded
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              Payment has been successfully recorded for this invoice.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowPaymentSuccessDialog(false)}
            >
              Close
            </Button>
            <Button className="flex-1" onClick={handleViewReceipt}>
              View Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <ReceiptDialog
        open={showReceiptDialog}
        onClose={() => setShowReceiptDialog(false)}
        receipt={receiptData as ReceiptData | null}
        isLoading={isReceiptLoading}
      />
    </div>
  );
}

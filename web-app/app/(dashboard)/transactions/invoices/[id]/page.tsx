/**
 * Invoice Detail Page
 * View and manage a specific invoice
 */
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
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
  useFinalizeAndApplyCopay,
  useCreateCopayProforma,
  useCancelInvoice,
  useAddInvoiceItem,
  useRemoveInvoiceItem,
  useApplyDiscount,
  useMpesaSTKPush,
  useMpesaQuery,
  usePaymentReceipt,
  useBillingCatalogItems,
} from '@/lib/hooks/billing';
import { useClaim, useClaims } from '@/lib/hooks/use-sha';
import { billingApi } from '@/lib/api/billing';
import { inventoryApi } from '@/lib/api/inventory';
import { useToast } from '@/lib/hooks/use-toast';
import type { Invoice, PaymentCreateData, InvoiceItemCreateData, ApplyDiscountData } from '@/lib/types/billing';
import type { Claim } from '@/lib/types/sha';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const invoiceId = String(params.id);
  const { data: bootstrap } = useQuery({
    queryKey: ['inventory-bootstrap'],
    queryFn: inventoryApi.getBootstrap,
  });
  const billingEnabled = bootstrap?.modules.billing ?? true;

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPaymentSuccessDialog, setShowPaymentSuccessDialog] = useState(false);
  const [lastPaymentId, setLastPaymentId] = useState<number | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [showAddItemDialog, setShowAddItemDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);

  const [showMpesaDialog, setShowMpesaDialog] = useState(false);
  const [paymentTargetInvoice, setPaymentTargetInvoice] = useState<Invoice | null>(null);
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
  const invoiceNumericId = invoice?.id ?? 0;
  const { data: catalogItemsData } = useBillingCatalogItems({
    is_active: true,
    page_size: 200,
  });

  const { data: claimsData, refetch: refetchClaims } = useClaims(
    { invoice: invoiceNumericId },
    { enabled: invoiceNumericId > 0 }
  );
  const linkedClaim = claimsData?.results?.[0] || null;
  const { data: linkedClaimDetail, refetch: refetchLinkedClaim } = useClaim(linkedClaim?.id);

  // Fetch receipt when we have a payment ID
  const { data: receiptData, isLoading: isReceiptLoading } = usePaymentReceipt(
    lastPaymentId ?? undefined
  );

  const createPayment = useCreatePayment();
  const finalizeAndApplyCopay = useFinalizeAndApplyCopay();
  const createCopayProforma = useCreateCopayProforma();
  const cancelInvoice = useCancelInvoice();
  const addInvoiceItem = useAddInvoiceItem();
  const removeInvoiceItem = useRemoveInvoiceItem();
  const applyDiscount = useApplyDiscount();

  const mpesaSTKPush = useMpesaSTKPush();
  const mpesaQuery = useMpesaQuery(mpesaCheckoutRequestId, {
    refetchInterval: mpesaStatus === 'waiting' ? 5000 : false,
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

    // Only treat as a definite failure when the backend says it's no longer
    // pending. A null result_code or pending=true means still processing.
    if (
      !data.success &&
      data.pending === false &&
      typeof data.result_code === 'number' &&
      data.result_code !== 0
    ) {
      setMpesaErrorMessage(data.result_description || 'M-Pesa payment failed');
      setMpesaStatus('failed');
    }
  }, [mpesaQuery.data, mpesaStatus]);

  const handleRecordPayment = () => {
    setPaymentTargetInvoice(null);
    setShowPaymentDialog(true);
  };

  const handleCollectCopay = async (inv: Invoice) => {
    try {
      const proforma = await createCopayProforma.mutateAsync({ id: inv.id });
      setPaymentTargetInvoice(proforma);
      setShowPaymentDialog(true);
      toast({
        title: 'Interim copay request ready',
        description: `Collect payment against proforma ${proforma.invoice_number}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create copay proforma.',
        variant: 'destructive',
      });
    }
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
      const isInterimCopay = (paymentTargetInvoice?.status || '').toLowerCase() === 'proforma';
      const payload: PaymentCreateData = isInterimCopay
        ? {
            ...data,
            payment_details: {
              ...(data.payment_details || {}),
              interim_copay: true,
              source_draft_invoice_id: invoice?.id,
              source_draft_invoice_number: invoice?.invoice_number,
            },
          }
        : data;

      const payment = await createPayment.mutateAsync(payload);
      setShowPaymentDialog(false);
      setPaymentTargetInvoice(null);
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
    const targetInvoice = paymentTargetInvoice || invoice;
    if (!targetInvoice) return;

    setShowPaymentDialog(false);
    setShowMpesaDialog(true);
    setMpesaStatus('initiating');
    setMpesaErrorMessage(null);
    setMpesaReceiptNumber(null);
    setMpesaCheckoutRequestId(null);
    setMpesaPhoneNumber(data.phoneNumber);
    setMpesaAmount(data.amount);
    setMpesaInvoiceNumber(targetInvoice.invoice_number);
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
      await finalizeAndApplyCopay.mutateAsync(inv.id);
      toast({
        title: 'Invoice finalized',
        description: 'Invoice finalized and interim copay payments applied where available.',
      });
      refetchInvoice();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to finalize invoice and apply copay.',
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
      await addInvoiceItem.mutateAsync({ invoiceId: invoiceNumericId, item: data });
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
      await applyDiscount.mutateAsync({ invoiceId: invoiceNumericId, discount: data });
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

  const handleUpdateInvoiceItemAllocation = async (
    invoiceId: number,
    itemId: number,
    payload: {
      mode: 'patient' | 'discount';
      discount_amount?: string;
      discount_reason?: string;
    }
  ) => {
    await billingApi.updateInvoiceItemAllocation(invoiceId, itemId, payload);
    await Promise.all([refetchLinkedClaim(), refetchClaims(), refetchInvoice()]);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Invoice ${invoice?.invoice_number || ''}`}
        helpContent="View and manage invoice details. Record payments, add or remove line items, apply discounts, and submit SHA claims from this page."
        actions={linkedClaim ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/transactions/sha-claims/${linkedClaim.id}`}>
              Attached Claim
              <ExternalLink className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      />

      {!billingEnabled ? (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          Billing module is disabled for this facility. Invoice actions are restricted.
        </div>
      ) : null}

      <InvoiceDetail
        invoice={invoice || null}
        isLoading={isLoading}
        onRecordPayment={handleRecordPayment}
        onFinalize={handleFinalize}
        onCancel={handleCancel}
        onAddItem={billingEnabled ? handleAddItem : undefined}
        onRemoveItem={handleRemoveItem}
        onApplyDiscount={handleApplyDiscount}
        onCollectCopay={handleCollectCopay}
        onClaimSubmitted={handleClaimSubmitted}
        linkedClaim={linkedClaim}
        linkedClaimDetail={linkedClaimDetail ?? null}
        onUpdateInvoiceItemAllocation={handleUpdateInvoiceItemAllocation}
      />

      {/* Add Item Dialog */}
      <AddInvoiceItemDialog
        open={showAddItemDialog}
        onOpenChange={setShowAddItemDialog}
        catalogItems={catalogItemsData?.results || []}
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

      <Dialog
        open={showPaymentDialog}
        onOpenChange={(open) => {
          setShowPaymentDialog(open);
          if (!open) {
            setPaymentTargetInvoice(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{paymentTargetInvoice ? 'Collect Interim Copay' : 'Record Payment'}</DialogTitle>
          </DialogHeader>
          {(paymentTargetInvoice || invoice) && (
            <PaymentForm
              invoice={(paymentTargetInvoice || invoice)!}
              onSubmit={handlePaymentSubmit}
              onCancel={() => {
                setShowPaymentDialog(false);
                setPaymentTargetInvoice(null);
              }}
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
          const targetInvoice = paymentTargetInvoice || invoice;
          if (!targetInvoice) return;
          // Retry uses the last known amount & the currently selected payment point on the form
          // (The backend will validate the phone and amount)
          handleMpesaPayment({
            invoiceId: targetInvoice.id,
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

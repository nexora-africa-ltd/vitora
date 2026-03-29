/**
 * Transactions → Payments
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PaymentList } from '@/components/billing/PaymentList';
import { ReversePaymentDialog } from '@/components/billing/ReversePaymentDialog';
import { ReceivePaymentModal } from '@/components/billing';
import { usePayments, useReversePayment } from '@/lib/hooks/billing';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import type { Payment, PaymentMethod, PaymentStatus } from '@/lib/types/billing';

export default function TransactionsPaymentsPage() {
  const router = useRouter();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | undefined>();
  const [reverseTarget, setReverseTarget] = useState<Payment | null>(null);

  const { data, isLoading, refetch, isFetching } = usePayments({
    method: paymentMethod,
    status: paymentStatus,
  });

  const reversePayment = useReversePayment();

  const handleViewReceipt = (payment: Payment) => {
    router.push(`/transactions/receipts/${payment.id}`);
  };

  const handleReversePayment = (paymentId: number, reason: string) => {
    reversePayment.mutate(
      { paymentId, reason },
      {
        onSuccess: () => {
          toast.success('Payment reversed successfully');
          setReverseTarget(null);
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : 'Failed to reverse payment';
          toast.error(msg);
        },
      }
    );
  };

  const handleRefresh = async () => {
    await refetch();
  };

  const handleFilter = useCallback((filters: { method?: PaymentMethod; status?: PaymentStatus }) => {
    setPaymentMethod(filters.method);
    setPaymentStatus(filters.status);
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Payments"
          helpContent="View recorded payments and receipts. Filter by payment method or status to find specific transactions."
          actions={
            <ReceivePaymentModal
              trigger={
                <Button className="gap-2 w-full sm:w-auto">
                  <Banknote className="h-4 w-4" />
                  Receive Payment
                </Button>
              }
            />
          }
        />

        <PaymentList
          payments={data?.results || []}
          isLoading={isLoading}
          onViewReceipt={handleViewReceipt}
          onReversePayment={setReverseTarget}
          onFilter={handleFilter}
        />

        <ReversePaymentDialog
          open={reverseTarget !== null}
          onOpenChange={(open) => { if (!open) setReverseTarget(null); }}
          payment={reverseTarget}
          onReverse={handleReversePayment}
          isLoading={reversePayment.isPending}
        />
      </div>
    </PullToRefresh>
  );
}

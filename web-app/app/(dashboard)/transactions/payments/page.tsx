/**
 * Transactions → Payments
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Banknote } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PaymentList } from '@/components/billing/PaymentList';
import { ReceivePaymentModal } from '@/components/billing';
import { usePayments } from '@/lib/hooks/billing';
import type { Payment } from '@/lib/types/billing';

export default function TransactionsPaymentsPage() {
  const router = useRouter();
  const { data, isLoading } = usePayments();

  const handleViewReceipt = (payment: Payment) => {
    router.push(`/transactions/receipts/${payment.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">View recorded payments and receipts</p>
        </div>
        <ReceivePaymentModal
          trigger={
            <Button className="gap-2">
              <Banknote className="h-4 w-4" />
              Receive Payment
            </Button>
          }
        />
      </div>

      <PaymentList
        payments={data?.results || []}
        isLoading={isLoading}
        onViewReceipt={handleViewReceipt}
      />
    </div>
  );
}

/**
 * Transactions → Payments
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

import { PaymentList } from '@/components/billing/PaymentList';
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">View recorded payments and receipts</p>
      </div>

      <PaymentList
        payments={data?.results || []}
        isLoading={isLoading}
        onViewReceipt={handleViewReceipt}
      />
    </div>
  );
}

/**
 * Transactions → Invoices
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { useInvoices } from '@/lib/hooks/billing';
import type { Invoice } from '@/lib/types/billing';

export default function TransactionsInvoicesPage() {
  const router = useRouter();
  const { data, isLoading } = useInvoices();

  const handleCreateInvoice = () => {
    router.push('/transactions/invoices/new');
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    router.push(`/transactions/invoices/${invoice.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground">Create and manage patient invoices</p>
      </div>

      <InvoiceList
        invoices={data?.results || []}
        isLoading={isLoading}
        onSelect={handleSelectInvoice}
        onCreateNew={handleCreateInvoice}
      />
    </div>
  );
}

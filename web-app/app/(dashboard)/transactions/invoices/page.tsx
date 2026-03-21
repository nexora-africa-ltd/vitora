/**
 * Transactions → Invoices
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { useInvoices } from '@/lib/hooks/billing';
import type { Invoice } from '@/lib/types/billing';

export default function TransactionsInvoicesPage() {
  const router = useRouter();
  const { data, isLoading, refetch, isFetching } = useInvoices();

  const handleCreateInvoice = () => {
    router.push('/transactions/invoices/new');
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    router.push(`/transactions/invoices/${invoice.id}`);
  };

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Invoices"
          helpContent="Create and manage patient invoices. Filter by status, search by invoice number, patient name, or MRN."
          actions={
            <Button onClick={handleCreateInvoice} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          }
        />

        <InvoiceList
          invoices={data?.results || []}
          isLoading={isLoading}
          onSelect={handleSelectInvoice}
          onCreateNew={handleCreateInvoice}
        />
      </div>
    </PullToRefresh>
  );
}

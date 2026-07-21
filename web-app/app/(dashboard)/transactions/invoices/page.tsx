/**
 * Transactions → Invoices
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { InvoiceList } from '@/components/billing/InvoiceList';
import { useDhaInvoices, useInvoices, useFinalizeInvoice, useCancelInvoice } from '@/lib/hooks/billing';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useToast } from '@/lib/hooks/use-toast';
import type { DHAInvoiceRow, Invoice, InvoiceStatus } from '@/lib/types/billing';
import { formatCurrency, formatDate } from '@/lib/utils/format';

type InvoiceSourceFilter = 'local' | 'dha';

export default function TransactionsInvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [invoiceSearch, setInvoiceSearch] = useState(searchParams.get('search') ?? '');
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | undefined>();
  const [invoiceSource, setInvoiceSource] = useState<InvoiceSourceFilter>('local');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(invoiceSearch, 300);

  const { data, isLoading, refetch, isFetching } = useInvoices({
    search: debouncedSearch || undefined,
    status: invoiceStatus,
    page,
  });
  const {
    data: dhaData,
    isLoading: isDhaLoading,
    refetch: refetchDha,
    isFetching: isDhaFetching,
  } = useDhaInvoices({
    search: debouncedSearch || undefined,
    page,
  });
  const finalizeInvoice = useFinalizeInvoice();
  const cancelInvoice = useCancelInvoice();

  const handleCreateInvoice = () => {
    router.push('/transactions/invoices/new');
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    router.push(`/transactions/invoices/${invoice.id}`);
  };

  const handleReceivePayment = (invoice: Invoice) => {
    router.push(`/transactions/invoices/${invoice.id}`);
  };

  const handleFinalize = async (invoice: Invoice) => {
    try {
      await finalizeInvoice.mutateAsync(invoice.id);
      toast({ title: 'Invoice finalized', description: `${invoice.invoice_number} has been finalized.` });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to finalize invoice.', variant: 'destructive' });
    }
  };

  const handleCancel = async (invoice: Invoice) => {
    try {
      await cancelInvoice.mutateAsync({ invoiceId: invoice.id, reason: 'Cancelled from list' });
      toast({ title: 'Invoice cancelled', description: `${invoice.invoice_number} has been cancelled.` });
      refetch();
    } catch {
      toast({ title: 'Error', description: 'Failed to cancel invoice.', variant: 'destructive' });
    }
  };

  const handleRefresh = async () => {
    if (invoiceSource === 'dha') {
      await refetchDha();
      return;
    }
    await refetch();
  };

  const handleFilter = useCallback((filters: { status?: InvoiceStatus; search?: string }) => {
    setInvoiceSearch(filters.search ?? '');
    setInvoiceStatus(filters.status);
    setPage(1);
  }, []);

  const pageSize = 20;
  const totalCount = invoiceSource === 'dha' ? (dhaData?.count ?? 0) : (data?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={invoiceSource === 'dha' ? isDhaFetching : isFetching}>
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

        <div className="flex justify-end">
          <Select
            value={invoiceSource}
            onValueChange={(value) => {
              setInvoiceSource(value as InvoiceSourceFilter);
              setInvoiceSearch('');
              setInvoiceStatus(undefined);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label="Invoice source">
              <SelectValue placeholder="Invoice source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local invoices</SelectItem>
              <SelectItem value="dha">DHA invoices</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {invoiceSource === 'local' && (
          <InvoiceList
            invoices={data?.results || []}
            isLoading={isLoading}
            onSelect={handleSelectInvoice}
            onCreateNew={handleCreateInvoice}
            onFilter={handleFilter}
            onReceivePayment={handleReceivePayment}
            onFinalize={handleFinalize}
            onCancel={handleCancel}
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        )}

        {invoiceSource === 'dha' && (
          <>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search DHA invoice, claim, patient, or MRN"
                value={invoiceSearch}
                onChange={(e) => {
                  setInvoiceSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Card className="p-3 sm:p-4">
              <ResponsiveTable<DHAInvoiceRow>
                data={dhaData?.results || []}
                keyExtractor={(row) => `dha-${row.claim_id}-${row.id}`}
                isLoading={isDhaLoading || isDhaFetching}
                emptyMessage="No DHA invoice references found for your filters."
                onRowClick={(row) => router.push(`/transactions/sha-claims/${row.claim_id}`)}
                defaultSortColumn="invoice_date"
                defaultSortDirection="desc"
                columns={[
                  {
                    key: 'invoice_number',
                    header: 'DHA Invoice',
                    cell: (row) => (
                      <div className="space-y-0.5">
                        <p className="font-medium font-mono text-sm">{row.invoice_number}</p>
                        <Badge variant="outline" className="text-[10px] uppercase">DHA</Badge>
                      </div>
                    ),
                  },
                  {
                    key: 'patient_name',
                    header: 'Patient',
                    cell: (row) => (
                      <div>
                        <p className="font-medium">{row.patient_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{row.patient_mrn || '—'}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'claim_number',
                    header: 'SHA Claim',
                    cell: (row) => (
                      <div className="space-y-0.5">
                        <p className="font-mono text-sm">{row.claim_number || `#${row.claim_id}`}</p>
                        <p className="text-xs text-muted-foreground">{row.claim_status}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'local_invoice_number',
                    header: 'Local Invoice',
                    hideOnMobile: true,
                    cell: (row) => row.local_invoice_number || 'Not linked',
                  },
                  {
                    key: 'total_amount',
                    header: 'Amount',
                    cell: (row) => formatCurrency(parseFloat(row.total_amount || '0')),
                  },
                  {
                    key: 'invoice_date',
                    header: 'Service Date',
                    hideOnMobile: true,
                    cell: (row) => (row.invoice_date ? formatDate(row.invoice_date) : '—'),
                  },
                  {
                    key: 'action',
                    header: '',
                    cell: () => <ExternalLink className="h-4 w-4 text-muted-foreground" />,
                  },
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

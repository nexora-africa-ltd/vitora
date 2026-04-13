/**
 * Receipts List Page
 * View all payment receipts
 */
'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils/format';
import {
  Receipt,
  Printer,
  Eye,
  Search,
  Banknote,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { ReceivePaymentModal } from '@/components/billing';
import { usePayments } from '@/lib/hooks/billing';
import { formatCurrency } from '@/lib/utils/format';
import type { Payment } from '@/lib/types/billing';

// ============================================================================
// Payment Method Badge
// ============================================================================

const methodColors: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700',
  MPESA: 'bg-emerald-100 text-emerald-700',
  CARD: 'bg-blue-100 text-blue-700',
  BANK_TRANSFER: 'bg-purple-100 text-purple-700',
  INSURANCE: 'bg-amber-100 text-amber-700',
};

function PaymentMethodBadge({ method }: { method: string }) {
  return (
    <Badge className={`${methodColors[method] || 'bg-gray-100 text-gray-700'} text-xs shrink-0`}>
      {method.replace('_', ' ')}
    </Badge>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function ReceiptsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');

  // Fetch completed payments (which have receipts)
  const { data, isLoading, error, refetch, isFetching } = usePayments({
    status: 'COMPLETED',
    ordering: '-payment_date',
    page_size: 50,
  });

  // Filter payments by search term
  const filteredPayments = React.useMemo(() => {
    if (!data?.results) return [];
    if (!searchTerm) return data.results;

    const term = searchTerm.toLowerCase();
    return data.results.filter(
      (payment) =>
        payment.payment_reference?.toLowerCase().includes(term) ||
        payment.patient_name?.toLowerCase().includes(term) ||
        payment.invoice_number?.toLowerCase().includes(term)
    );
  }, [data?.results, searchTerm]);

  const handleViewReceipt = (payment: Payment) => {
    router.push(`/transactions/receipts/${payment.id}`);
  };

  const handlePrintReceipt = (payment: Payment, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`/transactions/receipts/${payment.id}?print=true`, '_blank');
  };

  const handleRefresh = async () => {
    await refetch();
  };

  if (error) {
    return (
      <div className="py-8 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
        <p className="text-destructive">Failed to load receipts</p>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Receipts"
          helpContent="View and print payment receipts. Search by receipt number, patient name, or invoice number."
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

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search receipts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Receipts Table */}
        <ResponsiveTable
          data={filteredPayments}
          keyExtractor={(payment) => payment.id}
          isLoading={isLoading}
          emptyMessage={searchTerm ? 'No receipts match your search' : 'Completed payments will appear here'}
          columns={[
            {
              key: 'payment_reference',
              header: 'Receipt #',
              cell: (payment) => (
                <span className="font-mono text-sm">{payment.payment_reference}</span>
              ),
            },
            {
              key: 'created_at',
              header: 'Date',
              cell: (payment) => (
                <span className="text-sm text-muted-foreground">
                  {formatDate(payment.created_at, 'dd MMM yyyy')}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'patient_name',
              header: 'Patient',
              cell: (payment) => payment.patient_name || '—',
            },
            {
              key: 'invoice_number',
              header: 'Invoice',
              cell: (payment) => (
                <Link
                  href={`/transactions/invoices/${payment.invoice}`}
                  className="font-mono text-sm text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {payment.invoice_number || `INV-${payment.invoice}`}
                </Link>
              ),
              hideOnMobile: true,
            },
            {
              key: 'method',
              header: 'Method',
              cell: (payment) => <PaymentMethodBadge method={payment.method} />,
              hideOnMobile: true,
            },
            {
              key: 'amount',
              header: 'Amount',
              cell: (payment) => (
                <span className="font-medium">{formatCurrency(parseFloat(payment.amount))}</span>
              ),
              className: 'text-right',
            },
            {
              key: 'actions',
              header: '',
              cell: (payment) => (
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewReceipt(payment);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handlePrintReceipt(payment, e)}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
              ),
              className: 'w-20',
            },
          ]}
          mobileCard={(payment) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium truncate">
                      {payment.payment_reference}
                    </span>
                    <PaymentMethodBadge method={payment.method} />
                  </div>
                  <p className="text-sm truncate">{payment.patient_name || 'Unknown patient'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(payment.created_at, 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{formatCurrency(parseFloat(payment.amount))}</p>
                  <div className="flex gap-1 mt-2 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewReceipt(payment);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={(e) => handlePrintReceipt(payment, e)}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
          onRowClick={handleViewReceipt}
        />
      </div>
    </PullToRefresh>
  );
}

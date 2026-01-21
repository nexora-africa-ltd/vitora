/**
 * Receipts List Page
 * View all payment receipts
 */
'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Receipt,
  Printer,
  Eye,
  Search,
  Banknote,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <Badge className={methodColors[method] || 'bg-gray-100 text-gray-700'}>
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
  const { data, isLoading, error } = usePayments({
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

  const handlePrintReceipt = (payment: Payment) => {
    // Open in new window for printing
    window.open(`/transactions/receipts/${payment.id}?print=true`, '_blank');
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Receipts"
          description="View and print payment receipts"
        />
        <ReceivePaymentModal
          trigger={
            <Button className="gap-2">
              <Banknote className="h-4 w-4" />
              Receive Payment
            </Button>
          }
        />
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by receipt #, patient, or invoice..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Receipts Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-24" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-destructive">Failed to load receipts</p>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No receipts found</h3>
              <p className="text-muted-foreground mt-1">
                {searchTerm
                  ? 'Try a different search term'
                  : 'Completed payments will appear here'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-sm">
                      {payment.payment_reference}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(payment.created_at), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell>{payment.patient_name || '-'}</TableCell>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/transactions/invoices/${payment.invoice}`}
                        className="text-primary hover:underline"
                      >
                        {payment.invoice_number || `INV-${payment.invoice}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <PaymentMethodBadge method={payment.method} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(parseFloat(payment.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewReceipt(payment)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePrintReceipt(payment)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

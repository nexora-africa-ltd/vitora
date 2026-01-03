/**
 * Payment List Component
 * Displays a paginated list of payments
 */
'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt, Smartphone, CreditCard, Banknote, Building } from 'lucide-react';
import type { Payment, PaymentMethod, PaymentStatus } from '@/lib/types/billing';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface PaymentListProps {
  payments: Payment[];
  isLoading: boolean;
  onViewReceipt: (payment: Payment) => void;
  onFilter?: (filters: { method?: PaymentMethod; status?: PaymentStatus }) => void;
}

// ============================================================================
// Status & Method Badge Colors
// ============================================================================

const statusColors: Record<PaymentStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  REFUNDED: 'bg-purple-100 text-purple-700',
};

const methodIcons: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  BANK_TRANSFER: <Building className="h-4 w-4" />,
  INSURANCE: <Building className="h-4 w-4" />,
  OTHER: <CreditCard className="h-4 w-4" />,
};

// ============================================================================
// Loading Skeleton
// ============================================================================

function PaymentListSkeleton() {
  return (
    <div role="status" aria-label="Loading payments">
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-16" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading payments...</span>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No payments found</h3>
      <p className="text-muted-foreground">
        Payments will appear here once recorded
      </p>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function PaymentList({
  payments,
  isLoading,
  onViewReceipt,
  onFilter,
}: PaymentListProps) {
  const [methodFilter, setMethodFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const handleMethodChange = (value: string) => {
    setMethodFilter(value);
    onFilter?.({
      method: value === 'all' ? undefined : (value as PaymentMethod),
      status: statusFilter === 'all' ? undefined : (statusFilter as PaymentStatus),
    });
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    onFilter?.({
      method: methodFilter === 'all' ? undefined : (methodFilter as PaymentMethod),
      status: value === 'all' ? undefined : (value as PaymentStatus),
    });
  };

  if (isLoading) {
    return <PaymentListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Payment Method filter */}
        <Select value={methodFilter} onValueChange={handleMethodChange}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Payment Method">
            <SelectValue placeholder="Filter by method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="MPESA">M-Pesa</SelectItem>
            <SelectItem value="CARD">Card</SelectItem>
            <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
            <SelectItem value="INSURANCE">Insurance</SelectItem>
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty state or table */}
      {payments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">
                    {payment.payment_reference}
                  </TableCell>
                  <TableCell>{formatDateTime(payment.created_at)}</TableCell>
                  <TableCell>{payment.invoice_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {methodIcons[payment.method]}
                      <span className="capitalize">
                        {payment.method.replace('_', ' ')}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(parseFloat(payment.amount))}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[payment.status]}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewReceipt(payment)}
                    >
                      <Receipt className="h-4 w-4 mr-1" />
                      Receipt
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

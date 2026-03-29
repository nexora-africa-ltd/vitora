/**
 * Payment List Component
 * Displays a paginated list of payments with responsive design
 */
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Receipt, Smartphone, CreditCard, Banknote, Building, MoreHorizontal, Undo2 } from 'lucide-react';
import type { Payment, PaymentMethod, PaymentStatus } from '@/lib/types/billing';
import { formatCurrency, formatDateTime } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface PaymentListProps {
  payments: Payment[];
  isLoading: boolean;
  onViewReceipt: (payment: Payment) => void;
  onReversePayment?: (payment: Payment) => void;
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
  REVERSED: 'bg-gray-100 text-gray-700',
};

const methodIcons: Record<PaymentMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  BANK_TRANSFER: <Building className="h-4 w-4" />,
  INSURANCE: <Building className="h-4 w-4" />,
  CORPORATE: <Building className="h-4 w-4" />,
  CHEQUE: <Receipt className="h-4 w-4" />,
};

// ============================================================================
// Main Component
// ============================================================================

export function PaymentList({
  payments,
  isLoading,
  onViewReceipt,
  onReversePayment,
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center">
        <Select value={methodFilter} onValueChange={handleMethodChange}>
          <SelectTrigger className="w-full sm:w-40" role="combobox" aria-label="Payment Method">
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

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-40" role="combobox" aria-label="Status">
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

      {/* Responsive Table */}
      <ResponsiveTable
        data={payments}
        keyExtractor={(payment) => payment.id}
        isLoading={isLoading}
        emptyMessage="No payments found. Payments will appear here once recorded."
        columns={[
          {
            key: 'payment_reference',
            header: 'Receipt #',
            sortable: true,
            cell: (payment) => (
              <span className="font-medium font-mono text-sm">{payment.payment_reference}</span>
            ),
          },
          {
            key: 'created_at',
            header: 'Date',
            sortable: true,
            sortType: 'date',
            cell: (payment) => formatDateTime(payment.created_at),
            hideOnMobile: true,
          },
          {
            key: 'invoice_number',
            header: 'Invoice',
            sortable: true,
            cell: (payment) => payment.invoice_number || '—',
            hideOnMobile: true,
          },
          {
            key: 'method',
            header: 'Method',
            sortable: true,
            cell: (payment) => (
              <div className="flex items-center gap-2">
                {methodIcons[payment.method]}
                <span className="capitalize hidden sm:inline">
                  {payment.method.replace('_', ' ')}
                </span>
              </div>
            ),
          },
          {
            key: 'amount',
            header: 'Amount',
            sortable: true,
            sortType: 'number',
            sortFn: (a, b) => parseFloat(a.amount) - parseFloat(b.amount),
            cell: (payment) => (
              <span className="font-medium">{formatCurrency(parseFloat(payment.amount))}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            sortable: true,
            cell: (payment) => (
              <Badge className={`${statusColors[payment.status]} shrink-0 w-fit text-xs`}>
                {payment.status}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: '',
            cell: (payment) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewReceipt(payment);
                    }}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    View Receipt
                  </DropdownMenuItem>
                  {payment.status === 'COMPLETED' && onReversePayment && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReversePayment(payment);
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-2" />
                      Reverse Payment
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            className: 'w-16',
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
                  <Badge className={`${statusColors[payment.status]} shrink-0 text-xs`}>
                    {payment.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">
                  {payment.invoice_number || 'No invoice'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTime(payment.created_at)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-muted-foreground mb-1">
                  {methodIcons[payment.method]}
                </div>
                <p className="font-semibold">{formatCurrency(parseFloat(payment.amount))}</p>
              </div>
            </div>
          </Card>
        )}
        onRowClick={onViewReceipt}
      />
    </div>
  );
}

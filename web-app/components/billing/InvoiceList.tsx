/**
 * Invoice List Component
 * Displays a paginated, filterable list of invoices
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, FileText, Clock, ArrowRightCircle } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import type { Invoice, InvoiceStatus } from '@/lib/types/billing';
import { formatCurrency, formatDate } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface InvoiceListProps {
  invoices: Invoice[];
  isLoading: boolean;
  onSelect: (invoice: Invoice) => void;
  onCreateNew: () => void;
  onFilter?: (filters: { status?: InvoiceStatus; search?: string }) => void;
  onConvertProforma?: (invoice: Invoice) => void;
}

// ============================================================================
// Status Badge Colors
// ============================================================================

const statusColors: Record<InvoiceStatus, string> = {
  PROFORMA: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  DRAFT: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  PENDING: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
  PARTIAL: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  PAID: 'bg-green-100 text-green-700 hover:bg-green-200',
  OVERDUE: 'bg-red-100 text-red-700 hover:bg-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 hover:bg-gray-200',
  WRITTEN_OFF: 'bg-gray-100 text-gray-500 hover:bg-gray-200',
};

// ============================================================================
// Proforma Expiry Badge
// ============================================================================

function ProformaExpiryBadge({ invoice }: { invoice: Invoice }) {
  if (invoice.status !== 'PROFORMA') return null;

  const days = invoice.days_until_expiry;

  // Determine color based on days remaining
  let colorClass: string;
  let label: string;

  if (days < 0 || !invoice.is_valid) {
    colorClass = 'bg-red-100 text-red-700';
    label = 'Expired';
  } else if (days === 0) {
    colorClass = 'bg-red-100 text-red-700';
    label = 'Expires today';
  } else if (days <= 7) {
    colorClass = 'bg-amber-100 text-amber-700';
    label = `${days}d left`;
  } else {
    colorClass = 'bg-green-100 text-green-700';
    label = `${days}d left`;
  }

  return (
    <Badge variant="outline" className={`${colorClass} ml-1 text-xs`}>
      <Clock className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function InvoiceListSkeleton() {
  return (
    <div role="status" aria-label="Loading invoices">
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-28" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading invoices...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function InvoiceList({
  invoices,
  isLoading,
  onSelect,
  onCreateNew,
  onFilter,
  onConvertProforma,
}: InvoiceListProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    onFilter?.({
      status: value === 'all' ? undefined : (value as InvoiceStatus),
      search: searchQuery,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    onFilter?.({
      status: statusFilter === 'all' ? undefined : (statusFilter as InvoiceStatus),
      search: value,
    });
  };

  if (isLoading) {
    return <InvoiceListSkeleton />;
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-9 w-full sm:w-64"
            />
          </div>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-full sm:w-40" aria-label="Status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PROFORMA">Proforma</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OVERDUE">Overdue</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Create button */}
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Empty state or table */}
      {invoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Get started by creating a new invoice"
          action={{ label: 'Create Invoice', onClick: onCreateNew }}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onSelect(invoice)}
                >
                  <TableCell className="font-medium">
                    {invoice.invoice_number}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.patient_name}</div>
                      {invoice.patient_mrn && (
                        <div className="text-sm text-muted-foreground">
                          {invoice.patient_mrn}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(parseFloat(invoice.total_amount))}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge className={statusColors[invoice.status]}>
                        {invoice.status}
                      </Badge>
                      <ProformaExpiryBadge invoice={invoice} />
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(invoice.due_date)}</TableCell>
                  <TableCell>
                    {invoice.status === 'PROFORMA' && invoice.can_convert && onConvertProforma && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onConvertProforma(invoice);
                        }}
                        title="Convert to Invoice"
                      >
                        <ArrowRightCircle className="h-4 w-4 mr-1" />
                        Convert
                      </Button>
                    )}
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

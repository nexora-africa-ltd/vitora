/**
 * Invoice List Component
 * Displays a paginated, filterable list of invoices using ResponsiveTable
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Search, FileText, Clock, ArrowRightCircle, MoreHorizontal, CreditCard, FileCheck, FileX, Eye } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { ResponsiveTable } from '@/components/ui/responsive-table';
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
  onReceivePayment?: (invoice: Invoice) => void;
  onFinalize?: (invoice: Invoice) => void;
  onCancel?: (invoice: Invoice) => void;
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
// Main Component
// ============================================================================

export function InvoiceList({
  invoices,
  isLoading,
  onSelect,
  onCreateNew,
  onFilter,
  onConvertProforma,
  onReceivePayment,
  onFinalize,
  onCancel,
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <div className="relative flex-1 sm:flex-initial">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-9 w-full sm:w-64"
          />
        </div>

        <Select value={statusFilter} onValueChange={handleStatusChange}>
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

      {/* Table */}
      {invoices.length === 0 && !isLoading ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Get started by creating a new invoice"
          action={{ label: 'Create Invoice', onClick: onCreateNew }}
        />
      ) : (
        <ResponsiveTable
          data={invoices}
          keyExtractor={(invoice) => invoice.id}
          isLoading={isLoading}
          emptyMessage="No invoices match your filters"
          defaultSortColumn="invoice_date"
          defaultSortDirection="desc"
          onRowClick={onSelect}
          columns={[
            {
              key: 'invoice_number',
              header: 'Invoice #',
              sortable: true,
              cell: (invoice) => (
                <span className="font-medium font-mono text-sm">{invoice.invoice_number}</span>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              sortFn: (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
              cell: (invoice) => (
                <div>
                  <div className="font-medium">{invoice.patient_name}</div>
                  {invoice.patient_mrn && (
                    <div className="text-xs text-muted-foreground">{invoice.patient_mrn}</div>
                  )}
                </div>
              ),
            },
            {
              key: 'invoice_date',
              header: 'Date',
              sortable: true,
              sortType: 'date',
              cell: (invoice) => (
                <span className="text-sm text-muted-foreground">{formatDate(invoice.invoice_date)}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'total_amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount),
              cell: (invoice) => (
                <span className="font-medium">{formatCurrency(parseFloat(invoice.total_amount))}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (invoice) => (
                <div className="flex items-center gap-1">
                  <Badge className={`${statusColors[invoice.status]} shrink-0 w-fit`}>
                    {invoice.status}
                  </Badge>
                  <ProformaExpiryBadge invoice={invoice} />
                </div>
              ),
            },
            {
              key: 'due_date',
              header: 'Due Date',
              sortable: true,
              sortType: 'date',
              cell: (invoice) => (
                <span className="text-sm text-muted-foreground">{formatDate(invoice.due_date)}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'actions',
              header: '',
              cell: (invoice) => {
                const canPay = ['PENDING', 'PARTIAL', 'OVERDUE'].includes(invoice.status);
                const canFinalizeInv = invoice.status === 'DRAFT' && (invoice.items?.length ?? 0) > 0;
                const canCancelInv = ['DRAFT', 'PENDING'].includes(invoice.status);
                const canConvert = invoice.status === 'PROFORMA' && invoice.can_convert;
                const hasActions = canPay || canFinalizeInv || canCancelInv || canConvert;

                if (!hasActions) {
                  return (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onSelect(invoice); }}
                      title="View invoice"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  );
                }

                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onSelect(invoice)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      {canPay && onReceivePayment && (
                        <DropdownMenuItem onClick={() => onReceivePayment(invoice)}>
                          <CreditCard className="h-4 w-4 mr-2" />
                          Receive Payment
                        </DropdownMenuItem>
                      )}
                      {canFinalizeInv && onFinalize && (
                        <DropdownMenuItem onClick={() => onFinalize(invoice)}>
                          <FileCheck className="h-4 w-4 mr-2" />
                          Finalize
                        </DropdownMenuItem>
                      )}
                      {canConvert && onConvertProforma && (
                        <DropdownMenuItem onClick={() => onConvertProforma(invoice)}>
                          <ArrowRightCircle className="h-4 w-4 mr-2" />
                          Convert to Invoice
                        </DropdownMenuItem>
                      )}
                      {canCancelInv && onCancel && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onCancel(invoice)}
                          >
                            <FileX className="h-4 w-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
              className: 'w-12',
            },
          ]}
          mobileCard={(invoice) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium truncate">
                      {invoice.invoice_number}
                    </span>
                    <Badge className={`${statusColors[invoice.status]} text-xs shrink-0 w-fit`}>
                      {invoice.status}
                    </Badge>
                    <ProformaExpiryBadge invoice={invoice} />
                  </div>
                  <p className="text-sm truncate">{invoice.patient_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(invoice.invoice_date)}
                    {invoice.due_date && ` • Due ${formatDate(invoice.due_date)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{formatCurrency(parseFloat(invoice.total_amount))}</p>
                </div>
              </div>
            </Card>
          )}
        />
      )}
    </div>
  );
}

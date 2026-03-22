/**
 * Credit Notes List Page
 * View and manage credit notes / refund requests
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ScrollText,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  Undo2,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreditNotes } from '@/lib/hooks/billing';
import { formatCurrency } from '@/lib/utils/format';
import type { CreditNote } from '@/lib/types/billing';

// ============================================================================
// Status badges
// ============================================================================

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  DRAFT: { color: 'bg-slate-100 text-slate-700', icon: ScrollText },
  APPROVED: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJECTED: { color: 'bg-red-100 text-red-700', icon: XCircle },
  REFUNDED: { color: 'bg-blue-100 text-blue-700', icon: Undo2 },
};

function CreditNoteStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { color: 'bg-slate-100 text-slate-700', icon: ScrollText };
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} text-xs shrink-0 w-fit gap-1`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

const reasonLabels: Record<string, string> = {
  OVERCHARGE: 'Overcharge',
  SERVICE_NOT_RENDERED: 'Service Not Rendered',
  DUPLICATE_BILLING: 'Duplicate Billing',
  DUPLICATE: 'Duplicate Charge',
  DUPLICATE_CHARGE: 'Duplicate Charge',
  PRICING_ERROR: 'Pricing Error',
  OTHER: 'Other',
  INSURANCE: 'Insurance Adjustment',
  INSURANCE_ADJUSTMENT: 'Insurance Adjustment',
  GOODWILL: 'Goodwill',
};

// ============================================================================
// Main Page
// ============================================================================

export default function CreditNotesPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const { data, isLoading, error, refetch, isFetching } = useCreditNotes({
    status: statusFilter === 'all' ? undefined : (statusFilter as 'DRAFT' | 'APPROVED' | 'REJECTED' | 'REFUNDED'),
    ordering: '-created_at',
  });

  const filteredNotes = React.useMemo(() => {
    if (!data?.results) return [];
    if (!searchTerm) return data.results;

    const term = searchTerm.toLowerCase();
    return data.results.filter(
      (cn) =>
        cn.credit_note_number?.toLowerCase().includes(term) ||
        cn.patient_name?.toLowerCase().includes(term) ||
        cn.invoice_number?.toLowerCase().includes(term)
    );
  }, [data?.results, searchTerm]);

  const handleView = (creditNote: CreditNote) => {
    router.push(`/transactions/credit-notes/${creditNote.id}`);
  };

  const handleRefresh = async () => {
    await refetch();
  };

  if (error) {
    return (
      <div className="py-8 text-center">
        <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
        <p className="text-destructive">Failed to load credit notes</p>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Credit Notes"
          helpContent="View and manage credit notes. Pending credit notes require supervisor approval before refund processing."
        />

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search credit notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Status filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="REFUNDED">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={filteredNotes}
          keyExtractor={(cn) => cn.id}
          isLoading={isLoading}
          emptyMessage={searchTerm || statusFilter !== 'all' ? 'No credit notes match your filters' : 'No credit notes yet'}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          onRowClick={handleView}
          columns={[
            {
              key: 'credit_note_number',
              header: 'CN #',
              sortable: true,
              cell: (cn) => (
                <span className="font-mono text-sm font-medium">{cn.credit_note_number}</span>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              sortFn: (a, b) => (a.patient_name || '').localeCompare(b.patient_name || ''),
              cell: (cn) => cn.patient_name || '—',
            },
            {
              key: 'invoice_number',
              header: 'Invoice',
              cell: (cn) => (
                <span className="font-mono text-sm text-muted-foreground">
                  {cn.invoice_number || `INV-${cn.invoice}`}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'reason',
              header: 'Reason',
              sortable: true,
              cell: (cn) => (
                <span className="text-sm">{reasonLabels[cn.reason] || cn.reason}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => parseFloat(a.amount) - parseFloat(b.amount),
              cell: (cn) => (
                <span className="font-medium">{formatCurrency(parseFloat(cn.amount))}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (cn) => <CreditNoteStatusBadge status={cn.status} />,
            },
            {
              key: 'created_at',
              header: 'Requested',
              sortable: true,
              sortType: 'date',
              cell: (cn) => (
                <span className="text-sm text-muted-foreground">
                  {format(new Date(cn.created_at), 'dd MMM yyyy')}
                </span>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(cn) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium truncate">
                      {cn.credit_note_number}
                    </span>
                    <CreditNoteStatusBadge status={cn.status} />
                  </div>
                  <p className="text-sm truncate">{cn.patient_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {reasonLabels[cn.reason] || cn.reason} • {format(new Date(cn.created_at), 'dd MMM yyyy')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">{formatCurrency(parseFloat(cn.amount))}</p>
                </div>
              </div>
            </Card>
          )}
        />
      </div>
    </PullToRefresh>
  );
}

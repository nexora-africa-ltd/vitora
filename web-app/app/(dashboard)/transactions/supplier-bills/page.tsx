/**
 * Supplier Bills (Accounts Payable) List Page
 *
 * Displays all supplier bills with aging summary, filtering, and search.
 * Links to detail pages for payment recording and 3-way matching.
 */
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Ban,
} from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { billingApi } from '@/lib/api/billing';
import { formatCurrency } from '@/lib/utils/format';
import type { SupplierBillList } from '@/lib/schemas/billing.schema';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  RECEIVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  APPROVED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  PARTIAL: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const MATCH_COLORS: Record<string, string> = {
  MATCHED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  VARIANCE: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  UNMATCHED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export default function SupplierBillsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [page, setPage] = React.useState(1);

  const { data: billsData, isLoading } = useQuery({
    queryKey: ['supplier-bills', { page, search, status: statusFilter }],
    queryFn: () =>
      billingApi.supplierBills.list({
        page,
        page_size: 20,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
  });

  const { data: agingData } = useQuery({
    queryKey: ['supplier-bills-aging'],
    queryFn: () => billingApi.supplierBills.agingSummary(),
  });

  const bills = billsData?.results ?? [];
  const totalCount = billsData?.count ?? 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Supplier Bills"
          helpContent="Track supplier invoices (accounts payable). Record payments, view aging reports, and verify 3-way matching between PO, GRN, and supplier invoice."
          actions={
            <Button onClick={() => router.push('/transactions/supplier-bills/new')}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Bill</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Aging Summary Cards */}
        {agingData && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <AgingCard label="Current" amount={agingData.current} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
            <AgingCard label="1-30 days" amount={agingData.days_30} icon={<Clock className="h-4 w-4 text-blue-500" />} />
            <AgingCard label="31-60 days" amount={agingData.days_60} icon={<Clock className="h-4 w-4 text-yellow-500" />} />
            <AgingCard label="61-90 days" amount={agingData.days_90} icon={<AlertTriangle className="h-4 w-4 text-orange-500" />} />
            <AgingCard label="90+ days" amount={agingData.over_90} icon={<Ban className="h-4 w-4 text-red-500" />} />
            <AgingCard label="Total Outstanding" amount={agingData.total} icon={<FileSpreadsheet className="h-4 w-4 text-primary" />} />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search bills..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:w-64"
          />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bills Table */}
        <ResponsiveTable<SupplierBillList>
          data={bills}
          keyExtractor={(bill) => bill.id}
          onRowClick={(bill) => router.push(`/transactions/supplier-bills/${bill.id}`)}
          isLoading={isLoading}
          emptyMessage="No supplier bills found"
          columns={[
            {
              key: 'bill_number',
              header: 'Bill #',
              sortable: true,
              cell: (bill) => (
                <span className="font-medium">{bill.bill_number}</span>
              ),
            },
            {
              key: 'supplier_name',
              header: 'Supplier',
              sortable: true,
              cell: (bill) => bill.supplier_name,
            },
            {
              key: 'issue_date',
              header: 'Date',
              sortable: true,
              sortType: 'date',
              cell: (bill) => new Date(bill.issue_date).toLocaleDateString(),
              hideOnMobile: true,
            },
            {
              key: 'due_date',
              header: 'Due',
              sortable: true,
              sortType: 'date',
              cell: (bill) => bill.due_date ? new Date(bill.due_date).toLocaleDateString() : '—',
              hideOnMobile: true,
            },
            {
              key: 'total_amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              cell: (bill) => formatCurrency(parseFloat(bill.total_amount)),
            },
            {
              key: 'balance',
              header: 'Balance',
              sortable: true,
              sortType: 'number',
              cell: (bill) => formatCurrency(parseFloat(bill.balance)),
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (bill) => (
                <Badge className={`${STATUS_COLORS[bill.status] || ''} shrink-0 w-fit`}>
                  {bill.status}
                </Badge>
              ),
            },
            {
              key: 'match_status',
              header: 'Match',
              sortable: true,
              cell: (bill) => (
                <Badge variant="outline" className={`${MATCH_COLORS[bill.match_status] || ''} shrink-0 w-fit`}>
                  {bill.match_status}
                </Badge>
              ),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(bill) => (
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{bill.bill_number}</p>
                <p className="text-sm text-muted-foreground truncate">{bill.supplier_name}</p>
                <p className="text-sm mt-1">{formatCurrency(parseFloat(bill.total_amount))}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`${STATUS_COLORS[bill.status] || ''} shrink-0 w-fit`}>
                  {bill.status}
                </Badge>
                {bill.balance !== '0.00' && (
                  <span className="text-xs text-muted-foreground">
                    Bal: {formatCurrency(parseFloat(bill.balance))}
                  </span>
                )}
              </div>
            </div>
          )}
          defaultSortColumn="issue_date"
          defaultSortDirection="desc"
        />

        {/* Pagination */}
        {totalCount > 20 && (
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {totalCount} bill{totalCount !== 1 ? 's' : ''} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!billsData?.next}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

function AgingCard({ label, amount, icon }: { label: string; amount: string; icon: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative p-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-sm font-semibold">{formatCurrency(parseFloat(amount))}</p>
      </CardContent>
    </Card>
  );
}

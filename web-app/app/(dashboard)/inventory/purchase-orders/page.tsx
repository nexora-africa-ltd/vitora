'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { inventoryApi } from '@/lib/api/inventory';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/types/inventory';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  PARTIALLY_RECEIVED: 'Partial',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-purple-100 text-purple-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-purchase-orders', page, debouncedSearch, statusFilter],
    queryFn: () =>
      inventoryApi.listPurchaseOrders({
        page,
        page_size: pageSize,
        status: statusFilter !== 'all' ? (statusFilter as PurchaseOrderStatus) : undefined,
      }),
  });

  const orders = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Stats from current page data
  const draftCount = orders.filter(o => o.status === 'DRAFT').length;
  const pendingCount = orders.filter(o => o.status === 'SUBMITTED').length;
  const approvedCount = orders.filter(o => o.status === 'APPROVED').length;
  const totalValue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Purchase Orders"
          helpContent="Create and manage purchase orders for your facility. Submit orders for approval, track delivery status, and manage supplier procurement."
          actions={
            <Button onClick={() => router.push('/inventory/purchase-orders/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New PO
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Drafts</p>
              <p className="text-xl font-bold">{draftCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="text-xl font-bold text-amber-600">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="text-xl font-bold text-blue-600">{approvedCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Page Total</p>
              <p className="text-lg font-bold truncate">{formatCurrency(totalValue)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search PO number, supplier..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:w-64"
          />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(statusLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable<PurchaseOrder>
          data={orders}
          keyExtractor={(o) => o.id}
          isLoading={isLoading}
          emptyMessage="No purchase orders found."
          onRowClick={(o) => router.push(`/inventory/purchase-orders/${o.id}`)}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'po_number',
              header: 'PO #',
              sortable: true,
              cell: (o) => <span className="font-mono text-sm">{o.po_number}</span>,
            },
            {
              key: 'supplier_name',
              header: 'Supplier',
              sortable: true,
              cell: (o) => <span className="font-medium">{o.supplier_name}</span>,
            },
            {
              key: 'order_date',
              header: 'Order Date',
              sortable: true,
              sortType: 'date',
              hideOnMobile: true,
              cell: (o) => formatDate(o.order_date),
            },
            {
              key: 'expected_delivery_date',
              header: 'Expected Delivery',
              sortable: true,
              sortType: 'date',
              hideOnMobile: true,
              cell: (o) => formatDate(o.expected_delivery_date),
            },
            {
              key: 'total_amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              cell: (o) => <span className="font-medium">{formatCurrency(o.total_amount)}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (o) => (
                <Badge className={`${statusColors[o.status]} shrink-0 w-fit`}>
                  {statusLabels[o.status]}
                </Badge>
              ),
            },
          ]}
          mobileCard={(o) => (
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium">{o.po_number}</span>
                <Badge className={`${statusColors[o.status]} shrink-0 w-fit`}>
                  {statusLabels[o.status]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{o.supplier_name}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(o.order_date)}</span>
                <span className="font-medium text-foreground">{formatCurrency(o.total_amount)}</span>
              </div>
            </div>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {totalPages} ({totalCount} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

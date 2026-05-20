'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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
import type { GoodsReceiptNote, GRNStatus } from '@/lib/types/inventory';

const statusLabels: Record<GRNStatus, string> = {
  DRAFT: 'Draft',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<GRNStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-green-100 text-green-700',
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

export default function GoodsReceiptPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-goods-receipts', page, debouncedSearch, statusFilter],
    queryFn: () =>
      inventoryApi.listGoodsReceipts({
        page,
        page_size: pageSize,
        status: statusFilter !== 'all' ? (statusFilter as GRNStatus) : undefined,
      }),
  });

  const receipts = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Formal Goods Receipt"
          helpContent="Record incoming deliveries against purchase orders. Confirm receipts to update inventory stock levels automatically."
          actions={
            <Button onClick={() => router.push('/inventory/goods-receipt/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New GRN
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{totalCount}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-xl font-bold text-amber-600">{receipts.filter(r => r.status === 'DRAFT').length}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
            <CardContent className="relative p-3 sm:p-4">
              <p className="text-xs text-muted-foreground">Confirmed</p>
              <p className="text-xl font-bold text-green-600">{receipts.filter(r => r.status === 'CONFIRMED').length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder="Search GRN number, supplier..."
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
              {Object.entries(statusLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable<GoodsReceiptNote>
          data={receipts}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No goods receipts found."
          onRowClick={(r) => router.push(`/inventory/goods-receipt/${r.id}`)}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          columns={[
            {
              key: 'grn_number',
              header: 'GRN #',
              sortable: true,
              cell: (r) => <span className="font-mono text-sm">{r.grn_number}</span>,
            },
            {
              key: 'po_number',
              header: 'PO #',
              sortable: true,
              hideOnMobile: true,
              cell: (r) => <span className="font-mono text-sm">{r.po_number || '—'}</span>,
            },
            {
              key: 'supplier_name',
              header: 'Supplier',
              sortable: true,
              cell: (r) => <span className="font-medium">{r.supplier_name}</span>,
            },
            {
              key: 'received_date',
              header: 'Received',
              sortable: true,
              sortType: 'date',
              hideOnMobile: true,
              cell: (r) => formatDate(r.received_date),
            },
            {
              key: 'total_items',
              header: 'Items',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (r) => r.total_items,
            },
            {
              key: 'total_amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              cell: (r) => <span className="font-medium">{formatCurrency(r.total_amount)}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (r) => (
                <Badge className={`${statusColors[r.status]} shrink-0 w-fit`}>
                  {statusLabels[r.status]}
                </Badge>
              ),
            },
          ]}
          mobileCard={(r) => (
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-medium">{r.grn_number}</span>
                <Badge className={`${statusColors[r.status]} shrink-0 w-fit`}>
                  {statusLabels[r.status]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{r.supplier_name}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(r.received_date)} · {r.total_items} items</span>
                <span className="font-medium text-foreground">{formatCurrency(r.total_amount)}</span>
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

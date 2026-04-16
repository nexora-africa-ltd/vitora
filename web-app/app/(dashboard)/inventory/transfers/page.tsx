'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { StockTransfer, TransferStatus } from '@/lib/types/inventory';

const statusLabels: Record<TransferStatus, string> = {
  DRAFT: 'Draft',
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  IN_TRANSIT: 'In Transit',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<TransferStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  REQUESTED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  APPROVED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  IN_TRANSIT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  RECEIVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function StockTransfersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-transfers', page, statusFilter],
    queryFn: () =>
      inventoryApi.listTransfers({
        page,
        page_size: 20,
        status: statusFilter !== 'all' ? (statusFilter as TransferStatus) : undefined,
      }),
  });

  const transfers = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  // Stats from current page data (approximate)
  const inTransit = transfers.filter((t) => t.status === 'IN_TRANSIT').length;
  const awaiting = transfers.filter((t) => t.status === 'REQUESTED').length;
  const received = transfers.filter((t) => t.status === 'RECEIVED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Stock Transfers"
          helpContent="Transfer stock between facilities and store locations. Track transfers from request through dispatch to receipt."
          actions={
            <Button onClick={() => router.push('/inventory/transfers/new')}>
              Create Transfer
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: totalCount },
            { label: 'In Transit', value: inTransit },
            { label: 'Awaiting Approval', value: awaiting },
            { label: 'Received', value: received },
          ].map((stat) => (
            <Card key={stat.label} className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
                aria-hidden="true"
              />
              <CardContent className="relative p-3 sm:p-4">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-lg sm:text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(statusLabels).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ResponsiveTable<StockTransfer>
            data={transfers}
            keyExtractor={(t) => t.id}
            onRowClick={(t) => router.push(`/inventory/transfers/${t.id}`)}
            defaultSortColumn="created_at"
            defaultSortDirection="desc"
            columns={[
              {
                key: 'transfer_number',
                header: 'Transfer #',
                sortable: true,
                cell: (t) => <span className="font-medium">{t.transfer_number}</span>,
              },
              {
                key: 'route',
                header: 'Route',
                cell: (t) => (
                  <div className="flex items-center gap-1 text-sm">
                    <span className="truncate max-w-[120px]">{t.source_facility_name}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate max-w-[120px]">{t.destination_facility_name}</span>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                cell: (t) => (
                  <Badge variant="outline" className={statusColors[t.status]}>
                    {statusLabels[t.status]}
                  </Badge>
                ),
              },
              {
                key: 'total_items',
                header: 'Items',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (t) => t.total_items,
              },
              {
                key: 'request_date',
                header: 'Request Date',
                sortable: true,
                sortType: 'date',
                hideOnMobile: true,
                cell: (t) => new Date(t.request_date).toLocaleDateString(),
              },
              {
                key: 'requested_by_name',
                header: 'Requested By',
                sortable: true,
                hideOnMobile: true,
                cell: (t) => t.requested_by_name,
              },
            ]}
            mobileCard={(t) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{t.transfer_number}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <span className="truncate">{t.source_facility_name}</span>
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.destination_facility_name}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`${statusColors[t.status]} shrink-0 w-fit`}>
                    {statusLabels[t.status]}
                  </Badge>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t.total_items} item(s)</span>
                  <span>{new Date(t.request_date).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} transfers)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
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

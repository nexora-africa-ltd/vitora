'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Loader2 } from 'lucide-react';
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
import type { StockCount, StockCountStatus, StockCountType } from '@/lib/types/inventory';

const statusLabels: Record<StockCountStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
};

const statusColors: Record<StockCountStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  COMPLETED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const typeLabels: Record<StockCountType, string> = {
  FULL: 'Full Count',
  CYCLE: 'Cycle Count',
  SPOT: 'Spot Check',
};

const typeColors: Record<StockCountType, string> = {
  FULL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  CYCLE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  SPOT: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export default function StockCountsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-stock-counts', page, statusFilter, typeFilter],
    queryFn: () =>
      inventoryApi.listStockCounts({
        page,
        page_size: 20,
        status: statusFilter !== 'all' ? (statusFilter as StockCountStatus) : undefined,
        count_type: typeFilter !== 'all' ? (typeFilter as StockCountType) : undefined,
      }),
  });

  const counts = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const inProgressCount = counts.filter((c) => c.status === 'IN_PROGRESS').length;
  const awaitingApproval = counts.filter((c) => c.status === 'COMPLETED').length;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Stock Counts"
          helpContent="Physical stock verification sessions. Create a count, generate items from current batches, record physical quantities, then approve to auto-create adjustments for variances."
          actions={
            <Button onClick={() => router.push('/inventory/stock-counts/new')}>
              <ClipboardList className="mr-2 h-4 w-4" />
              New Count
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Counts', value: totalCount },
            { label: 'In Progress', value: inProgressCount },
            { label: 'Awaiting Approval', value: awaitingApproval },
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
            <SelectTrigger className="sm:w-44">
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
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(typeLabels).map(([val, label]) => (
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
          <ResponsiveTable<StockCount>
            data={counts}
            keyExtractor={(c) => c.id}
            onRowClick={(c) => router.push(`/inventory/stock-counts/${c.id}`)}
            defaultSortColumn="created_at"
            defaultSortDirection="desc"
            columns={[
              {
                key: 'count_number',
                header: 'Count #',
                sortable: true,
                cell: (c) => <span className="font-medium">{c.count_number}</span>,
              },
              {
                key: 'count_type',
                header: 'Type',
                sortable: true,
                cell: (c) => (
                  <Badge variant="outline" className={typeColors[c.count_type]}>
                    {typeLabels[c.count_type]}
                  </Badge>
                ),
              },
              {
                key: 'store_location_name',
                header: 'Store',
                sortable: true,
                hideOnMobile: true,
                cell: (c) => c.store_location_name || '—',
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                cell: (c) => (
                  <Badge variant="outline" className={statusColors[c.status]}>
                    {statusLabels[c.status]}
                  </Badge>
                ),
              },
              {
                key: 'started_by_name',
                header: 'Started By',
                sortable: true,
                hideOnMobile: true,
                cell: (c) => c.started_by_name,
              },
              {
                key: 'total_discrepancies',
                header: 'Discrepancies',
                sortable: true,
                sortType: 'number',
                hideOnMobile: true,
                cell: (c) => (
                  <span className={c.total_discrepancies > 0 ? 'text-destructive font-medium' : ''}>
                    {c.total_discrepancies}
                  </span>
                ),
              },
              {
                key: 'created_at',
                header: 'Date',
                sortable: true,
                sortType: 'date',
                cell: (c) => new Date(c.created_at).toLocaleDateString(),
              },
            ]}
            mobileCard={(c) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.count_number}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.store_location_name || 'All locations'} · {c.started_by_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                    {c.total_discrepancies > 0 && (
                      <span className="text-destructive">
                        {' '}
                        · {c.total_discrepancies} discrepancies
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={typeColors[c.count_type]}>
                    {typeLabels[c.count_type]}
                  </Badge>
                  <Badge variant="outline" className={statusColors[c.status]}>
                    {statusLabels[c.status]}
                  </Badge>
                </div>
              </div>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalCount} counts)
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

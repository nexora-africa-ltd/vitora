'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { inventoryApi } from '@/lib/api/inventory';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { ConsumptionRecord } from '@/lib/types/inventory';

export default function ConsumptionRecordsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [periodAfter, setPeriodAfter] = useState('');
  const [periodBefore, setPeriodBefore] = useState('');

  const params = {
    page,
    ...(periodAfter ? { period_after: periodAfter } : {}),
    ...(periodBefore ? { period_before: periodBefore } : {}),
    ordering: '-period_start',
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['consumption-records', params],
    queryFn: () => inventoryApi.listConsumptionRecords(params),
  });

  const records = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 20);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Consumption Records"
          helpContent="Aggregated drug consumption data showing quantities dispensed, transferred, and adjusted over time periods. Used for demand forecasting."
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <Label htmlFor="period-after" className="text-xs">Period From</Label>
            <Input
              id="period-after"
              type="date"
              className="w-40"
              value={periodAfter}
              onChange={(e) => { setPeriodAfter(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <Label htmlFor="period-before" className="text-xs">Period To</Label>
            <Input
              id="period-before"
              type="date"
              className="w-40"
              value={periodBefore}
              onChange={(e) => { setPeriodBefore(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load consumption records.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={records}
              keyExtractor={(r) => r.id}
              defaultSortColumn="period_start"
              defaultSortDirection="desc"
              columns={[
                {
                  key: 'drug_name',
                  header: 'Drug',
                  sortable: true,
                  cell: (r) => <span className="font-medium">{r.drug_name}</span>,
                },
                {
                  key: 'period_start',
                  header: 'Period',
                  sortable: true,
                  sortType: 'date' as const,
                  cell: (r) => (
                    <span className="text-sm">
                      {new Date(r.period_start).toLocaleDateString()} –{' '}
                      {new Date(r.period_end).toLocaleDateString()}
                    </span>
                  ),
                },
                {
                  key: 'quantity_dispensed',
                  header: 'Dispensed',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (r) => <span className="font-mono">{Number(r.quantity_dispensed).toLocaleString()}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'quantity_transferred',
                  header: 'Transferred',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (r) => <span className="font-mono">{Number(r.quantity_transferred).toLocaleString()}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'quantity_adjusted',
                  header: 'Adjusted',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (r) => <span className="font-mono">{Number(r.quantity_adjusted).toLocaleString()}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'total_consumption',
                  header: 'Total',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (r) => (
                    <span className="font-mono font-medium">{Number(r.total_consumption).toLocaleString()}</span>
                  ),
                },
                {
                  key: 'average_daily_consumption',
                  header: 'Avg Daily',
                  sortable: true,
                  sortType: 'number' as const,
                  cell: (r) => (
                    <span className="font-mono">{Number(r.average_daily_consumption).toFixed(2)}</span>
                  ),
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(r) => (
                <Card className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.drug_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.period_start).toLocaleDateString()} – {new Date(r.period_end).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {Number(r.total_consumption).toLocaleString()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs text-muted-foreground">
                    <div>Disp: <span className="font-mono">{Number(r.quantity_dispensed).toLocaleString()}</span></div>
                    <div>Trans: <span className="font-mono">{Number(r.quantity_transferred).toLocaleString()}</span></div>
                    <div>Avg: <span className="font-mono">{Number(r.average_daily_consumption).toFixed(2)}</span>/d</div>
                  </div>
                </Card>
              )}
            />

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-muted-foreground">
                  Page {page} of {totalPages} ({totalCount} records)
                </p>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 rounded border disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

/**
 * Stock Adjustments Page
 * Lists all stock adjustments (damage, expiry, corrections, returns, etc.)
 * with pagination.
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStockAdjustments } from '@/lib/hooks/use-pharmacy';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { StockAdjustment, AdjustmentType } from '@/lib/types/pharmacy';

const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  LOST: 'Lost',
  THEFT: 'Theft',
  CORRECTION: 'Correction',
  RETURN_TO_SUPPLIER: 'Return to Supplier',
  DONATION: 'Donation',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  DAMAGE: 'Damage',
  LOSS: 'Loss',
  RETURN_SUPPLIER: 'Return Supplier',
  COUNT_CORRECTION: 'Count Correction',
  SAMPLE: 'Sample',
  OTHER: 'Other',
};

const ADJUSTMENT_TYPE_COLORS: Partial<Record<AdjustmentType, string>> = {
  DAMAGED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  CORRECTION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  COUNT_CORRECTION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  RETURN_TO_SUPPLIER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  TRANSFER_IN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  DONATION: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

export default function StockAdjustmentsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useStockAdjustments({ page, page_size: pageSize });

  const adjustments = data?.results || [];
  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Stock Adjustments"
          helpContent="Track and record stock adjustments including damage, expiry, corrections, returns, and transfers. All adjustments are audit-logged."
        />

        <ResponsiveTable
          data={adjustments}
          keyExtractor={(item) => item.id}
          emptyMessage="No stock adjustments recorded yet."
          columns={[
            {
              key: 'drug',
              header: 'Drug / Batch',
              sortable: true,
              sortFn: (a: StockAdjustment, b: StockAdjustment) => (a.drug_name || '').localeCompare(b.drug_name || ''),
              cell: (item: StockAdjustment) => (
                <div>
                  <p className="font-medium truncate">{item.drug_name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{item.batch_number || '—'}</p>
                </div>
              ),
            },
            {
              key: 'type',
              header: 'Type',
              sortable: true,
              cell: (item: StockAdjustment) => (
                <Badge className={ADJUSTMENT_TYPE_COLORS[item.adjustment_type] || 'bg-muted text-muted-foreground'}>
                  {ADJUSTMENT_TYPE_LABELS[item.adjustment_type] || item.adjustment_type}
                </Badge>
              ),
            },
            {
              key: 'quantity',
              header: 'Qty',
              sortable: true,
              sortType: 'number',
              sortFn: (a: StockAdjustment, b: StockAdjustment) => a.quantity - b.quantity,
              cell: (item: StockAdjustment) => (
                <span className={item.quantity < 0 ? 'text-destructive font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                  {item.quantity > 0 ? '+' : ''}{item.quantity}
                </span>
              ),
            },
            {
              key: 'reason',
              header: 'Reason',
              sortable: true,
              cell: (item: StockAdjustment) => (
                <p className="text-sm text-muted-foreground truncate max-w-[200px]">{item.reason}</p>
              ),
            },
            {
              key: 'adjusted_by',
              header: 'Adjusted By',
              sortable: true,
              sortFn: (a: StockAdjustment, b: StockAdjustment) => (a.adjusted_by_name || '').localeCompare(b.adjusted_by_name || ''),
              cell: (item: StockAdjustment) => item.adjusted_by_name || '—',
            },
            {
              key: 'date',
              header: 'Date',
              sortable: true,
              sortType: 'date',
              sortFn: (a: StockAdjustment, b: StockAdjustment) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              cell: (item: StockAdjustment) => format(new Date(item.created_at), 'dd MMM yyyy'),
            },
          ]}
          mobileCard={(item: StockAdjustment) => (
            <Card className="p-3">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.drug_name || '—'}</p>
                  <p className="text-xs text-muted-foreground">{item.batch_number}</p>
                </div>
                <Badge className={ADJUSTMENT_TYPE_COLORS[item.adjustment_type] || 'bg-muted text-muted-foreground'}>
                  {ADJUSTMENT_TYPE_LABELS[item.adjustment_type] || item.adjustment_type}
                </Badge>
              </div>
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className={item.quantity < 0 ? 'text-destructive font-medium' : 'text-green-600 dark:text-green-400 font-medium'}>
                  {item.quantity > 0 ? '+' : ''}{item.quantity} units
                </span>
                <span className="text-muted-foreground">{format(new Date(item.created_at), 'dd MMM yyyy')}</span>
              </div>
              {item.reason && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{item.reason}</p>
              )}
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalCount} adjustment{totalCount !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

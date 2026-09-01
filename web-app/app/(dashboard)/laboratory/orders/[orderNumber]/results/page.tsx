'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LabResultsEntry } from '@/components/laboratory/lab-results-entry';
import { LabResultsGrid } from '@/components/laboratory/lab-results-grid';
import { useLabOrder } from '@/lib/hooks/use-laboratory';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { LabOrderItem } from '@/lib/types/laboratory';

interface ResultsEntryPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function ResultsEntryPage({ params }: ResultsEntryPageProps) {
  const { orderNumber } = use(params);
  const router = useRouter();
  const { data: order, isLoading, error, refetch, isFetching } = useLabOrder(orderNumber);
  const { refresh, isRefreshing } = usePageRefresh();

  // Handler when a result is successfully added
  const handleResultAdded = async () => {
    await refetch();
  };

  // Determine if we should use grid mode (numeric-only panel items)
  const { gridItems, formItems, useGrid } = useMemo(() => {
    if (!order) return { gridItems: [], formItems: [], useGrid: false };
    const hasChildren = (item: LabOrderItem) =>
      order.items.some((child: LabOrderItem) => child.panel_parent === item.id);
    const resultable = order.items.filter(
      (item: LabOrderItem) => !(item.is_panel && hasChildren(item))
    );
    const pending = resultable.filter((item: LabOrderItem) => !item.has_result);

    // Use grid if: all pending items are numeric type AND there are 3+ pending items
    const allNumeric =
      pending.length >= 3 && pending.every((item: LabOrderItem) => item.result_type === 'NUMERIC');

    return {
      gridItems: allNumeric ? resultable : [],
      formItems: allNumeric ? [] : order.items,
      useGrid: allNumeric,
    };
  }, [order]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Enter Results"
          helpContent="Record and verify test results for a lab order. Pull down to refresh on mobile, or use the refresh button in the header."
        />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-500">{error?.message || 'Failed to load order'}</p>
        <Button variant="outline" onClick={() => router.push('/laboratory')}>
          Go to Laboratory
        </Button>
      </div>
    );
  }

  return (
    <PullToRefresh
      onRefresh={refresh}
      isRefreshing={isRefreshing || isFetching}
      className="min-h-full"
    >
      <div className="space-y-6">
        <PageHeader
          title="Enter Results"
          helpContent={`Record and verify test results for order ${orderNumber}. Pull down to refresh on mobile, or use the refresh button in the header.`}
        />

        <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium">
              {order.patient_name}
              <span className="text-muted-foreground"> • {order.patient_mrn}</span>
            </p>
            <p className="font-mono text-xs text-muted-foreground sm:text-sm">
              {order.order_number}
            </p>
          </div>
        </div>

        {useGrid ? (
          <LabResultsGrid
            orderNumber={orderNumber}
            items={gridItems}
            onComplete={() => router.push(`/laboratory/orders/${orderNumber}`)}
            onResultAdded={handleResultAdded}
          />
        ) : (
          <LabResultsEntry
            orderNumber={orderNumber}
            items={formItems.length > 0 ? formItems : order.items}
            onComplete={() => router.push(`/laboratory/orders/${orderNumber}`)}
            onResultAdded={handleResultAdded}
            patientId={order.patient ?? undefined}
            encounterId={order.encounter ?? undefined}
          />
        )}
      </div>
    </PullToRefresh>
  );
}

'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { LabResultsEntry } from '@/components/laboratory/lab-results-entry';
import { useLabOrder } from '@/lib/hooks/use-laboratory';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';

interface ResultsEntryPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function ResultsEntryPage({ params }: ResultsEntryPageProps) {
  const { orderNumber } = use(params);
  const router = useRouter();
  const { data: order, isLoading, error, refetch, isFetching } = useLabOrder(orderNumber);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Enter Results"
          helpContent="Record and verify test results for a lab order. Pull down to refresh on mobile, or use the refresh button in the header."
        />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">
          {error?.message || 'Failed to load order'}
        </p>
        <Button variant="outline" onClick={() => router.push('/laboratory')}>
          Go to Laboratory
        </Button>
      </div>
    );
  }

  // Handler when a result is successfully added
  const handleResultAdded = async () => {
    await refetch();
  };

  return (
    <PullToRefresh
      onRefresh={async () => {
        await refetch();
      }}
      isRefreshing={isFetching}
      className="min-h-full"
    >
      <div className="space-y-6">
        <PageHeader
          title="Enter Results"
          helpContent={`Record and verify test results for order ${orderNumber}. Pull down to refresh on mobile, or use the refresh button in the header.`}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {order.patient_name}
              <span className="text-muted-foreground"> • {order.patient_mrn}</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground font-mono">{order.order_number}</p>
          </div>
        </div>

        <LabResultsEntry
          orderNumber={orderNumber}
          items={order.items}
          onComplete={() => router.push(`/laboratory/orders/${orderNumber}`)}
          onResultAdded={handleResultAdded}
        />
      </div>
    </PullToRefresh>
  );
}

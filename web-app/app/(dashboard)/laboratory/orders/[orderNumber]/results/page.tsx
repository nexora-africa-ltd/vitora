'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { LabResultsEntry } from '@/components/laboratory/lab-results-entry';
import { useLabOrder } from '@/lib/hooks/use-laboratory';
import { Skeleton } from '@/components/ui/skeleton';

interface ResultsEntryPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function ResultsEntryPage({ params }: ResultsEntryPageProps) {
  const { orderNumber } = use(params);
  const router = useRouter();
  const { data: order, isLoading, error } = useLabOrder(orderNumber);

  if (isLoading) {
    return (
      <div className="space-y-6">
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
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Enter Results</h1>
          <p className="text-muted-foreground">
            Order {orderNumber} • {order.patient_name}
          </p>
        </div>
      </div>

      {/* Results Entry Component */}
      <LabResultsEntry
        orderNumber={orderNumber}
        items={order.items}
        onComplete={() => router.push(`/laboratory/orders/${orderNumber}`)}
      />
    </div>
  );
}

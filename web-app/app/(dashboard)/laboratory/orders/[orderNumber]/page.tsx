'use client';

import { use } from 'react';
import { LabOrderDetail } from '@/components/laboratory/lab-order-detail';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';

interface LabOrderPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function LabOrderPage({ params }: LabOrderPageProps) {
  const { orderNumber } = use(params);
  const { refresh, isRefreshing } = usePageRefresh();

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <LabOrderDetail orderNumber={orderNumber} />
    </PullToRefresh>
  );
}

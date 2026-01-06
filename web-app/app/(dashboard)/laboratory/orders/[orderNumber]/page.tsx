'use client';

import { use } from 'react';
import { LabOrderDetail } from '@/components/laboratory/lab-order-detail';

interface LabOrderPageProps {
  params: Promise<{
    orderNumber: string;
  }>;
}

export default function LabOrderPage({ params }: LabOrderPageProps) {
  const { orderNumber } = use(params);
  return <LabOrderDetail orderNumber={orderNumber} />;
}

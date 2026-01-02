'use client';

import { LabOrderDetail } from '@/components/laboratory/lab-order-detail';

interface LabOrderPageProps {
  params: {
    orderNumber: string;
  };
}

export default function LabOrderPage({ params }: LabOrderPageProps) {
  return <LabOrderDetail orderNumber={params.orderNumber} />;
}

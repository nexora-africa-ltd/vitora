/**
 * Physiotherapy Order Detail Page
 */

'use client';

import { useParams } from 'next/navigation';
import { PhysioOrderDetail } from '@/components/allied-health/physiotherapy';

export default function PhysiotherapyOrderDetailPage() {
  const params = useParams();
  const orderId = Number(params.id);

  return <PhysioOrderDetail orderId={orderId} />;
}

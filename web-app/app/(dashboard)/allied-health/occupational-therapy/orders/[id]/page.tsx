/**
 * Occupational Therapy Order Detail Page
 */

'use client';

import { useParams } from 'next/navigation';
import { OTOrderDetail } from '@/components/allied-health/occupational-therapy';

export default function OTOrderDetailPage() {
  const params = useParams();
  const orderId = Number(params.id);

  return <OTOrderDetail orderId={orderId} />;
}

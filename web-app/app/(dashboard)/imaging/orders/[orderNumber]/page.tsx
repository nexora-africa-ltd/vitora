/**
 * Imaging order detail page.
 */
'use client';

import { use } from 'react';
import { ImagingOrderDetail } from '@/components/imaging';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default function ImagingOrderDetailPage({ params }: PageProps) {
  const { orderNumber } = use(params);
  
  return (
    <div className="space-y-6">
      <ImagingOrderDetail orderNumber={orderNumber} />
    </div>
  );
}

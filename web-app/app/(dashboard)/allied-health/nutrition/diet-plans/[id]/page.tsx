/**
 * Diet Plan Detail Page
 */

'use client';

import { use } from 'react';
import { DietPlanDetail } from '@/components/allied-health/nutrition';

interface DietPlanDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DietPlanDetailPage({ params }: DietPlanDetailPageProps) {
  const { id } = use(params);

  return <DietPlanDetail dietPlanId={Number(id)} />;
}

/**
 * Nutrition Consultation Detail Page
 */

'use client';

import { useParams } from 'next/navigation';
import { NutritionConsultationDetail } from '@/components/allied-health/nutrition';

export default function NutritionConsultationDetailPage() {
  const params = useParams();
  const consultationId = Number(params.id);

  return <NutritionConsultationDetail consultationId={consultationId} />;
}

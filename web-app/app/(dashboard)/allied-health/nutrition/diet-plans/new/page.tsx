/**
 * New Diet Plan Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { DietPlanForm } from '@/components/allied-health/nutrition';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

function NewDietPlanContent() {
  const searchParams = useSearchParams();
  const consultationId = searchParams.get('consultation_id');

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Diet Plan"
        helpContent="Create a new diet plan with meal plans, nutritional targets, and food guidance."
      />
      <DietPlanForm
        consultationId={consultationId ? Number(consultationId) : undefined}
      />
    </div>
  );
}

export default function NewDietPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      }
    >
      <NewDietPlanContent />
    </Suspense>
  );
}

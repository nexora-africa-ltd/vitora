/**
 * Edit Diet Plan Page
 */

'use client';

import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { DietPlanForm } from '@/components/allied-health/nutrition';

interface EditDietPlanPageProps {
  params: Promise<{ id: string }>;
}

export default function EditDietPlanPage({ params }: EditDietPlanPageProps) {
  const { id } = use(params);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Diet Plan"
        helpContent="Update diet plan details including meal plans, nutritional targets, and food guidance."
      />
      <DietPlanForm dietPlanId={Number(id)} />
    </div>
  );
}

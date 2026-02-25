/**
 * Nutrition Consultations List Page
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { NutritionConsultationTable } from '@/components/allied-health/nutrition';

export default function NutritionConsultationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition Consultations"
        helpContent="Manage nutrition consultations and dietary assessments. Track BMI, dietary restrictions, and diet plans."
      />
      <NutritionConsultationTable />
    </div>
  );
}

/**
 * New Nutrition Consultation Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { NutritionConsultationForm } from '@/components/allied-health/nutrition';

export default function NewNutritionConsultationPage() {
  const searchParams = useSearchParams();
  
  // Support pre-selecting patient or encounter from query params
  const patientId = searchParams.get('patient_id') 
    ? Number(searchParams.get('patient_id')) 
    : undefined;
  const encounterId = searchParams.get('encounter_id') 
    ? Number(searchParams.get('encounter_id')) 
    : undefined;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Nutrition Consultation"
        helpContent="Create a nutrition consultation to assess a patient's dietary needs. Include BMI, MUAC, dietary restrictions, and create a personalized diet plan."
      />
      
      <NutritionConsultationForm 
        patientId={patientId} 
        encounterId={encounterId} 
      />
    </div>
  );
}

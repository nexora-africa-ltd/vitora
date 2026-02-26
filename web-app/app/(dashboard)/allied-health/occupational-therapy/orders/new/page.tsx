/**
 * New Occupational Therapy Order Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { OTOrderForm } from '@/components/allied-health/occupational-therapy';

export default function NewOTOrderPage() {
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
        title="New OT Order"
        helpContent="Create an occupational therapy referral order. Assess ADL/IADL baselines, set short/long term goals, and specify equipment needs."
      />
      
      <OTOrderForm 
        patientId={patientId} 
        encounterId={encounterId} 
      />
    </div>
  );
}

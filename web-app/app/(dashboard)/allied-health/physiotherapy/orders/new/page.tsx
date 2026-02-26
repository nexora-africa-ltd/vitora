/**
 * New Physiotherapy Order Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PhysioOrderForm } from '@/components/allied-health/physiotherapy';

export default function NewPhysiotherapyOrderPage() {
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
        title="New Physiotherapy Order"
        helpContent="Create a physiotherapy referral order for a patient. Select treatment type, specify clinical indication, and set session goals."
      />
      
      <PhysioOrderForm 
        patientId={patientId} 
        encounterId={encounterId} 
      />
    </div>
  );
}

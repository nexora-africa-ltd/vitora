/**
 * New Social Work Case Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { SWCaseForm } from '@/components/allied-health/social-work';

export default function NewSWCasePage() {
  const searchParams = useSearchParams();
  
  // Support pre-selecting patient or encounter from query params
  const patientId = searchParams.get('patient_id') 
    ? Number(searchParams.get('patient_id')) 
    : undefined;
  const encounterId = searchParams.get('encounter_id') 
    ? Number(searchParams.get('encounter_id')) 
    : undefined;
  const referralId = searchParams.get('referral_id') 
    ? Number(searchParams.get('referral_id')) 
    : undefined;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Social Work Case"
        helpContent="Create a social work case to track patient support needs. Document presenting issues, safety assessments, and intervention plans."
      />
      
      <SWCaseForm 
        patientId={patientId} 
        encounterId={encounterId}
        referralId={referralId}
      />
    </div>
  );
}

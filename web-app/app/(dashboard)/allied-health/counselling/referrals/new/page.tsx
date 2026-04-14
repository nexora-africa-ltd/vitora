/**
 * New Counselling Referral Page
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CounsellingReferralForm } from '@/components/allied-health/counselling';

export default function NewCounsellingReferralPage() {
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
        title="New Counselling Referral"
        helpContent="Create a counselling referral for a patient. Specify the type of counselling, presenting concerns, and risk assessment level."
      />

      <CounsellingReferralForm
        patientId={patientId}
        encounterId={encounterId}
      />
    </div>
  );
}

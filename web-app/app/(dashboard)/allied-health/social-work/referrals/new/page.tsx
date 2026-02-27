/**
 * New Social Work Referral Page
 * Creates a new social work referral (entry point from encounter flow).
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { SocialWorkReferralForm } from '@/components/allied-health/social-work';

export default function NewSocialWorkReferralPage() {
  const searchParams = useSearchParams();

  const patientId = searchParams.get('patient_id')
    ? Number(searchParams.get('patient_id'))
    : 0;
  const encounterId = searchParams.get('encounter_id')
    ? Number(searchParams.get('encounter_id'))
    : undefined;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="New Social Work Referral"
        helpContent="Create a referral for social work services. After approval, a case will be opened for the patient."
      />

      <SocialWorkReferralForm
        patientId={patientId}
        encounterId={encounterId}
      />
    </div>
  );
}

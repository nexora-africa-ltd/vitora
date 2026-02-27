/**
 * Edit Social Work Case Page
 */

'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { SWCaseForm } from '@/components/allied-health/social-work';
import { useSWCase } from '@/lib/hooks/use-social-work';

export default function EditSWCasePage() {
  const params = useParams();
  const caseId = Number(params.id);

  const { data: swCase, isLoading, error } = useSWCase(caseId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !swCase) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load case for editing.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Edit ${swCase.case_number || `Case #${caseId}`}`}
        helpContent="Update case details including presenting issues, safety assessment, goals, and intervention plans."
      />

      <SWCaseForm
        swCase={{
          id: swCase.id,
          patient_id: swCase.referral.patient.id,
          referral_reason: swCase.referral.referral_reason,
          presenting_issues: swCase.case_summary,
          urgency: swCase.urgency,
          safety_concerns: '',
          immediate_needs: '',
          support_network: '',
          goals: swCase.goals,
          intervention_plan: swCase.intervention_plan,
          external_referrals: swCase.external_agencies,
          status: swCase.status,
        }}
      />
    </div>
  );
}

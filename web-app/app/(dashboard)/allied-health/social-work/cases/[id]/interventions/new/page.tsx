/**
 * New Intervention Page
 * Creates a new intervention for a social work case.
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { InterventionForm } from '@/components/allied-health/social-work';
import { useSWCase } from '@/lib/hooks/use-social-work';

export default function NewInterventionPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = Number(params.id);

  const { data: swCase } = useSWCase(caseId);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Add Intervention"
        helpContent="Record a specific intervention such as counselling, crisis response, resource linking, or material support."
      />

      <InterventionForm
        caseId={caseId}
        caseNumber={swCase?.case_number}
        onSuccess={() => router.push(`/allied-health/social-work/cases/${caseId}`)}
        onCancel={() => router.push(`/allied-health/social-work/cases/${caseId}`)}
      />
    </div>
  );
}

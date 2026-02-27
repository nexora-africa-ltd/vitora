/**
 * New Case Note Page
 * Creates a new note for a social work case.
 */

'use client';

import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CaseNoteForm } from '@/components/allied-health/social-work';
import { useSWCase } from '@/lib/hooks/use-social-work';

export default function NewCaseNotePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = Number(params.id);

  const { data: swCase } = useSWCase(caseId);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Add Case Note"
        helpContent="Record a contact, assessment, progress update, or other note for this social work case."
      />

      <CaseNoteForm
        caseId={caseId}
        caseNumber={swCase?.case_number}
        onSuccess={() => router.push(`/allied-health/social-work/cases/${caseId}`)}
        onCancel={() => router.push(`/allied-health/social-work/cases/${caseId}`)}
      />
    </div>
  );
}

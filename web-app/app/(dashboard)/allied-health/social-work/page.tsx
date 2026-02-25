/**
 * Social Work Cases List Page
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { SWCaseTable } from '@/components/allied-health/social-work';

export default function SocialWorkCasesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Work Cases"
        helpContent="Manage social work cases. Track referrals, interventions, and case notes for psychosocial support."
      />
      <SWCaseTable />
    </div>
  );
}

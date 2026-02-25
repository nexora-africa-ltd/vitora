/**
 * Counselling Referrals List Page
 */

'use client';

import { PageHeader } from '@/components/shared/page-header';
import { CounsellingReferralTable } from '@/components/allied-health/counselling';

export default function CounsellingReferralsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Counselling Referrals"
        helpContent="Manage counselling referrals and sessions. Support grief counselling, family therapy, substance abuse support, and more."
      />
      <CounsellingReferralTable />
    </div>
  );
}

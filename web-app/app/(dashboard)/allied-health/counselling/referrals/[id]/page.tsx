/**
 * Counselling Referral Detail Page
 */

'use client';

import { useParams } from 'next/navigation';
import { CounsellingReferralDetail } from '@/components/allied-health/counselling';

export default function CounsellingReferralDetailPage() {
  const params = useParams();
  const referralId = Number(params.id);

  return <CounsellingReferralDetail referralId={referralId} />;
}

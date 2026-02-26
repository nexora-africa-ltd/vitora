/**
 * Social Work Case Detail Page
 */

'use client';

import { useParams } from 'next/navigation';
import { SWCaseDetail } from '@/components/allied-health/social-work';

export default function SWCaseDetailPage() {
  const params = useParams();
  const caseId = Number(params.id);

  return <SWCaseDetail caseId={caseId} />;
}

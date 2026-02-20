/**
 * Triage Assess - Default Page
 *
 * Entry point for the triage assessment workflow.
 * Redirects to the vitals tab (first step).
 *
 * Route: /triage/assess/[patientId]/[encounterId]
 */
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function TriageAssessPage() {
  const router = useRouter();
  const params = useParams();

  const patientId = params.patientId as string;
  const encounterId = params.encounterId as string;

  useEffect(() => {
    // Redirect to vitals tab (first step in workflow)
    router.replace(`/triage/assess/${patientId}/${encounterId}/vitals`);
  }, [router, patientId, encounterId]);

  // Show loading state while redirecting
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

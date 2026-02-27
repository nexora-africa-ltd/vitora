/**
 * Encounter Edit Page (Redirect)
 *
 * Redirects to the vitals step by default.
 * This page serves as the entry point for the encounter edit flow.
 *
 * Route: /encounters/[id]/edit
 * Redirects to: /encounters/[id]/edit/vitals
 */
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

export default function EncounterEditPage() {
  const params = useParams();
  const router = useRouter();
  const encounterId = params.id;

  useEffect(() => {
    // Redirect to vitals step (first step in the flow)
    router.replace(`/encounters/${encounterId}/edit/vitals`);
  }, [encounterId, router]);

  // Show loading state while redirecting
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

import { redirect } from 'next/navigation';

/**
 * Redirect /clinics/[clinicId]/public-queue → /queue-display/[clinicId]
 *
 * The public queue display lives outside the dashboard layout at
 * /queue-display/[clinicId] (no auth, no sidebar — designed for lobby monitors).
 * This redirect ensures bookmarked or guessed URLs still work.
 */
export default async function PublicQueueRedirect({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;
  redirect(`/queue-display/${clinicId}`);
}

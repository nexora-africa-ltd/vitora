import { PageLoading } from '@/components/shared/loading-spinner';

/**
 * Dashboard loading state.
 *
 * Shows during route transitions within the dashboard.
 * Used by Next.js App Router when navigating between dashboard pages.
 */
export default function DashboardLoading() {
  return <PageLoading message="Loading..." />;
}

/**
 * Dashboard loading state.
 * 
 * Returns an empty fragment because AuthGuard in layout.tsx already handles
 * the loading state during authentication checks.
 * This prevents showing two loading indicators.
 */
export default function DashboardLoading() {
  return <></>;
}

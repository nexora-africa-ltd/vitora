'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, ClipboardClock, FlaskConical, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { LabQueueView } from '@/components/laboratory/lab-queue-view';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useCreateRouteAccess } from '@/lib/hooks/use-create-route-access';
import { useDashboardStats } from '@/lib/hooks/use-dashboard-stats';
import { useUser } from '@/lib/auth/context';
import { useFacility } from '@/lib/context/facility-context';

function getGreetingLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDisplayName(firstName?: string | null, username?: string | null) {
  const trimmedFirstName = firstName?.trim();
  if (trimmedFirstName) {
    return trimmedFirstName.charAt(0).toUpperCase() + trimmedFirstName.slice(1);
  }

  const trimmedUsername = username?.trim();
  if (trimmedUsername) {
    return trimmedUsername.charAt(0).toUpperCase() + trimmedUsername.slice(1);
  }

  return 'there';
}

export default function LaboratoryPage() {
  const router = useRouter();
  const canCreateRoute = useCreateRouteAccess();
  const { refresh, isRefreshing } = usePageRefresh();
  const user = useUser();
  const { facilityDetail, facility } = useFacility();
  const { data: dashboardStats } = useDashboardStats();
  const activeFacilityId = facility?.id ?? facilityDetail?.id ?? null;
  const isFacilityScoped = Boolean(activeFacilityId);
  const isLISStandaloneProfile =
    facilityDetail?.operating_mode === 'STANDALONE_LAB' ||
    facility?.deployment_profile === 'lis_standalone';

  const totalCount = dashboardStats?.laboratory.pending_tests ?? 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Laboratory"
          helpContent="Manage lab orders, record results, and track the lab queue. Pull down to refresh on mobile, or use the refresh button in the header."
          actions={
            <Button
              onClick={() => router.push('/laboratory/orders/new')}
              disabled={!canCreateRoute('/laboratory/orders/new')}
              className="w-full gap-2 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New Lab Order
            </Button>
          }
        />

        {isLISStandaloneProfile && (
          <Card className="relative overflow-hidden border-primary/20">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.1),transparent_40%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-4 sm:p-6">
              <p className="text-sm text-muted-foreground">{getGreetingLabel()}</p>
              <h2 className="text-xl font-semibold sm:text-2xl">
                {getDisplayName(user?.first_name, user?.username)}, welcome to the laboratory hub.
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review queue pressure and verification workload before opening orders.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Pending Tests</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">
                {dashboardStats?.laboratory.pending_tests ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Completed Today</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">
                {dashboardStats?.laboratory.completed_today ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Critical Results</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">
                {dashboardStats?.laboratory.critical_results ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
              aria-hidden="true"
            />
            <CardContent className="relative p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <ClipboardClock className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Orders Loaded</p>
              </div>
              <p className="mt-1 text-xl font-bold sm:text-2xl">{totalCount}</p>
            </CardContent>
          </Card>
        </div>

        <LabQueueView enabled={isFacilityScoped} />
      </div>
    </PullToRefresh>
  );
}

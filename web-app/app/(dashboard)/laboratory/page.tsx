'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  SquareDashedTopSolid,
  Beaker,
  FileText,
  ClipboardClock,
  Shield,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { LabOrderTable } from '@/components/laboratory/lab-order-table';
import { LabQueueView } from '@/components/laboratory/lab-queue-view';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useLabOrders } from '@/lib/hooks/use-laboratory';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useCreateRouteAccess } from '@/lib/hooks/use-create-route-access';
import { LabOrderStatus, LabPriority } from '@/lib/types/laboratory';
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
  const searchParams = useSearchParams();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LabPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const user = useUser();
  const { facilityDetail, facility } = useFacility();
  const { data: dashboardStats } = useDashboardStats();
  const isLISStandaloneProfile =
    facilityDetail?.operating_mode === 'STANDALONE_LAB' ||
    facility?.deployment_profile === 'lis_standalone';

  const { data, isLoading, error } = useLabOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: debouncedSearch || undefined,
  });

  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter, debouncedSearch]);

  const pageSize = 20;
  const allOrders = data?.results || [];
  const isClientPaginationFallback = allOrders.length > pageSize && !data?.next && !data?.previous;
  const orders = isClientPaginationFallback
    ? allOrders.slice((page - 1) * pageSize, page * pageSize)
    : allOrders;
  const totalCount = data?.count || (isClientPaginationFallback ? allOrders.length : 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasNextPage = isClientPaginationFallback ? page < totalPages : Boolean(data?.next);
  const hasPreviousPage = isClientPaginationFallback ? page > 1 : Boolean(data?.previous);

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

        {/* Tabs */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="orders" className="gap-1.5 px-2 sm:px-4">
              <SquareDashedTopSolid className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Lab Orders</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5 px-2 sm:px-4">
              <Beaker className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Lab Queue</span>
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-1.5 px-2 sm:px-4">
              <ClipboardClock className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Pending Verification</span>
            </TabsTrigger>
            <TabsTrigger value="validations" className="gap-1.5 px-2 sm:px-4">
              <Shield className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Two-Stage Review</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <LabOrderTable
              orders={orders}
              isLoading={isLoading}
              error={error as Error | null}
              page={page}
              totalPages={totalPages}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onPageChange={setPage}
              onStatusFilter={setStatusFilter}
              onPriorityFilter={setPriorityFilter}
              onSearch={setSearchQuery}
            />
          </TabsContent>

          <TabsContent value="queue">
            <LabQueueView />
          </TabsContent>

          <TabsContent value="results">
            <PendingVerificationView />
          </TabsContent>

          <TabsContent value="validations">
            <ValidationsQuickView />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

// Pending verification component
function PendingVerificationView() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const { data: pendingResults, isLoading } = useLabOrders({
    status: 'COMPLETED',
    page,
    page_size: pageSize,
  });

  const allCompletedOrders = pendingResults?.results || [];
  const isClientPaginationFallback =
    allCompletedOrders.length > pageSize && !pendingResults?.next && !pendingResults?.previous;
  const pagedCompletedOrders = isClientPaginationFallback
    ? allCompletedOrders.slice((page - 1) * pageSize, page * pageSize)
    : allCompletedOrders;

  const hasNextPage = isClientPaginationFallback
    ? page < Math.ceil(allCompletedOrders.length / pageSize)
    : Boolean(pendingResults?.next);
  const hasPreviousPage = isClientPaginationFallback ? page > 1 : Boolean(pendingResults?.previous);
  const totalCount =
    pendingResults?.count || (isClientPaginationFallback ? allCompletedOrders.length : 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Filter orders where any result is unverified
  const ordersWithUnverified = pagedCompletedOrders.filter((order) =>
    order.items?.some((item) => item.result && item.result.verification_status === 'UNVERIFIED')
  );

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
        <p className="mt-2 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (ordersWithUnverified.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p>No results pending verification</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {ordersWithUnverified.length} order(s) with results pending verification
      </p>
      {ordersWithUnverified.map((order) => (
        <div
          key={order.id}
          className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50"
          onClick={() => router.push(`/laboratory/orders/${order.order_number}`)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{order.order_number}</p>
              <p className="text-sm text-muted-foreground">
                {order.patient_name} • {order.patient_mrn}
              </p>
            </div>
            <Button variant="outline" size="sm">
              Review
            </Button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!hasPreviousPage}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Two-Stage Validations Quick View
function ValidationsQuickView() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-medium">Two-Stage Validation Workflow</h3>
          <p className="text-sm text-muted-foreground">
            Results require both technical and clinical review before release.
          </p>
        </div>
        <Button
          onClick={() => router.push('/laboratory/validations')}
          className="w-full gap-2 sm:w-auto"
        >
          <Shield className="h-4 w-4" />
          Open Validation Dashboard
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-medium">Technical Review</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Verifies analytical accuracy: specimen quality, equipment calibration, QC results, and
            procedural compliance.
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-600" />
            <span className="font-medium">Clinical (Pathologist) Review</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Verifies clinical relevance: consistency with patient history, delta checks, and need
            for interpretation or repeat testing.
          </p>
        </div>
      </div>
    </div>
  );
}

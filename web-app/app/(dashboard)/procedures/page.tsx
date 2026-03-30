'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Syringe,
  Search,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { proceduresApi } from '@/lib/api/procedures';
import { formatDate, formatTime } from '@/lib/utils/format';
import type { ProcedureOrderListItem, ProcedureOrderStatus } from '@/lib/types/procedure';
import { PROCEDURE_STATUS_COLORS, PROCEDURE_STATUS_LABELS, PROCEDURE_PRIORITY_COLORS } from '@/lib/types/procedure';

export default function ProceduresDashboardPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: dashboardData, isLoading: statsLoading } = useQuery({
    queryKey: ['procedures-dashboard'],
    queryFn: () => proceduresApi.getDashboard(),
    staleTime: 30000,
  });

  const { data: todayOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['procedures-orders-today', debouncedSearch],
    queryFn: () =>
      proceduresApi.listOrders({
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ordering: 'scheduled_time',
      }),
    staleTime: 30000,
  });

  const orders = useMemo(
    () => (todayOrders?.results || []) as ProcedureOrderListItem[],
    [todayOrders],
  );

  const columns = [
    {
      key: 'scheduled_time',
      header: 'Time',
      sortable: true,
      sortType: 'string' as const,
      cell: (item: ProcedureOrderListItem) =>
        item.scheduled_time ? formatTime(item.scheduled_time) : '—',
      hideOnMobile: true,
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => (
        <span className="font-medium">{item.patient_name}</span>
      ),
    },
    {
      key: 'procedure_name',
      header: 'Procedure',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => item.procedure_name,
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => (
        <Badge className={`${PROCEDURE_PRIORITY_COLORS[item.priority]} shrink-0 w-fit`}>
          {item.priority}
        </Badge>
      ),
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => (
        <Badge className={`${PROCEDURE_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {PROCEDURE_STATUS_LABELS[item.status]}
        </Badge>
      ),
    },
    {
      key: 'ordered_at',
      header: 'Ordered',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ProcedureOrderListItem) => formatDate(item.ordered_at),
      hideOnMobile: true,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Procedures"
          helpContent="Monitor scheduled procedures, consent status, and performance. Manage procedure orders and track outcomes."
          actions={
            <Button onClick={() => router.push('/procedures/orders')}>
              <ClipboardList className="h-4 w-4 mr-2" />
              All Orders
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : (
            <>
              <StatsCard
                title="Scheduled Today"
                value={dashboardData?.scheduled_today ?? 0}
                icon={CalendarDays}
                description="Pending procedures"
              />
              <StatsCard
                title="Awaiting Consent"
                value={dashboardData?.pending_consent ?? 0}
                icon={AlertTriangle}
                description="Need consent"
                variant={dashboardData?.pending_consent ? 'warning' : 'default'}
              />
              <StatsCard
                title="In Progress"
                value={dashboardData?.in_progress ?? 0}
                icon={Clock}
                description="Being performed"
              />
              <StatsCard
                title="Completed Today"
                value={dashboardData?.completed_today ?? 0}
                icon={CheckCircle2}
                description="Finished today"
              />
            </>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Today's Procedures Table */}
        <ResponsiveTable
          data={orders}
          columns={columns}
          keyExtractor={(item) => item.id}
          isLoading={ordersLoading}
          onRowClick={(item) => router.push(`/procedures/orders/${item.id}`)}
          emptyMessage="No procedure orders found"
          defaultSortColumn="scheduled_time"
          defaultSortDirection="asc"
        />
      </div>
    </PullToRefresh>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LabOrderTable } from '@/components/laboratory/lab-order-table';
import { useLabOrders } from '@/lib/hooks/use-laboratory';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useCreateRouteAccess } from '@/lib/hooks/use-create-route-access';
import { useFacility } from '@/lib/context/facility-context';
import type { LabOrderStatus, LabPriority } from '@/lib/types/laboratory';

const PAGE_SIZE = 20;

export default function LaboratoryOrdersPage() {
  const router = useRouter();
  const canCreateRoute = useCreateRouteAccess();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facilityDetail, facility } = useFacility();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LabOrderStatus | ''>('');
  const [priority, setPriority] = useState<LabPriority | ''>('');
  const [search, setSearch] = useState('');

  const activeFacilityId = facility?.id ?? facilityDetail?.id ?? null;
  const isFacilityScoped = Boolean(activeFacilityId);

  const params = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      status: status || undefined,
      priority: priority || undefined,
      search: search.trim() || undefined,
    }),
    [page, status, priority, search]
  );

  const { data, isLoading, error } = useLabOrders(params, { enabled: isFacilityScoped });
  const orders = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasNextPage = data?.next != null;
  const hasPreviousPage = data?.previous != null;

  const handleStatusFilter = (nextStatus: LabOrderStatus | '') => {
    setStatus(nextStatus);
    setPage(1);
  };

  const handlePriorityFilter = (nextPriority: LabPriority | '') => {
    setPriority(nextPriority);
    setPage(1);
  };

  const handleSearch = (query: string) => {
    setSearch(query);
    setPage(1);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Lab Orders"
          helpContent="Track all laboratory orders, filter by status and priority, and open each order for specimen collection, result entry, and verification workflows."
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

        {!isFacilityScoped ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select a facility to view laboratory orders.
            </CardContent>
          </Card>
        ) : (
          <LabOrderTable
            orders={orders}
            isLoading={isLoading}
            error={error as Error | null}
            page={page}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onPageChange={setPage}
            onStatusFilter={handleStatusFilter}
            onPriorityFilter={handlePriorityFilter}
            onSearch={handleSearch}
          />
        )}
      </div>
    </PullToRefresh>
  );
}

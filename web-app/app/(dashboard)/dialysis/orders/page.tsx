'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useDialysisOrders } from '@/lib/hooks/use-dialysis';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { DialysisOrder } from '@/lib/types/dialysis';
import { ORDER_STATUS_COLORS, DIALYSIS_TYPE_LABELS, FREQUENCY_LABELS } from '@/lib/types/dialysis';

export default function DialysisOrdersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useDialysisOrders({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    ordering: '-created_at',
  });

  const columns = [
    {
      key: 'patient',
      header: 'Patient',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: DialysisOrder) => (
        <span className="font-medium">Patient #{item.patient}</span>
      ),
    },
    {
      key: 'dialysis_type',
      header: 'Type',
      sortable: true,
      cell: (item: DialysisOrder) => DIALYSIS_TYPE_LABELS[item.dialysis_type] || item.dialysis_type,
    },
    {
      key: 'frequency',
      header: 'Frequency',
      sortable: true,
      hideOnMobile: true,
      cell: (item: DialysisOrder) => FREQUENCY_LABELS[item.frequency] || item.frequency,
    },
    {
      key: 'target_duration_minutes',
      header: 'Duration',
      sortable: true,
      sortType: 'number' as const,
      hideOnMobile: true,
      cell: (item: DialysisOrder) => `${Math.floor(item.target_duration_minutes / 60)}h ${item.target_duration_minutes % 60}m`,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: DialysisOrder) => (
        <Badge className={`${ORDER_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'start_date',
      header: 'Start Date',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: DialysisOrder) => formatDate(item.start_date),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Dialysis Orders"
          helpContent="Standing dialysis prescriptions define treatment parameters (flow rates, duration, frequency) for ongoing patients."
          actions={
            <PermissionGate action="dialysis.create_order">
              <Button onClick={() => router.push('/dialysis/orders/new')}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">New Order</span>
                <span className="sm:hidden">New</span>
              </Button>
            </PermissionGate>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ResponsiveTable
            data={data?.results || []}
            columns={columns}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/dialysis/orders/${item.id}`)}
            defaultSortColumn="start_date"
            defaultSortDirection="desc"
            emptyMessage="No dialysis orders found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

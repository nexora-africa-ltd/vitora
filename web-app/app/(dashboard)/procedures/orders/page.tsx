'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Filter, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { proceduresApi } from '@/lib/api/procedures';
import { formatDate, formatTime } from '@/lib/utils/format';
import type {
  ProcedureOrderListItem,
  ProcedureOrderStatus,
  ProcedurePriority,
} from '@/lib/types/procedure';
import {
  PROCEDURE_STATUS_COLORS,
  PROCEDURE_STATUS_LABELS,
  PROCEDURE_PRIORITY_COLORS,
} from '@/lib/types/procedure';

export default function ProcedureOrdersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['procedure-orders', debouncedSearch, statusFilter, priorityFilter],
    queryFn: () =>
      proceduresApi.listOrders({
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(priorityFilter ? { priority: priorityFilter } : {}),
        ordering: '-ordered_at',
      }),
    staleTime: 30000,
  });

  const orders = useMemo(() => (data?.results || []) as ProcedureOrderListItem[], [data]);

  const columns = [
    {
      key: 'order_number',
      header: 'Order #',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => (
        <span className="font-mono text-sm">{item.order_number}</span>
      ),
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
      key: 'scheduled_date',
      header: 'Scheduled',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: ProcedureOrderListItem) =>
        item.scheduled_date
          ? `${formatDate(item.scheduled_date)}${item.scheduled_time ? ` ${formatTime(item.scheduled_time)}` : ''}`
          : '—',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: ProcedureOrderListItem) => (
        <div className="flex items-center gap-1.5">
          <Badge className={`${PROCEDURE_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
            {PROCEDURE_STATUS_LABELS[item.status]}
          </Badge>
          {item.is_overdue && (
            <Badge variant="destructive" className="shrink-0 w-fit text-xs">
              Overdue
            </Badge>
          )}
        </div>
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
          title="Procedure Orders"
          helpContent="View and manage all procedure orders. Filter by status, priority, or search by patient name or order number."
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient, order #, procedure..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="ORDERED">Ordered</SelectItem>
                <SelectItem value="CONSENT_PENDING">Consent Pending</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="READY">Ready</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="EMERGENCY">Emergency</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
                <SelectItem value="ROUTINE">Routine</SelectItem>
                <SelectItem value="ELECTIVE">Elective</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Orders Table */}
        <ResponsiveTable
          data={orders}
          columns={columns}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          onRowClick={(item) => router.push(`/procedures/orders/${item.id}`)}
          emptyMessage="No procedure orders found"
          defaultSortColumn="ordered_at"
          defaultSortDirection="desc"
        />
      </div>
    </PullToRefresh>
  );
}

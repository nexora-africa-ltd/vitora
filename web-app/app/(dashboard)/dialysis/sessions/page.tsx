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
import { useDialysisSessions } from '@/lib/hooks/use-dialysis';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { DialysisSession } from '@/lib/types/dialysis';
import { SESSION_STATUS_COLORS, DIALYSIS_TYPE_LABELS } from '@/lib/types/dialysis';

export default function DialysisSessionsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useDialysisSessions({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    dialysis_type: typeFilter || undefined,
    ordering: '-scheduled_date',
  });

  const columns = [
    {
      key: 'session_number',
      header: 'Session #',
      sortable: true,
      cell: (item: DialysisSession) => (
        <span className="font-mono text-sm">{item.session_number}</span>
      ),
    },
    {
      key: 'scheduled_date',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: DialysisSession) => formatDate(item.scheduled_date),
    },
    {
      key: 'dialysis_type',
      header: 'Type',
      sortable: true,
      hideOnMobile: true,
      cell: (item: DialysisSession) => DIALYSIS_TYPE_LABELS[item.dialysis_type] || item.dialysis_type,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: DialysisSession) => (
        <Badge className={`${SESSION_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'actual_duration_minutes',
      header: 'Duration',
      sortable: true,
      sortType: 'number' as const,
      hideOnMobile: true,
      cell: (item: DialysisSession) =>
        item.actual_duration_minutes ? `${Math.floor(item.actual_duration_minutes / 60)}h ${item.actual_duration_minutes % 60}m` : '—',
    },
    {
      key: 'machine_number',
      header: 'Machine',
      hideOnMobile: true,
      cell: (item: DialysisSession) => item.machine_number || '—',
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Dialysis Sessions"
          helpContent="Track individual dialysis treatment sessions. Sessions progress: Scheduled → In Progress → Completed."
          actions={
            <PermissionGate action="dialysis.perform_session">
              <Button onClick={() => router.push('/dialysis/sessions/new')}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">New Session</span>
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
              placeholder="Search by session #, patient..."
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
              <SelectItem value="SCHEDULED">Scheduled</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ABORTED">Aborted</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="HEMODIALYSIS">Hemodialysis</SelectItem>
              <SelectItem value="PERITONEAL">Peritoneal</SelectItem>
              <SelectItem value="CRRT">CRRT</SelectItem>
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
            onRowClick={(item) => router.push(`/dialysis/sessions/${item.id}`)}
            defaultSortColumn="scheduled_date"
            defaultSortDirection="desc"
            emptyMessage="No dialysis sessions found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

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
import { useVascularAccesses } from '@/lib/hooks/use-dialysis';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { VascularAccess } from '@/lib/types/dialysis';
import { ACCESS_STATUS_COLORS, ACCESS_TYPE_LABELS } from '@/lib/types/dialysis';

export default function VascularAccessPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useVascularAccesses({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    access_type: typeFilter || undefined,
    ordering: '-placed_date',
  });

  const columns = [
    {
      key: 'patient',
      header: 'Patient',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: VascularAccess) => (
        <span className="font-medium">Patient #{item.patient}</span>
      ),
    },
    {
      key: 'access_type',
      header: 'Type',
      sortable: true,
      cell: (item: VascularAccess) => ACCESS_TYPE_LABELS[item.access_type] || item.access_type,
    },
    {
      key: 'site',
      header: 'Site',
      sortable: true,
      cell: (item: VascularAccess) => item.site,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: VascularAccess) => (
        <Badge className={`${ACCESS_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'placed_date',
      header: 'Placed',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: VascularAccess) => formatDate(item.placed_date),
    },
    {
      key: 'last_assessment_date',
      header: 'Last Assessed',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: VascularAccess) => item.last_assessment_date ? formatDate(item.last_assessment_date) : '—',
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Vascular Access"
          helpContent="Track patient vascular access sites for dialysis. Monitor AV fistulas, grafts, and central venous catheters."
          actions={
            <PermissionGate action="dialysis.manage">
              <Button onClick={() => router.push('/dialysis/accesses/new')}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">New Access</span>
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
              placeholder="Search by patient, site..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="MATURING">Maturing</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="REMOVED">Removed</SelectItem>
              <SelectItem value="INFECTED">Infected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Types</SelectItem>
              <SelectItem value="AVF">AV Fistula</SelectItem>
              <SelectItem value="AVG">AV Graft</SelectItem>
              <SelectItem value="CVC_TEMPORARY">Temporary CVC</SelectItem>
              <SelectItem value="CVC_TUNNELED">Tunneled CVC</SelectItem>
              <SelectItem value="PD_CATHETER">PD Catheter</SelectItem>
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
            onRowClick={(item) => router.push(`/dialysis/accesses/${item.id}`)}
            defaultSortColumn="placed_date"
            defaultSortDirection="desc"
            emptyMessage="No vascular accesses recorded."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

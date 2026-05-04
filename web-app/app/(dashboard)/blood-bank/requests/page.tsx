'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useBloodRequests } from '@/lib/hooks/use-blood-bank';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { BloodRequestListItem } from '@/lib/types/blood-bank';
import { REQUEST_STATUS_COLORS, URGENCY_COLORS, COMPONENT_LABELS } from '@/lib/types/blood-bank';

export default function BloodRequestsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useBloodRequests({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    urgency: urgencyFilter || undefined,
    ordering: '-created_at',
  });

  const columns = [
    {
      key: 'request_number',
      header: 'Request #',
      sortable: true,
      cell: (item: BloodRequestListItem) => (
        <span className="font-mono text-sm">{item.request_number}</span>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: BloodRequestListItem) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{item.patient_name}</p>
          <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
        </div>
      ),
    },
    {
      key: 'blood_group',
      header: 'Group',
      sortable: true,
      cell: (item: BloodRequestListItem) => (
        <Badge variant="outline" className="font-bold">{item.blood_group}</Badge>
      ),
    },
    {
      key: 'component',
      header: 'Component',
      hideOnMobile: true,
      cell: (item: BloodRequestListItem) => COMPONENT_LABELS[item.component] || item.component,
    },
    {
      key: 'units_requested',
      header: 'Units',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: BloodRequestListItem) => item.units_requested,
    },
    {
      key: 'urgency',
      header: 'Urgency',
      sortable: true,
      cell: (item: BloodRequestListItem) => (
        <Badge className={`${URGENCY_COLORS[item.urgency]} shrink-0 w-fit`}>
          {item.urgency}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: BloodRequestListItem) => (
        <Badge className={`${REQUEST_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Requested',
      sortable: true,
      sortType: 'date' as const,
      hideOnMobile: true,
      cell: (item: BloodRequestListItem) => formatDate(item.created_at),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Blood Requests"
          helpContent="View and manage blood product requests. Track from request through cross-matching to transfusion."
          actions={
            <Button onClick={() => router.push('/blood-bank/requests/new')}>
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">New Request</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient, MRN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CROSSMATCH_PENDING">Crossmatch Pending</SelectItem>
              <SelectItem value="READY">Ready</SelectItem>
              <SelectItem value="ISSUED">Issued</SelectItem>
              <SelectItem value="TRANSFUSED">Transfused</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Urgency</SelectItem>
              <SelectItem value="ROUTINE">Routine</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="EMERGENCY">Emergency</SelectItem>
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
            onRowClick={(item) => router.push(`/blood-bank/requests/${item.id}`)}
            defaultSortColumn="created_at"
            defaultSortDirection="desc"
            emptyMessage="No blood requests found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Calendar, User, Skull, PackageCheck, ShieldCheck, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PermissionGate } from '@/components/shared/permission-gate';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeathRecords } from '@/lib/hooks/use-last-office';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { DeathRecordListItem, DeathRecordStatus } from '@/lib/types/last-office';
import { DEATH_RECORD_STATUS_COLORS, BODY_STATUS_COLORS } from '@/lib/types/last-office';

export default function LastOfficePage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [bodyStatusFilter, setBodyStatusFilter] = useState<string>('');

  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useDeathRecords({
    status: (statusFilter || undefined) as DeathRecordStatus | undefined,
    body_status: (bodyStatusFilter || undefined) as 'IN_MORGUE' | 'RELEASED' | 'TRANSFERRED' | 'PENDING_COLLECTION' | undefined,
    search: debouncedSearch || undefined,
    ordering: '-date_of_death',
  });

  const stats = useMemo(() => {
    const records = data?.results || [];
    return {
      total: data?.count || 0,
      inMorgue: records.filter((r) => r.body_status === 'IN_MORGUE' && !r.is_voided).length,
      pendingCertification: records.filter((r) => r.status === 'PENDING_CERTIFICATION').length,
      released: records.filter((r) => r.body_status === 'RELEASED').length,
    };
  }, [data]);

  const columns = [
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (item: DeathRecordListItem) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{item.patient_name}</p>
          <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
        </div>
      ),
    },
    {
      key: 'date_of_death',
      header: 'Date of Death',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: DeathRecordListItem) => (
        <div>
          <p>{formatDate(item.date_of_death)}</p>
          {item.time_of_death && (
            <p className="text-xs text-muted-foreground">{item.time_of_death}</p>
          )}
        </div>
      ),
    },
    {
      key: 'manner_of_death',
      header: 'Manner',
      hideOnMobile: true,
      cell: (item: DeathRecordListItem) => item.manner_of_death_display,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: DeathRecordListItem) => (
        <Badge className={`${DEATH_RECORD_STATUS_COLORS[item.status]} shrink-0 w-fit`}>
          {item.status_display}
        </Badge>
      ),
    },
    {
      key: 'body_status',
      header: 'Body',
      sortable: true,
      cell: (item: DeathRecordListItem) => (
        <Badge variant="outline" className={`${BODY_STATUS_COLORS[item.body_status]} shrink-0 w-fit`}>
          {item.body_status_display}
        </Badge>
      ),
    },
    {
      key: 'recorded_by_username',
      header: 'Recorded By',
      hideOnMobile: true,
      cell: (item: DeathRecordListItem) => item.recorded_by_username,
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Last Office"
          helpContent="Manage death records, morgue status, body release, and civil registry reporting."
          actions={
            <PermissionGate action="last_office.record_death">
              <Button asChild>
                <Link href="/last-office/new">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Record Death</span>
                  <span className="sm:hidden">New</span>
                </Link>
              </Button>
            </PermissionGate>
          }
        />

        {/* Stats */}
        <div className="grid gap-2 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Records"
            value={isLoading ? '-' : stats.total}
            icon={Skull}
            variant="default"
            loading={isLoading}
          />
          <StatsCard
            title="In Morgue"
            value={isLoading ? '-' : stats.inMorgue}
            icon={PackageCheck}
            variant="warning"
            loading={isLoading}
          />
          <StatsCard
            title="Pending Certification"
            value={isLoading ? '-' : stats.pendingCertification}
            icon={AlertTriangle}
            variant="destructive"
            loading={isLoading}
          />
          <StatsCard
            title="Released"
            value={isLoading ? '-' : stats.released}
            icon={ShieldCheck}
            variant="success"
            loading={isLoading}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, MRN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Statuses</SelectItem>
              <SelectItem value="PENDING_CERTIFICATION">Pending Certification</SelectItem>
              <SelectItem value="CERTIFIED">Certified</SelectItem>
              <SelectItem value="REPORTED_TO_CIVIL_REGISTRY">Reported to Registry</SelectItem>
              <SelectItem value="RELEASED_TO_FAMILY">Released to Family</SelectItem>
              <SelectItem value="VOIDED">Voided</SelectItem>
            </SelectContent>
          </Select>
          <Select value={bodyStatusFilter} onValueChange={setBodyStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All Body Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Body Status</SelectItem>
              <SelectItem value="IN_MORGUE">In Morgue</SelectItem>
              <SelectItem value="RELEASED">Released</SelectItem>
              <SelectItem value="TRANSFERRED">Transferred</SelectItem>
              <SelectItem value="PENDING_COLLECTION">Pending Collection</SelectItem>
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
            onRowClick={(item) => router.push(`/last-office/${item.id}`)}
            defaultSortColumn="date_of_death"
            defaultSortDirection="desc"
            emptyMessage="No death records found."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

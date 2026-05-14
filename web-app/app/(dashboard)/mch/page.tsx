'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, AlertTriangle, Baby, Calendar, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
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
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useMCHSocket } from '@/lib/hooks/use-websocket';
import { formatDate } from '@/lib/utils/format';
import { mchRegistrationsApi } from '@/lib/api/mch';
import type { MCHRegistrationListItem, MCHRegistrationStatus } from '@/lib/types/mch';

const STATUS_OPTIONS: { value: MCHRegistrationStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'ACTIVE', label: 'Active (ANC)' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'POSTNATAL', label: 'Postnatal Care' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'TRANSFERRED_OUT', label: 'Transferred Out' },
  { value: 'LOST_TO_FOLLOW_UP', label: 'Lost to Follow-up' },
  { value: 'DECEASED', label: 'Deceased' },
];

const statusColors: Record<MCHRegistrationStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  DELIVERED: 'bg-blue-100 text-blue-800',
  POSTNATAL: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  TRANSFERRED_OUT: 'bg-yellow-100 text-yellow-800',
  LOST_TO_FOLLOW_UP: 'bg-orange-100 text-orange-800',
  DECEASED: 'bg-red-100 text-red-800',
};

export default function MCHRegistrationsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useMCHSocket(facility?.id ?? null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MCHRegistrationStatus | ''>('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'high'>('all');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search, 300);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['mch-registrations', page, statusFilter, debouncedSearch, riskFilter],
    queryFn: () =>
      mchRegistrationsApi.list({
        page,
        page_size: 20,
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        is_high_risk: riskFilter === 'high' ? true : undefined,
      }),
  });

  const registrations = useMemo(() => data?.results || [], [data?.results]);
  const totalPages = Math.ceil((data?.count || 0) / 20);

  // Compute stats
  const stats = useMemo(() => {
    const active = registrations.filter((r) => r.status === 'ACTIVE').length;
    const highRisk = registrations.filter((r) => r.is_high_risk).length;
    const lindaJamii = registrations.filter((r) => r.linda_jamii_beneficiary).length;
    return { active, highRisk, lindaJamii, total: data?.count || 0 };
  }, [registrations, data?.count]);

  const handleRowClick = (registration: MCHRegistrationListItem) => {
    router.push(`/mch/${registration.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="MCH Registrations"
          helpContent="Manage maternal and child health registrations. Track pregnancies from ANC through delivery and postnatal care."
          actions={
            <Button onClick={() => router.push('/mch/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Registration
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <StatsCard
            title="Total Registrations"
            value={stats.total}
            icon={Baby}
            loading={isLoading}
          />
          <StatsCard
            title="Active (ANC)"
            value={stats.active}
            icon={Calendar}
            loading={isLoading}
            variant="success"
          />
          <StatsCard
            title="High Risk"
            value={stats.highRisk}
            icon={AlertTriangle}
            loading={isLoading}
            variant="destructive"
          />
          <StatsCard
            title="Linda Jamii"
            value={stats.lindaJamii}
            icon={Baby}
            loading={isLoading}
            variant="info"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or MRN..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as MCHRegistrationStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={riskFilter}
            onValueChange={(value) => {
              setRiskFilter(value as 'all' | 'high');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="high">High Risk Only</SelectItem>
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
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            Failed to load registrations. Please try again.
          </div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No MCH registrations found.
          </div>
        ) : (
          <>
            <ResponsiveTable
              data={registrations}
              keyExtractor={(r) => r.id}
              onRowClick={handleRowClick}
              columns={[
                {
                  key: 'mch_number',
                  header: 'MCH No.',
                  cell: (r) => (
                    <span className="font-mono text-sm">{r.mch_number}</span>
                  ),
                },
                {
                  key: 'mother',
                  header: 'Mother',
                  cell: (r) => (
                    <div>
                      <p className="font-medium">{r.mother_name}</p>
                      <p className="text-xs text-muted-foreground">{r.mother_mrn}</p>
                    </div>
                  ),
                },
                {
                  key: 'gestation',
                  header: 'Gestation',
                  cell: (r) => (
                    <span className="text-sm">{r.gestation_display || 'N/A'}</span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'edd',
                  header: 'EDD',
                  cell: (r) => (
                    <span className="text-sm">
                      {r.edd ? formatDate(r.edd) : 'N/A'}
                    </span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'anc_visits',
                  header: 'ANC Visits',
                  cell: (r) => (
                    <span className="text-sm">{r.anc_visit_count}</span>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => (
                    <div className="flex flex-wrap gap-1">
                      <Badge className={statusColors[r.status]}>
                        {r.status.replace(/_/g, ' ')}
                      </Badge>
                      {r.is_high_risk && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          High Risk
                        </Badge>
                      )}
                    </div>
                  ),
                },
              ]}
              mobileCard={(r) => (
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{r.mother_name}</p>
                    <p className="text-xs text-muted-foreground">{r.mch_number}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {r.gestation_display || 'N/A'} • EDD: {r.edd ? formatDate(r.edd) : 'N/A'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`${statusColors[r.status]} shrink-0`}>
                      {r.status.replace(/_/g, ' ')}
                    </Badge>
                    {r.is_high_risk && (
                      <Badge variant="destructive" className="gap-1 shrink-0">
                        <AlertTriangle className="h-3 w-3" />
                        HR
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="py-2 px-4 text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}

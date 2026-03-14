'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
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
import { qualityApi } from '@/lib/api/quality';
import { Plus, Search } from 'lucide-react';
import type {
  QualityMeasure,
  QualityMeasureDomain,
  QualityMeasureStatus,
  QualityMeasureListParams,
} from '@/lib/types/quality';

const PAGE_SIZE = 20;

const DOMAIN_OPTIONS: { value: QualityMeasureDomain; label: string }[] = [
  { value: 'CLINICAL', label: 'Clinical' },
  { value: 'PATIENT_SAFETY', label: 'Patient Safety' },
  { value: 'EFFICIENCY', label: 'Efficiency' },
  { value: 'PATIENT_EXPERIENCE', label: 'Patient Experience' },
  { value: 'PUBLIC_HEALTH', label: 'Public Health' },
  { value: 'CARE_COORDINATION', label: 'Care Coordination' },
];

const STATUS_OPTIONS: { value: QualityMeasureStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'RETIRED', label: 'Retired' },
];

const STATUS_COLORS: Record<QualityMeasureStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  RETIRED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const DOMAIN_COLORS: Record<QualityMeasureDomain, string> = {
  CLINICAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PATIENT_SAFETY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  EFFICIENCY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  PATIENT_EXPERIENCE: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  PUBLIC_HEALTH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CARE_COORDINATION: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

export default function QualityMeasuresListPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');

  const queryParams = useMemo<QualityMeasureListParams>(() => {
    const params: QualityMeasureListParams = { page };
    if (search) params.search = search;
    if (domain !== 'all') params.domain = domain as QualityMeasureDomain;
    if (status !== 'all') params.status = status as QualityMeasureStatus;
    return params;
  }, [page, search, domain, status]);

  const { data, isLoading } = useQuery({
    queryKey: ['quality-measures', queryParams],
    queryFn: () => qualityApi.listMeasures(queryParams),
    staleTime: 30_000,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Quality Measures"
          helpContent="Clinical Quality Measures (CQM) define the indicators used to assess healthcare quality. Each measure has numerator/denominator logic and target percentages."
          actions={
            <Button
              size="sm"
              onClick={() => router.push('/quality/measures/new')}
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Add Measure</span>
              <span className="sm:hidden">Add</span>
            </Button>
          }
        />

        {/* Filters */}
        <Card className="p-3 sm:p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search measures..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              value={domain}
              onValueChange={(v) => {
                setDomain(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {DOMAIN_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <ResponsiveTable<QualityMeasure>
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={(item) => router.push(`/quality/measures/${item.id}`)}
          isLoading={isLoading}
          emptyMessage="No quality measures found. Create your first measure or seed Kenya-specific indicators."
          columns={[
            {
              key: 'code',
              header: 'Code',
              sortable: true,
              cell: (item) => (
                <span className="font-mono text-sm">{item.code}</span>
              ),
            },
            {
              key: 'name',
              header: 'Name',
              sortable: true,
              cell: (item) => (
                <span className="font-medium">{item.name}</span>
              ),
            },
            {
              key: 'domain',
              header: 'Domain',
              sortable: true,
              cell: (item) => (
                <Badge
                  className={`${DOMAIN_COLORS[item.domain]} shrink-0 w-fit`}
                  variant="secondary"
                >
                  {item.domain_display}
                </Badge>
              ),
              hideOnMobile: true,
            },
            {
              key: 'target',
              header: 'Target',
              cell: (item) =>
                item.target_percentage
                  ? `${item.target_percentage}%`
                  : '—',
              hideOnMobile: true,
            },
            {
              key: 'period',
              header: 'Period',
              cell: (item) => item.reporting_period_display,
              hideOnMobile: true,
            },
            {
              key: 'status',
              header: 'Status',
              cell: (item) => (
                <Badge
                  className={`${STATUS_COLORS[item.status]} shrink-0 w-fit`}
                  variant="secondary"
                >
                  {item.status_display}
                </Badge>
              ),
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.code}
                  </p>
                  <p className="font-medium text-sm truncate">{item.name}</p>
                </div>
                <Badge
                  className={`${STATUS_COLORS[item.status]} shrink-0 w-fit self-start`}
                  variant="secondary"
                >
                  {item.status_display}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={`${DOMAIN_COLORS[item.domain]} text-xs`}
                  variant="secondary"
                >
                  {item.domain_display}
                </Badge>
                {item.target_percentage && (
                  <span className="text-xs text-muted-foreground">
                    Target: {item.target_percentage}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {item.reporting_period_display}
                </span>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {data?.count ?? 0} measure{(data?.count ?? 0) !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

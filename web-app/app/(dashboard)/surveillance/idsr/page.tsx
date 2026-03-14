'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDate } from '@/lib/utils/format';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useSurveillanceWebSocket } from '@/lib/hooks/surveillance-websocket';
import { IDSRStatusBadge } from '@/components/surveillance/idsr-status-badge';
import { GenerateReportDialog } from '@/components/surveillance/generate-report-dialog';
import type { IDSRListParams, IDSRWeeklyReportListItem } from '@/lib/types/surveillance';

const PAGE_SIZE = 20;

export default function IDSRReportsPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();

  // WebSocket connection with polling fallback
  const {
    connectionState,
    reconnectAttempts,
    refresh: wsRefresh,
  } = useSurveillanceWebSocket({
    showToastNotifications: true,
  });

  // Combined refresh: WebSocket + React Query
  const handleRefresh = () => {
    wsRefresh();
    refresh();
  };

  const currentYear = new Date().getFullYear();

  const [page, setPage] = useState(1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [filters, setFilters] = useState({
    year: String(currentYear),
    status: 'all',
    outbreak: 'all',
  });

  const queryParams: IDSRListParams = useMemo(() => {
    const params: IDSRListParams = {
      epi_year: Number(filters.year),
      page,
      page_size: PAGE_SIZE,
    };

    if (filters.status !== 'all') {
      params.status = filters.status as IDSRListParams['status'];
    }

    if (filters.outbreak !== 'all') {
      params.outbreak = filters.outbreak === 'true';
    }

    return params;
  }, [filters, page]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['idsr-reports', queryParams],
    queryFn: () => surveillanceApi.listIDSRReports(queryParams),
    staleTime: 30000,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;

  const handleRowClick = (item: IDSRWeeklyReportListItem) => {
    router.push(`/surveillance/idsr/${item.id}`);
  };

  const yearOptions = useMemo(
    () => Array.from({ length: 5 }, (_, index) => String(currentYear - index)),
    [currentYear]
  );

  const columns = [
    {
      key: 'week_label',
      header: 'Week',
      sortable: true,
      cell: (item: IDSRWeeklyReportListItem) => (
        <span className="font-medium">{item.week_label}</span>
      ),
    },
    {
      key: 'date_range',
      header: 'Date Range',
      hideOnMobile: true,
      sortable: true,
      sortType: 'date' as const,
      sortFn: (a: IDSRWeeklyReportListItem, b: IDSRWeeklyReportListItem) => new Date(a.week_start_date).getTime() - new Date(b.week_start_date).getTime(),
      cell: (item: IDSRWeeklyReportListItem) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(item.week_start_date)} - {formatDate(item.week_end_date)}
        </span>
      ),
    },
    {
      key: 'total_cases',
      header: 'Cases',
      sortable: true,
      sortType: 'number' as const,
      cell: (item: IDSRWeeklyReportListItem) => item.total_cases,
    },
    {
      key: 'total_deaths',
      header: 'Deaths',
      hideOnMobile: true,
      sortable: true,
      sortType: 'number' as const,
      cell: (item: IDSRWeeklyReportListItem) => item.total_deaths,
    },
    {
      key: 'outbreak_declared',
      header: 'Outbreak',
      sortable: true,
      sortFn: (a: IDSRWeeklyReportListItem, b: IDSRWeeklyReportListItem) => Number(a.outbreak_declared) - Number(b.outbreak_declared),
      cell: (item: IDSRWeeklyReportListItem) =>
        item.outbreak_declared ? (
          <Badge variant="destructive" className="w-fit">
            Yes
          </Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (item: IDSRWeeklyReportListItem) => <IDSRStatusBadge status={item.status} />,
    },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="IDSR Weekly Reports"
          helpContent="Generate, review, and submit weekly disease surveillance reports to DHIS2/KHIS."
          actions={
            <div className="flex items-center gap-2">
              <WebSocketStatus
                connectionState={connectionState}
                reconnectAttempts={reconnectAttempts}
                size="sm"
              />
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                Generate Report
              </Button>
            </div>
          }
        />

        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Select
                value={filters.year}
                onValueChange={(value) => {
                  setFilters((prev) => ({ ...prev, year: value }));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filters.status}
                onValueChange={(value) => {
                  setFilters((prev) => ({ ...prev, status: value }));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="SUBMITTED">Submitted</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select
                value={filters.outbreak}
                onValueChange={(value) => {
                  setFilters((prev) => ({ ...prev, outbreak: value }));
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Outbreak" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Outbreak Only</SelectItem>
                  <SelectItem value="false">No Outbreak</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {error ? (
          <Card className="p-6 text-center text-destructive">
            <p>Failed to load reports</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Try Again
            </Button>
          </Card>
        ) : (
          <ResponsiveTable
            data={data?.results ?? []}
            columns={columns}
            keyExtractor={(item) => item.id}
            onRowClick={handleRowClick}
            isLoading={isLoading}
            emptyMessage="No reports found. Generate a new report to get started."
            mobileCard={(item) => (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.week_label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.week_start_date)} - {formatDate(item.week_end_date)}
                    </p>
                    <p className="text-sm mt-1">
                      {item.total_cases} cases, {item.total_deaths} deaths
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {item.outbreak_declared && (
                      <Badge variant="destructive" className="w-fit">
                        Outbreak
                      </Badge>
                    )}
                    <IDSRStatusBadge status={item.status} size="sm" />
                  </div>
                </div>
              </Card>
            )}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!hasPrev}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!hasNext}>
              Next
            </Button>
          </div>
        )}

        <GenerateReportDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          onSuccess={() => refetch()}
        />
      </div>
    </PullToRefresh>
  );
}

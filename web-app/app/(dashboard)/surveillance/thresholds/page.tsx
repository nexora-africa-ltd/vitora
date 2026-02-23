'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { WebSocketStatus } from '@/components/ui/websocket-status';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { surveillanceApi, type ThresholdListParams } from '@/lib/api/surveillance';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useSurveillanceWebSocket } from '@/lib/hooks/surveillance-websocket';
import type { OutbreakThreshold } from '@/lib/types/surveillance';

const PAGE_SIZE = 20;

function ThresholdStatusBadge({ threshold }: { threshold: OutbreakThreshold }) {
  const { is_exceeded, current_count, threshold: thresholdValue } = threshold.threshold_status;
  const percentage = Math.min((current_count / thresholdValue) * 100, 100);
  const isWarning = percentage >= 70 && !is_exceeded;

  if (is_exceeded) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        Exceeded
      </Badge>
    );
  }

  if (isWarning) {
    return (
      <Badge variant="warning" className="gap-1">
        <TrendingUp className="h-3 w-3" />
        Warning
      </Badge>
    );
  }

  return (
    <Badge variant="success" className="gap-1">
      <CheckCircle className="h-3 w-3" />
      OK
    </Badge>
  );
}

function ThresholdProgress({ threshold }: { threshold: OutbreakThreshold }) {
  const { current_count, threshold: thresholdValue, is_exceeded } = threshold.threshold_status;
  const percentage = Math.min((current_count / thresholdValue) * 100, 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>
          {current_count} / {thresholdValue}
        </span>
        <span className="text-muted-foreground">{Math.round(percentage)}%</span>
      </div>
      <Progress
        value={percentage}
        className={is_exceeded ? '[&>div]:bg-destructive' : percentage >= 70 ? '[&>div]:bg-warning' : ''}
      />
    </div>
  );
}

export default function OutbreakThresholdsPage() {
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

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: 'all',
    active: 'all',
  });

  const queryParams: ThresholdListParams = useMemo(() => {
    const params: ThresholdListParams = {
      page,
      page_size: PAGE_SIZE,
    };

    if (filters.active !== 'all') {
      params.is_active = filters.active === 'true';
    }

    return params;
  }, [filters, page]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['outbreak-thresholds', queryParams],
    queryFn: () => surveillanceApi.listThresholds(queryParams),
    staleTime: 30000,
  });

  const { data: exceededData } = useQuery({
    queryKey: ['outbreak-thresholds-exceeded'],
    queryFn: () => surveillanceApi.listExceededThresholds(),
    staleTime: 30000,
  });

  const exceededCount = exceededData?.length ?? 0;

  // Filter by exceeded status client-side (API may not support this filter directly)
  const filteredResults = useMemo(() => {
    if (!data?.results) return [];
    if (filters.status === 'all') return data.results;
    if (filters.status === 'exceeded') {
      return data.results.filter((t) => t.threshold_status.is_exceeded);
    }
    if (filters.status === 'warning') {
      const warningItems = data.results.filter((t) => {
        const pct = (t.threshold_status.current_count / t.threshold_status.threshold) * 100;
        return pct >= 70 && !t.threshold_status.is_exceeded;
      });
      return warningItems;
    }
    if (filters.status === 'ok') {
      return data.results.filter((t) => {
        const pct = (t.threshold_status.current_count / t.threshold_status.threshold) * 100;
        return pct < 70 && !t.threshold_status.is_exceeded;
      });
    }
    return data.results;
  }, [data, filters.status]);

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;

  const columns = [
    {
      key: 'disease_name',
      header: 'Disease',
      cell: (item: OutbreakThreshold) => (
        <span className="font-medium">{item.disease_name}</span>
      ),
    },
    {
      key: 'county_name',
      header: 'County',
      hideOnMobile: true,
      cell: (item: OutbreakThreshold) => (
        <span className="text-muted-foreground">
          {item.county_name || 'National'}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Threshold',
      cell: (item: OutbreakThreshold) => (
        <span>
          {item.case_threshold} cases / {item.period_days} days
        </span>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      hideOnMobile: true,
      cell: (item: OutbreakThreshold) => (
        <div className="w-32">
          <ThresholdProgress threshold={item} />
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (item: OutbreakThreshold) => <ThresholdStatusBadge threshold={item} />,
    },
    {
      key: 'is_active',
      header: 'Active',
      hideOnMobile: true,
      cell: (item: OutbreakThreshold) =>
        item.is_active ? (
          <Badge variant="outline">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
  ];

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Outbreak Thresholds"
          helpContent="Configure and monitor outbreak detection thresholds. Alerts are triggered when case counts exceed defined thresholds within specified periods."
          actions={
            <WebSocketStatus
              connectionState={connectionState}
              reconnectAttempts={reconnectAttempts}
              showLabel
              size="sm"
            />
          }
        />

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data?.count ?? 0}</p>
            </CardContent>
          </Card>
          <Card className={exceededCount > 0 ? 'border-destructive' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Exceeded
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${exceededCount > 0 ? 'text-destructive' : ''}`}>
                {exceededCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Warning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-warning">
                {data?.results?.filter((t) => {
                  const pct = (t.threshold_status.current_count / t.threshold_status.threshold) * 100;
                  return pct >= 70 && !t.threshold_status.is_exceeded;
                }).length ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                OK
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-success">
                {data?.results?.filter((t) => {
                  const pct = (t.threshold_status.current_count / t.threshold_status.threshold) * 100;
                  return pct < 70 && !t.threshold_status.is_exceeded;
                }).length ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
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
                <SelectItem value="exceeded">Exceeded</SelectItem>
                <SelectItem value="warning">Warning (≥70%)</SelectItem>
                <SelectItem value="ok">OK (&lt;70%)</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.active}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, active: value }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Active" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Active Only</SelectItem>
                <SelectItem value="false">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Table */}
        {error ? (
          <Card className="p-6 text-center text-destructive">
            <p>Failed to load thresholds</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Try Again
            </Button>
          </Card>
        ) : (
          <ResponsiveTable
            data={filteredResults}
            columns={columns}
            keyExtractor={(item) => item.id}
            isLoading={isLoading}
            emptyMessage="No outbreak thresholds configured."
            mobileCard={(item) => (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">{item.disease_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.county_name || 'National'} • {item.case_threshold} cases / {item.period_days} days
                    </p>
                    <div className="pt-2">
                      <ThresholdProgress threshold={item} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <ThresholdStatusBadge threshold={item} />
                    {!item.is_active && (
                      <Badge variant="secondary" className="w-fit">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            )}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { surveillanceApi } from '@/lib/api/surveillance';
import { formatDateTime } from '@/lib/utils/format';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type {
  NotifiableCaseListItem,
  NotifiableCaseListParams,
} from '@/lib/types/surveillance';

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANTS: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
  PENDING: 'warning',
  NOTIFIED: 'info',
  ACKNOWLEDGED: 'info',
  INVESTIGATED: 'info',
  CLOSED: 'success',
};

const CATEGORY_LABELS: Record<string, string> = {
  IMMEDIATE: 'Immediate',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
};

export default function NotifiableCasesPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: 'all',
    status: 'all',
    overdue: 'all',
  });

  const queryParams: NotifiableCaseListParams = useMemo(() => {
    const params: NotifiableCaseListParams = {
      page,
      page_size: PAGE_SIZE,
    };

    if (search.trim()) {
      params.search = search.trim();
    }

    if (filters.category !== 'all') {
      params.category = filters.category as NotifiableCaseListParams['category'];
    }

    if (filters.status !== 'all') {
      params.notification_status = filters.status as NotifiableCaseListParams['notification_status'];
    }

    if (filters.overdue !== 'all') {
      params.is_overdue = filters.overdue === 'true';
    }

    return params;
  }, [filters, page, search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifiable-cases', queryParams],
    queryFn: () => surveillanceApi.listNotifiableCases(queryParams),
    staleTime: 30000,
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;
  const hasNext = !!data?.next;
  const hasPrev = page > 1;

  const columns = [
    {
      key: 'disease_name',
      header: 'Disease',
      cell: (item: NotifiableCaseListItem) => (
        <div>
          <p className="font-medium">{item.disease_name}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[item.disease_category] || item.disease_category}
          </p>
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      cell: (item: NotifiableCaseListItem) => (
        <div>
          <p className="font-medium">{item.patient_name}</p>
          <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      hideOnMobile: true,
      cell: (item: NotifiableCaseListItem) => item.severity,
    },
    {
      key: 'detected_at',
      header: 'Detected',
      hideOnMobile: true,
      cell: (item: NotifiableCaseListItem) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(item.detected_at)}
        </span>
      ),
    },
    {
      key: 'notification_status',
      header: 'Status',
      cell: (item: NotifiableCaseListItem) => (
        <Badge variant={STATUS_BADGE_VARIANTS[item.notification_status] || 'secondary'}>
          {item.notification_status}
        </Badge>
      ),
    },
    {
      key: 'is_overdue',
      header: 'Overdue',
      cell: (item: NotifiableCaseListItem) =>
        item.is_overdue ? (
          <Badge variant="destructive" className="w-fit">Yes</Badge>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Notifiable Cases"
          helpContent="Track notifiable disease cases and their notification status for county reporting."
        />

        <Card className="p-4 space-y-3">
          <Input
            placeholder="Search patient, MRN, or disease..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              value={filters.category}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, category: value }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="IMMEDIATE">Immediate</SelectItem>
                <SelectItem value="WEEKLY">Weekly</SelectItem>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
              </SelectContent>
            </Select>

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
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="NOTIFIED">Notified</SelectItem>
                <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                <SelectItem value="INVESTIGATED">Investigated</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.overdue}
              onValueChange={(value) => {
                setFilters((prev) => ({ ...prev, overdue: value }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Overdue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Overdue</SelectItem>
                <SelectItem value="false">On Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {error ? (
          <Card className="p-6 text-center text-destructive">
            <p>Failed to load cases</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Try Again
            </Button>
          </Card>
        ) : (
          <ResponsiveTable
            data={data?.results ?? []}
            columns={columns}
            keyExtractor={(item) => item.id}
            isLoading={isLoading}
            emptyMessage="No notifiable cases found."
            mobileCard={(item) => (
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.disease_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.patient_name} • {item.patient_mrn}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(item.detected_at)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {item.is_overdue && (
                      <Badge variant="destructive" className="w-fit">
                        Overdue
                      </Badge>
                    )}
                    <Badge
                      variant={STATUS_BADGE_VARIANTS[item.notification_status] || 'secondary'}
                      className="w-fit"
                    >
                      {item.notification_status}
                    </Badge>
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
      </div>
    </PullToRefresh>
  );
}

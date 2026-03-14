'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle, Globe, Clock } from 'lucide-react';
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
  IHRNotificationListItem,
  IHRNotificationListParams,
} from '@/lib/types/surveillance';

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANTS: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  SUBMITTED_COUNTY: 'info',
  ESCALATED_NATIONAL: 'info',
  NOTIFIED_WHO: 'success',
  ACKNOWLEDGED: 'success',
  CLOSED: 'outline',
  REJECTED: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  SUBMITTED_COUNTY: 'At County',
  ESCALATED_NATIONAL: 'At MOH',
  NOTIFIED_WHO: 'WHO Notified',
  ACKNOWLEDGED: 'WHO Acknowledged',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

const URGENCY_BADGE_VARIANTS: Record<string, 'destructive' | 'warning' | 'info'> = {
  EMERGENCY: 'destructive',
  URGENT: 'warning',
  ROUTINE: 'info',
};

export default function IHRNotificationsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    urgency: 'all',
  });

  const queryParams: IHRNotificationListParams = useMemo(() => {
    const params: IHRNotificationListParams = {
      page,
      page_size: PAGE_SIZE,
    };

    if (search.trim()) {
      params.search = search.trim();
    }

    if (filters.status !== 'all') {
      params.status = filters.status as IHRNotificationListParams['status'];
    }

    if (filters.urgency !== 'all') {
      params.urgency = filters.urgency as IHRNotificationListParams['urgency'];
    }

    return params;
  }, [filters, page, search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ihr-notifications', queryParams],
    queryFn: () => surveillanceApi.listIHRNotifications(queryParams),
    staleTime: 30000,
  });

  const { data: dashboard } = useQuery({
    queryKey: ['ihr-dashboard'],
    queryFn: () => surveillanceApi.getIHRDashboard(),
    staleTime: 30000,
  });

  const handleRowClick = (item: IHRNotificationListItem) => {
    router.push(`/surveillance/ihr/${item.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="IHR Notifications"
          helpContent="International Health Regulations (2005) notification pipeline. Track events from detection through county → MOH → WHO escalation. Notifications must reach WHO within 24 hours per IHR Article 6."
          actions={
            <Button size="sm" onClick={() => router.push('/surveillance/ihr/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Notification</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Dashboard Summary */}
        {dashboard && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-bold">{dashboard.total}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Pending
              </div>
              <div className="text-2xl font-bold">{dashboard.pending}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" />
                WHO Notified
              </div>
              <div className="text-2xl font-bold text-green-600">{dashboard.notified_who}</div>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Overdue
              </div>
              <div className="text-2xl font-bold text-destructive">{dashboard.overdue}</div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            placeholder="Search by disease, patient..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full sm:max-w-xs"
          />
          <Select
            value={filters.status}
            onValueChange={(value) => {
              setFilters((f) => ({ ...f, status: value }));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
              <SelectItem value="SUBMITTED_COUNTY">At County</SelectItem>
              <SelectItem value="ESCALATED_NATIONAL">At MOH</SelectItem>
              <SelectItem value="NOTIFIED_WHO">WHO Notified</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.urgency}
            onValueChange={(value) => {
              setFilters((f) => ({ ...f, urgency: value }));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Urgency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Urgencies</SelectItem>
              <SelectItem value="EMERGENCY">Emergency (PHEIC)</SelectItem>
              <SelectItem value="URGENT">Urgent (&lt;24h)</SelectItem>
              <SelectItem value="ROUTINE">Routine</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          emptyMessage={error ? 'Failed to load IHR notifications' : 'No IHR notifications found'}
          columns={[
            {
              key: 'reference',
              header: 'Reference',
              sortable: true,
              cell: (item) => (
                <span className="font-mono text-sm">{item.notification_reference}</span>
              ),
            },
            {
              key: 'disease',
              header: 'Disease',
              sortable: true,
              sortFn: (a, b) => (a.disease_name || '').localeCompare(b.disease_name || ''),
              cell: (item) => item.disease_name,
            },
            {
              key: 'urgency',
              header: 'Urgency',
              sortable: true,
              cell: (item) => (
                <Badge variant={URGENCY_BADGE_VARIANTS[item.urgency] ?? 'secondary'}>
                  {item.urgency}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              ),
            },
            {
              key: 'cases',
              header: 'Cases/Deaths',
              sortable: true,
              sortType: 'number',
              sortFn: (a, b) => a.cases_count - b.cases_count,
              cell: (item) => (
                <span>
                  {item.cases_count} / {item.deaths_count}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'county',
              header: 'County',
              sortable: true,
              cell: (item) => item.county_name ?? '-',
              hideOnMobile: true,
            },
            {
              key: 'overdue',
              header: 'Overdue',
              cell: (item) =>
                item.is_overdue ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="sm:hidden">!</span>
                    <span className="hidden sm:inline">Overdue</span>
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {item.hours_since_detection != null ? `${item.hours_since_detection}h` : '-'}
                  </span>
                ),
            },
            {
              key: 'date',
              header: 'Reported',
              cell: (item) => formatDateTime(item.report_date),
              hideOnMobile: true,
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs">{item.notification_reference}</span>
                    {item.is_overdue && (
                      <Badge variant="destructive" className="text-xs">Overdue</Badge>
                    )}
                  </div>
                  <p className="font-medium truncate">{item.disease_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.cases_count} cases, {item.deaths_count} deaths
                    {item.county_name && ` • ${item.county_name}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={URGENCY_BADGE_VARIANTS[item.urgency] ?? 'secondary'} className="text-xs">
                    {item.urgency}
                  </Badge>
                  <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'} className="text-xs">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </div>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {data && data.count > PAGE_SIZE && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="flex items-center text-sm text-muted-foreground">
              Page {page} of {Math.ceil(data.count / PAGE_SIZE)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

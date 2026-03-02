'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell } from 'lucide-react';
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
import { cdsApi } from '@/lib/api/cds';
import { formatDateTime } from '@/lib/utils/format';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import type { CDSAlertListItem, CDSAlertListParams } from '@/lib/types/cds';

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANTS: Record<string, 'warning' | 'info' | 'success' | 'destructive' | 'secondary' | 'outline'> = {
  PENDING: 'warning',
  ACKNOWLEDGED: 'info',
  ACCEPTED: 'success',
  OVERRIDDEN: 'destructive',
  DISMISSED: 'secondary',
  AUTO_RESOLVED: 'outline',
};

const PRIORITY_BADGE_VARIANTS: Record<string, 'destructive' | 'warning' | 'info' | 'secondary' | 'outline'> = {
  CRITICAL: 'destructive',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'secondary',
  INFO: 'outline',
};

const CATEGORY_LABELS: Record<string, string> = {
  DRUG_ALLERGY: 'Drug-Allergy',
  DRUG_DRUG: 'Drug-Drug',
  CRITICAL_LAB: 'Critical Lab',
  VITAL_SIGN: 'Vital Sign',
  GUIDELINE: 'Guideline',
  PREVENTIVE: 'Preventive',
  DOSAGE: 'Dosage',
};

export default function CDSAlertsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: searchParams.get('status') ?? 'all',
    priority: 'all',
    category: 'all',
  });

  const queryParams: CDSAlertListParams = useMemo(() => {
    const params: CDSAlertListParams = { page, page_size: PAGE_SIZE, ordering: '-created_at' };
    if (search.trim()) params.search = search.trim();
    if (filters.status !== 'all') params.status = filters.status as CDSAlertListParams['status'];
    if (filters.priority !== 'all') params.priority = filters.priority as CDSAlertListParams['priority'];
    if (filters.category !== 'all') params.category = filters.category as CDSAlertListParams['category'];
    return params;
  }, [filters, page, search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cds-alerts', queryParams],
    queryFn: () => cdsApi.listAlerts(queryParams),
    staleTime: 15000,
  });

  const handleRowClick = (item: CDSAlertListItem) => {
    router.push(`/cds/alerts/${item.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="CDS Alerts"
          helpContent="Clinical decision support alerts triggered during patient encounters. Review, acknowledge, accept, override, or dismiss alerts."
        />

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            placeholder="Search alerts..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:max-w-xs"
          />
          <Select
            value={filters.status}
            onValueChange={(value) => { setFilters((f) => ({ ...f, status: value })); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="OVERRIDDEN">Overridden</SelectItem>
              <SelectItem value="DISMISSED">Dismissed</SelectItem>
              <SelectItem value="AUTO_RESOLVED">Auto-Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.priority}
            onValueChange={(value) => { setFilters((f) => ({ ...f, priority: value })); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="INFO">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.category}
            onValueChange={(value) => { setFilters((f) => ({ ...f, category: value })); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="DRUG_ALLERGY">Drug-Allergy</SelectItem>
              <SelectItem value="DRUG_DRUG">Drug-Drug</SelectItem>
              <SelectItem value="CRITICAL_LAB">Critical Lab</SelectItem>
              <SelectItem value="VITAL_SIGN">Vital Sign</SelectItem>
              <SelectItem value="GUIDELINE">Guideline</SelectItem>
              <SelectItem value="PREVENTIVE">Preventive</SelectItem>
              <SelectItem value="DOSAGE">Dosage</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <ResponsiveTable
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          emptyMessage={error ? 'Failed to load CDS alerts' : 'No CDS alerts found'}
          columns={[
            {
              key: 'rule',
              header: 'Rule',
              cell: (item) => (
                <div>
                  <span className="font-mono text-xs">{item.rule_code}</span>
                  <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.rule_name}</p>
                </div>
              ),
            },
            {
              key: 'patient',
              header: 'Patient',
              cell: (item) => (
                <div>
                  <p className="text-sm">{item.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{item.patient_mrn}</p>
                </div>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              cell: (item) => (
                <Badge variant={PRIORITY_BADGE_VARIANTS[item.priority] ?? 'secondary'}>
                  {item.is_critical && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {item.priority}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (item) => (
                <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'}>
                  {item.status.replace(/_/g, ' ')}
                </Badge>
              ),
            },
            {
              key: 'category',
              header: 'Category',
              cell: (item) => (
                <span className="text-sm">{CATEGORY_LABELS[item.category] ?? item.category}</span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'message',
              header: 'Message',
              cell: (item) => (
                <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
                  {item.message}
                </span>
              ),
              hideOnMobile: true,
            },
            {
              key: 'created',
              header: 'Created',
              cell: (item) => <span className="text-sm">{formatDateTime(item.created_at)}</span>,
              hideOnMobile: true,
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs">{item.rule_code}</span>
                    {item.is_critical && (
                      <Badge variant="destructive" className="text-xs">Critical</Badge>
                    )}
                  </div>
                  <p className="text-sm truncate">{item.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.patient_name} ({item.patient_mrn})
                    {' • '}
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={PRIORITY_BADGE_VARIANTS[item.priority] ?? 'secondary'} className="text-xs">
                    {item.priority}
                  </Badge>
                  <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'} className="text-xs">
                    {item.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
            </Card>
          )}
        />

        {/* Pagination */}
        {data && data.count > PAGE_SIZE && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="flex items-center text-sm text-muted-foreground">
              Page {page} of {Math.ceil(data.count / PAGE_SIZE)}
            </span>
            <Button variant="outline" size="sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

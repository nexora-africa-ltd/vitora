'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
import type { CDSRuleListItem, CDSRuleListParams } from '@/lib/types/cds';

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANTS: Record<string, 'secondary' | 'success' | 'warning' | 'outline'> = {
  DRAFT: 'secondary',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  RETIRED: 'outline',
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

export default function CDSRulesPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: 'all',
    status: 'all',
    priority: 'all',
  });

  const queryParams: CDSRuleListParams = useMemo(() => {
    const params: CDSRuleListParams = { page, page_size: PAGE_SIZE };
    if (search.trim()) params.search = search.trim();
    if (filters.category !== 'all') params.category = filters.category as CDSRuleListParams['category'];
    if (filters.status !== 'all') params.status = filters.status as CDSRuleListParams['status'];
    if (filters.priority !== 'all') params.priority = filters.priority as CDSRuleListParams['priority'];
    return params;
  }, [filters, page, search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cds-rules', queryParams],
    queryFn: () => cdsApi.listRules(queryParams),
    staleTime: 30000,
  });

  const handleRowClick = (item: CDSRuleListItem) => {
    router.push(`/cds/rules/${item.id}`);
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="CDS Rules"
          helpContent="Manage clinical decision support rules. Rules define conditions that trigger alerts during clinical workflows — drug-allergy checks, critical lab values, vital sign thresholds, and more."
          actions={
            <Button size="sm" onClick={() => router.push('/cds/rules/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Rule</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Input
            placeholder="Search by code, name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full sm:max-w-xs"
          />
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
          <Select
            value={filters.status}
            onValueChange={(value) => { setFilters((f) => ({ ...f, status: value })); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="RETIRED">Retired</SelectItem>
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
        </div>

        {/* Table */}
        <ResponsiveTable
          data={data?.results ?? []}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          emptyMessage={error ? 'Failed to load CDS rules' : 'No CDS rules found'}
          columns={[
            {
              key: 'code',
              header: 'Code',
              cell: (item) => <span className="font-mono text-sm">{item.code}</span>,
            },
            {
              key: 'name',
              header: 'Name',
              cell: (item) => item.name,
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
              key: 'priority',
              header: 'Priority',
              cell: (item) => (
                <Badge variant={PRIORITY_BADGE_VARIANTS[item.priority] ?? 'secondary'}>
                  {item.priority}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (item) => (
                <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'}>
                  {item.status}
                </Badge>
              ),
            },
            {
              key: 'evidence',
              header: 'Evidence',
              cell: (item) => <span className="text-sm">Level {item.evidence_level}</span>,
              hideOnMobile: true,
            },
            {
              key: 'triggers',
              header: 'Triggers',
              cell: (item) => <span className="text-sm">{item.trigger_count}</span>,
              hideOnMobile: true,
            },
          ]}
          mobileCard={(item) => (
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {CATEGORY_LABELS[item.category] ?? item.category} • Level {item.evidence_level} • {item.trigger_count} triggers
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={PRIORITY_BADGE_VARIANTS[item.priority] ?? 'secondary'} className="text-xs">
                    {item.priority}
                  </Badge>
                  <Badge variant={STATUS_BADGE_VARIANTS[item.status] ?? 'secondary'} className="text-xs">
                    {item.status}
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

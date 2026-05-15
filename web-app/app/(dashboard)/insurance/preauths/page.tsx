'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInsurancePreauths } from '@/lib/hooks/use-insurance';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { InsurancePreauth, InsurancePreauthStatus } from '@/lib/types/insurance';
import { PREAUTH_STATUS_LABELS } from '@/lib/types/insurance';

const STATUS_COLORS: Record<InsurancePreauthStatus, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  denied: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

export default function InsurancePreauthsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InsurancePreauthStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isFetching, refetch } = useInsurancePreauths({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
  });

  const preauths = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const handleRowClick = (preauth: InsurancePreauth) => {
    router.push(`/insurance/preauths/${preauth.id}`);
  };

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value as InsurancePreauthStatus | 'all');
    setPage(1);
  }, []);

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Pre-authorizations"
          helpContent="Manage insurance pre-authorization requests. Track approval status and validity periods."
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search preauths..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(PREAUTH_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ResponsiveTable<InsurancePreauth>
          data={preauths}
          columns={[
            {
              key: 'preauth_number',
              header: 'Preauth #',
              sortable: true,
              cell: (item) => (
                <div>
                  <p className="font-medium font-mono text-sm">{item.preauth_number}</p>
                  <p className="text-xs text-muted-foreground">{item.provider_name}</p>
                </div>
              ),
            },
            {
              key: 'patient_name',
              header: 'Patient',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => (
                <div>
                  <p className="text-sm">{item.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{item.member_number}</p>
                </div>
              ),
            },
            {
              key: 'preauth_type',
              header: 'Type',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => <span className="capitalize">{item.preauth_type}</span>,
            },
            {
              key: 'estimated_cost',
              header: 'Est. Cost',
              sortable: true,
              sortType: 'number',
              cell: (item) => formatCurrency(item.estimated_cost),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <Badge className={`${STATUS_COLORS[item.status] || ''} shrink-0 w-fit text-xs`}>
                  {PREAUTH_STATUS_LABELS[item.status] || item.status}
                </Badge>
              ),
            },
          ]}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          defaultSortColumn="created_at"
          defaultSortDirection="desc"
          emptyMessage="No pre-authorizations found."
          mobileCard={(item) => (
            <Card key={item.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleRowClick(item)}>
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium font-mono text-sm">{item.preauth_number}</p>
                    <p className="text-xs text-muted-foreground">{item.patient_name} • {item.preauth_type}</p>
                  </div>
                  <Badge className={`${STATUS_COLORS[item.status] || ''} shrink-0 text-xs`}>
                    {PREAUTH_STATUS_LABELS[item.status] || item.status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">{item.provider_name}</p>
                  <p className="text-sm font-medium">{formatCurrency(item.estimated_cost)}</p>
                </div>
              </CardContent>
            </Card>
          )}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

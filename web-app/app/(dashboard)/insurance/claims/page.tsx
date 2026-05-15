'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useInsuranceClaims } from '@/lib/hooks/use-insurance';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { InsuranceClaim, InsuranceClaimStatus } from '@/lib/types/insurance';
import { CLAIM_STATUS_LABELS } from '@/lib/types/insurance';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  acknowledged: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  query: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  partially_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  partially_paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  appealed: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  written_off: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  pending_preauth: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  preauth_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  preauth_denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatCurrency(amount: string | number): string {
  return `KES ${Number(amount).toLocaleString()}`;
}

export default function InsuranceClaimsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InsuranceClaimStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isFetching, refetch } = useInsuranceClaims({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
  });

  const claims = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const handleRowClick = (claim: InsuranceClaim) => {
    router.push(`/insurance/claims/${claim.id}`);
  };

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value as InsuranceClaimStatus | 'all');
    setPage(1);
  }, []);

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Insurance Claims"
          helpContent="Track and manage insurance claims. Submit claims, respond to queries, and monitor payment status."
          actions={
            <Button onClick={() => router.push('/insurance/claims/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Claim
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-full sm:w-44">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ResponsiveTable<InsuranceClaim>
          data={claims}
          columns={[
            {
              key: 'claim_number',
              header: 'Claim #',
              sortable: true,
              cell: (item) => (
                <div>
                  <p className="font-medium font-mono text-sm">{item.claim_number}</p>
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
              key: 'total_amount',
              header: 'Amount',
              sortable: true,
              sortType: 'number',
              cell: (item) => (
                <div className="text-right">
                  <p className="text-sm font-medium">{formatCurrency(item.total_amount)}</p>
                  {item.approved_amount !== '0.00' && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Approved: {formatCurrency(item.approved_amount)}
                    </p>
                  )}
                </div>
              ),
            },
            {
              key: 'service_date',
              header: 'Service Date',
              sortable: true,
              sortType: 'date',
              hideOnMobile: true,
              cell: (item) => new Date(item.service_date).toLocaleDateString(),
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <div className="flex items-center gap-1">
                  <Badge className={`${STATUS_COLORS[item.status] || ''} shrink-0 w-fit text-xs`}>
                    {CLAIM_STATUS_LABELS[item.status] || item.status}
                  </Badge>
                  {item.is_overdue && (
                    <Badge variant="destructive" className="text-xs">Overdue</Badge>
                  )}
                </div>
              ),
            },
          ]}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          defaultSortColumn="service_date"
          defaultSortDirection="desc"
          emptyMessage="No insurance claims found."
          mobileCard={(item) => (
            <Card key={item.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleRowClick(item)}>
              <CardContent className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="font-medium font-mono text-sm">{item.claim_number}</p>
                    <p className="text-xs text-muted-foreground">{item.patient_name} • {item.member_number}</p>
                  </div>
                  <Badge className={`${STATUS_COLORS[item.status] || ''} shrink-0 text-xs`}>
                    {CLAIM_STATUS_LABELS[item.status] || item.status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">{item.provider_name} • {new Date(item.service_date).toLocaleDateString()}</p>
                  <p className="text-sm font-medium">{formatCurrency(item.total_amount)}</p>
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

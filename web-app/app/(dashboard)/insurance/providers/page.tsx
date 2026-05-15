'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Card, CardContent } from '@/components/ui/card';
import { useInsuranceProviders } from '@/lib/hooks/use-insurance';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { InsuranceProvider, InsuranceProviderStatus } from '@/lib/types/insurance';
import { PROVIDER_TYPE_LABELS } from '@/lib/types/insurance';

const STATUS_COLORS: Record<InsuranceProviderStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function InsuranceProvidersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isFetching, refetch } = useInsuranceProviders({
    search: debouncedSearch || undefined,
    page,
  });

  const providers = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / 20));

  const handleRowClick = (provider: InsuranceProvider) => {
    router.push(`/insurance/providers/${provider.id}`);
  };

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }} isRefreshing={isFetching}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Insurance Providers"
          helpContent="Manage insurance providers registered with your facility. Add new providers, view their plans, and track enrollments."
          actions={
            <Button onClick={() => router.push('/insurance/providers/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Add Provider
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search providers..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
        </div>

        <ResponsiveTable<InsuranceProvider>
          data={providers}
          columns={[
            {
              key: 'name',
              header: 'Provider',
              sortable: true,
              cell: (item) => (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code}</p>
                  </div>
                </div>
              ),
            },
            {
              key: 'provider_type',
              header: 'Type',
              sortable: true,
              hideOnMobile: true,
              cell: (item) => PROVIDER_TYPE_LABELS[item.provider_type] || item.provider_type,
            },
            {
              key: 'plans_count',
              header: 'Plans',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (item) => item.plans_count,
            },
            {
              key: 'active_enrollments_count',
              header: 'Enrollments',
              sortable: true,
              sortType: 'number',
              hideOnMobile: true,
              cell: (item) => item.active_enrollments_count,
            },
            {
              key: 'status',
              header: 'Status',
              sortable: true,
              cell: (item) => (
                <Badge className={`${STATUS_COLORS[item.status]} shrink-0 w-fit`}>
                  {item.status}
                </Badge>
              ),
            },
          ]}
          keyExtractor={(item) => item.id}
          onRowClick={handleRowClick}
          isLoading={isLoading}
          emptyMessage="No insurance providers found."
          mobileCard={(item) => (
            <Card key={item.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => handleRowClick(item)}>
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code} • {PROVIDER_TYPE_LABELS[item.provider_type]}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.plans_count} plans • {item.active_enrollments_count} enrollments</p>
                  </div>
                  <Badge className={`${STATUS_COLORS[item.status]} shrink-0`}>
                    {item.status}
                  </Badge>
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

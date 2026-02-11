'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { laboratoryApi } from '@/lib/api/laboratory';
import type { TestCatalogListItem } from '@/lib/types/laboratory';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ResponsiveTable } from '@/components/ui/responsive-table';

const EMPTY_TESTS: TestCatalogListItem[] = [];

export default function LaboratoryTestsPage() {
  const [search, setSearch] = useState('');
  const { refresh, isRefreshing } = usePageRefresh();

  const testsQuery = useQuery({
    queryKey: ['laboratoryTests', { is_active: true, page: 1, page_size: 50 }],
    queryFn: async () => laboratoryApi.listTests({ is_active: true, page: 1, page_size: 50 }),
  });

  const tests: TestCatalogListItem[] = testsQuery.data?.results ?? EMPTY_TESTS;
  const errorMessage = testsQuery.error instanceof Error ? testsQuery.error.message : null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tests;
    return tests.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const code = (t.code || '').toLowerCase();
      const shortName = (t.short_name || '').toLowerCase();
      return name.includes(query) || code.includes(query) || shortName.includes(query);
    });
  }, [search, tests]);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Laboratory Tests"
          helpContent="Browse and search the lab test catalog (including LOINC codes). Pull down to refresh on mobile, or use the refresh button in the header."
        />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Catalog</CardTitle>
              <HelpPopover content="Search by test name, local code, or LOINC code." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-w-md">
              <Label htmlFor="lab-tests-search">Search</Label>
              <Input
                id="lab-tests-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tests by name, code, or LOINC..."
              />
            </div>

            {testsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : errorMessage ? (
              <div className="text-sm text-destructive">{errorMessage}</div>
            ) : (
              <ResponsiveTable
                data={filtered}
                keyExtractor={(t) => t.id}
                emptyMessage="No tests match your search."
                columns={[
                  {
                    key: 'name',
                    header: 'Name',
                    cell: (t) => <span className="font-medium">{t.name}</span>,
                  },
                  { key: 'code', header: 'Code' },
                  { key: 'category', header: 'Category', hideOnMobile: true },
                  { key: 'specimen_type', header: 'Specimen', hideOnMobile: true },
                ]}
                mobileCard={(t) => (
                  <Card className="p-3 space-y-1">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {t.code}
                      {t.category ? <span> • {t.category}</span> : null}
                    </div>
                    {t.specimen_type ? (
                      <div className="text-xs text-muted-foreground">{t.specimen_type}</div>
                    ) : null}
                  </Card>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PullToRefresh>
  );
}

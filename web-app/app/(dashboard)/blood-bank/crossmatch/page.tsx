'use client';

import { useState } from 'react';
import { Search, Target } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useCrossMatches } from '@/lib/hooks/use-blood-bank';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import type { CrossMatch } from '@/lib/types/blood-bank';
import { CROSSMATCH_COLORS } from '@/lib/types/blood-bank';

export default function CrossMatchPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useCrossMatches();

  const filteredResults = (data?.results || []).filter((item) => {
    if (!debouncedSearch) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      item.unit_number.toLowerCase().includes(q) ||
      item.method.toLowerCase().includes(q) ||
      item.performed_by_name.toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      key: 'unit_number',
      header: 'Unit #',
      sortable: true,
      cell: (item: CrossMatch) => (
        <span className="font-mono text-sm">{item.unit_number}</span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      sortable: true,
      cell: (item: CrossMatch) => (
        <Badge className={`${CROSSMATCH_COLORS[item.result]} shrink-0 w-fit`}>
          {item.result}
        </Badge>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      hideOnMobile: true,
      cell: (item: CrossMatch) => item.method,
    },
    {
      key: 'performed_by_name',
      header: 'Performed By',
      hideOnMobile: true,
      cell: (item: CrossMatch) => item.performed_by_name,
    },
    {
      key: 'performed_at',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (item: CrossMatch) => formatDate(item.performed_at),
    },
  ];

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="container mx-auto py-6 space-y-6">
        <PageHeader
          title="Cross-Match Tests"
          helpContent="Cross-matching verifies compatibility between donor blood and patient serum before transfusion."
        />

        {/* Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by unit #, method..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ResponsiveTable
            data={filteredResults}
            columns={columns}
            keyExtractor={(item) => item.id}
            defaultSortColumn="performed_at"
            defaultSortDirection="desc"
            emptyMessage="No cross-match tests recorded."
          />
        )}
      </div>
    </PullToRefresh>
  );
}

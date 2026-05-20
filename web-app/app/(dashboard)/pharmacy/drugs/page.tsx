/**
 * Drug Catalog Page
 * Standalone list page for browsing and managing the drug catalog.
 * Also accessible via the Drug Catalog tab on /pharmacy dashboard.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { DrugTable } from '@/components/pharmacy';
import { useDrugs } from '@/lib/hooks/use-pharmacy';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useDebounce } from '@/lib/hooks/use-debounce';
import type { DrugCategory, DrugForm, DrugSchedule, ItemType } from '@/lib/types/pharmacy';

export default function DrugCatalogPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [filters, setFilters] = useState<{
    category?: DrugCategory;
    form?: DrugForm;
    schedule?: DrugSchedule;
    item_type?: ItemType;
    is_essential?: boolean;
    is_active?: boolean;
  }>({});
  const pageSize = 20;

  const {
    data: drugsData,
    isLoading,
    error,
  } = useDrugs({
    page,
    page_size: pageSize,
    search: debouncedSearch || undefined,
    ...filters,
  });

  const drugs = drugsData?.results || [];
  const totalCount = drugsData?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Item Catalog"
          helpContent="Browse and manage medications, consumables, and reagents. Add new items, view details, and manage stock levels."
          actions={
            <Button onClick={() => router.push('/pharmacy/drugs/new')}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          }
        />

        <DrugTable
          drugs={drugs}
          isLoading={isLoading}
          error={error as Error | null}
          page={page}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setPage}
          onSearch={(q) => { setSearch(q); setPage(1); }}
          onFiltersChange={(f) => { setFilters(f); setPage(1); }}
        />
      </div>
    </PullToRefresh>
  );
}

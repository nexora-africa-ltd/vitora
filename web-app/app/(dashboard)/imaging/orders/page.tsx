/**
 * Imaging orders list page.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ImagingOrderTable } from '@/components/imaging';
import { useImagingOrders } from '@/lib/hooks/use-imaging';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { ImagingOrderStatus, ImagingPriority } from '@/lib/types/imaging';

export default function ImagingOrdersPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ImagingOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ImagingPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading, error, refetch } = useImagingOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const orders = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Imaging Orders"
          helpContent="View and manage all imaging orders. Search by patient name, MRN, order number, or clinical indication. Filter by status and priority."
          actions={
            <Button onClick={() => router.push('/imaging/orders/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Order
            </Button>
          }
        />

        <ImagingOrderTable
          orders={orders}
          isLoading={isLoading}
          error={error as Error | null}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onStatusFilter={(s) => { setStatusFilter(s); setPage(1); }}
          onPriorityFilter={(p) => { setPriorityFilter(p); setPage(1); }}
          onSearch={(q) => { setSearchQuery(q); setPage(1); }}
          onRefresh={() => refetch()}
        />
      </div>
    </PullToRefresh>
  );
}

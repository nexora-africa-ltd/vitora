/**
 * Imaging orders list page.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';
import { ImagingOrderTable } from '@/components/imaging';
import { useImagingOrders } from '@/lib/hooks/use-imaging';
import { ImagingOrderStatus, ImagingPriority } from '@/lib/types/imaging';

export default function ImagingOrdersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ImagingOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ImagingPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error, refetch } = useImagingOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
  });

  const orders = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/imaging')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Imaging Orders</h1>
            <p className="text-muted-foreground">
              View and manage all imaging orders
            </p>
          </div>
        </div>
        <Button onClick={() => router.push('/imaging/orders/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      {/* Orders Table */}
      <ImagingOrderTable
        orders={orders}
        isLoading={isLoading}
        error={error as Error | null}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onStatusFilter={setStatusFilter}
        onPriorityFilter={setPriorityFilter}
        onSearch={setSearchQuery}
        onRefresh={() => refetch()}
      />
    </div>
  );
}

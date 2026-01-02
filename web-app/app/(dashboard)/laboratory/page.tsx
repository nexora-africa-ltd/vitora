'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ClipboardList, Beaker, FileText } from 'lucide-react';
import { LabOrderTable } from '@/components/laboratory/lab-order-table';
import { LabQueueView } from '@/components/laboratory/lab-queue-view';
import { useLabOrders } from '@/lib/hooks/use-laboratory';
import { LabOrderStatus, LabPriority } from '@/lib/types/laboratory';

export default function LaboratoryPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LabPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useLabOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: searchQuery || undefined,
  });

  const orders = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Laboratory</h1>
          <p className="text-muted-foreground">
            Manage lab orders, view results, and track queue
          </p>
        </div>
        <Button onClick={() => router.push('/laboratory/orders/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Lab Order
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <Beaker className="h-4 w-4" />
            Lab Queue
          </TabsTrigger>
          <TabsTrigger value="results" className="gap-2">
            <FileText className="h-4 w-4" />
            Pending Verification
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <LabOrderTable
            orders={orders}
            isLoading={isLoading}
            error={error as Error | null}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onStatusFilter={setStatusFilter}
            onPriorityFilter={setPriorityFilter}
            onSearch={setSearchQuery}
          />
        </TabsContent>

        <TabsContent value="queue">
          <LabQueueView />
        </TabsContent>

        <TabsContent value="results">
          <PendingVerificationView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Pending verification component
function PendingVerificationView() {
  const router = useRouter();
  const { data: pendingResults, isLoading } = useLabOrders({
    status: 'COMPLETED',
    page_size: 50,
  });

  // Filter orders where any result is unverified
  const ordersWithUnverified = (pendingResults?.results || []).filter(
    order => order.items?.some(
      item => item.result && item.result.verification_status === 'UNVERIFIED'
    )
  );

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (ordersWithUnverified.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No results pending verification</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {ordersWithUnverified.length} order(s) with results pending verification
      </p>
      {ordersWithUnverified.map(order => (
        <div
          key={order.id}
          className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
          onClick={() => router.push(`/laboratory/orders/${order.order_number}`)}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{order.order_number}</p>
              <p className="text-sm text-muted-foreground">
                {order.patient_name} • {order.patient_mrn}
              </p>
            </div>
            <Button variant="outline" size="sm">
              Review
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, SquareDashedTopSolid, Beaker, FileText, ClipboardClock, Shield, ExternalLink } from 'lucide-react';
import { LabOrderTable } from '@/components/laboratory/lab-order-table';
import { LabQueueView } from '@/components/laboratory/lab-queue-view';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useLabOrders } from '@/lib/hooks/use-laboratory';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { LabOrderStatus, LabPriority } from '@/lib/types/laboratory';

export default function LaboratoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, isRefreshing } = usePageRefresh();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LabPriority | ''>('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, isLoading, error } = useLabOrders({
    page,
    page_size: 20,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: debouncedSearch || undefined,
  });

  const orders = data?.results || [];
  const totalPages = Math.ceil((data?.count || 0) / 20);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Laboratory"
          helpContent="Manage lab orders, record results, and track the lab queue. Pull down to refresh on mobile, or use the refresh button in the header."
          actions={
            <Button onClick={() => router.push('/laboratory/orders/new')} className="gap-2 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              New Lab Order
            </Button>
          }
        />

        {/* Tabs */}
        <Tabs defaultValue="orders" className="space-y-4">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="orders" className="gap-1.5 px-2 sm:px-4">
              <SquareDashedTopSolid className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Lab Orders</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="gap-1.5 px-2 sm:px-4">
              <Beaker className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Lab Queue</span>
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-1.5 px-2 sm:px-4">
              <ClipboardClock className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Pending Verification</span>
            </TabsTrigger>
            <TabsTrigger value="validations" className="gap-1.5 px-2 sm:px-4">
              <Shield className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Two-Stage Review</span>
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

          <TabsContent value="validations">
            <ValidationsQuickView />
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
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

// Two-Stage Validations Quick View
function ValidationsQuickView() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-medium">Two-Stage Validation Workflow</h3>
          <p className="text-sm text-muted-foreground">
            Results require both technical and clinical review before release.
          </p>
        </div>
        <Button
          onClick={() => router.push('/laboratory/validations')}
          className="gap-2 w-full sm:w-auto"
        >
          <Shield className="h-4 w-4" />
          Open Validation Dashboard
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-medium">Technical Review</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Verifies analytical accuracy: specimen quality, equipment calibration, 
            QC results, and procedural compliance.
          </p>
        </div>
        <div className="p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-green-600" />
            <span className="font-medium">Clinical Review</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Verifies clinical relevance: consistency with patient history, 
            delta checks, and need for interpretation or repeat testing.
          </p>
        </div>
      </div>
    </div>
  );
}

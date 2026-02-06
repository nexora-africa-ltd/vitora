/**
 * Imaging module main page.
 * Displays orders with tabs for orders, worklist, and procedures.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, ClipboardList, Activity, BookOpen } from 'lucide-react';
import { ImagingOrderTable } from '@/components/imaging';
import { ImagingWorklist } from '@/components/imaging';
import { useImagingOrders, useImagingProcedures } from '@/lib/hooks/use-imaging';
import { ImagingOrderStatus, ImagingPriority, ImagingProcedure, ImagingModality } from '@/lib/types/imaging';

export default function ImagingPage() {
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
        <div>
          <h1 className="text-2xl font-bold">Imaging</h1>
          <p className="text-muted-foreground">
            Manage imaging orders, view worklist, and track procedures
          </p>
        </div>
        <Button onClick={() => router.push('/imaging/orders/new')}>
          <Plus className="h-4 w-4 mr-2" />
          New Imaging Order
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList>
          <TabsTrigger value="orders" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="worklist" className="gap-2">
            <Activity className="h-4 w-4" />
            Worklist
          </TabsTrigger>
          <TabsTrigger value="procedures" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Procedure Catalog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
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
        </TabsContent>

        <TabsContent value="worklist">
          <ImagingWorklist />
        </TabsContent>

        <TabsContent value="procedures">
          <ProcedureCatalogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Procedure catalog component
function ProcedureCatalogView() {
  const [page, setPage] = useState(1);
  const [modalityFilter, setModalityFilter] = useState<ImagingModality | ''>('');
  
  const { data, isLoading } = useImagingProcedures({
    page,
    page_size: 50,
    modality: modalityFilter || undefined,
  });

  const procedures = data?.results || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Procedure Catalog ({data?.count || 0} procedures)
        </h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 border rounded-lg animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))
        ) : (
          procedures.map((procedure: ImagingProcedure) => (
            <div
              key={procedure.id}
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-muted-foreground">
                  {procedure.code}
                </span>
                <span className="text-xs px-2 py-0.5 bg-muted rounded">
                  {procedure.modality}
                </span>
              </div>
              <p className="font-medium">{procedure.name}</p>
              <div className="flex items-center justify-between mt-2 text-sm">
                <span>KES {procedure.cost.toLocaleString()}</span>
                {procedure.sha_claimable && (
                  <span className="text-xs text-green-600">SHA Covered</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

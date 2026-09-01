/**
 * Encounter Imaging Orders Component
 * Shows imaging orders for a specific encounter with ability to create new orders.
 * Phase B: Frontend Order Management Integration
 */
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, ScanLine, ExternalLink, Clock, Calendar, ImageIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useEncounterExternalImagingRequests,
  useEncounterImagingOrders,
} from '@/lib/hooks/use-imaging';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils/format';
import { OrderStatusBadge, PriorityBadge, ModalityBadge } from '@/components/imaging';
import { ImagingOrderForm } from '@/components/imaging/imaging-order-form';
import type { ImagingOrder, ExternalImagingRequest } from '@/lib/types/imaging';

interface EncounterImagingOrdersProps {
  encounterId: number;
  patientId: number;
  patientName?: string;
  disabled?: boolean;
}

export function EncounterImagingOrders({
  encounterId,
  patientId,
  patientName,
  disabled = false,
}: EncounterImagingOrdersProps) {
  const queryClient = useQueryClient();
  const { data: orders, isLoading, error } = useEncounterImagingOrders(encounterId);
  const {
    data: externalRequests,
    isLoading: isExternalLoading,
    error: externalError,
  } = useEncounterExternalImagingRequests(encounterId);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const handleOrderCreated = useCallback(() => {
    setShowOrderForm(false);
    queryClient.invalidateQueries({ queryKey: ['imaging'] });
  }, [queryClient]);

  if (isLoading || isExternalLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            Imaging Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || externalError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            Imaging Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load imaging orders.</p>
        </CardContent>
      </Card>
    );
  }

  // Ensure orders is always an array
  const ordersList = Array.isArray(orders) ? orders : [];
  const externalRequestsList = Array.isArray(externalRequests) ? externalRequests : [];
  const pendingOrders = ordersList.filter(
    (o) => o.status !== 'COMPLETED' && o.status !== 'REPORTED' && o.status !== 'CANCELLED'
  );
  const completedOrders = ordersList.filter(
    (o) => o.status === 'COMPLETED' || o.status === 'REPORTED'
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            Imaging Orders
            {ordersList.length + externalRequestsList.length > 0 && (
              <Badge variant="secondary">{ordersList.length + externalRequestsList.length}</Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setShowOrderForm(true)} disabled={disabled}>
            <Plus className="mr-1 h-4 w-4" />
            Order Imaging
          </Button>
        </div>
        <CardDescription>X-ray, ultrasound, CT, MRI and other diagnostic imaging</CardDescription>
      </CardHeader>

      <CardContent>
        {ordersList.length === 0 && externalRequestsList.length === 0 ? (
          <div className="py-8 text-center">
            <ImageIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="mb-4 text-sm text-muted-foreground">
              No imaging orders for this encounter
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOrderForm(true)}
              disabled={disabled}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create First Order
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Pending Orders */}
            {pendingOrders.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Pending ({pendingOrders.length})
                </h4>
                {pendingOrders.map((order) => (
                  <ImagingOrderCard key={order.id} order={order} />
                ))}
              </div>
            )}

            {externalRequestsList.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  External Requests ({externalRequestsList.length})
                </h4>
                {externalRequestsList.map((request) => (
                  <ExternalRequestCard key={request.id} request={request} />
                ))}
              </div>
            )}

            {/* Completed Orders */}
            {completedOrders.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Completed ({completedOrders.length})
                </h4>
                {completedOrders.map((order) => (
                  <ImagingOrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {(ordersList.length > 0 || externalRequestsList.length > 0) && (
        <CardFooter className="pt-0">
          <div className="flex flex-col gap-2">
            <Link
              href={`/imaging?encounter=${encounterId}`}
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View all imaging orders
              <ExternalLink className="h-3 w-3" />
            </Link>
            {externalRequestsList.length > 0 && (
              <Link
                href="/imaging/standalone/external-orders"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Review external request queue
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </CardFooter>
      )}

      {/* New Imaging Order Sheet */}
      <Sheet open={showOrderForm} onOpenChange={setShowOrderForm}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader className="sr-only">
            <SheetTitle>New Imaging Order</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              <ImagingOrderForm
                patientId={patientId}
                patientName={patientName}
                encounterId={encounterId}
                onSuccess={handleOrderCreated}
                onCancel={() => setShowOrderForm(false)}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// Individual order card component
function ImagingOrderCard({ order }: { order: ImagingOrder }) {
  return (
    <Link
      href={`/imaging/orders/${order.order_number}`}
      className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{order.order_number}</span>
            <PriorityBadge priority={order.priority} showIcon={false} />
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="flex flex-wrap gap-1">
            {order.items.slice(0, 3).map((item) => (
              <ModalityBadge key={item.id} modality={item.modality} size="sm" />
            ))}
            {order.items.length > 3 && (
              <span className="text-xs text-muted-foreground">+{order.items.length - 3} more</span>
            )}
          </div>

          <p className="line-clamp-1 text-sm text-muted-foreground">{order.clinical_indication}</p>
        </div>

        <div className="shrink-0 text-right">
          {order.scheduled_datetime ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatDateTime(order.scheduled_datetime)}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatDateTime(order.ordered_at)}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Content-only version of Imaging Orders (no Card wrapper).
 * Used in the encounter edit orders tabs and accordion layouts.
 */
export function EncounterImagingOrdersContent({
  encounterId,
  patientId,
  patientName,
  disabled = false,
}: EncounterImagingOrdersProps) {
  const queryClient = useQueryClient();
  const { data: orders, isLoading, error } = useEncounterImagingOrders(encounterId);
  const {
    data: externalRequests,
    isLoading: isExternalLoading,
    error: externalError,
  } = useEncounterExternalImagingRequests(encounterId);
  const [showOrderForm, setShowOrderForm] = useState(false);

  const handleOrderCreated = useCallback(() => {
    setShowOrderForm(false);
    queryClient.invalidateQueries({ queryKey: ['imaging'] });
  }, [queryClient]);

  if (isLoading || isExternalLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || externalError) {
    return <p className="text-sm text-muted-foreground">Failed to load imaging orders.</p>;
  }

  const ordersList = Array.isArray(orders) ? orders : [];
  const externalRequestsList = Array.isArray(externalRequests) ? externalRequests : [];
  const pendingOrders = ordersList.filter(
    (o) => o.status !== 'COMPLETED' && o.status !== 'REPORTED' && o.status !== 'CANCELLED'
  );
  const completedOrders = ordersList.filter(
    (o) => o.status === 'COMPLETED' || o.status === 'REPORTED'
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        X-ray, ultrasound, CT, MRI and other diagnostic imaging
      </p>

      {/* Action button */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowOrderForm(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Order Imaging
          </Button>
        </div>
      )}

      {ordersList.length === 0 && externalRequestsList.length === 0 ? (
        <div className="py-4 text-center text-muted-foreground">
          <ScanLine className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No imaging orders for this encounter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Pending ({pendingOrders.length})
              </h4>
              <div className="space-y-2">
                {pendingOrders.map((order) => (
                  <ImagingOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}
          {externalRequestsList.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                External Requests ({externalRequestsList.length})
              </h4>
              <div className="space-y-2">
                {externalRequestsList.map((request) => (
                  <ExternalRequestCard key={request.id} request={request} />
                ))}
              </div>
            </div>
          )}
          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Completed ({completedOrders.length})
              </h4>
              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <ImagingOrderCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Imaging Order Sheet */}
      <Sheet open={showOrderForm} onOpenChange={setShowOrderForm}>
        <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader className="sr-only">
            <SheetTitle>New Imaging Order</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-full">
            <div className="p-6">
              <ImagingOrderForm
                patientId={patientId}
                patientName={patientName}
                encounterId={encounterId}
                onSuccess={handleOrderCreated}
                onCancel={() => setShowOrderForm(false)}
              />
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExternalRequestCard({ request }: { request: ExternalImagingRequest }) {
  const colorByStatus: Record<string, string> = {
    RECEIVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    ACCEPTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    PROCESSING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    COMPLETED: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-200',
  };

  return (
    <div className="block rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{request.placer_order_number}</span>
            <Badge className={colorByStatus[request.status] || ''}>{request.status}</Badge>
            <Badge variant="outline" className="text-[10px]">
              <Send className="mr-0.5 h-2.5 w-2.5" /> External
            </Badge>
          </div>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {request.clinical_indication}
          </p>
          {request.rejection_reason && (
            <p className="line-clamp-1 text-xs text-red-600">Reason: {request.rejection_reason}</p>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{formatDateTime(request.created_at)}</div>
      </div>
      {request.imaging_order_number && (
        <Link
          href={`/imaging/orders/${request.imaging_order_number}`}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View created order
          <ExternalLink className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export default EncounterImagingOrders;

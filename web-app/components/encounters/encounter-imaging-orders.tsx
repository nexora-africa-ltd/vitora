/**
 * Encounter Imaging Orders Component
 * Shows imaging orders for a specific encounter with ability to create new orders.
 * Phase B: Frontend Order Management Integration
 */
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ScanLine,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  ImageIcon,
} from 'lucide-react';
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
import { useEncounterImagingOrders } from '@/lib/hooks/use-imaging';
import { formatDateTime } from '@/lib/utils/format';
import {
  OrderStatusBadge,
  PriorityBadge,
  ModalityBadge,
} from '@/components/imaging';
import type {
  ImagingOrder,
  ImagingOrderStatus,
  ImagingPriority,
} from '@/lib/types/imaging';

interface EncounterImagingOrdersProps {
  encounterId: number;
  patientId: number;
  patientName?: string;
  disabled?: boolean;
  /** Called before navigating to create imaging order - use to save pending changes */
  onBeforeNavigate?: () => Promise<void>;
}

export function EncounterImagingOrders({
  encounterId,
  patientId,
  patientName,
  disabled = false,
  onBeforeNavigate,
}: EncounterImagingOrdersProps) {
  const router = useRouter();
  const { data: orders, isLoading, error } = useEncounterImagingOrders(encounterId);

  // Handle navigation to new imaging order - saves pending changes first
  const handleNewImagingOrder = useCallback(async () => {
    if (onBeforeNavigate) {
      await onBeforeNavigate();
    }
    const params = new URLSearchParams({
      encounter: String(encounterId),
      patient: String(patientId),
    });
    if (patientName) {
      params.set('patientName', patientName);
    }
    router.push(`/imaging/orders/new?${params.toString()}`);
  }, [onBeforeNavigate, router, encounterId, patientId, patientName]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
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

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Imaging Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load imaging orders.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Ensure orders is always an array
  const ordersList = Array.isArray(orders) ? orders : [];
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
          <CardTitle className="text-lg flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Imaging Orders
            {ordersList.length > 0 && (
              <Badge variant="secondary">{ordersList.length}</Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={handleNewImagingOrder}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-1" />
            Order Imaging
          </Button>
        </div>
        <CardDescription>
          X-ray, ultrasound, CT, MRI and other diagnostic imaging
        </CardDescription>
      </CardHeader>

      <CardContent>
        {ordersList.length === 0 ? (
          <div className="py-8 text-center">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              No imaging orders for this encounter
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNewImagingOrder}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
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

      {ordersList.length > 0 && (
        <CardFooter className="pt-0">
          <Link
            href={`/imaging?encounter=${encounterId}`}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all imaging orders
            <ExternalLink className="h-3 w-3" />
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

// Individual order card component
function ImagingOrderCard({ order }: { order: ImagingOrder }) {
  return (
    <Link
      href={`/imaging/orders/${order.order_number}`}
      className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm">{order.order_number}</span>
            <PriorityBadge priority={order.priority} showIcon={false} />
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="flex flex-wrap gap-1">
            {order.items.slice(0, 3).map((item) => (
              <ModalityBadge
                key={item.id}
                modality={item.modality}
                size="sm"
              />
            ))}
            {order.items.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{order.items.length - 3} more
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground line-clamp-1">
            {order.clinical_indication}
          </p>
        </div>

        <div className="text-right shrink-0">
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

// Content wrapper for accordion/tabs usage
export function EncounterImagingOrdersContent({
  encounterId,
  patientId,
  patientName,
  disabled = false,
  onBeforeNavigate,
}: EncounterImagingOrdersProps) {
  return (
    <EncounterImagingOrders
      encounterId={encounterId}
      patientId={patientId}
      patientName={patientName}
      disabled={disabled}
      onBeforeNavigate={onBeforeNavigate}
    />
  );
}

export default EncounterImagingOrders;

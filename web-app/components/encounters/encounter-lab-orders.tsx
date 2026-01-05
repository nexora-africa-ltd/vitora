/**
 * Encounter Lab Orders Component
 * Shows lab orders for a specific encounter with ability to create new orders
 * Sprint 1.5-1.6 Track B: Lab Workflow Integration
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Beaker, ExternalLink, Clock, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useEncounterLabOrders } from '@/lib/hooks/use-laboratory';
import { formatDate } from '@/lib/utils/format';
import type { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';

interface EncounterLabOrdersProps {
  encounterId: number;
  patientId: number;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<LabOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: Clock },
  ORDERED: { label: 'Ordered', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: Clock },
  SPECIMEN_COLLECTED: { label: 'Sample Collected', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300', icon: Beaker },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300', icon: Clock },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300', icon: AlertCircle },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300', icon: AlertCircle },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; color: string }> = {
  ROUTINE: { label: 'Routine', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  URGENT: { label: 'Urgent', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  STAT: { label: 'STAT', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
};

export function EncounterLabOrders({ encounterId, patientId, disabled = false }: EncounterLabOrdersProps) {
  const { data: orders, isLoading, error } = useEncounterLabOrders(encounterId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Lab Orders
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
            <Beaker className="h-5 w-5" />
            Lab Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Failed to load lab orders.</p>
        </CardContent>
      </Card>
    );
  }

  const pendingOrders = orders?.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED') || [];
  const completedOrders = orders?.filter(o => o.status === 'COMPLETED') || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Beaker className="h-5 w-5" />
            Lab Orders
            {orders && orders.length > 0 && (
              <Badge variant="secondary">{orders.length}</Badge>
            )}
          </CardTitle>
          {!disabled && (
            <Button size="sm" asChild>
              <Link href={`/laboratory/orders/new?encounter=${encounterId}&patient=${patientId}`}>
                <Plus className="h-4 w-4 mr-1" />
                Order Lab Test
              </Link>
            </Button>
          )}
        </div>
        {orders && orders.length === 0 && (
          <CardDescription>No lab orders for this encounter</CardDescription>
        )}
      </CardHeader>

      {orders && orders.length > 0 && (
        <CardContent className="space-y-4">
          {/* Pending Orders */}
          {pendingOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Pending ({pendingOrders.length})</h4>
              <div className="space-y-2">
                {pendingOrders.map((order) => (
                  <LabOrderCard key={order.order_number} order={order} />
                ))}
              </div>
            </div>
          )}

          {/* Completed Orders */}
          {completedOrders.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Completed ({completedOrders.length})</h4>
              <div className="space-y-2">
                {completedOrders.map((order) => (
                  <LabOrderCard key={order.order_number} order={order} showResults />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}

      {orders && orders.length === 0 && !disabled && (
        <CardFooter className="pt-0">
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/laboratory/orders/new?encounter=${encounterId}&patient=${patientId}`}>
              <Plus className="h-4 w-4 mr-2" />
              Order First Lab Test
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function LabOrderCard({ order, showResults = false }: { order: LabOrder; showResults?: boolean }) {
  const statusConfig = STATUS_CONFIG[order.status];
  const priorityConfig = PRIORITY_CONFIG[order.priority];
  const StatusIcon = statusConfig.icon;

  const testNames = order.items?.map(item => item.test_name).join(', ') || 'Unknown tests';

  return (
    <Link href={`/laboratory/orders/${order.order_number}`}>
      <div className="p-3 rounded-md border hover:bg-muted/50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{order.order_number}</span>
              <Badge className={statusConfig.color} variant="secondary">
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              {order.priority !== 'ROUTINE' && (
                <Badge className={priorityConfig.color} variant="secondary">
                  {priorityConfig.label}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1 truncate">{testNames}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ordered {formatDate(order.created_at)}
              {order.ordered_by_name && ` by ${order.ordered_by_name}`}
            </p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>

        {/* Show results summary for completed orders */}
        {showResults && order.items && order.items.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>
                {order.items.filter(i => i.result).length} of {order.items.length} results available
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

export default EncounterLabOrders;

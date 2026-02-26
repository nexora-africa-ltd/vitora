'use client';

import Link from 'next/link';
import { Activity, Calendar, AlertCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { formatDate, formatRelativeTime } from '@/lib/utils/format';
import { usePatientPhysioOrders } from '@/lib/hooks/use-patient-allied-health';
import type { PhysiotherapyOrderListItem } from '@/lib/types/physiotherapy';  

// Status color mapping
const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  APPROVED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  SCHEDULED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
  IN_PROGRESS: 'bg-primary/15 text-primary',
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
};

interface PatientPhysioOrdersProps {
  patientId: number;
}

export function PatientPhysioOrders({ patientId }: PatientPhysioOrdersProps) {
  const { data, isLoading, error } = usePatientPhysioOrders(patientId);
  const orders = data?.results || [];

  if (isLoading) {
    return <OrdersSkeleton title="Physiotherapy Orders" />;
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Physiotherapy Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={AlertCircle}
            title="Error loading orders"
            description="Failed to load physiotherapy orders."
          />
        </CardContent>
      </Card>
    );
  }

  if (!orders.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Physiotherapy Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Activity}
            title="No physiotherapy orders"
            description="This patient has no physiotherapy referrals."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Physiotherapy Orders
            <Badge variant="secondary" className="ml-2">{orders.length}</Badge>
          </CardTitle>
          <Link
            href={`/allied-health/physiotherapy/orders?patient_id=${patientId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View All <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders.slice(0, 5).map((order: PhysiotherapyOrderListItem) => (
          <Link
            key={order.id}
            href={`/allied-health/physiotherapy/orders/${order.id}`}
            className="block"
          >
            <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">
                    {order.treatment_type_name}
                  </span>
                  <Badge className={ORDER_STATUS_COLORS[order.status] || ''}>
                    {order.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {order.order_number} • {order.completed_sessions}/{order.total_sessions} sessions
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(order.created_at)}</span>
                  <span className="hidden sm:inline">• {formatRelativeTime(order.created_at)}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
        {orders.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{orders.length - 5} more orders
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-lg border">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

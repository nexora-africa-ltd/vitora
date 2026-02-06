/**
 * Imaging worklist view component.
 * Displays orders that need action by radiologists/technologists.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Clock,
  Play,
  RefreshCw,
  User,
  Zap,
  ChevronRight,
  Calendar,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { formatDateTime, formatRelativeTime } from '@/lib/utils/format';
import { toast } from '@/lib/hooks';
import {
  useImagingWorklist,
  useWorklistStats,
  useStartImagingOrder,
} from '@/lib/hooks/use-imaging';
import {
  ImagingOrder,
  ImagingModality,
  ImagingPriority,
  MODALITY_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/imaging';
import { cn } from '@/lib/utils/cn';
import { OrderStatusBadge } from './order-status-badge';
import { PriorityBadge } from './priority-badge';
import { ModalityBadge } from './modality-badge';

interface ImagingWorklistProps {
  onOrderSelect?: (orderNumber: string) => void;
}

export function ImagingWorklist({ onOrderSelect }: ImagingWorklistProps) {
  const router = useRouter();
  const [modalityFilter, setModalityFilter] = useState<ImagingModality | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ImagingPriority | ''>('');

  const { data: orders, isLoading, error, refetch } = useImagingWorklist();
  const { data: stats, isLoading: statsLoading } = useWorklistStats();
  const startOrder = useStartImagingOrder();

  // Apply filters
  const filteredOrders = (orders || []).filter((order) => {
    if (modalityFilter) {
      const hasModality = order.items.some(
        (item) => item.modality === modalityFilter
      );
      if (!hasModality) return false;
    }
    if (priorityFilter && order.priority !== priorityFilter) {
      return false;
    }
    return true;
  });

  const handleStartOrder = async (orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startOrder.mutateAsync(orderNumber);
      toast({ title: 'Imaging started' });
    } catch (error) {
      toast({
        title: 'Error starting imaging',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleOrderClick = (orderNumber: string) => {
    if (onOrderSelect) {
      onOrderSelect(orderNumber);
    } else {
      router.push(`/imaging/orders/${orderNumber}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.total_pending || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Loader2 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.total_in_progress || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Zap className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">STAT Orders</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">{stats?.stat_orders || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed Today</p>
                {statsLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-bold">
                    {stats?.total_completed_today || 0}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Worklist */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Orders Worklist</CardTitle>
              <CardDescription>
                Orders pending imaging - sorted by priority and order time
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <Select
              value={modalityFilter}
              onValueChange={(v) => setModalityFilter(v as ImagingModality | '')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Modalities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Modalities</SelectItem>
                {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as ImagingPriority | '')}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Priority</SelectItem>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Order List */}
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
              <p className="text-destructive">Failed to load worklist</p>
              <Button variant="outline" className="mt-2" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No pending orders</p>
              <p className="text-sm">All caught up! Check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <WorklistOrderCard
                  key={order.id}
                  order={order}
                  onClick={() => handleOrderClick(order.order_number)}
                  onStart={(e) => handleStartOrder(order.order_number, e)}
                  isStarting={startOrder.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface WorklistOrderCardProps {
  order: ImagingOrder;
  onClick: () => void;
  onStart: (e: React.MouseEvent) => void;
  isStarting: boolean;
}

function WorklistOrderCard({
  order,
  onClick,
  onStart,
  isStarting,
}: WorklistOrderCardProps) {
  const isStatOrUrgent = order.priority === 'STAT' || order.priority === 'URGENT';

  return (
    <div
      className={cn(
        'p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50',
        order.priority === 'STAT' && 'border-red-300 bg-red-50/50',
        order.priority === 'URGENT' && 'border-orange-300 bg-orange-50/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{order.order_number}</span>
            <PriorityBadge priority={order.priority} />
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="flex items-center gap-2 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{order.patient_name || `Patient #${order.patient}`}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 text-sm bg-muted rounded px-2 py-1"
              >
                <ModalityBadge modality={item.modality} size="sm" showIcon={false} />
                <span className="text-muted-foreground">{item.procedure_name}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Ordered {formatRelativeTime(order.ordered_at)}
            </div>
            {order.scheduled_datetime && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Scheduled {formatDateTime(order.scheduled_datetime)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(order.status === 'ORDERED' || order.status === 'SCHEDULED') && (
            <Button
              size="sm"
              onClick={onStart}
              disabled={isStarting}
              className={cn(isStatOrUrgent && 'bg-red-600 hover:bg-red-700')}
            >
              {isStarting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Start
                </>
              )}
            </Button>
          )}
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

export default ImagingWorklist;

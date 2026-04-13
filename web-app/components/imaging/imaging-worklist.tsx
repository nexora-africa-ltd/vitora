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
    <div className="space-y-4 sm:space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-sky-500/15">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-sky-700 dark:text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Pending</p>
                {statsLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-10 sm:w-12" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">{stats?.total_pending || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/15">
                <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">In Progress</p>
                {statsLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-10 sm:w-12" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">{stats?.total_in_progress || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-destructive/15">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">STAT</p>
                {statsLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-10 sm:w-12" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">{stats?.stat_orders || 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 sm:pt-4 px-3 sm:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/15">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Today</p>
                {statsLoading ? (
                  <Skeleton className="h-6 sm:h-7 w-10 sm:w-12" />
                ) : (
                  <p className="text-xl sm:text-2xl font-bold">
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
        <CardHeader className="pb-2 sm:pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">Orders Worklist</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Orders pending imaging - sorted by priority and order time
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0 w-full sm:w-auto">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {/* Filters */}
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:mb-4">
            <Select
              value={modalityFilter}
              onValueChange={(v) => setModalityFilter(v as ImagingModality | '')}
            >
              <SelectTrigger className="w-full sm:w-[160px]">
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
              <SelectTrigger className="w-full sm:w-[130px]">
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
            <div className="space-y-2 sm:space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 sm:h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-6 sm:py-8">
              <AlertTriangle className="h-7 w-7 sm:h-8 sm:w-8 mx-auto text-destructive mb-2" />
              <p className="text-sm sm:text-base text-destructive">Failed to load worklist</p>
              <Button variant="outline" className="mt-2" size="sm" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 sm:py-12 text-muted-foreground">
              <Clock className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
              <p className="font-medium text-sm sm:text-base">No pending orders</p>
              <p className="text-xs sm:text-sm">All caught up! Check back later.</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
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
        'p-3 sm:p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50',
        order.priority === 'STAT' && 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10',
        order.priority === 'URGENT' && 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
      )}
      onClick={onClick}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
            <span className="font-mono font-medium text-sm sm:text-base">{order.order_number}</span>
            <PriorityBadge priority={order.priority} />
            <OrderStatusBadge status={order.status} />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
            <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{order.patient_name || `Patient #${order.patient}`}</span>
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {(order.items ?? []).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1 text-xs sm:text-sm bg-muted rounded px-1.5 sm:px-2 py-0.5 sm:py-1"
              >
                <ModalityBadge modality={item.modality} size="sm" showIcon={false} />
                <span className="text-muted-foreground truncate max-w-[120px] sm:max-w-none">{item.procedure_name}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>Ordered {formatRelativeTime(order.ordered_at)}</span>
            </div>
            {order.scheduled_datetime && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Scheduled {formatDateTime(order.scheduled_datetime)}</span>
                <span className="sm:hidden">Scheduled</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t sm:border-t-0 sm:pt-0 sm:flex-col sm:items-end">
          {(order.status === 'ORDERED' || order.status === 'SCHEDULED') && (
            <Button
              size="sm"
              onClick={onStart}
              disabled={isStarting}
              className={cn(
                'w-full sm:w-auto',
                order.priority === 'STAT' && 'bg-destructive hover:bg-destructive/90'
              )}
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
          <ChevronRight className="h-5 w-5 text-muted-foreground hidden sm:block" />
        </div>
      </div>
    </div>
  );
}

export default ImagingWorklist;

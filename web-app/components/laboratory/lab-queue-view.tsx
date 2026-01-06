'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  CheckCircle2,
  Clock,
  User,
  MoreHorizontal,
  Beaker,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { LabQueue, QueueStatus, LabPriority } from '@/lib/types/laboratory';
import { useLabQueue, useStartProcessing, useReleaseResults } from '@/lib/hooks/use-laboratory';
import { useToast } from '@/lib/hooks';
import { formatDateTime, formatRelativeTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { EmptyState } from '@/components/shared/empty-state';

interface LabQueueViewProps {
  defaultStatus?: QueueStatus | '';
}

const STATUS_CONFIG: Record<QueueStatus, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ComponentType<{ className?: string }>;
}> = {
  PENDING: { label: 'Pending', variant: 'outline', icon: Clock },
  COLLECTED: { label: 'Collected', variant: 'secondary', icon: Beaker },
  PROCESSING: { label: 'Processing', variant: 'default', icon: Play },
  REVIEW: { label: 'Review', variant: 'secondary', icon: User },
  RELEASED: { label: 'Released', variant: 'default', icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; className: string }> = {
  ROUTINE: { label: 'Routine', className: 'text-gray-600' },
  URGENT: { label: 'Urgent', className: 'text-orange-600 font-medium' },
  STAT: { label: 'STAT', className: 'text-red-600 font-bold' },
};

const STATUS_FILTERS: { value: QueueStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COLLECTED', label: 'Collected' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'RELEASED', label: 'Released' },
];

export function LabQueueView({ defaultStatus = '' }: LabQueueViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<QueueStatus | ''>(defaultStatus);

  const { data: queue, isLoading, error, refetch } = useLabQueue(statusFilter || undefined);
  const startProcessing = useStartProcessing();
  const releaseResults = useReleaseResults();

  const handleStartProcessing = async (queueNumber: string) => {
    try {
      await startProcessing.mutateAsync(queueNumber);
      toast({
        title: 'Processing started',
        description: 'Queue entry is now being processed.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to start processing',
        variant: 'destructive',
      });
    }
  };

  const handleReleaseResults = async (queueNumber: string) => {
    try {
      await releaseResults.mutateAsync(queueNumber);
      toast({
        title: 'Results released',
        description: 'Results have been released to the clinician.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to release results',
        variant: 'destructive',
      });
    }
  };

  // Count by status for summary cards
  const statusCounts = (queue || []).reduce((acc, item) => {
    acc[item.queue_status] = (acc[item.queue_status] || 0) + 1;
    return acc;
  }, {} as Record<QueueStatus, number>);

  if (error) {
    return (
      <EmptyState
        title="Error loading queue"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => refetch(),
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const StatusIcon = config.icon;
          const count = statusCounts[status as QueueStatus] || 0;
          
          return (
            <Card 
              key={status}
              className={cn(
                'cursor-pointer transition-colors hover:bg-muted/50',
                statusFilter === status && 'border-primary bg-primary/5'
              )}
              onClick={() => setStatusFilter(
                statusFilter === status ? '' : status as QueueStatus
              )}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{config.label}</p>
                  </div>
                  <StatusIcon className={cn(
                    'h-8 w-8 opacity-50',
                    config.variant === 'default' && 'text-green-500',
                    config.variant === 'secondary' && 'text-blue-500',
                  )} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lab Queue</CardTitle>
              <CardDescription>
                {queue?.length || 0} items in queue
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as QueueStatus | '')}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !queue || queue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Beaker className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No items in queue</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Sample</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const status = STATUS_CONFIG[item.queue_status];
                  const priority = PRIORITY_CONFIG[item.priority];
                  const StatusIcon = status.icon;

                  return (
                    <TableRow 
                      key={item.id}
                      className={cn(
                        item.priority === 'STAT' && 'bg-red-50',
                        item.priority === 'URGENT' && 'bg-orange-50',
                      )}
                    >
                      <TableCell className="font-mono text-sm">
                        {item.queue_number}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.patient_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.patient_mrn}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{item.sample_type}</p>
                          {item.sample_id && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.sample_id}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={priority.className}>{priority.label}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.assigned_technician_name || (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(item.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => router.push(`/laboratory/orders/${item.order_number}`)}
                            >
                              View Order
                            </DropdownMenuItem>
                            {item.queue_status === 'COLLECTED' && (
                              <DropdownMenuItem
                                onClick={() => handleStartProcessing(item.queue_number)}
                              >
                                <Play className="h-4 w-4 mr-2" />
                                Start Processing
                              </DropdownMenuItem>
                            )}
                            {item.queue_status === 'PROCESSING' && (
                              <DropdownMenuItem
                                onClick={() => router.push(
                                  `/laboratory/orders/${item.order_number}/results`
                                )}
                              >
                                Enter Results
                              </DropdownMenuItem>
                            )}
                            {item.queue_status === 'REVIEW' && (
                              <DropdownMenuItem
                                onClick={() => handleReleaseResults(item.queue_number)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Release Results
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

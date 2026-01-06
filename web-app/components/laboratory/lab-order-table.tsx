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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  Clock,
  FileText,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { LabOrder, LabOrderStatus, LabPriority } from '@/lib/types/laboratory';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils/cn';

interface LabOrderTableProps {
  orders: LabOrder[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onStatusFilter?: (status: LabOrderStatus | '') => void;
  onPriorityFilter?: (priority: LabPriority | '') => void;
  onSearch?: (query: string) => void;
  onRefresh?: () => void;
}

const STATUS_CONFIG: Record<LabOrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  ORDERED: { label: 'Ordered', variant: 'secondary' },
  SPECIMEN_COLLECTED: { label: 'Collected', variant: 'secondary' },
  IN_PROGRESS: { label: 'In Progress', variant: 'default' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
};

const PRIORITY_CONFIG: Record<LabPriority, { label: string; className: string }> = {
  ROUTINE: { label: 'Routine', className: 'text-gray-600' },
  URGENT: { label: 'Urgent', className: 'text-orange-600 font-medium' },
  STAT: { label: 'STAT', className: 'text-red-600 font-bold' },
};

export function LabOrderTable({
  orders,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onStatusFilter,
  onPriorityFilter,
  onSearch,
  onRefresh,
}: LabOrderTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery);
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setIsRefreshing(true);
      await onRefresh();
      setIsRefreshing(false);
    }
  };

  const hasCriticalResults = (order: LabOrder) => {
    return order.items?.some(item => item.result?.is_critical_result);
  };

  if (error) {
    return (
      <EmptyState
        title="Error loading lab orders"
        description={error.message}
        action={{
          label: 'Try again',
          onClick: () => window.location.reload(),
        }}
      />
    );
  }

  if (!isLoading && orders.length === 0) {
    return (
      <EmptyState
        title="No lab orders found"
        description="Try adjusting your filters or create a new lab order."
        action={{
          label: 'New Lab Order',
          onClick: () => router.push('/laboratory/orders/new'),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by patient or order #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-[300px]"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          {onStatusFilter && (
            <Select onValueChange={(value) => onStatusFilter(value as LabOrderStatus | '')}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {onPriorityFilter && (
            <Select onValueChange={(value) => onPriorityFilter(value as LabPriority | '')}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Priority</SelectItem>
                {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {onRefresh && (
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Tests</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              orders.map((order) => {
                const status = STATUS_CONFIG[order.status];
                const priority = PRIORITY_CONFIG[order.priority];
                const isCritical = hasCriticalResults(order);

                return (
                  <TableRow
                    key={order.id}
                    className={cn(
                      'cursor-pointer hover:bg-muted/50',
                      isCritical && 'bg-destructive/10 hover:bg-destructive/20'
                    )}
                    onClick={() => router.push(`/laboratory/orders/${order.order_number}`)}
                  >
                    <TableCell className="font-mono text-sm">
                      {order.order_number}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.patient_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {order.patient_mrn}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">
                          {order.items?.length || 0} test(s)
                        </span>
                        {order.items?.some(i => i.has_result) && (
                          <FileText className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={priority.className}>{priority.label}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {isCritical && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(order.created_at)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/laboratory/orders/${order.order_number}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

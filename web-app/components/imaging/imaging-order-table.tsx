/**
 * Imaging order table component.
 * Displays a list of imaging orders with filtering, pagination, and actions.
 */
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
  Eye,
  Calendar,
  User,
} from 'lucide-react';
import {
  ImagingOrder,
  ImagingOrderStatus,
  ImagingPriority,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from '@/lib/types/imaging';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { EmptyState } from '@/components/shared/empty-state';
import { OrderStatusBadge } from './order-status-badge';
import { PriorityBadge } from './priority-badge';
import { ModalityBadge } from './modality-badge';

interface ImagingOrderTableProps {
  orders: ImagingOrder[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onStatusFilter?: (status: ImagingOrderStatus | '') => void;
  onPriorityFilter?: (priority: ImagingPriority | '') => void;
  onSearch?: (query: string) => void;
}

export function ImagingOrderTable({
  orders,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onStatusFilter,
  onPriorityFilter,
  onSearch,
}: ImagingOrderTableProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery);
  };

  if (error) {
    return (
      <EmptyState
        title="Error loading imaging orders"
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
        title="No imaging orders found"
        description="Try adjusting your filters or create a new imaging order."
        action={{
          label: 'New Imaging Order',
          onClick: () => router.push('/imaging/orders/new'),
        }}
      />
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by order # or patient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </form>

        <div className="flex gap-2">
          <Select onValueChange={(v) => onStatusFilter?.(v as ImagingOrderStatus | '')}>
            <SelectTrigger className="flex-1 sm:w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(v) => onPriorityFilter?.(v as ImagingPriority | '')}>
            <SelectTrigger className="flex-1 sm:w-[130px]">
              <SelectValue placeholder="Priority" />
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
      </div>

      {/* Table - Scrollable on mobile */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[130px]">Order #</TableHead>
              <TableHead className="min-w-[120px]">Patient</TableHead>
              <TableHead className="min-w-[100px]">Procedures</TableHead>
              <TableHead className="min-w-[80px]">Priority</TableHead>
              <TableHead className="min-w-[90px]">Status</TableHead>
              <TableHead className="min-w-[100px]">Ordered</TableHead>
              <TableHead className="min-w-[100px]">Scheduled</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Loading skeleton
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : (
              orders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/imaging/orders/${order.order_number}`)}
                >
                  <TableCell className="font-mono text-xs sm:text-sm">
                    {order.order_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">{order.patient_name || `Patient #${order.patient}`}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.items.slice(0, 2).map((item) => (
                        <ModalityBadge
                          key={item.id}
                          modality={item.modality}
                          size="sm"
                        />
                      ))}
                      {order.items.length > 2 && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground">
                          +{order.items.length - 2}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={order.priority} />
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(order.ordered_at)}
                  </TableCell>
                  <TableCell>
                    {order.scheduled_datetime ? (
                      <div className="flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(order.scheduled_datetime)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/imaging/orders/${order.order_number}`);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="flex-1 sm:flex-none"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="flex-1 sm:flex-none"
            >
              <span className="hidden sm:inline mr-1">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ImagingOrderTable;

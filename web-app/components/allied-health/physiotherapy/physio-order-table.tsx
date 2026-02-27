/**
 * Physiotherapy Order Table
 * List view for physiotherapy orders
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { OrderStatusBadge, PriorityBadge, SessionCount } from '@/components/allied-health';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { usePhysioOrders } from '@/lib/hooks/use-physiotherapy';
import type { PhysiotherapyOrderListItem, PhysiotherapyOrderListParams } from '@/lib/types/physiotherapy';
import type { AlliedHealthOrderStatus, AlliedHealthPriority } from '@/lib/types/allied-health';

interface PhysioOrderTableProps {
  initialParams?: PhysiotherapyOrderListParams;
}

export function PhysioOrderTable({ initialParams }: PhysioOrderTableProps) {
  const router = useRouter();
  const [params, setParams] = useState<PhysiotherapyOrderListParams>({
    page: 1,
    page_size: 20,
    ...initialParams,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, error } = usePhysioOrders(params);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleStatusFilter = (status: string) => {
    setParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : (status as AlliedHealthOrderStatus),
      page: 1,
    }));
  };

  const handlePriorityFilter = (priority: string) => {
    setParams((prev) => ({
      ...prev,
      priority: priority === 'all' ? undefined : (priority as AlliedHealthPriority),
      page: 1,
    }));
  };

  const handleRowClick = (order: PhysiotherapyOrderListItem) => {
    router.push(`/allied-health/physiotherapy/orders/${order.id}`);
  };

  if (error) {
    return (
      <div className="p-4 text-center text-destructive">
        Failed to load orders: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders, patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Select onValueChange={handleStatusFilter} defaultValue="all">
            <SelectTrigger className="w-[140px]" aria-label="Status filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select onValueChange={handlePriorityFilter} defaultValue="all">
            <SelectTrigger className="w-[130px]" aria-label="Priority filter">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="EMERGENCY">Emergency</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="ROUTINE">Routine</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => router.push('/allied-health/physiotherapy/orders/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : !data || data.results.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="No physiotherapy orders match your criteria"
          action={{
            label: 'Create Order',
            onClick: () => router.push('/allied-health/physiotherapy/orders/new'),
          }}
        />
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Therapist</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(order)}
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
                      <div>
                        <div className="font-medium">{order.treatment_type_name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {order.assigned_therapist_name || (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SessionCount
                        completed={order.sessions_completed}
                        total={order.total_sessions}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={order.priority} />
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(order.ordered_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {data.results.length} of {data.count} orders
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!data.previous}
                onClick={() =>
                  setParams((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))
                }
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.next}
                onClick={() =>
                  setParams((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))
                }
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

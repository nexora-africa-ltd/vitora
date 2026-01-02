/**
 * Stock Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { format, formatDistanceToNow, isBefore, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertTriangle, XCircle, Clock, Settings } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StockBatch, StockStatus } from '@/lib/types/pharmacy';

interface StockTableProps {
  batches: StockBatch[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onStatusFilter: (status: StockStatus | '') => void;
}

// Status badge colors
const STATUS_COLORS: Record<StockStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  LOW: 'bg-yellow-100 text-yellow-800',
  OUT_OF_STOCK: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-red-100 text-red-800',
  QUARANTINE: 'bg-orange-100 text-orange-800',
  RECALLED: 'bg-purple-100 text-purple-800',
};

export function StockTable({
  batches,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onStatusFilter,
}: StockTableProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    onStatusFilter(value === 'all' ? '' : (value as StockStatus));
  };

  if (isLoading) {
    return (
      <div data-testid="stock-table-skeleton" className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {['Batch #', 'Drug', 'Available', 'Expiry Date', 'Status', 'Location'].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="space-y-4">
        <div className="max-w-xs">
          <Select value={selectedStatus} onValueChange={handleStatusChange}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="AVAILABLE">Available</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="QUARANTINE">Quarantine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No stock batches found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="max-w-xs">
        <Select value={selectedStatus} onValueChange={handleStatusChange}>
          <SelectTrigger aria-label="Filter by status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="OUT_OF_STOCK">Out of Stock</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="QUARANTINE">Quarantine</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch #</TableHead>
              <TableHead>Drug</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => {
              const expiryDate = new Date(batch.expiry_date);
              const isExpired = batch.is_expired;
              const isExpiringSoon = !isExpired && isBefore(expiryDate, addDays(new Date(), 90));

              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-mono text-sm">{batch.batch_number}</TableCell>
                  <TableCell className="font-medium">{batch.drug_name}</TableCell>
                  <TableCell>{batch.quantity_available}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{format(expiryDate, 'MMM d, yyyy')}</span>
                      {isExpired && (
                        <span data-testid="expired-indicator" title="Expired">
                          <XCircle className="h-4 w-4 text-destructive" />
                        </span>
                      )}
                      {isExpiringSoon && !isExpired && (
                        <span data-testid="expiry-warning" title="Expiring Soon">
                          <Clock className="h-4 w-4 text-yellow-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[batch.status]}>{batch.status}</Badge>
                  </TableCell>
                  <TableCell>{batch.location || '-'}</TableCell>
                  <TableCell>
                    {batch.status !== 'EXPIRED' && batch.status !== 'RECALLED' && (
                      <Button variant="ghost" size="sm">
                        <Settings className="h-4 w-4 mr-1" />
                        Adjust
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
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

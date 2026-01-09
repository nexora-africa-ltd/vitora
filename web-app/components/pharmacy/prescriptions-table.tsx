/**
 * Prescriptions Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Search, Eye, ChevronLeft, ChevronRight, Pill, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Prescription, PrescriptionStatus } from '@/lib/types/pharmacy';

interface PrescriptionsTableProps {
  prescriptions: Prescription[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onStatusFilter: (status: PrescriptionStatus | '') => void;
  onSearch: (query: string) => void;
  onDateFilter?: (dateFrom: string, dateTo: string) => void;
}

// Status badge colors
const STATUS_COLORS: Record<PrescriptionStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIAL: 'bg-blue-100 text-blue-800',
  DISPENSED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
  EXPIRED: 'bg-red-100 text-red-800',
};

// Status icons
const STATUS_ICONS: Record<PrescriptionStatus, typeof Clock> = {
  PENDING: Clock,
  PARTIAL: Pill,
  DISPENSED: CheckCircle,
  CANCELLED: XCircle,
  EXPIRED: XCircle,
};

export function PrescriptionsTable({
  prescriptions,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onStatusFilter,
  onSearch,
  onDateFilter,
}: PrescriptionsTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    onStatusFilter(value === 'all' ? '' : (value as PrescriptionStatus));
  };

  const handleTodayFilter = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setDateFrom(today);
    setDateTo(today);
    onDateFilter?.(today, today);
  };

  const handleDateChange = () => {
    if (dateFrom && dateTo) {
      onDateFilter?.(dateFrom, dateTo);
    } else if (!dateFrom && !dateTo) {
      // Clear date filter
      onDateFilter?.('', '');
    }
  };

  if (isLoading) {
    return (
      <div data-testid="prescriptions-table-skeleton" className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {['Rx #', 'Patient', 'Date', 'Items', 'Status', 'Actions'].map((header) => (
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

  if (prescriptions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search prescriptions..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={selectedStatus} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-48" aria-label="Filter by status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PARTIAL">Partial</SelectItem>
              <SelectItem value="DISPENSED">Dispensed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="From date"
            data-testid="date-from"
            placeholder="From"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setTimeout(handleDateChange, 100);
            }}
            className="w-40"
          />
          <Input
            type="date"
            aria-label="To date"
            data-testid="date-to"
            placeholder="To"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setTimeout(handleDateChange, 100);
            }}
            className="w-40"
          />
          <Button
            variant="outline"
            onClick={handleTodayFilter}
            data-testid="today-filter"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Today
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No prescriptions found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search prescriptions..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedStatus} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="DISPENSED">Dispensed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="From date"
          data-testid="date-from"
          placeholder="From"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setTimeout(handleDateChange, 100);
          }}
          className="w-40"
        />
        <Input
          type="date"
          aria-label="To date"
          data-testid="date-to"
          placeholder="To"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setTimeout(handleDateChange, 100);
          }}
          className="w-40"
        />
        <Button
          variant="outline"
          onClick={handleTodayFilter}
          data-testid="today-filter"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Today
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border" data-testid="prescriptions-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rx #</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>MRN</TableHead>
              <TableHead>Prescriber</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescriptions.map((rx) => {
              const StatusIcon = STATUS_ICONS[rx.status];

              return (
                <TableRow key={rx.id}>
                  <TableCell className="font-mono text-sm">{rx.prescription_number}</TableCell>
                  <TableCell className="font-medium">{rx.patient_name}</TableCell>
                  <TableCell className="text-muted-foreground">{rx.patient_mrn}</TableCell>
                  <TableCell>{rx.prescriber_name}</TableCell>
                  <TableCell>{format(new Date(rx.prescribed_date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Pill className="h-4 w-4 text-muted-foreground" />
                      <span>{rx.items.length} items</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[rx.status]} data-testid="status-badge">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {rx.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/pharmacy/prescriptions/${rx.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
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

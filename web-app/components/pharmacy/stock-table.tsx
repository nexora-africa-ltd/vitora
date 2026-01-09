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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  onDrugFilter?: (drugId: number | '') => void;
  onLocationFilter?: (location: string) => void;
  onSearchFilter?: (search: string) => void;
  onExpiringSoonFilter?: (enabled: boolean) => void;
  drugs?: { id: number; display_name: string }[];
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
  onDrugFilter,
  onLocationFilter,
  onSearchFilter,
  onExpiringSoonFilter,
  drugs = [],
}: StockTableProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedDrug, setSelectedDrug] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expiringSoonEnabled, setExpiringSoonEnabled] = useState(false);

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    onStatusFilter(value === 'all' ? '' : (value as StockStatus));
  };

  const handleDrugChange = (value: string) => {
    setSelectedDrug(value);
    if (onDrugFilter) {
      onDrugFilter(value === 'all' ? '' : parseInt(value));
    }
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    if (onLocationFilter) {
      onLocationFilter(value === 'all' ? '' : value);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (onSearchFilter) {
      onSearchFilter(value);
    }
  };

  const handleExpiringSoonToggle = (checked: boolean) => {
    setExpiringSoonEnabled(checked);
    if (onExpiringSoonFilter) {
      onExpiringSoonFilter(checked);
    }
  };

  // Get unique locations from batches for location filter
  const uniqueLocations = Array.from(new Set(batches.map(b => b.location).filter(Boolean)));


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
                {['Batch #', 'Drug', 'Available', 'Expiry Date', 'Days to Expiry', 'Status', 'Supplier', 'Selling Price', 'Location', 'Actions'].map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((j) => (
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
        {/* Show filters even when no results */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input
              placeholder="Search by batch number..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="w-48">
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
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">No stock batches found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            placeholder="Search by batch number..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-testid="batch-search"
          />
        </div>

        {/* Status Filter */}
        <div className="w-48">
          <Select value={selectedStatus} onValueChange={handleStatusChange}>
            <SelectTrigger aria-label="Filter by status" data-testid="status-filter">
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

        {/* Drug Filter */}
        {drugs.length > 0 && (
          <div className="w-48">
            <Select value={selectedDrug} onValueChange={handleDrugChange}>
              <SelectTrigger aria-label="Filter by drug" data-testid="drug-filter">
                <SelectValue placeholder="Filter by drug" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drugs</SelectItem>
                {drugs.map((drug) => (
                  <SelectItem key={drug.id} value={drug.id.toString()}>
                    {drug.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Location Filter */}
        {uniqueLocations.length > 0 && (
          <div className="w-48">
            <Select value={selectedLocation} onValueChange={handleLocationChange}>
              <SelectTrigger aria-label="Filter by location" data-testid="location-filter">
                <SelectValue placeholder="Filter by location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {uniqueLocations.map((location) => (
                  <SelectItem key={location} value={location!}>
                    {location}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Expiring Soon Filter */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="expiring-soon"
            checked={expiringSoonEnabled}
            onCheckedChange={handleExpiringSoonToggle}
            data-testid="expiring-filter"
          />
          <label
            htmlFor="expiring-soon"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Expiring Soon
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border" data-testid="stock-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch #</TableHead>
              <TableHead>Drug</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Expiry Date</TableHead>
              <TableHead>Days to Expiry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Selling Price</TableHead>
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
                <TableRow key={batch.id} className={batch.status === 'LOW' ? 'bg-yellow-50' : batch.status === 'EXPIRED' ? 'bg-red-50' : ''}>
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
                  <TableCell>{batch.days_to_expiry}</TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_COLORS[batch.status]} ${batch.status === 'LOW' ? 'warning' : batch.status === 'EXPIRED' ? 'destructive' : ''}`}>{batch.status}</Badge>
                  </TableCell>
                  <TableCell>{batch.supplier || '-'}</TableCell>
                  <TableCell>KES {Number(batch.selling_price).toFixed(2)}</TableCell>
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

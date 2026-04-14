/**
 * Stock Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Responsive table using ResponsiveTable component with mobile card layout.
 */

'use client';

import { useState } from 'react';
import { format, isBefore, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertTriangle, XCircle, Clock, MoreVertical, Filter, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { StockBatch, StockStatus, AdjustmentType } from '@/lib/types/pharmacy';
import { BatchDetailDialog } from './batch-detail-dialog';
import { StockAdjustmentDialog } from './stock-adjustment-dialog';

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

// Status badge colors using semantic classes
const STATUS_COLORS: Record<StockStatus, string> = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  LOW: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  OUT_OF_STOCK: 'bg-destructive/15 text-destructive',
  EXPIRED: 'bg-destructive/15 text-destructive',
  QUARANTINE: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  RECALLED: 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
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
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType | undefined>();
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

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

  const handleExpiringSoonToggle = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    setExpiringSoonEnabled(isChecked);
    if (onExpiringSoonFilter) {
      onExpiringSoonFilter(isChecked);
    }
  };

  // Get unique locations from batches for location filter
  const uniqueLocations = Array.from(new Set(batches.map(b => b.location).filter(Boolean)));

  const handleBatchClick = (batch: StockBatch) => {
    setSelectedBatch(batch);
    setDetailDialogOpen(true);
  };

  const handleAdjustmentAction = (batch: StockBatch, type?: AdjustmentType) => {
    setSelectedBatch(batch);
    setAdjustmentType(type);
    setAdjustmentDialogOpen(true);
  };

  const handleExpirySort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  // Sort batches by expiry date
  const sortedBatches = [...batches].sort((a, b) => {
    const dateA = new Date(a.expiry_date).getTime();
    const dateB = new Date(b.expiry_date).getTime();
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  if (isLoading) {
    return (
      <div data-testid="stock-table-skeleton" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Skeleton className="h-10 w-full sm:w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
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

  // Mobile card renderer
  const renderMobileCard = (batch: StockBatch) => {
    const expiryDate = new Date(batch.expiry_date);
    const isExpired = batch.is_expired;
    const isExpiringSoon = !isExpired && isBefore(expiryDate, addDays(new Date(), 90));

    return (
      <Card
        className={`p-4 space-y-3 ${batch.status === 'LOW' ? 'border-amber-500/50' : batch.status === 'EXPIRED' ? 'border-destructive/50' : ''}`}
        onClick={() => handleBatchClick(batch)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{batch.drug_name}</p>
            <p className="text-sm text-muted-foreground font-mono">{batch.batch_number}</p>
          </div>
          <Badge className={STATUS_COLORS[batch.status]}>
            {batch.status === 'OUT_OF_STOCK' ? 'OOS' : batch.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Available:</span>
            <span className="ml-1 font-medium">{batch.quantity_available}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Price:</span>
            <span className="ml-1 font-medium">KES {Number(batch.selling_price).toFixed(0)}</span>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Expires:</span>
            <span className="ml-1 font-medium">{format(expiryDate, 'MMM d, yyyy')}</span>
            {isExpired && <XCircle className="h-3.5 w-3.5 text-destructive inline ml-1" />}
            {isExpiringSoon && !isExpired && <Clock className="h-3.5 w-3.5 text-amber-500 inline ml-1" />}
            <span className="text-muted-foreground ml-2">({batch.days_to_expiry} days)</span>
          </div>
        </div>

        {batch.status !== 'EXPIRED' && batch.status !== 'RECALLED' && (
          <div className="flex justify-end pt-2 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Actions
                  <MoreVertical className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch); }}>
                  Adjust Stock
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch, 'EXPIRED'); }}>
                  Mark as Expired
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch, 'DAMAGED'); }}>
                  Mark as Damaged
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </Card>
    );
  };

  const columns = [
    {
      key: 'batch_number',
      header: 'Batch #',
      cell: (batch: StockBatch) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleBatchClick(batch); }}
          className="text-primary hover:text-primary/80 hover:underline font-mono text-sm"
        >
          {batch.batch_number}
        </button>
      ),
    },
    {
      key: 'drug_name',
      header: 'Drug',
      cell: (batch: StockBatch) => <span className="font-medium">{batch.drug_name}</span>,
    },
    {
      key: 'quantity_available',
      header: 'Available',
    },
    {
      key: 'expiry_date',
      header: 'Expiry Date',
      cell: (batch: StockBatch) => {
        const expiryDate = new Date(batch.expiry_date);
        const isExpired = batch.is_expired;
        const isExpiringSoon = !isExpired && isBefore(expiryDate, addDays(new Date(), 90));
        return (
          <div className="flex items-center gap-2">
            <span>{format(expiryDate, 'MMM d, yyyy')}</span>
            {isExpired && <XCircle className="h-4 w-4 text-destructive" data-testid="expired-indicator" />}
            {isExpiringSoon && !isExpired && <Clock className="h-4 w-4 text-amber-500" data-testid="expiry-warning" />}
          </div>
        );
      },
      hideOnMobile: true,
    },
    {
      key: 'days_to_expiry',
      header: 'Days',
      hideOnMobile: true,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (batch: StockBatch) => (
        <Badge className={STATUS_COLORS[batch.status]}>
          {batch.status === 'OUT_OF_STOCK' ? 'OOS' : batch.status}
        </Badge>
      ),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      cell: (batch: StockBatch) => batch.supplier || '-',
      hideOnMobile: true,
    },
    {
      key: 'selling_price',
      header: 'Price',
      cell: (batch: StockBatch) => `KES ${Number(batch.selling_price).toFixed(2)}`,
      hideOnMobile: true,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (batch: StockBatch) => batch.location || '-',
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (batch: StockBatch) => (
        batch.status !== 'EXPIRED' && batch.status !== 'RECALLED' ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="More actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch); }}>
                Adjust Stock
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch, 'EXPIRED'); }}>
                Mark as Expired
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch, 'DAMAGED'); }}>
                Mark as Damaged
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleAdjustmentAction(batch); }}>
                Quarantine
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      ),
      className: 'w-[80px]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search by batch number..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="batch-search"
            />
          </div>
          <div className="flex gap-2">
            <Select value={selectedStatus} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status" data-testid="status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="OUT_OF_STOCK">OOS</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="QUARANTINE">Quarantine</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              className="shrink-0"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 border rounded-lg bg-muted/30">
            {drugs.length > 0 && (
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
            )}

            {uniqueLocations.length > 0 && (
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
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="expiring-soon"
                checked={expiringSoonEnabled}
                onCheckedChange={handleExpiringSoonToggle}
                data-testid="expiring-filter"
              />
              <Label htmlFor="expiring-soon" className="text-sm cursor-pointer">
                Expiring Soon
              </Label>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExpirySort}
              className="w-full sm:w-auto"
            >
              Sort by Expiry {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div data-testid="stock-table">
        <ResponsiveTable
          data={sortedBatches}
          columns={columns}
          keyExtractor={(batch) => batch.id}
          onRowClick={handleBatchClick}
          mobileCard={renderMobileCard}
          emptyMessage="No stock batches found"
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground text-center sm:text-left">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 1}
              className="flex-1 sm:flex-none"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="flex-1 sm:flex-none"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Batch Detail Dialog */}
      <BatchDetailDialog
        batch={selectedBatch}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        batch={selectedBatch}
        open={adjustmentDialogOpen}
        onOpenChange={setAdjustmentDialogOpen}
        defaultAdjustmentType={adjustmentType}
        onSuccess={() => {
          // Optionally refresh the data here
        }}
      />
    </div>
  );
}

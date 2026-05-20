/**
 * Dispensing History Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module - Phase 2
 *
 * Responsive table using ResponsiveTable component with mobile card layout.
 * Shows drug name, patient, quantity, batch, dispensed by, date, and cost.
 */

'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import {
  Calendar,
  User,
  Pill,
  Package,
  Filter,
  RotateCcw,
  Printer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Dispensing } from '@/lib/types/pharmacy';
import { ReturnDialog } from './dispensing/return-dialog';
import { LabelDialog } from './dispensing/label-dialog';

interface DispensingHistoryTableProps {
  dispensings: Dispensing[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPatientFilter?: (patientId: string) => void;
  onDrugFilter?: (drugId: string) => void;
  onDateRangeFilter?: (from: string, to: string) => void;
  onRefresh?: () => void;
}

export function DispensingHistoryTable({
  dispensings,
  isLoading,
  error,
  page,
  totalPages,
  onPageChange,
  onPatientFilter,
  onDrugFilter,
  onDateRangeFilter,
  onRefresh,
}: DispensingHistoryTableProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [drugSearch, setDrugSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [returnDialog, setReturnDialog] = useState<{ isOpen: boolean; dispensing: Dispensing | null }>({
    isOpen: false,
    dispensing: null,
  });
  const [labelDialog, setLabelDialog] = useState<{ isOpen: boolean; dispensing: Dispensing | null }>({
    isOpen: false,
    dispensing: null,
  });

  const handleApplyFilters = () => {
    if (onPatientFilter && patientSearch) {
      onPatientFilter(patientSearch);
    }
    if (onDrugFilter && drugSearch) {
      onDrugFilter(drugSearch);
    }
    if (onDateRangeFilter && (dateFrom || dateTo)) {
      onDateRangeFilter(dateFrom, dateTo);
    }
  };

  const handleClearFilters = () => {
    setPatientSearch('');
    setDrugSearch('');
    setDateFrom('');
    setDateTo('');
    if (onPatientFilter) onPatientFilter('');
    if (onDrugFilter) onDrugFilter('');
    if (onDateRangeFilter) onDateRangeFilter('', '');
  };

  if (isLoading) {
    return (
      <div data-testid="dispensing-history-skeleton" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-9 w-full sm:w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  // Mobile card renderer
  const renderMobileCard = (dispensing: Dispensing) => (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Drug and Patient */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{dispensing.drug_name}</p>
            {dispensing.drug_code && (
              <p className="text-xs text-muted-foreground font-mono">{dispensing.drug_code}</p>
            )}
          </div>
          <Badge variant="outline" className="font-mono shrink-0">
            x{dispensing.quantity}
          </Badge>
        </div>

        {/* Patient info */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate">{dispensing.patient_name}</span>
          {dispensing.patient_mrn && (
            <span className="text-muted-foreground shrink-0">({dispensing.patient_mrn})</span>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground">Batch:</span>
            <span className="ml-1 font-mono">{dispensing.batch_number}</span>
          </div>
          <div>
            <span className="text-muted-foreground">By:</span>
            <span className="ml-1">{dispensing.dispensed_by_name}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span>
            <span className="ml-1">{formatDateTime(dispensing.dispensed_at, 'MMM d, h:mm a')}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Cost:</span>
            <span className="ml-1 font-medium">KSh {Number(dispensing.total_price).toFixed(0)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setReturnDialog({ isOpen: true, dispensing })}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Return
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setLabelDialog({ isOpen: true, dispensing })}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />
            Label
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Desktop table columns
  const columns = [
    {
      key: 'drug_name',
      header: 'Item',
      cell: (dispensing: Dispensing) => (
        <div>
          <p className="font-medium">{dispensing.drug_name}</p>
          {dispensing.drug_code && (
            <p className="text-xs text-muted-foreground">{dispensing.drug_code}</p>
          )}
        </div>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      cell: (dispensing: Dispensing) => (
        <div>
          <p className="font-medium">{dispensing.patient_name}</p>
          {dispensing.patient_mrn && (
            <p className="text-xs text-muted-foreground">{dispensing.patient_mrn}</p>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      cell: (dispensing: Dispensing) => (
        <Badge variant="outline" className="font-mono">
          {dispensing.quantity}
        </Badge>
      ),
    },
    {
      key: 'batch_number',
      header: 'Batch',
      cell: (dispensing: Dispensing) => (
        <span className="font-mono text-sm">{dispensing.batch_number}</span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'dispensed_by_name',
      header: 'Dispensed By',
      hideOnMobile: true,
    },
    {
      key: 'dispensed_at',
      header: 'Date',
      cell: (dispensing: Dispensing) => (
        <div className="text-sm">
          <p>{formatDate(dispensing.dispensed_at)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDateTime(dispensing.dispensed_at, 'h:mm a')}
          </p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'total_price',
      header: 'Cost',
      cell: (dispensing: Dispensing) => (
        <div>
          <p className="font-medium">KSh {Number(dispensing.total_price).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">
            @ {Number(dispensing.unit_price).toFixed(2)}
          </p>
        </div>
      ),
      hideOnMobile: true,
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (dispensing: Dispensing) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReturnDialog({ isOpen: true, dispensing })}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            <span className="hidden lg:inline">Return</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLabelDialog({ isOpen: true, dispensing })}
          >
            <Printer className="h-3.5 w-3.5 mr-1" />
            <span className="hidden lg:inline">Label</span>
          </Button>
        </div>
      ),
      className: 'w-[140px]',
    },
  ];

  // Filter panel content
  const filterContent = (
    <div className="grid grid-cols-1 gap-4 p-4 border rounded-md bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label htmlFor="patient-filter" className="flex items-center gap-2">
          <User className="h-4 w-4" />
          Patient
        </Label>
        <Input
          id="patient-filter"
          data-testid="patient-filter"
          placeholder="Name or MRN..."
          value={patientSearch}
          onChange={(e) => setPatientSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="drug-filter" className="flex items-center gap-2">
          <Pill className="h-4 w-4" />
          Item
        </Label>
        <Input
          id="drug-filter"
          data-testid="drug-filter"
          placeholder="Item name..."
          value={drugSearch}
          onChange={(e) => setDrugSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2 sm:col-span-2 lg:col-span-1">
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Date Range
        </Label>
        <div className="flex gap-2">
          <DatePicker
            value={dateFrom ? parseISO(dateFrom) : undefined}
            onChange={(date) => setDateFrom(date ? format(date, 'yyyy-MM-dd') : '')}
            placeholder="From"
          />
          <DatePicker
            value={dateTo ? parseISO(dateTo) : undefined}
            onChange={(date) => setDateTo(date ? format(date, 'yyyy-MM-dd') : '')}
            placeholder="To"
          />
        </div>
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
        <Button onClick={handleApplyFilters} className="flex-1 lg:flex-initial">
          Apply
        </Button>
        <Button variant="outline" onClick={handleClearFilters} className="flex-1 lg:flex-initial">
          Clear
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header and Filters Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold sm:text-lg">Dispensing History</h3>
        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{showFilters ? 'Hide' : 'Show'}</span> Filters
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Filters */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          {filterContent}
        </CollapsibleContent>
      </Collapsible>

      {/* Table / Cards */}
      <ResponsiveTable
        data={dispensings}
        columns={columns}
        keyExtractor={(d) => d.id}
        mobileCard={(d) => renderMobileCard(d)}
        emptyMessage="No dispensing records found. Records will appear here after drugs are dispensed."
      />

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
              className="flex-1 sm:flex-initial"
            >
              <ChevronLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
              className="flex-1 sm:flex-initial"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Return Dialog */}
      <ReturnDialog
        isOpen={returnDialog.isOpen}
        onClose={() => setReturnDialog({ isOpen: false, dispensing: null })}
        dispensing={returnDialog.dispensing}
        onSuccess={onRefresh}
      />

      {/* Label Dialog */}
      <LabelDialog
        isOpen={labelDialog.isOpen}
        onClose={() => setLabelDialog({ isOpen: false, dispensing: null })}
        dispensing={labelDialog.dispensing}
      />
    </div>
  );
}

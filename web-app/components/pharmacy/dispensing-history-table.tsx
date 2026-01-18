/**
 * Dispensing History Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module - Phase 2
 *
 * Displays dispensing records with filtering capabilities.
 * Shows drug name, patient, quantity, batch, dispensed by, date, and cost.
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Search, Calendar, User, Pill, Package, DollarSign, Filter, RotateCcw, Printer } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {['Drug', 'Patient', 'Quantity', 'Batch', 'Dispensed By', 'Date', 'Cost', 'Actions'].map(
                  (header) => (
                    <TableHead key={header}>{header}</TableHead>
                  )
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
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
        <Package className="h-12 w-12 text-destructive mb-4" />
        <p className="text-destructive">{error.message}</p>
      </div>
    );
  }

  if (dispensings.length === 0) {
    return (
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Dispensing History</h3>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4 mr-2" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="patient-filter">
                <User className="h-4 w-4 inline mr-2" />
                Patient
              </Label>
              <Input
                id="patient-filter"
                data-testid="patient-filter"
                placeholder="Search by patient name or MRN..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="drug-filter">
                <Pill className="h-4 w-4 inline mr-2" />
                Drug
              </Label>
              <Input
                id="drug-filter"
                data-testid="drug-filter"
                placeholder="Search by drug name..."
                value={drugSearch}
                onChange={(e) => setDrugSearch(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date-from">
                <Calendar className="h-4 w-4 inline mr-2" />
                Date Range
              </Label>
              <div className="flex gap-2">
                <Input
                  id="date-from"
                  data-testid="date-filter"
                  type="date"
                  placeholder="From"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <Input
                  id="date-to"
                  type="date"
                  placeholder="To"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="md:col-span-3 flex gap-2">
              <Button onClick={handleApplyFilters}>Apply Filters</Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No dispensing records found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Dispensing records will appear here after drugs are dispensed
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and Filters Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Dispensing History</h3>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4 mr-2" />
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="patient-filter">
              <User className="h-4 w-4 inline mr-2" />
              Patient
            </Label>
            <Input
              id="patient-filter"
              data-testid="patient-filter"
              placeholder="Search by patient name or MRN..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="drug-filter">
              <Pill className="h-4 w-4 inline mr-2" />
              Drug
            </Label>
            <Input
              id="drug-filter"
              data-testid="drug-filter"
              placeholder="Search by drug name..."
              value={drugSearch}
              onChange={(e) => setDrugSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date-from">
              <Calendar className="h-4 w-4 inline mr-2" />
              Date Range
            </Label>
            <div className="flex gap-2">
              <Input
                id="date-from"
                data-testid="date-filter"
                type="date"
                placeholder="From"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                id="date-to"
                type="date"
                placeholder="To"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="md:col-span-3 flex gap-2">
            <Button onClick={handleApplyFilters}>Apply Filters</Button>
            <Button variant="outline" onClick={handleClearFilters}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Drug</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Dispensed By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispensings.map((dispensing) => (
              <TableRow key={dispensing.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{dispensing.drug_name}</p>
                    {dispensing.drug_code && (
                      <p className="text-xs text-muted-foreground">{dispensing.drug_code}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{dispensing.patient_name}</p>
                    {dispensing.patient_mrn && (
                      <p className="text-xs text-muted-foreground">{dispensing.patient_mrn}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {dispensing.quantity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{dispensing.batch_number}</span>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{dispensing.dispensed_by_name}</span>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <p>{format(new Date(dispensing.dispensed_at), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(dispensing.dispensed_at), 'h:mm a')}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">KSh {Number(dispensing.total_price).toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      @ {Number(dispensing.unit_price).toFixed(2)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReturnDialog({ isOpen: true, dispensing })}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Return
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLabelDialog({ isOpen: true, dispensing })}
                    >
                      <Printer className="h-3 w-3 mr-1" />
                      Print Label
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
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
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page === totalPages}
            >
              Next
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

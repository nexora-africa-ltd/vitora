/**
 * Prescriptions Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Pill,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Package,
} from 'lucide-react';
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
import { Prescription, PrescriptionStatus, PrescriptionItem } from '@/lib/types/pharmacy';
import { DispenseDialog } from './dispensing/dispense-dialog';

interface PrescriptionsTableProps {
  prescriptions: Prescription[];
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onStatusFilter: (status: PrescriptionStatus | '') => void;
  onSearch: (query: string) => void;
}

// Status badge colors using semantic classes
const STATUS_COLORS: Record<PrescriptionStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PARTIAL: 'bg-primary/15 text-primary',
  DISPENSED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  CANCELLED: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-destructive/15 text-destructive',
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
}: PrescriptionsTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [dispenseDialog, setDispenseDialog] = useState<{
    isOpen: boolean;
    prescription: Prescription | null;
    prescriptionItem: PrescriptionItem | null;
  }>({
    isOpen: false,
    prescription: null,
    prescriptionItem: null,
  });

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const handleStatusChange = (value: string) => {
    setSelectedStatus(value);
    onStatusFilter(value === 'all' ? '' : (value as PrescriptionStatus));
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
        <div className="flex items-center gap-4">
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
      <div className="flex items-center gap-4">
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
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
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
              const isExpanded = expandedRows.has(rx.id);
              const canDispense = ['PENDING', 'PARTIAL'].includes(rx.status);

              return (
                <>
                  {/* Main Row */}
                  <TableRow
                    key={rx.id}
                    className={canDispense ? 'cursor-pointer hover:bg-muted/50' : ''}
                    onClick={canDispense ? () => {
                      const newExpanded = new Set(expandedRows);
                      if (isExpanded) {
                        newExpanded.delete(rx.id);
                      } else {
                        newExpanded.add(rx.id);
                      }
                      setExpandedRows(newExpanded);
                    } : undefined}
                  >
                    <TableCell>
                      {canDispense && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newExpanded = new Set(expandedRows);
                            if (isExpanded) {
                              newExpanded.delete(rx.id);
                            } else {
                              newExpanded.add(rx.id);
                            }
                            setExpandedRows(newExpanded);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
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
                      <Badge className={STATUS_COLORS[rx.status]}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {rx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/pharmacy/prescriptions/${rx.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Items Row */}
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={9} className="bg-muted/30">
                        <div className="py-4 space-y-3">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Prescription Items
                          </h4>
                          <div className="space-y-2">
                            {rx.items.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 border rounded-md bg-background"
                              >
                                <div className="flex-1">
                                  <p className="font-medium">{item.drug_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {item.dosage} • {item.frequency} • {item.duration}
                                  </p>
                                  {item.instructions && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {item.instructions}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 text-xs">
                                    <span>
                                      Prescribed: <strong>{item.quantity_prescribed}</strong>
                                    </span>
                                    <span>
                                      Dispensed: <strong>{item.quantity_dispensed}</strong>
                                    </span>
                                    <span>
                                      Remaining:{' '}
                                      <strong className="text-primary">{item.remaining_quantity}</strong>
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  {item.remaining_quantity > 0 && !item.is_cancelled ? (
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        setDispenseDialog({
                                          isOpen: true,
                                          prescription: rx,
                                          prescriptionItem: item,
                                        });
                                      }}
                                    >
                                      <Pill className="h-4 w-4 mr-2" />
                                      Dispense
                                    </Button>
                                  ) : item.is_cancelled ? (
                                    <Badge variant="outline">Cancelled</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Fully Dispensed
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dispense Dialog */}
      {dispenseDialog.isOpen && dispenseDialog.prescription && dispenseDialog.prescriptionItem && (
        <DispenseDialog
          isOpen={dispenseDialog.isOpen}
          onClose={() =>
            setDispenseDialog({
              isOpen: false,
              prescription: null,
              prescriptionItem: null,
            })
          }
          prescription={dispenseDialog.prescription}
          prescriptionItem={dispenseDialog.prescriptionItem}
          onSuccess={() => {
            // Refresh prescription data is handled by React Query cache invalidation
          }}
        />
      )}

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

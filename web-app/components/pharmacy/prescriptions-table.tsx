/**
 * Prescriptions Table Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Responsive table using ResponsiveTable component with mobile card layout.
 */

'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/utils/format';
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
  Filter,
  AlertTriangle,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Prescription, PrescriptionStatus, PrescriptionItem } from '@/lib/types/pharmacy';
import { DispenseDialog } from './dispensing/dispense-dialog';
import { ActionButton } from '@/components/shared/action-button';

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
  const [showFilters, setShowFilters] = useState(false);
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

  const toggleExpanded = (id: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  if (isLoading) {
    return (
      <div data-testid="prescriptions-table-skeleton" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-full sm:w-64" />
          <Skeleton className="h-10 w-full sm:w-48" />
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

  // Mobile card renderer for prescriptions
  const renderMobileCard = (rx: Prescription) => {
    const displayStatus = rx.effective_status ?? rx.status;
    const StatusIcon = STATUS_ICONS[displayStatus];
    const canDispense = ['PENDING', 'PARTIAL'].includes(displayStatus);
    const isExpanded = expandedRows.has(rx.id);

    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {/* Main content */}
          <div
            className={`p-4 ${canDispense ? 'cursor-pointer active:bg-muted/50' : ''}`}
            onClick={canDispense ? () => toggleExpanded(rx.id) : undefined}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {rx.prescription_number}
                  </span>
                  <Badge className={`${STATUS_COLORS[displayStatus]} shrink-0`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {displayStatus}
                  </Badge>
                </div>
                <p className="font-medium truncate">{rx.patient_name}</p>
                <p className="text-sm text-muted-foreground">{rx.patient_mrn}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm">{formatDate(rx.prescribed_date, 'MMM d')}</p>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Pill className="h-3.5 w-3.5" />
                  <span>{rx.items?.length ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Prescriber */}
            <p className="text-xs text-muted-foreground mt-2">
              By: {rx.prescriber_name}
            </p>

            {/* Actions row */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/pharmacy/prescriptions/${rx.id}`);
                }}
              >
                <Eye className="h-4 w-4 mr-1.5" />
                View
              </Button>
              {canDispense && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(rx.id);
                  }}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Hide Items
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show Items
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Expanded items section */}
          {isExpanded && (
            <div className="border-t bg-muted/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Prescription Items
              </h4>
              <div className="space-y-2">
                {(rx.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 border rounded-md bg-background space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.drug_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.dosage} • {item.frequency}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.duration}</p>
                      </div>
                      {item.remaining_quantity > 0 && !item.is_cancelled ? (
                        <ActionButton
                          action="pharmacy.dispense"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDispenseDialog({
                              isOpen: true,
                              prescription: rx,
                              prescriptionItem: item,
                            });
                          }}
                        >
                          <Pill className="h-3.5 w-3.5 mr-1" />
                          Dispense
                        </ActionButton>
                      ) : item.is_cancelled ? (
                        <Badge variant="outline" className="shrink-0">Cancelled</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      <span>Rx: <strong>{item.quantity_prescribed}</strong></span>
                      <span>Given: <strong>{item.quantity_dispensed}</strong></span>
                      <span>Left: <strong className="text-primary">{item.remaining_quantity}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Desktop table columns
  const columns = [
    {
      key: 'expand',
      header: '',
      cell: (rx: Prescription) => {
        const displayStatus = rx.effective_status ?? rx.status;
        const canDispense = ['PENDING', 'PARTIAL'].includes(displayStatus);
        const isExpanded = expandedRows.has(rx.id);
        return canDispense ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(rx.id);
            }}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        ) : null;
      },
      className: 'w-[50px]',
    },
    {
      key: 'prescription_number',
      header: 'Rx #',
      sortable: true,
      cell: (rx: Prescription) => (
        <span className="font-mono text-sm">{rx.prescription_number}</span>
      ),
    },
    {
      key: 'patient_name',
      header: 'Patient',
      sortable: true,
      cell: (rx: Prescription) => (
        <div>
          <p className="font-medium">{rx.patient_name}</p>
          <p className="text-xs text-muted-foreground">{rx.patient_mrn}</p>
        </div>
      ),
    },
    {
      key: 'prescriber_name',
      header: 'Prescriber',
      hideOnMobile: true,
    },
    {
      key: 'prescribed_date',
      header: 'Date',
      sortable: true,
      sortType: 'date' as const,
      cell: (rx: Prescription) => formatDate(rx.prescribed_date),
      hideOnMobile: true,
    },
    {
      key: 'items',
      header: 'Items',
      cell: (rx: Prescription) => (
        <div className="flex items-center gap-1">
          <Pill className="h-4 w-4 text-muted-foreground" />
          <span>{rx.items?.length ?? 0}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      cell: (rx: Prescription) => {
        const displayStatus = rx.effective_status ?? rx.status;
        const StatusIcon = STATUS_ICONS[displayStatus];
        const daysLeft = rx.days_until_expiry;
        const isExpiringSoon = daysLeft != null && daysLeft >= 0 && daysLeft <= 7;
        return (
          <div className="flex items-center gap-1.5">
            <Badge className={STATUS_COLORS[displayStatus]}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {displayStatus}
            </Badge>
            {isExpiringSoon && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      },
    },
    {
      key: 'dispensing_type',
      header: 'Dispensing',
      sortable: true,
      hideOnMobile: true,
      cell: (rx: Prescription) => (
        <Badge variant="outline" className="text-[10px]">
          {rx.dispensing_type === 'EXTERNAL' ? (
            <><ExternalLink className="h-2.5 w-2.5 mr-0.5" />External</>
          ) : (
            <><Building2 className="h-2.5 w-2.5 mr-0.5" />Internal</>
          )}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (rx: Prescription) => (
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
      ),
      className: 'w-[100px]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3">
        {/* Mobile: Collapsible filters */}
        <div className="flex flex-col gap-3 sm:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search prescriptions..."
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <Select value={selectedStatus} onValueChange={handleStatusChange}>
                <SelectTrigger aria-label="Filter by status">
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
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Desktop: Inline filters */}
        <div className="hidden sm:flex sm:items-center sm:gap-4">
          <div className="relative flex-1 max-w-sm">
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
      </div>

      {/* Table / Cards */}
      <ResponsiveTable
        data={prescriptions}
        columns={columns}
        keyExtractor={(rx) => rx.id}
        mobileCard={(rx) => renderMobileCard(rx)}
        emptyMessage="No prescriptions found"
        onRowClick={(rx) => {
          const displayStatus = rx.effective_status ?? rx.status;
          const canDispense = ['PENDING', 'PARTIAL'].includes(displayStatus);
          if (canDispense) {
            toggleExpanded(rx.id);
          }
        }}
        renderExpandedRow={(rx) => {
          if (!expandedRows.has(rx.id)) return null;
          return (
            <div className="bg-muted/30 p-4 space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Prescription Items - {rx.prescription_number}
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(rx.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 border rounded-md bg-background"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.drug_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.dosage} • {item.frequency} • {item.duration}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span>Rx: <strong>{item.quantity_prescribed}</strong></span>
                        <span>Given: <strong>{item.quantity_dispensed}</strong></span>
                        <span>Left: <strong className="text-primary">{item.remaining_quantity}</strong></span>
                      </div>
                    </div>
                    <div className="shrink-0 ml-3">
                      {item.remaining_quantity > 0 && !item.is_cancelled ? (
                        <ActionButton
                          action="pharmacy.dispense"
                          size="sm"
                          onClick={() => {
                            setDispenseDialog({
                              isOpen: true,
                              prescription: rx,
                              prescriptionItem: item,
                            });
                          }}
                        >
                          <Pill className="h-4 w-4 mr-1.5" />
                          Dispense
                        </ActionButton>
                      ) : item.is_cancelled ? (
                        <Badge variant="outline">Cancelled</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      />

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
    </div>
  );
}

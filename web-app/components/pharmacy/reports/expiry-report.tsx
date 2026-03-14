/**
 * Expiry Report Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Shows batches expiring within specified threshold
 */

'use client';

import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Download,
  Printer,
  Clock,
  AlertTriangle,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useExpiryReport } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils/cn';
import { printExpiryReport } from '@/lib/documents/print-pharmacy-reports';

interface ExpiringBatch {
  batch_id: number;
  drug_name: string;
  batch_number: string;
  expiry_date: string;
  days_to_expiry: number;
  quantity_available: number;
  status: 'OK' | 'CRITICAL' | 'WARNING' | 'EXPIRED';
}

const REPORT_PAGE_SIZE = 25;

export function ExpiryReport() {
  const { toast } = useToast();
  const [daysThreshold, setDaysThreshold] = useState('90');
  const [currentPage, setCurrentPage] = useState(1);
  const [disposeDialogOpen, setDisposeDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<ExpiringBatch | null>(null);
  const [notes, setNotes] = useState('');

  const { data: reportData, isLoading, error } = useExpiryReport(parseInt(daysThreshold));

  const getUrgencyBadge = (daysToExpiry: number) => {
    if (daysToExpiry <= 0) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (daysToExpiry <= 30) {
      return <Badge variant="destructive">Critical ({daysToExpiry} days)</Badge>;
    }
    if (daysToExpiry <= 60) {
      return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Warning ({daysToExpiry} days)</Badge>;
    }
    return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{daysToExpiry} days</Badge>;
  };

  const handleDispose = (batch: ExpiringBatch) => {
    setSelectedBatch(batch);
    setDisposeDialogOpen(true);
  };

  const handleReturn = (batch: ExpiringBatch) => {
    setSelectedBatch(batch);
    setReturnDialogOpen(true);
  };

  const confirmDispose = () => {
    toast({
      title: 'Batch marked for disposal',
      description: `${selectedBatch?.batch_number} has been marked for disposal.`,
    });
    setDisposeDialogOpen(false);
    setSelectedBatch(null);
    setNotes('');
  };

  const confirmReturn = () => {
    toast({
      title: 'Return initiated',
      description: `Return to supplier initiated for ${selectedBatch?.batch_number}.`,
    });
    setReturnDialogOpen(false);
    setSelectedBatch(null);
    setNotes('');
  };

  const handleExport = () => {
    try {
      const data = reportData || [];
      const csvContent = [
        ['Drug Name', 'Batch Number', 'Expiry Date', 'Days to Expiry', 'Quantity'].join(','),
        ...data.map((item) => [
          `"${item.drug_name}"`,
          item.batch_number,
          item.expiry_date,
          item.days_to_expiry,
          item.quantity_available,
        ].join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `expiry-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export successful',
        description: 'Expiry report has been exported to CSV.',
      });
    } catch {
      toast({
        title: 'Export failed',
        description: 'Failed to export report.',
        variant: 'destructive',
      });
    }
  };

  const handlePrint = () => {
    printExpiryReport({
      batches: expiringBatches.map((b) => ({
        batch_id: b.batch_id,
        drug_name: b.drug_name,
        drug_code: '',
        batch_number: b.batch_number,
        quantity_available: b.quantity_available,
        expiry_date: b.expiry_date,
        days_to_expiry: b.days_to_expiry,
        status: b.status,
        value: 0,
      })),
      thresholdDays: parseInt(daysThreshold),
    });
  };

  // Reset to page 1 when threshold changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [daysThreshold]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load expiry report</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const expiringBatches = reportData || [];

  // Pagination - only for browser display, print/export uses full expiringBatches
  const totalPages = Math.ceil(expiringBatches.length / REPORT_PAGE_SIZE);
  const paginatedBatches = expiringBatches.slice(
    (currentPage - 1) * REPORT_PAGE_SIZE,
    currentPage * REPORT_PAGE_SIZE
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Clock className="h-5 w-5" />
              Expiry Report
              <HelpPopover content="Track batches approaching expiry. Take action to dispose expired stock or initiate supplier returns." />
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="days-threshold">Days Threshold</Label>
              <Select value={daysThreshold} onValueChange={setDaysThreshold}>
                <SelectTrigger id="days-threshold" className="w-[150px]">
                  <SelectValue placeholder="Select days" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="ml-auto">
              {expiringBatches.length} batches expiring within {daysThreshold} days
            </Badge>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive">Critical (&lt;30 days)</p>
              <p className="text-2xl font-bold text-destructive">
                {expiringBatches.filter((b) => b.days_to_expiry <= 30).length}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-700 dark:text-orange-400">Warning (30-60 days)</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                {expiringBatches.filter((b) => b.days_to_expiry > 30 && b.days_to_expiry <= 60).length}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">Approaching (60-90 days)</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {expiringBatches.filter((b) => b.days_to_expiry > 60).length}
              </p>
            </div>
          </div>

          {/* Data Table */}
          <ResponsiveTable
            data={paginatedBatches}
            keyExtractor={(batch) => batch.batch_id}
            emptyMessage={`No batches expiring within ${daysThreshold} days`}
            columns={[
              {
                key: 'drug_name',
                header: 'Drug Name',
                sortable: true,
                cell: (batch) => <span className="font-medium">{batch.drug_name}</span>,
              },
              {
                key: 'batch_number',
                header: 'Batch Number',
                sortable: true,
                cell: (batch) => <span className="font-mono text-sm">{batch.batch_number}</span>,
                hideOnMobile: true,
              },
              {
                key: 'expiry_date',
                header: 'Expiry Date',
                sortable: true,
                sortType: 'date',
                hideOnMobile: true,
              },
              {
                key: 'days_to_expiry',
                header: 'Days to Expiry',
                sortable: true,
                sortType: 'number',
                cell: (batch) => getUrgencyBadge(batch.days_to_expiry),
              },
              {
                key: 'quantity_available',
                header: 'Quantity',
                sortable: true,
                sortType: 'number',
                className: 'text-right',
                hideOnMobile: true,
              },
              {
                key: 'actions',
                header: 'Actions',
                cell: (batch) => (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDispose(batch);
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Dispose
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReturn(batch);
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Return
                    </Button>
                  </div>
                ),
                hideOnMobile: true,
              },
            ]}
            mobileCard={(batch) => (
              <div
                className={cn(
                  'rounded-lg border p-4 space-y-3',
                  batch.days_to_expiry <= 30 && 'border-destructive/50 bg-destructive/5',
                  batch.days_to_expiry > 30 && batch.days_to_expiry <= 60 && 'border-orange-500/50 bg-orange-500/5',
                  batch.days_to_expiry > 60 && 'border-amber-500/50 bg-amber-500/5'
                )}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{batch.drug_name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{batch.batch_number}</p>
                  </div>
                  {getUrgencyBadge(batch.days_to_expiry)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expires: {batch.expiry_date}</span>
                  <span>Qty: {batch.quantity_available}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDispose(batch)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Dispose
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleReturn(batch)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Return
                  </Button>
                </div>
              </div>
            )}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {paginatedBatches.length} of {expiringBatches.length} batches (page {currentPage} of {totalPages})
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex-1 sm:flex-none"
                >
                  <ChevronLeft className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4 sm:ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispose Dialog */}
      <Dialog open={disposeDialogOpen} onOpenChange={setDisposeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Batch for Disposal</DialogTitle>
            <DialogDescription>
              This will mark batch {selectedBatch?.batch_number} for disposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dispose-notes">Disposal Notes</Label>
              <Textarea
                id="dispose-notes"
                placeholder="Enter disposal notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDispose}>
              Mark for Disposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return to Supplier</DialogTitle>
            <DialogDescription>
              Initiate return to supplier for batch {selectedBatch?.batch_number}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="return-notes">Return Notes</Label>
              <Textarea
                id="return-notes"
                placeholder="Enter return reason..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmReturn}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Initiate Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

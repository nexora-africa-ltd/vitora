/**
 * Dispensing Report Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 *
 * Shows dispensing history with date range filtering
 */

'use client';

import React, { useState } from 'react';
import { format, parseISO, subDays, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  Download,
  Printer,
  Activity,
  AlertTriangle,
  Search,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useDispensingReport } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { printDispensingReport } from '@/lib/documents/print-pharmacy-reports';
import type { DispensingReportRecord } from '@/lib/types/pharmacy';

const REPORT_PAGE_SIZE = 25;

export function DispensingReport() {
  const { toast } = useToast();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [drugFilter, setDrugFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [groupByDrug, setGroupByDrug] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: reportData, isLoading, error } = useDispensingReport(startDate, endDate);

  const setQuickDate = (preset: 'today' | 'week' | 'month') => {
    const now = new Date();
    switch (preset) {
      case 'today':
        setStartDate(format(now, 'yyyy-MM-dd'));
        setEndDate(format(now, 'yyyy-MM-dd'));
        break;
      case 'week':
        setStartDate(format(startOfWeek(now), 'yyyy-MM-dd'));
        setEndDate(format(now, 'yyyy-MM-dd'));
        break;
      case 'month':
        setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
        break;
    }
  };

  const records = reportData?.results || [];

  // Filter data
  const filteredRecords = records.filter((record: DispensingReportRecord) => {
    const matchesDrug = !drugFilter || record.drug_name.toLowerCase().includes(drugFilter.toLowerCase());
    const matchesPatient = !patientFilter || record.patient_name.toLowerCase().includes(patientFilter.toLowerCase());
    return matchesDrug && matchesPatient;
  });

  // Calculate totals
  const totalDispensed = filteredRecords.reduce((sum: number, r: DispensingReportRecord) => sum + r.quantity_dispensed, 0);
  const totalValue = filteredRecords.reduce((sum: number, r: DispensingReportRecord) => sum + parseFloat(r.total_cost), 0);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, drugFilter, patientFilter, groupByDrug]);

  // Group by drug if enabled
  const groupedData = groupByDrug
    ? Object.entries(
        filteredRecords.reduce((acc: Record<string, { drug_name: string; total_qty: number; total_cost: number; count: number }>, r: DispensingReportRecord) => {
          if (!acc[r.drug_name]) {
            acc[r.drug_name] = { drug_name: r.drug_name, total_qty: 0, total_cost: 0, count: 0 };
          }
          const item = acc[r.drug_name]!;
          item.total_qty += r.quantity_dispensed;
          item.total_cost += parseFloat(r.total_cost);
          item.count += 1;
          return acc;
        }, {})
      ).map(([_, value]) => value)
    : null;

  // Pagination - use appropriate data source based on grouping
  const displayData = groupByDrug ? (groupedData || []) : filteredRecords;
  const totalPages = Math.ceil(displayData.length / REPORT_PAGE_SIZE);
  const paginatedRecords = filteredRecords.slice(
    (currentPage - 1) * REPORT_PAGE_SIZE,
    currentPage * REPORT_PAGE_SIZE
  );
  const paginatedGroupedData = (groupedData || []).slice(
    (currentPage - 1) * REPORT_PAGE_SIZE,
    currentPage * REPORT_PAGE_SIZE
  );

  const handleExport = () => {
    try {
      const csvContent = groupByDrug
        ? [
            ['Drug Name', 'Total Quantity', 'Total Value', 'Dispensing Count'].join(','),
            ...(groupedData || []).map((item) => [
              `"${item.drug_name}"`,
              item.total_qty,
              item.total_cost.toFixed(2),
              item.count,
            ].join(',')),
          ].join('\n')
        : [
            ['Drug Name', 'Quantity', 'Date', 'Patient', 'Dispensed By', 'Batch', 'Cost'].join(','),
            ...filteredRecords.map((r: DispensingReportRecord) => [
              `"${r.drug_name}"`,
              r.quantity_dispensed,
              r.dispensed_date,
              `"${r.patient_name}"`,
              `"${r.dispensed_by}"`,
              r.batch_number,
              r.total_cost,
            ].join(',')),
          ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `dispensing-report-${startDate}-to-${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export successful',
        description: 'Dispensing report has been exported to CSV.',
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
    printDispensingReport({
      startDate,
      endDate,
      records: filteredRecords,
      groupByDrug,
      groupedData: groupedData ?? undefined,
    });
  };

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
            <p>Failed to load dispensing report</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Activity className="h-5 w-5" />
            Dispensing Report
            <HelpPopover content="Dispensing history for the selected date range. Filter by drug or patient, and group by drug for summary totals." />
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
        {/* Date Range */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="start-date">From</Label>
            <DatePicker
              value={startDate ? parseISO(startDate) : undefined}
              onChange={(date) => setStartDate(date ? format(date, 'yyyy-MM-dd') : '')}
              className="w-[160px]"
              placeholder="Start date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">To</Label>
            <DatePicker
              value={endDate ? parseISO(endDate) : undefined}
              onChange={(date) => setEndDate(date ? format(date, 'yyyy-MM-dd') : '')}
              className="w-[160px]"
              placeholder="End date"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickDate('today')}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickDate('week')}>
              This Week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQuickDate('month')}>
              This Month
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="space-y-2">
            <Label htmlFor="drug-filter">Drug</Label>
            <Input
              id="drug-filter"
              data-testid="drug-filter"
              placeholder="Filter by drug..."
              value={drugFilter}
              onChange={(e) => setDrugFilter(e.target.value)}
              className="w-[200px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patient-filter">Patient</Label>
            <Input
              id="patient-filter"
              data-testid="patient-filter"
              placeholder="Filter by patient..."
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="w-[200px]"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="group-by-drug"
              checked={groupByDrug}
              onCheckedChange={(checked) => setGroupByDrug(checked === true)}
            />
            <Label htmlFor="group-by-drug">Group by Drug</Label>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">Total Records</p>
            <p className="text-2xl font-bold">{filteredRecords.length}</p>
          </div>
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-primary">Total Dispensed</p>
            <p className="text-2xl font-bold text-primary">{totalDispensed} units</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Total Value</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">KES {totalValue.toFixed(2)}</p>
          </div>
        </div>

        {/* Data Table */}
          {groupByDrug ? (
            <ResponsiveTable
              data={paginatedGroupedData}
              keyExtractor={(item) => item.drug_name}
              emptyMessage="No dispensing records found"
              columns={[
                {
                  key: 'drug_name',
                  header: 'Drug Name',
                  sortable: true,
                  cell: (item) => <span className="font-medium">{item.drug_name}</span>,
                },
                {
                  key: 'total_qty',
                  header: 'Total Qty',
                  sortable: true,
                  sortType: 'number',
                  className: 'text-right',
                },
                {
                  key: 'total_cost',
                  header: 'Total Value',
                  className: 'text-right',
                  sortable: true,
                  sortType: 'number',
                  cell: (item) => `KES ${item.total_cost.toFixed(2)}`,
                  hideOnMobile: true,
                },
                {
                  key: 'count',
                  header: 'Count',
                  sortable: true,
                  sortType: 'number',
                  className: 'text-right',
                },
              ]}
              mobileCard={(item) => (
                <div className="rounded-lg border p-4 space-y-2">
                  <p className="font-medium">{item.drug_name}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Qty: {item.total_qty}</span>
                    <span>KES {item.total_cost.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.count} dispensing(s)</p>
                </div>
              )}
            />
          ) : (
            <ResponsiveTable
              data={paginatedRecords}
              keyExtractor={(record) => record.dispensing_id}
              emptyMessage="No dispensing records found"
              columns={[
                {
                  key: 'drug_name',
                  header: 'Drug Name',
                  sortable: true,
                  cell: (record) => <span className="font-medium">{record.drug_name}</span>,
                },
                {
                  key: 'quantity_dispensed',
                  header: 'Qty',
                  sortable: true,
                  sortType: 'number',
                  className: 'text-right',
                },
                {
                  key: 'dispensed_date',
                  header: 'Date',
                  sortable: true,
                  sortType: 'date',
                  hideOnMobile: true,
                },
                {
                  key: 'patient_name',
                  header: 'Patient',
                  sortable: true,
                  hideOnMobile: true,
                },
                {
                  key: 'dispensed_by',
                  header: 'Dispensed By',
                  sortable: true,
                  hideOnMobile: true,
                },
                {
                  key: 'batch_number',
                  header: 'Batch',
                  sortable: true,
                  cell: (record) => <span className="font-mono text-sm">{record.batch_number}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'total_cost',
                  header: 'Cost',
                  sortable: true,
                  sortType: 'number',
                  className: 'text-right',
                  cell: (record) => `KES ${record.total_cost}`,
                },
              ]}
              mobileCard={(record) => (
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <p className="font-medium">{record.drug_name}</p>
                    <span className="text-sm">KES {record.total_cost}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{record.patient_name}</span>
                    <span>Qty: {record.quantity_dispensed}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {record.dispensed_date} • {record.dispensed_by}
                  </p>
                </div>
              )}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {groupByDrug ? paginatedGroupedData.length : paginatedRecords.length} of {displayData.length} records (page {currentPage} of {totalPages})
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
  );
}

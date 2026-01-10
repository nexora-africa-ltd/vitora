/**
 * Dispensing Report Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Shows dispensing history with date range filtering
 */

'use client';

import { useState } from 'react';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  Download,
  Printer,
  Activity,
  AlertTriangle,
  Search,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDispensingReport } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';

interface DispensingRecord {
  dispensing_id: number;
  drug_name: string;
  quantity_dispensed: number;
  dispensed_date: string;
  patient_name: string;
  dispensed_by: string;
  batch_number: string;
  total_cost: string;
}

export function DispensingReport() {
  const { toast } = useToast();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [drugFilter, setDrugFilter] = useState('');
  const [patientFilter, setPatientFilter] = useState('');
  const [groupByDrug, setGroupByDrug] = useState(false);

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
  const filteredRecords = records.filter((record: DispensingRecord) => {
    const matchesDrug = !drugFilter || record.drug_name.toLowerCase().includes(drugFilter.toLowerCase());
    const matchesPatient = !patientFilter || record.patient_name.toLowerCase().includes(patientFilter.toLowerCase());
    return matchesDrug && matchesPatient;
  });

  // Calculate totals
  const totalDispensed = filteredRecords.reduce((sum: number, r: DispensingRecord) => sum + r.quantity_dispensed, 0);
  const totalValue = filteredRecords.reduce((sum: number, r: DispensingRecord) => sum + parseFloat(r.total_cost), 0);

  // Group by drug if enabled
  const groupedData = groupByDrug
    ? Object.entries(
        filteredRecords.reduce((acc: Record<string, { drug_name: string; total_qty: number; total_cost: number; count: number }>, r: DispensingRecord) => {
          if (!acc[r.drug_name]) {
            acc[r.drug_name] = { drug_name: r.drug_name, total_qty: 0, total_cost: 0, count: 0 };
          }
          acc[r.drug_name].total_qty += r.quantity_dispensed;
          acc[r.drug_name].total_cost += parseFloat(r.total_cost);
          acc[r.drug_name].count += 1;
          return acc;
        }, {})
      ).map(([_, value]) => value)
    : null;

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
            ...filteredRecords.map((r: DispensingRecord) => [
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
    window.print();
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Dispensing Report
            </CardTitle>
            <CardDescription>
              Dispensing history from {startDate} to {endDate}
            </CardDescription>
          </div>
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
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">To</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px]"
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
        <div className="rounded-md border">
          {groupByDrug ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drug Name</TableHead>
                  <TableHead className="text-right">Total Quantity</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Dispensing Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupedData || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No dispensing records found
                    </TableCell>
                  </TableRow>
                ) : (
                  (groupedData || []).map((item) => (
                    <TableRow key={item.drug_name}>
                      <TableCell className="font-medium">{item.drug_name}</TableCell>
                      <TableCell className="text-right">{item.total_qty}</TableCell>
                      <TableCell className="text-right">KES {item.total_cost.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drug Name</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Dispensed By</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No dispensing records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record: DispensingRecord) => (
                    <TableRow key={record.dispensing_id}>
                      <TableCell className="font-medium">{record.drug_name}</TableCell>
                      <TableCell className="text-right">{record.quantity_dispensed}</TableCell>
                      <TableCell>{record.dispensed_date}</TableCell>
                      <TableCell>{record.patient_name}</TableCell>
                      <TableCell>{record.dispensed_by}</TableCell>
                      <TableCell className="font-mono text-sm">{record.batch_number}</TableCell>
                      <TableCell className="text-right">KES {record.total_cost}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

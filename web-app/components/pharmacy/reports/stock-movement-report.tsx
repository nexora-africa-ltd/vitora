/**
 * Stock Movement Report Component
 * Sprint 1.3-1.4 Track A: Pharmacy Module
 * 
 * Shows all stock movements (received, dispensed, adjusted)
 */

'use client';

import { useState } from 'react';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import {
  Download,
  Printer,
  BarChart3,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
import { useStockMovementReport } from '@/lib/hooks/use-pharmacy';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils/cn';

interface StockMovement {
  drug_name: string;
  movement_type: 'RECEIVED' | 'DISPENSED' | 'ADJUSTED';
  quantity: number;
  date: string;
  reference: string;
  user: string;
}

export function StockMovementReport() {
  const { toast } = useToast();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(subDays(today, 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [drugFilter, setDrugFilter] = useState('');

  const { data: reportData, isLoading, error } = useStockMovementReport(startDate, endDate);

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

  const movements = reportData?.results || [];

  // Filter data
  const filteredMovements = movements.filter((m: StockMovement) => {
    const matchesType = typeFilter === 'all' || m.movement_type === typeFilter;
    const matchesDrug = !drugFilter || m.drug_name.toLowerCase().includes(drugFilter.toLowerCase());
    return matchesType && matchesDrug;
  });

  // Sort by date descending (most recent first)
  const sortedMovements = [...filteredMovements].sort((a: StockMovement, b: StockMovement) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Calculate totals
  const totalIn = sortedMovements
    .filter((m: StockMovement) => m.movement_type === 'RECEIVED')
    .reduce((sum: number, m: StockMovement) => sum + Math.abs(m.quantity), 0);
  const totalOut = sortedMovements
    .filter((m: StockMovement) => m.movement_type !== 'RECEIVED')
    .reduce((sum: number, m: StockMovement) => sum + Math.abs(m.quantity), 0);
  const netMovement = totalIn - totalOut;

  const getMovementIcon = (type: StockMovement['movement_type']) => {
    switch (type) {
      case 'RECEIVED':
        return <ArrowUpCircle className="h-4 w-4 text-green-600" />;
      case 'DISPENSED':
        return <ArrowDownCircle className="h-4 w-4 text-primary" />;
      case 'ADJUSTED':
        return <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />;
    }
  };

  const getMovementBadge = (type: StockMovement['movement_type']) => {
    switch (type) {
      case 'RECEIVED':
        return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Received</Badge>;
      case 'DISPENSED':
        return <Badge className="bg-primary/15 text-primary">Dispensed</Badge>;
      case 'ADJUSTED':
        return <Badge className="bg-orange-500/15 text-orange-700 dark:text-orange-400">Adjusted</Badge>;
    }
  };

  const handleExport = () => {
    try {
      const csvContent = [
        ['Date', 'Drug Name', 'Movement Type', 'Quantity', 'Reference', 'User'].join(','),
        ...sortedMovements.map((m: StockMovement) => [
          m.date,
          `"${m.drug_name}"`,
          m.movement_type,
          m.quantity,
          `"${m.reference}"`,
          `"${m.user}"`,
        ].join(',')),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `stock-movement-${startDate}-to-${endDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Export successful',
        description: 'Stock movement report has been exported to CSV.',
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
            <p>Failed to load stock movement report</p>
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
              <BarChart3 className="h-5 w-5" />
              Stock Movement Report
            </CardTitle>
            <CardDescription>
              Inventory movements from {startDate} to {endDate}
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
            <Label htmlFor="type-filter">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="type-filter" data-testid="movement-type-filter" className="w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RECEIVED">Received</SelectItem>
                <SelectItem value="DISPENSED">Dispensed</SelectItem>
                <SelectItem value="ADJUSTED">Adjusted</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">Total Movements</p>
            <p className="text-2xl font-bold">{sortedMovements.length}</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Total In (Received)</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">+{totalIn}</p>
          </div>
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
            <p className="text-sm text-primary">Total Out (Dispensed)</p>
            <p className="text-2xl font-bold text-primary">-{totalOut}</p>
          </div>
          <div className={cn(
            'p-4 rounded-lg border',
            netMovement >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-destructive/10 border-destructive/20'
          )}>
            <p className={cn('text-sm', netMovement >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
              Net Movement
            </p>
            <p className={cn('text-2xl font-bold', netMovement >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
              {netMovement >= 0 ? '+' : ''}{netMovement}
            </p>
          </div>
        </div>

        {/* Data Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Drug Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No stock movements found
                  </TableCell>
                </TableRow>
              ) : (
                sortedMovements.map((movement: StockMovement, index: number) => (
                  <TableRow key={`${movement.date}-${movement.drug_name}-${index}`}>
                    <TableCell>{movement.date}</TableCell>
                    <TableCell className="font-medium">{movement.drug_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getMovementIcon(movement.movement_type)}
                        {getMovementBadge(movement.movement_type)}
                      </div>
                    </TableCell>
                    <TableCell className={cn(
                      'text-right font-medium',
                      movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                    )}>
                      {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {movement.reference}
                    </TableCell>
                    <TableCell>{movement.user}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

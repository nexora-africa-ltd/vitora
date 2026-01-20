/**
 * Revenue Reports Page
 * Revenue summary with date range filters and export
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import {
  ArrowLeft,
  CalendarIcon,
  Download,
  RefreshCw,
  TrendingUp,
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { useRevenueSummary } from '@/lib/hooks/billing';

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function RevenueReportsPage() {
  const [startDate, setStartDate] = React.useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = React.useState<Date>(endOfMonth(new Date()));

  const {
    data: report,
    isLoading,
    refetch,
  } = useRevenueSummary(
    format(startDate, 'yyyy-MM-dd'),
    format(endDate, 'yyyy-MM-dd')
  );

  const handleExport = () => {
    // Generate CSV
    if (!report) return;

    const rows = [
      ['Category', 'Revenue', 'Count'],
      ...report.by_category.map((cat) => [
        cat.category,
        String(cat.revenue),
        cat.count.toString(),
      ]),
      ['', '', ''],
      ['Payment Method', 'Amount'],
      ...Object.entries(report.by_payment_method).map(([method, amount]) => [
        method,
        String(amount ?? ''),
      ]),
    ];

    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revenue-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const totalRevenue = report ? parseFloat(report.total_revenue) : 0;
  const categories = report?.by_category || [];
  const paymentMethods = (report?.by_payment_method ?? {}) as Record<
    string,
    string | number | null | undefined
  >;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/transactions/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Revenue Reports</h1>
          <p className="text-muted-foreground">
            Revenue summary for {format(startDate, 'MMMM d')} - {format(endDate, 'MMMM d, yyyy')}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Date Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Date Range Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="start_date"
                    variant="outline"
                    className={cn(
                      'w-[200px] justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                    aria-label="Start Date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'MMM d, yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="end_date"
                    variant="outline"
                    className={cn(
                      'w-[200px] justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                    aria-label="End Date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'MMM d, yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(subDays(new Date(), 7));
                  setEndDate(new Date());
                }}
              >
                Last 7 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(subDays(new Date(), 30));
                  setEndDate(new Date());
                }}
              >
                Last 30 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(startOfMonth(new Date()));
                  setEndDate(endOfMonth(new Date()));
                }}
              >
                This Month
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              For selected period
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">Service categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categories.reduce((sum, cat) => sum + cat.count, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Services rendered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {categories.length > 0
                ? categories.sort(
                    (a, b) => parseFloat(b.revenue) - parseFloat(a.revenue)
                  )[0]?.category || '-'
                : '-'}
            </div>
            <p className="text-xs text-muted-foreground">By revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No revenue data for selected period
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((cat) => {
                  const revenue = parseFloat(cat.revenue);
                  const percentage =
                    totalRevenue > 0
                      ? ((revenue / totalRevenue) * 100).toFixed(1)
                      : '0';
                  return (
                    <TableRow key={cat.category}>
                      <TableCell className="font-medium">{cat.category}</TableCell>
                      <TableCell className="text-right">{cat.count}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(revenue)}
                      </TableCell>
                      <TableCell className="text-right">{percentage}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">Total</TableCell>
                  <TableCell className="text-right font-bold">
                    {categories.reduce((sum, cat) => sum + cat.count, 0)}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatCurrency(totalRevenue)}
                  </TableCell>
                  <TableCell className="text-right font-bold">100%</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Revenue by Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(paymentMethods).map(([method, amount]) => {
                const amountNum =
                  typeof amount === 'number'
                    ? amount
                    : parseFloat(String(amount ?? 0));
                const percentage =
                  totalRevenue > 0
                    ? ((amountNum / totalRevenue) * 100).toFixed(1)
                    : '0';
                return (
                  <TableRow key={method}>
                    <TableCell className="font-medium capitalize">
                      {method.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(amountNum)}
                    </TableCell>
                    <TableCell className="text-right">{percentage}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

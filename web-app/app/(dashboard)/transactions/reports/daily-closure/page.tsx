/**
 * Daily Closure Report Page
 * End-of-day billing closure report
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
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
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/format';
import { useDailyClosureReport } from '@/lib/hooks/billing';

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

export default function DailyClosurePage() {
  const [selectedDate, setSelectedDate] = React.useState<Date>(new Date());
  const dateString = format(selectedDate, 'yyyy-MM-dd');

  const { data: report, isLoading } = useDailyClosureReport(dateString);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const totalInvoiced = parseFloat(report?.total_invoiced || '0');
  const totalCollected = parseFloat(report?.total_collected || '0');
  const outstanding = parseFloat(report?.outstanding || '0');
  const collectionRate = totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '0';
  const byDepartment = report?.by_department || [];
  const byPaymentMethod = report?.by_payment_method || {};
  const transactionCount = report?.transaction_count || 0;

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
          <h1 className="text-2xl font-bold tracking-tight">Daily Closure Report</h1>
          <p className="text-muted-foreground">
            End-of-day billing summary for {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
        <DatePicker
          value={selectedDate}
          onChange={(date) => date && setSelectedDate(date)}
        />
        <Button variant="outline">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              KES {totalInvoiced.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {transactionCount} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              KES {totalCollected.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center text-xs text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              {collectionRate}% collection rate
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              KES {outstanding.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex items-center text-xs text-amber-600">
              <TrendingDown className="h-3 w-3 mr-1" />
              Pending collection
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Closing Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              KES {totalCollected.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">
              {transactionCount} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Department Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Collection by Department</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byDepartment.map((dept, idx) => {
                const invoiced = parseFloat(dept.invoiced);
                const collected = parseFloat(dept.collected);
                const deptOutstanding = invoiced - collected;
                return (
                  <TableRow key={dept.department}>
                    <TableCell className="font-medium">{dept.department}</TableCell>
                    <TableCell className="text-right">
                      KES {invoiced.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      KES {collected.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-amber-600">
                      KES {deptOutstanding.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold">Total</TableCell>
                <TableCell className="text-right font-bold">
                  KES {totalInvoiced.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right font-bold text-green-600">
                  KES {totalCollected.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right font-bold text-amber-600">
                  KES {outstanding.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Method Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Collection by Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(byPaymentMethod).map(([method, amount]) => {
                const amountNum = parseFloat(amount);
                const percentage = totalCollected > 0 ? ((amountNum / totalCollected) * 100).toFixed(1) : '0';
                return (
                  <TableRow key={method}>
                    <TableCell className="font-medium capitalize">
                      {method.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-right">
                      KES {amountNum.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
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
                  KES {totalCollected.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right font-bold">100%</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

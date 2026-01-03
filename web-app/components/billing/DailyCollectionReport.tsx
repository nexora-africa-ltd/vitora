/**
 * Daily Collection Report Component
 * Displays daily payment collections summary
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CalendarIcon,
  TrendingUp,
  Banknote,
  Smartphone,
  CreditCard,
  Building,
  Download,
  Printer,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DailyCollectionReport } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface DailyCollectionReportProps {
  report: DailyCollectionReport | null;
  isLoading: boolean;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onExport?: () => void;
  onPrint?: () => void;
}

// ============================================================================
// Payment Method Icons
// ============================================================================

const methodIcons: Record<string, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  MPESA: <Smartphone className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  BANK_TRANSFER: <Building className="h-4 w-4" />,
  INSURANCE: <Building className="h-4 w-4" />,
};

// ============================================================================
// Loading Skeleton
// ============================================================================

function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading report">
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <span className="sr-only">Loading report...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DailyCollectionReportView({
  report,
  isLoading,
  selectedDate,
  onDateChange,
  onExport,
  onPrint,
}: DailyCollectionReportProps) {
  if (isLoading) {
    return <ReportSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Picker */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Daily Collection Report</h2>
          <p className="text-muted-foreground">
            Financial summary for {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(selectedDate, 'PPP')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && onDateChange(date)}
                disabled={(date) => date > new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {/* Actions */}
          {onPrint && (
            <Button variant="outline" onClick={onPrint}>
              <Printer className="h-4 w-4" />
            </Button>
          )}
          {onExport && (
            <Button variant="outline" onClick={onExport}>
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!report ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No data available for selected date
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Collections */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="total-collections">
                  {formatCurrency(report.total_amount)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.total_transactions} transactions
                </p>
              </CardContent>
            </Card>

            {/* Cash */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cash</CardTitle>
                <Banknote className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(report.by_method?.CASH?.amount || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.by_method?.CASH?.count || 0} transactions
                </p>
              </CardContent>
            </Card>

            {/* M-Pesa */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">M-Pesa</CardTitle>
                <Smartphone className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(report.by_method?.MPESA?.amount || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.by_method?.MPESA?.count || 0} transactions
                </p>
              </CardContent>
            </Card>

            {/* Other */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Card & Other</CardTitle>
                <CreditCard className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    (report.by_method?.CARD?.amount || 0) +
                    (report.by_method?.BANK_TRANSFER?.amount || 0) +
                    (report.by_method?.INSURANCE?.amount || 0),
                    'KES'
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {(report.by_method?.CARD?.count || 0) +
                    (report.by_method?.BANK_TRANSFER?.count || 0) +
                    (report.by_method?.INSURANCE?.count || 0)} transactions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Method Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(report.by_method || {}).map(([method, data]) => (
                    <TableRow key={method}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {methodIcons[method]}
                          <span className="capitalize">{method.replace('_', ' ')}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{data.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(data.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {report.total_amount > 0
                          ? ((data.amount / report.total_amount) * 100).toFixed(1)
                          : 0}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {report.total_transactions}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(report.total_amount)}
                    </TableCell>
                    <TableCell className="text-right font-bold">100%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          {report.recent_payments && report.recent_payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.recent_payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">
                          {payment.receipt_number}
                        </TableCell>
                        <TableCell>
                          {format(new Date(payment.payment_date), 'HH:mm')}
                        </TableCell>
                        <TableCell>{payment.patient_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {methodIcons[payment.payment_method]}
                            <span className="capitalize">
                              {payment.payment_method.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(parseFloat(payment.amount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

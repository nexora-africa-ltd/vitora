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
import { DatePicker } from '@/components/ui/date-picker';
import {
  TrendingUp,
  Banknote,
  Smartphone,
  CreditCard,
  Building,
  Download,
  Printer,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
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
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && onDateChange(date)}
            className="w-[240px]"
          />

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
                  {formatCurrency(report.total_collections)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.invoice_count} invoice{report.invoice_count !== 1 ? 's' : ''} paid
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
                  {formatCurrency(parseFloat(String(report.by_payment_method?.cash || report.by_payment_method?.CASH || 0)))}
                </div>
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
                  {formatCurrency(parseFloat(String(report.by_payment_method?.mpesa || report.by_payment_method?.MPESA || 0)))}
                </div>
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
                    parseFloat(String(report.by_payment_method?.card || report.by_payment_method?.CARD || 0)) +
                    parseFloat(String(report.by_payment_method?.bank_transfer || report.by_payment_method?.BANK_TRANSFER || 0)) +
                    parseFloat(String(report.by_payment_method?.insurance || report.by_payment_method?.INSURANCE || 0))
                  )}
                </div>
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
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.by_payment_method && Object.entries(report.by_payment_method).map(([method, amount]) => {
                    const methodAmount = parseFloat(String(amount));
                    return (
                      <TableRow key={method}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {methodIcons[method.toUpperCase()]}
                            <span className="capitalize">{method.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(methodAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {report.total_collections > 0
                            ? ((methodAmount / report.total_collections) * 100).toFixed(1)
                            : 0}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(report.total_collections)}
                    </TableCell>
                    <TableCell className="text-right font-bold">100%</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Top Services */}
          {report.top_services && report.top_services.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Services</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.top_services.map((service, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {service.service__name || 'Unknown Service'}
                        </TableCell>
                        <TableCell className="text-right">{service.count}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(parseFloat(String(service.total_revenue)))}
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

/**
 * Billing Dashboard Component
 * Main dashboard showing today's collection and key metrics
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePicker } from '@/components/ui/date-picker';
import {
  TrendingUp,
  Banknote,
  Smartphone,
  CreditCard,
  Building,
  AlertCircle,
  Clock,
  FileText,
  Receipt,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DailyCollectionReport, PaymentMethod } from '@/lib/types/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface BillingDashboardProps {
  dailyReport: DailyCollectionReport | null;
  isLoading: boolean;
  pendingInvoicesCount?: number;
  overdueInvoicesCount?: number;
  onDateChange?: (date: string) => void;
}

// ============================================================================
// Payment Method Config
// ============================================================================

const methodConfig: Record<PaymentMethod, { icon: React.ReactNode; label: string; color: string }> = {
  CASH: { icon: <Banknote className="h-4 w-4" />, label: 'Cash', color: 'text-green-600' },
  MPESA: { icon: <Smartphone className="h-4 w-4" />, label: 'M-Pesa', color: 'text-green-500' },
  CARD: { icon: <CreditCard className="h-4 w-4" />, label: 'Card', color: 'text-blue-600' },
  BANK_TRANSFER: { icon: <Building className="h-4 w-4" />, label: 'Bank Transfer', color: 'text-purple-600' },
  INSURANCE: { icon: <Building className="h-4 w-4" />, label: 'Insurance', color: 'text-orange-600' },
  CORPORATE: { icon: <Building className="h-4 w-4" />, label: 'Corporate', color: 'text-indigo-600' },
  CHEQUE: { icon: <Receipt className="h-4 w-4" />, label: 'Cheque', color: 'text-muted-foreground' },
};

// ============================================================================
// Loading Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function BillingDashboard({
  dailyReport,
  isLoading,
  pendingInvoicesCount = 0,
  overdueInvoicesCount = 0,
  onDateChange,
}: BillingDashboardProps) {
  const [date, setDate] = React.useState<Date>(new Date());

  const handleDateSelect = (selectedDate: Date) => {
    setDate(selectedDate);
    const formattedDate = format(selectedDate, 'yyyy-MM-dd');
    if (onDateChange) {
      onDateChange(formattedDate);
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const totalCollected = dailyReport?.total_collections || 0;
  const invoiceCount = dailyReport?.invoice_count || 0;
  const byMethod: Record<string, number | string> = dailyReport?.by_payment_method || {};

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Date picker for filtering by day */}
      <div className="flex justify-end">
        <DatePicker
          value={date}
          onChange={(newDate) => newDate && handleDateSelect(newDate)}
          className="w-[200px] sm:w-[240px]"
          placeholder="Pick a date"
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Today's Collection */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Today&apos;s Collection</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="relative">
            <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalCollected)}</div>
            <p className="text-xs text-muted-foreground">
              {invoiceCount} invoices
            </p>
          </CardContent>
        </Card>

        {/* Pending Invoices */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="relative">
            <div className="text-lg sm:text-2xl font-bold">{pendingInvoicesCount}</div>
            <p className="text-xs text-muted-foreground">
              awaiting payment
            </p>
          </CardContent>
        </Card>

        {/* Overdue Invoices */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="relative">
            <div className="text-lg sm:text-2xl font-bold text-destructive">{overdueInvoicesCount}</div>
            <p className="text-xs text-muted-foreground">
              past due date
            </p>
          </CardContent>
        </Card>

        {/* Total Invoices Today */}
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]" aria-hidden="true" />
          <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Processed Today</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="relative">
            <div className="text-lg sm:text-2xl font-bold">{invoiceCount}</div>
            <p className="text-xs text-muted-foreground">
              processed today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Collection by Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {(Object.keys(methodConfig) as PaymentMethod[]).map((method) => {
              const config = methodConfig[method];
              if (!config) return null;
              const rawAmount = byMethod[method];
              const amount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount || '0'));

              return (
                <div
                  key={method}
                  className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border"
                >
                  <div className={cn('p-1.5 sm:p-2 rounded-full bg-muted/50 shrink-0', config.color)}>
                    {config.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium truncate">{config.label}</p>
                    <p className="text-sm sm:text-lg font-bold">{formatCurrency(amount)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default BillingDashboard;

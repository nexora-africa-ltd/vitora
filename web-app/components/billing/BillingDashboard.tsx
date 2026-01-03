/**
 * Billing Dashboard Component
 * Main dashboard showing today's collection and key metrics
 */
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertCircle,
  Clock,
  FileText,
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
};

// ============================================================================
// Loading Skeleton
// ============================================================================

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="grid md:grid-cols-4 gap-4 mb-6">
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
  const [open, setOpen] = React.useState(false);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate);
      setOpen(false);
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      if (onDateChange) {
        onDateChange(formattedDate);
      }
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const totalCollected = parseFloat(dailyReport?.total_collected || '0');
  const invoiceCount = dailyReport?.invoice_count || 0;
  const byMethod: Record<string, string> = dailyReport?.by_payment_method || {};

  return (
    <div className="space-y-6">
      {/* Header with Date Picker */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Billing Dashboard</h2>
          <p className="text-muted-foreground">
            Financial overview and daily collections
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-[240px] justify-start text-left font-normal',
                !date && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0"
            align="end"
            onClick={(event) => {
              // Tests click the gridcell, but DayPicker attaches handlers to the day button.
              // Delegate gridcell clicks to the inner button to ensure selection occurs.
              const target = event.target as HTMLElement | null;
              if (!target) return;
              if (target.tagName.toLowerCase() === 'button') return;

              const gridcell = target.closest('[role="gridcell"]') as HTMLElement | null;
              if (!gridcell) return;
              const dayButton = gridcell.querySelector('button') as HTMLButtonElement | null;
              dayButton?.click();
            }}
          >
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              aria-label="Date"
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Today's Collection */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Collection</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCollected)}</div>
            <p className="text-xs text-muted-foreground">
              {invoiceCount} invoices
            </p>
          </CardContent>
        </Card>

        {/* Pending Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingInvoicesCount}</div>
            <p className="text-xs text-muted-foreground">
              awaiting payment
            </p>
          </CardContent>
        </Card>

        {/* Overdue Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueInvoicesCount}</div>
            <p className="text-xs text-muted-foreground">
              past due date
            </p>
          </CardContent>
        </Card>

        {/* Total Invoices Today */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed Today</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoiceCount}</div>
            <p className="text-xs text-muted-foreground">
              processed today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Collection by Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(methodConfig) as PaymentMethod[]).map((method) => {
              const config = methodConfig[method];
              const amount = parseFloat(byMethod[method] || '0');
              
              return (
                <div
                  key={method}
                  className="flex items-center space-x-3 p-3 rounded-lg border"
                >
                  <div className={cn('p-2 rounded-full bg-gray-100', config.color)}>
                    {config.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{config.label}</p>
                    <p className="text-lg font-bold">{formatCurrency(amount)}</p>
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

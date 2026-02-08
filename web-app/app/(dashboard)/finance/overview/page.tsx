/**
 * Finance Overview Dashboard
 * Comprehensive view of receivables, collections, claims status, and payer mix
 */
'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Receipt,
  TrendingUp,
  Wallet,
  XCircle,
  Plus,
} from 'lucide-react';
import { SHALogo } from '@/components/ui/sha-logo';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClaims } from '@/lib/hooks/use-sha';
import { ReceivePaymentModal } from '@/components/billing';
import {
  useInvoices,
  useDailyCollectionReport,
  useOutstandingBalances,
  usePaymentMethodAnalysis,
  useProformas,
} from '@/lib/hooks/billing';
import { formatCurrency } from '@/lib/utils/format';

// ============================================================================
// Types
// ============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: { value: number; isPositive: boolean };
  href?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'critical';
  isLoading?: boolean;
}

// ============================================================================
// Components
// ============================================================================

function StatCard({
  title,
  value,
  icon,
  description,
  trend,
  href,
  variant = 'default',
  isLoading,
}: StatCardProps) {
  const content = (
    <Card variant={variant} className={href ? 'cursor-pointer' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                {trend.isPositive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {Math.abs(trend.value)}% from last period
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

function ClaimsStatusCard({
  pending,
  submitted,
  approved,
  rejected,
  isLoading,
}: {
  pending: number;
  submitted: number;
  approved: number;
  rejected: number;
  isLoading: boolean;
}) {
  return (
    <Card variant="primary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SHALogo size="md" />
            <CardTitle className="text-base">SHA Claims Status</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions/sha-claims" className="gap-1">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
            <Clock className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
            <AlertCircle className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : submitted}</p>
              <p className="text-xs text-muted-foreground">Submitted</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{isLoading ? '-' : rejected}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PayerMixCard({
  data,
  isLoading,
}: {
  data: Array<{ method: string; count: number; amount: string; percentage: string }>;
  isLoading: boolean;
}) {
  const paymentMethodLabels: Record<string, string> = {
    CASH: 'Cash',
    MPESA: 'M-Pesa',
    CARD: 'Card',
    BANK_TRANSFER: 'Bank Transfer',
    INSURANCE: 'Insurance',
    CREDIT: 'Credit',
  };

  const paymentMethodColors: Record<string, string> = {
    CASH: 'bg-green-500',
    MPESA: 'bg-emerald-500',
    CARD: 'bg-blue-500',
    BANK_TRANSFER: 'bg-purple-500',
    INSURANCE: 'bg-amber-500',
    CREDIT: 'bg-red-500',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Payer Mix</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions/reports/revenue" className="gap-1">
              Details <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : !Array.isArray(data) || data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No payment data for this period
          </p>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <div key={item.method} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{paymentMethodLabels[item.method] || item.method}</span>
                  <span className="font-medium">
                    {formatCurrency(parseFloat(item.amount))} ({item.percentage}%)
                  </span>
                </div>
                <Progress
                  value={parseFloat(item.percentage)}
                  className={`h-2 ${paymentMethodColors[item.method] || 'bg-gray-500'}`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutstandingReceivablesCard({
  data,
  isLoading,
}: {
  data: Array<{
    invoice_number: string;
    patient_name: string;
    balance_due: string;
    days_overdue: number;
  }>;
  isLoading: boolean;
}) {
  return (
    <Card variant={data.length > 0 ? 'warning' : 'default'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Outstanding Receivables</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions/invoices?status=OVERDUE" className="gap-1">
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 py-4">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm">No outstanding receivables</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slice(0, 5).map((item) => (
                <TableRow key={item.invoice_number}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      href={`/transactions/invoices?search=${item.invoice_number}`}
                      className="hover:underline text-blue-600"
                    >
                      {item.invoice_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{item.patient_name}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(parseFloat(item.balance_due))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        item.days_overdue > 30
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : item.days_overdue > 7
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    >
                      {item.days_overdue}d
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function FinanceOverviewPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  // Queries
  const { data: claimsData, isLoading: claimsLoading } = useClaims({});
  const { data: dailyCollection, isLoading: dailyLoading } = useDailyCollectionReport(today);
  const { data: invoicesData, isLoading: invoicesLoading } = useInvoices({ page_size: 100 });
  const { data: proformasData, isLoading: proformasLoading } = useProformas();
  const { data: outstandingData, isLoading: outstandingLoading } = useOutstandingBalances();
  const { data: payerMixData, isLoading: payerMixLoading } = usePaymentMethodAnalysis(
    monthStart,
    monthEnd
  );

  // Claims stats
  const claims = claimsData?.results || [];
  const pendingClaims = claims.filter((c) => c.status === 'draft' || c.status === 'pending').length;
  const submittedClaims = claims.filter((c) => c.status === 'submitted').length;
  const approvedClaims = claims.filter((c) => c.status === 'approved' || c.status === 'paid').length;
  const rejectedClaims = claims.filter((c) => c.status === 'rejected').length;

  // Invoice stats
  const invoiceStats = useMemo(() => {
    const invoices = invoicesData?.results || [];
    const pending = invoices.filter((i) => i.status === 'PENDING').length;
    const overdue = invoices.filter((i) => i.status === 'OVERDUE').length;
    const paid = invoices.filter((i) => i.status === 'PAID').length;
    const totalReceivable = invoices
      .filter((i) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(i.status))
      .reduce((sum, i) => sum + parseFloat(i.balance_due || '0'), 0);
    return { pending, overdue, paid, totalReceivable };
  }, [invoicesData?.results]);

  // Proforma stats
  const proformaStats = useMemo(() => {
    const proformas = proformasData?.results || [];
    const active = proformas.filter((p) => p.is_valid && !p.is_converted).length;
    const expiringSoon = proformas.filter(
      (p) => p.is_valid && !p.is_converted && p.days_until_expiry <= 7
    ).length;
    return { active, expiringSoon };
  }, [proformasData?.results]);

  // Outstanding balances
  const outstandingBalances = outstandingData || [];
  const totalOutstanding = outstandingBalances.reduce(
    (sum, item) => sum + parseFloat(item.balance_due || '0'),
    0
  );

  // Payer mix - convert object to array for charting
  const payerMix = (() => {
    if (!payerMixData?.by_method) return [];
    const entries = Object.entries(payerMixData.by_method);
    const total = entries.reduce((sum, [, data]) => sum + (data.total || 0), 0);
    return entries.map(([method, data]) => ({
      method: method.toUpperCase(),
      count: data.count,
      amount: String(data.total || 0),
      percentage: total > 0 ? ((data.total / total) * 100).toFixed(1) : '0',
    }));
  })();

  // Today's collection
  const todayCollection = dailyCollection?.total_collections || 0;
  const todayTransactions = dailyCollection?.invoice_count || 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Finance Dashboard"
          description="Receivables, collections, claims status, and payer mix at a glance"
        />
        <ReceivePaymentModal
          trigger={
            <Button size="lg" className="gap-2">
              <Banknote className="h-5 w-5" />
              Receive Payment
            </Button>
          }
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Collections"
          value={formatCurrency(todayCollection)}
          icon={<Banknote className="h-5 w-5" />}
          description={`${todayTransactions} transactions`}
          variant="success"
          href="/transactions/payments"
          isLoading={dailyLoading}
        />
        <StatCard
          title="Total Receivables"
          value={formatCurrency(invoiceStats.totalReceivable)}
          icon={<TrendingUp className="h-5 w-5" />}
          description={`${invoiceStats.pending + invoiceStats.overdue} pending invoices`}
          variant={invoiceStats.overdue > 0 ? 'warning' : 'default'}
          href="/transactions/invoices?status=PENDING"
          isLoading={invoicesLoading}
        />
        <StatCard
          title="Overdue Invoices"
          value={invoiceStats.overdue}
          icon={<AlertCircle className="h-5 w-5" />}
          description={formatCurrency(totalOutstanding) + ' outstanding'}
          variant={invoiceStats.overdue > 0 ? 'critical' : 'default'}
          href="/transactions/invoices?status=OVERDUE"
          isLoading={invoicesLoading || outstandingLoading}
        />
        <StatCard
          title="Active Proformas"
          value={proformaStats.active}
          icon={<Clock className="h-5 w-5" />}
          description={
            proformaStats.expiringSoon > 0
              ? `${proformaStats.expiringSoon} expiring soon`
              : 'All valid'
          }
          variant={proformaStats.expiringSoon > 0 ? 'warning' : 'primary'}
          href="/transactions/proformas"
          isLoading={proformasLoading}
        />
      </div>

      {/* SHA Claims Status */}
      <ClaimsStatusCard
        pending={pendingClaims}
        submitted={submittedClaims}
        approved={approvedClaims}
        rejected={rejectedClaims}
        isLoading={claimsLoading}
      />

      {/* Two Column Layout: Payer Mix + Outstanding Receivables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PayerMixCard data={payerMix} isLoading={payerMixLoading} />
        <OutstandingReceivablesCard
          data={outstandingBalances.slice(0, 5)}
          isLoading={outstandingLoading}
        />
      </div>

      {/* Quick Links */}
      <Card variant="muted">
        <CardContent className="py-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Button variant="outline" asChild className="justify-start">
              <Link href="/transactions/invoices">
                <FileText className="h-4 w-4 mr-2" />
                Invoices
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/transactions/payments">
                <CreditCard className="h-4 w-4 mr-2" />
                Payments
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/transactions/reports">
                <BarChart3 className="h-4 w-4 mr-2" />
                Reports
              </Link>
            </Button>
            <Button variant="outline" asChild className="justify-start">
              <Link href="/insurance">
                <SHALogo size="sm" className="mr-2" />
                Insurance
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

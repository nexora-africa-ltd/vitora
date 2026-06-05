/**
 * Capitation Report Page
 *
 * Admin view showing capitation claims summary with date filtering,
 * financial totals, status breakdown, and top interventions.
 *
 * Route: /transactions/capitation
 */
'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/shared/page-header';
import {
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { shaApi } from '@/lib/api/sha';
import type { CapitationSummary } from '@/lib/api/sha';
import { usePermissions } from '@/lib/hooks/use-permissions';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function getDefaultDateRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return {
    from_date: from.toISOString().split('T')[0],
    to_date: now.toISOString().split('T')[0],
  };
}

export default function CapitationReportPage() {
  const { isAdmin } = usePermissions();
  const defaultRange = useMemo(getDefaultDateRange, []);
  const [fromDate, setFromDate] = useState(defaultRange.from_date);
  const [toDate, setToDate] = useState(defaultRange.to_date);

  const { data, isLoading, refetch, isFetching } = useQuery<CapitationSummary>({
    queryKey: ['capitation-summary', fromDate, toDate],
    queryFn: () => shaApi.getCapitationSummary({ from_date: fromDate, to_date: toDate }),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Capitation Report"
        helpContent="View capitation claims summary over a given period. Shows financial totals, status breakdown, top interventions, and monthly trends."
      />

      {/* Date Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">From</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">To</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full sm:w-44"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingSkeleton />
      ) : data ? (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              icon={<FileText className="h-4 w-4" />}
              label="Total Claims"
              value={data.total_claims.toString()}
            />
            <StatCard
              icon={<Banknote className="h-4 w-4" />}
              label="Claimed"
              value={formatCurrency(parseFloat(data.total_claimed_amount))}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Approved"
              value={formatCurrency(parseFloat(data.total_approved_amount))}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Paid"
              value={formatCurrency(parseFloat(data.total_paid_amount))}
            />
          </div>

          {/* Status Breakdown & Top Interventions */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Claims by Status */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Claims by Status</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(data.claims_by_status).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No claims in this period.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(data.claims_by_status).map(([st, count]) => (
                      <Badge
                        key={st}
                        variant="secondary"
                        className={STATUS_COLORS[st] || ''}
                      >
                        {st}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Interventions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top Interventions</CardTitle>
              </CardHeader>
              <CardContent>
                {data.top_interventions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No capitated interventions found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[400px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Tariff Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.top_interventions.map((intv) => (
                          <TableRow key={intv.intervention_code}>
                            <TableCell className="font-mono text-xs">
                              {intv.intervention_code}
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">
                              {intv.intervention_name || '—'}
                            </TableCell>
                            <TableCell className="text-right">{intv.count}</TableCell>
                            <TableCell className="text-right text-sm">
                              {intv.total_tariff
                                ? formatCurrency(parseFloat(intv.total_tariff))
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Monthly Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Monthly Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.monthly_breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No monthly data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Claims</TableHead>
                        <TableHead className="text-right">Claimed</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.monthly_breakdown.map((row) => (
                        <TableRow key={row.month}>
                          <TableCell className="font-medium">{row.month}</TableCell>
                          <TableCell className="text-right">{row.claims}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(parseFloat(row.claimed || '0'))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(parseFloat(row.approved || '0'))}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(parseFloat(row.paid || '0'))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative pt-4 pb-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="text-lg font-bold truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
}

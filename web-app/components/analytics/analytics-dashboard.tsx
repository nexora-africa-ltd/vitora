'use client';

/**
 * Analytics Dashboard — main BI page.
 *
 * Shows facility KPIs, encounter volume trends, revenue breakdown,
 * top diagnoses, bed occupancy, and a period selector.
 */

import { useState, useMemo } from 'react';
import {
  Activity,
  Users,
  DollarSign,
  BedDouble,
  TrendingUp,
  Stethoscope,
  Siren,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatsCard } from '@/components/dashboard/stats-card';
import { LineChart, BarChart, DonutChart } from '@/components/charts';
import { ChartEmptyState } from '@/components/charts';
import { encounterTypeConfig, chartColors } from '@/components/charts/chart-config';
import { useFacilitySummary, useDepartmentPerformance, useDiagnosisTrends, useDemographics } from '@/lib/hooks/use-analytics';
import type { ChartConfig } from '@/components/ui/chart';
import type { FacilityDailySummary } from '@/lib/types/analytics';

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | '90d';

function getDateRange(period: Period): { date_from: string; date_to: string } {
  const today = new Date();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const from = new Date(today);
  from.setDate(from.getDate() - days);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: today.toISOString().slice(0, 10),
  };
}

function formatKes(value: number): string {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${value.toLocaleString()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Chart configs
// ---------------------------------------------------------------------------

const revenueConfig: ChartConfig = {
  revenue_cash: { label: 'Cash', color: 'hsl(var(--chart-1))' },
  revenue_mpesa: { label: 'M-Pesa', color: 'hsl(var(--chart-2))' },
  revenue_insurance: { label: 'Insurance', color: 'hsl(var(--chart-3))' },
};

const encounterVolumeConfig: ChartConfig = {
  encounters_opd: { label: 'OPD', color: 'hsl(var(--chart-1))' },
  encounters_ipd: { label: 'IPD', color: 'hsl(var(--chart-2))' },
  encounters_emergency: { label: 'Emergency', color: 'hsl(var(--critical))' },
};

const diagnosisBarConfig: ChartConfig = {
  case_count: { label: 'Cases', color: 'hsl(var(--chart-1))' },
};

const genderConfig: ChartConfig = {
  M: { label: 'Male', color: 'hsl(var(--gender-male))' },
  F: { label: 'Female', color: 'hsl(var(--gender-female))' },
  O: { label: 'Other', color: 'hsl(var(--gender-other))' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('30d');
  const dateRange = useMemo(() => getDateRange(period), [period]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Fetch data
  const { data: summaryData, isLoading: summaryLoading } = useFacilitySummary(dateRange);
  const { data: deptData, isLoading: deptLoading } = useDepartmentPerformance({
    year: currentYear,
    month: currentMonth,
  });
  const { data: dxData, isLoading: dxLoading } = useDiagnosisTrends({
    granularity: 'MONTHLY',
    date_from: dateRange.date_from,
    date_to: dateRange.date_to,
    top_n: 10,
  });
  const { data: demoData, isLoading: demoLoading } = useDemographics();

  // Derived metrics
  const summaries = summaryData?.results ?? [];
  const latest = summaries[0] as FacilityDailySummary | undefined;
  const totalEncounters = summaries.reduce((s, d) => s + d.encounters_total, 0);
  const totalRevenue = summaries.reduce((s, d) => s + d.revenue_total, 0);
  const totalNewPatients = summaries.reduce((s, d) => s + d.new_patients, 0);
  const avgOccupancy = summaries.length
    ? summaries.reduce((s, d) => s + d.bed_occupancy_rate, 0) / summaries.length
    : 0;

  // Chart data: encounter volume over time (most recent first → reverse)
  const volumeChartData = useMemo(
    () =>
      [...summaries]
        .reverse()
        .map((d) => ({
          date: formatShortDate(d.date),
          encounters_opd: d.encounters_opd,
          encounters_ipd: d.encounters_ipd,
          encounters_emergency: d.encounters_emergency,
        })),
    [summaries]
  );

  // Revenue stacked bar
  const revenueChartData = useMemo(
    () =>
      [...summaries]
        .reverse()
        .map((d) => ({
          date: formatShortDate(d.date),
          revenue_cash: d.revenue_cash,
          revenue_mpesa: d.revenue_mpesa,
          revenue_insurance: d.revenue_insurance,
        })),
    [summaries]
  );

  // Top diagnoses horizontal bar
  const diagnosisChartData = useMemo(
    () =>
      (dxData?.results ?? []).slice(0, 10).map((d) => ({
        name: d.icd10_code,
        label: d.icd10_name || d.icd10_code,
        case_count: d.case_count,
      })),
    [dxData]
  );

  // Gender donut
  const genderChartData = useMemo(() => {
    const snap = demoData?.results?.[0];
    if (!snap) return [];
    return Object.entries(snap.gender_distribution).map(([key, val]) => ({
      name: key,
      value: val,
      fill: key === 'M' ? 'hsl(var(--gender-male))' : key === 'F' ? 'hsl(var(--gender-female))' : 'hsl(var(--gender-other))',
    }));
  }, [demoData]);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div />
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[140px]">
            <CalendarDays className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7d</SelectItem>
            <SelectItem value="30d">Last 30d</SelectItem>
            <SelectItem value="90d">Last 90d</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Stats Row */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Encounters"
          value={summaryLoading ? '—' : totalEncounters.toLocaleString()}
          icon={Stethoscope}
          variant="default"
          loading={summaryLoading}
          description={`${period === '7d' ? '7' : period === '30d' ? '30' : '90'}-day total`}
        />
        <StatsCard
          title="New Patients"
          value={summaryLoading ? '—' : totalNewPatients.toLocaleString()}
          icon={Users}
          variant="info"
          loading={summaryLoading}
          description="Registered in period"
        />
        <StatsCard
          title="Revenue"
          value={summaryLoading ? '—' : formatKes(totalRevenue)}
          icon={DollarSign}
          variant="success"
          loading={summaryLoading}
          description="Completed payments"
        />
        <StatsCard
          title="Bed Occupancy"
          value={summaryLoading ? '—' : `${avgOccupancy.toFixed(1)}%`}
          icon={BedDouble}
          variant={avgOccupancy > 85 ? 'warning' : 'default'}
          loading={summaryLoading}
          description="Average occupancy"
        />
      </div>

      {/* Charts Row 1: Volume + Revenue */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Encounter Volume */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Encounter Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : volumeChartData.length === 0 ? (
              <ChartEmptyState chartType="line" description="No encounter data for this period" />
            ) : (
              <LineChart
                data={volumeChartData}
                config={encounterVolumeConfig}
                dataKeys={['encounters_opd', 'encounters_ipd', 'encounters_emergency']}
                xAxisKey="date"
                showGrid
                showTooltip
                showLegend
                lineType="monotone"
                minHeight="250px"
              />
            )}
          </CardContent>
        </Card>

        {/* Revenue Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Revenue Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : revenueChartData.length === 0 ? (
              <ChartEmptyState chartType="bar" description="No revenue data for this period" />
            ) : (
              <BarChart
                data={revenueChartData}
                config={revenueConfig}
                dataKeys={['revenue_cash', 'revenue_mpesa', 'revenue_insurance']}
                xAxisKey="date"
                stacked
                showGrid
                showTooltip
                showLegend
                minHeight="250px"
                yAxisFormatter={(v) => formatKes(v)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Top Diagnoses + Gender Distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Top Diagnoses */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 Diagnoses</CardTitle>
          </CardHeader>
          <CardContent>
            {dxLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : diagnosisChartData.length === 0 ? (
              <ChartEmptyState chartType="bar" description="No diagnosis trends available" />
            ) : (
              <BarChart
                data={diagnosisChartData}
                config={diagnosisBarConfig}
                dataKeys={['case_count']}
                xAxisKey="name"
                layout="vertical"
                showGrid
                showTooltip
                minHeight="300px"
              />
            )}
          </CardContent>
        </Card>

        {/* Gender Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gender Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {demoLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : genderChartData.length === 0 ? (
              <ChartEmptyState chartType="pie" description="No demographic data" />
            ) : (
              <DonutChart
                data={genderChartData}
                config={genderConfig}
                showTooltip
                showLegend
                showCenterLabel
                centerLabelTitle="Total"
                centerLabelValue={demoData?.results?.[0]?.total_patients ?? 0}
                minHeight="300px"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department Performance Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Department Performance (This Month)</CardTitle>
        </CardHeader>
        <CardContent>
          {deptLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (deptData?.results ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No department data for this month. Data is generated monthly by the analytics ETL.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Department</th>
                    <th className="pb-2 pr-4 font-medium text-right">Visits</th>
                    <th className="pb-2 pr-4 font-medium text-right">Unique Patients</th>
                    <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                    <th className="pb-2 font-medium">Top Diagnosis</th>
                  </tr>
                </thead>
                <tbody>
                  {(deptData?.results ?? []).map((dept) => (
                    <tr key={dept.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{dept.department_display}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{dept.visit_count.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{dept.unique_patients.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatKes(dept.revenue)}</td>
                      <td className="py-2.5 text-muted-foreground truncate max-w-[200px]">
                        {dept.top_diagnoses?.[0]?.name || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

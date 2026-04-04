'use client';

/**
 * Delivery Statistics Charts
 *
 * Reusable Recharts-based component for visualizing delivery statistics.
 * Renders pie/donut charts for breakdowns and a bar chart for monthly trends.
 * Used on the MCH Deliveries dashboard statistics tab.
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Badge } from '@/components/ui/badge';
import type {
  DeliveryDashboard,
  DeliveryDashboardStats,
  DeliveryOutcomesBreakdown,
  DeliveryTypesBreakdown,
  DeliveryPlacesBreakdown,
  DeliveryMonthlyTrend,
} from '@/lib/types/mch';

// =============================================================================
// Configuration
// =============================================================================

const OUTCOME_COLORS: Record<keyof DeliveryOutcomesBreakdown, string> = {
  LIVE_BIRTH: '#22c55e',
  STILLBIRTH: '#ef4444',
  NEONATAL_DEATH: '#f87171',
  MATERNAL_DEATH: '#dc2626',
};

const OUTCOME_LABELS: Record<keyof DeliveryOutcomesBreakdown, string> = {
  LIVE_BIRTH: 'Live Birth',
  STILLBIRTH: 'Stillbirth',
  NEONATAL_DEATH: 'Neonatal Death',
  MATERNAL_DEATH: 'Maternal Death',
};

const TYPE_COLORS: Record<keyof DeliveryTypesBreakdown, string> = {
  SVD: '#3b82f6',
  ASSISTED_VAGINAL: '#60a5fa',
  ELECTIVE_CS: '#8b5cf6',
  EMERGENCY_CS: '#7c3aed',
  VACUUM: '#6366f1',
  FORCEPS: '#818cf8',
};

const TYPE_LABELS: Record<keyof DeliveryTypesBreakdown, string> = {
  SVD: 'SVD',
  ASSISTED_VAGINAL: 'Assisted',
  ELECTIVE_CS: 'Elective C/S',
  EMERGENCY_CS: 'Emergency C/S',
  VACUUM: 'Vacuum',
  FORCEPS: 'Forceps',
};

const PLACE_COLORS: Record<keyof DeliveryPlacesBreakdown, string> = {
  FACILITY: '#22c55e',
  HOME: '#f97316',
  EN_ROUTE: '#eab308',
};

const PLACE_LABELS: Record<keyof DeliveryPlacesBreakdown, string> = {
  FACILITY: 'Facility',
  HOME: 'Home',
  EN_ROUTE: 'En Route',
};

const TREND_BAR_COLORS = {
  live_births: '#22c55e',
  stillbirths: '#ef4444',
  cs_deliveries: '#8b5cf6',
};

// =============================================================================
// Helpers
// =============================================================================

interface PieDataEntry {
  name: string;
  value: number;
  color: string;
}

function breakdownToPieData<K extends string>(
  breakdown: Record<K, number>,
  labels: Record<K, string>,
  colors: Record<K, string>,
): PieDataEntry[] {
  return (Object.keys(breakdown) as K[])
    .map((key) => ({
      name: labels[key],
      value: breakdown[key],
      color: colors[key],
    }))
    .filter((d) => d.value > 0);
}

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function DonutChart({
  data,
  title,
  helpContent,
}: {
  data: PieDataEntry[];
  title: string;
  helpContent: string;
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            <HelpPopover content={helpContent} />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No data
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <HelpPopover content={helpContent} />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={80}
              labelLine={false}
              label={renderCustomLabel}
              stroke="none"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const item = payload[0];
                return (
                  <div className="rounded-md bg-popover px-3 py-2 shadow-md border text-sm">
                    <p className="font-medium">{item?.name}</p>
                    <p className="text-muted-foreground">{item?.value}</p>
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => <span className="text-xs">{value}</span>}
              wrapperStyle={{ fontSize: 11 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function MonthlyTrendChart({ data }: { data: DeliveryMonthlyTrend[] }) {
  const chartData = useMemo(
    () =>
      data.map((m) => ({
        month: m.month ?? '',
        'Live Births': m.live_births,
        Stillbirths: m.stillbirths,
        'C-Sections': m.cs_deliveries,
        total: m.total,
      })),
    [data],
  );

  if (chartData.length === 0) {
    return (
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Monthly Delivery Trend</CardTitle>
            <HelpPopover content="Deliveries per month broken down by outcome." />
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-sm text-muted-foreground">
          No trend data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="md:col-span-2 lg:col-span-3">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Monthly Delivery Trend</CardTitle>
          <HelpPopover content="Deliveries per month over the last 6 months, broken down by live births, stillbirths, and C-section deliveries." />
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} width={30} tickLine={false} axisLine={false} allowDecimals={false} />
            <RechartsTooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md bg-popover px-3 py-2 shadow-md border text-sm">
                    <p className="font-medium mb-1">{label}</p>
                    {payload.map((entry) => (
                      <p key={entry.name} style={{ color: entry.color }}>
                        {entry.name}: {entry.value}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Live Births" fill={TREND_BAR_COLORS.live_births} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Stillbirths" fill={TREND_BAR_COLORS.stillbirths} radius={[2, 2, 0, 0]} />
            <Bar dataKey="C-Sections" fill={TREND_BAR_COLORS.cs_deliveries} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function KeyIndicatorsCard({ stats }: { stats: DeliveryDashboardStats }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Key Indicators</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total Deliveries</span>
          <span className="font-semibold">{stats.total_deliveries}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Live Birth Rate</span>
          <span className="font-semibold text-green-600 dark:text-green-400">{stats.live_birth_rate}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">C-Section Rate</span>
          <Badge
            variant="outline"
            className={stats.cs_rate > 15 ? 'border-orange-500 text-orange-700 dark:text-orange-400' : ''}
          >
            {stats.cs_rate}%
          </Badge>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">With Complications</span>
          <span className="font-semibold">{stats.with_complications}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">High-Risk Due ≤30d</span>
          <Badge variant={stats.high_risk_due_soon > 0 ? 'destructive' : 'outline'}>
            {stats.high_risk_due_soon}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface DeliveryStatsChartsProps {
  dashboard: DeliveryDashboard;
  className?: string;
}

export function DeliveryStatsCharts({ dashboard, className }: DeliveryStatsChartsProps) {
  const outcomesData = useMemo(
    () => breakdownToPieData(dashboard.outcomes_breakdown, OUTCOME_LABELS, OUTCOME_COLORS),
    [dashboard.outcomes_breakdown],
  );
  const typesData = useMemo(
    () => breakdownToPieData(dashboard.types_breakdown, TYPE_LABELS, TYPE_COLORS),
    [dashboard.types_breakdown],
  );
  const placesData = useMemo(
    () => breakdownToPieData(dashboard.places_breakdown, PLACE_LABELS, PLACE_COLORS),
    [dashboard.places_breakdown],
  );

  return (
    <div className={className}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DonutChart
          data={outcomesData}
          title="Delivery Outcomes"
          helpContent="Breakdown of all delivery outcomes. Goal: maximize live birth rate."
        />
        <DonutChart
          data={typesData}
          title="Delivery Types"
          helpContent="Breakdown of delivery methods. WHO recommends a C-section rate of 10-15%."
        />
        <DonutChart
          data={placesData}
          title="Place of Delivery"
          helpContent="Where deliveries occurred. Facility deliveries are tracked for skilled birth attendance KPIs."
        />
        <MonthlyTrendChart data={dashboard.monthly_trend} />
        <KeyIndicatorsCard stats={dashboard.stats} />
      </div>
    </div>
  );
}

/**
 * TriageReportsPage Component
 *
 * Comprehensive reporting dashboard for triage performance metrics.
 * Displays wait time analysis, volume distribution, and LWBS statistics.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-reports.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import {
  Download,
  Clock,
  Users,
  BarChart3,
  Target,
  LogOut,
  CalendarIcon,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpPopover } from '@/components/shared/help-popover';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { TrendIndicator, DonutChart, BarChart, LineChart, createChartConfig, ChartEmptyState } from '@/components/charts';
import type {
  TriageReportSummary,
  TriageCategory,
  AssignedArea,
} from '@/lib/types/triage';
import { TRIAGE_CATEGORY_CONFIG, ASSIGNED_AREA_CONFIG } from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'custom';

export interface ReportFilters {
  dateRange: DateRangePreset;
  customStartDate?: string;
  customEndDate?: string;
  area?: AssignedArea | 'all';
  category?: TriageCategory | 'all';
}

export interface TriageReportsPageProps {
  /** Report data to display */
  reportData: TriageReportSummary;
  /** Loading state */
  isLoading?: boolean;
  /** Current filters */
  filters?: ReportFilters;
  /** Callback when date range changes */
  onDateRangeChange: (preset: DateRangePreset, customDates?: { start: string; end: string }) => void;
  /** Callback when filters change */
  onFilterChange: (filters: Partial<ReportFilters>) => void;
  /** Callback to export report */
  onExport: (format: 'pdf' | 'csv' | 'excel') => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
];

const CATEGORY_COLORS: Record<TriageCategory, string> = {
  RED: 'bg-red-500',
  ORANGE: 'bg-orange-500',
  YELLOW: 'bg-yellow-500',
  GREEN: 'bg-green-500',
  BLUE: 'bg-blue-500',
};

const CATEGORY_TEXT_COLORS: Record<TriageCategory, string> = {
  RED: 'text-red-600',
  ORANGE: 'text-orange-600',
  YELLOW: 'text-yellow-600',
  GREEN: 'text-green-600',
  BLUE: 'text-blue-600',
};

const CATEGORY_CHART_COLORS: Record<TriageCategory, string> = {
  RED: 'hsl(0, 72%, 51%)',
  ORANGE: 'hsl(25, 95%, 53%)',
  YELLOW: 'hsl(48, 96%, 53%)',
  GREEN: 'hsl(142, 71%, 45%)',
  BLUE: 'hsl(217, 91%, 60%)',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="mt-3">
            <TrendIndicator
              value={trend.value}
              previousValue={0}
              direction={trend.positive ? 'up' : 'down'}
              suffix="vs last period"
              size="sm"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryVolumeBar({
  category,
  count,
  percentage,
  maxCount,
}: {
  category: TriageCategory;
  count: number;
  percentage: number;
  maxCount: number;
}) {
  const widthPercent = (count / maxCount) * 100;

  return (
    <div data-testid={`volume-${category}`} className="flex items-center gap-3">
      <div className={cn('w-3 h-3 rounded-full shrink-0', CATEGORY_COLORS[category])} />
      <span className={cn('w-16 font-medium', CATEGORY_TEXT_COLORS[category])}>{category}</span>
      <div className="flex-1">
        <div className="h-6 bg-muted rounded overflow-hidden">
          <div
            className={cn('h-full transition-all', CATEGORY_COLORS[category])}
            style={{ width: `${widthPercent}%` }}
          />
        </div>
      </div>
      <span className="w-12 text-right font-medium">{count}</span>
      <span className="w-16 text-right text-muted-foreground">{percentage}%</span>
    </div>
  );
}

// Triage Category DonutChart component
const triageCategoryConfig = createChartConfig(
  ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'],
  {
    labels: {
      RED: 'Emergency',
      ORANGE: 'Very Urgent',
      YELLOW: 'Urgent',
      GREEN: 'Standard',
      BLUE: 'Non-Urgent',
    },
    colors: {
      RED: 'hsl(0 84% 60%)',       // Red
      ORANGE: 'hsl(25 95% 53%)',   // Orange
      YELLOW: 'hsl(48 96% 53%)',   // Yellow
      GREEN: 'hsl(142 71% 45%)',   // Green
      BLUE: 'hsl(217 91% 60%)',    // Blue
    },
  }
);

function TriageCategoryChart({ data }: { data: Array<{ category: TriageCategory; count: number; percentage: number }> }) {
  const chartData = React.useMemo(
    () => data.map((item) => ({
      name: item.category,
      value: item.count,
    })),
    [data]
  );

  const total = React.useMemo(
    () => data.reduce((sum, item) => sum + item.count, 0),
    [data]
  );

  if (total === 0) {
    return (
      <ChartEmptyState
        chartType="donut"
        title="No category data"
        description="Triage category distribution will appear here once assessments are recorded."
        minHeight="200px"
      />
    );
  }

  return (
    <DonutChart
      data={chartData}
      config={triageCategoryConfig}
      showLegend
      legendPosition="right"
      innerRadius={40}
      outerRadius={80}
      showCenterLabel
      centerLabelTitle="Total"
      centerLabelValue={String(total)}
      minHeight="200px"
    />
  );
}

function LoadingSkeleton() {
  return (
    <div data-testid="reports-loading" className="space-y-6">
      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * TriageReportsPage - Triage performance reporting dashboard
 *
 * Features:
 * - Summary cards (total triaged, avg wait, median wait, target met %)
 * - Wait times by category table
 * - Volume distribution by category (bar chart)
 * - Volume by area breakdown
 * - LWBS statistics
 * - Date range selection
 * - Area and category filters
 * - Export functionality
 * - Loading and empty states
 */
export function TriageReportsPage({
  reportData,
  isLoading = false,
  filters = { dateRange: 'last_7_days', area: 'all', category: 'all' },
  onDateRangeChange,
  onFilterChange,
  onExport,
}: TriageReportsPageProps) {
  const [selectedDateRange, setSelectedDateRange] = React.useState<DateRangePreset>(
    filters.dateRange
  );
  const [selectedArea, setSelectedArea] = React.useState<string>(filters.area || 'all');
  const [selectedCategory, setSelectedCategory] = React.useState<string>(filters.category || 'all');

  const handleDateRangeChange = (value: string) => {
    const preset = value as DateRangePreset;
    setSelectedDateRange(preset);
    if (preset !== 'custom') {
      onDateRangeChange(preset);
    }
  };

  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    const start = field === 'start' ? value : filters.customStartDate || '';
    const end = field === 'end' ? value : filters.customEndDate || '';
    if (start && end) {
      onDateRangeChange('custom', { start, end });
    }
  };

  const handleAreaFilterChange = (value: string) => {
    setSelectedArea(value);
    onFilterChange({ area: value as AssignedArea | 'all' });
  };

  const handleCategoryFilterChange = (value: string) => {
    setSelectedCategory(value);
    onFilterChange({ category: value as TriageCategory | 'all' });
  };

  const maxVolume = Math.max(...reportData.volume_by_category.map((v) => v.count), 1);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <LoadingSkeleton />
      </div>
    );
  }

  const isEmpty = reportData.total_assessments === 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
        <p className="text-sm text-muted-foreground">
          {formatDateRange(reportData.date_range.start, reportData.date_range.end)}
        </p>
        <Button variant="outline" size="sm" onClick={() => onExport('pdf')}>
          <Download className="h-4 w-4 mr-2" />
          <span className="sm:hidden">Export</span>
          <span className="hidden sm:inline">Export Report</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
            {/* Date Range */}
            <div className="w-full sm:w-[180px]">
              <Label htmlFor="date-range">Date Range</Label>
              <Select value={selectedDateRange} onValueChange={handleDateRangeChange}>
                <SelectTrigger id="date-range" aria-label="Date range">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Date Inputs */}
            {selectedDateRange === 'custom' && (
              <>
                <div className="w-full sm:w-[160px]">
                  <Label htmlFor="custom-start">Start Date</Label>
                  <input
                    id="custom-start"
                    type="date"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={filters.customStartDate || ''}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-[160px]">
                  <Label htmlFor="custom-end">End Date</Label>
                  <input
                    id="custom-end"
                    type="date"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={filters.customEndDate || ''}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Area Filter */}
            <div className="w-full sm:w-[180px]">
              <Label htmlFor="area-filter">Filter by Area</Label>
              <Select value={selectedArea} onValueChange={handleAreaFilterChange}>
                <SelectTrigger id="area-filter" aria-label="Filter by area">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {Object.entries(ASSIGNED_AREA_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="w-full sm:w-[160px]">
              <Label htmlFor="category-filter">Filter by Category</Label>
              <Select value={selectedCategory} onValueChange={handleCategoryFilterChange}>
                <SelectTrigger id="category-filter" aria-label="Filter by category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'] as TriageCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isEmpty ? (
        <Card>
          <CardContent className="p-8">
            <ChartEmptyState
              chartType="bar"
              title="No Data Available"
              description="No triage assessments found for the selected date range. Try selecting a different time period."
              minHeight="200px"
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div data-testid="summary-section" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SummaryCard
              title="Total Patients Triaged"
              value={reportData.total_assessments}
              icon={Users}
            />
            <SummaryCard
              title="Average Wait Time"
              value={`${reportData.avg_wait_time_minutes} min`}
              icon={Clock}
            />
            <SummaryCard
              title="Median Wait Time"
              value={`${reportData.median_wait_time_minutes} min`}
              icon={Clock}
            />
            <SummaryCard
              title="Target Met"
              value={`${reportData.target_met_percentage}%`}
              subtitle="Patients seen within target"
              icon={Target}
            />
          </div>

          {/* Wait Times by Category */}
          <Card data-testid="wait-times-section">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Wait Times by Category
                </CardTitle>
                <HelpPopover content="Wait time analysis against Kenya Emergency Triage Assessment (KETA) targets. RED=Immediate, ORANGE=10min, YELLOW=60min, GREEN/BLUE=240min." />
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <div className="overflow-x-auto">
              <Table data-testid="wait-times-table" className="min-w-[600px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Avg Wait</TableHead>
                    <TableHead className="text-right">Median</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Exceeded</TableHead>
                    <TableHead className="text-right">Exceeded %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.wait_times_by_category.map((stat) => (
                    <TableRow key={stat.category}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-3 h-3 rounded-full',
                              CATEGORY_COLORS[stat.category]
                            )}
                          />
                          <span className={CATEGORY_TEXT_COLORS[stat.category]}>
                            {stat.category}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {stat.target_minutes === 0 ? 'Immediate' : `${stat.target_minutes} min`}
                      </TableCell>
                      <TableCell className="text-right">
                        {stat.avg_wait_minutes} min
                      </TableCell>
                      <TableCell className="text-right">
                        {stat.median_wait_minutes} min
                      </TableCell>
                      <TableCell className="text-right">{stat.total_count}</TableCell>
                      <TableCell className="text-right">{stat.exceeded_count}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            stat.exceeded_percentage > 15 && 'text-red-600 font-medium',
                            stat.exceeded_percentage > 10 && stat.exceeded_percentage <= 15 && 'text-orange-600',
                          )}
                        >
                          {stat.exceeded_percentage}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          {/* Volume Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Volume by Category - DonutChart */}
            <Card data-testid="volume-section">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Volume by Category
                  </CardTitle>
                  <HelpPopover content="Distribution of triage assessments across KETA categories." />
                </div>
              </CardHeader>
              <CardContent>
                <TriageCategoryChart data={reportData.volume_by_category} />
              </CardContent>
            </Card>

            {/* Volume by Area */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Volume by Area
                  </CardTitle>
                  <HelpPopover content="Patient distribution by care area (e.g., General, Paediatric, Resus)." />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reportData.volume_by_area.map((area) => (
                    <div key={area.area} className="flex items-center gap-3">
                      <span className="w-36 text-sm truncate">{area.area_label}</span>
                      <div className="flex-1">
                        <Progress
                          value={(area.count / reportData.total_assessments) * 100}
                          className="h-4"
                        />
                      </div>
                      <span className="w-12 text-right font-medium">{area.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staff Performance */}
          {reportData.staff_performance.length > 0 && (
            <Card data-testid="staff-performance-section">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Staff Performance
                  </CardTitle>
                  <HelpPopover content="Per-staff triage metrics: average wait time, median wait time, and KETA compliance rate. Helps identify training needs and workload balance." />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Grouped bar chart — avg & median wait per staff */}
                <BarChart
                  data={reportData.staff_performance.map((s) => {
                    const parts = s.name.split(' ');
                    const short = parts.length > 1 && parts[1]
                      ? `${parts[0]} ${parts[1][0]}.`
                      : parts[0];
                    return {
                      name: short,
                      fullName: s.name,
                      avg_wait: s.avg_wait_minutes,
                      median_wait: s.median_wait_minutes,
                    };
                  })}
                  config={createChartConfig(['avg_wait', 'median_wait'], {
                    labels: { avg_wait: 'Avg Wait (min)', median_wait: 'Median Wait (min)' },
                    colors: { avg_wait: 'hsl(var(--chart-1))', median_wait: 'hsl(var(--chart-3))' },
                  })}
                  dataKeys={['avg_wait', 'median_wait']}
                  xAxisKey="name"
                  showGrid
                  showXAxis
                  showYAxis
                  showTooltip
                  showLegend
                  minHeight="280px"
                  yAxisFormatter={(v) => `${v}m`}
                  tooltipFormatter={(value, dataKey, item) => {
                    const payload = item as { payload?: { fullName?: string } };
                    const label = typeof dataKey === 'string'
                      ? (dataKey === 'avg_wait' ? 'Avg Wait' : 'Median Wait')
                      : dataKey;
                    return (
                      <span>
                        {payload?.payload?.fullName ? <span className="font-medium">{payload.payload.fullName}: </span> : null}
                        {label}: {value} min
                      </span>
                    );
                  }}
                />

                {/* Staff table */}
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff</TableHead>
                        <TableHead className="text-right">Assessments</TableHead>
                        <TableHead className="text-right">Avg Wait</TableHead>
                        <TableHead className="text-right">Median Wait</TableHead>
                        <TableHead className="text-right">KETA Compliance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.staff_performance.map((staff) => (
                        <TableRow key={staff.user_id}>
                          <TableCell className="font-medium">{staff.name}</TableCell>
                          <TableCell className="text-right">{staff.assessment_count}</TableCell>
                          <TableCell className="text-right">{staff.avg_wait_minutes} min</TableCell>
                          <TableCell className="text-right">{staff.median_wait_minutes} min</TableCell>
                          <TableCell className="text-right">
                            <span
                              className={cn(
                                staff.keta_compliance_pct >= 90 && 'text-green-600',
                                staff.keta_compliance_pct >= 70 && staff.keta_compliance_pct < 90 && 'text-yellow-600',
                                staff.keta_compliance_pct < 70 && 'text-red-600 font-medium',
                              )}
                            >
                              {staff.keta_compliance_pct}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wait Time Trend */}
          {reportData.wait_time_trend.length > 0 && (() => {
            // Pivot trend data: one row per timestamp, one key per category
            const categories = [...new Set(reportData.wait_time_trend.map((t) => t.category))] as TriageCategory[];
            const byTimestamp = new Map<string, Record<string, unknown>>();
            for (const entry of reportData.wait_time_trend) {
              if (!byTimestamp.has(entry.timestamp)) {
                byTimestamp.set(entry.timestamp, { timestamp: entry.timestamp });
              }
              byTimestamp.get(entry.timestamp)![entry.category] = entry.avg_wait_minutes;
            }
            const pivotedData = [...byTimestamp.values()].sort((a, b) =>
              (a.timestamp as string).localeCompare(b.timestamp as string)
            );

            const trendConfig = createChartConfig(categories, {
              labels: Object.fromEntries(categories.map((c) => [c, c])),
              colors: Object.fromEntries(categories.map((c) => [c, CATEGORY_CHART_COLORS[c]])),
            });

            // Format x-axis labels based on granularity
            const isHourly = (pivotedData[0]?.timestamp as string)?.includes('T');
            const xFormatter = (val: string): string => {
              if (isHourly) {
                // "2026-05-01T14:00:00" → "14:00"
                const match = val.match(/T(\d{2}:\d{2})/);
                return match?.[1] ?? val;
              }
              // "2026-05-01" → "May 1"
              const d = new Date(val);
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            };

            return (
              <Card data-testid="wait-time-trend-section">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Wait Time Trends
                    </CardTitle>
                    <HelpPopover content="Average wait time over time by triage category. Hourly resolution for today/yesterday, daily for longer ranges. Useful for identifying peak hours and shift coverage gaps." />
                  </div>
                </CardHeader>
                <CardContent>
                  <LineChart
                    data={pivotedData}
                    config={trendConfig}
                    dataKeys={categories}
                    xAxisKey="timestamp"
                    showGrid
                    showXAxis
                    showYAxis
                    showTooltip
                    showLegend
                    showDots
                    lineType="monotone"
                    minHeight="300px"
                    xAxisFormatter={xFormatter}
                    yAxisFormatter={(v) => `${v}m`}
                  />
                </CardContent>
              </Card>
            );
          })()}

          {/* LWBS Section */}
          <Card data-testid="lwbs-section">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5" />
                  Left Without Being Seen (LWBS)
                </CardTitle>
                <HelpPopover content="Patients who left the facility before being seen by a clinician. High LWBS rates may indicate excessive wait times." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Total LWBS</p>
                  <p data-testid="lwbs-total" className="text-3xl font-bold">
                    {reportData.lwbs_stats.total_lwbs}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">LWBS Rate</p>
                  <p data-testid="lwbs-rate" className="text-3xl font-bold">
                    {reportData.lwbs_stats.lwbs_rate}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg Wait Before LWBS</p>
                  <p className="text-3xl font-bold">
                    {formatMinutes(reportData.lwbs_stats.avg_wait_before_lwbs_minutes)}
                  </p>
                </div>
              </div>

              {/* LWBS by Category */}
              <div>
                <h4 className="text-sm font-medium mb-3">LWBS by Category</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.lwbs_stats.by_category.map((item) => (
                      <TableRow key={item.category}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                'w-3 h-3 rounded-full',
                                CATEGORY_COLORS[item.category]
                              )}
                            />
                            {item.category}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(item.rate > 10 && 'text-red-600 font-medium')}
                          >
                            {item.rate}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

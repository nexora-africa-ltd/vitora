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
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { TrendIndicator, DonutChart, createChartConfig, ChartEmptyState } from '@/components/charts';
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
    onDateRangeChange(preset);
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Triage Reports</h1>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  const isEmpty = reportData.total_assessments === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Triage Reports</h1>
          <p className="text-muted-foreground">
            {formatDateRange(reportData.date_range.start, reportData.date_range.end)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onExport('pdf')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Range */}
            <div className="w-[180px]">
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

            {/* Area Filter */}
            <div className="w-[180px]">
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
            <div className="w-[160px]">
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
          <div data-testid="summary-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Wait Times by Category
              </CardTitle>
              <CardDescription>
                Analysis of wait times against KETA targets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table data-testid="wait-times-table">
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
            </CardContent>
          </Card>

          {/* Volume Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Volume by Category - DonutChart */}
            <Card data-testid="volume-section">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Volume by Category
                </CardTitle>
                <CardDescription>Distribution of triage assessments</CardDescription>
              </CardHeader>
              <CardContent>
                <TriageCategoryChart data={reportData.volume_by_category} />
              </CardContent>
            </Card>

            {/* Volume by Area */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Volume by Area
                </CardTitle>
                <CardDescription>Patient distribution by care area</CardDescription>
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

          {/* LWBS Section */}
          <Card data-testid="lwbs-section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogOut className="h-5 w-5" />
                Left Without Being Seen (LWBS)
              </CardTitle>
              <CardDescription>
                Analysis of patients who left before being seen
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
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

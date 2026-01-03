/**
 * WaitTimeStatsCard Component
 *
 * Dashboard card showing average wait times by KETA triage category.
 * Displays key metrics: overall average, median, and target met percentage.
 * Highlights categories where wait times exceed targets.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-reports.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import { Clock, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WaitTimeStats, TriageCategory } from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export interface WaitTimeStatsCardProps {
  /** Wait time statistics by category */
  stats: WaitTimeStats[];
  /** Overall average wait time in minutes */
  overallAvgMinutes: number;
  /** Overall median wait time in minutes */
  overallMedianMinutes: number;
  /** Percentage of patients seen within target time */
  targetMetPercentage: number;
  /** Date range for the stats */
  dateRange?: { start: string; end: string };
  /** Loading state */
  isLoading?: boolean;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Additional className */
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_COLORS: Record<TriageCategory, string> = {
  RED: 'bg-red-500',
  ORANGE: 'bg-orange-500',
  YELLOW: 'bg-yellow-500',
  GREEN: 'bg-green-500',
  BLUE: 'bg-blue-500',
};

const EXCEEDED_THRESHOLD = 15; // Percentage above which to highlight as warning

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}`;
}

function formatTarget(minutes: number): string {
  if (minutes === 0) return 'Imm';
  if (minutes < 60) return `${minutes}m`;
  return `${minutes / 60}h`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function LoadingSkeleton() {
  return (
    <div data-testid="wait-time-stats-loading" className="space-y-4">
      <div className="flex gap-4">
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

interface CategoryRowProps {
  stat: WaitTimeStats;
}

function CategoryRow({ stat }: CategoryRowProps) {
  const isExceeded = stat.exceeded_percentage > EXCEEDED_THRESHOLD;

  return (
    <div
      data-testid={`category-row-${stat.category}`}
      className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0"
    >
      {/* Category indicator */}
      <div
        data-testid="category-indicator"
        className={cn('w-2.5 h-2.5 rounded-full shrink-0', CATEGORY_COLORS[stat.category])}
      />

      {/* Category name */}
      <span className="w-14 text-sm font-medium">{stat.category}</span>

      {/* Target */}
      <span className="w-10 text-xs text-muted-foreground text-center">
        {formatTarget(stat.target_minutes)}
      </span>

      {/* Average wait */}
      <span className="w-12 text-sm text-right">{stat.avg_wait_minutes}m</span>

      {/* Exceeded */}
      <span className="w-8 text-xs text-center text-muted-foreground">{stat.exceeded_count}</span>

      {/* Exceeded percentage */}
      <span
        className={cn(
          'w-12 text-xs text-right',
          isExceeded ? 'text-red-600 font-medium' : 'text-muted-foreground'
        )}
      >
        {stat.exceeded_percentage}%
      </span>
    </div>
  );
}

function CompactStats({
  overallAvgMinutes,
  targetMetPercentage,
  stats,
}: {
  overallAvgMinutes: number;
  targetMetPercentage: number;
  stats: WaitTimeStats[];
}) {
  // Find categories with issues
  const problematicCategories = stats.filter((s) => s.exceeded_percentage > EXCEEDED_THRESHOLD);

  return (
    <div data-testid="compact-stats" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Avg Wait</span>
        </div>
        <span className="text-lg font-semibold">{overallAvgMinutes} min</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Target Met</span>
        </div>
        <span
          className={cn(
            'text-lg font-semibold',
            targetMetPercentage >= 85 ? 'text-green-600' : 'text-orange-600'
          )}
        >
          {targetMetPercentage}%
        </span>
      </div>

      {problematicCategories.length > 0 && (
        <div className="flex items-center gap-2 text-orange-600 text-xs mt-2">
          <AlertTriangle className="h-3 w-3" />
          <span>
            {problematicCategories.map((c) => c.category).join(', ')} exceeding targets
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * WaitTimeStatsCard - Dashboard widget for wait time statistics
 *
 * Features:
 * - Overall metrics (avg, median, target met %)
 * - Category breakdown with color indicators
 * - Exceeded count and percentage per category
 * - Warning highlighting for high exceeded rates
 * - Compact mode for dashboard widgets
 * - Loading and empty states
 * - Date range display
 */
export function WaitTimeStatsCard({
  stats,
  overallAvgMinutes,
  overallMedianMinutes,
  targetMetPercentage,
  dateRange,
  isLoading = false,
  compact = false,
  className,
}: WaitTimeStatsCardProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Wait Time Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingSkeleton />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = stats.length === 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Wait Time Statistics
          </CardTitle>
          {dateRange && (
            <span className="text-xs text-muted-foreground">
              {formatDateRange(dateRange.start, dateRange.end)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No data available</p>
          </div>
        ) : compact ? (
          <CompactStats
            overallAvgMinutes={overallAvgMinutes}
            targetMetPercentage={targetMetPercentage}
            stats={stats}
          />
        ) : (
          <div className="space-y-4">
            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Avg Wait</p>
                <p className="text-xl font-bold">{overallAvgMinutes}</p>
                <p className="text-xs text-muted-foreground">min</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Median</p>
                <p className="text-xl font-bold">{overallMedianMinutes}</p>
                <p className="text-xs text-muted-foreground">min</p>
              </div>
              <div className="text-center p-2 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Target Met</p>
                <p
                  className={cn(
                    'text-xl font-bold',
                    targetMetPercentage >= 85 ? 'text-green-600' : 'text-orange-600'
                  )}
                >
                  {targetMetPercentage}%
                </p>
              </div>
            </div>

            {/* Category breakdown header */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 pt-2">
              <span className="w-2.5" />
              <span className="w-14">Cat</span>
              <span className="w-10 text-center">Target</span>
              <span className="w-12 text-right">Avg</span>
              <span className="w-8 text-center">Exc</span>
              <span className="w-12 text-right">Rate</span>
            </div>

            {/* Category rows */}
            <div>
              {stats.map((stat) => (
                <CategoryRow key={stat.category} stat={stat} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

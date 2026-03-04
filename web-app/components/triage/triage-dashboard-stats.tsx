/**
 * Triage Dashboard Stats — second row of KPI cards
 *
 * Displays additional operational metrics below the primary KPI row:
 * - Today's volume with per-category breakdown
 * - Average triage assessment duration
 * - Longest current queue wait
 * - Active breach alert count with severity badges
 */
'use client';

import {
  Activity,
  AlertTriangle,
  Stethoscope,
  Timer,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TRIAGE_CATEGORY_CONFIG, type TriageCategory } from '@/lib/types/triage';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryVolume {
  category: TriageCategory;
  count: number;
  percentage: number;
}

interface WaitTimeStats {
  total_assessments?: number;
  current_queue?: {
    count: number;
    avg_wait_minutes: number;
    max_wait_minutes: number;
    longest_waiting_patient: number;
  };
  triage_duration?: {
    count: number;
    avg_minutes: number;
  };
}

interface BreachSummaryData {
  total_active: number;
  by_severity: Partial<Record<'CRITICAL' | 'URGENT' | 'WARNING' | 'INFO', number>>;
}

interface VolumeData {
  total: number;
  by_category: CategoryVolume[];
}

interface TriageDashboardStatsProps {
  waitTimeStats: WaitTimeStats | undefined;
  volumeData: VolumeData | undefined;
  breachSummary: BreachSummaryData | undefined;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CategoryPills({ categories }: { categories: CategoryVolume[] }) {
  if (!categories || categories.length === 0) {
    return <span className="text-xs text-muted-foreground">No data</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {categories.map(({ category, count }) => {
        const config = TRIAGE_CATEGORY_CONFIG[category];
        if (!config || count === 0) return null;
        return (
          <span
            key={category}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{
              backgroundColor: config.bgColor + '22',
              color: config.bgColor,
              border: `1px solid ${config.bgColor}44`,
            }}
          >
            {category} {count}
          </span>
        );
      })}
    </div>
  );
}

function BreachBadges({ summary }: { summary: BreachSummaryData }) {
  const severityConfig: Record<string, { label: string; className: string }> = {
    CRITICAL: { label: 'Crit', className: 'bg-destructive/15 text-destructive border-destructive/30' },
    URGENT: { label: 'Urg', className: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700' },
    WARNING: { label: 'Warn', className: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-700' },
    INFO: { label: 'Info', className: 'bg-muted text-muted-foreground' },
  };

  const severities = Object.entries(summary.by_severity).filter(([, count]) => count && count > 0);

  if (severities.length === 0) {
    return <span className="text-xs text-muted-foreground">None active</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {severities.map(([severity, count]) => {
        const config = severityConfig[severity];
        if (!config) return null;
        return (
          <Badge
            key={severity}
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0 h-4', config.className)}
          >
            {config.label} {count}
          </Badge>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card (compact)
// ---------------------------------------------------------------------------

interface MiniStatProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  unit?: string;
  footer?: React.ReactNode;
  variant?: 'default' | 'warning' | 'destructive';
}

function MiniStat({ icon, title, value, unit, footer, variant = 'default' }: MiniStatProps) {
  const borderVariant = {
    default: '',
    warning: 'border-warning/30 dark:border-warning/20',
    destructive: 'border-destructive/30',
  };
  const valueVariant = {
    default: '',
    warning: 'text-warning',
    destructive: 'text-destructive',
  };

  return (
    <Card className={cn('overflow-hidden', borderVariant[variant])}>
      <CardContent className="p-3 sm:p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs sm:text-sm font-medium truncate">{title}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn('text-xl sm:text-2xl font-bold tabular-nums', valueVariant[variant])}>
            {value}
          </span>
          {unit && <span className="text-xs sm:text-sm text-muted-foreground">{unit}</span>}
        </div>
        {footer && <div className="pt-0.5">{footer}</div>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TriageDashboardStats({
  waitTimeStats,
  volumeData,
  breachSummary,
  isLoading,
}: TriageDashboardStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-3 sm:p-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalVolume = volumeData?.total ?? waitTimeStats?.total_assessments ?? 0;
  const longestWait = waitTimeStats?.current_queue?.max_wait_minutes ?? 0;
  const avgDuration = waitTimeStats?.triage_duration?.avg_minutes ?? 0;
  const durationCount = waitTimeStats?.triage_duration?.count ?? 0;
  const totalBreaches = breachSummary?.total_active ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Today's Volume */}
      <MiniStat
        icon={<Activity className="h-4 w-4 shrink-0" />}
        title="Today's Volume"
        value={totalVolume}
        unit={totalVolume === 1 ? 'patient' : 'patients'}
        footer={<CategoryPills categories={volumeData?.by_category ?? []} />}
      />

      {/* Triage Duration */}
      <MiniStat
        icon={<Stethoscope className="h-4 w-4 shrink-0" />}
        title="Avg Triage Time"
        value={avgDuration > 0 ? Math.round(avgDuration) : '—'}
        unit={avgDuration > 0 ? 'min' : ''}
        footer={
          durationCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              From {durationCount} completed
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No completed today</span>
          )
        }
      />

      {/* Longest Queue Wait */}
      <MiniStat
        icon={<Timer className="h-4 w-4 shrink-0" />}
        title="Longest Wait"
        value={longestWait > 0 ? longestWait : '—'}
        unit={longestWait > 0 ? 'min' : ''}
        variant={longestWait > 60 ? 'destructive' : longestWait > 30 ? 'warning' : 'default'}
        footer={
          (waitTimeStats?.current_queue?.count ?? 0) > 0 ? (
            <span className="text-xs text-muted-foreground">
              {waitTimeStats?.current_queue?.count} in queue now
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Queue empty</span>
          )
        }
      />

      {/* Active Breaches */}
      <MiniStat
        icon={<AlertTriangle className="h-4 w-4 shrink-0" />}
        title="Active Breaches"
        value={totalBreaches}
        variant={totalBreaches > 0 ? (totalBreaches > 5 ? 'destructive' : 'warning') : 'default'}
        footer={
          breachSummary ? (
            <BreachBadges summary={breachSummary} />
          ) : (
            <span className="text-xs text-muted-foreground">No data</span>
          )
        }
      />
    </div>
  );
}

export default TriageDashboardStats;

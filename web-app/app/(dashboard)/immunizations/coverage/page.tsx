'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Syringe,
  Users,
  AlertTriangle,
  CalendarCheck,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { coverageApi, vaccineDefinitionsApi } from '@/lib/api/immunizations';
import type { CoverageStats, VaccineDefinition } from '@/lib/types/immunizations';

// =============================================================================
// Coverage Page
// =============================================================================

export default function CoveragePage() {
  const { refresh, isRefreshing } = usePageRefresh();

  const [vaccineCode, setVaccineCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryParams, setQueryParams] = useState<{
    vaccine_code: string;
    start_date?: string;
    end_date?: string;
  } | null>(null);

  // Fetch vaccine definitions for the dropdown
  const { data: vaccines = [], isLoading: vaccinesLoading } = useQuery<VaccineDefinition[]>({
    queryKey: ['vaccine-definitions'],
    queryFn: () => vaccineDefinitionsApi.list(),
  });

  // Fetch coverage only when user clicks "View Coverage"
  const {
    data: coverage,
    isLoading: coverageLoading,
    isFetching: coverageFetching,
    error: coverageError,
  } = useQuery<CoverageStats>({
    queryKey: ['immunization-coverage', queryParams],
    queryFn: () => coverageApi.get(queryParams!),
    enabled: !!queryParams,
  });

  const handleSubmit = () => {
    if (!vaccineCode) return;
    setQueryParams({
      vaccine_code: vaccineCode,
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
    });
  };

  // Deduplicate vaccines by code for the dropdown
  const uniqueVaccines = vaccines.reduce<VaccineDefinition[]>((acc, v) => {
    if (!acc.some((x) => x.code === v.code)) acc.push(v);
    return acc;
  }, []);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Immunization Coverage"
          helpContent="View coverage statistics for a specific vaccine. Select a vaccine and optionally a date range to see how many doses have been administered, missed, or are still scheduled."
        />

        {/* Filter Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="vaccine">Vaccine</Label>
                {vaccinesLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={vaccineCode} onValueChange={setVaccineCode}>
                    <SelectTrigger id="vaccine">
                      <SelectValue placeholder="Select vaccine" />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueVaccines.map((v) => (
                        <SelectItem key={v.code} value={v.code}>
                          {v.name} ({v.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleSubmit}
                  disabled={!vaccineCode || coverageFetching}
                  className="w-full"
                >
                  {coverageFetching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="mr-2 h-4 w-4" />
                  )}
                  View Coverage
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {coverageLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {coverageError && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                Failed to load coverage data. Please try again.
              </p>
            </CardContent>
          </Card>
        )}

        {coverage && !coverageLoading && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
              <StatCard
                label="Coverage Rate"
                value={`${coverage.coverage_pct}%`}
                icon={BarChart3}
                highlight={coverage.coverage_pct >= 80}
                warn={coverage.coverage_pct < 50}
              />
              <StatCard
                label="Total Records"
                value={coverage.total}
                icon={Users}
              />
              <StatCard
                label="Administered"
                value={coverage.administered}
                icon={Syringe}
                highlight
              />
              <StatCard
                label="Missed"
                value={coverage.missed}
                icon={AlertTriangle}
                warn={coverage.missed > 0}
              />
              <StatCard
                label="Scheduled"
                value={coverage.scheduled}
                icon={CalendarCheck}
              />
            </div>

            {/* Coverage Bar */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {coverage.vaccine_code} Coverage
                  </span>
                  <span className="text-muted-foreground">
                    {coverage.administered} / {coverage.total} doses administered
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      coverage.coverage_pct >= 80
                        ? 'bg-green-500'
                        : coverage.coverage_pct >= 50
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(coverage.coverage_pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0%</span>
                  <span>Target: 80%</span>
                  <span>100%</span>
                </div>
              </CardContent>
            </Card>

            {/* Empty state */}
            {coverage.total === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Syringe className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No immunization records found for {coverage.vaccine_code}
                    {startDate && ` from ${startDate}`}
                    {endDate && ` to ${endDate}`}.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* No query yet */}
        {!queryParams && !coverageLoading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Select a vaccine and click &quot;View Coverage&quot; to see statistics.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// Stat Card Component
// =============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  highlight,
  warn,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative flex items-center gap-3 pt-6">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            warn
              ? 'bg-destructive/10 text-destructive'
              : highlight
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

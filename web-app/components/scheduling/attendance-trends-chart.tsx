'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp } from 'lucide-react';
import { attendanceApi } from '@/lib/api/scheduling';
import type { AttendanceTrendWeek } from '@/lib/types/scheduling';

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
}

interface AttendanceTrendsChartProps {
  weeks?: number;
}

export function AttendanceTrendsChart({ weeks = 12 }: AttendanceTrendsChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-trends', weeks],
    queryFn: () => attendanceApi.trends({ weeks }),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((w: AttendanceTrendWeek) => ({
      ...w,
      label: formatWeekLabel(w.week_start),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Attendance Trends</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Attendance Trends</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No attendance data available yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Attendance Trends</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="onTimeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="hours"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                width={35}
              />
              <YAxis
                yAxisId="percent"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                width={35}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number, name: string) => {
                  if (name === 'On-Time Rate') return [`${value}%`, name];
                  if (name === 'Hours Worked') return [`${value}h`, name];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Area
                yAxisId="hours"
                type="monotone"
                dataKey="hours_worked"
                name="Hours Worked"
                stroke="hsl(var(--primary))"
                fill="url(#hoursGrad)"
                strokeWidth={2}
              />
              <Area
                yAxisId="percent"
                type="monotone"
                dataKey="on_time_rate"
                name="On-Time Rate"
                stroke="#22c55e"
                fill="url(#onTimeGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Summary row */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {chartData.length > 0 && (() => {
            const total = chartData.reduce((s: number, w: AttendanceTrendWeek & { label: string }) => s + w.hours_worked, 0);
            const avgRate = chartData.filter((w: AttendanceTrendWeek & { label: string }) => w.shifts_completed > 0)
              .reduce((s: number, w: AttendanceTrendWeek & { label: string }, _: number, a: (AttendanceTrendWeek & { label: string })[]) => s + w.on_time_rate / a.length, 0);
            const totalLate = chartData.reduce((s: number, w: AttendanceTrendWeek & { label: string }) => s + w.late_count, 0);
            return (
              <>
                <span>Total: <strong className="text-foreground">{Math.round(total)}h</strong></span>
                <span>Avg On-Time: <strong className="text-foreground">{Math.round(avgRate)}%</strong></span>
                <span>Late: <strong className="text-foreground">{totalLate}</strong></span>
              </>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

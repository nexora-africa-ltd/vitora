'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Activity, CalendarDays } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { qcResultsApi, qcLotsApi } from '@/lib/api/qc';
import type { QCLot, LeveyJenningsPoint } from '@/lib/types/qc';

interface ChartPoint {
  run_date: string;
  value: number;
  z_score: number | null;
  accepted: boolean;
}

export default function LeveyJenningsPage() {
  const { refresh, isRefreshing } = usePageRefresh();
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const { data: lotsData } = useQuery({
    queryKey: ['qc-lots-active'],
    queryFn: () => qcLotsApi.list({ status: 'ACTIVE' }),
  });

  const { data: ljData } = useQuery({
    queryKey: ['lj-chart', selectedLotId, selectedTestId, dateRange.from, dateRange.to],
    queryFn: () =>
      qcResultsApi.getLeveyJennings({
        lot_id: selectedLotId!,
        test_id: selectedTestId!,
      }),
    enabled: !!selectedLotId && !!selectedTestId,
  });

  const lots = lotsData?.results || [];
  const mean = ljData ? parseFloat(ljData.mean) : 0;
  const sd = ljData ? parseFloat(ljData.sd) : 0;
  const chartData = (ljData?.data_points || []).map((p: LeveyJenningsPoint) => ({
    run_date: p.run_date,
    value: parseFloat(p.value),
    z_score: p.z_score,
    accepted: p.accepted,
  }));

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Levey-Jennings Charts"
          helpContent="Visualize QC results over time. Select a lot to view the control chart with ±1SD, ±2SD, and ±3SD lines. Points outside limits trigger Westgard rule evaluation."
        />

        {/* Lot Selector & Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Chart Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label>QC Lot</Label>
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedLotId || ''}
                  onChange={(e) => setSelectedLotId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select a QC lot...</option>
                  {lots.map((lot: QCLot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.material_name} — {lot.lot_number}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <Label>Test ID</Label>
                <Input
                  type="number"
                  placeholder="Enter test ID"
                  value={selectedTestId || ''}
                  onChange={(e) => setSelectedTestId(e.target.value ? Number(e.target.value) : null)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>From</Label>
                <Input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>To</Label>
                <Input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDateRange({ from: '', to: '' })}
                >
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Levey-Jennings Chart */}
        {selectedLotId && selectedTestId && ljData && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Control Chart
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {ljData.test_name} — Mean: {ljData.mean} ± {ljData.sd} {ljData.unit}
                </span>
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                n={chartData.length}
              </Badge>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <div className="h-[300px] sm:h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="run_date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(val: string) => val.slice(5)}
                      />
                      <YAxis tick={{ fontSize: 11 }} domain={[mean - 4 * sd, mean + 4 * sd]} />
                      <Tooltip
                        labelFormatter={(label: string) => `Date: ${label}`}
                        formatter={(value: number) => [value.toFixed(2), 'Value']}
                      />

                      {/* Reference lines for mean and SD boundaries */}
                      <ReferenceLine y={mean} stroke="hsl(var(--primary))" strokeWidth={2} label="Mean" />
                      <ReferenceLine y={mean + sd} stroke="#22c55e" strokeDasharray="5 5" label="+1SD" />
                      <ReferenceLine y={mean - sd} stroke="#22c55e" strokeDasharray="5 5" label="-1SD" />
                      <ReferenceLine y={mean + 2 * sd} stroke="#eab308" strokeDasharray="3 3" label="+2SD" />
                      <ReferenceLine y={mean - 2 * sd} stroke="#eab308" strokeDasharray="3 3" label="-2SD" />
                      <ReferenceLine y={mean + 3 * sd} stroke="#ef4444" strokeDasharray="2 2" label="+3SD" />
                      <ReferenceLine y={mean - 3 * sd} stroke="#ef4444" strokeDasharray="2 2" label="-3SD" />

                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={(props: { cx: number; cy: number; payload: ChartPoint }) => {
                          const { cx, cy, payload } = props;
                          const color = !payload.accepted
                            ? '#ef4444'
                            : payload.z_score && Math.abs(payload.z_score) > 2
                            ? '#eab308'
                            : 'hsl(var(--primary))';
                          return (
                            <circle
                              key={`${cx}-${cy}`}
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={color}
                              stroke={color}
                              strokeWidth={1}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  No QC results recorded for this lot yet.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(!selectedLotId || !selectedTestId) && (
          <Card>
            <CardContent className="flex items-center justify-center h-[200px] text-muted-foreground">
              Select a QC lot and test above to view the Levey-Jennings control chart.
            </CardContent>
          </Card>
        )}
      </div>
    </PullToRefresh>
  );
}

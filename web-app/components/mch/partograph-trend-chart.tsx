'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Activity,
  Baby,
  ChevronDown,
  Grid3X3,
  HeartPulse,
  Layers,
  Thermometer,
  TrendingUp,
  Waves,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils';
import type { LabourPartographObservation } from '@/lib/types/mch';

// =============================================================================
// Types & Configuration
// =============================================================================

type PartographMetricKey =
  | 'fetal_heart_rate'
  | 'cervical_dilation'
  | 'descent_fifths'
  | 'contractions'
  | 'contraction_duration'
  | 'maternal_pulse'
  | 'systolic_bp'
  | 'diastolic_bp'
  | 'maternal_temp'
  | 'oxytocin';

type ChartType = 'line' | 'bar';

interface PartographMetricConfig {
  key: PartographMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  icon: typeof Activity;
  normalRange: [number, number];
  yDomain: [number, number];
  chartType: ChartType;
}

const METRIC_CONFIGS: PartographMetricConfig[] = [
  {
    key: 'fetal_heart_rate',
    label: 'Fetal Heart Rate',
    shortLabel: 'FHR',
    unit: 'bpm',
    color: '#dc2626', // red-600
    icon: Baby,
    normalRange: [110, 160],
    yDomain: [80, 200],
    chartType: 'line',
  },
  {
    key: 'cervical_dilation',
    label: 'Cervical Dilation',
    shortLabel: 'Cx',
    unit: 'cm',
    color: '#0d9488', // teal-600
    icon: Waves,
    normalRange: [0, 10],
    yDomain: [0, 10],
    chartType: 'line',
  },
  {
    key: 'descent_fifths',
    label: 'Descent (fifths)',
    shortLabel: 'Desc',
    unit: '/5',
    color: '#7c3aed', // violet-600
    icon: TrendingUp,
    normalRange: [0, 5],
    yDomain: [0, 5],
    chartType: 'line',
  },
  {
    key: 'contractions',
    label: 'Contractions',
    shortLabel: 'Ctx',
    unit: '/10min',
    color: '#9333ea', // purple-600
    icon: Activity,
    normalRange: [3, 5],
    yDomain: [0, 8],
    chartType: 'bar',
  },
  {
    key: 'contraction_duration',
    label: 'Contraction Duration',
    shortLabel: 'CtxDur',
    unit: 's',
    color: '#a855f7', // purple-500
    icon: Activity,
    normalRange: [20, 60],
    yDomain: [0, 120],
    chartType: 'bar',
  },
  {
    key: 'maternal_pulse',
    label: 'Maternal Pulse',
    shortLabel: 'Pulse',
    unit: 'bpm',
    color: '#2563eb', // blue-600
    icon: HeartPulse,
    normalRange: [60, 100],
    yDomain: [40, 140],
    chartType: 'line',
  },
  {
    key: 'systolic_bp',
    label: 'Systolic BP',
    shortLabel: 'SBP',
    unit: 'mmHg',
    color: '#8b5cf6', // violet-500
    icon: Activity,
    normalRange: [90, 140],
    yDomain: [60, 200],
    chartType: 'line',
  },
  {
    key: 'diastolic_bp',
    label: 'Diastolic BP',
    shortLabel: 'DBP',
    unit: 'mmHg',
    color: '#a78bfa', // violet-400
    icon: Activity,
    normalRange: [60, 90],
    yDomain: [30, 130],
    chartType: 'line',
  },
  {
    key: 'maternal_temp',
    label: 'Maternal Temp',
    shortLabel: 'Temp',
    unit: '°C',
    color: '#f59e0b', // amber-500
    icon: Thermometer,
    normalRange: [36.1, 37.2],
    yDomain: [35, 40],
    chartType: 'line',
  },
  {
    key: 'oxytocin',
    label: 'Oxytocin Rate',
    shortLabel: 'Oxy',
    unit: 'drops/min',
    color: '#059669', // emerald-600
    icon: Activity,
    normalRange: [0, 40],
    yDomain: [0, 60],
    chartType: 'line',
  },
];

const METRIC_COLOR_CLASSES: Record<PartographMetricKey, string> = {
  fetal_heart_rate: 'text-red-600',
  cervical_dilation: 'text-teal-600',
  descent_fifths: 'text-violet-600',
  contractions: 'text-purple-600',
  contraction_duration: 'text-purple-500',
  maternal_pulse: 'text-blue-600',
  systolic_bp: 'text-violet-500',
  diastolic_bp: 'text-violet-400',
  maternal_temp: 'text-amber-500',
  oxytocin: 'text-emerald-600',
};

// =============================================================================
// Helpers
// =============================================================================

function parseBP(bp: string): { systolic: number | null; diastolic: number | null } {
  const match = bp.match(/^(\d+)\/(\d+)$/);
  if (!match) return { systolic: null, diastolic: null };
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

interface ChartDataPoint {
  time: string;
  timestamp: string;
  fetal_heart_rate: number | null;
  cervical_dilation: number | null;
  descent_fifths: number | null;
  contractions: number | null;
  contraction_duration: number | null;
  maternal_pulse: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  maternal_temp: number | null;
  oxytocin: number | null;
}

function observationsToChartData(observations: LabourPartographObservation[]): ChartDataPoint[] {
  return observations.map((obs) => {
    const bp = parseBP(obs.maternal_blood_pressure);
    return {
      time: new Date(obs.observation_time).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      timestamp: obs.observation_time,
      fetal_heart_rate: obs.fetal_heart_rate,
      cervical_dilation: obs.cervical_dilation_cm ? Number(obs.cervical_dilation_cm) : null,
      descent_fifths: obs.descent_fifths,
      contractions: obs.contractions_per_10_min,
      contraction_duration: obs.contraction_duration_seconds,
      maternal_pulse: obs.maternal_pulse,
      systolic_bp: bp.systolic,
      diastolic_bp: bp.diastolic,
      maternal_temp: obs.maternal_temperature,
      oxytocin: obs.oxytocin_drops_per_min,
    };
  });
}

// =============================================================================
// Sub-components
// =============================================================================

function SingleMetricChart({
  data,
  config,
}: {
  data: ChartDataPoint[];
  config: PartographMetricConfig;
}) {
  const chartData = useMemo(
    () => data.filter((d) => d[config.key] != null),
    [data, config.key],
  );

  if (chartData.length === 0) return null;

  const [normalLow, normalHigh] = config.normalRange;
  const Icon = config.icon;
  const lastValue = chartData[chartData.length - 1]?.[config.key];

  if (config.chartType === 'bar') {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" style={{ color: config.color }} />
              <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
            </div>
            {lastValue != null && (
              <Badge variant="outline" className="text-xs font-mono">
                {lastValue} {config.unit}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={config.yDomain} tick={{ fontSize: 10 }} width={30} tickLine={false} axisLine={false} />
              <ReferenceArea y1={normalLow} y2={normalHigh} fill={config.color} fillOpacity={0.06} strokeOpacity={0} />
              <RechartsTooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0];
                  if (!d) return null;
                  const p = d.payload as { timestamp?: string } | undefined;
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className={cn('font-medium', METRIC_COLOR_CLASSES[config.key])}>
                        {config.label}: {d.value} {config.unit}
                      </p>
                      {p?.timestamp && (
                        <p className="text-xs text-muted-foreground">{new Date(p.timestamp).toLocaleString()}</p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey={config.key} fill={config.color} radius={[4, 4, 0, 0]} fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: config.color }} />
            <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
          </div>
          {lastValue != null && (
            <Badge variant="outline" className="text-xs font-mono">
              {lastValue} {config.unit}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis domain={config.yDomain} tick={{ fontSize: 10 }} width={30} tickLine={false} axisLine={false} />
            <ReferenceArea y1={normalLow} y2={normalHigh} fill={config.color} fillOpacity={0.06} strokeOpacity={0} />
            <ReferenceLine y={normalLow} stroke={config.color} strokeDasharray="3 3" opacity={0.3} />
            <ReferenceLine y={normalHigh} stroke={config.color} strokeDasharray="3 3" opacity={0.3} />
            <RechartsTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0];
                if (!d) return null;
                const p = d.payload as { timestamp?: string } | undefined;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className={cn('font-medium', METRIC_COLOR_CLASSES[config.key])}>
                      {config.label}: {d.value} {config.unit}
                    </p>
                    {p?.timestamp && (
                      <p className="text-xs text-muted-foreground">{new Date(p.timestamp).toLocaleString()}</p>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={config.key}
              stroke={config.color}
              strokeWidth={2}
              dot={{ r: 3, fill: config.color }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function CombinedChart({
  data,
  metrics,
}: {
  data: ChartDataPoint[];
  metrics: PartographMetricConfig[];
}) {
  // Separate line and bar metrics
  const lineMetrics = metrics.filter((m) => m.chartType === 'line');
  const barMetrics = metrics.filter((m) => m.chartType === 'bar');

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No partograph observations recorded
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {lineMetrics.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} width={35} tickLine={false} axisLine={false} />
            <RechartsTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as { timestamp?: string } | undefined;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
                    {p?.timestamp && (
                      <p className="text-xs text-muted-foreground">{new Date(p.timestamp).toLocaleString()}</p>
                    )}
                    {payload.map((entry) => {
                      const config = lineMetrics.find((c) => c.key === entry.dataKey);
                      if (!config || entry.value == null) return null;
                      return (
                        <p key={entry.dataKey} className={cn('text-xs font-medium', METRIC_COLOR_CLASSES[config.key])}>
                          {config.shortLabel}: {entry.value} {config.unit}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => {
                const config = lineMetrics.find((c) => c.key === value);
                return config?.shortLabel || value;
              }}
              iconType="line"
              wrapperStyle={{ fontSize: 11 }}
            />
            {lineMetrics.map((config) => (
              <Line
                key={config.key}
                type="monotone"
                dataKey={config.key}
                stroke={config.color}
                strokeWidth={2}
                dot={{ r: 2, fill: config.color }}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      {barMetrics.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} width={35} tickLine={false} axisLine={false} />
            <RechartsTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload as { timestamp?: string } | undefined;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
                    {p?.timestamp && (
                      <p className="text-xs text-muted-foreground">{new Date(p.timestamp).toLocaleString()}</p>
                    )}
                    {payload.map((entry) => {
                      const config = barMetrics.find((c) => c.key === entry.dataKey);
                      if (!config || entry.value == null) return null;
                      return (
                        <p key={entry.dataKey} className={cn('text-xs font-medium', METRIC_COLOR_CLASSES[config.key])}>
                          {config.shortLabel}: {entry.value} {config.unit}
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value) => {
                const config = barMetrics.find((c) => c.key === value);
                return config?.shortLabel || value;
              }}
              wrapperStyle={{ fontSize: 11 }}
            />
            {barMetrics.map((config) => (
              <Bar
                key={config.key}
                dataKey={config.key}
                fill={config.color}
                fillOpacity={0.8}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type ViewMode = 'grid' | 'combined';

interface PartographTrendChartProps {
  observations: LabourPartographObservation[];
  isLoading?: boolean;
  className?: string;
}

export function PartographTrendChart({
  observations,
  isLoading = false,
  className,
}: PartographTrendChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const chartData = useMemo(
    () => observationsToChartData(observations),
    [observations],
  );

  const availableMetrics = useMemo(() => {
    const withData = new Set<PartographMetricKey>();
    for (const point of chartData) {
      for (const config of METRIC_CONFIGS) {
        if (point[config.key] != null) {
          withData.add(config.key);
        }
      }
    }
    return METRIC_CONFIGS.filter((c) => withData.has(c.key));
  }, [chartData]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'grid' ? 'combined' : 'grid'));
  }, []);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Partograph Charts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[180px] rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (observations.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Partograph Charts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No observations recorded yet. Record an observation to see charts.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Partograph Charts</CardTitle>
            <HelpPopover content="Labour monitoring charts showing fetal heart rate, cervical dilation, descent, contractions, and maternal observations. Normal range bands are shown as shaded regions. Toggle between individual and combined views." />
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleViewMode}
                    className="h-8 gap-1.5"
                  >
                    {viewMode === 'grid' ? (
                      <Layers className="h-3.5 w-3.5" />
                    ) : (
                      <Grid3X3 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline text-xs">
                      {viewMode === 'grid' ? 'Combined' : 'Grid'}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Switch to {viewMode === 'grid' ? 'combined overlay' : 'individual grid'} view</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {observations.length} observation{observations.length !== 1 ? 's' : ''} recorded
        </p>
      </CardHeader>

      <CardContent>
        {viewMode === 'combined' ? (
          <CombinedChart data={chartData} metrics={availableMetrics} />
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {availableMetrics.map((config) => (
              <SingleMetricChart key={config.key} data={chartData} config={config} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

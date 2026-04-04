/**
 * Shared Vitals Trend Chart
 *
 * Reusable component for visualizing vital sign trends over time.
 * Used across encounters, admissions (inpatient), and emergency modules.
 *
 * Data sources:
 * - Encounter vitals (from encounter history / triage assessments)
 * - Inpatient nursing observations (temperature charts, BP monitoring)
 *
 * @example
 * ```tsx
 * <VitalsTrendChart
 *   data={vitalsData}
 *   title="Vitals Trends"
 *   defaultRange="24h"
 * />
 * ```
 */
'use client';

import { useMemo, useState, useCallback } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  Activity,
  Heart,
  Thermometer,
  Wind,
  Droplets,
  TrendingUp,
  BarChart3,
  Weight,
  Ruler,
  Calculator,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils/cn';

// =============================================================================
// Types
// =============================================================================

/** A single vitals data point with a timestamp */
export interface VitalsDataPoint {
  /** ISO timestamp or Date string */
  timestamp: string;
  /** Source label (e.g., "Triage", "Nurse", "Doctor") */
  source?: string;
  /** Temperature in °C */
  temperature?: number | null;
  /** Heart rate in bpm */
  heart_rate?: number | null;
  /** SpO2 percentage */
  spo2?: number | null;
  /** Respiratory rate breaths/min */
  respiratory_rate?: number | null;
  /** Systolic BP mmHg */
  systolic_bp?: number | null;
  /** Diastolic BP mmHg */
  diastolic_bp?: number | null;
  /** Weight kg */
  weight?: number | null;
  /** Height cm */
  height?: number | null;
  /** BMI kg/m² (computed from weight & height) */
  bmi?: number | null;
}

export type TimeRange =
  | '1h'
  | '6h'
  | '12h'
  | '24h'
  | '72h'
  | '7d'
  | '1mo'
  | '1y'
  | 'all';

export type VitalKey =
  | 'temperature'
  | 'heart_rate'
  | 'spo2'
  | 'respiratory_rate'
  | 'systolic_bp'
  | 'diastolic_bp'
  | 'weight'
  | 'height'
  | 'bmi';

interface VitalConfig {
  key: VitalKey;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  icon: typeof Activity;
  normalRange: [number, number];
  yDomain?: [number, number];
}

// =============================================================================
// Configuration
// =============================================================================

const VITAL_CONFIGS: VitalConfig[] = [
  {
    key: 'heart_rate',
    label: 'Heart Rate',
    shortLabel: 'HR',
    unit: 'bpm',
    color: '#ef4444', // red
    icon: Heart,
    normalRange: [60, 100],
    yDomain: [30, 180],
  },
  {
    key: 'spo2',
    label: 'SpO₂',
    shortLabel: 'SpO₂',
    unit: '%',
    color: '#3b82f6', // blue
    icon: Droplets,
    normalRange: [95, 100],
    yDomain: [70, 102],
  },
  {
    key: 'temperature',
    label: 'Temperature',
    shortLabel: 'Temp',
    unit: '°C',
    color: '#f59e0b', // amber
    icon: Thermometer,
    normalRange: [36.1, 37.2],
    yDomain: [34, 42],
  },
  {
    key: 'respiratory_rate',
    label: 'Respiratory Rate',
    shortLabel: 'RR',
    unit: '/min',
    color: '#10b981', // emerald
    icon: Wind,
    normalRange: [12, 20],
    yDomain: [0, 50],
  },
  {
    key: 'systolic_bp',
    label: 'Systolic BP',
    shortLabel: 'SBP',
    unit: 'mmHg',
    color: '#8b5cf6', // violet
    icon: Activity,
    normalRange: [90, 140],
    yDomain: [50, 220],
  },
  {
    key: 'diastolic_bp',
    label: 'Diastolic BP',
    shortLabel: 'DBP',
    unit: 'mmHg',
    color: '#a78bfa', // violet lighter
    icon: Activity,
    normalRange: [60, 90],
    yDomain: [30, 140],
  },
  {
    key: 'weight',
    label: 'Weight',
    shortLabel: 'Wt',
    unit: 'kg',
    color: '#0ea5e9', // sky
    icon: Weight,
    normalRange: [50, 90],
    yDomain: [0, 200],
  },
  {
    key: 'height',
    label: 'Height',
    shortLabel: 'Ht',
    unit: 'cm',
    color: '#64748b', // slate
    icon: Ruler,
    normalRange: [150, 185],
    yDomain: [50, 220],
  },
  {
    key: 'bmi',
    label: 'BMI',
    shortLabel: 'BMI',
    unit: 'kg/m²',
    color: '#14b8a6', // teal
    icon: Calculator,
    normalRange: [18.5, 24.9],
    yDomain: [10, 50],
  },
];

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; shortLabel: string }[] = [
  { value: '1h', label: 'Last hour', shortLabel: '1h' },
  { value: '6h', label: 'Last 6 hours', shortLabel: '6h' },
  { value: '12h', label: 'Last 12 hours', shortLabel: '12h' },
  { value: '24h', label: 'Last 24 hours', shortLabel: '24h' },
  { value: '72h', label: 'Last 3 days', shortLabel: '3d' },
  { value: '7d', label: 'Last 7 days', shortLabel: '7d' },
  { value: '1mo', label: 'Last month', shortLabel: '1mo' },
  { value: '1y', label: 'Last year', shortLabel: '1y' },
  { value: 'all', label: 'All time', shortLabel: 'All' },
];

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '72h': 72 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

const VITAL_COLOR_CLASSES: Record<VitalKey, string> = {
  heart_rate: 'text-red-500',
  spo2: 'text-blue-500',
  temperature: 'text-amber-500',
  respiratory_rate: 'text-emerald-500',
  systolic_bp: 'text-violet-500',
  diastolic_bp: 'text-violet-400',
  weight: 'text-sky-500',
  height: 'text-slate-500',
  bmi: 'text-teal-500',
};

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(timestamp: string, range: TimeRange): string {
  const date = new Date(timestamp);
  if (range === '1h' || range === '6h' || range === '12h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '24h' || range === '72h') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function filterByTimeRange(data: VitalsDataPoint[], range: TimeRange): VitalsDataPoint[] {
  if (range === 'all') return data;
  const cutoff = Date.now() - TIME_RANGE_MS[range];
  return data.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
}

// =============================================================================
// Sub-component: Single Vital Chart
// =============================================================================

function SingleVitalChart({
  data,
  config,
  range,
}: {
  data: VitalsDataPoint[];
  config: VitalConfig;
  range: TimeRange;
}) {
  const chartData = useMemo(
    () =>
      data
        .map((d) => ({
          time: formatTimestamp(d.timestamp, range),
          timestamp: d.timestamp,
          value: d[config.key] ?? undefined,
          source: d.source,
        }))
        .filter((d) => d.value !== undefined && d.value !== null),
    [data, config.key, range],
  );

  if (chartData.length === 0) {
    return null;
  }

  const Icon = config.icon;
  const [normalLow, normalHigh] = config.normalRange;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: config.color }} />
            <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
          </div>
          {chartData.length > 0 && chartData[chartData.length - 1] && (
            <Badge variant="outline" className="text-xs font-mono">
              {chartData[chartData.length - 1]!.value} {config.unit}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={config.yDomain || ['auto', 'auto']}
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              width={35}
              tickLine={false}
              axisLine={false}
            />
            {/* Normal range band */}
            <ReferenceArea
              y1={normalLow}
              y2={normalHigh}
              fill={config.color}
              fillOpacity={0.06}
              strokeOpacity={0}
            />
            <ReferenceLine y={normalLow} stroke={config.color} strokeDasharray="3 3" opacity={0.3} />
            <ReferenceLine y={normalHigh} stroke={config.color} strokeDasharray="3 3" opacity={0.3} />
            <RechartsTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0];
                if (!d) return null;
                const p = d.payload as { timestamp?: string; source?: string } | undefined;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="font-medium">
                      {d.value} {config.unit}
                    </p>
                    {p?.timestamp && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.timestamp).toLocaleString()}
                      </p>
                    )}
                    {p?.source && (
                      <p className="text-xs text-muted-foreground">
                        Source: {p.source}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
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

// =============================================================================
// Sub-component: Combined Chart (overlay view)
// =============================================================================

function CombinedVitalChart({
  data,
  vitals,
  range,
}: {
  data: VitalsDataPoint[];
  vitals: VitalKey[];
  range: TimeRange;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        time: formatTimestamp(d.timestamp, range),
        timestamp: d.timestamp,
        ...Object.fromEntries(vitals.map((k) => [k, d[k] ?? undefined])),
      })),
    [data, vitals, range],
  );

  const activeConfigs = VITAL_CONFIGS.filter((c) => vitals.includes(c.key));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No vitals data in this time range
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 10 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          className="text-muted-foreground"
          width={35}
          tickLine={false}
          axisLine={false}
        />
        <RechartsTooltip
          cursor={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const firstPayload = payload[0];
            const p = firstPayload?.payload as { timestamp?: string } | undefined;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md space-y-1">
                {p?.timestamp && (
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.timestamp).toLocaleString()}
                  </p>
                )}
                {payload.map((entry) => {
                  const config = activeConfigs.find((c) => c.key === entry.dataKey);
                  if (!config || entry.value == null) return null;
                  return (
                    <p key={entry.dataKey} className={cn('text-xs font-medium', VITAL_COLOR_CLASSES[config.key])}>
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
            const config = activeConfigs.find((c) => c.key === value);
            return config?.shortLabel || value;
          }}
          iconType="line"
          wrapperStyle={{ fontSize: 11 }}
        />
        {activeConfigs.map((config) => (
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
  );
}

// =============================================================================
// Main Component
// =============================================================================

type ViewMode = 'grid' | 'combined';

interface VitalsTrendChartProps {
  /** Array of vitals data points, sorted chronologically */
  data: VitalsDataPoint[];
  /** Title override */
  title?: string;
  /** Help content for the help popover */
  helpContent?: string;
  /** Default time range selection */
  defaultRange?: TimeRange;
  /** Which vitals to display (defaults to all that have data) */
  visibleVitals?: VitalKey[];
  /** Hide the time range selector */
  hideRangeSelector?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Compact mode (smaller charts) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function VitalsTrendChart({
  data,
  title = 'Vitals Trends',
  helpContent = 'Visualize vital sign trends over time. The shaded bands show normal ranges. Select a time range to focus on a specific period.',
  defaultRange = '24h',
  visibleVitals,
  hideRangeSelector = false,
  isLoading = false,
  compact = false,
  className,
}: VitalsTrendChartProps) {
  const [range, setRange] = useState<TimeRange>(defaultRange);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Compute BMI for each data point that has both weight and height
  const dataWithBMI = useMemo(() => {
    return data.map((d) => {
      if (d.weight != null && d.height != null && d.height > 0) {
        const heightM = d.height / 100;
        const bmi = Math.round((d.weight / (heightM * heightM)) * 10) / 10;
        return { ...d, bmi };
      }
      return d;
    });
  }, [data]);

  const filteredData = useMemo(() => filterByTimeRange(dataWithBMI, range), [dataWithBMI, range]);

  // Determine which vitals have data
  const availableVitals = useMemo(() => {
    const vitalsWithData = new Set<VitalKey>();
    for (const point of filteredData) {
      for (const config of VITAL_CONFIGS) {
        if (point[config.key] != null) {
          vitalsWithData.add(config.key);
        }
      }
    }
    return VITAL_CONFIGS.filter(
      (c) => vitalsWithData.has(c.key) && (!visibleVitals || visibleVitals.includes(c.key)),
    );
  }, [filteredData, visibleVitals]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'grid' ? 'combined' : 'grid'));
  }, []);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
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

  if (data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No vitals data available
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
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">{title}</CardTitle>
            <HelpPopover content={helpContent} />
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleViewMode}
                    aria-label={viewMode === 'grid' ? 'Switch to combined view' : 'Switch to grid view'}
                    className={cn(
                      'inline-flex items-center justify-center rounded-md h-8 w-8 border text-sm transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {viewMode === 'grid' ? 'Combined view' : 'Grid view'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Time range selector */}
            {!hideRangeSelector && (
              <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Data point count */}
        <p className="text-xs text-muted-foreground mt-1">
          {filteredData.length} reading{filteredData.length !== 1 ? 's' : ''} in range
        </p>
      </CardHeader>

      <CardContent>
        {viewMode === 'combined' ? (
          <CombinedVitalChart
            data={filteredData}
            vitals={availableVitals.map((v) => v.key)}
            range={range}
          />
        ) : (
          <div className={cn(
            'grid gap-4',
            compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
          )}>
            {availableVitals.map((config) => (
              <SingleVitalChart
                key={config.key}
                data={filteredData}
                config={config}
                range={range}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Exports
// =============================================================================

export { VITAL_CONFIGS, TIME_RANGE_OPTIONS, TIME_RANGE_MS };
export type { VitalConfig, VitalsTrendChartProps };

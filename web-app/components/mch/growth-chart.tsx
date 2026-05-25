'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import {
  generatePercentileLines,
  ageDaysToMonths,
  getIndicatorMeta,
  type GrowthIndicator,
  type Sex,
  type AgeRange,
} from '@/lib/data/who-growth';
import type { GrowthMeasurementListItem } from '@/lib/types/mch';

interface GrowthChartProps {
  measurements: GrowthMeasurementListItem[];
  sex: Sex;
  patientDob?: string;
  defaultIndicator?: GrowthIndicator;
  /** Precomputed percentile lines from API (optional, falls back to client-side calculation) */
  apiPercentileLines?: Record<string, { x: number; y: number }[]>;
  /** Age range for reference data: '0_5' (default), '5_19', '5_10', or 'all' */
  ageRange?: AgeRange;
  /** When true, suppress patient-context badges (used for the generic reference chart) */
  hidePatientContext?: boolean;
}

const INDICATOR_OPTIONS: { value: GrowthIndicator; label: string }[] = [
  { value: 'weight_for_age', label: 'Weight-for-Age' },
  { value: 'height_for_age', label: 'Height-for-Age' },
  { value: 'weight_for_height', label: 'Weight-for-Height' },
  { value: 'head_circumference_for_age', label: 'Head Circumference' },
  { value: 'bmi_for_age', label: 'BMI-for-Age' },
  { value: 'muac_for_age', label: 'MUAC-for-Age' },
];

/** MUAC severity cutoffs (cm) — used as horizontal reference lines */
const MUAC_SAM_CUTOFF = 11.5; // < 11.5 = Severe Acute Malnutrition
const MUAC_MAM_CUTOFF = 12.5; // 11.5–12.4 = Moderate Acute Malnutrition

/**
 * Merge WHO percentile-line reference data + patient measurement data
 * into a single dataset suitable for Recharts.
 *
 * X dimension depends on indicator:
 *   - weight_for_height: x = length/height in cm
 *   - all other indicators: x = age in months
 */
function buildChartData(
  percentileLines: Record<string, { x: number; y: number }[]>,
  measurements: GrowthMeasurementListItem[],
  indicator: GrowthIndicator,
) {
  const isHeightAxis = indicator === 'weight_for_height';
  const map = new Map<number, Record<string, number | null>>();

  // Add percentile reference points. For age-based indicators, the source x is
  // in days; we convert to months. For weight_for_height the source x is
  // already in centimetres and is used as-is.
  for (const [key, points] of Object.entries(percentileLines)) {
    for (const pt of points) {
      const x = isHeightAxis
        ? Math.round(pt.x * 10) / 10
        : Math.round(ageDaysToMonths(pt.x) * 10) / 10;
      if (!map.has(x)) {
        map.set(x, { x, patient: null });
      }
      map.get(x)![key] = pt.y;
    }
  }

  // Add patient measurements
  for (const m of measurements) {
    let x: number | null = null;
    let value: number | null = null;

    if (indicator === 'weight_for_height') {
      if (m.height == null || m.weight == null) continue;
      x = Math.round(m.height * 10) / 10;
      value = m.weight;
    } else {
      x = Math.round(ageDaysToMonths(m.age_in_days) * 10) / 10;
      switch (indicator) {
        case 'weight_for_age':
          value = m.weight;
          break;
        case 'height_for_age':
          value = m.height;
          break;
        case 'head_circumference_for_age':
          // head_circumference is not exposed on the list-item serializer;
          // patient line stays null until the detail field is wired through.
          value = null;
          break;
        case 'bmi_for_age':
          if (m.weight && m.height) {
            const heightM = m.height / 100;
            value = Math.round((m.weight / (heightM * heightM)) * 100) / 100;
          }
          break;
        case 'muac_for_age':
          value = m.muac;
          break;
      }
    }

    if (x == null) continue;
    if (!map.has(x)) {
      map.set(x, { x });
    }
    const row = map.get(x)!;
    row.patient = value;
  }

  // Sort ascending so Recharts draws a clean line
  return Array.from(map.values()).sort(
    (a, b) => (a.x as number) - (b.x as number),
  );
}

/**
 * GrowthChart — Recharts line chart with WHO percentile reference bands.
 *
 * Shows WHO Z-score bands (-3 to +3) as shaded reference areas,
 * with patient measurement points plotted as the primary line.
 */
export function GrowthChart({
  measurements,
  sex,
  defaultIndicator = 'weight_for_age',
  apiPercentileLines,
  ageRange = '0_5',
  hidePatientContext = false,
}: GrowthChartProps) {
  const [indicator, setIndicator] = useState<GrowthIndicator>(defaultIndicator);
  const [displaySex, setDisplaySex] = useState<Sex>(sex);

  // Keep displaySex in sync when the patient (sex prop) changes — without this,
  // selecting a different patient leaves the toggle stuck on the previous sex.
  useEffect(() => {
    setDisplaySex(sex);
  }, [sex]);

  const meta = getIndicatorMeta(indicator);

  // Determine effective age range for the selected indicator
  const effectiveAgeRange = useMemo(() => {
    // Head circumference only has 0-5y data
    if (indicator === 'head_circumference_for_age') return '0_5' as AgeRange;
    // Weight-for-age only goes to 10y
    if (indicator === 'weight_for_age' && (ageRange === '5_19' || ageRange === 'all')) {
      return ageRange === '5_19' ? '5_10' as AgeRange : 'all' as AgeRange;
    }
    return ageRange;
  }, [indicator, ageRange]);

  // Compute percentile lines client-side from bundled WHO LMS data.
  // We intentionally ignore `apiPercentileLines` here because the API value is
  // fetched for a single (indicator, sex) pair, so it would not update when the
  // user toggles indicator or boys/girls in this component.
  void apiPercentileLines;
  const percentileLines = useMemo(
    () => generatePercentileLines(indicator, displaySex, effectiveAgeRange),
    [indicator, displaySex, effectiveAgeRange],
  );

  // Build merged chart data
  const chartData = useMemo(
    () => buildChartData(percentileLines, measurements, indicator),
    [percentileLines, measurements, indicator],
  );

  const isMuac = indicator === 'muac_for_age';
  const isHeightAxis = indicator === 'weight_for_height';

  // For MUAC we have no WHO LMS bands — synthesise an age span (0–60 months)
  // so the chart always renders, then overlay horizontal SAM/MAM cutoff lines.
  const muacChartData = useMemo(() => {
    if (!isMuac) return chartData;
    const rows: Record<string, number | null>[] = [];
    for (let m = 0; m <= 60; m += 6) {
      rows.push({ x: m, patient: null });
    }
    // Merge in any actual patient points
    for (const row of chartData) {
      rows.push(row);
    }
    return rows.sort((a, b) => (a.x as number) - (b.x as number));
  }, [isMuac, chartData]);

  const effectiveChartData = isMuac ? muacChartData : chartData;
  const hasData = effectiveChartData.length > 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-semibold">{meta.label}</h3>
          <Badge variant={displaySex === 'M' ? 'default' : 'secondary'} className="text-xs">
            {displaySex === 'M' ? 'Boys' : 'Girls'} reference
          </Badge>
          {!hidePatientContext && displaySex !== sex && (
            <Badge variant="outline" className="text-xs">
              Patient is {sex === 'M' ? 'Male' : 'Female'}
            </Badge>
          )}
          <HelpPopover content="WHO growth chart showing the child's measurements against international reference standards. The reference bands are sex-specific: switch the Boys/Girls toggle to compare. Green zone is normal (-1 to +1 Z), yellow is mild concern (-2 to -1), orange is moderate (-3 to -2), red is severe (below -3)." />
        </div>
        <div className="flex gap-2">
          <Select value={indicator} onValueChange={(v) => setIndicator(v as GrowthIndicator)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDICATOR_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={displaySex} onValueChange={(v) => setDisplaySex(v as Sex)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Boys</SelectItem>
              <SelectItem value="F">Girls</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {isMuac ? (
          <>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
              <span>SAM (&lt; 11.5 cm)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500" />
              <span>MAM (11.5–12.4 cm)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500" />
              <span>Normal (≥ 12.5 cm)</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500" />
              <span>Severe (&lt; -3 Z)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-orange-500/30 border border-orange-500" />
              <span>Moderate (-3 to -2 Z)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-yellow-500/30 border border-yellow-500" />
              <span>Mild (-2 to -1 Z)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500" />
              <span>Normal (-1 to +1 Z)</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-blue-600" />
          <span>Patient</span>
        </div>
      </div>

      {/* Chart — full on md+, simplified card on mobile */}
      <div className="hidden md:block">
        {hasData ? (
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={effectiveChartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={isMuac ? [0, 60] : ['dataMin', 'dataMax']}
                  label={{ value: meta.xAxisLabel, position: 'insideBottom', offset: -5 }}
                  tickFormatter={(v) => `${Math.round(v)}`}
                />
                <YAxis
                  domain={isMuac ? [8, 18] : ['auto', 'auto']}
                  label={{ value: meta.yAxisLabel, angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = {
                      z_neg3: '-3 Z (severe)',
                      z_neg2: '-2 Z (moderate)',
                      z_neg1: '-1 Z (mild)',
                      z_0: 'Median (0 Z)',
                      z_pos1: '+1 Z',
                      z_pos2: '+2 Z',
                      z_pos3: '+3 Z',
                      patient: 'Patient',
                      sam: 'SAM cutoff',
                      mam: 'MAM cutoff',
                    };
                    return [value?.toFixed(1), labels[name] || name];
                  }}
                  labelFormatter={(label) =>
                    isHeightAxis ? `Height: ${label} cm` : `Age: ${label} months`
                  }
                />

                {isMuac ? (
                  <>
                    {/* MUAC threshold zones */}
                    <ReferenceArea y1={0} y2={MUAC_SAM_CUTOFF} fill="#ef4444" fillOpacity={0.08} />
                    <ReferenceArea
                      y1={MUAC_SAM_CUTOFF}
                      y2={MUAC_MAM_CUTOFF}
                      fill="#eab308"
                      fillOpacity={0.08}
                    />
                    <ReferenceArea y1={MUAC_MAM_CUTOFF} y2={18} fill="#22c55e" fillOpacity={0.06} />
                    <ReferenceLine
                      y={MUAC_SAM_CUTOFF}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{ value: 'SAM 11.5', position: 'right', fill: '#ef4444', fontSize: 10 }}
                    />
                    <ReferenceLine
                      y={MUAC_MAM_CUTOFF}
                      stroke="#eab308"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      label={{ value: 'MAM 12.5', position: 'right', fill: '#a16207', fontSize: 10 }}
                    />
                  </>
                ) : (
                  <ReferenceArea y1={0} y2={undefined} fill="#ef4444" fillOpacity={0.05} />
                )}

                {/* Z-score reference lines (skipped for MUAC) */}
                {!isMuac && (
                  <>
                <Line
                  dataKey="z_neg3"
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_neg3"
                  connectNulls
                />
                <Line
                  dataKey="z_neg2"
                  stroke="#f97316"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_neg2"
                  connectNulls
                />
                <Line
                  dataKey="z_neg1"
                  stroke="#eab308"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_neg1"
                  connectNulls
                />
                <Line
                  dataKey="z_0"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="z_0"
                  connectNulls
                />
                <Line
                  dataKey="z_pos1"
                  stroke="#eab308"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_pos1"
                  connectNulls
                />
                <Line
                  dataKey="z_pos2"
                  stroke="#f97316"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_pos2"
                  connectNulls
                />
                <Line
                  dataKey="z_pos3"
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  dot={false}
                  name="z_pos3"
                  connectNulls
                />
                  </>
                )}

                {/* Patient measurements — primary line */}
                <Line
                  dataKey="patient"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ fill: '#2563eb', r: 5, strokeWidth: 2 }}
                  activeDot={{ r: 7 }}
                  name="patient"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No data available for this chart type.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile: simplified card view */}
      <div className="md:hidden space-y-3">
        {measurements.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No measurements recorded yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Growth chart is best viewed on a larger screen. Showing individual measurements below.
            </p>
            {measurements.map((m) => {
              const ageMonths = Math.floor(m.age_in_days / 30);
              return (
                <Card key={m.id} className={m.has_critical_flag ? 'border-red-200' : ''}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-center">
                      <div className="text-sm">
                        <span className="font-medium">{ageMonths} months</span>
                        {m.weight && (
                          <span className="text-muted-foreground ml-2">{m.weight} kg</span>
                        )}
                        {m.height && (
                          <span className="text-muted-foreground ml-2">{m.height} cm</span>
                        )}
                      </div>
                      {m.nutritional_status && (
                        <Badge
                          variant={m.has_critical_flag ? 'destructive' : 'outline'}
                          className="text-xs"
                        >
                          {m.nutritional_status.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

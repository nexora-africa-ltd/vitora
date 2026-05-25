'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import {
  ComposedChart,
  Line,
  Area,
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
import { Button } from '@/components/ui/button';
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
import { printGrowthBooklet } from '@/lib/documents/print-growth-booklet';

interface GrowthChartProps {
  measurements: GrowthMeasurementListItem[];
  sex: Sex;
  patientDob?: string;
  /** Optional patient identifiers for the printed booklet header */
  patientName?: string;
  patientMrn?: string;
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
 * Kenya KEPI immunization schedule — ages in months at which each
 * vaccine is administered. Rendered as vertical ReferenceLines in
 * MCH booklet mode so caregivers can correlate measurements with visits.
 * `dy` staggers labels vertically to prevent overlap at closely-spaced ages.
 */
const KENYA_VACCINE_SCHEDULE: { ageMonths: number; label: string; dy: number }[] = [
  { ageMonths: 0, label: 'BCG', dy: 0 },
  { ageMonths: 1.5, label: 'P1', dy: 0 },
  { ageMonths: 2.5, label: 'P2', dy: 12 },
  { ageMonths: 3.5, label: 'P3', dy: 0 },
  { ageMonths: 9, label: 'MR1', dy: 0 },
  { ageMonths: 18, label: 'MR2', dy: 0 },
];

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
  patientDob,
  patientName,
  patientMrn,
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

  // MCH booklet view (Kenya "Road to Health" style) is available for the two
  // growth indicators tracked in the physical booklet — weight-for-age and
  // height-for-age. Both plot a single shaded "healthy road" between the 3rd
  // and 97th centile (≈ ±2 Z) with the median as a target line.
  const [viewMode, setViewMode] = useState<'who' | 'mch_booklet'>('who');
  const bookletSupported =
    indicator === 'weight_for_age' || indicator === 'height_for_age';
  const booklet = viewMode === 'mch_booklet' && bookletSupported;

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

  // For the MCH booklet view, derive the "road" band per x point by stacking
  // an invisible base Area at z_neg2 and a filled Area of width (z_pos2 - z_neg2).
  const bookletChartData = useMemo(() => {
    if (!booklet) return effectiveChartData;
    return effectiveChartData.map((row) => {
      const low = (row.z_neg2 as number | null) ?? null;
      const high = (row.z_pos2 as number | null) ?? null;
      const band = low != null && high != null ? Math.max(high - low, 0) : null;
      return { ...row, road_low: low, road_band: band };
    });
  }, [booklet, effectiveChartData]);

  const chartRenderData = booklet ? bookletChartData : effectiveChartData;

  // For age-based charts (i.e. anything except weight-for-height), emit a tick
  // every month so the x axis is easier to read. Booklet mode always covers
  // 0\u201360 months to match the printed Kenya MCH booklet.
  const xDomain = useMemo<[number, number] | ['dataMin', 'dataMax']>(() => {
    if (booklet) return [0, 60];
    if (isMuac) return [0, 60];
    return ['dataMin', 'dataMax'];
  }, [booklet, isMuac]);

  const xTicks = useMemo<number[] | undefined>(() => {
    if (isHeightAxis) return undefined;
    let min = 0;
    let max = 0;
    if (Array.isArray(xDomain) && typeof xDomain[0] === 'number') {
      min = xDomain[0] as number;
      max = xDomain[1] as number;
    } else if (chartRenderData.length > 0) {
      const xs = chartRenderData.map((r) => r.x as number);
      min = Math.floor(Math.min(...xs));
      max = Math.ceil(Math.max(...xs));
    } else {
      return undefined;
    }
    const span = max - min;
    // Keep label density readable \u2014 step out beyond 24 months.
    const step = span <= 24 ? 1 : span <= 60 ? 2 : 6;
    const ticks: number[] = [];
    for (let t = min; t <= max; t += step) ticks.push(t);
    return ticks;
  }, [isHeightAxis, xDomain, chartRenderData]);

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    // Extract the live Recharts <svg> from the on-screen container.
    const svg = chartContainerRef.current?.querySelector('svg') as
      | SVGSVGElement
      | null;
    const resolvedName =
      patientName ?? measurements[0]?.patient_name ?? undefined;
    printGrowthBooklet({
      chartSvgElement: svg,
      indicatorLabel: meta.label,
      sexLabel: displaySex === 'M' ? 'Boys' : 'Girls',
      patientName: hidePatientContext ? undefined : resolvedName,
      patientMrn: hidePatientContext ? undefined : patientMrn,
      patientDob: hidePatientContext ? undefined : patientDob,
    });
  };

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

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
        <div className="flex gap-2 flex-wrap">
          {bookletSupported && (
            <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'who' ? 'default' : 'ghost'}
                className="h-8 px-3 text-xs"
                onClick={() => setViewMode('who')}
              >
                WHO
              </Button>
              <Button
                type="button"
                size="sm"
                variant={viewMode === 'mch_booklet' ? 'default' : 'ghost'}
                className="h-8 px-3 text-xs"
                onClick={() => setViewMode('mch_booklet')}
              >
                MCH booklet
              </Button>
            </div>
          )}
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
          {booklet && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 print:hidden"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {booklet ? (
          <>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-green-500/30 border border-green-600" />
              <span>Healthy road (3rd–97th centile)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-0.5 bg-green-700" />
              <span>Median (target)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 border-t border-dashed border-purple-600" />
              <span>Vaccine due (KEPI)</span>
            </div>
          </>
        ) : isMuac ? (
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
      <div
        ref={chartContainerRef}
        className={`hidden md:block ${booklet ? 'mch-booklet-print' : ''}`}
      >
        {booklet && (
          <div className="hidden print:block mb-3 text-center">
            <h2 className="text-lg font-bold">
              Kenya MCH Booklet — {meta.label}
            </h2>
            <p className="text-xs">
              {displaySex === 'M' ? 'Boys' : 'Girls'} · 0–60 months · WHO 3rd–97th centile road
            </p>
          </div>
        )}
        {hasData ? (
          <div className="h-[400px] w-full print:h-[14cm]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartRenderData} margin={{ top: 32, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="x"
                  type="number"
                  domain={xDomain}
                  ticks={xTicks}
                  interval={0}
                  label={{ value: meta.xAxisLabel, position: 'insideBottom', offset: -5 }}
                  tickFormatter={(v) => `${Math.round(v)}`}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  domain={isMuac ? [8, 18] : ['auto', 'auto']}
                  label={{ value: meta.yAxisLabel, angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    color: 'hsl(var(--popover-foreground))',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: 'hsl(var(--popover-foreground))', fontWeight: 600 }}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }}
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

                {booklet ? (
                  <>
                    {/* MCH booklet "Road to Health" — green band between 3rd
                        and 97th centile (~±2 Z) with median target line.
                        Implemented as a stacked Area: invisible base at the
                        lower edge, then a filled band of width (high-low). */}
                    <Area
                      type="monotone"
                      dataKey="road_low"
                      stackId="road"
                      stroke="none"
                      fill="transparent"
                      isAnimationActive={false}
                      legendType="none"
                    />
                    <Area
                      type="monotone"
                      dataKey="road_band"
                      stackId="road"
                      stroke="none"
                      fill="#22c55e"
                      fillOpacity={0.18}
                      isAnimationActive={false}
                      legendType="none"
                    />
                    <Line
                      dataKey="z_neg2"
                      stroke="#16a34a"
                      strokeWidth={1.5}
                      dot={false}
                      name="z_neg2"
                      connectNulls
                    />
                    <Line
                      dataKey="z_pos2"
                      stroke="#16a34a"
                      strokeWidth={1.5}
                      dot={false}
                      name="z_pos2"
                      connectNulls
                    />
                    <Line
                      dataKey="z_0"
                      stroke="#15803d"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      name="z_0"
                      connectNulls
                    />
                    {/* Kenya KEPI vaccine schedule markers */}
                    {KENYA_VACCINE_SCHEDULE.map((v) => (
                      <ReferenceLine
                        key={v.label}
                        x={v.ageMonths}
                        stroke="#7c3aed"
                        strokeWidth={1}
                        strokeDasharray="2 3"
                        label={{
                          value: v.label,
                          position: 'top',
                          fill: '#6d28d9',
                          fontSize: 9,
                          dy: v.dy,
                        }}
                      />
                    ))}
                  </>
                ) : isMuac ? (
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

                {/* Z-score reference lines (skipped for MUAC and booklet view) */}
                {!isMuac && !booklet && (
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
              </ComposedChart>
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

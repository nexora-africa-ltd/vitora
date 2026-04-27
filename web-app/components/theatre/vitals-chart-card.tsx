'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { HelpPopover } from '@/components/shared/help-popover';
import type { IntraOpVital } from '@/lib/types/theatre';
import { CRITICAL_THRESHOLDS, vitalBadgeVariant } from '@/lib/vitals-thresholds';

interface VitalsChartCardProps {
  vitals: IntraOpVital[];
}

const PARAMETER_CONFIG = [
  { key: 'heartRate', label: 'HR', color: '#ef4444', defaultOn: true, thresholdField: 'heart_rate' },
  { key: 'spo2', label: 'SpO2', color: '#0ea5e9', defaultOn: true, thresholdField: 'spo2' },
  { key: 'etco2', label: 'EtCO2', color: '#14b8a6', defaultOn: true, thresholdField: 'etco2' },
  { key: 'respRate', label: 'RR', color: '#8b5cf6', defaultOn: false, thresholdField: 'respiratory_rate' },
  { key: 'temperature', label: 'Temp', color: '#f59e0b', defaultOn: false, thresholdField: null },
  { key: 'map', label: 'MAP', color: '#6366f1', defaultOn: false, thresholdField: null },
] as const;

export function VitalsChartCard({ vitals }: VitalsChartCardProps) {
  const [visibleParams, setVisibleParams] = useState<Set<string>>(
    () => new Set(PARAMETER_CONFIG.filter((p) => p.defaultOn).map((p) => p.key))
  );
  const [showThresholds, setShowThresholds] = useState(true);

  const showBP = visibleParams.has('bp');

  const toggleParam = (key: string) => {
    setVisibleParams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartData = useMemo(
    () =>
      vitals.map((v) => ({
        time: new Date(v.recorded_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        heartRate: v.heart_rate ?? null,
        spo2: v.spo2 ?? null,
        etco2: v.etco2 ?? null,
        respRate: v.respiratory_rate ?? null,
        temperature: v.temperature ? parseFloat(v.temperature) : null,
        map: v.mean_arterial_pressure ?? null,
        systolicBp: v.systolic_bp ?? null,
        diastolicBp: v.diastolic_bp ?? null,
      })),
    [vitals]
  );

  const latestVital = vitals[vitals.length - 1];
  const hasCritical = latestVital?.has_critical_vitals;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Anesthesia Vitals Trend
            <HelpPopover content="Time-series chart of intra-operative vital signs. Toggle individual parameters and threshold reference lines. BP band shows systolic/diastolic envelope. Summary badges highlight values outside normal ranges." />
          </CardTitle>
          {hasCritical && (
            <Badge variant="destructive" size="sm" className="animate-pulse">
              Critical
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasCritical && latestVital?.alerts?.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Critical Vitals Detected</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc pl-4 text-sm">
                {latestVital.alerts.map((alert, i) => (
                  <li key={i}>{alert}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {vitals.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No vitals yet</AlertTitle>
            <AlertDescription>
              Add the first intra-operative vital to start the graph.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Parameter toggles */}
            <div className="flex flex-wrap gap-3">
              {PARAMETER_CONFIG.map((p) => (
                <label key={p.key} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={visibleParams.has(p.key)}
                    onCheckedChange={() => toggleParam(p.key)}
                  />
                  <span style={{ color: p.color }}>{p.label}</span>
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={showBP}
                  onCheckedChange={() => toggleParam('bp')}
                />
                <span className="text-pink-500">BP band</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={showThresholds}
                  onCheckedChange={() => setShowThresholds(!showThresholds)}
                />
                <span className="text-red-400">Thresholds</span>
              </label>
            </div>

            <div className="h-64 rounded-lg border p-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />

                  {/* Critical threshold reference lines for visible parameters */}
                  {showThresholds &&
                    PARAMETER_CONFIG.filter(
                      (p) => visibleParams.has(p.key) && p.thresholdField
                    ).map((p) => {
                      const bounds = CRITICAL_THRESHOLDS[p.thresholdField!];
                      if (!bounds) return null;
                      const [low, high] = bounds;
                      return (
                        <>{/* Use fragments to return multiple reference lines per param */}
                          {low != null && (
                            <ReferenceLine
                              key={`${p.key}-low`}
                              y={low}
                              stroke={p.color}
                              strokeDasharray="6 3"
                              strokeOpacity={0.5}
                              label={{ value: `${p.label} ↓${low}`, position: 'insideBottomLeft', fontSize: 10, fill: p.color }}
                            />
                          )}
                          {high != null && (
                            <ReferenceLine
                              key={`${p.key}-high`}
                              y={high}
                              stroke={p.color}
                              strokeDasharray="6 3"
                              strokeOpacity={0.5}
                              label={{ value: `${p.label} ↑${high}`, position: 'insideTopLeft', fontSize: 10, fill: p.color }}
                            />
                          )}
                        </>
                      );
                    })}

                  {/* BP shaded band (systolic → diastolic) */}
                  {showBP && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="systolicBp"
                        stroke="#ec4899"
                        fill="#ec489930"
                        strokeWidth={1.5}
                        dot={false}
                        name="SBP"
                        connectNulls
                      />
                      <Area
                        type="monotone"
                        dataKey="diastolicBp"
                        stroke="#ec4899"
                        fill="#ffffff"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        name="DBP"
                        connectNulls
                      />
                    </>
                  )}

                  {PARAMETER_CONFIG.map(
                    (p) =>
                      visibleParams.has(p.key) && (
                        <Line
                          key={p.key}
                          type="monotone"
                          dataKey={p.key}
                          stroke={p.color}
                          strokeWidth={2}
                          dot={false}
                          name={p.label}
                          connectNulls
                        />
                      )
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Latest vital summary — threshold-aware badges */}
            {latestVital && (
              <div className="flex flex-wrap gap-2 text-xs">
                {latestVital.heart_rate != null && (
                  <Badge variant={vitalBadgeVariant('heart_rate', latestVital.heart_rate)} size="sm">
                    HR {latestVital.heart_rate}
                  </Badge>
                )}
                {latestVital.spo2 != null && (
                  <Badge variant={vitalBadgeVariant('spo2', latestVital.spo2)} size="sm">
                    SpO2 {latestVital.spo2}%
                  </Badge>
                )}
                {latestVital.systolic_bp != null && latestVital.diastolic_bp != null && (
                  <Badge
                    variant={
                      vitalBadgeVariant('systolic_bp', latestVital.systolic_bp) === 'outline'
                        ? vitalBadgeVariant('diastolic_bp', latestVital.diastolic_bp)
                        : vitalBadgeVariant('systolic_bp', latestVital.systolic_bp)
                    }
                    size="sm"
                  >
                    BP {latestVital.systolic_bp}/{latestVital.diastolic_bp}
                  </Badge>
                )}
                {latestVital.mean_arterial_pressure != null && (
                  <Badge variant="outline" size="sm">
                    MAP {latestVital.mean_arterial_pressure}
                  </Badge>
                )}
                {latestVital.etco2 != null && (
                  <Badge variant={vitalBadgeVariant('etco2', latestVital.etco2)} size="sm">
                    EtCO2 {latestVital.etco2}
                  </Badge>
                )}
                {latestVital.respiratory_rate != null && (
                  <Badge variant={vitalBadgeVariant('respiratory_rate', latestVital.respiratory_rate)} size="sm">
                    RR {latestVital.respiratory_rate}
                  </Badge>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useMemo } from 'react';
import { Activity, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HelpPopover } from '@/components/shared/help-popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { useStoredEGFRResults } from '@/lib/hooks/use-ai';
import type { StoredEGFRResult } from '@/lib/types/ai';

// CKD stage bands for visual reference
const CKD_BANDS = [
  { label: 'G1', min: 90, max: 150, color: 'bg-emerald-500/20' },
  { label: 'G2', min: 60, max: 90, color: 'bg-green-500/20' },
  { label: 'G3a', min: 45, max: 60, color: 'bg-yellow-500/20' },
  { label: 'G3b', min: 30, max: 45, color: 'bg-amber-500/20' },
  { label: 'G4', min: 15, max: 30, color: 'bg-orange-500/20' },
  { label: 'G5', min: 0, max: 15, color: 'bg-red-500/20' },
];

function getCKDStageColor(stage: string): string {
  if (stage.startsWith('G1') || stage.startsWith('G2')) return 'text-emerald-600 dark:text-emerald-400';
  if (stage === 'G3a') return 'text-yellow-600 dark:text-yellow-400';
  if (stage === 'G3b') return 'text-amber-600 dark:text-amber-400';
  if (stage.startsWith('G4')) return 'text-orange-600 dark:text-orange-400';
  if (stage.startsWith('G5')) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function getCKDBadgeColor(stage: string): string {
  if (stage.startsWith('G1') || stage.startsWith('G2')) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
  if (stage === 'G3a') return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
  if (stage === 'G3b') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20';
  if (stage.startsWith('G4')) return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20';
  if (stage.startsWith('G5')) return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20';
  return 'bg-muted text-muted-foreground';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

interface EGFRTrendChartProps {
  patientId: number;
}

export function EGFRTrendChart({ patientId }: EGFRTrendChartProps) {
  const { data: results, isLoading } = useStoredEGFRResults({ patient_id: patientId });

  // Sort chronologically and filter valid eGFR values
  const dataPoints = useMemo(() => {
    if (!results || results.length === 0) return [];
    return results
      .filter((r): r is StoredEGFRResult & { egfr_ckd_epi: number } => r.egfr_ckd_epi != null)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [results]);

  // Calculate trend
  const trend = useMemo(() => {
    if (dataPoints.length < 2) return 'stable';
    const first = dataPoints[0]!.egfr_ckd_epi;
    const last = dataPoints[dataPoints.length - 1]!.egfr_ckd_epi;
    const change = last - first;
    if (change < -5) return 'declining';
    if (change > 5) return 'improving';
    return 'stable';
  }, [dataPoints]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (dataPoints.length === 0) return null;

  const latest = dataPoints[dataPoints.length - 1]!;
  const maxEGFR = Math.max(...dataPoints.map(d => d.egfr_ckd_epi), 120);
  const chartHeight = 80;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardHeader className="relative pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={cn('h-4 w-4', getCKDStageColor(latest.ckd_stage))} />
            <CardTitle className="text-sm font-medium">eGFR Trend</CardTitle>
            <HelpPopover content="Estimated Glomerular Filtration Rate trend over time. Declining eGFR indicates worsening kidney function. CKD staging: G1 (≥90), G2 (60-89), G3a (45-59), G3b (30-44), G4 (15-29), G5 (<15)." />
          </div>
          <div className="flex items-center gap-2">
            {trend === 'declining' && (
              <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600 dark:text-orange-400 gap-1">
                <TrendingDown className="h-3 w-3" />
                Declining
              </Badge>
            )}
            {trend === 'improving' && (
              <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 gap-1">
                <TrendingUp className="h-3 w-3" />
                Improving
              </Badge>
            )}
            {trend === 'stable' && (
              <Badge variant="outline" className="text-xs border-sky-500/30 text-sky-600 dark:text-sky-400 gap-1">
                <Minus className="h-3 w-3" />
                Stable
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-xs border', getCKDBadgeColor(latest.ckd_stage))}>
              CKD {latest.ckd_stage}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative pt-0">
        {/* Current value */}
        <div className="flex items-baseline gap-1 mb-3">
          <span className={cn('text-2xl font-bold', getCKDStageColor(latest.ckd_stage))}>
            {Math.round(latest.egfr_ckd_epi)}
          </span>
          <span className="text-sm text-muted-foreground">mL/min/1.73m²</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({formatDate(latest.created_at)})
          </span>
        </div>

        {/* Sparkline chart */}
        {dataPoints.length > 1 && (
          <div className="relative" style={{ height: chartHeight }}>
            {/* CKD stage bands background */}
            {CKD_BANDS.map(band => {
              const top = ((maxEGFR - band.max) / maxEGFR) * chartHeight;
              const height = ((band.max - band.min) / maxEGFR) * chartHeight;
              if (top > chartHeight || top + height < 0) return null;
              return (
                <div
                  key={band.label}
                  className={cn('absolute left-0 right-0 opacity-40', band.color)}
                  style={{
                    top: Math.max(0, top),
                    height: Math.min(height, chartHeight - Math.max(0, top)),
                  }}
                />
              );
            })}

            {/* SVG sparkline */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox={`0 0 ${(dataPoints.length - 1) * 40 + 20} ${chartHeight}`}
              preserveAspectRatio="none"
            >
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  trend === 'declining' ? 'text-orange-500' :
                  trend === 'improving' ? 'text-emerald-500' :
                  'text-sky-500'
                )}
                points={dataPoints
                  .map((d, i) => {
                    const x = i * 40 + 10;
                    const y = ((maxEGFR - d.egfr_ckd_epi) / maxEGFR) * chartHeight;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
              {/* Data points */}
              {dataPoints.map((d, i) => {
                const x = i * 40 + 10;
                const y = ((maxEGFR - d.egfr_ckd_epi) / maxEGFR) * chartHeight;
                return (
                  <circle
                    key={d.id}
                    cx={x}
                    cy={y}
                    r="3"
                    className={cn(
                      'fill-current',
                      i === dataPoints.length - 1
                        ? getCKDStageColor(d.ckd_stage)
                        : 'text-muted-foreground'
                    )}
                  />
                );
              })}
            </svg>
          </div>
        )}

        {/* Timeline labels */}
        {dataPoints.length > 1 && (
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>{formatDate(dataPoints[0]!.created_at)}</span>
            <span>{formatDate(dataPoints[dataPoints.length - 1]!.created_at)}</span>
          </div>
        )}

        {/* Dose adjustment note */}
        {latest.dose_adjustment_band && latest.dose_adjustment_band !== 'normal' && (
          <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-2 py-1">
            Dose adjustment band: <span className="font-medium capitalize">{latest.dose_adjustment_band}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

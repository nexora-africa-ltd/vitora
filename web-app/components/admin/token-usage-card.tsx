'use client';

import { useState } from 'react';
import { Bot, Building2, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { organizationsApi } from '@/lib/api/organizations';
import type { OrgTokenUsage } from '@/lib/types/organization';

/* ------------------------------------------------------------------ */
/*  Radial Gauge (SVG speedometer)                                    */
/* ------------------------------------------------------------------ */

interface RadialGaugeProps {
  /** 0-100 percentage consumed */
  percent: number;
  /** Label shown below the number */
  label?: string;
  /** Pixel diameter */
  size?: number;
  /** Whether the quota is unlimited */
  unlimited?: boolean;
}

function getGaugeColor(percent: number): string {
  if (percent >= 90) return 'hsl(0 72% 51%)';      // red
  if (percent >= 75) return 'hsl(25 95% 53%)';      // orange
  if (percent >= 50) return 'hsl(45 93% 47%)';      // amber
  return 'hsl(142 71% 45%)';                        // green
}

function RadialGauge({ percent, label, size = 160, unlimited = false }: RadialGaugeProps) {
  const strokeWidth = size * 0.09;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arc spans 240° (from 150° to 390° / -210° to 30°)
  const startAngle = 150;
  const endAngle = 390;
  const sweep = endAngle - startAngle; // 240°

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const arcPath = (angleDeg: number) => {
    const rad = toRad(angleDeg);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const start = arcPath(startAngle);
  const end = arcPath(endAngle);

  // Background track
  const bgPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;

  // Value arc
  const clampedPercent = unlimited ? 0 : Math.min(Math.max(percent, 0), 100);
  const valueAngle = startAngle + (sweep * clampedPercent) / 100;
  const valueEnd = arcPath(valueAngle);
  const largeArc = clampedPercent > 50 ? 1 : 0;
  const valuePath =
    clampedPercent > 0
      ? `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${valueEnd.x} ${valueEnd.y}`
      : '';

  const color = unlimited ? 'hsl(142 71% 45%)' : getGaugeColor(clampedPercent);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.85}`}>
        {/* Background track */}
        <path
          d={bgPath}
          fill="none"
          stroke="currentColor"
          className="text-muted/40"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {valuePath && (
          <path
            d={valuePath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 4px ${color})`,
              transition: 'all 0.6s ease-out',
            }}
          />
        )}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground"
          style={{ fontSize: size * 0.18, fontWeight: 700 }}
        >
          {unlimited ? '∞' : `${Math.round(clampedPercent)}%`}
        </text>
        <text
          x={cx}
          y={cy + size * 0.14}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          style={{ fontSize: size * 0.08 }}
        >
          {unlimited ? 'Unlimited' : 'used'}
        </text>
      </svg>
      {label && (
        <p className="text-xs font-medium text-muted-foreground text-center truncate max-w-full">
          {label}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Token Usage Card                                                   */
/* ------------------------------------------------------------------ */

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface TokenUsageCardProps {
  organizationId: number;
}

export function TokenUsageCard({ organizationId }: TokenUsageCardProps) {
  const [facilityView, setFacilityView] = useState(false);

  const { data, isLoading } = useQuery<OrgTokenUsage>({
    queryKey: ['org-token-usage', organizationId],
    queryFn: () => organizationsApi.getTokenUsage(organizationId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Skeleton className="h-32 w-32 rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const isUnlimited = data.monthly_ai_tokens === null;
  const percent = isUnlimited
    ? 0
    : data.monthly_ai_tokens != null && data.monthly_ai_tokens > 0
      ? (data.ai_tokens_used / data.monthly_ai_tokens) * 100
      : 0;

  const facilitiesWithUsage = data.facilities.filter((f) => f.tokens_used > 0);
  const displayFacilities =
    facilitiesWithUsage.length > 0 ? facilitiesWithUsage : data.facilities.slice(0, 4);

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardHeader className="relative pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              AI Token Usage
            </CardTitle>
            <CardDescription className="mt-1">
              {isUnlimited
                ? 'Unlimited quota this billing cycle'
                : `${formatTokenCount(data.ai_tokens_used)} of ${formatTokenCount(data.monthly_ai_tokens!)} tokens used`}
            </CardDescription>
          </div>
          {data.facilities.length > 1 && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 w-fit cursor-default">
                    <Switch
                      checked={facilityView}
                      onCheckedChange={setFacilityView}
                      aria-label="Toggle facility view"
                    />
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {facilityView ? 'By Facility' : 'Organization'}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Switch to {facilityView ? 'organization' : 'facility'} view</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative">
        {!facilityView ? (
          /* ---- Organization-level gauge ---- */
          <div className="flex flex-col items-center gap-3 py-2">
            <RadialGauge
              percent={percent}
              size={180}
              unlimited={isUnlimited}
            />
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-center text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Used</p>
                <p className="font-semibold">{formatTokenCount(data.ai_tokens_used)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="font-semibold">
                  {isUnlimited ? '∞' : formatTokenCount(data.ai_tokens_remaining ?? 0)}
                </p>
              </div>
            </div>
            {data.ai_tokens_reset_at && (
              <p className="text-[11px] text-muted-foreground">
                Resets {new Date(data.ai_tokens_reset_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          /* ---- Per-facility gauges ---- */
          <div className="py-2">
            {displayFacilities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No facility usage recorded yet.
              </p>
            ) : (
              <div
                className={`grid gap-4 ${
                  displayFacilities.length === 1
                    ? 'grid-cols-1 justify-items-center'
                    : displayFacilities.length === 2
                      ? 'grid-cols-2'
                      : 'grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {displayFacilities.map((facility) => {
                  const facPercent =
                    isUnlimited || data.monthly_ai_tokens == null || data.monthly_ai_tokens === 0
                      ? 0
                      : (facility.tokens_used / data.monthly_ai_tokens) * 100;
                  return (
                    <div key={facility.id} className="flex flex-col items-center gap-1">
                      <RadialGauge
                        percent={facPercent}
                        label={facility.name}
                        size={110}
                        unlimited={isUnlimited}
                      />
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {formatTokenCount(facility.tokens_used)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
            {data.facilities.length > displayFacilities.length && (
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                +{data.facilities.length - displayFacilities.length} more facilities with no usage
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

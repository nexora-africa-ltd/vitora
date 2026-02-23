/**
 * Emergency Zone Card Component
 *
 * Displays a single ER zone with patient count, category breakdown,
 * and navigation to the zone's patient list.
 *
 * Features:
 * - Visual priority indicator using StatusIndicator
 * - Patient count with capacity display
 * - Category breakdown badges
 * - Click-to-navigate functionality
 */
'use client';

import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import StatusIndicator from '@/components/ui/status-indicator';
import { cn } from '@/lib/utils/cn';
import {
  CATEGORY_COLORS,
  TRIAGE_CATEGORY_ORDER,
} from '@/lib/config/emergency';
import type { TriageCategory } from '@/lib/types/triage';

export interface ZoneData {
  code: string;
  name: string;
  capacity: number;
  total: number;
  primary_category: string;
  by_category: Record<string, number>;
}

interface ZoneCardProps {
  zone: ZoneData;
  onNavigate: (zoneCode: string) => void;
  className?: string;
}

/**
 * Renders a clickable card for an ER zone showing:
 * - Zone name with priority indicator
 * - Patient count and capacity
 * - Category breakdown badges
 * - Enter button for navigation
 */
export function ZoneCard({ zone, onNavigate, className }: ZoneCardProps) {
  const primaryCategory = zone.primary_category as TriageCategory;
  const categoryColors = CATEGORY_COLORS[primaryCategory] || CATEGORY_COLORS.GREEN;
  const hasPatients = zone.total > 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        'border-2',
        hasPatients ? categoryColors.border : 'border-muted',
        className
      )}
      onClick={() => onNavigate(zone.code)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="truncate">{zone.name}</span>
          {hasPatients && (
            <StatusIndicator
              state={categoryColors.indicatorState}
              size="md"
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Patient count */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-2xl font-bold',
              hasPatients ? categoryColors.text : 'text-muted-foreground'
            )}
          >
            {zone.total} pts
          </span>
          <span className="text-sm text-muted-foreground">
            Cap: {zone.capacity}
          </span>
        </div>

        {/* Category breakdown (if patients) */}
        {hasPatients && (
          <div className="flex flex-wrap gap-1">
            {TRIAGE_CATEGORY_ORDER.map((cat) => {
              const count = zone.by_category[cat];
              if (!count || count <= 0) return null;

              const colors = CATEGORY_COLORS[cat];
              return (
                <Badge
                  key={cat}
                  variant="secondary"
                  className={cn('text-xs gap-1', colors.bg, colors.text)}
                >
                  <StatusIndicator state={colors.indicatorState} size="sm" />
                  {count}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Enter button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(zone.code);
          }}
        >
          Enter
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton loader for ZoneCard during data fetching.
 */
export function ZoneCardSkeleton() {
  return (
    <Card className="border-2 border-muted">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-3 bg-muted animate-pulse rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
          <div className="h-4 w-12 bg-muted animate-pulse rounded" />
        </div>
        <div className="flex gap-1">
          <div className="h-5 w-10 bg-muted animate-pulse rounded" />
          <div className="h-5 w-10 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-8 w-full bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}

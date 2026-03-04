/**
 * ER Bed Board Page
 *
 * Visual grid of all ER bays/beds organized by zone.
 * Color-coded by status: available, occupied, cleaning, out of service.
 * Click a bed to see patient info or perform actions.
 *
 * Phase 3: ER Bed Board
 * Route: /emergency/bed-board
 */
'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  BedDouble,
  User,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  WrenchIcon,
  SparklesIcon,
  XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/cn';
import { useERBedBoard, useERBedSummary, useERBedActions } from '@/lib/hooks/use-triage';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { ZONE_METADATA, CATEGORY_COLORS } from '@/lib/config/emergency';
import {
  ER_BED_STATUS_CONFIG,
  type ERBed,
  type ERBedStatus,
  type ERBedZoneSummary,
} from '@/lib/types/triage';
import type { ERBedZoneGroup } from '@/lib/schemas/triage.schema';
import type { TriageCategory } from '@/lib/types/triage';

// =============================================================================
// STATUS LEGEND
// =============================================================================

const STATUS_ICONS: Record<ERBedStatus, React.ReactNode> = {
  AVAILABLE: <CheckCircle2 className="h-3.5 w-3.5" />,
  OCCUPIED: <User className="h-3.5 w-3.5" />,
  CLEANING: <SparklesIcon className="h-3.5 w-3.5" />,
  OUT_OF_SERVICE: <WrenchIcon className="h-3.5 w-3.5" />,
};

function StatusLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs sm:text-sm">
      {(Object.entries(ER_BED_STATUS_CONFIG) as [ERBedStatus, typeof ER_BED_STATUS_CONFIG[ERBedStatus]][]).map(
        ([status, config]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div
              className={cn(
                'h-4 w-4 rounded border flex items-center justify-center',
                config.bgClass,
                config.borderClass,
                config.textClass
              )}
            >
              {STATUS_ICONS[status]}
            </div>
            <span className="text-muted-foreground">{config.label}</span>
          </div>
        )
      )}
    </div>
  );
}

// =============================================================================
// BED CELL COMPONENT
// =============================================================================

interface BedCellProps {
  bed: ERBed;
  onClick: (bed: ERBed) => void;
}

function BedCell({ bed, onClick }: BedCellProps) {
  const config = ER_BED_STATUS_CONFIG[bed.status];
  const categoryColor = bed.triage_category
    ? CATEGORY_COLORS[bed.triage_category as TriageCategory]
    : null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onClick(bed)}
            className={cn(
              'relative flex flex-col items-center justify-center',
              'w-full aspect-square rounded-lg border-2 transition-all',
              'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'min-h-[72px] sm:min-h-[80px]',
              config.bgClass,
              config.borderClass,
              bed.status === 'OCCUPIED' && categoryColor
                ? `${categoryColor.border}`
                : config.borderClass
            )}
          >
            {/* Bed number */}
            <span
              className={cn(
                'text-xs font-bold',
                config.textClass
              )}
            >
              {bed.bed_number}
            </span>

            {/* Patient name or status icon */}
            {bed.status === 'OCCUPIED' && bed.patient_name ? (
              <span
                className={cn(
                  'text-[10px] sm:text-xs mt-0.5 truncate max-w-full px-1',
                  config.textClass
                )}
              >
                {bed.patient_name.split(' ')[0]}
              </span>
            ) : (
              <span className={cn('mt-0.5', config.textClass)}>
                {STATUS_ICONS[bed.status]}
              </span>
            )}

            {/* Duration for occupied beds */}
            {bed.status === 'OCCUPIED' && bed.occupied_duration_minutes != null && (
              <span
                className={cn(
                  'text-[9px] sm:text-[10px] mt-0.5 opacity-75',
                  config.textClass
                )}
              >
                {bed.occupied_duration_minutes < 60
                  ? `${bed.occupied_duration_minutes}m`
                  : `${Math.floor(bed.occupied_duration_minutes / 60)}h ${bed.occupied_duration_minutes % 60}m`}
              </span>
            )}

            {/* Triage category indicator dot */}
            {bed.triage_category && categoryColor && (
              <div
                className={cn(
                  'absolute top-1 right-1 h-2.5 w-2.5 rounded-full',
                  categoryColor.bg
                )}
                style={{ backgroundColor: getCategoryDotColor(bed.triage_category as TriageCategory) }}
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="text-xs space-y-0.5">
            <p className="font-semibold">{bed.bed_number} — {config.label}</p>
            {bed.patient_name && <p>Patient: {bed.patient_name}</p>}
            {bed.patient_mrn && <p>MRN: {bed.patient_mrn}</p>}
            {bed.triage_category && <p>Category: {bed.triage_category}</p>}
            {bed.occupied_duration_minutes != null && (
              <p>Duration: {bed.occupied_duration_minutes} min</p>
            )}
            {bed.notes && <p>Notes: {bed.notes}</p>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getCategoryDotColor(category: TriageCategory): string {
  const colors: Record<TriageCategory, string> = {
    RED: '#ef4444',
    ORANGE: '#f97316',
    YELLOW: '#eab308',
    GREEN: '#22c55e',
    BLUE: '#3b82f6',
  };
  return colors[category] || '#6b7280';
}

// =============================================================================
// ZONE SECTION
// =============================================================================

interface ZoneSectionProps {
  zone: ERBedZoneGroup;
  summary?: ERBedZoneSummary;
  onBedClick: (bed: ERBed) => void;
}

function ZoneSection({ zone, summary, onBedClick }: ZoneSectionProps) {
  const meta = ZONE_METADATA.find((z) => z.code === zone.zone);
  const categoryColor = meta ? CATEGORY_COLORS[meta.primaryCategory] : null;

  const occupiedCount = zone.beds.filter((b) => b.status === 'OCCUPIED').length;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3 sm:px-6 sm:pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base font-semibold flex items-center gap-2">
            {categoryColor && (
              <div
                className={cn('h-3 w-3 rounded-full', categoryColor.bg)}
                style={{ backgroundColor: getCategoryDotColor(meta?.primaryCategory || 'GREEN') }}
              />
            )}
            <span className="sm:hidden">{meta?.shortLabel || zone.zone_display}</span>
            <span className="hidden sm:inline">{zone.zone_display}</span>
          </CardTitle>
          <Badge
            variant="secondary"
            className="text-xs tabular-nums"
          >
            {occupiedCount}/{zone.beds.length}
          </Badge>
        </div>
        {summary && (
          <div className="flex gap-2 text-[10px] sm:text-xs text-muted-foreground mt-1">
            <span>{summary.available} free</span>
            <span>·</span>
            <span>{summary.cleaning} cleaning</span>
            {summary.out_of_service > 0 && (
              <>
                <span>·</span>
                <span>{summary.out_of_service} OOS</span>
              </>
            )}
            <span>·</span>
            <span>{summary.occupancy_rate}% full</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-6 sm:pb-4">
        <div
          className={cn(
            'grid gap-2',
            zone.beds.length <= 4 && 'grid-cols-4',
            zone.beds.length > 4 && zone.beds.length <= 8 && 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8',
            zone.beds.length > 8 && 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10'
          )}
        >
          {zone.beds.map((bed) => (
            <BedCell key={bed.id} bed={bed} onClick={onBedClick} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// BED DETAIL DIALOG
// =============================================================================

interface BedDetailDialogProps {
  bed: ERBed | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRelease: (bedId: number, markCleaning: boolean) => void;
  onMarkAvailable: (bedId: number) => void;
  onMarkOutOfService: (bedId: number) => void;
  isLoading: boolean;
}

function BedDetailDialog({
  bed,
  open,
  onOpenChange,
  onRelease,
  onMarkAvailable,
  onMarkOutOfService,
  isLoading,
}: BedDetailDialogProps) {
  if (!bed) return null;

  const config = ER_BED_STATUS_CONFIG[bed.status];
  const categoryColor = bed.triage_category
    ? CATEGORY_COLORS[bed.triage_category as TriageCategory]
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BedDouble className="h-5 w-5" />
            Bed {bed.bed_number}
          </DialogTitle>
          <DialogDescription>
            {bed.zone_display}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge className={cn(config.bgClass, config.textClass, 'border', config.borderClass)}>
              {config.label}
            </Badge>
          </div>

          {/* Patient info (when occupied) */}
          {bed.status === 'OCCUPIED' && (
            <Card className="bg-muted/50">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{bed.patient_name}</span>
                </div>
                {bed.patient_mrn && (
                  <p className="text-xs text-muted-foreground ml-6">{bed.patient_mrn}</p>
                )}
                {bed.triage_category && categoryColor && (
                  <div className="flex items-center gap-2 ml-6">
                    <Badge
                      className={cn(
                        'text-xs',
                        categoryColor.bg,
                        categoryColor.text,
                        'border',
                        categoryColor.border
                      )}
                    >
                      {bed.triage_category}
                    </Badge>
                  </div>
                )}
                {bed.occupied_duration_minutes != null && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-6">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {bed.occupied_duration_minutes < 60
                        ? `${bed.occupied_duration_minutes} min`
                        : `${Math.floor(bed.occupied_duration_minutes / 60)}h ${bed.occupied_duration_minutes % 60}m`}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {bed.notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {bed.notes}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {/* Action buttons based on status */}
          {bed.status === 'OCCUPIED' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRelease(bed.id, true)}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <SparklesIcon className="h-4 w-4 mr-1" />}
                Release → Cleaning
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRelease(bed.id, false)}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Release → Available
              </Button>
            </>
          )}

          {bed.status === 'CLEANING' && (
            <Button
              size="sm"
              onClick={() => onMarkAvailable(bed.id)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Mark Available
            </Button>
          )}

          {bed.status === 'AVAILABLE' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onMarkOutOfService(bed.id)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <WrenchIcon className="h-4 w-4 mr-1" />}
              Out of Service
            </Button>
          )}

          {bed.status === 'OUT_OF_SERVICE' && (
            <Button
              size="sm"
              onClick={() => onMarkAvailable(bed.id)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Return to Service
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function BedBoardSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
            <Skeleton className="h-3 w-48 mt-1" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="aspect-square rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function ERBedBoardPage() {
  const { isRefreshing, refresh } = usePageRefresh();
  const [selectedBed, setSelectedBed] = useState<ERBed | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Data hooks
  const { data: boardData, isLoading, error } = useERBedBoard();
  const { data: summaryData } = useERBedSummary();
  const { releaseBed, updateStatus } = useERBedActions();

  // Build summary lookup
  const summaryMap = useMemo(() => {
    const map = new Map<string, ERBedZoneSummary>();
    if (summaryData) {
      for (const s of summaryData) {
        map.set(s.zone, s);
      }
    }
    return map;
  }, [summaryData]);

  // Total stats
  const totalStats = useMemo(() => {
    if (!summaryData) return null;
    return {
      total: summaryData.reduce((sum, z) => sum + z.total_beds, 0),
      available: summaryData.reduce((sum, z) => sum + z.available, 0),
      occupied: summaryData.reduce((sum, z) => sum + z.occupied, 0),
      cleaning: summaryData.reduce((sum, z) => sum + z.cleaning, 0),
      outOfService: summaryData.reduce((sum, z) => sum + z.out_of_service, 0),
    };
  }, [summaryData]);

  // Handlers
  const handleBedClick = useCallback((bed: ERBed) => {
    setSelectedBed(bed);
    setDialogOpen(true);
  }, []);

  const handleRelease = useCallback(
    (bedId: number, markCleaning: boolean) => {
      releaseBed.mutate(
        { bedId, markCleaning },
        { onSuccess: () => setDialogOpen(false) }
      );
    },
    [releaseBed]
  );

  const handleMarkAvailable = useCallback(
    (bedId: number) => {
      updateStatus.mutate(
        { bedId, status: 'AVAILABLE' },
        { onSuccess: () => setDialogOpen(false) }
      );
    },
    [updateStatus]
  );

  const handleMarkOutOfService = useCallback(
    (bedId: number) => {
      updateStatus.mutate(
        { bedId, status: 'OUT_OF_SERVICE', reason: 'Marked via bed board' },
        { onSuccess: () => setDialogOpen(false) }
      );
    },
    [updateStatus]
  );

  const isActionLoading = releaseBed.isPending || updateStatus.isPending;

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Header */}
        <PageHeader
          title="ER Bed Board"
          helpContent="Visual overview of all ER beds organized by zone. Click a bed to see patient details or change its status. Auto-refreshes every 10 seconds."
          actions={
            <div className="flex items-center gap-2">
              {totalStats && (
                <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground mr-2">
                  <span className="tabular-nums">{totalStats.occupied}/{totalStats.total} occupied</span>
                  <span>·</span>
                  <span className="tabular-nums">{totalStats.available} free</span>
                </div>
              )}
            </div>
          }
        />

        {/* Summary bar (mobile) */}
        {totalStats && (
          <div className="sm:hidden flex items-center gap-3 text-xs text-muted-foreground px-1">
            <span className="tabular-nums font-medium">{totalStats.occupied}/{totalStats.total} occupied</span>
            <span>·</span>
            <span>{totalStats.available} free</span>
            <span>·</span>
            <span>{totalStats.cleaning} cleaning</span>
          </div>
        )}

        {/* Legend */}
        <StatusLegend />

        {/* Loading state */}
        {isLoading && <BedBoardSkeleton />}

        {/* Error state */}
        {error && (
          <Card className="border-destructive/50">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium">Failed to load bed board</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refresh()} className="ml-auto">
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!isLoading && !error && boardData && boardData.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <BedDouble className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium">No ER beds configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                ER beds need to be created before the bed board can be displayed.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Bed board grid */}
        {!isLoading && boardData && boardData.length > 0 && (
          <div className="space-y-4">
            {boardData.map((zone) => (
              <ZoneSection
                key={zone.zone}
                zone={zone}
                summary={summaryMap.get(zone.zone)}
                onBedClick={handleBedClick}
              />
            ))}
          </div>
        )}

        {/* Bed detail dialog */}
        <BedDetailDialog
          bed={selectedBed}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onRelease={handleRelease}
          onMarkAvailable={handleMarkAvailable}
          onMarkOutOfService={handleMarkOutOfService}
          isLoading={isActionLoading}
        />
      </div>
    </PullToRefresh>
  );
}

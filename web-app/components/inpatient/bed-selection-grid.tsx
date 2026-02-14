'use client';

import { useMemo } from 'react';
import { Bed as BedIcon, AlertTriangle, Check, Ban, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpPopover } from '@/components/shared/help-popover';
import { cn } from '@/lib/utils/cn';
import type { Bed, CompatibilityCheckResult } from '@/lib/types/inpatient';

export type BedCompatibilityStatus = 'compatible' | 'warning' | 'incompatible' | 'unavailable' | 'unknown';

export interface BedWithCompatibility extends Bed {
  compatibilityStatus?: BedCompatibilityStatus;
  compatibilityMessage?: string;
}

interface BedSelectionGridProps {
  beds: BedWithCompatibility[];
  selectedBedId?: number | string | null;
  compatibilityResult?: CompatibilityCheckResult | null;
  onSelectBed: (bedId: number) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Ward capacity - if set and no beds exist, show generate beds option */
  wardCapacity?: number;
  /** Callback to generate missing beds */
  onGenerateBeds?: () => void;
  /** Whether generate beds action is in progress */
  isGeneratingBeds?: boolean;
}

const STATUS_STYLES: Record<BedCompatibilityStatus, { bg: string; border: string; icon: string }> = {
  compatible: {
    bg: 'bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/30',
    border: 'border-green-300 dark:border-green-700',
    icon: 'text-green-600 dark:text-green-400',
  },
  warning: {
    bg: 'bg-yellow-50 hover:bg-yellow-100 dark:bg-yellow-950/30 dark:hover:bg-yellow-900/30',
    border: 'border-yellow-300 dark:border-yellow-700',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  incompatible: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-300 dark:border-red-700',
    icon: 'text-red-600 dark:text-red-400',
  },
  unavailable: {
    bg: 'bg-muted',
    border: 'border-muted-foreground/20',
    icon: 'text-muted-foreground',
  },
  unknown: {
    bg: 'hover:bg-accent',
    border: 'border-border',
    icon: 'text-muted-foreground',
  },
};

function BedCard({
  bed,
  isSelected,
  onSelect,
  disabled,
}: {
  bed: BedWithCompatibility;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const isAvailable = bed.status === 'AVAILABLE';
  const compatStatus = !isAvailable ? 'unavailable' : (bed.compatibilityStatus || 'unknown');
  const styles = STATUS_STYLES[compatStatus];
  const canSelect = isAvailable && compatStatus !== 'incompatible' && !disabled;

  return (
    <button
      type="button"
      onClick={canSelect ? onSelect : undefined}
      disabled={!canSelect}
      className={cn(
        'relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all',
        'min-h-[80px] sm:min-h-[90px]',
        styles.bg,
        styles.border,
        isSelected && 'ring-2 ring-primary ring-offset-2',
        canSelect && 'cursor-pointer',
        !canSelect && 'cursor-not-allowed opacity-60'
      )}
      aria-label={`Bed ${bed.bed_number} - ${bed.status_display || bed.status}${bed.compatibilityMessage ? ` - ${bed.compatibilityMessage}` : ''}`}
    >
      {/* Compatibility indicator */}
      <div className="absolute top-1 right-1">
        {compatStatus === 'compatible' && (
          <Check className={cn('h-3.5 w-3.5', styles.icon)} />
        )}
        {compatStatus === 'warning' && (
          <AlertTriangle className={cn('h-3.5 w-3.5', styles.icon)} />
        )}
        {compatStatus === 'incompatible' && (
          <Ban className={cn('h-3.5 w-3.5', styles.icon)} />
        )}
      </div>

      <BedIcon className={cn('h-5 w-5 mb-1', styles.icon)} />
      <span className="text-sm font-medium">{bed.bed_number}</span>
      <Badge
        variant={bed.status === 'AVAILABLE' ? 'secondary' : 'outline'}
        className="text-xs mt-1 shrink-0 w-fit"
      >
        {bed.status_display || bed.status}
      </Badge>

      {/* Show tooltip on hover for warning/incompatible */}
      {bed.compatibilityMessage && (compatStatus === 'warning' || compatStatus === 'incompatible') && (
        <span className="sr-only">{bed.compatibilityMessage}</span>
      )}
    </button>
  );
}

function BedCardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-lg border min-h-[80px] sm:min-h-[90px]">
      <Skeleton className="h-5 w-5 mb-1" />
      <Skeleton className="h-4 w-12 mb-1" />
      <Skeleton className="h-5 w-16" />
    </div>
  );
}

export function BedSelectionGrid({
  beds,
  selectedBedId,
  compatibilityResult,
  onSelectBed,
  isLoading,
  disabled,
  wardCapacity,
  onGenerateBeds,
  isGeneratingBeds,
}: BedSelectionGridProps) {
  // Enrich beds with compatibility status based on the ward-level check
  const enrichedBeds = useMemo(() => {
    if (!compatibilityResult) return beds;

    // If ward has violations, mark all available beds accordingly
    return beds.map((bed) => {
      if (bed.status !== 'AVAILABLE') {
        return { ...bed, compatibilityStatus: 'unavailable' as const };
      }

      if (!compatibilityResult.compatible) {
        // Ward is not compatible, but can be overridden
        const hasCritical = compatibilityResult.has_critical_violations;
        return {
          ...bed,
          compatibilityStatus: hasCritical ? 'incompatible' : 'warning',
          compatibilityMessage: compatibilityResult.violations
            .map((v) => v.message)
            .join('; '),
        } as BedWithCompatibility;
      }

      return { ...bed, compatibilityStatus: 'compatible' as const };
    });
  }, [beds, compatibilityResult]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Select Bed</span>
          <HelpPopover content="Select an available bed for admission. Beds are color-coded by compatibility with the patient." />
        </div>
        <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <BedCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (beds.length === 0) {
    // Show generate beds option if ward has capacity but no beds
    const canGenerateBeds = wardCapacity && wardCapacity > 0 && onGenerateBeds;
    
    return (
      <div className="py-6 text-center text-muted-foreground">
        <BedIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No beds configured for this ward</p>
        {canGenerateBeds ? (
          <>
            <p className="text-xs text-muted-foreground/60 mt-1 mb-3">
              Ward has capacity for {wardCapacity} beds. Generate bed records to continue.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateBeds}
              disabled={isGeneratingBeds}
            >
              <Plus className="h-4 w-4 mr-1" />
              {isGeneratingBeds ? 'Generating...' : `Generate ${wardCapacity} Beds`}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground/60 mt-1">
            Contact admin to add beds to this ward
          </p>
        )}
      </div>
    );
  }

  const availableBeds = enrichedBeds.filter((b) => b.status === 'AVAILABLE');
  const compatibleBeds = availableBeds.filter((b) => b.compatibilityStatus === 'compatible');

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Select Bed</span>
          <HelpPopover content="Select an available bed. Green = compatible, Yellow = warning (can override), Red = incompatible." />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{availableBeds.length} available</span>
          {compatibilityResult && (
            <span className={compatibleBeds.length > 0 ? 'text-green-600' : 'text-yellow-600'}>
              {compatibleBeds.length} compatible
            </span>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border-2 border-green-300 bg-green-50" />
          <span>Compatible</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border-2 border-yellow-300 bg-yellow-50" />
          <span>Warning</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border-2 border-red-300 bg-red-50" />
          <span>Incompatible</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded border-2 border-muted bg-muted" />
          <span>Unavailable</span>
        </div>
      </div>

      {/* Bed Grid */}
      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
        {enrichedBeds.map((bed) => (
          <BedCard
            key={bed.id}
            bed={bed}
            isSelected={String(selectedBedId) === String(bed.id)}
            onSelect={() => onSelectBed(bed.id)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

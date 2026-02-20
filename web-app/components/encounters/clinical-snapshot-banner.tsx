'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Pill, Heart, FlaskConical, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { VisibilityToggle } from '@/components/shared/visibility-toggle';
import { useEncounterClinicalSnapshot } from '@/lib/hooks/use-encounters';

// =============================================================================
// Color Variants
// =============================================================================

type ColorVariant = 'amber' | 'rose' | 'emerald' | 'sky' | 'violet';

const colorConfig: Record<
  ColorVariant,
  { chip: string; section: string; icon: string; bullet: string }
> = {
  amber: {
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20',
    section: 'bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-l-amber-500',
    icon: 'text-amber-600 dark:text-amber-400',
    bullet: 'before:bg-amber-500',
  },
  rose: {
    chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20',
    section: 'bg-rose-50/50 dark:bg-rose-950/20 border-l-2 border-l-rose-500',
    icon: 'text-rose-600 dark:text-rose-400',
    bullet: 'before:bg-rose-500',
  },
  emerald: {
    chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
    section: 'bg-emerald-50/50 dark:bg-emerald-950/20 border-l-2 border-l-emerald-500',
    icon: 'text-emerald-600 dark:text-emerald-400',
    bullet: 'before:bg-emerald-500',
  },
  sky: {
    chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/20',
    section: 'bg-sky-50/50 dark:bg-sky-950/20 border-l-2 border-l-sky-500',
    icon: 'text-sky-600 dark:text-sky-400',
    bullet: 'before:bg-sky-500',
  },
  violet: {
    chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-500/20',
    section: 'bg-violet-50/50 dark:bg-violet-950/20 border-l-2 border-l-violet-500',
    icon: 'text-violet-600 dark:text-violet-400',
    bullet: 'before:bg-violet-500',
  },
};

// =============================================================================
// Snapshot Stat Chip
// =============================================================================

function StatChip({
  icon: Icon,
  label,
  count,
  color,
  isEmpty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  color: ColorVariant;
  isEmpty?: boolean;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
        isEmpty ? 'bg-muted/50 text-muted-foreground' : colorConfig[color].chip
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}:</span>
      <span className="font-semibold">{count}</span>
    </div>
  );
}

// =============================================================================
// Snapshot Section
// =============================================================================

function SnapshotSection({
  title,
  items,
  emptyLabel,
  icon: Icon,
  color,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: ColorVariant;
}) {
  const config = colorConfig[color];
  const hasItems = items.length > 0;

  return (
    <div
      className={cn(
        'rounded-md p-3 space-y-2',
        hasItems ? config.section : 'bg-muted/30 border-l-2 border-l-muted'
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-4 w-4', hasItems ? config.icon : 'text-muted-foreground')} />
        <h4 className="text-sm font-medium">{title}</h4>
        {hasItems && (
          <Badge
            variant="secondary"
            className={cn('ml-auto text-xs h-5 font-semibold', config.chip)}
          >
            {items.length}
          </Badge>
        )}
      </div>
      {!hasItems ? (
        <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, idx) => (
            <li
              key={`${item}-${idx}`}
              className={cn(
                'text-sm pl-4 relative before:absolute before:left-0.5 before:top-[0.45rem] before:h-1.5 before:w-1.5 before:rounded-full',
                config.bullet
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ClinicalSnapshotBanner({ encounterId }: { encounterId: number }) {
  const [open, setOpen] = useState(true);
  const { data: snapshot, isLoading, isError } = useEncounterClinicalSnapshot(encounterId);

  const isSevereAllergy = useMemo(() => {
    return !!snapshot?.alerts?.some((alert) => alert.toUpperCase().includes('SEVERE ALLERGY'));
  }, [snapshot]);

  const hasAlerts = snapshot?.alerts && snapshot.alerts.length > 0;

  if (isLoading) {
    return (
      <div className="rounded-lg border-2 border-violet-500/20 bg-gradient-to-r from-violet-50/50 to-sky-50/50 dark:from-violet-950/20 dark:to-sky-950/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2 min-w-0 flex-1">
            <Skeleton className="h-5 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
    );
  }

  // Non-blocking: encounter view should still load even if snapshot fails.
  if (isError || !snapshot) return null;

  return (
    <div
      className={cn(
        'rounded-lg border-2 overflow-hidden',
        isSevereAllergy
          ? 'border-rose-500/40 bg-gradient-to-r from-rose-50/80 to-amber-50/50 dark:from-rose-950/30 dark:to-amber-950/20'
          : 'border-violet-500/20 bg-gradient-to-r from-violet-50/50 to-sky-50/50 dark:from-violet-950/20 dark:to-sky-950/20'
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Header - always visible */}
        <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div
              className={cn(
                'p-1.5 rounded-lg',
                isSevereAllergy
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                  : 'bg-violet-500/20 text-violet-600 dark:text-violet-400'
              )}
            >
              <Stethoscope className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Clinical Snapshot</span>
              {isSevereAllergy && (
                <Badge
                  variant="destructive"
                  className="shrink-0 w-fit text-xs animate-pulse"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  <span className="hidden sm:inline">Allergy Alert</span>
                  <span className="sm:hidden">Alert</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Stat chips - visible when collapsed */}
          <div className={cn('flex items-center gap-1.5 sm:gap-2', open && 'hidden sm:flex')}>
            <StatChip
              icon={AlertTriangle}
              label="Allergies"
              count={snapshot.allergies.length}
              color="amber"
              isEmpty={snapshot.allergies.length === 0}
            />
            <StatChip
              icon={Heart}
              label="Conditions"
              count={snapshot.active_conditions.length}
              color="rose"
              isEmpty={snapshot.active_conditions.length === 0}
            />
            <StatChip
              icon={Pill}
              label="Meds"
              count={snapshot.current_medications.length}
              color="emerald"
              isEmpty={snapshot.current_medications.length === 0}
            />
            {snapshot.pending_results.length > 0 && (
              <StatChip
                icon={FlaskConical}
                label="Pending"
                count={snapshot.pending_results.length}
                color="sky"
              />
            )}
          </div>

          <CollapsibleTrigger asChild>
            <VisibilityToggle
              isVisible={open}
              onToggle={() => setOpen(!open)}
              label="clinical snapshot details"
            />
          </CollapsibleTrigger>
        </div>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="border-t border-violet-500/10 dark:border-violet-500/20 bg-background/80 backdrop-blur-sm px-3 sm:px-4 py-4 space-y-4">
            {/* Alerts section */}
            {hasAlerts && (
              <div
                className={cn(
                  'rounded-lg p-3 text-sm',
                  isSevereAllergy
                    ? 'bg-rose-500/15 border border-rose-500/30'
                    : 'bg-amber-500/15 border border-amber-500/30'
                )}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className={cn(
                      'h-4 w-4 shrink-0 mt-0.5',
                      isSevereAllergy
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    )}
                  />
                  <ul className="space-y-1 font-medium">
                    {snapshot.alerts.map((alert, idx) => (
                      <li key={`alert-${idx}`} className="break-words">
                        {alert}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Main content grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SnapshotSection
                title="Allergies"
                icon={AlertTriangle}
                items={snapshot.allergies}
                emptyLabel="None recorded"
                color="amber"
              />
              <SnapshotSection
                title="Active Conditions"
                icon={Heart}
                items={snapshot.active_conditions}
                emptyLabel="None recorded"
                color="rose"
              />
              <SnapshotSection
                title="Current Medications"
                icon={Pill}
                items={snapshot.current_medications}
                emptyLabel="None recorded"
                color="emerald"
              />
            </div>

            {/* Pending results */}
            {snapshot.pending_results.length > 0 && (
              <div
                className={cn(
                  'rounded-md p-3 space-y-2',
                  colorConfig.sky.section
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FlaskConical className={cn('h-4 w-4', colorConfig.sky.icon)} />
                  <h4 className="text-sm font-medium">Pending Results</h4>
                  <Badge
                    variant="secondary"
                    className={cn('ml-auto text-xs h-5 font-semibold', colorConfig.sky.chip)}
                  >
                    {snapshot.pending_results.length}
                  </Badge>
                </div>
                <ul className="space-y-1">
                  {snapshot.pending_results.map((r, idx) => (
                    <li
                      key={`${r.test_name}-${r.ordered_date ?? 'unknown'}-${idx}`}
                      className={cn(
                        'text-sm pl-4 relative before:absolute before:left-0.5 before:top-[0.45rem] before:h-1.5 before:w-1.5 before:rounded-full',
                        colorConfig.sky.bullet
                      )}
                    >
                      {r.test_name}
                      <span className="text-muted-foreground ml-1">({r.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

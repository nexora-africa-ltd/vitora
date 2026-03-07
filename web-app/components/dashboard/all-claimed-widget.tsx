/**
 * AllClaimedEncountersWidget Component
 *
 * Dashboard widget showing all encounters claimed by any clinician.
 * Only visible to supervisors and management (hierarchy_level <= 3).
 *
 * Sprint 1.7: Data Integrity - Supervisor Monitoring
 *
 * Features:
 * - List of all claimed encounters with clinician info
 * - Real-time polling (30s)
 * - Filtering by clinician/department (future enhancement)
 */
'use client';

import Link from 'next/link';
import { Users, Clock, User, Stethoscope } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAllClaimedEncounters } from '@/lib/hooks/use-consultation-queue';
import { DashboardEmptyState, DashboardFooterLink, DashboardListSkeleton } from './widget-primitives';

const MAX_DISPLAY_ITEMS = 5;

interface AllClaimedEncountersWidgetProps {
  /** Whether the user has supervisor access */
  enabled?: boolean;
}

export function AllClaimedEncountersWidget({ enabled = true }: AllClaimedEncountersWidgetProps) {
  const { data, isLoading, isError } = useAllClaimedEncounters(undefined, { enabled });

  if (!enabled) {
    return null;
  }

  if (isLoading) {
    return <DashboardListSkeleton rows={3} />;
  }

  if (isError) {
    return (
      <DashboardEmptyState
        icon={Users}
        title="Unable to load consultations"
        description="Supervisor access may be unavailable, or the queue could not be refreshed."
      />
    );
  }

  if (!data?.results?.length) {
    return (
      <DashboardEmptyState
        icon={Stethoscope}
        title="No active consultations"
        description="No clinician has a currently claimed encounter across the facility."
      />
    );
  }

  const displayItems = data.results.slice(0, MAX_DISPLAY_ITEMS);
  const hasMore = data.count > MAX_DISPLAY_ITEMS;

  return (
    <div className="space-y-3">
      <TooltipProvider delayDuration={200}>
        <ul className="space-y-3" aria-label="All active consultations">
          {displayItems.map((encounter) => (
            <li key={encounter.id}>
              <Link
                href={`/encounters/${encounter.id}`}
                className="group block rounded-xl border border-border/60 bg-muted/10 p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-info/10 text-info text-sm">
                      {encounter.patient_name
                        ?.split(' ')
                        .map((namePart) => namePart[0])
                        .join('')
                        .slice(0, 2) || '??'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {encounter.patient_name || 'Unknown Patient'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {encounter.chief_complaint || 'Chief complaint not recorded.'}
                        </p>
                      </div>
                      <Badge
                        variant={encounter.status === 'IN_PROGRESS' ? 'default' : 'secondary'}
                        className="shrink-0 w-fit self-start"
                      >
                        {encounter.status === 'IN_PROGRESS' ? 'Active' : 'Claimed'}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {encounter.patient_mrn && (
                        <Badge variant="outline" className="w-fit shrink-0">
                          {encounter.patient_mrn}
                        </Badge>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="w-fit shrink-0 gap-1">
                            <User className="h-3 w-3" aria-hidden="true" />
                            {encounter.assigned_clinician_name?.split(' ')[0] ||
                              encounter.assigned_clinician_username ||
                              'Unknown'}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Clinician: {encounter.assigned_clinician_name || encounter.assigned_clinician_username}
                        </TooltipContent>
                      </Tooltip>

                      {encounter.claimed_at && (
                        <Badge variant="secondary" className="w-fit shrink-0 gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Claimed {formatRelativeTime(encounter.claimed_at)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </TooltipProvider>

      {hasMore && (
        <DashboardFooterLink href="/encounters?filter=all_claimed" label={`View All (${data.count})`} />
      )}
    </div>
  );
}

export default AllClaimedEncountersWidget;

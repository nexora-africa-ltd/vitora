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
import { ChevronRight, Users, Clock, User } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAllClaimedEncounters } from '@/lib/hooks/use-consultation-queue';

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
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-4">
        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          Unable to load claimed encounters
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          You may not have supervisor access
        </p>
      </div>
    );
  }

  if (!data?.results?.length) {
    return (
      <div className="text-center py-4">
        <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No active consultations
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          All clinicians are available
        </p>
      </div>
    );
  }

  const displayItems = data.results.slice(0, MAX_DISPLAY_ITEMS);
  const hasMore = data.count > MAX_DISPLAY_ITEMS;

  return (
    <div className="space-y-3">
      <TooltipProvider delayDuration={200}>
        {displayItems.map((encounter) => (
          <Link
            key={encounter.id}
            href={`/encounters/${encounter.id}`}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 dark:hover:bg-muted/30 group"
          >
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-500/10 text-blue-600 text-sm">
                {encounter.patient_name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2) || '??'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {encounter.patient_name || 'Unknown Patient'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {encounter.patient_mrn} • {encounter.chief_complaint?.slice(0, 25)}
                {(encounter.chief_complaint?.length || 0) > 25 ? '...' : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Clinician info */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs gap-1 hidden sm:flex">
                    <User className="h-3 w-3" />
                    {encounter.assigned_clinician_name?.split(' ')[0] ||
                      encounter.assigned_clinician_username ||
                      'Unknown'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Clinician: {encounter.assigned_clinician_name || encounter.assigned_clinician_username}
                </TooltipContent>
              </Tooltip>

              {/* Claimed time */}
              {encounter.claimed_at && (
                <Badge variant="secondary" className="text-xs gap-1 hidden md:flex">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(encounter.claimed_at)}
                </Badge>
              )}

              {/* Status indicator */}
              <Badge
                variant={encounter.status === 'IN_PROGRESS' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {encounter.status === 'IN_PROGRESS' ? 'Active' : 'Claimed'}
              </Badge>
            </div>
          </Link>
        ))}
      </TooltipProvider>

      {/* View All Link */}
      {hasMore && (
        <div className="pt-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-center" asChild>
            <Link href="/encounters?filter=all_claimed">
              View All ({data.count})
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default AllClaimedEncountersWidget;

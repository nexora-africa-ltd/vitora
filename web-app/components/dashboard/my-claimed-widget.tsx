/**
 * MyClaimedEncountersWidget Component
 *
 * Dashboard widget showing encounters claimed by the current user.
 *
 * Sprint 1.7: Data Integrity - Clinician Claim/Release
 *
 * Features:
 * - List of claimed encounters with patient info
 * - Clickable cards navigate to encounter
 * - Quick release action
 * - Real-time polling (30s)
 */
'use client';

import Link from 'next/link';
import { Clock, UserCheck, UserX } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMyClaimedEncounters, useReleaseEncounter } from '@/lib/hooks/use-consultation-queue';
import { useToast } from '@/lib/hooks/use-toast';
import { getApiErrorMessage } from '@/lib/api/client';
import { DashboardEmptyState, DashboardFooterLink, DashboardListSkeleton } from './widget-primitives';

const MAX_DISPLAY_ITEMS = 5;

export function MyClaimedEncountersWidget() {
  const { data, isLoading } = useMyClaimedEncounters();
  const releaseMutation = useReleaseEncounter();
  const { toast } = useToast();

  const handleRelease = async (encounterId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await releaseMutation.mutateAsync(encounterId);
      toast({
        title: 'Encounter Released',
        description: 'Another clinician can now claim this encounter.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: getApiErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return <DashboardListSkeleton rows={3} />;
  }

  if (!data?.results?.length) {
    return (
      <DashboardEmptyState
        icon={UserCheck}
        title="No claimed encounters"
        description="Claim an encounter from the queue to start a consultation and it will appear here."
      />
    );
  }

  const displayItems = data.results.slice(0, MAX_DISPLAY_ITEMS);
  const hasMore = data.count > MAX_DISPLAY_ITEMS;

  return (
    <div className="space-y-3">
      <TooltipProvider delayDuration={200}>
        <ul className="space-y-3" aria-label="My active consultations">
          {displayItems.map((encounter) => (
            <li key={encounter.id}>
              <Link
                href={`/encounters/${encounter.id}`}
                className="group block rounded-xl border border-border/60 bg-muted/10 p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {encounter.patient_name
                        ?.split(' ')
                        .map((namePart) => namePart[0])
                        .join('')
                        .slice(0, 2) || '??'}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                          {encounter.patient_name || 'Unknown Patient'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {encounter.chief_complaint || 'Chief complaint not recorded.'}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleRelease(encounter.id, e)}
                            disabled={releaseMutation.isPending}
                            aria-label={`Release ${encounter.patient_name || 'encounter'}`}
                          >
                            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Release encounter</TooltipContent>
                      </Tooltip>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {encounter.patient_mrn && (
                        <Badge variant="outline" className="w-fit shrink-0">
                          {encounter.patient_mrn}
                        </Badge>
                      )}
                      {encounter.claimed_at && (
                        <Badge variant="secondary" className="w-fit shrink-0 gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatRelativeTime(encounter.claimed_at)}
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
        <DashboardFooterLink href="/encounters?filter=my_claimed" label={`View All (${data.count})`} />
      )}
    </div>
  );
}

export default MyClaimedEncountersWidget;

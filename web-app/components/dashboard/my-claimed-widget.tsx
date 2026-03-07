/**
 * MyClaimedEncountersWidget Component
 *
 * Dashboard widget showing encounters claimed by the current user.
 *
 * Sprint 1.7: Data Integrity - Clinician Claim/Release
 *
 * Features:
 * - List of claimed encounters with patient info
 * - Quick actions: Continue consultation, Release
 * - Real-time polling (30s)
 * - Reuses existing UI patterns (Avatar, Badge, Button, Card)
 */
'use client';

import Link from 'next/link';
import { Clock, Play, UserCheck, UserX } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      <ul className="space-y-3" aria-label="My active consultations">
        {displayItems.map((encounter) => (
          <li key={encounter.id}>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={`/encounters/${encounter.id}`}
                        className="inline-flex max-w-full items-center gap-2 rounded-md text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="truncate">{encounter.patient_name || 'Unknown Patient'}</span>
                      </Link>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {encounter.chief_complaint || 'Chief complaint not recorded.'}
                      </p>
                    </div>
                    <Badge variant="default" className="shrink-0 w-fit self-start">
                      In Progress
                    </Badge>
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
                        Claimed {formatRelativeTime(encounter.claimed_at)}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button size="sm" asChild>
                      <Link href={`/encounters/${encounter.id}`}>
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Continue
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => handleRelease(encounter.id, e)}
                      disabled={releaseMutation.isPending}
                      aria-label={`Release ${encounter.patient_name || 'encounter'}`}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" />
                      Release
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <DashboardFooterLink href="/encounters?filter=my_claimed" label={`View All (${data.count})`} />
      )}
    </div>
  );
}

export default MyClaimedEncountersWidget;

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
import { ChevronRight, UserCheck, Clock, Play, UserX } from 'lucide-react';
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
import { useMyClaimedEncounters, useReleaseEncounter } from '@/lib/hooks/use-consultation-queue';
import { useToast } from '@/lib/hooks/use-toast';

const MAX_DISPLAY_ITEMS = 5;

export function MyClaimedEncountersWidget() {
  const { data, isLoading } = useMyClaimedEncounters();
  const releaseMutation = useReleaseEncounter();
  const { toast } = useToast();

  const handleRelease = async (encounterId: number, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
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
        description: error instanceof Error ? error.message : 'Failed to release encounter',
        variant: 'destructive',
      });
    }
  };

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

  if (!data?.results?.length) {
    return (
      <div className="text-center py-6">
        <UserCheck className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No claimed encounters
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Claim an encounter from the queue to start consultation
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
              <AvatarFallback className="bg-primary/10 text-primary text-sm">
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
                {encounter.patient_mrn} • {encounter.chief_complaint?.slice(0, 30)}
                {(encounter.chief_complaint?.length || 0) > 30 ? '...' : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Claimed time */}
              {encounter.claimed_at && (
                <Badge variant="secondary" className="text-xs gap-1 hidden sm:flex">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(encounter.claimed_at)}
                </Badge>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.preventDefault();
                        // Navigation happens via Link
                      }}
                    >
                      <Play className="h-4 w-4 text-green-600" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Continue consultation</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => handleRelease(encounter.id, e)}
                      disabled={releaseMutation.isPending}
                    >
                      <UserX className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Release encounter</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </Link>
        ))}
      </TooltipProvider>

      {/* View All Link */}
      {hasMore && (
        <div className="pt-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-center" asChild>
            <Link href="/encounters?filter=my_claimed">
              View All ({data.count})
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default MyClaimedEncountersWidget;

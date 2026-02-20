'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Filter, Calendar, Users, ClipboardList, Activity, Clock, Play, UserX } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EncounterTable } from '@/components/encounters/encounter-table';
import { ConsultationQueueContainer } from '@/components/encounters/consultation-queue-container';
import { useEncounters } from '@/lib/hooks/use-encounters';
import { useMyClaimedEncounters, useAllClaimedEncounters, useReleaseEncounter } from '@/lib/hooks/use-consultation-queue';
import { useToast } from '@/lib/hooks/use-toast';
import { formatRelativeTime } from '@/lib/utils/format';
import { ENCOUNTER_TYPES, ENCOUNTER_STATUS } from '@/lib/utils/constants';
import type { Encounter } from '@/lib/types/encounter';

export default function EncountersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('queue');
  const [status, setStatus] = useState<string>('');
  const [encounterType, setEncounterType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [showOnlyMine, setShowOnlyMine] = useState(true);
  const pageSize = 10;

  const { data, isLoading, error } = useEncounters({
    page,
    page_size: pageSize,
    status: status || undefined,
    encounter_type: encounterType || undefined,
    ordering: '-encounter_date',
  });

  // Active encounters queries
  const { data: myClaimedData, isLoading: isMyClaimedLoading } = useMyClaimedEncounters(
    undefined,
    { pollingInterval: activeTab === 'active' ? 15000 : false }
  );
  const { data: allClaimedData, isLoading: isAllClaimedLoading } = useAllClaimedEncounters(
    undefined,
    { pollingInterval: activeTab === 'active' && !showOnlyMine ? 15000 : false, enabled: !showOnlyMine }
  );

  const releaseMutation = useReleaseEncounter();

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
        description: error instanceof Error ? error.message : 'Failed to release encounter',
        variant: 'destructive',
      });
    }
  };

  const activeEncounters = showOnlyMine ? myClaimedData?.results : allClaimedData?.results;
  const activeEncountersCount = showOnlyMine ? myClaimedData?.count : allClaimedData?.count;
  const isActiveLoading = showOnlyMine ? isMyClaimedLoading : isAllClaimedLoading;

  const totalPages = data ? Math.ceil(data.count / pageSize) : 0;

  return (
    <div className="container mx-auto px-3 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Encounters"
        helpContent="Manage patient consultations and clinical encounters. Use the queue for active consultations or browse all encounters."
        actions={
          <Button onClick={() => router.push('/encounters/new')} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New Encounter</span>
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-lg grid-cols-3 h-auto">
          <TabsTrigger value="queue" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="sm:hidden">Queue</span>
            <span className="hidden sm:inline">Queue</span>
          </TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="sm:hidden">Active</span>
            <span className="hidden sm:inline">Active</span>
            {(activeEncountersCount ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {activeEncountersCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <ClipboardList className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="sm:hidden">All</span>
            <span className="hidden sm:inline">All</span>
          </TabsTrigger>
        </TabsList>

        {/* Consultation Queue Tab */}
        <TabsContent value="queue" className="space-y-4">
          <ConsultationQueueContainer />
        </TabsContent>

        {/* Active Encounters Tab */}
        <TabsContent value="active" className="space-y-4">
          {/* Filter toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id="only-mine"
                checked={showOnlyMine}
                onCheckedChange={setShowOnlyMine}
              />
              <Label htmlFor="only-mine" className="text-sm cursor-pointer">
                Only show my encounters
              </Label>
            </div>
            {!showOnlyMine && (
              <p className="text-xs text-muted-foreground">
                Showing all active encounters across clinicians
              </p>
            )}
          </div>

          {/* Active encounters list */}
          {isActiveLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !activeEncounters?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {showOnlyMine ? 'No active encounters' : 'No encounters in progress'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {showOnlyMine
                    ? 'Claim an encounter from the queue to start consultation'
                    : 'No clinicians are currently seeing patients'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <TooltipProvider delayDuration={200}>
                {activeEncounters.map((encounter: Encounter) => (
                  <Card key={encounter.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="p-4">
                      <Link
                        href={`/encounters/${encounter.id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {encounter.patient_name
                              ?.split(' ')
                              .map((n: string) => n[0])
                              .join('')
                              .slice(0, 2) || '??'}
                          </AvatarFallback>
                        </Avatar>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {encounter.patient_name || 'Unknown Patient'}
                            </p>
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {encounter.encounter_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {encounter.patient_mrn} • {encounter.chief_complaint?.slice(0, 40)}
                            {(encounter.chief_complaint?.length || 0) > 40 ? '...' : ''}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {encounter.claimed_at
                                ? formatRelativeTime(encounter.claimed_at)
                                : encounter.created_at
                                  ? formatRelativeTime(encounter.created_at)
                                  : 'Just now'}
                            </span>
                            {!showOnlyMine && encounter.assigned_clinician_name && (
                              <span className="text-xs text-muted-foreground">
                                • {encounter.assigned_clinician_name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8"
                                onClick={(e) => {
                                  e.preventDefault();
                                  router.push(`/encounters/${encounter.id}`);
                                }}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                <span className="hidden sm:inline">Continue</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Continue consultation</TooltipContent>
                          </Tooltip>

                          {showOnlyMine && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => handleRelease(encounter.id, e)}
                                  disabled={releaseMutation.isPending}
                                >
                                  <UserX className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Release encounter</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </TooltipProvider>
            </div>
          )}
        </TabsContent>

        {/* All Encounters Tab */}
        <TabsContent value="all" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ENCOUNTER_STATUS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={encounterType}
              onValueChange={(value) => {
                setEncounterType(value === 'all' ? '' : value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <Calendar className="h-4 w-4 mr-2 shrink-0" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ENCOUNTER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Encounters table */}
          <EncounterTable
            encounters={data?.results ?? []}
            isLoading={isLoading}
            error={error as Error | null}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

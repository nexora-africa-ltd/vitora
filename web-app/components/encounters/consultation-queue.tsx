/**
 * ConsultationQueue Component
 *
 * Displays the consultation queue with:
 * - List of patients waiting for consultation
 * - Filtering by status, triage category
 * - Priority-based sorting
 * - Real-time updates via polling
 * - Actions: Call Patient, Start Consultation
 *
 * Phase 3.1: Consultation Queue Component
 */
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Users, AlertCircle, Filter, PhoneCall, Forward, LogIn } from 'lucide-react';
import { ConsultationQueueItem } from './consultation-queue-item';
import { ConsultationQueueGridItem } from './consultation-queue-grid-item';
import StatusIndicator from '@/components/ui/status-indicator';
import { HelpPopover } from '@/components/shared/help-popover';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityGrid } from '@/components/shared/entity-card';
import type {
  ConsultationQueueItem as QueueItemType,
  ConsultationQueueFilters,
  ConsultationQueueStats,
  ConsultationStatus,
  TriageStatus,
} from '@/lib/types/encounter';

// =============================================================================
// Types
// =============================================================================

export interface ConsultationQueueProps {
  queueItems: QueueItemType[];
  /** Current user's ID for claim ownership check */
  currentUserId?: number;
  /** Call patient - now also claims automatically */
  onCallPatient: (encounterId: number) => Promise<void> | void;
  onStartConsultation: (encounterId: number) => Promise<void> | void;
  /** @deprecated Claim is now automatic when calling. Kept for backward compatibility. */
  onClaimEncounter?: (encounterId: number) => Promise<void> | void;
  /** Release encounter callback (Data Integrity - Sprint 1.7) */
  onReleaseEncounter?: (encounterId: number) => Promise<void> | void;
  isLoading?: boolean;
  error?: string | null;
  autoRefreshInterval?: number; // ms, 0 to disable
  /** @deprecated Use isCallingPatient on individual items */
  isClaimingEncounter?: boolean;
  isReleasingEncounter?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

const calculateStats = (items: QueueItemType[]): ConsultationQueueStats => {
  const stats: ConsultationQueueStats = {
    total: items.length,
    waiting: 0,
    called: 0,
    by_category: {
      RED: 0,
      ORANGE: 0,
      YELLOW: 0,
      GREEN: 0,
      BLUE: 0,
      bypassed: 0,
      direct: 0,
    },
  };

  items.forEach((item) => {
    // Count by consultation status
    if (item.consultation_status === 'WAITING') stats.waiting++;
    if (item.consultation_status === 'CALLED') stats.called++;

    // Count by triage category
    if (item.triage_status === 'BYPASSED') {
      stats.by_category.bypassed++;
    } else if (item.triage_status === 'NOT_APPLICABLE') {
      stats.by_category.direct++;
    } else if (item.triage_category) {
      const cat = item.triage_category as keyof typeof stats.by_category;
      if (cat in stats.by_category) {
        stats.by_category[cat]++;
      }
    }
  });

  return stats;
};

const filterItems = (
  items: QueueItemType[],
  filters: ConsultationQueueFilters
): QueueItemType[] => {
  return items.filter((item) => {
    // Filter by consultation status
    if (filters.consultation_status && item.consultation_status !== filters.consultation_status) {
      return false;
    }

    // Filter by triage status
    if (filters.triage_status && item.triage_status !== filters.triage_status) {
      return false;
    }

    // Filter by search query
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const matchesName = item.patient_name.toLowerCase().includes(search);
      const matchesMrn = item.patient_mrn.toLowerCase().includes(search);
      const matchesComplaint = item.chief_complaint.toLowerCase().includes(search);
      if (!matchesName && !matchesMrn && !matchesComplaint) {
        return false;
      }
    }

    return true;
  });
};

// Priority order for triage categories
const CATEGORY_PRIORITY: Record<string, number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

const sortByPriority = (items: QueueItemType[]): QueueItemType[] => {
  return [...items].sort((a, b) => {
    // Called patients come first (they're being processed)
    if (a.consultation_status === 'CALLED' && b.consultation_status !== 'CALLED') return -1;
    if (b.consultation_status === 'CALLED' && a.consultation_status !== 'CALLED') return 1;

    // Then sort by triage category priority
    const aPriority = a.triage_category ? CATEGORY_PRIORITY[a.triage_category] || 6 : 6;
    const bPriority = b.triage_category ? CATEGORY_PRIORITY[b.triage_category] || 6 : 6;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Then by wait time (longer wait first)
    return b.wait_time_minutes - a.wait_time_minutes;
  });
};

// =============================================================================
// Component
// =============================================================================

export function ConsultationQueue({
  queueItems,
  currentUserId,
  onCallPatient,
  onStartConsultation,
  onClaimEncounter,
  onReleaseEncounter,
  isLoading = false,
  error = null,
  autoRefreshInterval = 0,
  isClaimingEncounter = false,
  isReleasingEncounter = false,
}: ConsultationQueueProps) {
  const [filters, setFilters] = useState<ConsultationQueueFilters>({});
  const [callingPatientId, setCallingPatientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Calculate stats
  const stats = useMemo(() => calculateStats(queueItems), [queueItems]);

  // Filter and sort items
  const displayedItems = useMemo(() => {
    const filtered = filterItems(queueItems, { ...filters, search: searchQuery });
    return sortByPriority(filtered);
  }, [queueItems, filters, searchQuery]);

  // Handle call patient
  const handleCallPatient = useCallback(
    async (encounterId: number) => {
      setCallingPatientId(encounterId);
      try {
        await onCallPatient(encounterId);
      } finally {
        setCallingPatientId(null);
      }
    },
    [onCallPatient]
  );

  // Handle start consultation
  const handleStartConsultation = useCallback(
    async (encounterId: number) => {
      await onStartConsultation(encounterId);
    },
    [onStartConsultation]
  );

  // Handle filter change
  const handleStatusFilter = (value: string) => {
    if (value === 'all') {
      setFilters((prev) => ({ ...prev, consultation_status: undefined }));
    } else {
      setFilters((prev) => ({
        ...prev,
        consultation_status: value as ConsultationStatus,
      }));
    }
  };

  const handleTriageFilter = (value: string) => {
    if (value === 'all') {
      setFilters((prev) => ({ ...prev, triage_status: undefined }));
    } else {
      setFilters((prev) => ({
        ...prev,
        triage_status: value as TriageStatus,
      }));
    }
  };

  // Loading state
  if (isLoading && queueItems.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 shrink-0" />
            <CardTitle className="text-lg sm:text-xl">Consultation Queue</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-3 sm:space-y-4" data-testid="queue-loading">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg sm:h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 shrink-0" />
            <CardTitle className="text-lg sm:text-xl">Consultation Queue</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div
            className="flex flex-col items-center justify-center py-6 text-center sm:py-8"
            data-testid="error-state"
          >
            <AlertCircle className="mb-3 h-10 w-10 text-destructive sm:mb-4 sm:h-12 sm:w-12" />
            <p className="mb-2 text-sm font-medium text-destructive sm:text-base">
              Failed to load queue
            </p>
            <p className="mb-4 px-4 text-xs text-muted-foreground sm:text-sm">{error}</p>
            <p className="text-xs text-muted-foreground">Pull down to retry</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Header Row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <Users className="h-5 w-5 shrink-0" />
              <CardTitle className="truncate text-lg sm:text-xl">Consultation Queue</CardTitle>
              <HelpPopover content="Patients waiting for consultation appear here, sorted by triage priority. Call a patient, then start their consultation to document the encounter." />
              <Badge variant="secondary" className="shrink-0 text-xs">
                {stats.total}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <ViewToggle value={viewMode} onChange={setViewMode} />

              {/* Polling Status Indicator */}
              {autoRefreshInterval > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusIndicator state="active" size="sm" />
                  <span className="hidden sm:inline">Auto-refresh</span>
                </div>
              )}
            </div>
          </div>

          {/* Stats Summary - Colored Dots */}
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap items-center gap-3" data-testid="queue-stats">
              {stats.by_category.RED > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-red-500" />
                      <span className="text-sm font-medium">{stats.by_category.RED}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>RED - Immediate</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.ORANGE > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-orange-500" />
                      <span className="text-sm font-medium">{stats.by_category.ORANGE}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>ORANGE - Very Urgent</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.YELLOW > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-yellow-500" />
                      <span className="text-sm font-medium">{stats.by_category.YELLOW}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>YELLOW - Urgent</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.GREEN > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-green-500" />
                      <span className="text-sm font-medium">{stats.by_category.GREEN}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>GREEN - Standard</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.BLUE > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1">
                      <span className="h-3 w-3 shrink-0 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium">{stats.by_category.BLUE}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>BLUE - Non-Urgent</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.bypassed > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1 text-muted-foreground">
                      <Forward className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-sm">{stats.by_category.bypassed}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Bypassed Triage</TooltipContent>
                </Tooltip>
              )}
              {stats.by_category.direct > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1 text-muted-foreground">
                      <LogIn className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-sm">{stats.by_category.direct}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Direct (No Triage)</TooltipContent>
                </Tooltip>
              )}
              {stats.called > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-1 text-blue-600">
                      <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-sm font-medium">{stats.called}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Called Patients</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search patient by name, MRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search queue"
            />
          </div>

          {/* Status Filter */}
          <Select value={filters.consultation_status || 'all'} onValueChange={handleStatusFilter}>
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="WAITING">Waiting</SelectItem>
              <SelectItem value="CALLED">Called</SelectItem>
            </SelectContent>
          </Select>

          {/* Triage Filter */}
          <Select value={filters.triage_status || 'all'} onValueChange={handleTriageFilter}>
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by triage">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Triage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triage</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="BYPASSED">Bypassed</SelectItem>
              <SelectItem value="NOT_APPLICABLE">Direct</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="px-3 sm:px-6">
        {/* Empty State */}
        {displayedItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-8 text-center sm:py-12"
            data-testid="empty-queue"
          >
            <Users className="mb-3 h-10 w-10 text-muted-foreground sm:mb-4 sm:h-12 sm:w-12" />
            <p className="mb-2 text-sm font-medium text-muted-foreground sm:text-base">
              {queueItems.length === 0 ? 'No patients waiting' : 'No patients match your filters'}
            </p>
            {queueItems.length > 0 && (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  setFilters({});
                  setSearchQuery('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List View */
          <div className="space-y-2 sm:space-y-3" data-testid="queue-list">
            {displayedItems.map((item) => (
              <ConsultationQueueItem
                key={item.id}
                item={item}
                currentUserId={currentUserId}
                onCall={handleCallPatient}
                onStartConsultation={handleStartConsultation}
                onClaim={onClaimEncounter}
                onRelease={onReleaseEncounter}
                isCallingPatient={callingPatientId === item.id}
                isClaimingEncounter={isClaimingEncounter}
                isReleasingEncounter={isReleasingEncounter}
              />
            ))}
          </div>
        ) : (
          /* Grid View */
          <EntityGrid data-testid="queue-grid">
            {displayedItems.map((item) => (
              <ConsultationQueueGridItem
                key={item.id}
                item={item}
                currentUserId={currentUserId}
                onCall={handleCallPatient}
                onStartConsultation={handleStartConsultation}
                onClaim={onClaimEncounter}
                onRelease={onReleaseEncounter}
                isCallingPatient={callingPatientId === item.id}
                isClaimingEncounter={isClaimingEncounter}
                isReleasingEncounter={isReleasingEncounter}
              />
            ))}
          </EntityGrid>
        )}
      </CardContent>
    </Card>
  );
}

export default ConsultationQueue;

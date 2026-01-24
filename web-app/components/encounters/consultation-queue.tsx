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
import {
  RefreshCw,
  Search,
  Users,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { ConsultationQueueItem } from './consultation-queue-item';
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
  onRefresh?: () => void;
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
  onRefresh,
  isLoading = false,
  error = null,
  autoRefreshInterval = 0,
  isClaimingEncounter = false,
  isReleasingEncounter = false,
}: ConsultationQueueProps) {
  const [filters, setFilters] = useState<ConsultationQueueFilters>({});
  const [callingPatientId, setCallingPatientId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Consultation Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4" data-testid="queue-loading">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Consultation Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center py-8 text-center"
            data-testid="error-state"
          >
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <p className="text-destructive font-medium mb-2">Failed to load queue</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            {onRefresh && (
              <Button variant="outline" onClick={onRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Consultation Queue
            <Badge variant="secondary" className="ml-2">
              {stats.total} patients
            </Badge>
          </CardTitle>

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')}
              />
              Refresh
            </Button>
          )}
        </div>

        {/* Stats Summary */}
        <div className="flex flex-wrap gap-2 mt-4" data-testid="queue-stats">
          {stats.by_category.RED > 0 && (
            <Badge className="bg-red-500 text-white">
              RED: {stats.by_category.RED}
            </Badge>
          )}
          {stats.by_category.ORANGE > 0 && (
            <Badge className="bg-orange-500 text-white">
              ORANGE: {stats.by_category.ORANGE}
            </Badge>
          )}
          {stats.by_category.YELLOW > 0 && (
            <Badge className="bg-yellow-500 text-black">
              YELLOW: {stats.by_category.YELLOW}
            </Badge>
          )}
          {stats.by_category.GREEN > 0 && (
            <Badge className="bg-green-500 text-white">
              GREEN: {stats.by_category.GREEN}
            </Badge>
          )}
          {stats.by_category.BLUE > 0 && (
            <Badge className="bg-blue-500 text-white">
              BLUE: {stats.by_category.BLUE}
            </Badge>
          )}
          {stats.by_category.bypassed > 0 && (
            <Badge variant="secondary">
              Bypassed: {stats.by_category.bypassed}
            </Badge>
          )}
          {stats.by_category.direct > 0 && (
            <Badge variant="secondary">
              Direct: {stats.by_category.direct}
            </Badge>
          )}
          {stats.called > 0 && (
            <Badge variant="outline" className="border-blue-500 text-blue-600">
              Called: {stats.called}
            </Badge>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search patient by name, MRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search queue"
            />
          </div>

          {/* Status Filter */}
          <Select
            value={filters.consultation_status || 'all'}
            onValueChange={handleStatusFilter}
          >
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="WAITING">Waiting</SelectItem>
              <SelectItem value="CALLED">Called</SelectItem>
            </SelectContent>
          </Select>

          {/* Triage Filter */}
          <Select
            value={filters.triage_status || 'all'}
            onValueChange={handleTriageFilter}
          >
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by triage">
              <Filter className="h-4 w-4 mr-2" />
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

      <CardContent>
        {/* Empty State */}
        {displayedItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-center"
            data-testid="empty-queue"
          >
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium mb-2">
              {queueItems.length === 0
                ? 'No patients waiting'
                : 'No patients match your filters'}
            </p>
            {queueItems.length > 0 && (
              <Button
                variant="link"
                onClick={() => {
                  setFilters({});
                  setSearchQuery('');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3" data-testid="queue-list">
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
        )}
      </CardContent>
    </Card>
  );
}

export default ConsultationQueue;

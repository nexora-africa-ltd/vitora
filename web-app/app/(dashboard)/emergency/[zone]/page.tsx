/**
 * Zone Queue Page
 *
 * Displays the triage queue filtered to a single ER zone, with zone-specific
 * header showing capacity, KETA target wait times, and queue actions
 * (call, mark with clinician, complete, LWBS).
 *
 * Route: /emergency/[zone] (e.g., /emergency/resus, /emergency/acute)
 *
 * Phase 2: Zone-Specific Views
 */
'use client';

import { useMemo, useState, useCallback } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import {
  Phone,
  UserCheck,
  CheckCircle,
  LogOut,
  Clock,
  AlertCircle,
  Users,
  Search,
  ChevronRight,
  AlertTriangle,
  Filter,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import StatusIndicator from '@/components/ui/status-indicator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TriageCategoryBadge } from '@/components/triage/triage-category-badge';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { useTriageQueue, useTriageQueueActions } from '@/lib/hooks/use-triage';
import { useZonesSummary } from '@/lib/hooks/use-triage';
import { useEmergencySocket } from '@/lib/hooks/use-websocket';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import {
  ROUTE_TO_ZONE,
  ZONE_METADATA,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  TRIAGE_CATEGORY_ORDER,
} from '@/lib/config/emergency';
import {
  TRIAGE_CATEGORY_CONFIG,
  QUEUE_STATUS_CONFIG,
} from '@/lib/types/triage';
import type { TriageCategory, TriageQueueEntry, QueueStatus } from '@/lib/types/triage';
import { cn } from '@/lib/utils/cn';
import { HelpPopover } from '@/components/shared/help-popover';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatWaitTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function getWaitTimeClass(category: TriageCategory, waitMinutes: number): string {
  const target = TRIAGE_CATEGORY_CONFIG[category].targetWaitMinutes;
  if (category === 'RED' && waitMinutes > 0) return 'text-destructive font-semibold';
  if (waitMinutes > target) return 'text-orange-600 dark:text-orange-400 font-semibold';
  return 'text-muted-foreground';
}

function isWaitTimeExceeded(category: TriageCategory, waitMinutes: number): boolean {
  return waitMinutes > TRIAGE_CATEGORY_CONFIG[category].targetWaitMinutes;
}

// =============================================================================
// QUEUE CARD COMPONENT
// =============================================================================

interface QueueCardProps {
  item: TriageQueueEntry;
  onCall: () => void;
  onWithClinician: () => void;
  onComplete: () => void;
  onLWBS: () => void;
  onSelect: () => void;
}

function QueueCard({ item, onCall, onWithClinician, onComplete, onLWBS, onSelect }: QueueCardProps) {
  const waitTimeClass = getWaitTimeClass(item.triage_category, item.wait_time_minutes);
  const genderDisplay = item.patient_gender === 'M' ? 'M' : item.patient_gender === 'F' ? 'F' : 'O';

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        item.triage_category === 'RED' && 'border-l-4 border-l-red-500',
        item.triage_category === 'ORANGE' && 'border-l-4 border-l-orange-500',
        item.triage_category === 'YELLOW' && 'border-l-4 border-l-yellow-500',
        item.triage_category === 'GREEN' && 'border-l-4 border-l-green-500',
        item.triage_category === 'BLUE' && 'border-l-4 border-l-blue-500',
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Patient Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{item.patient_name}</h3>
              <Badge variant="outline" className="text-xs shrink-0">
                {item.patient_age} yrs &bull; {genderDisplay}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{item.patient_mrn}</p>
            <p className="text-sm mb-2 line-clamp-1">
              <span className="font-medium">CC:</span> {item.chief_complaint || 'Not specified'}
            </p>
          </div>

          {/* Right Side: Category, Status, Wait Time */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <TriageCategoryBadge category={item.triage_category} size="sm" />

            <Badge
              variant={
                item.status === 'WAITING'
                  ? 'secondary'
                  : item.status === 'CALLED'
                    ? 'default'
                    : item.status === 'WITH_CLINICIAN'
                      ? 'default'
                      : 'outline'
              }
              className={cn(
                'text-xs',
                item.status === 'WITH_CLINICIAN' && 'bg-green-500 hover:bg-green-600',
              )}
            >
              {QUEUE_STATUS_CONFIG[item.status]?.label || item.status}
            </Badge>

            <div className={cn('flex items-center gap-1 text-sm', waitTimeClass)}>
              <Clock className="h-3 w-3" />
              <span>{formatWaitTime(item.wait_time_minutes)}</span>
              {isWaitTimeExceeded(item.triage_category, item.wait_time_minutes) && (
                <AlertTriangle className="h-3 w-3" />
              )}
            </div>

            {item.alerts_count > 0 && (
              <div className="flex items-center gap-1 text-destructive text-xs">
                <AlertCircle className="h-3 w-3" />
                <span>{item.alerts_count} alerts</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className="flex items-center gap-2 mt-3 pt-3 border-t"
          onClick={(e) => e.stopPropagation()}
        >
          {item.status === 'WAITING' && (
            <>
              <Button size="sm" variant="default" onClick={onCall}>
                <Phone className="h-3 w-3 mr-1" />
                Call
              </Button>
              <Button size="sm" variant="outline" onClick={onLWBS}>
                <LogOut className="h-3 w-3 mr-1" />
                LWBS
              </Button>
            </>
          )}
          {item.status === 'CALLED' && (
            <Button size="sm" variant="default" onClick={onWithClinician}>
              <UserCheck className="h-3 w-3 mr-1" />
              With Doctor
            </Button>
          )}
          {item.status === 'WITH_CLINICIAN' && (
            <Button size="sm" variant="default" onClick={onComplete}>
              <CheckCircle className="h-3 w-3 mr-1" />
              Complete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onSelect}>
            View Details
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function QueueSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function ZoneQueuePage() {
  const params = useParams();
  const router = useRouter();
  const { isRefreshing, refresh } = usePageRefresh();

  const zoneSlug = params.zone as string;
  const zoneCode = ROUTE_TO_ZONE[zoneSlug];

  // Validate zone slug
  if (!zoneCode) {
    notFound();
  }

  const zoneMeta = ZONE_METADATA.find((z) => z.route === zoneSlug)!;
  const categoryColor = CATEGORY_COLORS[zoneMeta.primaryCategory];

  // Fetch queue filtered to this zone
  const {
    data: queueData,
    isLoading,
    refetch,
  } = useTriageQueue({ area: zoneCode });

  // Queue actions: call, with-clinician, complete, LWBS
  const {
    callPatient,
    markWithClinician,
    markComplete,
    markLWBS,
    isLoading: actionLoading,
  } = useTriageQueueActions();

  // Zone summary (for capacity info)
  const { isConnected, zonesData: wsZonesData } = useEmergencySocket();
  const { data: polledZonesData } = useZonesSummary({ enabled: !isConnected });

  const zoneInfo = useMemo(() => {
    const data = isConnected && wsZonesData ? wsZonesData : polledZonesData;
    return data?.zones.find((z) => z.code === zoneCode) ?? null;
  }, [isConnected, wsZonesData, polledZonesData, zoneCode]);

  // Filter & search state
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // LWBS dialog state
  const [lwbsDialogOpen, setLwbsDialogOpen] = useState(false);
  const [lwbsItemId, setLwbsItemId] = useState<number | null>(null);
  const [lwbsReason, setLwbsReason] = useState('');

  // Get queue items from paginated response
  const queueItems = useMemo(() => {
    if (!queueData?.results) return [];
    let items = [...queueData.results];

    // Apply text search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.patient_name.toLowerCase().includes(lower) ||
          item.patient_mrn.toLowerCase().includes(lower) ||
          item.chief_complaint?.toLowerCase().includes(lower),
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      items = items.filter((item) => item.triage_category === categoryFilter);
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      items = items.filter((item) => item.status === statusFilter);
    }

    return items;
  }, [queueData, searchTerm, categoryFilter, statusFilter]);

  // Count by category for KPI bar
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    (queueData?.results ?? []).forEach((item) => {
      counts[item.triage_category] = (counts[item.triage_category] || 0) + 1;
    });
    return counts;
  }, [queueData]);

  // Count by status
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { WAITING: 0, CALLED: 0, WITH_CLINICIAN: 0 };
    (queueData?.results ?? []).forEach((item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [queueData]);

  const totalCount = queueData?.results?.length ?? 0;
  const hasActiveFilters = searchTerm || categoryFilter !== 'all' || statusFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setCategoryFilter('all');
    setStatusFilter('all');
  }, []);

  const handleRefresh = async () => {
    await refetch();
    refresh();
  };

  const handleSelectPatient = (item: TriageQueueEntry) => {
    // Navigate to encounter detail (all triaged patients have an encounter)
    router.push(`/triage/${item.triage_assessment}`);
  };

  const handleLWBS = (itemId: number) => {
    setLwbsItemId(itemId);
    setLwbsReason('');
    setLwbsDialogOpen(true);
  };

  const confirmLWBS = async () => {
    if (lwbsItemId && lwbsReason.trim()) {
      await markLWBS(lwbsItemId, lwbsReason.trim());
      setLwbsDialogOpen(false);
      setLwbsItemId(null);
      setLwbsReason('');
      refetch();
    }
  };

  // KETA target wait time for this zone's primary category
  const targetConfig = TRIAGE_CATEGORY_CONFIG[zoneMeta.primaryCategory];

  return (
    <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        {/* Zone Header */}
        <PageHeader
          title={zoneMeta.label}
          helpContent={`${zoneMeta.label} zone queue. Patients triaged to this zone are listed by priority (RED first). KETA target: ${targetConfig.label}.`}
        />

        {/* Zone Info Bar */}
        <div className={cn(
          'flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg border-2',
          categoryColor.border,
          categoryColor.bg,
        )}>
          <div className="flex items-center gap-3">
            <StatusIndicator state={categoryColor.indicatorState} size="md" />
            <div>
              <p className={cn('text-sm font-medium', categoryColor.text)}>
                {totalCount} patient{totalCount !== 1 ? 's' : ''} in zone
              </p>
              <p className="text-xs text-muted-foreground">
                Capacity: {zoneInfo?.capacity ?? zoneMeta.defaultCapacity}
              </p>
            </div>
          </div>

          {/* Category breakdown */}
          <div className="flex flex-wrap gap-1.5">
            {TRIAGE_CATEGORY_ORDER.map((cat) => {
              const count = categoryCounts[cat];
              if (!count) return null;
              const colors = CATEGORY_COLORS[cat];
              return (
                <Badge
                  key={cat}
                  variant="secondary"
                  className={cn('text-xs gap-1', colors.bg, colors.text)}
                >
                  <StatusIndicator state={colors.indicatorState} size="sm" />
                  {count} {cat}
                </Badge>
              );
            })}
          </div>

          {/* Status breakdown */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(statusCounts.WAITING ?? 0) > 0 && (
              <span>{statusCounts.WAITING} waiting</span>
            )}
            {(statusCounts.CALLED ?? 0) > 0 && (
              <span>{statusCounts.CALLED} called</span>
            )}
            {(statusCounts.WITH_CLINICIAN ?? 0) > 0 && (
              <span>{statusCounts.WITH_CLINICIAN} with doctor</span>
            )}
          </div>
        </div>

        {/* KETA Target Wait Times Reference */}
        <Card className="border-dashed">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">KETA Target Wait Times</span>
              <HelpPopover content="Kenya Emergency Triage Assessment (KETA) target times. Patients exceeding these targets are flagged with a warning." />
            </div>
            <div className="flex flex-wrap gap-3">
              {TRIAGE_CATEGORY_ORDER.map((cat) => {
                const config = TRIAGE_CATEGORY_CONFIG[cat];
                const colors = CATEGORY_COLORS[cat];
                return (
                  <div key={cat} className="flex items-center gap-1.5 text-xs">
                    <StatusIndicator state={colors.indicatorState} size="sm" />
                    <span className={cn('font-medium', colors.text)}>{cat}</span>
                    <span className="text-muted-foreground">
                      {config.targetWaitMinutes === 0
                        ? 'Immediate'
                        : `≤ ${formatWaitTime(config.targetWaitMinutes)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Search & Filter Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search patient name or MRN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters((v) => !v)}
              className={cn(showFilters && 'bg-accent')}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3 w-3 mr-1" />
                Clear filters
              </Button>
            )}
            <Badge variant="secondary">
              {queueItems.length} of {totalCount} shown
            </Badge>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end p-3 rounded-lg bg-muted/50 border">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {TRIAGE_CATEGORY_ORDER.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat} - {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="WAITING">Waiting</SelectItem>
                  <SelectItem value="CALLED">Called</SelectItem>
                  <SelectItem value="WITH_CLINICIAN">With Clinician</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Queue List */}
        {isLoading ? (
          <QueueSkeleton />
        ) : queueItems.length === 0 ? (
          <Card className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {hasActiveFilters ? 'No matching patients' : 'No patients in zone'}
            </h3>
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? 'Try adjusting your search or filter criteria.'
                : `No patients are currently triaged to ${zoneMeta.label}.`}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </Card>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            {queueItems.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onCall={() => callPatient(item.id).then(() => refetch())}
                onWithClinician={() => markWithClinician(item.id).then(() => refetch())}
                onComplete={() => markComplete(item.id).then(() => refetch())}
                onLWBS={() => handleLWBS(item.id)}
                onSelect={() => handleSelectPatient(item)}
              />
            ))}
          </div>
        ) : (
          <EntityGrid>
            {queueItems.map((item) => {
              const waitTimeClass = getWaitTimeClass(item.triage_category, item.wait_time_minutes);
              const exceeded = isWaitTimeExceeded(item.triage_category, item.wait_time_minutes);

              return (
                <EntityCard
                  key={item.id}
                  title={item.patient_name}
                  subtitle={item.patient_mrn}
                  initials={item.patient_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                  gender={item.patient_gender as 'M' | 'F' | 'O'}
                  status={{
                    label: QUEUE_STATUS_CONFIG[item.status]?.label || item.status,
                    variant:
                      item.status === 'WITH_CLINICIAN'
                        ? 'default'
                        : item.status === 'CALLED'
                          ? 'default'
                          : 'secondary',
                  }}
                  badges={[
                    { label: item.triage_category, variant: 'outline' as const },
                    ...(exceeded
                      ? [{ label: `⚠ ${formatWaitTime(item.wait_time_minutes)}`, variant: 'destructive' as const }]
                      : [{ label: formatWaitTime(item.wait_time_minutes), variant: 'secondary' as const }]),
                    ...(item.alerts_count > 0
                      ? [{ label: `${item.alerts_count} alert${item.alerts_count > 1 ? 's' : ''}`, variant: 'destructive' as const }]
                      : []),
                  ]}
                  metadata={[
                    { label: 'CC', value: item.chief_complaint || 'Not specified' },
                    { label: 'Age', value: `${item.patient_age} yrs` },
                  ]}
                  onClick={() => handleSelectPatient(item)}
                  actions={[
                    ...(item.status === 'WAITING'
                      ? [
                          { label: 'Call Patient', onClick: () => callPatient(item.id).then(() => refetch()) },
                          { label: 'Mark LWBS', onClick: () => handleLWBS(item.id), variant: 'destructive' as const },
                        ]
                      : []),
                    ...(item.status === 'CALLED'
                      ? [{ label: 'With Doctor', onClick: () => markWithClinician(item.id).then(() => refetch()) }]
                      : []),
                    ...(item.status === 'WITH_CLINICIAN'
                      ? [{ label: 'Complete', onClick: () => markComplete(item.id).then(() => refetch()) }]
                      : []),
                  ]}
                />
              );
            })}
          </EntityGrid>
        )}
      </div>

      {/* LWBS Confirmation Dialog */}
      <Dialog open={lwbsDialogOpen} onOpenChange={setLwbsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>Mark as Left Without Being Seen</DialogTitle>
              <HelpPopover content="Record that a patient left the ER before being seen by a clinician. A reason must be provided for audit purposes." />
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lwbs-reason">Reason</Label>
              <Textarea
                id="lwbs-reason"
                placeholder="Patient left due to..."
                value={lwbsReason}
                onChange={(e) => setLwbsReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLwbsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmLWBS}
              disabled={!lwbsReason.trim() || actionLoading}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Confirm LWBS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}

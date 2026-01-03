/**
 * TriageQueueDashboard Component
 *
 * Real-time dashboard for viewing and managing the triage queue.
 * Displays patients sorted by KETA priority (RED → ORANGE → YELLOW → GREEN → BLUE)
 * and within each category by arrival time.
 *
 * Sprint 1.5-1.6 Track E: Triage MVP
 *
 * @see features/triage/triage-queue.feature for BDD scenarios
 */
'use client';

import * as React from 'react';
import {
  Search,
  RefreshCw,
  Filter,
  X,
  Phone,
  UserCheck,
  CheckCircle,
  LogOut,
  Clock,
  AlertCircle,
  Users,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { TriageCategoryBadge } from './triage-category-badge';
import type {
  TriageQueueItem,
  QueueStatus,
  TriageCategory,
  AssignedArea,
} from '@/lib/types/triage';
import {
  TRIAGE_CATEGORY_CONFIG,
  ASSIGNED_AREA_CONFIG,
  QUEUE_STATUS_CONFIG,
} from '@/lib/types/triage';

// =============================================================================
// TYPES
// =============================================================================

export interface TriageQueueDashboardProps {
  /** Queue items to display */
  queueItems: TriageQueueItem[];
  /** Loading state */
  isLoading?: boolean;
  /** Last updated timestamp */
  lastUpdated?: Date;
  /** Callback when a patient is called */
  onCallPatient: (itemId: number) => void;
  /** Callback when a patient is marked as with clinician */
  onMarkWithClinician: (itemId: number) => void;
  /** Callback when a patient is marked complete */
  onMarkComplete: (itemId: number) => void;
  /** Callback when a patient is marked LWBS */
  onMarkLWBS: (itemId: number, reason: string) => void;
  /** Callback to refresh the queue */
  onRefresh: () => void;
  /** Callback when a patient card is selected */
  onSelectPatient: (item: TriageQueueItem) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_PRIORITY: Record<TriageCategory, number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

// Target wait times in minutes
const TARGET_WAIT_TIMES: Record<TriageCategory, number> = {
  RED: 0, // Immediate
  ORANGE: 10,
  YELLOW: 60,
  GREEN: 240,
  BLUE: 480,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Sort queue items by priority (category then arrival time)
 */
function sortQueueItems(items: TriageQueueItem[]): TriageQueueItem[] {
  return [...items].sort((a, b) => {
    // First sort by category priority
    const priorityDiff =
      CATEGORY_PRIORITY[a.triage_category] - CATEGORY_PRIORITY[b.triage_category];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by arrival time (earlier first)
    return new Date(a.arrival_time).getTime() - new Date(b.arrival_time).getTime();
  });
}

/**
 * Format wait time for display
 */
function formatWaitTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

/**
 * Check if wait time exceeds target for category
 */
function isWaitTimeExceeded(category: TriageCategory, waitMinutes: number): boolean {
  return waitMinutes > TARGET_WAIT_TIMES[category];
}

/**
 * Get wait time display class based on category and time
 */
function getWaitTimeClass(category: TriageCategory, waitMinutes: number): string {
  if (category === 'RED' && waitMinutes > 0) return 'text-red-600 font-semibold';
  if (isWaitTimeExceeded(category, waitMinutes)) {
    if (category === 'ORANGE') return 'text-orange-600 font-semibold';
    return 'text-amber-600 font-semibold';
  }
  return 'text-muted-foreground';
}

/**
 * Count items by category
 */
function countByCategory(items: TriageQueueItem[]): Record<TriageCategory, number> {
  const counts: Record<TriageCategory, number> = {
    RED: 0,
    ORANGE: 0,
    YELLOW: 0,
    GREEN: 0,
    BLUE: 0,
  };
  items.forEach((item) => {
    counts[item.triage_category]++;
  });
  return counts;
}

/**
 * Count items by status
 */
function countByStatus(items: TriageQueueItem[]): Record<QueueStatus, number> {
  const counts: Record<QueueStatus, number> = {
    WAITING: 0,
    CALLED: 0,
    WITH_CLINICIAN: 0,
    COMPLETED: 0,
    LEFT_WITHOUT_BEING_SEEN: 0,
  };
  items.forEach((item) => {
    counts[item.status]++;
  });
  return counts;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface QueueCardProps {
  item: TriageQueueItem;
  onCall: () => void;
  onWithClinician: () => void;
  onComplete: () => void;
  onLWBS: () => void;
  onSelect: () => void;
}

function QueueCard({
  item,
  onCall,
  onWithClinician,
  onComplete,
  onLWBS,
  onSelect,
}: QueueCardProps) {
  const waitTimeClass = getWaitTimeClass(item.triage_category, item.wait_time_minutes);
  const genderDisplay = item.patient_gender === 'M' ? 'M' : item.patient_gender === 'F' ? 'F' : 'O';

  return (
    <Card
      data-testid={`queue-item-${item.id}`}
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        item.triage_category === 'RED' && 'border-l-4 border-l-red-500',
        item.triage_category === 'ORANGE' && 'border-l-4 border-l-orange-500',
        item.triage_category === 'YELLOW' && 'border-l-4 border-l-yellow-500',
        item.triage_category === 'GREEN' && 'border-l-4 border-l-green-500',
        item.triage_category === 'BLUE' && 'border-l-4 border-l-blue-500'
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
                {item.patient_age} yrs • {genderDisplay}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mb-2">{item.patient_mrn}</p>
            <p className="text-sm mb-2 line-clamp-1">
              <span className="font-medium">CC:</span> {item.chief_complaint || 'Chest pain'}
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{item.assigned_area_display}</span>
            </div>
          </div>

          {/* Right Side: Category, Status, Wait Time */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {/* Category Badge */}
            <div data-testid={`category-badge-${item.id}`}>
              <TriageCategoryBadge category={item.triage_category} size="sm" />
            </div>

            {/* Status Badge */}
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
                item.status === 'WITH_CLINICIAN' && 'bg-green-500 hover:bg-green-600'
              )}
            >
              {QUEUE_STATUS_CONFIG[item.status]?.label || item.status}
            </Badge>

            {/* Wait Time */}
            <div
              data-testid={`wait-time-${item.id}`}
              className={cn('flex items-center gap-1 text-sm', waitTimeClass)}
            >
              <Clock className="h-3 w-3" />
              <span>{formatWaitTime(item.wait_time_minutes)}</span>
              {isWaitTimeExceeded(item.triage_category, item.wait_time_minutes) && (
                <span>⚠️</span>
              )}
            </div>

            {/* Alerts Indicator */}
            {item.alerts_count > 0 && (
              <div className="flex items-center gap-1 text-red-600 text-xs">
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
          <Button size="sm" variant="ghost" className="ml-auto">
            View Details
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueLoadingSkeleton() {
  return (
    <div data-testid="queue-loading" className="space-y-4">
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
// MAIN COMPONENT
// =============================================================================

/**
 * TriageQueueDashboard - Real-time queue management dashboard
 *
 * Features:
 * - Sorted by KETA priority (RED first) then arrival time
 * - Color-coded category badges
 * - Wait time display with warnings when exceeded
 * - Filter by area, category, status
 * - Search by patient name or MRN
 * - Queue actions (Call, With Clinician, Complete, LWBS)
 * - Queue statistics summary
 * - Category breakdown counts
 * - Loading and empty states
 * - Manual refresh capability
 */
export function TriageQueueDashboard({
  queueItems,
  isLoading = false,
  lastUpdated,
  onCallPatient,
  onMarkWithClinician,
  onMarkComplete,
  onMarkLWBS,
  onRefresh,
  onSelectPatient,
}: TriageQueueDashboardProps) {
  // Filter & search state
  const [searchTerm, setSearchTerm] = React.useState('');
  const [areaFilter, setAreaFilter] = React.useState<string>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  // LWBS dialog state
  const [lwbsDialogOpen, setLwbsDialogOpen] = React.useState(false);
  const [lwbsItemId, setLwbsItemId] = React.useState<number | null>(null);
  const [lwbsReason, setLwbsReason] = React.useState('');

  // Sort items
  const sortedItems = sortQueueItems(queueItems);

  // Apply filters
  const filteredItems = sortedItems.filter((item) => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName = item.patient_name.toLowerCase().includes(searchLower);
      const matchesMRN = item.patient_mrn.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesMRN) return false;
    }

    // Area filter
    if (areaFilter !== 'all' && item.assigned_area !== areaFilter) return false;

    // Category filter
    if (categoryFilter !== 'all' && item.triage_category !== categoryFilter) return false;

    // Status filter
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;

    return true;
  });

  // Statistics
  const categoryCounts = countByCategory(queueItems);
  const statusCounts = countByStatus(queueItems);
  const totalInQueue = queueItems.length;

  // Check if any filter is active
  const hasActiveFilters =
    searchTerm || areaFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setAreaFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
  };

  // Handle LWBS
  const handleOpenLWBS = (itemId: number) => {
    setLwbsItemId(itemId);
    setLwbsReason('');
    setLwbsDialogOpen(true);
  };

  const handleConfirmLWBS = () => {
    if (lwbsItemId && lwbsReason.trim()) {
      onMarkLWBS(lwbsItemId, lwbsReason.trim());
      setLwbsDialogOpen(false);
      setLwbsItemId(null);
      setLwbsReason('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Triage Queue</h1>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Total */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total in Queue</p>
                <p className="text-2xl font-bold">{totalInQueue}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Waiting */}
        <Card>
          <CardContent className="p-4" data-testid="stat-waiting">
            <p className="text-sm text-muted-foreground">Waiting</p>
            <p className="text-2xl font-bold">{statusCounts.WAITING}</p>
          </CardContent>
        </Card>

        {/* Category Counts */}
        {(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'] as TriageCategory[]).map((cat) => (
          <Card key={cat}>
            <CardContent className="p-4" data-testid={`category-count-${cat}`}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-3 w-3 rounded-full',
                    cat === 'RED' && 'bg-red-500',
                    cat === 'ORANGE' && 'bg-orange-500',
                    cat === 'YELLOW' && 'bg-yellow-500',
                    cat === 'GREEN' && 'bg-green-500',
                    cat === 'BLUE' && 'bg-blue-500'
                  )}
                />
                <span className="text-sm">{cat}</span>
              </div>
              <p className="text-xl font-bold">{categoryCounts[cat]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search" className="sr-only">
                Search patients
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or MRN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                  aria-label="Search patients"
                />
              </div>
            </div>

            {/* Area Filter */}
            <div className="w-[180px]">
              <Label htmlFor="area-filter">Area</Label>
              <Select value={areaFilter} onValueChange={setAreaFilter}>
                <SelectTrigger id="area-filter" aria-label="Filter by area">
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {(Object.entries(ASSIGNED_AREA_CONFIG) as [AssignedArea, { label: string }][]).map(
                    ([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="w-[150px]">
              <Label htmlFor="category-filter">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="category-filter" aria-label="Filter by category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(['RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE'] as TriageCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Queue List */}
      {isLoading ? (
        <QueueLoadingSkeleton />
      ) : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {hasActiveFilters ? 'No patients found' : 'No patients in queue'}
            </h3>
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? 'Try adjusting your filters or search term'
                : 'New patients will appear here after triage'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              onCall={() => onCallPatient(item.id)}
              onWithClinician={() => onMarkWithClinician(item.id)}
              onComplete={() => onMarkComplete(item.id)}
              onLWBS={() => handleOpenLWBS(item.id)}
              onSelect={() => onSelectPatient(item)}
            />
          ))}
        </div>
      )}

      {/* LWBS Dialog */}
      <Dialog open={lwbsDialogOpen} onOpenChange={setLwbsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Patient as LWBS</DialogTitle>
            <DialogDescription>
              Please provide a reason for marking this patient as Left Without Being Seen.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="lwbs-reason">Reason for LWBS</Label>
            <Textarea
              id="lwbs-reason"
              value={lwbsReason}
              onChange={(e) => setLwbsReason(e.target.value)}
              placeholder="Enter reason..."
              className="mt-2"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLwbsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmLWBS} disabled={!lwbsReason.trim()}>
              Confirm LWBS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

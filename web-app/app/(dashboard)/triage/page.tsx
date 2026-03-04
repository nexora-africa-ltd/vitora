/**
 * Triage Module - Main Queue Page
 *
 * Displays the waiting queue (patients awaiting triage) and past triage history.
 * Uses tabbed layout: Queue | History
 *
 * Route: /triage
 */
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus,
  Clock,
  UserPlus,
  History,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PatientStageBadge } from '@/components/shared/patient-stage-badge';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { PageHeader } from '@/components/shared/page-header';
import { HelpPopover } from '@/components/shared/help-popover';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationBanner } from '@/components/shared/notification-banner';
import { KPICard } from '@/components/reports/kpi-card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TriageCategoryBadge, TriageDashboardStats } from '@/components/triage';
import {
  useTriageWaitTimeStats,
  useTriageVolumeReport,
  useWaitingQueue,
  useStartTriage,
  useCancelWaitingEntry,
  useTriageHistory,
  useBreachSummary,
  type TriageHistoryFilters,
} from '@/lib/hooks/use-triage';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { toast } from '@/lib/hooks/use-toast';
import { LEGACY_TRIAGE_FLOW } from '@/lib/utils/constants';
import type { TriageCategory, TriageAssessment } from '@/lib/types/triage';

type DateRangeOption = 'today' | 'week' | 'month' | 'quarter' | 'all';

export default function TriageQueuePage() {
  const router = useRouter();
  const [showQueueBanner, setShowQueueBanner] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');

  // ============================================================================
  // QUEUE STATE & HOOKS
  // ============================================================================

  // Fetch waiting queue (patients awaiting triage) - auto-refreshes every 15s
  const {
    data: waitingData,
    isLoading: isWaitingLoading,
    refetch: refetchWaiting,
  } = useWaitingQueue({});

  // Fetch wait time stats for the KPI cards
  const { data: waitTimeStats, isLoading: isStatsLoading } = useTriageWaitTimeStats({
    dateRange: 'today',
  });

  // Fetch volume report for category breakdown
  const { data: volumeData, isLoading: isVolumeLoading } = useTriageVolumeReport({
    dateRange: 'today',
  });

  // Fetch breach summary for active alerts
  const { data: breachSummary } = useBreachSummary();

  // Calculate trend for target met percentage (comparing to 85% KETA target)
  const targetMetTrend = useMemo(() => {
    const current = waitTimeStats?.target_met_percentage ?? 0;
    const target = 85; // KETA target
    return {
      direction: current >= target ? 'up' : 'down',
      change: current - target,
    } as const;
  }, [waitTimeStats?.target_met_percentage]);

  // Waiting queue actions
  const { mutateAsync: startTriage } = useStartTriage();
  const { mutateAsync: cancelWaiting } = useCancelWaitingEntry();

  // ============================================================================
  // HISTORY STATE & HOOKS
  // ============================================================================

  const [searchInput, setSearchInput] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeOption>('week');
  const [categoryFilter, setCategoryFilter] = useState<TriageCategory | 'all'>('all');
  const [historyPage, setHistoryPage] = useState(1);

  // Debounce search input
  const debouncedSearch = useDebounce(searchInput, 300);

  // Build history filters
  const historyFilters: TriageHistoryFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      dateRange: dateRange !== 'all' ? dateRange : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      page: historyPage,
      pageSize: 15,
    }),
    [debouncedSearch, dateRange, categoryFilter, historyPage]
  );

  // Fetch history only when tab is active (for performance)
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useTriageHistory(activeTab === 'history' ? historyFilters : { page: 1 });

  // Reset page when filters change
  const handleFilterChange = useCallback(() => {
    setHistoryPage(1);
  }, []);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Handle starting triage for a waiting patient
  const handleStartTriage = useCallback(
    async (waitingId: number, patientId: number, encounterId: number | null) => {
      try {
        await startTriage(waitingId);
        // Navigate to triage form
        if (encounterId) {
          // Route based on feature flag
          if (LEGACY_TRIAGE_FLOW) {
            router.push(`/triage/new?patientId=${patientId}&encounterId=${encounterId}`);
          } else {
            // New tabbed triage flow
            router.push(`/triage/assess/${patientId}/${encounterId}/vitals`);
          }
        } else {
          toast({
            title: 'Error',
            description: 'No encounter found. Please create an encounter first.',
            variant: 'destructive',
          });
        }
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to start triage. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [startTriage, router]
  );

  // Handle cancelling a waiting entry
  const handleCancelWaiting = useCallback(
    async (waitingId: number, reason: string) => {
      try {
        await cancelWaiting({ id: waitingId, reason });
        toast({
          title: 'Removed from Queue',
          description: 'Patient has been removed from the waiting queue.',
        });
        refetchWaiting();
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to remove patient. Please try again.',
          variant: 'destructive',
        });
      }
    },
    [cancelWaiting, refetchWaiting]
  );

  const handleNewTriage = useCallback(() => {
    router.push('/triage/new');
  }, [router]);

  const handleViewTriage = useCallback(
    (assessment: TriageAssessment) => {
      router.push(`/triage/${assessment.id}`);
    },
    [router]
  );

  const waitingCount = waitingData?.results?.length ?? 0;

  // Handle pull-to-refresh
  const handlePullRefresh = useCallback(async () => {
    if (activeTab === 'queue') {
      await refetchWaiting();
    } else {
      await refetchHistory();
    }
  }, [activeTab, refetchWaiting, refetchHistory]);

  // Pagination helpers
  const historyTotalPages = Math.ceil((historyData?.count ?? 0) / 15);

  return (
    <PullToRefresh
      onRefresh={handlePullRefresh}
      isRefreshing={activeTab === 'queue' ? isWaitingLoading : isHistoryLoading}
      className="min-h-full"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Page Header */}
        <PageHeader
          title="Triage"
          helpContent="Assess and prioritize patients for clinical care. Use Queue tab for patients waiting, History tab for past triages."
          actions={
            <Button size="sm" onClick={handleNewTriage} className="h-9 sm:h-10">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Triage</span>
            </Button>
          }
        />

        {/* Info: Consultation Queue moved to Encounters */}
        <NotificationBanner
          show={showQueueBanner}
          onDismiss={() => setShowQueueBanner(false)}
          title="Consultation Queue Relocated"
          description="Patients awaiting consultation after triage are now managed on the Encounters page."
          variant="info"
          persistKey="triage-consultation-queue-relocated"
          action={{
            label: 'Go to Encounters',
            onClick: () => router.push('/encounters'),
          }}
        />

        {/* KPI Stats Cards — visible on all tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KPICard
            id="waiting-triage"
            title="In Queue"
            value={waitingCount}
            description="Awaiting triage"
            variant={waitingCount > 5 ? 'warning' : 'default'}
          />
          <KPICard
            id="current-wait"
            title="Current Wait"
            value={waitTimeStats?.current_queue?.avg_wait_minutes ?? 0}
            unit="min"
            description="Avg queue wait now"
            variant={
              (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 30
                ? 'destructive'
                : (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 15
                  ? 'warning'
                  : 'default'
            }
            valueClassName={
              (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 30
                ? 'text-destructive'
                : (waitTimeStats?.current_queue?.avg_wait_minutes ?? 0) > 15
                  ? 'text-warning'
                  : undefined
            }
          />
          <KPICard
            id="completion-time"
            title="Avg Completion"
            value={waitTimeStats?.completion_time?.avg_minutes ?? 0}
            unit="min"
            description={
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>Arrival → done</span>
                {(waitTimeStats?.completion_time?.count ?? 0) > 0 && (
                  <span className="text-muted-foreground">
                    ({waitTimeStats?.completion_time?.count} today)
                  </span>
                )}
              </span>
            }
          />
          <KPICard
            id="target-met"
            title="Target Met"
            value={waitTimeStats?.target_met_percentage ?? 100}
            unit="%"
            trend={targetMetTrend.direction}
            change={Math.abs(targetMetTrend.change)}
            changeType={targetMetTrend.direction === 'up' ? 'increase' : 'decrease'}
            variant={(waitTimeStats?.target_met_percentage ?? 100) >= 85 ? 'success' : 'warning'}
            description="KETA compliance"
          />
        </div>

        {/* Operational Stats — second row */}
        <TriageDashboardStats
          waitTimeStats={waitTimeStats}
          volumeData={volumeData}
          breachSummary={breachSummary}
          isLoading={isStatsLoading || isVolumeLoading}
        />

        {/* Tabs: Queue and History */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'queue' | 'history')}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="queue" className="gap-2">
              <UserPlus className="h-4 w-4" />
              <span className="sm:hidden">Queue</span>
              <span className="hidden sm:inline">Waiting Queue</span>
              {waitingCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {waitingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              <span className="sm:hidden">History</span>
              <span className="hidden sm:inline">Past Triages</span>
            </TabsTrigger>
          </TabsList>

          {/* ================================================================
              QUEUE TAB
              ================================================================ */}
          <TabsContent value="queue" className="space-y-4 sm:space-y-6 mt-0">
            {/* Patients Awaiting Triage */}
            <Card>
              <CardHeader className="px-4 sm:px-6 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                  <CardTitle className="text-base sm:text-lg">Patients Awaiting Triage</CardTitle>
                  <HelpPopover content="Patients who have checked in and are waiting to be triaged. Click 'Start Triage' to begin assessment. This list auto-refreshes every 15 seconds." />
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {isWaitingLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 sm:h-16 w-full" />
                    ))}
                  </div>
                ) : waitingData?.results?.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-muted-foreground">
                    <UserPlus className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-sm sm:text-base">No patients waiting for triage</p>
                    <p className="text-xs sm:text-sm mt-1">
                      Patients will appear here after registration/check-in
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => router.push('/patients/new')}
                    >
                      Register New Patient
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {waitingData?.results?.map((entry) => {
                      const isInProgress = entry.status === 'IN_TRIAGE';

                      return (
                        <div
                          key={entry.id}
                          className={`p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors ${
                            isInProgress ? 'border-primary/50 bg-primary/5' : ''
                          }`}
                        >
                          {/* Mobile: Vertical stack layout */}
                          <div className="sm:hidden space-y-2">
                            {/* Row 1: Name + Priority */}
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-sm leading-tight">
                                {entry.patient_name}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {entry.priority_hint && entry.priority_hint !== 'NORMAL' && (
                                  <Badge
                                    variant={
                                      entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'
                                    }
                                    size="sm"
                                  >
                                    {entry.priority_hint}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Row 2: MRN + Stage */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" size="sm">
                                {entry.patient_mrn}
                              </Badge>
                              <PatientStageBadge
                                stage={isInProgress ? 'IN_TRIAGE' : 'AWAITING_TRIAGE'}
                                size="sm"
                              />
                            </div>

                            {/* Row 3: Demographics + Wait time */}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>
                                {entry.patient_gender === 'M'
                                  ? 'M'
                                  : entry.patient_gender === 'F'
                                    ? 'F'
                                    : 'O'}
                                {entry.patient_age && `, ${entry.patient_age}y`}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {entry.wait_time_minutes}m
                              </span>
                            </div>

                            {/* Row 4: Reason (if any) */}
                            {entry.reason_for_visit && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {entry.reason_for_visit}
                              </p>
                            )}

                            {/* Row 5: Actions - full width */}
                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-9"
                                onClick={() => handleCancelWaiting(entry.id, 'Patient left')}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-9"
                                variant={isInProgress ? 'secondary' : 'default'}
                                onClick={() =>
                                  handleStartTriage(entry.id, entry.patient, entry.encounter)
                                }
                              >
                                {isInProgress ? 'Continue' : 'Start'} Triage
                              </Button>
                            </div>
                          </div>

                          {/* Desktop: Horizontal layout */}
                          <div className="hidden sm:flex sm:items-center sm:justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{entry.patient_name}</span>
                                <Badge variant="outline" size="sm">
                                  {entry.patient_mrn}
                                </Badge>
                                <PatientStageBadge
                                  stage={isInProgress ? 'IN_TRIAGE' : 'AWAITING_TRIAGE'}
                                  size="sm"
                                />
                                {entry.priority_hint && entry.priority_hint !== 'NORMAL' && (
                                  <Badge
                                    variant={
                                      entry.priority_hint === 'EMERGENCY' ? 'destructive' : 'secondary'
                                    }
                                    size="sm"
                                  >
                                    {entry.priority_hint}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                <span>
                                  {entry.patient_gender === 'M'
                                    ? 'Male'
                                    : entry.patient_gender === 'F'
                                      ? 'Female'
                                      : 'Other'}
                                </span>
                                {entry.patient_age && <span>{entry.patient_age} yrs</span>}
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {entry.wait_time_minutes} min
                                </span>
                                {entry.reason_for_visit && (
                                  <span className="truncate max-w-[200px]">{entry.reason_for_visit}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancelWaiting(entry.id, 'Patient left')}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                variant={isInProgress ? 'secondary' : 'default'}
                                onClick={() =>
                                  handleStartTriage(entry.id, entry.patient, entry.encounter)
                                }
                              >
                                {isInProgress ? 'Continue' : 'Start'} Triage
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================================================================
              HISTORY TAB
              ================================================================ */}
          <TabsContent value="history" className="space-y-4 mt-0">
            {/* Filters */}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name or MRN..."
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        handleFilterChange();
                      }}
                      className="pl-9 pr-8 h-9"
                    />
                    {searchInput && (
                      <button
                        onClick={() => {
                          setSearchInput('');
                          handleFilterChange();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                        title="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Date Range Filter */}
                  <Select
                    value={dateRange}
                    onValueChange={(v) => {
                      setDateRange(v as DateRangeOption);
                      handleFilterChange();
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[140px] h-9">
                      <SelectValue placeholder="Date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Last 7 days</SelectItem>
                      <SelectItem value="month">Last 30 days</SelectItem>
                      <SelectItem value="quarter">Last 90 days</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Category Filter */}
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => {
                      setCategoryFilter(v as TriageCategory | 'all');
                      handleFilterChange();
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[140px] h-9">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="RED">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Emergency
                        </span>
                      </SelectItem>
                      <SelectItem value="ORANGE">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          Very Urgent
                        </span>
                      </SelectItem>
                      <SelectItem value="YELLOW">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                          Urgent
                        </span>
                      </SelectItem>
                      <SelectItem value="GREEN">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Standard
                        </span>
                      </SelectItem>
                      <SelectItem value="BLUE">
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Non-Urgent
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* History Results */}
            <Card>
              <CardHeader className="px-4 sm:px-6 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                    <CardTitle className="text-base sm:text-lg">Completed Triages</CardTitle>
                    <HelpPopover content="Past triage assessments. Click on a row to view details. Use filters to narrow results by patient name, date, or triage category." />
                  </div>
                  {historyData?.count !== undefined && (
                    <span className="text-sm text-muted-foreground">
                      {historyData.count} result{historyData.count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {isHistoryLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-16 sm:h-14 w-full" />
                    ))}
                  </div>
                ) : !historyData?.results?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-sm sm:text-base">No triages found</p>
                    <p className="text-xs sm:text-sm mt-1">
                      {searchInput || categoryFilter !== 'all'
                        ? 'Try adjusting your filters'
                        : 'Completed triages will appear here'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyData.results.map((assessment) => (
                      <div
                        key={assessment.id}
                        onClick={() => handleViewTriage(assessment)}
                        className="p-3 sm:p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        {/* Mobile layout */}
                        <div className="sm:hidden space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm truncate">
                                {assessment.patient_name || 'Unknown Patient'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assessment.encounter_mrn || `Enc #${assessment.encounter}`}
                              </p>
                            </div>
                            <TriageCategoryBadge category={assessment.triage_category} size="sm" />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>
                              {format(new Date(assessment.triage_start_time), 'MMM d, h:mm a')}
                            </span>
                            {assessment.triaged_by_name && (
                              <span className="truncate">by {assessment.triaged_by_name}</span>
                            )}
                          </div>
                          {assessment.chief_complaint && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {assessment.chief_complaint}
                            </p>
                          )}
                        </div>

                        {/* Desktop layout */}
                        <div className="hidden sm:flex sm:items-center sm:justify-between gap-4">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {assessment.patient_name || 'Unknown Patient'}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {assessment.encounter_mrn || `Encounter #${assessment.encounter}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right text-sm text-muted-foreground hidden lg:block">
                              <p>{format(new Date(assessment.triage_start_time), 'MMM d, yyyy')}</p>
                              <p>{format(new Date(assessment.triage_start_time), 'h:mm a')}</p>
                            </div>
                            <div className="text-right text-sm text-muted-foreground hidden md:block lg:hidden">
                              <p>
                                {format(new Date(assessment.triage_start_time), 'MMM d, h:mm a')}
                              </p>
                            </div>
                            {assessment.triaged_by_name && (
                              <span className="text-sm text-muted-foreground hidden xl:block max-w-[120px] truncate">
                                {assessment.triaged_by_name}
                              </span>
                            )}
                            <TriageCategoryBadge category={assessment.triage_category} size="sm" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Page {historyPage} of {historyTotalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="hidden sm:inline ml-1">Previous</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                        disabled={historyPage >= historyTotalPages}
                      >
                        <span className="hidden sm:inline mr-1">Next</span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

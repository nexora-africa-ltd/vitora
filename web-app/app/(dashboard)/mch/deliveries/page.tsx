'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Baby,
  Search,
  AlertTriangle,
  Calendar,
  Heart,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { StatsCard } from '@/components/dashboard/stats-card';
import { DeliveryStatsCharts } from '@/components/mch/delivery-stats-charts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { formatDate } from '@/lib/utils/format';
import { deliveriesApi } from '@/lib/api/mch';
import type {
  DeliveryListItem,
  DeliveryType,
  DeliveryOutcome,
  UpcomingDelivery,
} from '@/lib/types/mch';

// =============================================================================
// CONSTANTS
// =============================================================================

const OUTCOME_COLORS: Record<DeliveryOutcome, string> = {
  LIVE_BIRTH: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  STILLBIRTH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  NEONATAL_DEATH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  MATERNAL_DEATH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const OUTCOME_LABELS: Record<DeliveryOutcome, string> = {
  LIVE_BIRTH: 'Live Birth',
  STILLBIRTH: 'Stillbirth',
  NEONATAL_DEATH: 'Neonatal Death',
  MATERNAL_DEATH: 'Maternal Death',
};

const TYPE_LABELS: Record<DeliveryType, string> = {
  SVD: 'SVD',
  ASSISTED_VAGINAL: 'Assisted Vaginal',
  ELECTIVE_CS: 'Elective C/S',
  EMERGENCY_CS: 'Emergency C/S',
  VACUUM: 'Vacuum',
  FORCEPS: 'Forceps',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REFERRED', label: 'Referred' },
];

const OUTCOME_FILTER_OPTIONS = [
  { value: '', label: 'All Outcomes' },
  { value: 'LIVE_BIRTH', label: 'Live Birth' },
  { value: 'STILLBIRTH', label: 'Stillbirth' },
  { value: 'NEONATAL_DEATH', label: 'Neonatal Death' },
  { value: 'MATERNAL_DEATH', label: 'Maternal Death' },
];

const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'SVD', label: 'SVD' },
  { value: 'ASSISTED_VAGINAL', label: 'Assisted Vaginal' },
  { value: 'ELECTIVE_CS', label: 'Elective C/S' },
  { value: 'EMERGENCY_CS', label: 'Emergency C/S' },
  { value: 'VACUUM', label: 'Vacuum' },
  { value: 'FORCEPS', label: 'Forceps' },
];

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function DeliveriesDashboardPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  // Dashboard stats
  const {
    data: dashboard,
    isLoading: dashLoading,
    error: dashError,
  } = useQuery({
    queryKey: ['delivery-dashboard'],
    queryFn: () => deliveriesApi.dashboard(),
    staleTime: 30_000,
  });

  // Delivery list
  const {
    data: deliveriesData,
    isLoading: listLoading,
  } = useQuery({
    queryKey: ['deliveries-list', page, debouncedSearch, statusFilter, outcomeFilter, typeFilter],
    queryFn: () =>
      deliveriesApi.list(undefined, page, {
        search: debouncedSearch || undefined,
        status: statusFilter || undefined,
        delivery_outcome: outcomeFilter || undefined,
        delivery_type: typeFilter || undefined,
      }),
  });

  const stats = dashboard?.stats;
  const deliveries = deliveriesData?.results || [];
  const totalPages = deliveriesData ? Math.ceil(deliveriesData.count / 20) : 0;

  // Urgency tag for upcoming deliveries
  const getEddUrgency = (daysUntil: number) => {
    if (daysUntil < 0) return { label: `${Math.abs(daysUntil)}d overdue`, className: 'bg-destructive text-destructive-foreground' };
    if (daysUntil === 0) return { label: 'Due today', className: 'bg-destructive text-destructive-foreground' };
    if (daysUntil <= 7) return { label: `${daysUntil}d`, className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
    if (daysUntil <= 14) return { label: `${daysUntil}d`, className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
    return { label: `${daysUntil}d`, className: 'bg-muted text-muted-foreground' };
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Deliveries"
          helpContent="Delivery dashboard showing upcoming Expected Delivery Dates (EDDs), recent deliveries, outcome statistics, and high-risk alerts. Linked to MCH registrations and ANC clinic enrolments."
        />

        {/* Stats Cards */}
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Active Pregnancies"
            value={stats?.active_pregnancies ?? '—'}
            icon={Baby}
            variant="info"
            loading={dashLoading}
            description={stats ? `${stats.overdue} overdue` : undefined}
            href="/mch"
          />
          <StatsCard
            title="Due ≤ 7 Days"
            value={stats?.due_7_days ?? '—'}
            icon={Clock}
            variant={stats && stats.due_7_days > 0 ? 'warning' : 'default'}
            loading={dashLoading}
            description={stats ? `${stats.due_14_days} within 14d` : undefined}
          />
          <StatsCard
            title="Deliveries This Month"
            value={stats?.this_month ?? '—'}
            icon={Calendar}
            variant="success"
            loading={dashLoading}
            description={stats ? `${stats.today} today` : undefined}
          />
          <StatsCard
            title="Live Birth Rate"
            value={stats ? `${stats.live_birth_rate}%` : '—'}
            icon={Heart}
            variant="success"
            loading={dashLoading}
            description={stats ? `C/S rate: ${stats.cs_rate}%` : undefined}
          />
        </div>

        {/* High-risk alert banner */}
        {stats && stats.high_risk_due_soon > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-destructive">
                  {stats.high_risk_due_soon} high-risk
                </span>{' '}
                {stats.high_risk_due_soon === 1 ? 'pregnancy' : 'pregnancies'} due within 30 days.
                Review immediately.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main tabs */}
        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="upcoming" className="gap-1.5">
              <Clock className="h-4 w-4" />
              <span className="sm:hidden">Upcoming</span>
              <span className="hidden sm:inline">Upcoming EDDs</span>
            </TabsTrigger>
            <TabsTrigger value="recent" className="gap-1.5">
              <Baby className="h-4 w-4" />
              <span className="sm:hidden">Recent</span>
              <span className="hidden sm:inline">Recent Deliveries</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span className="sm:hidden">Stats</span>
              <span className="hidden sm:inline">Statistics</span>
            </TabsTrigger>
          </TabsList>

          {/* UPCOMING TAB */}
          <TabsContent value="upcoming" className="space-y-4">
            {dashLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : dashboard && dashboard.upcoming_deliveries.length > 0 ? (
              <>
                {/* Overdue section */}
                {dashboard.upcoming_deliveries.some((d) => d.days_until_edd < 0) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Overdue
                    </h3>
                    <div className="grid gap-2 sm:gap-3">
                      {dashboard.upcoming_deliveries
                        .filter((d) => d.days_until_edd < 0)
                        .map((d) => (
                          <UpcomingDeliveryCard
                            key={d.id}
                            delivery={d}
                            urgency={getEddUrgency(d.days_until_edd)}
                            onClick={() => router.push(`/mch/${d.id}`)}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Due this week */}
                {dashboard.upcoming_deliveries.some((d) => d.days_until_edd >= 0 && d.days_until_edd <= 7) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Due This Week
                    </h3>
                    <div className="grid gap-2 sm:gap-3">
                      {dashboard.upcoming_deliveries
                        .filter((d) => d.days_until_edd >= 0 && d.days_until_edd <= 7)
                        .map((d) => (
                          <UpcomingDeliveryCard
                            key={d.id}
                            delivery={d}
                            urgency={getEddUrgency(d.days_until_edd)}
                            onClick={() => router.push(`/mch/${d.id}`)}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Due within 30 days */}
                {dashboard.upcoming_deliveries.some((d) => d.days_until_edd > 7 && d.days_until_edd <= 30) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Due Within 30 Days
                    </h3>
                    <div className="grid gap-2 sm:gap-3">
                      {dashboard.upcoming_deliveries
                        .filter((d) => d.days_until_edd > 7 && d.days_until_edd <= 30)
                        .map((d) => (
                          <UpcomingDeliveryCard
                            key={d.id}
                            delivery={d}
                            urgency={getEddUrgency(d.days_until_edd)}
                            onClick={() => router.push(`/mch/${d.id}`)}
                          />
                        ))}
                    </div>
                  </div>
                )}

                {/* Later */}
                {dashboard.upcoming_deliveries.some((d) => d.days_until_edd > 30) && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Later
                    </h3>
                    <div className="grid gap-2 sm:gap-3">
                      {dashboard.upcoming_deliveries
                        .filter((d) => d.days_until_edd > 30)
                        .map((d) => (
                          <UpcomingDeliveryCard
                            key={d.id}
                            delivery={d}
                            urgency={getEddUrgency(d.days_until_edd)}
                            onClick={() => router.push(`/mch/${d.id}`)}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No upcoming deliveries. All active MCH registrations without an EDD are excluded.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* RECENT DELIVERIES TAB */}
          <TabsContent value="recent" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search mother, MRN, MCH no..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9"
                />
              </div>
              <Select value={outcomeFilter} onValueChange={(v) => { setOutcomeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Outcomes" />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOME_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Deliveries table */}
            <ResponsiveTable
              data={deliveries}
              keyExtractor={(d) => d.id}
              isLoading={listLoading}
              onRowClick={(d) => router.push(`/mch/deliveries/${d.id}`)}
              columns={[
                {
                  key: 'mother',
                  header: 'Mother',
                  cell: (d) => (
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.mother_name}</p>
                      <p className="text-xs text-muted-foreground">{d.mother_mrn}</p>
                    </div>
                  ),
                },
                {
                  key: 'mch_number',
                  header: 'MCH No.',
                  cell: (d) => <span className="text-sm font-mono">{d.registration_mch_number}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'date',
                  header: 'Delivery Date',
                  cell: (d) => <span className="text-sm">{formatDate(d.delivery_date)}</span>,
                },
                {
                  key: 'type',
                  header: 'Type',
                  cell: (d) => <span className="text-sm">{TYPE_LABELS[d.delivery_type]}</span>,
                  hideOnMobile: true,
                },
                {
                  key: 'outcome',
                  header: 'Outcome',
                  cell: (d) => (
                    <Badge className={`${OUTCOME_COLORS[d.delivery_outcome]} shrink-0 w-fit`}>
                      {OUTCOME_LABELS[d.delivery_outcome]}
                    </Badge>
                  ),
                },
                {
                  key: 'baby',
                  header: 'Baby',
                  cell: (d) => (
                    <div className="text-sm">
                      <span>{d.baby_gender === 'M' ? '♂ Male' : d.baby_gender === 'F' ? '♀ Female' : '—'}</span>
                      {d.birth_weight && (
                        <span className="text-muted-foreground ml-2">{d.birth_weight} kg</span>
                      )}
                    </div>
                  ),
                  hideOnMobile: true,
                },
                {
                  key: 'alerts',
                  header: '',
                  cell: (d) =>
                    d.alerts.length > 0 ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : null,
                },
              ]}
              mobileCard={(d) => (
                <Card className="p-3" onClick={() => router.push(`/mch/deliveries/${d.id}`)}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{d.mother_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.mother_mrn} • {d.registration_mch_number}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(d.delivery_date)} • {TYPE_LABELS[d.delivery_type]}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs">
                          {d.baby_gender === 'M' ? '♂' : d.baby_gender === 'F' ? '♀' : '—'}
                          {d.birth_weight ? ` ${d.birth_weight} kg` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`${OUTCOME_COLORS[d.delivery_outcome]} shrink-0 w-fit text-xs`}>
                        {OUTCOME_LABELS[d.delivery_outcome]}
                      </Badge>
                      {d.alerts.length > 0 && (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </div>
                </Card>
              )}
              emptyMessage="No deliveries found matching your filters."
            />

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {totalPages} ({deliveriesData?.count} total)
                </span>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-muted"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="px-3 py-1 border rounded-md disabled:opacity-50 hover:bg-muted"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* STATISTICS TAB */}
          <TabsContent value="stats" className="space-y-4">
            {dashLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            ) : dashboard ? (
              <DeliveryStatsCharts dashboard={dashboard} />
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Failed to load dashboard statistics.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface UpcomingDeliveryCardProps {
  delivery: UpcomingDelivery;
  urgency: { label: string; className: string };
  onClick: () => void;
}

function UpcomingDeliveryCard({ delivery, urgency, onClick }: UpcomingDeliveryCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{delivery.mother_name}</p>
              {delivery.is_high_risk && (
                <Badge variant="destructive" className="text-xs shrink-0">
                  High Risk
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {delivery.mother_mrn} • {delivery.mch_number}
            </p>
            {delivery.gestation_display && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {delivery.gestation_display}
                {delivery.trimester ? ` • T${delivery.trimester}` : ''}
              </p>
            )}
            {delivery.is_high_risk && delivery.risk_factors && (
              <p className="text-xs text-destructive/80 mt-0.5 truncate">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                {delivery.risk_factors}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <Badge className={`${urgency.className} shrink-0 w-fit`}>{urgency.label}</Badge>
            <span className="text-xs text-muted-foreground">
              EDD: {formatDate(delivery.edd)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

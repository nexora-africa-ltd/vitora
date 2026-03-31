/**
 * Clinic Session Detail Page
 *
 * Shows session info + all visits (patients) for a specific session.
 * Supports grid/list toggle using EntityCard and ViewToggle.
 *
 * Route: /clinics/[clinicId]/sessions/[sessionId]
 */
'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock,
  Stethoscope,
  Users,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { ViewToggle, type ViewMode } from '@/components/ui/view-toggle';
import { EntityCard, EntityGrid } from '@/components/shared/entity-card';
import { useClinic, useClinicSession } from '@/lib/hooks/use-clinics';
import { clinicsApi } from '@/lib/api/clinics';
import { ClinicNavigation } from '@/components/clinics/clinic-navigation';
import type { ClinicVisit, ClinicVisitStatus, ClinicSessionStatus } from '@/lib/types/clinic';
import type { ProcedureOrderListItem } from '@/lib/types/procedure';
import { PROCEDURE_STATUS_COLORS, PROCEDURE_STATUS_LABELS, PROCEDURE_PRIORITY_COLORS } from '@/lib/types/procedure';
import { cn } from '@/lib/utils/cn';

// =============================================================================
// Constants
// =============================================================================

const SESSION_STATUS_COLORS: Record<ClinicSessionStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const VISIT_STATUS_COLORS: Record<ClinicVisitStatus, string> = {
  REGISTERED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WAITING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  CALLED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  IN_CONSULTATION: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  COMPLETED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  REFERRED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  NO_SHOW: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

const VISIT_STATUS_BADGE_VARIANT: Record<ClinicVisitStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  REGISTERED: 'secondary',
  WAITING: 'outline',
  CALLED: 'default',
  IN_CONSULTATION: 'default',
  COMPLETED: 'secondary',
  REFERRED: 'outline',
  NO_SHOW: 'destructive',
  CANCELLED: 'destructive',
  CLOSED: 'secondary',
};

function formatTime(dateString: string | null): string {
  if (!dateString) return '--';
  return format(parseISO(dateString), 'h:mm a');
}

function formatSessionDuration(openedAt: string | null, closedAt: string | null): string {
  if (!openedAt || !closedAt) return '--';
  const duration = (parseISO(closedAt).getTime() - parseISO(openedAt).getTime()) / (1000 * 60);
  const hours = Math.floor(duration / 60);
  const minutes = Math.round(duration % 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getPatientInitials(visit: ClinicVisit): string {
  const firstName = visit.patient?.first_name || '';
  const lastName = visit.patient?.last_name || '';
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '??';
}

function getPatientName(visit: ClinicVisit): string {
  if (visit.patient) return visit.patient.full_name;
  return visit.patient_name || 'Unknown';
}

// =============================================================================
// Page Component
// =============================================================================

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clinicId = Number(params.clinicId);
  const sessionId = Number(params.sessionId);
  const { refresh, isRefreshing } = usePageRefresh();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Fetch session detail
  const { data: clinic, isLoading: clinicLoading } = useClinic(clinicId);
  const { data: session, isLoading: sessionLoading } = useClinicSession(clinicId, sessionId);

  // Fetch visits for this session (server-paginated)
  const { data: visitsData, isLoading: visitsLoading } = useQuery({
    queryKey: ['clinic-visits', 'session', sessionId, page],
    queryFn: () => clinicsApi.listVisits({ session: sessionId, page, page_size: PAGE_SIZE }),
    enabled: !!sessionId,
    placeholderData: (prev) => prev,
  });

  // Fetch scheduled procedure orders for this session's clinic + date
  const { data: scheduledOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['clinic-session-orders', clinicId, sessionId],
    queryFn: () => clinicsApi.getSessionScheduledOrders(clinicId, sessionId),
    enabled: !!clinicId && !!sessionId,
  });

  const visits = useMemo(() => visitsData?.results ?? [], [visitsData]);
  const totalVisits = visitsData?.count ?? 0;
  const totalPages = Math.ceil(totalVisits / PAGE_SIZE);
  const hasNext = !!visitsData?.next;
  const hasPrev = page > 1;

  // Stats from total counts (use session-level stats if available, else current page)
  const stats = useMemo(() => {
    if (session) {
      return {
        total: (session.patients_registered || 0) + scheduledOrders.length,
        waiting: session.patients_waiting || 0,
        inConsultation: 0,
        completed: session.patients_seen || 0,
        scheduled: scheduledOrders.length,
      };
    }
    return { total: 0, waiting: 0, inConsultation: 0, completed: 0, scheduled: 0 };
  }, [session, scheduledOrders]);

  const isLoading = clinicLoading || sessionLoading;

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!clinic || !session) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12">
        <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
        <h3 className="text-base font-semibold mb-2">Session not found</h3>
        <Button asChild size="sm">
          <Link href={`/clinics/${clinicId}/sessions`}>Back to Sessions</Link>
        </Button>
      </div>
    );
  }

  const sessionDate = format(parseISO(session.session_date), 'EEEE, MMMM d, yyyy');

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing}>
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title={`Session — ${format(parseISO(session.session_date), 'MMM d, yyyy')}`}
          helpContent="View all patients scheduled or seen during this clinic session. Toggle between list and grid views."
        />

        {/* Navigation */}
        <ClinicNavigation clinicId={clinicId} />

        {/* Session Summary Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-4 rounded-lg bg-muted/50">
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {clinic.name}
              <span className="text-muted-foreground"> — {sessionDate}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {session.opened_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTime(session.opened_at)} - {formatTime(session.closed_at)}
                  {session.closed_at && (
                    <span className="text-muted-foreground">
                      ({formatSessionDuration(session.opened_at, session.closed_at)})
                    </span>
                  )}
                </span>
              )}
              {session.opened_by_name && (
                <span>Opened by: {session.opened_by_name}</span>
              )}
            </div>
          </div>
          <Badge className={cn('shrink-0 w-fit self-start sm:self-auto', SESSION_STATUS_COLORS[session.status])}>
            {session.status_display}
          </Badge>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Waiting</CardTitle>
              <Clock className="h-4 w-4 text-amber-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-amber-600">{stats.waiting}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Completed</CardTitle>
              <Stethoscope className="h-4 w-4 text-green-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Scheduled</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500 hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-blue-600">{stats.scheduled}</div>
            </CardContent>
          </Card>
        </div>

        {/* Scheduled Procedure Orders */}
        {(scheduledOrders.length > 0 || ordersLoading) && (
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <div className="flex items-center gap-2">
                <Clipboard className="h-4 w-4 text-blue-500" />
                <CardTitle className="text-base sm:text-lg">Scheduled Procedures</CardTitle>
                <Badge variant="secondary">{scheduledOrders.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              {ordersLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <ResponsiveTable<ProcedureOrderListItem>
                  data={scheduledOrders}
                  keyExtractor={(o) => o.id}
                  isLoading={ordersLoading}
                  emptyMessage="No scheduled procedures."
                  onRowClick={(o) => router.push(`/procedures/orders/${o.id}`)}
                  columns={[
                    {
                      key: 'order_number',
                      header: 'Order',
                      cell: (o) => (
                        <span className="font-mono text-xs">{o.order_number}</span>
                      ),
                    },
                    {
                      key: 'patient_name',
                      header: 'Patient',
                      cell: (o) => <span className="font-medium">{o.patient_name}</span>,
                    },
                    {
                      key: 'procedure_name',
                      header: 'Procedure',
                      cell: (o) => o.procedure_name,
                    },
                    {
                      key: 'scheduled_time',
                      header: 'Time',
                      cell: (o) => o.scheduled_time || '--',
                      hideOnMobile: true,
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      cell: (o) => (
                        <Badge className={cn('font-normal text-xs w-fit', PROCEDURE_STATUS_COLORS[o.status])}>
                          {PROCEDURE_STATUS_LABELS[o.status]}
                        </Badge>
                      ),
                    },
                    {
                      key: 'priority',
                      header: 'Priority',
                      cell: (o) => (
                        <Badge className={cn('font-normal text-xs w-fit', PROCEDURE_PRIORITY_COLORS[o.priority])}>
                          {o.priority}
                        </Badge>
                      ),
                      hideOnMobile: true,
                    },
                  ]}
                  mobileCard={(o) => (
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{o.patient_name}</span>
                        <Badge className={cn('font-normal shrink-0 text-xs', PROCEDURE_STATUS_COLORS[o.status])}>
                          {PROCEDURE_STATUS_LABELS[o.status]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{o.order_number}</span>
                        <span>{o.procedure_name}</span>
                        {o.scheduled_time && <span>{o.scheduled_time}</span>}
                      </div>
                    </div>
                  )}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* View Toggle + Patients Header */}
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg">Patients</CardTitle>
                <Badge variant="secondary">{totalVisits}</Badge>
              </div>
              <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {visitsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : visits.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No patients in this session yet.
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <EntityGrid>
                {visits.map((visit) => (
                  <EntityCard
                    key={visit.id}
                    title={getPatientName(visit)}
                    subtitle={visit.patient?.mrn || visit.patient_mrn || undefined}
                    initials={getPatientInitials(visit)}
                    gender={visit.patient?.gender as 'M' | 'F' | 'O' | undefined}
                    href={visit.encounter ? `/encounters/${visit.encounter}` : `/clinics/visits/${visit.id}`}
                    status={{
                      label: visit.status_display,
                      variant: VISIT_STATUS_BADGE_VARIANT[visit.status],
                    }}
                    badges={[
                      ...(visit.priority_display ? [{ label: visit.priority_display, variant: 'outline' as const }] : []),
                    ]}
                    metadata={[
                      { icon: <Calendar className="h-3 w-3" />, label: 'Queue', value: `#${visit.queue_number}` },
                      { icon: <Clock className="h-3 w-3" />, label: 'Registered', value: formatTime(visit.registered_at) },
                      ...(visit.wait_time_minutes ? [{ icon: <Clock className="h-3 w-3" />, label: 'Wait', value: `${visit.wait_time_minutes}m` }] : []),
                      ...(visit.assigned_clinician_name ? [{ icon: <Stethoscope className="h-3 w-3" />, label: 'Clinician', value: visit.assigned_clinician_name }] : []),
                    ]}
                  />
                ))}
              </EntityGrid>
            ) : (
              /* List View */
              <ResponsiveTable<ClinicVisit>
                data={visits}
                keyExtractor={(visit) => visit.id}
                isLoading={visitsLoading}
                emptyMessage="No patients in this session."
                onRowClick={(visit) => {
                  if (visit.encounter) {
                    router.push(`/encounters/${visit.encounter}`);
                  } else {
                    router.push(`/clinics/visits/${visit.id}`);
                  }
                }}
                defaultSortColumn="queue_number"
                defaultSortDirection="asc"
                columns={[
                  {
                    key: 'queue_number',
                    header: '#',
                    sortable: true,
                    sortType: 'number',
                    cell: (visit) => (
                      <span className="font-mono text-muted-foreground">{visit.queue_number}</span>
                    ),
                  },
                  {
                    key: 'patient_name',
                    header: 'Patient',
                    sortable: true,
                    sortFn: (a, b) => getPatientName(a).localeCompare(getPatientName(b)),
                    cell: (visit) => (
                      <div>
                        <span className="font-medium">{getPatientName(visit)}</span>
                        {visit.patient?.mrn && (
                          <span className="text-xs text-muted-foreground ml-2 font-mono">{visit.patient.mrn}</span>
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    sortable: true,
                    cell: (visit) => (
                      <Badge className={cn('font-normal text-xs w-fit', VISIT_STATUS_COLORS[visit.status])}>
                        {visit.status_display}
                      </Badge>
                    ),
                  },
                  {
                    key: 'priority',
                    header: 'Priority',
                    sortable: true,
                    cell: (visit) => visit.priority_display,
                    hideOnMobile: true,
                  },
                  {
                    key: 'registered_at',
                    header: 'Registered',
                    sortable: true,
                    sortType: 'date',
                    cell: (visit) => formatTime(visit.registered_at),
                    hideOnMobile: true,
                  },
                  {
                    key: 'wait_time_minutes',
                    header: 'Wait',
                    sortable: true,
                    sortType: 'number',
                    cell: (visit) => visit.wait_time_minutes ? `${visit.wait_time_minutes}m` : '--',
                    hideOnMobile: true,
                  },
                  {
                    key: 'assigned_clinician_name',
                    header: 'Clinician',
                    sortable: true,
                    cell: (visit) => visit.assigned_clinician_name || '--',
                    hideOnMobile: true,
                  },
                ]}
                mobileCard={(visit) => (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs text-muted-foreground">#{visit.queue_number}</span>
                        <span className="font-medium text-sm truncate">{getPatientName(visit)}</span>
                      </div>
                      <Badge className={cn('font-normal shrink-0 text-xs', VISIT_STATUS_COLORS[visit.status])}>
                        {visit.status_display}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {visit.patient?.mrn && <span className="font-mono">{visit.patient.mrn}</span>}
                      <span>{formatTime(visit.registered_at)}</span>
                      {visit.wait_time_minutes && <span>Wait: {visit.wait_time_minutes}m</span>}
                      {visit.assigned_clinician_name && <span>{visit.assigned_clinician_name}</span>}
                    </div>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={!hasPrev}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({totalVisits} visit{totalVisits !== 1 ? 's' : ''})
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}

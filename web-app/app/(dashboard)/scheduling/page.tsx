'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  UserCheck,
  UserX,
  Timer,
  MapPin,
  Wrench,
  Coffee,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { appointmentsApi, attendanceApi, resourcesApi } from '@/lib/api/scheduling';
import { formatDate } from '@/lib/utils/format';
import type { OnDutyStaffEntry, ResourceListItem } from '@/lib/types/scheduling';

const today = new Date().toISOString().split('T')[0];

export default function SchedulingDashboardPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  // Appointments
  const { data: todayData } = useQuery({
    queryKey: ['scheduling-appointments-today'],
    queryFn: () => appointmentsApi.list({ from_date: today, to_date: today, page_size: 200 }),
  });
  const { data: upcomingData } = useQuery({
    queryKey: ['scheduling-appointments-upcoming'],
    queryFn: () => appointmentsApi.list({ status: 'CONFIRMED', page_size: 5, ordering: 'scheduled_start' }),
  });

  // On-duty staff
  const { data: onDutyData } = useQuery({
    queryKey: ['scheduling-on-duty'],
    queryFn: () => attendanceApi.onDuty(),
    refetchInterval: 60_000, // refresh every minute
  });

  // Resources
  const { data: resourcesData } = useQuery({
    queryKey: ['scheduling-resources-all'],
    queryFn: () => resourcesApi.list({ page_size: 500, is_active: true }),
  });

  const todayAppts = todayData?.results || [];
  const upcomingAppts = upcomingData?.results || [];
  const allResources = resourcesData?.results || [];

  const apptStats = {
    total: todayAppts.length,
    confirmed: todayAppts.filter((a) => a.status === 'CONFIRMED').length,
    inProgress: todayAppts.filter((a) => a.status === 'IN_PROGRESS').length,
    completed: todayAppts.filter((a) => a.status === 'COMPLETED').length,
    cancelled: todayAppts.filter((a) => a.status === 'CANCELLED').length,
    noShow: todayAppts.filter((a) => a.status === 'NO_SHOW').length,
  };

  const onDutySummary = onDutyData?.summary;

  const resourceCounts = useMemo(() => {
    const staff = allResources.filter((r) => r.resource_type === 'PERSON');
    const places = allResources.filter((r) => r.resource_type === 'PLACE');
    const assets = allResources.filter((r) => r.resource_type === 'ASSET');
    return { staff: staff.length, places: places.length, assets: assets.length, total: allResources.length };
  }, [allResources]);

  // Rooms currently occupied (clocked_in staff have a room_name)
  const occupiedRooms = useMemo(() => {
    if (!onDutyData) return new Set<string>();
    const rooms = new Set<string>();
    for (const entry of [...onDutyData.clocked_in, ...(onDutyData.late || [])]) {
      if (entry.room_name) rooms.add(entry.room_name);
    }
    return rooms;
  }, [onDutyData]);

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Scheduling"
          helpContent="View today's appointments, staff on duty, and resource overview. Manage schedules, and create new appointments."
          actions={
            <Button size="sm" onClick={() => router.push('/scheduling/appointments/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Appointment</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        <Tabs defaultValue="appointments">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="appointments" className="gap-1.5">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Appointments</span>
              <span className="sm:hidden">Appts</span>
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-1.5">
              <Users className="h-4 w-4" />
              <span>Staff</span>
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-1.5">
              <MapPin className="h-4 w-4" />
              <span>Resources</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Appointments Tab ── */}
          <TabsContent value="appointments" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={CalendarDays} label="Today" value={apptStats.total} color="blue" />
              <StatCard icon={Clock} label="Confirmed" value={apptStats.confirmed} color="cyan" />
              <StatCard icon={Users} label="In Progress" value={apptStats.inProgress} color="amber" />
              <StatCard icon={CheckCircle} label="Completed" value={apptStats.completed} color="green" />
              <StatCard icon={XCircle} label="Cancelled" value={apptStats.cancelled} color="red" />
              <StatCard icon={AlertTriangle} label="No-Show" value={apptStats.noShow} color="orange" />
            </div>

            {/* Quick Nav */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <NavCard
                icon={CalendarDays}
                title="All Appointments"
                description="Search, filter, and manage appointments"
                onClick={() => router.push('/scheduling/appointments')}
              />
              <NavCard
                icon={Clock}
                title="Schedules"
                description="Manage resource availability and time slots"
                onClick={() => router.push('/scheduling/schedules')}
              />
              <NavCard
                icon={Users}
                title="Resources"
                description="Manage schedulable rooms, staff, and equipment"
                onClick={() => router.push('/scheduling/resources')}
              />
            </div>

            {/* Upcoming Appointments */}
            {upcomingAppts.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">Upcoming Confirmed</h3>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/scheduling/appointments?status=CONFIRMED')}>
                      View All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {upcomingAppts.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/scheduling/appointments/${apt.id}`)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{apt.patient_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {apt.resource_name} &bull; {formatDate(apt.scheduled_start, 'MMM d, h:mm a')}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 ml-2">
                          {apt.appointment_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Staff Tab ── */}
          <TabsContent value="staff" className="space-y-4 mt-4">
            {onDutySummary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard icon={Users} label="Total Today" value={onDutySummary.total} color="blue" />
                <StatCard icon={UserCheck} label="Clocked In" value={onDutySummary.clocked_in} color="green" />
                <StatCard icon={Timer} label="Late" value={onDutySummary.late} color="amber" />
                <StatCard icon={UserX} label="Absent" value={onDutySummary.absent} color="red" />
                <StatCard icon={Clock} label="Upcoming" value={onDutySummary.upcoming} color="cyan" />
                <StatCard icon={CheckCircle} label="Completed" value={onDutySummary.completed} color="green" />
              </div>
            )}

            {/* Clocked-in staff list */}
            <StaffSection
              title="Clocked In"
              entries={onDutyData?.clocked_in || []}
              badgeColor="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
              emptyMessage="No staff currently clocked in."
              onRowClick={(entry) => router.push(`/scheduling/resources/${entry.staff_resource_id}`)}
            />

            {/* Late staff */}
            {(onDutyData?.late?.length ?? 0) > 0 && (
              <StaffSection
                title="Late"
                entries={onDutyData?.late || []}
                badgeColor="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                showOverdue
                onRowClick={(entry) => router.push(`/scheduling/resources/${entry.staff_resource_id}`)}
              />
            )}

            {/* Absent staff */}
            {(onDutyData?.absent?.length ?? 0) > 0 && (
              <StaffSection
                title="Absent"
                entries={onDutyData?.absent || []}
                badgeColor="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                onRowClick={(entry) => router.push(`/scheduling/resources/${entry.staff_resource_id}`)}
              />
            )}

            {/* Upcoming shifts */}
            <StaffSection
              title="Upcoming"
              entries={onDutyData?.upcoming || []}
              badgeColor="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300"
              showStartsIn
              emptyMessage="No upcoming shifts."
              onRowClick={(entry) => router.push(`/scheduling/resources/${entry.staff_resource_id}`)}
            />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => router.push('/scheduling/shifts')}>
                View Duty Roster
              </Button>
            </div>
          </TabsContent>

          {/* ── Resources Tab ── */}
          <TabsContent value="resources" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={Users} label="Staff" value={resourceCounts.staff} color="blue" />
              <StatCard icon={MapPin} label="Rooms / Places" value={resourceCounts.places} color="cyan" />
              <StatCard icon={Wrench} label="Equipment" value={resourceCounts.assets} color="amber" />
              <StatCard icon={CheckCircle} label="Total Active" value={resourceCounts.total} color="green" />
            </div>

            {/* Rooms overview */}
            <RoomOverviewCard
              resources={allResources.filter((r) => r.resource_type === 'PLACE')}
              occupiedRooms={occupiedRooms}
              onRowClick={(r) => router.push(`/scheduling/resources/${r.id}`)}
            />

            {/* Equipment overview */}
            <ResourceListCard
              title="Equipment (Assets)"
              icon={Wrench}
              resources={allResources.filter((r) => r.resource_type === 'ASSET')}
              onRowClick={(r) => router.push(`/scheduling/resources/${r.id}`)}
            />

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => router.push('/scheduling/resources')}>
                Manage All Resources
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PullToRefresh>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    orange: 'text-orange-600 dark:text-orange-400',
  };
  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.06),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.05),transparent_50%)]"
        aria-hidden="true"
      />
      <CardContent className="relative p-3">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${colorMap[color] || ''}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function NavCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={onClick}>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className="h-8 w-8 text-primary" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StaffSection({
  title,
  entries,
  badgeColor,
  emptyMessage,
  showOverdue,
  showStartsIn,
  onRowClick,
}: {
  title: string;
  entries: OnDutyStaffEntry[];
  badgeColor: string;
  emptyMessage?: string;
  showOverdue?: boolean;
  showStartsIn?: boolean;
  onRowClick: (entry: OnDutyStaffEntry) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Badge className={`text-xs ${badgeColor}`}>{entries.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">{emptyMessage || 'None.'}</p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <div
                key={entry.shift_id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                onClick={() => onRowClick(entry)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{entry.staff_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.shift_type?.replace(/_/g, ' ')}
                    {entry.department && ` · ${entry.department}`}
                    {entry.room_name && ` · ${entry.room_name}`}
                    {entry.clinic_name && ` · ${entry.clinic_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {entry.on_break && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Coffee className="h-3 w-3" />
                      Break
                    </Badge>
                  )}
                  {showOverdue && entry.minutes_overdue && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs">
                      {entry.minutes_overdue}min late
                    </Badge>
                  )}
                  {showStartsIn && entry.starts_in_minutes != null && (
                    <Badge variant="outline" className="text-xs">
                      in {entry.starts_in_minutes}min
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoomOverviewCard({
  resources,
  occupiedRooms,
  onRowClick,
}: {
  resources: ResourceListItem[];
  occupiedRooms: Set<string>;
  onRowClick: (r: ResourceListItem) => void;
}) {
  const occupied = resources.filter((r) => occupiedRooms.has(r.name));
  const available = resources.filter((r) => !occupiedRooms.has(r.name));
  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Rooms &amp; Places
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">
              {available.length} available
            </Badge>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300 text-xs">
              {occupied.length} occupied
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {resources.length === 0 ? (
          <p className="text-xs text-muted-foreground">No rooms or places configured.</p>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => {
              const isOccupied = occupiedRooms.has(r.name);
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                  onClick={() => onRowClick(r)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.department_name && (
                      <p className="text-xs text-muted-foreground">{r.department_name}</p>
                    )}
                  </div>
                  <Badge
                    className={`text-xs shrink-0 ml-2 ${
                      isOccupied
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    }`}
                  >
                    {isOccupied ? 'Occupied' : 'Available'}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResourceListCard({
  title,
  icon: Icon,
  resources,
  onRowClick,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  resources: ResourceListItem[];
  onRowClick: (r: ResourceListItem) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
          <Badge variant="outline" className="text-xs ml-auto">{resources.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {resources.length === 0 ? (
          <p className="text-xs text-muted-foreground">No equipment resources configured.</p>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                onClick={() => onRowClick(r)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.code}</p>
                </div>
                {r.department_name && (
                  <Badge variant="outline" className="text-xs shrink-0 ml-2">{r.department_name}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

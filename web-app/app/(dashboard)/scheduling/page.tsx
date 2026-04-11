'use client';

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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { useFacility } from '@/lib/context/facility-context';
import { useSchedulingSocket } from '@/lib/hooks/use-websocket';
import { appointmentsApi } from '@/lib/api/scheduling';
import { formatDate } from '@/lib/utils/format';

const today = new Date().toISOString().split('T')[0];

export default function SchedulingDashboardPage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const { facility } = useFacility();
  useSchedulingSocket(facility?.id ?? null);

  const { data: todayData } = useQuery({
    queryKey: ['scheduling-appointments-today'],
    queryFn: () => appointmentsApi.list({ from_date: today, to_date: today, page_size: 200 }),
  });

  const { data: upcomingData } = useQuery({
    queryKey: ['scheduling-appointments-upcoming'],
    queryFn: () => appointmentsApi.list({ status: 'CONFIRMED', page_size: 5, ordering: 'scheduled_start' }),
  });

  const todayAppts = todayData?.results || [];
  const upcomingAppts = upcomingData?.results || [];

  const stats = {
    total: todayAppts.length,
    confirmed: todayAppts.filter((a) => a.status === 'CONFIRMED').length,
    inProgress: todayAppts.filter((a) => a.status === 'IN_PROGRESS').length,
    completed: todayAppts.filter((a) => a.status === 'COMPLETED').length,
    cancelled: todayAppts.filter((a) => a.status === 'CANCELLED').length,
    noShow: todayAppts.filter((a) => a.status === 'NO_SHOW').length,
  };

  return (
    <PullToRefresh onRefresh={refresh} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Scheduling"
          helpContent="View today's appointments overview, manage schedules, and create new appointments."
          actions={
            <Button size="sm" onClick={() => router.push('/scheduling/appointments/new')}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">New Appointment</span>
              <span className="sm:hidden">New</span>
            </Button>
          }
        />

        {/* Today's Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={CalendarDays} label="Today" value={stats.total} color="blue" />
          <StatCard icon={Clock} label="Confirmed" value={stats.confirmed} color="cyan" />
          <StatCard icon={Users} label="In Progress" value={stats.inProgress} color="amber" />
          <StatCard icon={CheckCircle} label="Completed" value={stats.completed} color="green" />
          <StatCard icon={XCircle} label="Cancelled" value={stats.cancelled} color="red" />
          <StatCard icon={AlertTriangle} label="No-Show" value={stats.noShow} color="orange" />
        </div>

        {/* Quick Nav */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => router.push('/scheduling/appointments')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <CalendarDays className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">All Appointments</p>
                <p className="text-xs text-muted-foreground">Search, filter, and manage appointments</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => router.push('/scheduling/schedules')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Schedules</p>
                <p className="text-xs text-muted-foreground">Manage resource availability and time slots</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => router.push('/scheduling/resources')}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Resources</p>
                <p className="text-xs text-muted-foreground">Manage schedulable rooms, staff, and equipment</p>
              </div>
            </CardContent>
          </Card>
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
      </div>
    </PullToRefresh>
  );
}

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

'use client';

import { useMemo } from 'react';
import { Activity, Clock3, DoorOpen, UsersRound } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useRoomUtilization, useRoomUtilizationSummary } from '@/lib/hooks/use-analytics';
import type { RoomUtilizationRow } from '@/lib/types/analytics';

interface RoomUtilizationPanelProps {
  date: string;
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 min';
  }
  if (value >= 60) {
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.round(value)} min`;
}

function getRoomStatus(utilizationRate: number) {
  if (utilizationRate >= 85) return { label: 'Overloaded', tone: 'text-destructive' };
  if (utilizationRate >= 60) return { label: 'Busy', tone: 'text-warning' };
  if (utilizationRate > 0) return { label: 'Balanced', tone: 'text-success' };
  return { label: 'Idle', tone: 'text-muted-foreground' };
}

export function RoomUtilizationPanel({ date }: RoomUtilizationPanelProps) {
  const { data: summary, isLoading: summaryLoading } = useRoomUtilizationSummary({ date });
  const { data: rooms = [], isLoading: roomsLoading } = useRoomUtilization({ date });

  const topRooms = useMemo(
    () => [...rooms].sort((a, b) => b.utilization_rate - a.utilization_rate).slice(0, 5),
    [rooms]
  );

  return (
    <section className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-lg font-semibold sm:text-xl">Room Utilization</h2>
        <p className="text-sm text-muted-foreground">
          Staffed room time, consultation throughput, and wait-to-room delay for {date}.
        </p>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Average Utilization"
          value={summaryLoading ? '—' : `${summary?.avg_utilization_rate ?? 0}%`}
          description="Consultation time against staffed room time"
          icon={Activity}
          variant={(summary?.avg_utilization_rate ?? 0) >= 85 ? 'destructive' : 'info'}
          loading={summaryLoading}
          showTrendIndicator={false}
        />
        <StatsCard
          title="Active Rooms"
          value={summaryLoading ? '—' : summary?.active_rooms ?? 0}
          meta={summaryLoading ? undefined : `${summary?.staffed_rooms ?? 0} staffed today`}
          description="Rooms with an active clinician right now"
          icon={DoorOpen}
          variant="success"
          loading={summaryLoading}
          showTrendIndicator={false}
        />
        <StatsCard
          title="Average Wait To Room"
          value={summaryLoading ? '—' : formatMinutes(summary?.avg_wait_to_room_minutes ?? 0)}
          description="Registration to consultation start"
          icon={Clock3}
          variant="warning"
          loading={summaryLoading}
          showTrendIndicator={false}
        />
        <StatsCard
          title="Completed Visits"
          value={summaryLoading ? '—' : summary?.total_visits_completed ?? 0}
          meta={summaryLoading ? undefined : `${summary?.idle_rooms ?? 0} idle rooms`}
          description="Visits completed across tracked rooms"
          icon={UsersRound}
          variant="default"
          loading={summaryLoading}
          showTrendIndicator={false}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Per-room operations</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveTable<RoomUtilizationRow>
              data={rooms}
              keyExtractor={(room) => `${room.room_id}-${room.stat_date}`}
              isLoading={roomsLoading}
              emptyMessage="No room utilization records yet for this date."
              columns={[
                {
                  key: 'room_name',
                  header: 'Room',
                  sortable: true,
                  cell: (room) => (
                    <div className="min-w-0">
                      <div className="truncate font-medium">{room.room_name ?? `Room ${room.room_id}`}</div>
                      <div className="truncate text-xs text-muted-foreground">{room.clinic_name ?? 'Unassigned clinic'}</div>
                    </div>
                  ),
                },
                {
                  key: 'utilization_rate',
                  header: 'Utilization',
                  sortable: true,
                  sortType: 'number',
                  cell: (room) => {
                    const status = getRoomStatus(room.utilization_rate);
                    return (
                      <div className="min-w-[9rem] space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className={status.tone}>{status.label}</span>
                          <span className="font-medium">{room.utilization_rate}%</span>
                        </div>
                        <Progress value={room.utilization_rate} className="h-2" />
                      </div>
                    );
                  },
                },
                {
                  key: 'visits_completed',
                  header: 'Visits',
                  sortable: true,
                  sortType: 'number',
                },
                {
                  key: 'avg_wait_to_room_minutes',
                  header: 'Avg Wait',
                  sortable: true,
                  sortType: 'number',
                  cell: (room) => formatMinutes(room.avg_wait_to_room_minutes),
                },
                {
                  key: 'avg_consultation_minutes',
                  header: 'Avg Consult',
                  sortable: true,
                  sortType: 'number',
                  cell: (room) => formatMinutes(room.avg_consultation_minutes),
                  hideOnMobile: true,
                },
                {
                  key: 'active_clinicians_count',
                  header: 'Active Clinicians',
                  sortable: true,
                  sortType: 'number',
                  hideOnMobile: true,
                },
              ]}
              mobileCard={(room) => {
                const status = getRoomStatus(room.utilization_rate);
                return (
                  <Card className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{room.room_name ?? `Room ${room.room_id}`}</div>
                          <div className="truncate text-xs text-muted-foreground">{room.clinic_name ?? 'Unassigned clinic'}</div>
                        </div>
                        <span className={`text-xs font-medium ${status.tone}`}>{status.label}</span>
                      </div>
                      <Progress value={room.utilization_rate} className="h-2" />
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">Utilization</div>
                          <div className="font-medium">{room.utilization_rate}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Visits</div>
                          <div className="font-medium">{room.visits_completed}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Avg Wait</div>
                          <div className="font-medium">{formatMinutes(room.avg_wait_to_room_minutes)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">Clinicians</div>
                          <div className="font-medium">{room.active_clinicians_count}</div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Top Rooms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {roomsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : topRooms.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Top rooms will appear once shifts and clinic visits start generating room activity.
              </p>
            ) : (
              topRooms.map((room) => (
                <div key={`${room.room_id}-${room.stat_date}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{room.room_name ?? `Room ${room.room_id}`}</div>
                      <div className="truncate text-xs text-muted-foreground">{room.clinic_name ?? 'Unassigned clinic'}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{room.utilization_rate}%</div>
                      <div className="text-xs text-muted-foreground">{room.visits_completed} visits</div>
                    </div>
                  </div>
                  <Progress value={room.utilization_rate} className="h-2.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

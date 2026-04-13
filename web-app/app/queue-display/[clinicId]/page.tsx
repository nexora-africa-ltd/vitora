'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Clock, DoorOpen, Monitor, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { API_BASE_URL } from '@/lib/utils/constants';
import type { PublicQueueResponse } from '@/lib/types/clinic';

const DEFAULT_STATUS: { label: string; border: string; bg: string; text: string; pulse?: boolean } = {
  label: 'Waiting',
  border: 'border-slate-600',
  bg: 'bg-slate-800',
  text: 'text-slate-300',
};

const STATUS_CONFIG: Record<string, { label: string; border: string; bg: string; text: string; pulse?: boolean }> = {
  WAITING: DEFAULT_STATUS,
  CALLED: {
    label: 'Called',
    border: 'border-blue-500',
    bg: 'bg-blue-950/60',
    text: 'text-blue-300',
    pulse: true,
  },
  IN_CONSULTATION: {
    label: 'In Consultation',
    border: 'border-emerald-500',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
  },
};

function LiveClock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return <span className="tabular-nums">--:--:--</span>;

  return (
    <span className="tabular-nums">
      {time.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })}
    </span>
  );
}

async function fetchPublicQueue(clinicId: number): Promise<PublicQueueResponse> {
  const res = await fetch(`${API_BASE_URL}/api/clinics/${clinicId}/public-queue/`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch queue');
  return res.json();
}

export default function QueueDisplayPage() {
  const params = useParams();
  const clinicId = Number(params.clinicId);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isError } = useQuery({
    queryKey: ['public-queue', clinicId],
    queryFn: () => fetchPublicQueue(clinicId),
    refetchInterval: 10_000,
    enabled: !!clinicId,
  });

  // Track last refresh
  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Monitor className="h-16 w-16 text-slate-500 mx-auto mb-4" />
          <p className="text-xl text-slate-400">Unable to load queue</p>
          <p className="text-sm text-slate-600 mt-2">Check the clinic ID and try again</p>
        </div>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const calledItems = queue.filter((q) => q.status === 'CALLED');
  const otherItems = queue.filter((q) => q.status !== 'CALLED');

  return (
    <div className="flex flex-col min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6 lg:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
            {data?.clinic_name ?? 'Loading...'}
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            {data?.session_date
              ? new Date(data.session_date + 'T00:00:00').toLocaleDateString('en-KE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <div className="flex items-center gap-2 text-lg sm:text-xl lg:text-2xl font-mono">
            <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Session not open */}
      {data && data.session_status !== 'OPEN' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Monitor className="h-20 w-20 text-slate-600 mx-auto mb-4" />
            <p className="text-2xl text-slate-400">
              {data.session_status === null ? 'No session today' : 'Session closed'}
            </p>
          </div>
        </div>
      )}

      {/* Queue display */}
      {data?.session_status === 'OPEN' && (
        <div className="flex-1">
          {queue.length === 0 ? (
            <div className="flex items-center justify-center flex-1 min-h-[300px]">
              <div className="text-center">
                <p className="text-2xl text-slate-500">No patients in queue</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 lg:space-y-8">
              {/* Called patients — prominent */}
              {calledItems.length > 0 && (
                <section>
                  <h2 className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-3">
                    Now Calling
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {calledItems.map((item) => (
                      <QueueCard key={item.queue_number} item={item} />
                    ))}
                  </div>
                </section>
              )}

              {/* Other patients */}
              {otherItems.length > 0 && (
                <section>
                  <h2 className="text-sm uppercase tracking-wider text-slate-500 font-semibold mb-3">
                    {calledItems.length > 0 ? 'Queue' : 'Current Queue'}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {otherItems.map((item) => (
                      <QueueCard key={item.queue_number} item={item} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>
            Updated {Math.round((Date.now() - lastRefresh.getTime()) / 1000)}s ago
          </span>
        </div>
        <span>Vitora HMIS</span>
      </footer>
    </div>
  );
}

function QueueCard({ item }: { item: { queue_number: number; status: string; room_name: string | null; called_at: string | null } }) {
  const config = STATUS_CONFIG[item.status] ?? DEFAULT_STATUS;

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4 lg:p-5 transition-all',
        config.border,
        config.bg,
        config.pulse && 'animate-pulse',
      )}
    >
      {/* Queue number */}
      <div className="text-center">
        <span className="text-4xl sm:text-5xl lg:text-6xl font-black tabular-nums">
          #{item.queue_number}
        </span>
      </div>

      {/* Status */}
      <div className={cn('text-center mt-2 text-sm sm:text-base font-semibold uppercase tracking-wide', config.text)}>
        {config.label}
      </div>

      {/* Room */}
      {item.room_name && (
        <div className="flex items-center justify-center gap-1.5 mt-2 text-sm sm:text-base">
          <DoorOpen className="h-4 w-4 text-blue-400" />
          <span className="font-semibold text-blue-300">{item.room_name}</span>
        </div>
      )}
    </div>
  );
}

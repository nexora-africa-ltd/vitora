'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Clock, DoorOpen, Monitor, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { API_BASE_URL } from '@/lib/utils/constants';

// --- Types ---

interface PublicTriageQueueItem {
  position: number;
  status: string;
  room_name: string | null;
  check_in_time: string;
  priority_hint: string | null;
}

interface PublicTriageQueueResponse {
  facility_name: string;
  date: string;
  updated_at: string;
  total_waiting: number;
  queue: PublicTriageQueueItem[];
}

// --- Status config ---

const DEFAULT_STATUS: { label: string; border: string; bg: string; text: string; pulse?: boolean } = {
  label: 'Waiting',
  border: 'border-slate-600',
  bg: 'bg-slate-800',
  text: 'text-slate-300',
};

const STATUS_CONFIG: Record<string, { label: string; border: string; bg: string; text: string; pulse?: boolean }> = {
  WAITING_TRIAGE: DEFAULT_STATUS,
  IN_TRIAGE: {
    label: 'Being Triaged',
    border: 'border-emerald-500',
    bg: 'bg-emerald-950/40',
    text: 'text-emerald-300',
    pulse: true,
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white',
  URGENT: 'bg-orange-500 text-white',
};

// --- Components ---

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

async function fetchTriageQueue(facilityId: number): Promise<PublicTriageQueueResponse> {
  const res = await fetch(`${API_BASE_URL}/api/triage/public-queue/?facility_id=${facilityId}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch triage queue');
  return res.json();
}

// --- Page ---

export default function TriageQueueDisplayPage() {
  const params = useParams();
  const facilityId = Number(params.facilityId);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { data, isError } = useQuery({
    queryKey: ['public-triage-queue', facilityId],
    queryFn: () => fetchTriageQueue(facilityId),
    refetchInterval: 10_000,
    enabled: !!facilityId,
  });

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Monitor className="mx-auto mb-4 h-16 w-16 text-slate-500" />
          <p className="text-xl text-slate-400">Unable to load triage queue</p>
          <p className="mt-2 text-sm text-slate-600">Check the facility ID and try again</p>
        </div>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const inTriageItems = queue.filter((q) => q.status === 'IN_TRIAGE');
  const waitingItems = queue.filter((q) => q.status === 'WAITING_TRIAGE');

  return (
    <div className="flex min-h-screen flex-col p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            {data?.facility_name ?? 'Loading...'}
          </h1>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">
            Triage Queue
            {data?.date && (
              <>
                {' — '}
                {new Date(data.date + 'T00:00:00').toLocaleDateString('en-KE', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          {data && (
            <div className="rounded-lg bg-slate-800/60 px-3 py-1.5 text-sm tabular-nums">
              <span className="text-slate-500">Waiting:</span>{' '}
              <span className="font-semibold text-white">{data.total_waiting}</span>
            </div>
          )}
          <div className="flex items-center gap-2 font-mono text-lg sm:text-xl lg:text-2xl">
            <Clock className="h-5 w-5 lg:h-6 lg:w-6" />
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Queue display */}
      <div className="flex-1">
        {queue.length === 0 ? (
          <div className="flex min-h-[300px] flex-1 items-center justify-center">
            <div className="text-center">
              <Monitor className="mx-auto mb-4 h-20 w-20 text-slate-600" />
              <p className="text-2xl text-slate-500">No patients waiting for triage</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 lg:space-y-8">
            {/* In Triage — prominent */}
            {inTriageItems.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Now Being Triaged
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {inTriageItems.map((item) => (
                    <QueueCard key={item.position} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Waiting patients */}
            {waitingItems.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  {inTriageItems.length > 0 ? 'Waiting' : 'Waiting for Triage'}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {waitingItems.map((item) => (
                    <QueueCard key={item.position} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-sm text-slate-600">
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

function QueueCard({ item }: { item: PublicTriageQueueItem }) {
  const config = STATUS_CONFIG[item.status] ?? DEFAULT_STATUS;
  const priorityClass = item.priority_hint ? PRIORITY_COLORS[item.priority_hint] : null;

  const checkInDate = new Date(item.check_in_time);
  const waitMinutes = Math.round((Date.now() - checkInDate.getTime()) / 60_000);

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4 transition-all lg:p-5',
        config.border,
        config.bg,
        config.pulse && 'animate-pulse',
      )}
    >
      {/* Position number */}
      <div className="text-center">
        <span className="text-4xl font-black tabular-nums sm:text-5xl lg:text-6xl">
          #{item.position}
        </span>
      </div>

      {/* Status */}
      <div className={cn('mt-2 text-center text-sm font-semibold uppercase tracking-wide sm:text-base', config.text)}>
        {config.label}
      </div>

      {/* Priority hint */}
      {priorityClass && (
        <div className="mt-2 flex items-center justify-center">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase', priorityClass)}>
            <AlertTriangle className="h-3 w-3" />
            {item.priority_hint}
          </span>
        </div>
      )}

      {/* Room */}
      {item.room_name && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-sm sm:text-base">
          <DoorOpen className="h-4 w-4 text-blue-400" />
          <span className="font-semibold text-blue-300">{item.room_name}</span>
        </div>
      )}

      {/* Wait time */}
      <div className="mt-1 text-center text-xs text-slate-500">
        {waitMinutes < 1 ? 'Just arrived' : `${waitMinutes} min wait`}
      </div>
    </div>
  );
}

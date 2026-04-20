'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PullToRefresh } from '@/components/shared/pull-to-refresh';
import { usePageRefresh } from '@/lib/context/page-refresh-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { theatreApi } from '@/lib/api/theatre';
import type { SurgeryCaseList } from '@/lib/types/theatre';
import {
  TheatreCasePriorityBadge,
  TheatreCaseStatusBadge,
} from '@/components/theatre/theatre-display';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

function displayDate(d: Date): string {
  return d.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function TheatreSchedulePage() {
  const router = useRouter();
  const { refresh, isRefreshing } = usePageRefresh();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [cases, setCases] = useState<SurgeryCaseList[]>([]);
  const [loading, setLoading] = useState(true);

  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);

  const fetchCases = useCallback(async () => {
    try {
      setLoading(true);
      const data = await theatreApi.getDailyList(dateStr);
      setCases(data);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const goDay = (offset: number) => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d;
    });
  };

  const goToday = () => setCurrentDate(new Date());

  const isToday = formatDate(currentDate) === formatDate(new Date());

  return (
    <PullToRefresh onRefresh={() => { refresh(); return fetchCases(); }} isRefreshing={isRefreshing} className="min-h-full">
      <div className="space-y-6">
        <PageHeader
          title="Theatre Schedule"
          helpContent="View the daily theatre list. Navigate between dates to see scheduled, in-progress, and completed surgeries."
          actions={
            <Button asChild>
              <Link href="/theatre/cases/new">
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Book Surgery</span>
              </Link>
            </Button>
          }
        />

        {/* Date Nav */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="icon" onClick={() => goDay(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center flex-1 min-w-0">
            <p className="font-semibold truncate">{displayDate(currentDate)}</p>
            <p className="text-xs text-muted-foreground">{cases.length} case{cases.length !== 1 ? 's' : ''}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => goDay(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {!isToday && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={goToday}>Back to Today</Button>
          </div>
        )}

        {/* Cases */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : cases.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Clock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No cases scheduled for this date.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {cases.map(c => (
              <Card
                key={c.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(`/theatre/cases/${c.case_number}`)}
              >
                <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-center shrink-0 w-16">
                      <p className="font-mono text-lg font-bold">{c.scheduled_start_time?.slice(0, 5) || '--:--'}</p>
                      {c.estimated_duration_minutes && (
                        <p className="text-xs text-muted-foreground">{c.estimated_duration_minutes}min</p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.primary_procedure_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {c.patient_name} &middot; {c.patient_mrn}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.theatre_name} &middot; {c.case_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TheatreCasePriorityBadge priority={c.priority} hideElective />
                    <TheatreCaseStatusBadge status={c.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
